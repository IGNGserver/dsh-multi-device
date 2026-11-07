/**
 * Git Remote Auto-Discovery and Logical Workspace Aggregation Engine.
 *
 * Responsibilities:
 * 1. Read-only discovery of Git remote URLs (`remote.origin.url` only) for local
 *    and remote workspace directories, supporting both standard `.git/config` and Git worktree
 *    `.git` pointer files (`gitdir: ...`).
 * 2. Pure metadata & session-list aggregation (`WorkspaceAggregator`):
 *    - Merges workspaces across devices that share the same normalized Git remote URL (`github.com/org/repo`)
 *      when `autoGitAggregate` is enabled.
 *    - Applies user-configured manual merge rules (`manualRules`), manual exclusions (`excludedMemberKeys`),
 *      custom titles, and preferred target devices for "+ New Session".
 *    - Strictly aggregates workspace views and session lists ONLY — never touches or syncs project files.
 *
 * @module dsh-multi-device/host/git-aggregator
 */
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import {
  type DeviceConnectionState,
  type DeviceId,
  encodeLogicalWorkspaceId,
  encodeRemoteSessionId,
  encodeRemoteWorkspaceId,
  LOCAL_DEVICE_ID,
  type LogicalWorkspaceView,
  type ManualWorkspaceRule,
  normalizeGitRemote,
  normalizeWorkspacePath,
  type SshTransportConfig,
  type WorkspaceAggregationConfig,
  type WorkspaceMemberRef,
  workspaceMemberKey,
} from '../contract.ts'
import { execSshCommand } from './tunnel.ts'
import { assertGitPathNamespace, encodeGitScript, gitPlatformProbe, quotePosix, quotePowerShell, type GitRemotePlatform } from './git-platform.ts'

export interface PhysicalWorkspaceInput {
  readonly deviceId: DeviceId
  readonly deviceName: string
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly sessionIds: readonly string[]
  readonly runningSessionCount: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly rawGitRemote?: string
}

/**
 * Parse a `.git/config` INI body and extract the `remote "origin"` URL.
 *
 * `originOnly` keeps a repository identity tied to `origin`. Falling back to
 * the first remote would resolve `nas` backup remotes and split one repository
 * across devices, so scanning and matching always use `originOnly`.
 */
export function parseGitConfigRemoteUrl(
  configText: string,
  options: { readonly originOnly?: boolean } = {},
): string | undefined {
  let currentRemote: string | undefined
  let originUrl: string | undefined

  for (const rawLine of configText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line)
    if (sectionMatch?.[1] !== undefined) {
      const header = sectionMatch[1].trim()
      const remoteMatch = /^remote\s+"([^"]+)"$/i.exec(header)
      currentRemote = remoteMatch?.[1]
      continue
    }
    if (currentRemote !== undefined) {
      const kv = /^url\s*=\s*(.+)$/i.exec(line)
      if (kv?.[1] !== undefined) {
        const url = kv[1].trim().replace(/^["']|["']$/g, '')
        if (url !== '') {
          if (currentRemote === 'origin' && originUrl === undefined) {
            originUrl = url
          }
        }
      }
    }
  }

  return originUrl
}

/** Read origin through Git first (worktrees, includes and includeIf included).
 * The bounded config-file fallback supports unavailable Git / legacy metadata,
 * but never substitutes another remote for origin.
 */
export function discoverLocalGitRemote(
  directoryPath: string,
  options: { readonly originOnly?: boolean; readonly strict?: boolean } = {},
): string | undefined {
  if (!directoryPath || !isAbsolute(directoryPath)) return undefined
  try {
    execFileSync('git', ['-C', directoryPath, 'rev-parse', '--git-dir'], {
      timeout: 3_000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    const raw = execFileSync('git', ['-C', directoryPath, 'config', '--includes', '--get', 'remote.origin.url'], {
      encoding: 'utf8', timeout: 3_000, maxBuffer: 256 * 1024, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    }).trim()
    return raw || undefined
  } catch (error) {
    // Exit 1 means a valid config with no origin: do not undo include semantics
    // by re-parsing a stale value in a different config file.
    if ((error as { status?: number }).status === 1) return undefined
    if (options.strict === true) throw new Error(`Unable to read Git origin at ${directoryPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
  let current = directoryPath
  for (let depth = 0; depth < 6; depth++) {
    const dotGit = join(current, '.git')
    try {
      if (existsSync(dotGit)) {
        const st = statSync(dotGit)
        if (st.isDirectory()) {
          const configFile = join(dotGit, 'config')
          if (existsSync(configFile)) {
            return parseGitConfigRemoteUrl(readFileSync(configFile, 'utf8'), options)
          }
        } else if (st.isFile()) {
          // Worktree or submodule pointer: `gitdir: /path/to/.git/worktrees/slug`
          const pointer = readFileSync(dotGit, 'utf8').trim()
          const match = /^gitdir:\s*(.+)$/i.exec(pointer)
          if (match?.[1] !== undefined) {
            const gitDir = isAbsolute(match[1]) ? match[1] : resolve(current, match[1])
            // Check commondir or parent .git/config
            const commonDirFile = join(gitDir, 'commondir')
            if (existsSync(commonDirFile)) {
              const commonRel = readFileSync(commonDirFile, 'utf8').trim()
              const commonDir = isAbsolute(commonRel) ? commonRel : resolve(gitDir, commonRel)
              const commonConfig = join(commonDir, 'config')
              if (existsSync(commonConfig)) {
                return parseGitConfigRemoteUrl(readFileSync(commonConfig, 'utf8'), options)
              }
            }
            const directConfig = join(gitDir, 'config')
            if (existsSync(directConfig)) {
              return parseGitConfigRemoteUrl(readFileSync(directConfig, 'utf8'), options)
            }
            const parentConfig = resolve(gitDir, '..', '..', 'config')
            if (existsSync(parentConfig)) {
              return parseGitConfigRemoteUrl(readFileSync(parentConfig, 'utf8'), options)
            }
          }
        }
      }
    } catch {
      // Ignore permission or stat errors
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return undefined
}

/** Asynchronous origin reader used only by the bounded background cache queue.
 * Unlike manual discovery this never falls back to synchronous filesystem I/O.
 * A failed process rejects, preserving a previously known origin.
 */
export async function discoverLocalGitRemoteAsync(directoryPath: string): Promise<string | undefined> {
  if (!directoryPath || !isAbsolute(directoryPath)) throw new Error('Local Git paths must be absolute')
  const run = (args: string[]): Promise<string> => new Promise((resolveResult, reject) => {
    execFile('git', args, {
      encoding: 'utf8', timeout: 3_000, maxBuffer: 256 * 1024, windowsHide: true,
    }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolveResult(stdout)
    })
  })
  await run(['-C', directoryPath, 'rev-parse', '--git-dir'])
  try {
    return (await run(['-C', directoryPath, 'config', '--includes', '--get', 'remote.origin.url'])).trim() || undefined
  } catch (error) {
    if ((error as { code?: number }).code === 1) return undefined
    throw error
  }
}

/** Build an origin-only batch for the interpreter selected by the capability probe. */
export function buildGitOriginScript(paths: readonly string[], platform: GitRemotePlatform): string {
  for (const path of paths) assertGitPathNamespace(path, platform)
  if (platform.shell === 'powershell') {
    return [
      "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)",
      "if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is unavailable' }",
      ...paths.map((path, index) => [
        `$d = ${quotePowerShell(path)}; if (-not (Test-Path -LiteralPath $d -PathType Container)) { throw 'Invalid workspace path (${index})' }`,
        "$ErrorActionPreference='Continue'; & git -C $d rev-parse --git-dir >$null 2>$null; $repoCode = $LASTEXITCODE; $u = $null; $ErrorActionPreference='Stop'",
        `if ($repoCode -eq 0) { $ErrorActionPreference='Continue'; $u = & git -C $d config --includes --get remote.origin.url 2>$null; $code=$LASTEXITCODE; $ErrorActionPreference='Stop'; if ($code -ne 0 -and $code -ne 1) { throw 'Git origin read failed (${index})' } } elseif (Test-Path -LiteralPath (Join-Path $d '.git')) { throw 'Invalid Git metadata (${index})' }`,
        `Write-Output ("__DSH_GIT_${index}__" + [char]9 + ($u -join ""))`,
      ].join('; ')),
      "Write-Output '__DSH_GIT_DONE__'",
    ].join('\n')
  }
  return [
    'set -eu; command -v git >/dev/null',
    ...paths.map((path, index) => [
      `d=${quotePosix(path)}; [ -d "$d" ] || exit 2; u=`,
      'if git -C "$d" rev-parse --git-dir >/dev/null 2>&1; then',
      '  code=0; u=$(git -C "$d" config --includes --get remote.origin.url) || code=$?',
      '  [ "$code" -le 1 ] || exit "$code"',
      'elif [ -e "$d/.git" ]; then exit 2; fi',
      `printf '__DSH_GIT_${index}__\\t%s\\n' "$u"`,
    ].join('\n')),
    "printf '__DSH_GIT_DONE__\\n'",
  ].join('\n')
}

/** Errors throw, rather than making a failed device look like an empty catalog. */
export async function discoverRemoteGitRemotesViaSsh(
  transport: SshTransportConfig,
  paths: readonly string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const uniquePaths = [...new Set(paths.filter(p => p.trim() !== ''))]
  if (uniquePaths.length === 0) return result
  const platform = await gitPlatformProbe.detect(transport)
  const res = await execSshCommand(transport, encodeGitScript(platform, buildGitOriginScript(uniquePaths, platform)), 8_000)
  if (!res.ok) throw new Error(res.error)
  if (!/^__DSH_GIT_DONE__\r?$/m.test(res.stdout)) throw new Error('Incomplete Git origin response')
  for (const line of res.stdout.split(/\r?\n/)) {
    const match = /^__DSH_GIT_(\d+)__\t(.*)$/.exec(line)
    if (match?.[1] === undefined || match[2] === undefined) continue
    const path = uniquePaths[Number(match[1])]
    const url = match[2].trim()
    if (path !== undefined && url !== '') result.set(path, url)
  }
  return result
}

export const DEFAULT_AGGREGATION_CONFIG: WorkspaceAggregationConfig = {
  autoGitAggregate: true,
  prefixUnmatchedWithDevice: false,
  excludedMemberKeys: [],
  preferredDeviceByLogicalId: {},
  customTitleByLogicalId: {},
  workspaceOrder: [],
  manualRules: [],
}

/**
 * Pure aggregation engine: combines physical workspaces across devices into Logical Workspaces
 * and DSH `WorkspaceView` rows without touching any project files.
 */
export const GIT_REMOTE_POSITIVE_TTL_MS = 60_000
export const GIT_REMOTE_NEGATIVE_TTL_MS = 30_000

export interface GitRemoteCacheOptions {
  readonly now?: () => number
  readonly positiveTtlMs?: number
  readonly negativeTtlMs?: number
  readonly localProbe?: (path: string) => Promise<string | undefined>
  /** Concurrent paths, clamped to 2–4; each path runs commands sequentially. */
  readonly localConcurrency?: number
  /** Called asynchronously only when an accepted probe changes cached metadata. */
  readonly onCacheChanged?: (deviceId: DeviceId, path: string, rawOrigin: string | undefined) => void
}

interface LocalGitProbeJob { readonly key: string; readonly path: string }

export class WorkspaceAggregator {
  private config: WorkspaceAggregationConfig
  private readonly gitRemoteCache = new Map<string, { value: string | null; at: number; deviceId: DeviceId }>()
  private readonly localProbeJobs = new Map<string, LocalGitProbeJob>()
  private readonly localProbeQueue: LocalGitProbeJob[] = []
  private readonly localRetryAt = new Map<string, number>()
  private activeLocalProbes = 0
  private localDrainScheduled = false

  constructor(initialConfig: Partial<WorkspaceAggregationConfig> = {}, private readonly cacheOptions: GitRemoteCacheOptions = {}) {
    this.config = {
      ...DEFAULT_AGGREGATION_CONFIG,
      ...initialConfig,
      excludedMemberKeys: [...(initialConfig.excludedMemberKeys ?? [])],
      preferredDeviceByLogicalId: { ...(initialConfig.preferredDeviceByLogicalId ?? {}) },
      customTitleByLogicalId: { ...(initialConfig.customTitleByLogicalId ?? {}) },
      workspaceOrder: [...(initialConfig.workspaceOrder ?? [])],
      manualRules: [...(initialConfig.manualRules ?? [])],
    }
  }

  getConfig(): WorkspaceAggregationConfig {
    return this.config
  }

  setConfig(next: Partial<WorkspaceAggregationConfig>): WorkspaceAggregationConfig {
    this.config = {
      autoGitAggregate: next.autoGitAggregate ?? this.config.autoGitAggregate,
      prefixUnmatchedWithDevice: next.prefixUnmatchedWithDevice ?? this.config.prefixUnmatchedWithDevice,
      excludedMemberKeys: next.excludedMemberKeys ? [...next.excludedMemberKeys] : this.config.excludedMemberKeys,
      preferredDeviceByLogicalId: next.preferredDeviceByLogicalId
        ? { ...next.preferredDeviceByLogicalId }
        : this.config.preferredDeviceByLogicalId,
      customTitleByLogicalId: next.customTitleByLogicalId
        ? { ...next.customTitleByLogicalId }
        : this.config.customTitleByLogicalId,
      workspaceOrder: next.workspaceOrder ? [...next.workspaceOrder] : this.config.workspaceOrder,
      manualRules: next.manualRules ? [...next.manualRules] : this.config.manualRules,
    }
    return this.config
  }

  upsertManualRule(rule: ManualWorkspaceRule): WorkspaceAggregationConfig {
    const filtered = this.config.manualRules.filter(r => r.id !== rule.id)
    this.config = {
      ...this.config,
      manualRules: [...filtered, rule],
    }
    return this.config
  }

  removeManualRule(ruleId: string): WorkspaceAggregationConfig {
    this.config = {
      ...this.config,
      manualRules: this.config.manualRules.filter(r => r.id !== ruleId),
    }
    return this.config
  }

  setMemberExcluded(memberKey: string, excluded: boolean): WorkspaceAggregationConfig {
    const set = new Set(this.config.excludedMemberKeys)
    if (excluded) set.add(memberKey)
    else set.delete(memberKey)
    this.config = {
      ...this.config,
      excludedMemberKeys: [...set],
    }
    return this.config
  }

  setPreferredDevice(logicalWorkspaceId: string, deviceId: DeviceId): WorkspaceAggregationConfig {
    this.config = {
      ...this.config,
      preferredDeviceByLogicalId: {
        ...this.config.preferredDeviceByLogicalId,
        [logicalWorkspaceId]: deviceId,
      },
    }
    return this.config
  }

  setCustomTitle(logicalWorkspaceId: string, title: string): WorkspaceAggregationConfig {
    const trimmed = title.trim()
    const nextTitles = { ...this.config.customTitleByLogicalId }
    if (trimmed === '') delete nextTitles[logicalWorkspaceId]
    else nextTitles[logicalWorkspaceId] = trimmed
    this.config = {
      ...this.config,
      customTitleByLogicalId: nextTitles,
    }
    return this.config
  }

  /** An explicit observation supersedes any queued or in-flight older read. */
  noteGitRemote(deviceId: DeviceId, path: string, rawGitRemote: string): void {
    const key = workspaceMemberKey(deviceId, path)
    const value = rawGitRemote.trim() || null
    this.localProbeJobs.delete(key)
    this.localRetryAt.delete(key)
    this.gitRemoteCache.set(key, { value, at: this.cacheNow(), deviceId })
  }

  /** Explicit invalidation also fences late async results; TTL alone retains stale data. */
  invalidateGitRemote(deviceId?: DeviceId, path?: string): void {
    if (deviceId === undefined) {
      this.gitRemoteCache.clear(); this.localProbeJobs.clear(); this.localRetryAt.clear()
      this.localProbeQueue.length = 0
      return
    }
    if (path !== undefined) {
      const key = workspaceMemberKey(deviceId, path)
      this.gitRemoteCache.delete(key); this.localProbeJobs.delete(key); this.localRetryAt.delete(key)
      return
    }
    for (const [key, cached] of this.gitRemoteCache) {
      if (cached.deviceId === deviceId) this.gitRemoteCache.delete(key)
    }
    if (deviceId === LOCAL_DEVICE_ID) {
      this.localProbeJobs.clear(); this.localRetryAt.clear(); this.localProbeQueue.length = 0
    }
  }

  private cacheNow(): number { return this.cacheOptions.now?.() ?? Date.now() }

  /** Snapshot-safe: memory only, with a deferred and deduplicated refresh request.
   * Neither an expired positive nor a transient failure splits a known group.
   */
  getCachedGitRemote(deviceId: DeviceId, path: string): string | undefined {
    const key = workspaceMemberKey(deviceId, path)
    const cached = this.gitRemoteCache.get(key)
    if (deviceId === LOCAL_DEVICE_ID) {
      const ttl = cached?.value === null
        ? (this.cacheOptions.negativeTtlMs ?? GIT_REMOTE_NEGATIVE_TTL_MS)
        : (this.cacheOptions.positiveTtlMs ?? GIT_REMOTE_POSITIVE_TTL_MS)
      if (cached === undefined || this.cacheNow() - cached.at >= ttl) this.enqueueLocalProbe(key, path)
    }
    return cached?.value ?? undefined
  }

  private enqueueLocalProbe(key: string, path: string): void {
    if (!isAbsolute(path) || this.localProbeJobs.has(key) || this.cacheNow() < (this.localRetryAt.get(key) ?? -Infinity)) return
    const job = { key, path }
    this.localProbeJobs.set(key, job)
    this.localProbeQueue.push(job)
    if (this.localDrainScheduled) return
    this.localDrainScheduled = true
    queueMicrotask(() => {
      this.localDrainScheduled = false
      this.drainLocalProbes()
    })
  }

  private drainLocalProbes(): void {
    const configured = this.cacheOptions.localConcurrency ?? 3
    const limit = Number.isFinite(configured) ? Math.max(2, Math.min(4, Math.trunc(configured))) : 3
    while (this.activeLocalProbes < limit && this.localProbeQueue.length > 0) {
      const job = this.localProbeQueue.shift()!
      if (this.localProbeJobs.get(job.key) !== job) continue
      this.activeLocalProbes += 1
      void this.runLocalProbe(job)
    }
  }

  private async runLocalProbe(job: LocalGitProbeJob): Promise<void> {
    try {
      const raw = await (this.cacheOptions.localProbe ?? discoverLocalGitRemoteAsync)(job.path)
      if (this.localProbeJobs.get(job.key) !== job) return
      const value = raw?.trim() || null
      const previous = this.gitRemoteCache.get(job.key)?.value
      this.gitRemoteCache.set(job.key, { value, at: this.cacheNow(), deviceId: LOCAL_DEVICE_ID })
      this.localRetryAt.delete(job.key)
      // Delete before notifying: callback snapshots must see the accepted entry.
      this.localProbeJobs.delete(job.key)
      if ((previous ?? null) !== value) {
        try { this.cacheOptions.onCacheChanged?.(LOCAL_DEVICE_ID, job.path, value ?? undefined) } catch { /* host notification must not poison discovery */ }
      }
    } catch {
      if (this.localProbeJobs.get(job.key) === job) {
        // Failure is not evidence of origin removal. Retain stale metadata and
        // retry on a later snapshot after bounded negative-cache backoff.
        this.localRetryAt.set(job.key, this.cacheNow() + (this.cacheOptions.negativeTtlMs ?? GIT_REMOTE_NEGATIVE_TTL_MS))
      }
    } finally {
      if (this.localProbeJobs.get(job.key) === job) this.localProbeJobs.delete(job.key)
      this.activeLocalProbes -= 1
      this.drainLocalProbes()
    }
  }

  /**
   * Compute both the `LogicalWorkspaceView[]` and `WorkspaceMemberRef[]` from all physical
   * workspaces across local and remote devices.
   *
   * @param physicalList - every workspace known on the local and remote devices.
   * @param sessionUpdatedAtMap - activity timestamps used to order merged sessions.
   * @param deviceStates - live connection state per device. A device missing from
   *   the map is treated as connected so pure aggregation (tests, offline
   *   catalogs) keeps its historical behavior; the Host always passes real states.
   */
  aggregate(
    physicalList: readonly PhysicalWorkspaceInput[],
    sessionUpdatedAtMap: ReadonlyMap<string, number> = new Map(),
    deviceStates: ReadonlyMap<DeviceId, DeviceConnectionState> = new Map(),
  ): {
    readonly logicalWorkspaces: LogicalWorkspaceView[]
    readonly allPhysicalWorkspaces: WorkspaceMemberRef[]
  } {
    const isOnline = (deviceId: DeviceId): boolean =>
      deviceId === LOCAL_DEVICE_ID || (deviceStates.get(deviceId) ?? 'connected') === 'connected'
    const excludedSet = new Set(this.config.excludedMemberKeys)

    const enriched = physicalList.map((item) => {
      const memberKey = workspaceMemberKey(item.deviceId, item.path)
      const rawGit = item.rawGitRemote ?? this.getCachedGitRemote(item.deviceId, item.path)
      const gitRemote = normalizeGitRemote(rawGit)
      const namespacedSessionIds = item.sessionIds.map(sid =>
        encodeRemoteSessionId(item.deviceId, sid),
      )
      const memberRef: WorkspaceMemberRef = {
        deviceId: item.deviceId,
        deviceName: item.deviceName,
        remoteWorkspaceId: item.workspaceId,
        path: item.path,
        title: item.title,
        ...(gitRemote !== undefined ? { gitRemote } : {}),
        ...(rawGit !== undefined ? { rawGitRemote: rawGit } : {}),
        sessionCount: item.sessionIds.length,
        runningSessionCount: item.runningSessionCount,
      }
      return {
        input: item,
        memberKey,
        gitRemote,
        namespacedSessionIds,
        memberRef,
      }
    })

    const allPhysicalWorkspaces = enriched.map(e => e.memberRef)
    const consumedIndices = new Set<number>()
    const logicalWorkspaces: LogicalWorkspaceView[] = []

    // Step 1: Apply explicit manual rules first (highest precedence)
    for (const rule of this.config.manualRules) {
      const ruleMemberKeys = new Set(rule.memberKeys)
      const ruleGit = normalizeGitRemote(rule.gitRemote)
      const matched = enriched.filter((entry, idx) => {
        if (consumedIndices.has(idx)) return false
        if (ruleMemberKeys.has(entry.memberKey)) return true
        if (ruleGit !== undefined && entry.gitRemote === ruleGit && !excludedSet.has(entry.memberKey)) {
          return true
        }
        return false
      })
      if (matched.length === 0) continue
      for (const m of matched) {
        consumedIndices.add(enriched.indexOf(m))
      }
      const logicalId = encodeLogicalWorkspaceId('manual', rule.id)
      logicalWorkspaces.push(
        this.buildLogicalView(
          logicalId,
          'manual',
          rule.title,
          ruleGit ?? matched.find(m => m.gitRemote !== undefined)?.gitRemote,
          matched,
          sessionUpdatedAtMap,
          isOnline,
          rule.preferredDeviceId,
        ),
      )
    }

    // Step 2: Apply automatic Git Remote aggregation when enabled
    if (this.config.autoGitAggregate) {
      const byGitRemote = new Map<string, typeof enriched>()
      for (const [idx, entry] of enriched.entries()) {
        if (consumedIndices.has(idx)) continue
        if (excludedSet.has(entry.memberKey)) continue
        if (entry.gitRemote === undefined) continue
        const group = byGitRemote.get(entry.gitRemote) ?? []
        group.push(entry)
        byGitRemote.set(entry.gitRemote, group)
      }

      for (const [gitRemote, group] of byGitRemote.entries()) {
        // Aggregate when multiple workspaces share the same Git repo (across devices or worktrees)
        const distinctDevices = new Set(group.map(g => g.input.deviceId))
        if (group.length >= 2 || distinctDevices.size >= 2) {
          for (const m of group) {
            consumedIndices.add(enriched.indexOf(m))
          }
          const logicalId = encodeLogicalWorkspaceId('git', gitRemote)
          const repoName = gitRemote.split('/').pop() ?? group[0]?.input.title ?? gitRemote
          const defaultTitle = group.find(g => g.input.deviceId === LOCAL_DEVICE_ID)?.input.title ?? repoName
          logicalWorkspaces.push(
            this.buildLogicalView(
              logicalId,
              'git',
              defaultTitle,
              gitRemote,
              group,
              sessionUpdatedAtMap,
              isOnline,
            ),
          )
        }
      }
    }

    // Step 3: Remaining unmerged workspaces stay as single-device workspaces
    for (const [idx, entry] of enriched.entries()) {
      if (consumedIndices.has(idx)) continue
      const isLocal = entry.input.deviceId === LOCAL_DEVICE_ID
      const workspaceId = isLocal
        ? entry.input.workspaceId
        : encodeRemoteWorkspaceId(entry.input.deviceId, entry.input.workspaceId)
      const customTitle = this.config.customTitleByLogicalId[workspaceId]
      const baseTitle = entry.input.title
      const title = customTitle ?? baseTitle

      logicalWorkspaces.push({
        logicalWorkspaceId: workspaceId,
        title,
        kind: 'single',
        ...(entry.gitRemote !== undefined ? { gitRemote: entry.gitRemote } : {}),
        targetDeviceId: entry.input.deviceId,
        targetPath: entry.input.path,
        effectiveTargetDeviceId: entry.input.deviceId,
        effectiveTargetPath: entry.input.path,
        effectiveTargetOnline: isOnline(entry.input.deviceId),
        members: [entry.memberRef],
        // Same recency ordering as merged Workspaces, so the sidebar shows a
        // consistent newest-first list whether a project spans one device or many.
        sessionIds: [...entry.namespacedSessionIds].sort((a, b) => {
          const ta = sessionUpdatedAtMap.get(a) ?? 0
          const tb = sessionUpdatedAtMap.get(b) ?? 0
          return tb - ta
        }),
        createdAt: entry.input.createdAt,
        updatedAt: entry.input.updatedAt,
      })
    }

    if (this.config.workspaceOrder.length > 0) {
      const rank = new Map(this.config.workspaceOrder.map((id, index) => [id, index]))
      logicalWorkspaces.sort(
        (a, b) => (rank.get(a.logicalWorkspaceId) ?? Number.MAX_SAFE_INTEGER)
          - (rank.get(b.logicalWorkspaceId) ?? Number.MAX_SAFE_INTEGER),
      )
    }

    return { logicalWorkspaces, allPhysicalWorkspaces }
  }

  private buildLogicalView(
    logicalId: string,
    kind: 'git' | 'manual',
    defaultTitle: string,
    gitRemote: string | undefined,
    members: readonly {
      input: PhysicalWorkspaceInput
      memberKey: string
      gitRemote: string | undefined
      namespacedSessionIds: string[]
      memberRef: WorkspaceMemberRef
    }[],
    sessionUpdatedAtMap: ReadonlyMap<string, number>,
    isOnline: (deviceId: DeviceId) => boolean,
    rulePreferredDevice?: DeviceId,
  ): LogicalWorkspaceView {
    const customTitle = this.config.customTitleByLogicalId[logicalId]
    const configuredPreferred =
      this.config.preferredDeviceByLogicalId[logicalId] ?? rulePreferredDevice

    // Preferred device: configured preference -> local (if member) -> first member.
    // The preference survives an offline device, so it stays the user's choice.
    const targetMember =
      (configuredPreferred !== undefined
        ? members.find(m => m.input.deviceId === configuredPreferred)
        : undefined) ??
      members.find(m => m.input.deviceId === LOCAL_DEVICE_ID) ??
      members[0]!

    // Effective device: the preferred one while reachable, otherwise stay online:
    // local member first, then the first reachable member, then the preferred one
    // (so `effectiveTargetOnline === false` tells the UI a create will fail).
    const effectiveTargetMember = isOnline(targetMember.input.deviceId)
      ? targetMember
      : (members.find(m => m.input.deviceId === LOCAL_DEVICE_ID) ??
        members.find(m => isOnline(m.input.deviceId)) ??
        targetMember)

    // Merge session IDs across all member workspaces, ordered by recency (newest first)
    const seenSessions = new Set<string>()
    const mergedSessionIds: string[] = []
    for (const m of members) {
      for (const sid of m.namespacedSessionIds) {
        if (!seenSessions.has(sid)) {
          seenSessions.add(sid)
          mergedSessionIds.push(sid)
        }
      }
    }
    mergedSessionIds.sort((a, b) => {
      const ta = sessionUpdatedAtMap.get(a) ?? 0
      const tb = sessionUpdatedAtMap.get(b) ?? 0
      return tb - ta
    })

    let earliestCreated = members[0]?.input.createdAt ?? new Date(0).toISOString()
    let latestUpdated = members[0]?.input.updatedAt ?? new Date(0).toISOString()
    for (const m of members) {
      if (Date.parse(m.input.createdAt) < Date.parse(earliestCreated)) {
        earliestCreated = m.input.createdAt
      }
      if (Date.parse(m.input.updatedAt) > Date.parse(latestUpdated)) {
        latestUpdated = m.input.updatedAt
      }
    }

    // If single local workspace is part of a multi-device Logical Workspace, can we preserve local workspaceId
    // or use logicalId? Using logicalId (`md-lws~...`) makes it clear to `session.create` and `workspace.rename`
    // that it is an aggregated Logical Workspace!
    return {
      logicalWorkspaceId: logicalId,
      title: customTitle ?? defaultTitle,
      kind,
      ...(gitRemote !== undefined ? { gitRemote } : {}),
      targetDeviceId: targetMember.input.deviceId,
      targetPath: targetMember.input.path,
      effectiveTargetDeviceId: effectiveTargetMember.input.deviceId,
      effectiveTargetPath: effectiveTargetMember.input.path,
      effectiveTargetOnline: isOnline(effectiveTargetMember.input.deviceId),
      members: members.map(m => m.memberRef),
      sessionIds: mergedSessionIds,
      createdAt: earliestCreated,
      updatedAt: latestUpdated,
    }
  }
}

export { normalizeWorkspacePath }

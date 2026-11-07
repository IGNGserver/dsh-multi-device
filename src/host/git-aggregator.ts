/**
 * Git Remote Auto-Discovery and Logical Workspace Aggregation Engine.
 *
 * Responsibilities:
 * 1. Read-only discovery of Git remote URLs (`remote.origin.url` or first remote) for local
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
  let fallbackUrl: string | undefined

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
          } else if (fallbackUrl === undefined) {
            fallbackUrl = url
          }
        }
      }
    }
  }

  return originUrl ?? (options.originOnly === true ? undefined : fallbackUrl)
}

/**
 * Discover the raw Git remote URL of a local directory by walking up to find `.git/config`
 * (supports both normal `.git` directories and `.git` worktree pointer files).
 * Purely read-only and synchronous with zero child-process overhead.
 */
export function discoverLocalGitRemote(
  directoryPath: string,
  options: { readonly originOnly?: boolean } = {},
): string | undefined {
  if (!directoryPath || !isAbsolute(directoryPath)) return undefined
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

/**
 * Batch-discover Git remote URLs for multiple paths on a remote SSH device in a single round-trip.
 * Read-only: runs `git -C <path> config --get remote.origin.url` for each path.
 */
export async function discoverRemoteGitRemotesViaSsh(
  transport: SshTransportConfig,
  paths: readonly string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const uniquePaths = [...new Set(paths.filter(p => p.trim() !== ''))]
  if (uniquePaths.length === 0) return result

  // Build a safe POSIX shell snippet that prints `PATH\tURL` per directory
  const commands = uniquePaths.map((p, idx) => {
    const escaped = `'${p.replaceAll("'", "'\\''")}'`
    // origin only. A first-remote fallback would pick `nas` and split one repo.
    return [
      `u=$(git -C ${escaped} config --get remote.origin.url 2>/dev/null || true)`,
      `printf "__DSH_GIT_%d__\\t%s\\n" ${idx} "$u"`,
    ].join('; ')
  })
  const fullCommand = commands.join('; ')
  const res = await execSshCommand(transport, fullCommand, 8_000)
  if (!res.ok) return result

  for (const line of res.stdout.split(/\r?\n/)) {
    const match = /^__DSH_GIT_(\d+)__\t(.+)$/.exec(line.trim())
    if (!match || match[1] === undefined || match[2] === undefined) continue
    const idx = Number(match[1])
    const url = match[2].trim()
    const path = uniquePaths[idx]
    if (path !== undefined && url !== '') {
      result.set(path, url)
    }
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
export class WorkspaceAggregator {
  private config: WorkspaceAggregationConfig
  private readonly gitRemoteCache = new Map<string, string | null>()
  private readonly negativeCacheAt = new Map<string, number>()

  constructor(initialConfig: Partial<WorkspaceAggregationConfig> = {}) {
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

  /** Record a discovered raw Git remote URL for `<deviceId>:<normalizedPath>`. */
  noteGitRemote(deviceId: DeviceId, path: string, rawGitRemote: string): void {
    const key = workspaceMemberKey(deviceId, path)
    this.gitRemoteCache.set(key, rawGitRemote)
    this.negativeCacheAt.delete(key)
  }

  getCachedGitRemote(deviceId: DeviceId, path: string): string | undefined {
    const key = workspaceMemberKey(deviceId, path)
    const cached = this.gitRemoteCache.get(key)
    if (typeof cached === 'string') return cached
    if (cached === null) {
      const at = this.negativeCacheAt.get(key) ?? 0
      if (Date.now() - at < 30_000) return undefined
    }
    if (deviceId === LOCAL_DEVICE_ID) {
      const discovered = discoverLocalGitRemote(path)
      if (discovered !== undefined) {
        this.gitRemoteCache.set(key, discovered)
        this.negativeCacheAt.delete(key)
        return discovered
      }
      this.gitRemoteCache.set(key, null)
      this.negativeCacheAt.set(key, Date.now())
    }
    return undefined
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

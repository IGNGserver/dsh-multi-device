/**
 * Read-only Git repository scanning used by the manual Git match run.
 *
 * Discovery walks a small, explicit set of roots instead of assuming a
 * conventional `~/dev` layout: the user home plus the parent directory of every
 * workspace already registered on that device. Hidden caches are pruned except
 * the deliberate `.wt` container; .git files and directories are both members.
 *
 * Scanning is only ever triggered by an explicit user action; nothing here is
 * called from a workspace/session stream.
 *
 * @module dsh-multi-device/host/git-scan
 */
import { type Dirent, readdirSync, statSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join, posix, resolve, win32 } from 'node:path'
import { normalizeGitRemote, type SshTransportConfig } from '../contract.ts'
import { discoverLocalGitRemote, discoverLocalGitRemoteAsync } from './git-aggregator.ts'
import { execSshCommand } from './tunnel.ts'
import { assertGitPathNamespace, encodeGitScript, gitPlatformProbe, quotePosix, quotePowerShell } from './git-platform.ts'

/** Directory names that never contain project repositories worth scanning. */
const PRUNED_NAMES = new Set([
  'node_modules',
  '.pnpm',
  'dist',
  'coverage',
  'target',
  'vendor',
  'Library',
  'Applications',
  'AppData',
])

/** Default repository depth below a scan root (repo dir at depth <= maxDepth). */
export const DEFAULT_SCAN_DEPTH = 4

/** Remote scan output markers. v2 uses NUL-framed fields so tabs/newlines are data. */
const SCAN_MARKER = '__DSH_REPO__'
const SCAN_MARKER_V2 = '__DSH_REPO_V2__'
const SCAN_DONE_V2 = '__DSH_SCAN_DONE_V2__'
const SCAN_TRUNCATED_V2 = '__DSH_SCAN_TRUNCATED_V2__'
export const DEFAULT_SCAN_REPOSITORY_LIMIT = 5000

/** A repository found on disk. */
export interface ScannedRepository {
  readonly path: string
  readonly rawOrigin: string
  readonly gitRemote: string
}

export interface ScanOptions {
  /** Repository depth below each root. Defaults to {@link DEFAULT_SCAN_DEPTH}. */
  readonly maxDepth?: number
  /** Extra roots appended after the derived ones. */
  readonly extraRoots?: readonly string[]
  /** Hard per-shard candidate cap; excess roots are reported as truncated. */
  readonly maxRepositories?: number
  readonly signal?: AbortSignal
  readonly onRepository?: (repository: ScannedRepository) => void
}

function normalizeTargetPath(input: string, stepUp = false): string {
  const trimmed = input.trim()
  if (/^[A-Za-z]:[/\\]/.test(trimmed) || trimmed.startsWith('\\\\')) {
    return stepUp ? win32.resolve(trimmed, '..') : win32.resolve(trimmed)
  }
  if (trimmed.startsWith('/')) {
    return stepUp ? posix.resolve(trimmed, '..') : posix.resolve(trimmed)
  }
  throw new Error(`Scan roots must use an absolute device path: ${input}`)
}

/**
 * Derive scan roots from a home directory and the workspace paths registered on
 * that device. Deepest parent first is irrelevant; roots are de-duplicated and
 * output is deterministic so a rerun scans the same set.
 */
export function deriveScanRoots(
  home: string | undefined,
  workspacePaths: readonly string[],
  extraRoots: readonly string[] = [],
): string[] {
  const roots = new Set<string>()
  const push = (candidate: string | undefined, stepUp = false): void => {
    if (candidate === undefined) return
    const trimmed = candidate.trim()
    if (trimmed === '') return
    roots.add(normalizeTargetPath(trimmed, stepUp))
  }

  for (const extra of extraRoots) push(extra)
  for (const path of workspacePaths) {
    const normalized = path.trim()
    if (normalized === '') continue
    // A workspace is a repository root, not a scan root: go one level up.
    push(normalized, true)
  }
  push(home)
  return [...roots].sort()
}

/** Clamp untrusted numeric options before embedding them into a script. */
function scanDepth(value: number): number {
  return Number.isFinite(value) ? Math.min(32, Math.max(0, Math.trunc(value))) : DEFAULT_SCAN_DEPTH
}

function repositoryLimit(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value)
    ? DEFAULT_SCAN_REPOSITORY_LIMIT
    : Math.min(50_000, Math.max(1, Math.trunc(value)))
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new Error('Git scan cancelled')
}

/** Scan only explicit roots; .wt is the sole hidden container traversed. */
export function buildGitScanScript(
  roots: readonly string[],
  maxDepth = DEFAULT_SCAN_DEPTH,
  maxRepositories = DEFAULT_SCAN_REPOSITORY_LIMIT,
): string {
  const depth = scanDepth(maxDepth) + 1
  const limit = repositoryLimit(maxRepositories)
  const rootList = roots.length > 0 ? roots.map(quotePosix).join(' ') : '"$HOME"'
  const prune = [...PRUNED_NAMES].map(name => `-name ${quotePosix(name)}`).join(' -o ')
  return [
    'set -eu; command -v git >/dev/null',
    'ulimit -f 2048 2>/dev/null || true',
    'scan_file=$(mktemp) || exit 1',
    `trap 'rm -f "$scan_file" "$scan_file.sorted"' EXIT HUP INT TERM`,
    `for root in ${rootList}; do`,
    '  [ -d "$root" ] || { printf "Invalid scan root: %s\\n" "$root" >&2; exit 1; }',
    `  find "$root" -mindepth 1 -maxdepth ${depth} \\( ${prune} \\) -prune -o -name '.*' ! -name '.git' ! -name '.wt' -prune -o \\( -type d -name '.git' -print -prune -o -type f -name '.git' -print \\) >> "$scan_file" || exit 1`,
    'done',
    'sort -u "$scan_file" > "$scan_file.sorted" || exit 1',
    'count=0; truncated=0',
    'while IFS= read -r g; do',
    '  count=$((count + 1))',
    `  if [ "$count" -gt ${limit} ]; then truncated=1; break; fi`,
    '  d=${g%/.git}',
    '  git -C "$d" rev-parse --git-dir >/dev/null || exit $?',
    '  code=0; u=$(git -C "$d" config --includes --get remote.origin.url) || code=$?',
    '  [ "$code" -le 1 ] || exit "$code"',
    `  if [ -n "$u" ]; then printf '%s\\0%s\\0%s\\0' '${SCAN_MARKER_V2}' "$d" "$u"; fi`,
    'done < "$scan_file.sorted"',
    `  if [ "$truncated" -eq 1 ]; then printf '%s\\0' '${SCAN_TRUNCATED_V2}'; fi`,
    `printf '%s\\0' '${SCAN_DONE_V2}'`,
  ].join('\n')
}

export function buildPowerShellGitScanScript(
  roots: readonly string[],
  maxDepth = DEFAULT_SCAN_DEPTH,
  maxRepositories = DEFAULT_SCAN_REPOSITORY_LIMIT,
): string {
  const pruned = [...PRUNED_NAMES].map(quotePowerShell).join(',')
  return [
    "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)",
    "if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is unavailable' }",
    `$pruned = @(${pruned}); $seen = @{}; $maxDepth = ${scanDepth(maxDepth)}; $limit = ${repositoryLimit(maxRepositories)}; $script:scanned = 0; $script:truncated = $false`,
    'function Scan-Git([string]$directory, [int]$depth) {',
    '  if ($script:truncated) { return }',
    '  if ($seen.ContainsKey($directory) -and $seen[$directory] -le $depth) { return }; $seen[$directory]=$depth',
    '  $entries = @(Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop)',
    "  $dotGit = @($entries | Where-Object { $_.Name -eq '.git' })",
    '  if ($dotGit.Count -gt 0) {',
    '    if ($script:scanned -ge $limit) { $script:truncated = $true; return }; $script:scanned += 1',
    "    $ErrorActionPreference='Continue'; & git -C $directory rev-parse --git-dir >$null 2>$null; $code=$LASTEXITCODE; $ErrorActionPreference='Stop'",
    "    if ($code -ne 0) { throw ('Invalid Git repository: ' + $directory) }",
    "    $ErrorActionPreference='Continue'; $u = & git -C $directory config --includes --get remote.origin.url 2>$null; $code=$LASTEXITCODE; $ErrorActionPreference='Stop'",
    "    if ($code -ne 0 -and $code -ne 1) { throw ('Git origin read failed: ' + $directory) }",
    `    if ($u) { [Console]::Out.Write('${SCAN_MARKER_V2}' + [char]0 + $directory + [char]0 + ($u -join '') + [char]0) }`,
    "    if ($depth -lt $maxDepth -and ($entries | Where-Object { $_.Name -eq '.wt' -and $_.PSIsContainer -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) })) { Scan-Git (Join-Path $directory '.wt') ($depth + 1) }",
    '    return',
    '  }',
    '  if ($depth -ge $maxDepth) { return }',
    '  foreach ($entry in $entries) {',
    '    if ($script:truncated) { return }',
    "    if (-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { continue }",
    "    if (($entry.Name.StartsWith('.') -and $entry.Name -ne '.wt') -or $pruned -contains $entry.Name) { continue }",
    '    Scan-Git $entry.FullName ($depth + 1)',
    '  }',
    '}',
    ...roots.map(root => `if (-not (Test-Path -LiteralPath ${quotePowerShell(root)} -PathType Container)) { throw 'Invalid scan root' }; Scan-Git ${quotePowerShell(root)} 0`),
    `if ($script:truncated) { [Console]::Out.Write('${SCAN_TRUNCATED_V2}' + [char]0) }`,
    `[Console]::Out.Write('${SCAN_DONE_V2}' + [char]0)`,
  ].join('\n')
}

export interface GitScanProjection {
  readonly repos: ScannedRepository[]
  readonly complete: boolean
  readonly truncated: boolean
}

/** Parse both legacy lines and v2 NUL frames; completion is never inferred from records. */
export function parseGitScanProjection(stdout: string): GitScanProjection {
  const byPath = new Map<string, ScannedRepository>()
  let complete = false
  let truncated = false
  const add = (path: string, rawOrigin: string): void => {
    const origin = rawOrigin.trim()
    if (path === '' || origin === '') return
    const gitRemote = normalizeGitRemote(origin)
    if (gitRemote === undefined || byPath.has(path)) return
    if (byPath.size >= 50_000) { truncated = true; return }
    byPath.set(path, { path, rawOrigin: origin, gitRemote })
  }
  const tokens = stdout.split('\0')
  const framed = tokens.includes(SCAN_DONE_V2) || tokens.includes(SCAN_MARKER_V2) || tokens.includes(SCAN_TRUNCATED_V2)
  if (framed) {
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]
      if (token === SCAN_DONE_V2) complete = true
      else if (token === SCAN_TRUNCATED_V2) truncated = true
      else if (token === SCAN_MARKER_V2) {
        const path = tokens[index + 1]
        const origin = tokens[index + 2]
        if (path === undefined || origin === undefined) { truncated = true; break }
        add(path, origin)
        index += 2
      }
    }
  } else {
    for (const line of stdout.split(/\r?\n/)) {
      if (line === '__DSH_SCAN_DONE__\r' || line === '__DSH_SCAN_DONE__') complete = true
      if (!line.startsWith(`${SCAN_MARKER}\t`)) continue
      const rest = line.slice(SCAN_MARKER.length + 1)
      const tab = rest.indexOf('\t')
      if (tab > 0) add(rest.slice(0, tab), rest.slice(tab + 1))
    }
  }
  return { repos: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)), complete, truncated }
}

/** Backward-compatible repository-only projection for existing callers. */
export function parseGitScanOutput(stdout: string): ScannedRepository[] {
  return parseGitScanProjection(stdout).repos
}

/**
 * Scan one remote device over SSH. Failures are reported, never thrown: a
 * device that cannot be scanned must not look like a device with no projects.
 */
export type GitRepoScanResult =
  | { ok: true; repos: ScannedRepository[]; truncated?: boolean }
  | { ok: false; error: string; repos?: ScannedRepository[]; truncated?: boolean }

/** Scan roots in cancellable shards with one overall deadline, retaining useful partial results. */
export async function scanRemoteGitRepos(
  transport: SshTransportConfig,
  roots: readonly string[],
  options: ScanOptions & { readonly timeoutMs?: number; readonly shardSize?: number } = {},
): Promise<GitRepoScanResult> {
  if (roots.length === 0) return { ok: true, repos: [] }
  const byPath = new Map<string, ScannedRepository>()
  const started = Date.now()
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.min(600_000, Math.max(1, options.timeoutMs!)) : 25_000
  const shardSize = Math.min(16, Math.max(1, Math.trunc(options.shardSize ?? 4)))
  let truncated = false
  const partial = (): ScannedRepository[] => [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  try {
    throwIfAborted(options.signal)
    const platform = await gitPlatformProbe.detect(transport)
    for (const root of roots) assertGitPathNamespace(root, platform)
    const depth = options.maxDepth ?? DEFAULT_SCAN_DEPTH
    const limit = repositoryLimit(options.maxRepositories)
    for (let offset = 0; offset < roots.length; offset += shardSize) {
      throwIfAborted(options.signal)
      const remaining = timeoutMs - (Date.now() - started)
      if (remaining <= 0) return { ok: false, error: 'Git scan timed out', repos: partial(), truncated: true }
      const shard = roots.slice(offset, offset + shardSize)
      const script = platform.shell === 'posix'
        ? buildGitScanScript(shard, depth, limit)
        : buildPowerShellGitScanScript(shard, depth, limit)
      const res = await execSshCommand(transport, encodeGitScript(platform, script), remaining, options.signal)
      const projection: GitScanProjection = res.ok
        ? parseGitScanProjection(res.stdout)
        : { repos: [], complete: false, truncated: true }
      for (const repo of projection.repos) {
        if (byPath.has(repo.path)) continue
        byPath.set(repo.path, repo)
        options.onRepository?.(repo)
      }
      truncated ||= projection.truncated
      if (!res.ok) return { ok: false, error: res.error, repos: partial(), truncated: true }
      if (!projection.complete) return { ok: false, error: 'Incomplete Git scan response', repos: partial(), truncated: true }
    }
    return { ok: true, repos: partial(), ...(truncated ? { truncated: true } : {}) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), repos: partial(), truncated: true }
  }
}

/**
 * Scan the local machine. Uses the filesystem directly so it works on Windows
 * too, where the plugin has no POSIX shell guarantee.
 */
export function scanLocalGitRepos(
  roots: readonly string[],
  options: ScanOptions = {},
): ScannedRepository[] {
  const maxDepth = scanDepth(options.maxDepth ?? DEFAULT_SCAN_DEPTH)
  const limit = repositoryLimit(options.maxRepositories)
  const byPath = new Map<string, ScannedRepository>()
  const visited = new Map<string, number>()
  let candidates = 0

  const walk = (directory: string, depth: number): void => {
    throwIfAborted(options.signal)
    const previousDepth = visited.get(directory)
    if (previousDepth !== undefined && previousDepth <= depth) return
    visited.set(directory, depth)
    let entries: Dirent[]
    try {
      entries = readdirSync(directory, { withFileTypes: true }) as Dirent[]
    } catch (error) {
      throw new Error(`Unable to scan ${directory}: ${error instanceof Error ? error.message : String(error)}`)
    }

    const hasDotGit = entries.some(entry => entry.name === '.git' && (entry.isDirectory() || entry.isFile()))
    if (hasDotGit) {
      candidates += 1
      if (candidates > limit) throw new Error(`Git scan reached the ${limit}-repository limit`)
      const rawOrigin = discoverLocalGitRemote(directory, { originOnly: true, strict: true })
      if (rawOrigin !== undefined) {
        const gitRemote = normalizeGitRemote(rawOrigin)
        if (gitRemote !== undefined && !byPath.has(directory)) {
          const repository = { path: directory, rawOrigin, gitRemote }
          byPath.set(directory, repository)
          options.onRepository?.(repository)
        }
      }
      // Main checkouts are leaves except for the conventional explicit worktree
      // container; never recurse into arbitrary dependency repositories.
      if (depth < maxDepth && entries.some(entry => entry.name === '.wt' && entry.isDirectory())) {
        walk(join(directory, '.wt'), depth + 1)
      }
      return
    }

    if (depth >= maxDepth) return
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') && entry.name !== '.wt') continue
      if (PRUNED_NAMES.has(entry.name)) continue
      walk(join(directory, entry.name), depth + 1)
    }
  }

  for (const root of [...new Set([...roots, ...(options.extraRoots ?? [])].map(r => resolve(r)))].sort()) {
    throwIfAborted(options.signal)
    try {
      if (!statSync(root).isDirectory()) throw new Error(`Scan root is not a directory: ${root}`)
    } catch (error) {
      throw new Error(`Unable to scan root ${root}: ${error instanceof Error ? error.message : String(error)}`)
    }
    walk(root, 0)
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
}

/** Async local scan used by Git Match; no synchronous directory walk blocks cancellation/UI progress. */
export async function scanLocalGitReposAsync(
  roots: readonly string[],
  options: ScanOptions = {},
): Promise<GitRepoScanResult> {
  const maxDepth = scanDepth(options.maxDepth ?? DEFAULT_SCAN_DEPTH)
  const limit = repositoryLimit(options.maxRepositories)
  const byPath = new Map<string, ScannedRepository>()
  const visited = new Map<string, number>()
  let candidates = 0
  let truncated = false
  const partial = (): ScannedRepository[] => [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  const walk = async (directory: string, depth: number): Promise<void> => {
    throwIfAborted(options.signal)
    if (truncated) return
    const previousDepth = visited.get(directory)
    if (previousDepth !== undefined && previousDepth <= depth) return
    visited.set(directory, depth)
    const entries = await readdir(directory, { withFileTypes: true })
    const hasDotGit = entries.some(entry => entry.name === '.git' && (entry.isDirectory() || entry.isFile()))
    if (hasDotGit) {
      candidates += 1
      if (candidates > limit) { truncated = true; return }
      const rawOrigin = await discoverLocalGitRemoteAsync(directory, options.signal)
      throwIfAborted(options.signal)
      if (rawOrigin !== undefined) {
        const gitRemote = normalizeGitRemote(rawOrigin)
        if (gitRemote !== undefined && !byPath.has(directory)) {
          const repository = { path: directory, rawOrigin, gitRemote }
          byPath.set(directory, repository)
          options.onRepository?.(repository)
        }
      }
      if (depth < maxDepth && entries.some(entry => entry.name === '.wt' && entry.isDirectory())) {
        await walk(join(directory, '.wt'), depth + 1)
      }
      return
    }
    if (depth >= maxDepth) return
    for (const entry of entries) {
      if (truncated) return
      throwIfAborted(options.signal)
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') && entry.name !== '.wt') continue
      if (PRUNED_NAMES.has(entry.name)) continue
      await walk(join(directory, entry.name), depth + 1)
    }
  }
  try {
    for (const root of [...new Set([...roots, ...(options.extraRoots ?? [])].map(r => resolve(r)))].sort()) {
      throwIfAborted(options.signal)
      if (truncated) break
      if (!(await stat(root)).isDirectory()) throw new Error(`Scan root is not a directory: ${root}`)
      await walk(root, 0)
    }
    return { ok: true, repos: partial(), ...(truncated ? { truncated: true } : {}) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), repos: partial(), truncated: true }
  }
}

/**
 * Collapse repositories sharing one normalized origin to a single path.
 * The shortest path wins so a main checkout beats any deeper copy.
 */
export function primaryRepoByOrigin(repos: readonly ScannedRepository[]): Map<string, ScannedRepository> {
  const chosen = new Map<string, ScannedRepository>()
  for (const repo of repos) {
    const existing = chosen.get(repo.gitRemote)
    if (existing === undefined || repo.path.length < existing.path.length) {
      chosen.set(repo.gitRemote, repo)
    }
  }
  return chosen
}

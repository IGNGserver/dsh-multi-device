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
import { join, posix, resolve, win32 } from 'node:path'
import { normalizeGitRemote, type SshTransportConfig } from '../contract.ts'
import { discoverLocalGitRemote } from './git-aggregator.ts'
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

/** Remote scan output marker. */
const SCAN_MARKER = '__DSH_REPO__'

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

/** Scan only explicit roots; .wt is the sole hidden container traversed. */
export function buildGitScanScript(roots: readonly string[], maxDepth = DEFAULT_SCAN_DEPTH): string {
  const depth = scanDepth(maxDepth) + 1
  const rootList = roots.length > 0 ? roots.map(quotePosix).join(' ') : '"$HOME"'
  const prune = [...PRUNED_NAMES].map(name => `-name ${quotePosix(name)}`).join(' -o ')
  return [
    'set -eu; command -v git >/dev/null',
    'scan_file=$(mktemp) || exit 1',
    `trap 'rm -f "$scan_file" "$scan_file.sorted"' EXIT HUP INT TERM`,
    `for root in ${rootList}; do`,
    '  [ -d "$root" ] || { printf "Invalid scan root: %s\\n" "$root" >&2; exit 1; }',
    `  find "$root" -mindepth 1 -maxdepth ${depth} \\( ${prune} \\) -prune -o -name '.*' ! -name '.git' ! -name '.wt' -prune -o \\( -type d -name '.git' -print -prune -o -type f -name '.git' -print \\) >> "$scan_file" || exit 1`,
    'done',
    'sort -u "$scan_file" > "$scan_file.sorted" || exit 1',
    'while IFS= read -r g; do',
    '  d=${g%/.git}',
    '  git -C "$d" rev-parse --git-dir >/dev/null || exit $?',
    '  code=0; u=$(git -C "$d" config --includes --get remote.origin.url) || code=$?',
    '  [ "$code" -le 1 ] || exit "$code"',
    `  if [ -n "$u" ]; then printf '${SCAN_MARKER}\\t%s\\t%s\\n' "$d" "$u"; fi`,
    'done < "$scan_file.sorted"',
    "printf '__DSH_SCAN_DONE__\\n'",
  ].join('\n')
}

export function buildPowerShellGitScanScript(roots: readonly string[], maxDepth = DEFAULT_SCAN_DEPTH): string {
  const pruned = [...PRUNED_NAMES].map(quotePowerShell).join(',')
  return [
    "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)",
    "if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is unavailable' }",
    `$pruned = @(${pruned}); $seen = @{}; $maxDepth = ${scanDepth(maxDepth)}`,
    'function Scan-Git([string]$directory, [int]$depth) {',
    '  if ($seen.ContainsKey($directory) -and $seen[$directory] -le $depth) { return }; $seen[$directory]=$depth',
    '  $entries = @(Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop)',
    "  $dotGit = @($entries | Where-Object { $_.Name -eq '.git' })",
    '  if ($dotGit.Count -gt 0) {',
    "    $ErrorActionPreference='Continue'; & git -C $directory rev-parse --git-dir >$null 2>$null; $code=$LASTEXITCODE; $ErrorActionPreference='Stop'",
    "    if ($code -ne 0) { throw ('Invalid Git repository: ' + $directory) }",
    "    $ErrorActionPreference='Continue'; $u = & git -C $directory config --includes --get remote.origin.url 2>$null; $code=$LASTEXITCODE; $ErrorActionPreference='Stop'",
    "    if ($code -ne 0 -and $code -ne 1) { throw ('Git origin read failed: ' + $directory) }",
    `    if ($u) { Write-Output ('${SCAN_MARKER}' + [char]9 + $directory + [char]9 + ($u -join '')) }`,
    "    if ($depth -lt $maxDepth -and ($entries | Where-Object { $_.Name -eq '.wt' -and $_.PSIsContainer -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) })) { Scan-Git (Join-Path $directory '.wt') ($depth + 1) }",
    '    return',
    '  }',
    '  if ($depth -ge $maxDepth) { return }',
    '  foreach ($entry in $entries) {',
    "    if (-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { continue }",
    "    if (($entry.Name.StartsWith('.') -and $entry.Name -ne '.wt') -or $pruned -contains $entry.Name) { continue }",
    '    Scan-Git $entry.FullName ($depth + 1)',
    '  }',
    '}',
    ...roots.map(root => `if (-not (Test-Path -LiteralPath ${quotePowerShell(root)} -PathType Container)) { throw 'Invalid scan root' }; Scan-Git ${quotePowerShell(root)} 0`),
    "Write-Output '__DSH_SCAN_DONE__'",
  ].join('\n')
}

/** Parse `marker<TAB>path<TAB>origin` lines into repositories. */
export function parseGitScanOutput(stdout: string): ScannedRepository[] {
  const byPath = new Map<string, ScannedRepository>()
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(`${SCAN_MARKER}\t`)) continue
    const rest = line.slice(SCAN_MARKER.length + 1)
    const tab = rest.indexOf('\t')
    if (tab <= 0) continue
    const path = rest.slice(0, tab)
    const rawOrigin = rest.slice(tab + 1).trim()
    if (path === '' || rawOrigin === '') continue
    const gitRemote = normalizeGitRemote(rawOrigin)
    if (gitRemote === undefined) continue
    if (!byPath.has(path)) byPath.set(path, { path, rawOrigin, gitRemote })
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Scan one remote device over SSH. Failures are reported, never thrown: a
 * device that cannot be scanned must not look like a device with no projects.
 */
export async function scanRemoteGitRepos(
  transport: SshTransportConfig,
  roots: readonly string[],
  options: { readonly maxDepth?: number; readonly timeoutMs?: number } = {},
): Promise<{ ok: true; repos: ScannedRepository[] } | { ok: false; error: string }> {
  if (roots.length === 0) return { ok: true, repos: [] }
  try {
    const platform = await gitPlatformProbe.detect(transport)
    for (const root of roots) assertGitPathNamespace(root, platform)
    const depth = options.maxDepth ?? DEFAULT_SCAN_DEPTH
    const script = platform.shell === 'posix' ? buildGitScanScript(roots, depth) : buildPowerShellGitScanScript(roots, depth)
    const res = await execSshCommand(transport, encodeGitScript(platform, script), options.timeoutMs ?? 25_000)
    if (!res.ok) return { ok: false, error: res.error }
    if (!/^__DSH_SCAN_DONE__\r?$/m.test(res.stdout)) return { ok: false, error: 'Incomplete Git scan response' }
    return { ok: true, repos: parseGitScanOutput(res.stdout) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
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
  const byPath = new Map<string, ScannedRepository>()
  const visited = new Map<string, number>()

  const walk = (directory: string, depth: number): void => {
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
      const rawOrigin = discoverLocalGitRemote(directory, { originOnly: true, strict: true })
      if (rawOrigin !== undefined) {
        const gitRemote = normalizeGitRemote(rawOrigin)
        if (gitRemote !== undefined && !byPath.has(directory)) {
          byPath.set(directory, { path: directory, rawOrigin, gitRemote })
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
    try {
      if (!statSync(root).isDirectory()) throw new Error(`Scan root is not a directory: ${root}`)
    } catch (error) {
      throw new Error(`Unable to scan root ${root}: ${error instanceof Error ? error.message : String(error)}`)
    }
    walk(root, 0)
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
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

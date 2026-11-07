/**
 * Read-only Git repository scanning used by the manual Git match run.
 *
 * Discovery walks a small, explicit set of roots instead of assuming a
 * conventional `~/dev` layout: the user home plus the parent directory of every
 * workspace already registered on that device. Hidden directories are pruned,
 * so `.wt` worktrees and tool caches never become projects.
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
  return stepUp ? resolve(trimmed, '..') : resolve(trimmed)
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

/**
 * Build the POSIX shell snippet that lists every `.git` directory below the
 * roots with its `origin` URL. Directories with a `.git` *file* are worktrees
 * and are intentionally skipped: a worktree is a member of its main project,
 * not a project of its own.
 */
export function buildGitScanScript(roots: readonly string[], maxDepth = DEFAULT_SCAN_DEPTH): string {
  const depth = Math.max(1, Math.trunc(maxDepth)) + 1
  const rootList = roots.length > 0 ? roots.map(shellQuote).join(' ') : '"$HOME"'
  const prune = [...PRUNED_NAMES].map(name => `-name ${shellQuote(name)}`).join(' -o ')
  return [
    `set -eu`,
    `scan_file=$(mktemp) || exit 1`,
    `trap 'rm -f "$scan_file" "$scan_file.sorted"' EXIT HUP INT TERM`,
    `for root in ${rootList}; do`,
    `  [ -d "$root" ] || continue`,
    `  find "$root" -mindepth 1 -maxdepth ${String(depth)} \\( ${prune} \\) -prune -o -name '.*' ! -name '.git' -prune -o -type d -name '.git' -print >> "$scan_file" || exit 1`,
    `done`,
    `sort -u "$scan_file" > "$scan_file.sorted" || exit 1`,
    `trap 'rm -f "$scan_file" "$scan_file.sorted"' EXIT HUP INT TERM`,
    `while IFS= read -r g; do`,
    `  d=\${g%/.git}`,
    `  u=$(git -C "$d" config --get remote.origin.url 2>/dev/null || true)`,
    `  if [ -n "$u" ]; then printf '${SCAN_MARKER}\\t%s\\t%s\\n' "$d" "$u"; fi`,
    `done < "$scan_file.sorted"`,
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
    const path = rest.slice(0, tab).trim()
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
  const script = buildGitScanScript(roots, options.maxDepth ?? DEFAULT_SCAN_DEPTH)
  const res = await execSshCommand(transport, script, options.timeoutMs ?? 25_000)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, repos: parseGitScanOutput(res.stdout) }
}

/**
 * Scan the local machine. Uses the filesystem directly so it works on Windows
 * too, where the plugin has no POSIX shell guarantee.
 */
export function scanLocalGitRepos(
  roots: readonly string[],
  options: ScanOptions = {},
): ScannedRepository[] {
  const maxDepth = options.maxDepth ?? DEFAULT_SCAN_DEPTH
  const byPath = new Map<string, ScannedRepository>()
  const visited = new Set<string>()

  const walk = (directory: string, depth: number): void => {
    if (visited.has(directory)) return
    visited.add(directory)
    let entries: Dirent[]
    try {
      entries = readdirSync(directory, { withFileTypes: true }) as Dirent[]
    } catch {
      return
    }

    // `.git` as a directory is a checkout; a `.git` file is a worktree pointer
    // and stays a member of the main project instead of becoming its own.
    const hasDotGit = entries.some(entry => entry.name === '.git' && entry.isDirectory())
    if (hasDotGit) {
      const rawOrigin = discoverLocalGitRemote(directory, { originOnly: true })
      if (rawOrigin !== undefined) {
        const gitRemote = normalizeGitRemote(rawOrigin)
        if (gitRemote !== undefined && !byPath.has(directory)) {
          byPath.set(directory, { path: directory, rawOrigin, gitRemote })
        }
      }
      // A repository root is a leaf for our purposes: nested repositories under
      // it are not separate projects the user registered.
      return
    }

    if (depth >= maxDepth) return
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.')) continue
      if (PRUNED_NAMES.has(entry.name)) continue
      walk(join(directory, entry.name), depth + 1)
    }
  }

  for (const root of [...new Set(roots.map(r => resolve(r)))].sort()) {
    try {
      if (!statSync(root).isDirectory()) continue
    } catch {
      continue
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

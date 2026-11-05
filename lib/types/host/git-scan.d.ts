import { type SshTransportConfig } from '../contract.ts';
/** Default repository depth below a scan root (repo dir at depth <= maxDepth). */
export declare const DEFAULT_SCAN_DEPTH = 4;
/** A repository found on disk. */
export interface ScannedRepository {
    readonly path: string;
    readonly rawOrigin: string;
    readonly gitRemote: string;
}
export interface ScanOptions {
    /** Repository depth below each root. Defaults to {@link DEFAULT_SCAN_DEPTH}. */
    readonly maxDepth?: number;
    /** Extra roots appended after the derived ones. */
    readonly extraRoots?: readonly string[];
}
/**
 * Derive scan roots from a home directory and the workspace paths registered on
 * that device. Deepest parent first is irrelevant; roots are de-duplicated and
 * output is deterministic so a rerun scans the same set.
 */
export declare function deriveScanRoots(home: string | undefined, workspacePaths: readonly string[], extraRoots?: readonly string[]): string[];
/**
 * Build the POSIX shell snippet that lists every `.git` directory below the
 * roots with its `origin` URL. Directories with a `.git` *file* are worktrees
 * and are intentionally skipped: a worktree is a member of its main project,
 * not a project of its own.
 */
export declare function buildGitScanScript(roots: readonly string[], maxDepth?: number): string;
/** Parse `marker<TAB>path<TAB>origin` lines into repositories. */
export declare function parseGitScanOutput(stdout: string): ScannedRepository[];
/**
 * Scan one remote device over SSH. Failures are reported, never thrown: a
 * device that cannot be scanned must not look like a device with no projects.
 */
export declare function scanRemoteGitRepos(transport: SshTransportConfig, roots: readonly string[], options?: {
    readonly maxDepth?: number;
    readonly timeoutMs?: number;
}): Promise<{
    ok: true;
    repos: ScannedRepository[];
} | {
    ok: false;
    error: string;
}>;
/**
 * Scan the local machine. Uses the filesystem directly so it works on Windows
 * too, where the plugin has no POSIX shell guarantee.
 */
export declare function scanLocalGitRepos(roots: readonly string[], options?: ScanOptions): ScannedRepository[];
/**
 * Collapse repositories sharing one normalized origin to a single path.
 * The shortest path wins so a main checkout beats any deeper copy.
 */
export declare function primaryRepoByOrigin(repos: readonly ScannedRepository[]): Map<string, ScannedRepository>;

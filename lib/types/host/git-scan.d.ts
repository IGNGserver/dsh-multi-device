import { type SshTransportConfig } from '../contract.ts';
/** Default repository depth below a scan root (repo dir at depth <= maxDepth). */
export declare const DEFAULT_SCAN_DEPTH = 4;
export declare const DEFAULT_SCAN_REPOSITORY_LIMIT = 5000;
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
    /** Hard per-shard candidate cap; excess roots are reported as truncated. */
    readonly maxRepositories?: number;
    readonly signal?: AbortSignal;
    readonly onRepository?: (repository: ScannedRepository) => void;
}
/**
 * Derive scan roots from a home directory and the workspace paths registered on
 * that device. Deepest parent first is irrelevant; roots are de-duplicated and
 * output is deterministic so a rerun scans the same set.
 */
export declare function deriveScanRoots(home: string | undefined, workspacePaths: readonly string[], extraRoots?: readonly string[]): string[];
/** Scan only explicit roots; .wt is the sole hidden container traversed. */
export declare function buildGitScanScript(roots: readonly string[], maxDepth?: number, maxRepositories?: number): string;
export declare function buildPowerShellGitScanScript(roots: readonly string[], maxDepth?: number, maxRepositories?: number): string;
export interface GitScanProjection {
    readonly repos: ScannedRepository[];
    readonly complete: boolean;
    readonly truncated: boolean;
}
/** Parse both legacy lines and v2 NUL frames; completion is never inferred from records. */
export declare function parseGitScanProjection(stdout: string): GitScanProjection;
/** Backward-compatible repository-only projection for existing callers. */
export declare function parseGitScanOutput(stdout: string): ScannedRepository[];
/**
 * Scan one remote device over SSH. Failures are reported, never thrown: a
 * device that cannot be scanned must not look like a device with no projects.
 */
export type GitRepoScanResult = {
    ok: true;
    repos: ScannedRepository[];
    truncated?: boolean;
} | {
    ok: false;
    error: string;
    repos?: ScannedRepository[];
    truncated?: boolean;
};
/** Scan roots in cancellable shards with one overall deadline, retaining useful partial results. */
export declare function scanRemoteGitRepos(transport: SshTransportConfig, roots: readonly string[], options?: ScanOptions & {
    readonly timeoutMs?: number;
    readonly shardSize?: number;
}): Promise<GitRepoScanResult>;
/**
 * Scan the local machine. Uses the filesystem directly so it works on Windows
 * too, where the plugin has no POSIX shell guarantee.
 */
export declare function scanLocalGitRepos(roots: readonly string[], options?: ScanOptions): ScannedRepository[];
/** Async local scan used by Git Match; no synchronous directory walk blocks cancellation/UI progress. */
export declare function scanLocalGitReposAsync(roots: readonly string[], options?: ScanOptions): Promise<GitRepoScanResult>;
/**
 * Collapse repositories sharing one normalized origin to a single path.
 * The shortest path wins so a main checkout beats any deeper copy.
 */
export declare function primaryRepoByOrigin(repos: readonly ScannedRepository[]): Map<string, ScannedRepository>;

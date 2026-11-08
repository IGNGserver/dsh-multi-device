/**
 * Manual Git match run.
 *
 * Semantics:
 * 1. Read the `origin` of every workspace already registered on every device.
 * 2. A repository that at least one device has and another device lacks is a
 *    seed. Repositories every device already tracks are left alone.
 * 3. Scan each device once (home + registered workspace parents) and look for
 *    the seed origins on disk.
 * 4. Register a workspace on the device that has the repository but had not
 *    registered it yet. Nothing is cloned, synced or written to the project.
 *
 * The run never starts by itself: `DeviceRegistry.startGitMatch()` is the only
 * entry point, and every step reports progress so the UI can show a live task
 * plus the persisted last outcome.
 *
 * @module dsh-multi-device/host/git-match
 */
import { type DeviceConnectionState, type DeviceId, type GitMatchRun } from '../contract.ts';
import { type GitRepoScanResult, type ScannedRepository } from './git-scan.ts';
/** One device the run may read from or register a workspace on. */
export interface GitMatchDeviceTarget {
    readonly deviceId: DeviceId;
    readonly deviceName: string;
    readonly state: DeviceConnectionState;
    /** True for this DSH host, which needs no SSH round-trip. */
    readonly local: boolean;
    readonly home?: string;
    readonly workspacePaths: readonly string[];
}
/** Host services the runner needs; implemented by `DeviceRegistry`. */
export interface GitMatchContext {
    readonly devices: () => readonly GitMatchDeviceTarget[];
    /** Read `origin` for registered workspaces on a remote device, in one round-trip. */
    readonly discoverRemoteOrigins: (deviceId: DeviceId, paths: readonly string[], signal?: AbortSignal) => Promise<Map<string, string>>;
    /** Scan one remote device; resolves to an error string instead of throwing. */
    readonly scanRemoteRepos: (deviceId: DeviceId, roots: readonly string[], signal?: AbortSignal) => Promise<GitRepoScanResult>;
    readonly scanLocalRepos: (roots: readonly string[]) => ScannedRepository[];
    readonly scanLocalReposAsync?: (roots: readonly string[], signal?: AbortSignal) => Promise<GitRepoScanResult>;
    readonly createLocalWorkspace: (path: string) => Promise<{
        ok: true;
    } | {
        ok: false;
        error: string;
    }>;
    readonly createRemoteWorkspace: (deviceId: DeviceId, path: string) => Promise<{
        ok: true;
    } | {
        ok: false;
        error: string;
    }>;
    /** Cache a discovered origin so grouping sees it without another SSH call. */
    readonly noteOrigin: (deviceId: DeviceId, path: string, rawOrigin: string) => void;
    readonly localHome: () => string;
    readonly onProgress: (run: GitMatchRun) => void;
    readonly now?: () => number;
}
export declare function createIdleGitMatch(): GitMatchRun;
export declare class GitMatchRunner {
    private readonly ctx;
    private current;
    private cancelled;
    private active;
    private abortController;
    constructor(ctx: GitMatchContext);
    get state(): GitMatchRun;
    get running(): boolean;
    /** Abort the active scan/process; workspace creation finishes at its next safe point. */
    cancel(): boolean;
    private now;
    private emit;
    /** Execute the run. Resolves with the final state; never throws. */
    execute(): Promise<GitMatchRun>;
    /** Devices that are usable right now. Local always is; remotes need a live client. */
    private isReachable;
    /**
     * Read every registered workspace origin, then keep the repositories that at
     * least one device is missing.
     */
    private collectSeeds;
    private discoverLocalOrigins;
    private finish;
}
/** Best-effort repository name used as the workspace title on the target device. */
export declare function titleFromPath(path: string): string;

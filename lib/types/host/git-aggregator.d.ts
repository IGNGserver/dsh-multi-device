import { type DeviceConnectionState, type DeviceId, type LogicalWorkspaceView, type ManualWorkspaceRule, normalizeWorkspacePath, type SshTransportConfig, type WorkspaceAggregationConfig, type WorkspaceMemberRef } from '../contract.ts';
import { type GitRemotePlatform } from './git-platform.ts';
export interface PhysicalWorkspaceInput {
    readonly deviceId: DeviceId;
    readonly deviceName: string;
    readonly workspaceId: string;
    readonly path: string;
    readonly title: string;
    readonly sessionIds: readonly string[];
    readonly runningSessionCount: number;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly rawGitRemote?: string;
}
/**
 * Parse a `.git/config` INI body and extract the `remote "origin"` URL.
 *
 * `originOnly` keeps a repository identity tied to `origin`. Falling back to
 * the first remote would resolve `nas` backup remotes and split one repository
 * across devices, so scanning and matching always use `originOnly`.
 */
export declare function parseGitConfigRemoteUrl(configText: string, options?: {
    readonly originOnly?: boolean;
}): string | undefined;
/** Read origin through Git first (worktrees, includes and includeIf included).
 * The bounded config-file fallback supports unavailable Git / legacy metadata,
 * but never substitutes another remote for origin.
 */
export declare function discoverLocalGitRemote(directoryPath: string, options?: {
    readonly originOnly?: boolean;
    readonly strict?: boolean;
}): string | undefined;
/** Asynchronous origin reader used only by the bounded background cache queue.
 * Unlike manual discovery this never falls back to synchronous filesystem I/O.
 * A failed process rejects, preserving a previously known origin.
 */
export declare function discoverLocalGitRemoteAsync(directoryPath: string, signal?: AbortSignal): Promise<string | undefined>;
/** Build an origin-only batch for the interpreter selected by the capability probe. */
export declare function buildGitOriginScript(paths: readonly string[], platform: GitRemotePlatform): string;
/** Errors throw, rather than making a failed device look like an empty catalog. */
export declare function discoverRemoteGitRemotesViaSsh(transport: SshTransportConfig, paths: readonly string[], signal?: AbortSignal): Promise<Map<string, string>>;
export declare const DEFAULT_AGGREGATION_CONFIG: WorkspaceAggregationConfig;
/**
 * Pure aggregation engine: combines physical workspaces across devices into Logical Workspaces
 * and DSH `WorkspaceView` rows without touching any project files.
 */
export declare const GIT_REMOTE_POSITIVE_TTL_MS = 60000;
export declare const GIT_REMOTE_NEGATIVE_TTL_MS = 30000;
export interface GitRemoteCacheOptions {
    readonly now?: () => number;
    readonly positiveTtlMs?: number;
    readonly negativeTtlMs?: number;
    readonly localProbe?: (path: string) => Promise<string | undefined>;
    /** Concurrent paths, clamped to 2–4; each path runs commands sequentially. */
    readonly localConcurrency?: number;
    /** Called asynchronously only when an accepted probe changes cached metadata. */
    readonly onCacheChanged?: (deviceId: DeviceId, path: string, rawOrigin: string | undefined) => void;
}
export declare class WorkspaceAggregator {
    private readonly cacheOptions;
    private config;
    private readonly gitRemoteCache;
    private readonly localProbeJobs;
    private readonly localProbeQueue;
    private readonly localRetryAt;
    private activeLocalProbes;
    private localDrainScheduled;
    constructor(initialConfig?: Partial<WorkspaceAggregationConfig>, cacheOptions?: GitRemoteCacheOptions);
    getConfig(): WorkspaceAggregationConfig;
    setConfig(next: Partial<WorkspaceAggregationConfig>): WorkspaceAggregationConfig;
    upsertManualRule(rule: ManualWorkspaceRule): WorkspaceAggregationConfig;
    removeManualRule(ruleId: string): WorkspaceAggregationConfig;
    setMemberExcluded(memberKey: string, excluded: boolean): WorkspaceAggregationConfig;
    setPreferredDevice(logicalWorkspaceId: string, deviceId: DeviceId): WorkspaceAggregationConfig;
    setCustomTitle(logicalWorkspaceId: string, title: string): WorkspaceAggregationConfig;
    /** An explicit observation supersedes any queued or in-flight older read. */
    noteGitRemote(deviceId: DeviceId, path: string, rawGitRemote: string): void;
    /** Explicit invalidation also fences late async results; TTL alone retains stale data. */
    invalidateGitRemote(deviceId?: DeviceId, path?: string): void;
    private cacheNow;
    /** Snapshot-safe: memory only, with a deferred and deduplicated refresh request.
     * Neither an expired positive nor a transient failure splits a known group.
     */
    getCachedGitRemote(deviceId: DeviceId, path: string): string | undefined;
    private enqueueLocalProbe;
    private drainLocalProbes;
    private runLocalProbe;
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
    aggregate(physicalList: readonly PhysicalWorkspaceInput[], sessionUpdatedAtMap?: ReadonlyMap<string, number>, deviceStates?: ReadonlyMap<DeviceId, DeviceConnectionState>): {
        readonly logicalWorkspaces: LogicalWorkspaceView[];
        readonly allPhysicalWorkspaces: WorkspaceMemberRef[];
    };
    private buildLogicalView;
}
export { normalizeWorkspacePath };

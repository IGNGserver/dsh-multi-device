import { type DeviceConnectionState, type DeviceId, type LogicalWorkspaceView, type ManualWorkspaceRule, normalizeWorkspacePath, type SshTransportConfig, type WorkspaceAggregationConfig, type WorkspaceMemberRef } from '../contract.ts';
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
/**
 * Discover the raw Git remote URL of a local directory by walking up to find `.git/config`
 * (supports both normal `.git` directories and `.git` worktree pointer files).
 * Purely read-only and synchronous with zero child-process overhead.
 */
export declare function discoverLocalGitRemote(directoryPath: string, options?: {
    readonly originOnly?: boolean;
}): string | undefined;
/**
 * Batch-discover Git remote URLs for multiple paths on a remote SSH device in a single round-trip.
 * Read-only: runs `git -C <path> config --get remote.origin.url` for each path.
 */
export declare function discoverRemoteGitRemotesViaSsh(transport: SshTransportConfig, paths: readonly string[]): Promise<Map<string, string>>;
export declare const DEFAULT_AGGREGATION_CONFIG: WorkspaceAggregationConfig;
/**
 * Pure aggregation engine: combines physical workspaces across devices into Logical Workspaces
 * and DSH `WorkspaceView` rows without touching any project files.
 */
export declare class WorkspaceAggregator {
    private config;
    private readonly gitRemoteCache;
    constructor(initialConfig?: Partial<WorkspaceAggregationConfig>);
    getConfig(): WorkspaceAggregationConfig;
    setConfig(next: Partial<WorkspaceAggregationConfig>): WorkspaceAggregationConfig;
    upsertManualRule(rule: ManualWorkspaceRule): WorkspaceAggregationConfig;
    removeManualRule(ruleId: string): WorkspaceAggregationConfig;
    setMemberExcluded(memberKey: string, excluded: boolean): WorkspaceAggregationConfig;
    setPreferredDevice(logicalWorkspaceId: string, deviceId: DeviceId): WorkspaceAggregationConfig;
    setCustomTitle(logicalWorkspaceId: string, title: string): WorkspaceAggregationConfig;
    /** Record a discovered raw Git remote URL for `<deviceId>:<normalizedPath>`. */
    noteGitRemote(deviceId: DeviceId, path: string, rawGitRemote: string): void;
    getCachedGitRemote(deviceId: DeviceId, path: string): string | undefined;
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

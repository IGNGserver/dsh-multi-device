import { type DeviceId, type LogicalWorkspaceView, type ManualWorkspaceRule, normalizeWorkspacePath, type SshTransportConfig, type WorkspaceAggregationConfig, type WorkspaceMemberRef } from '../contract.ts';
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
 * Parse a `.git/config` INI body and extract `remote "origin"` URL (or the first `remote` URL).
 */
export declare function parseGitConfigRemoteUrl(configText: string): string | undefined;
/**
 * Discover the raw Git remote URL of a local directory by walking up to find `.git/config`
 * (supports both normal `.git` directories and `.git` worktree pointer files).
 * Purely read-only and synchronous with zero child-process overhead.
 */
export declare function discoverLocalGitRemote(directoryPath: string): string | undefined;
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
     */
    aggregate(physicalList: readonly PhysicalWorkspaceInput[], sessionUpdatedAtMap?: ReadonlyMap<string, number>): {
        readonly logicalWorkspaces: LogicalWorkspaceView[];
        readonly allPhysicalWorkspaces: WorkspaceMemberRef[];
    };
    private buildLogicalView;
}
export { normalizeWorkspacePath };

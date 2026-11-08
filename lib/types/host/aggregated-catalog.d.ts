import { type AggregatedCatalogView, type AggregatedSessionRow, type DeviceId, type LogicalWorkspaceView } from '../contract.ts';
export interface CatalogSummaryInput {
    readonly sessionId: string;
    readonly updatedAt?: number;
    readonly running?: boolean;
    readonly blank?: boolean;
    readonly cwd?: string;
    readonly parentSessionId?: string;
    readonly origin?: 'subagent';
    readonly projections?: {
        readonly values?: Record<string, unknown>;
    };
}
/** List projections are hints. Keep unknown shapes out of the sidebar, not out of other devices. */
export declare function catalogTitle(summary: CatalogSummaryInput): string;
export declare function catalogRow(id: string, deviceId: DeviceId, summary: CatalogSummaryInput, stale: boolean): AggregatedSessionRow;
/** Enforce referential closure in one snapshot, including incomplete/offline caches. */
export declare function buildAggregatedCatalog(revision: number, sessions: Record<string, AggregatedSessionRow>, workspaces: readonly LogicalWorkspaceView[], pinnedSessionIds: readonly string[], inputIssues?: Readonly<Record<string, string>>): AggregatedCatalogView;

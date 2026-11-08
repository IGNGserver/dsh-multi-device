import { type AggregatedSessionRow, type DeviceId, type LogicalWorkspaceView, type MultiDeviceSnapshot } from '../contract.ts';
import type { SessionsListSnapshotLike, SessionSummaryLike } from './clientServices.ts';
/** Only this adapter knows the extra public fields on official DSH summaries. */
export interface SidebarLocalSummary extends SessionSummaryLike {
    readonly title?: string;
    readonly updatedAt?: number;
    readonly running?: boolean;
    readonly parentSessionId?: string;
    readonly origin?: 'subagent';
}
export type ArchiveFilter = 'active' | 'archived' | 'all';
export interface SidebarSessionNode {
    readonly row: AggregatedSessionRow;
    readonly children: readonly SidebarSessionNode[];
}
export interface SidebarWorkspaceGroup {
    readonly id: string;
    readonly title: string;
    readonly workspace?: LogicalWorkspaceView;
    readonly sessions: readonly SidebarSessionNode[];
    readonly matchingCount: number;
}
export interface AggregatedSidebarModel {
    readonly rows: Readonly<Record<string, AggregatedSessionRow>>;
    readonly groups: readonly SidebarWorkspaceGroup[];
    readonly pinned: readonly AggregatedSessionRow[];
    readonly visibleCount: number;
}
export interface SidebarModelOptions {
    readonly query?: string;
    readonly archive?: ArchiveFilter;
    /** Explicit remote-content search results, unioned with title matches. */
    readonly contentSessionIds?: readonly string[];
    readonly local?: SessionsListSnapshotLike;
}
/** Navigation-only directory: remote rows never depend on the local Controller. */
export declare function buildAggregatedSidebarModel(snapshot: Pick<MultiDeviceSnapshot, 'catalog' | 'logicalWorkspaces' | 'archivedSessionIds'>, options?: SidebarModelOptions): AggregatedSidebarModel;
export interface SidebarDeviceChoice {
    readonly id: DeviceId;
    readonly name: string;
    readonly online: boolean;
}
export declare function sidebarDeviceChoices(snapshot: Pick<MultiDeviceSnapshot, 'devices'>, localName: string): SidebarDeviceChoice[];
/** Deterministic tree movement, shared with keyboard tests (does not wrap). */
export declare function sidebarFocusKey(keys: readonly string[], current: string | undefined, key: string): string | undefined;

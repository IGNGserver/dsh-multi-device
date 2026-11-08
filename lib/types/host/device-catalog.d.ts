import { type DeviceCatalogCache } from '../contract.ts';
import type { RemoteSessionSummary, RemoteWorkspaceItem } from './remote-client.ts';
export declare function isCatalogRecord(value: unknown): value is Record<string, unknown>;
export declare function catalogSessionIds(value: unknown): string[];
/** Validate rows independently; never coerce a remote identity or truthy running flag. */
export declare function parseSessionSummary(value: unknown, legacy?: boolean): RemoteSessionSummary | undefined;
export declare function parseWorkspace(value: unknown, legacy?: boolean): RemoteWorkspaceItem | undefined;
type Projection = {
    asOfSeq: number;
    values: Record<string, unknown>;
};
export interface CatalogProjectionUpdate {
    sessionId: string;
    key: string;
    value: unknown;
    seq: number;
}
/** Per-device facts/reducer. Transport owns IO/callbacks, never directory arrays. */
export declare class DeviceCatalog {
    private generation;
    private request;
    private flight;
    private rows;
    private workspaceRows;
    private archived;
    private pinned;
    private readonly projections;
    private readonly projectionSequences;
    private readonly projectionBaselines;
    private readyParts;
    private staleValue;
    private syncedAtValue;
    get epoch(): number;
    get stale(): boolean;
    get syncedAt(): number | undefined;
    get sessions(): readonly RemoteSessionSummary[];
    get workspaces(): readonly RemoteWorkspaceItem[];
    get archivedIds(): readonly string[];
    get pinnedIds(): readonly string[];
    get controlProjections(): ReadonlyMap<string, Projection>;
    get ready(): boolean;
    get eventsReady(): boolean;
    isCurrent(epoch: number): boolean;
    beginEpoch(): number;
    disconnect(): void;
    markEventsReady(epoch: number): void;
    markLive(epoch: number, legacy?: boolean): boolean;
    visibleSessions(): readonly RemoteSessionSummary[];
    hydrate(cache: DeviceCatalogCache): boolean;
    setArchivedIds(ids: readonly string[]): void;
    setPinnedIds(ids: readonly string[]): void;
    /** Replace validated facts without introducing a second transport-side table. */
    replaceSessions(items: readonly unknown[]): void;
    /** Explicit freshness override for hydration/test adapters; readiness stays independent. */
    setStale(stale: boolean): void;
    /** Single flight per epoch; an individual caller cannot cancel another caller's flight. */
    refreshSessions(epoch: number, load: () => Promise<unknown>, legacy?: boolean, signal?: AbortSignal, onBeforeCommit?: () => void): Promise<boolean>;
    applySessionEvent(epoch: number, event: string, args: readonly unknown[]): boolean;
    private withControlHints;
    private syncControlHints;
    private reduceSession;
    applyWorkspaceFrame(epoch: number, frame: unknown, legacy?: boolean): boolean;
    applyControlFrame(epoch: number, frame: unknown, namespace: (key: string, value: unknown) => unknown): CatalogProjectionUpdate[] | undefined;
}
export {};

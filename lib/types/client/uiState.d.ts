/**
 * Same-Host sidebar view-state sync.
 *
 * DSH persists `groupExpansion`/`groupBy`/`orderBy`/`archivedFilter` in
 * localStorage, so two browsers attached to one Host diverge even though the
 * Host owns everything else. This entry wraps the public `uiWorkspace.view`
 * actions, reports every user change to the Host, and applies the Host's
 * snapshot back through the same actions. Remote device pages use the injected
 * bridge for the same fields, so a remote tree is not treated as a local one.
 *
 * No DOM mutation and no private store handle: only actions DSH already
 * exposes. A missing `view` (older DSH) makes the whole entry inert.
 *
 * @module dsh-multi-device/client/uiState
 */
import { type WorkspaceViewState } from '../contract.ts';
import type { UiWorkspaceServiceLike } from './clientServices.ts';
declare function readPersistedView(): WorkspaceViewState | undefined;
declare function currentOrders(): Record<string, readonly string[]>;
export interface LocalUiStateSyncOptions {
    readonly uiWorkspace?: UiWorkspaceServiceLike;
    /** Current Host-owned state; undefined before the first Host snapshot. */
    readonly getHostState: () => WorkspaceViewState | undefined;
    /** Subscribe to Host snapshots. */
    readonly subscribeHostState: (listener: () => void) => () => void;
    /** Publish one browser report to the Host. */
    readonly report: (state: WorkspaceViewState) => void;
}
/** Install the local view-state bridge; idempotent per page. */
export declare function installLocalUiStateSync(options: LocalUiStateSyncOptions): () => void;
/** Exported for tests: the persisted read without touching DSH. */
export declare const __test: {
    readPersistedView: typeof readPersistedView;
    currentOrders: typeof currentOrders;
};
export {};

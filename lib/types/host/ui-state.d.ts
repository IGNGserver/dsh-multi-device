/**
 * Host-owned sidebar view state.
 *
 * DSH persists `groupExpansion`/`groupBy`/`orderBy`/`archivedFilter` in each
 * browser origin's localStorage. That makes the same Host look different in
 * two browsers, and the same remote device look different in two Controllers.
 * This module keeps one presentation record per scope in the plugin Host:
 *
 * - `local` is this Host's own DSH page (applied by the client entry).
 * - `remote:<key>` is one remote device page (applied by the injected bridge).
 *
 * Scope keys use the transport identity, not the per-Controller device ID, so
 * two Controllers that point at the same SSH host converge without sharing a
 * random local ID. Records are last-writer-wins per field with a compact HLC;
 * wall-clock skew therefore cannot resurrect an older fold state. Nothing here
 * contains Session bodies, workspace paths, or credentials.
 *
 * @module dsh-multi-device/host/ui-state
 */
import { type WorkspaceArchivedFilter, type WorkspaceGroupBy, type WorkspaceOrderBy, type WorkspaceViewState } from '../contract.ts';
export interface UiField<T> {
    readonly value: T;
    /** Hybrid logical clock: fixed-width wall ms, counter, Host id. */
    readonly at: string;
}
export interface UiScopeRecord {
    readonly groups: Record<string, UiField<boolean>>;
    readonly groupBy?: UiField<WorkspaceGroupBy>;
    readonly orderBy?: UiField<WorkspaceOrderBy>;
    readonly archivedFilter?: UiField<WorkspaceArchivedFilter>;
}
export interface UiStateDocument {
    readonly version: 1;
    readonly scopes: Record<string, UiScopeRecord>;
}
export declare const UI_STATE_VERSION = 1;
export declare const UI_SCOPE_LIMIT = 64;
export declare const UI_GROUP_LIMIT = 1000;
/** Fixed-width HLC; string order is causal order for a fixed Host id length. */
export declare function formatHlc(ms: number, counter: number, hostId: string): string;
export declare function isHlc(value: unknown): value is string;
/** Monotonic HLC source; `observe` folds a remote clock into the local one. */
export declare class HlcClock {
    private readonly hostId;
    private ms;
    private counter;
    constructor(hostId: string);
    next(now?: number): string;
    observe(value: unknown): void;
}
/** Parse a persisted/wire document; malformed content is ignored, never thrown. */
export declare function parseUiStateDocument(value: unknown): UiStateDocument | undefined;
/** Convert one record to the browser-facing shape. */
export declare function uiScopeState(record: UiScopeRecord | undefined): WorkspaceViewState | undefined;
/** Merge per field so two browsers folding different workspaces both survive. */
export declare function mergeUiScope(local: UiScopeRecord | undefined, remote: UiScopeRecord | undefined): UiScopeRecord | undefined;
/** Apply a browser report, stamping every changed field with a fresh HLC. */
export declare function patchUiScope(record: UiScopeRecord | undefined, patch: WorkspaceViewState, clock: HlcClock): UiScopeRecord;
/** Stable scope key for one remote device; transport identity, not local ID. */
export declare function remoteUiScopeKey(transport: {
    readonly kind: 'ssh' | 'direct';
    readonly host?: string;
    readonly username?: string;
    readonly port?: number;
    readonly baseUrl?: string;
}): string;
/** Normalize a browser patch without throwing. */
export declare function parseUiStatePatch(value: unknown): WorkspaceViewState | undefined;

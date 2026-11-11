/**
 * Passive controller-to-controller view-state files.
 *
 * Only Controllers install this plugin. Each Controller writes its own small
 * document into a connected remote's `$DSH_HOME/plugins/dsh-multi-device/views`
 * over the existing SSH transport; other Controllers reading the same remote
 * merge it. The remote never runs plugin code, never installs a daemon, and
 * only stores a bounded JSON file with fold/group/sort/archive-filter state.
 *
 * One file per Controller avoids read-modify-write races on a shared document.
 * Every field already carries an HLC, so a stale file cannot overwrite a newer
 * local observation.
 *
 * @module dsh-multi-device/host/ui-sync
 */
import type { UiScopeRecord, UiStateDocument } from './ui-state.ts';
export interface UiSyncDocument {
    readonly version: 1;
    readonly hostId: string;
    readonly updatedAt: number;
    readonly scopes: UiStateDocument['scopes'];
}
export declare const UI_SYNC_VERSION = 1;
export declare const UI_SYNC_SCOPE_LIMIT = 64;
/** Directory under one remote DSH home. `dshHome` must be POSIX. */
export declare function uiSyncDir(dshHome: string): string;
/** Parse one Controller file; malformed content is ignored. */
export declare function parseUiSyncDocument(value: unknown): UiSyncDocument | undefined;
/** Keep only remote-page scopes; the local page belongs to this Controller. */
export declare function collectRemoteScopes(scopes: ReadonlyMap<string, UiScopeRecord>): Record<string, UiScopeRecord>;
/** Read every Controller file from one directory; a missing directory is empty. */
export declare function buildReadUiSyncCommand(dir: string): string;
/** Atomically write this Controller's file; never touches another host's file. */
export declare function buildWriteUiSyncCommand(dir: string, hostId: string, scopes: Record<string, UiScopeRecord>): string;

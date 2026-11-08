/**
 * Optional cross-Host read-state file.
 *
 * A single DSH Host already shares unread state with every browser attached to
 * it. When the same user runs DSH on several machines, each Host has its own
 * data file, so this module lets every Host publish a tiny section into each
 * remote device's DSH home over the existing SSH transport. Sessions IDs and
 * timestamps and optional completion cursors only; message bodies never leave
 * the device. Version 1 remains readable by legacy Hosts.
 *
 * A matching completion read is monotonic, regardless of wall-clock skew.
 * Independent Hosts mint different UUIDs for the same execution: those tokens
 * cannot be ordered or used to clear the local current completion. Only legacy
 * entries without cursors use timestamp LWW. This is not cross-Host exactly-once.
 *
 * @module dsh-multi-device/host/shared-state
 */
import type { SessionReadState } from './read-state.ts';
export interface SharedReadEntry extends SessionReadState {
}
export interface SharedReadHostSection {
    readonly updatedAt: number;
    readonly sessions: Record<string, SharedReadEntry>;
}
export interface SharedReadDocument {
    readonly version: 1;
    readonly hosts: Record<string, SharedReadHostSection>;
}
export declare const SHARED_READ_STATE_VERSION = 1;
/** One pushed section stays far below the SSH command-line limit. */
export declare const SHARED_READ_SECTION_LIMIT = 300;
export declare const SHARED_READ_HOST_LIMIT = 20;
/** Parse and bound a state file; malformed content is ignored, never thrown. */
export declare function parseSharedReadDocument(text: string): SharedReadDocument | undefined;
/**
 * Merge Host sections, preserving the local completion identity and tombstones.
 * Same-token read wins even against a later unread; different tokens have no
 * ordering. Legacy entries retain timestamp LWW until cursorized.
 */
export declare function mergeSharedReadEntries(local: Readonly<Record<string, SharedReadEntry>>, doc: SharedReadDocument): Record<string, SharedReadEntry>;
/**
 * Write this Host's section while preserving every other Host's section.
 * Entries are capped by recency so the SSH command stays bounded.
 */
export declare function buildSharedReadDocument(existing: SharedReadDocument | undefined, hostId: string, sessions: Readonly<Record<string, SharedReadEntry>>, now: number): SharedReadDocument;
/** True for a POSIX DSH home path the plugin can address through `sh`. */
export declare function isPosixRemoteHome(remoteHome: string | undefined): boolean;
/** Path under the remote DSH home. `remoteHome` must be non-empty POSIX. */
export declare function sharedReadStatePath(remoteHome: string): string;
/** Read command; a missing file is an empty document, not a failure. */
export declare function buildReadSharedStateCommand(path: string): string;
/** Atomic write through a sibling temp file, with GNU/BSD base64 fallback. */
export declare function buildWriteSharedStateCommand(path: string, document: SharedReadDocument, hostId?: string): string;

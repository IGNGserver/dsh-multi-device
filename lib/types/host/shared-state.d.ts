/**
 * Optional cross-Host read-state file.
 *
 * A single DSH Host already shares unread state with every browser attached to
 * it. When the same user runs DSH on several machines, each Host has its own
 * data file, so this module lets every Host publish a tiny section into each
 * remote device's DSH home over the existing SSH transport. Sessions IDs and
 * timestamps only; message bodies never leave the device.
 *
 * The file is Host-versioned and merges per Session by the newest `at`
 * timestamp (reads win ties), which makes concurrent Hosts converge instead of
 * treating the last writer as authoritative for every Session.
 *
 * @module dsh-multi-device/host/shared-state
 */
export interface SharedReadEntry {
    readonly unread: boolean;
    readonly at: number;
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
 * Merge every Host section into the local Session map.
 *
 * Newest `at` wins; a read at the same instant wins over unread so two Hosts
 * clearing the same completion cannot resurrect the dot.
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
export declare function buildWriteSharedStateCommand(path: string, document: SharedReadDocument): string;

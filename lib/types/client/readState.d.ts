/**
 * Aggregated-mode unread overlay.
 *
 * DSH's `uiSession.sessionStatus` is the single hook the workspace browser,
 * search results and hover cards read. The overlay wraps that source in place
 * and replaces `completionUnread` for Session IDs with the Host-owned set
 * (local and remote alike; the Host tracks both). Patching the methods on the
 * existing source object (instead of replacing the service field) matters:
 * `uiSession` registers the source in the slot root once, and every consumer
 * already holds that object reference.
 *
 * @module dsh-multi-device/client/readState
 */
export interface SessionStatusValue {
    readonly running?: boolean;
    readonly pendingInteraction?: unknown;
    readonly completionUnread?: boolean;
}
export type SessionStatusMap = ReadonlyMap<string, SessionStatusValue>;
export interface SessionStatusSource {
    getSnapshot(): SessionStatusMap;
    subscribe(listener: () => void): () => void;
}
export interface ReadStateOverlayOptions {
    /** The local `uiSession.sessionStatus` source, when the shell provides it. */
    readonly source: SessionStatusSource | undefined;
    /** Current unread Session IDs, or undefined before the first Host snapshot. */
    readonly getUnread: () => ReadonlySet<string> | undefined;
    /** Subscribe to Host snapshot changes so the overlay invalidates its cache. */
    readonly subscribeReadState: (listener: () => void) => () => void;
    /** Whether the Host owns this Session's read state (local and remote). */
    readonly shouldOverride: (sessionId: string) => boolean;
}
/**
 * Merge the Host unread set into a DSH status snapshot.
 *
 * Entries whose `completionUnread` already matches keep their original object
 * identity, which keeps row memoization cheap. Local Sessions are copied
 * through untouched.
 */
export declare function mergeSessionStatus(base: SessionStatusMap | undefined, unread: ReadonlySet<string> | undefined, shouldOverride: (sessionId: string) => boolean): Map<string, SessionStatusValue>;
/**
 * Install the overlay. Returns an idempotent disposer that restores the
 * original source methods, so plugin reload/HMR never stacks wrappers.
 */
export declare function installReadStateOverlay(options: ReadStateOverlayOptions): () => void;

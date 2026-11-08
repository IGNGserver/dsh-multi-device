/**
 * Host-owned unread overlay for the local DSH shell.
 *
 * DSH's `uiSession.sessionStatus` is the single hook the workspace browser,
 * search results and hover cards read. The overlay wraps that source in place
 * and replaces `completionUnread` for Session IDs with the Host-owned set
 * (local and remote alike; the Host tracks both). Patching the methods on the
 * existing source object (instead of replacing the service field) matters:
 * `uiSession` registers the source in the slot root once, and every consumer
 * already holds that object reference. DSH 0.2.x has no public root-source
 * replacement API: provideRoot rejects duplicate names. The isolated adapter
 * below bridges pre-existing subscriptions via the real UiSession listener set;
 * it is deliberately private-version compatibility, not a fake source API.
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
    /** DSH 0.2.x compatibility bridge; receives new listeners to dedupe delivery. */
    readonly notifyExistingSubscribers?: (alreadyNotified: ReadonlySet<() => void>) => void;
}
/**
 * Verified against DSH 0.2.x UiSession lib/types: no public notify/replaceRoot
 * operation exists. Do not synthesize pending interactions or poll to wake UI.
 * This adapter alone touches the JS-public / TS-private statusListeners field.
 * Unsupported versions keep cold-start/new subscriptions working and explicitly
 * warn that hot activation requires a page reload rather than pretending success.
 */
export declare function existingSessionStatusNotifier(service: unknown): ReadStateOverlayOptions['notifyExistingSubscribers'];
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

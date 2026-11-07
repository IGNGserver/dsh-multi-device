/**
 * Host-owned remote Session read/unread state.
 *
 * DSH's own `completionUnread` set lives in each browser page's memory, so it
 * cannot answer "was this completion already read on another device?" The
 * registry keeps the authoritative copy here and publishes it in the snapshot;
 * native pages and the aggregated local page then overlay the same set.
 *
 * The tracker is deliberately transport- and UI-agnostic: it only understands
 * Session IDs and running transitions. The registry maps those to namespaced
 * remote IDs, persists them, and forwards changes to the native bridge.
 *
 * @module dsh-multi-device/host/read-state
 */
/** One Session's last read/unread transition. */
export interface SessionReadState {
    readonly unread: boolean;
    /** Epoch ms of the last transition; used to merge Hosts deterministically. */
    readonly at: number;
}
/** Called after a state transition; `unreadChanged` is false for a plain read touch. */
export type ReadStateChangeListener = (sessionId: string, state: SessionReadState, unreadChanged: boolean) => void;
/** Upper bound for remembered Session entries in one Host. */
export declare const READ_STATE_ENTRY_LIMIT = 2000;
/**
 * Tracks running transitions and read marks for namespaced remote Sessions.
 *
 * The tracker intentionally does not decide whether a Session is currently
 * visible; the registry and clients clear the set when a Session becomes the
 * main view. A completion that is already being watched is therefore cleared
 * on the next client snapshot, matching DSH's "main Session is read" rule.
 */
export declare class ReadStateTracker {
    private readonly onChange?;
    private readonly entries;
    private readonly running;
    constructor(onChange?: ReadStateChangeListener | undefined);
    /**
     * Observe one authoritative running-status transition.
     *
     * Only a real `true -> false` transition creates unread state. A first
     * `false` (for example a catalog row that was already finished at startup)
     * must not manufacture an unread reminder.
     */
    observeRunning(sessionId: string, running: boolean, now?: number): boolean;
    /** Mark a Session read; returns true when an unread marker was removed. */
    markRead(sessionId: string, now?: number): boolean;
    /**
     * Mark every matching Session read in one transition.
     *
     * The explicit "clear unread" action must not emit one snapshot revision per
     * reminder: read state is published as a set, so one unread change is enough
     * for every client and framed page to pick up the new state.
     *
     * @param predicate - return true to mark the Session read.
     * @returns the IDs whose unread marker was removed.
     */
    markManyRead(predicate: (sessionId: string) => boolean, now?: number): string[];
    /**
     * Merge one entry from another Host's shared file. The newest timestamp wins;
     * a read at the same instant wins over unread so a cleared dot cannot come
     * back merely because two Hosts replayed the same completion.
     */
    mergeEntry(sessionId: string, entry: SessionReadState): boolean;
    /** Mark a Session unread; returns true when it was not already unread. */
    markUnread(sessionId: string, now?: number): boolean;
    isUnread(sessionId: string): boolean;
    /** Sorted read state for the snapshot; deterministic for clients and tests. */
    unreadIds(): string[];
    /** Serializable durable representation. */
    entriesSnapshot(): Record<string, SessionReadState>;
    /**
     * Restore durable state. Invalid entries are ignored instead of crashing a
     * Host restart, and the result is capped like a live set.
     */
    hydrate(value: unknown): void;
    /** Forget one Session; a removed unread marker notifies like a read. */
    remove(sessionId: string): void;
    /**
     * Drop entries the caller can no longer observe.
     *
     * A deleted Session, a device that was removed, or a catalog that no longer
     * lists an id must not leave a badge behind: the unread count is a projection
     * of this set, and an orphaned entry can never be read again. Pruned unread
     * markers notify like a read so every client and framed page stops counting
     * them in the same revision.
     *
     * @param predicate - return true to keep the entry.
     * @returns number of unread markers that were dropped.
     */
    prune(predicate: (sessionId: string, state: SessionReadState) => boolean): number;
    /** Drop entries whose Session no longer belongs to a configured device. */
    retain(predicate: (sessionId: string) => boolean): void;
    /** Keep the most recently touched entries bounded. */
    trim(limit?: number): void;
    private setEntry;
}

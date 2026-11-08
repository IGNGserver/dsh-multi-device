export interface SessionReadState {
    readonly unread: boolean;
    /** Legacy merge/retention timestamp, never a completion identity or ordering. */
    readonly at: number;
    readonly completionId?: string;
    readonly readCompletionId?: string;
    readonly deleted?: true;
}
export interface ReadCompletionResult {
    readonly accepted: boolean;
    readonly currentCompletionId?: string;
    readonly unread: boolean;
}
/** The third flag requests snapshot publication (unread or completion identity changed). */
export type ReadStateChangeListener = (sessionId: string, state: SessionReadState, unreadChanged: boolean) => void;
export declare const READ_STATE_ENTRY_LIMIT = 2000;
/** Validate optional cursors without rejecting legacy version-1 entries. */
export declare function parseSessionReadState(value: unknown): SessionReadState | undefined;
/**
 * Local-first cursor merge, shared by the tracker and shared-file projection.
 * A retained tombstone is terminal. Different UUIDs cannot be compared by at.
 * Legacy LWW applies only until a Session acquires a completion cursor.
 */
export declare function mergeSessionReadState(current: SessionReadState | undefined, incoming: SessionReadState): SessionReadState;
/**
 * Every retained map is bounded, including running-only baselines and tombstones.
 * Eviction necessarily ends deduplication for that Session; callers must also
 * filter shared replay against an authoritative catalog when one is available.
 */
export declare class ReadStateTracker {
    private readonly onChange?;
    private readonly entries;
    /** Only true baselines need retention; absent and false are equivalent. */
    private readonly running;
    constructor(onChange?: ReadStateChangeListener | undefined);
    /** First false and duplicate false observations never mint a completion. */
    observeRunning(sessionId: string, running: boolean, now?: number): boolean;
    /** Optional expected token prevents an old page read from clearing a new run. */
    markRead(sessionId: string, now?: number, expectedCompletionId?: string): boolean;
    /** ACK acceptance is independent of whether an idempotent read changed a dot. */
    readCompletion(sessionId: string, expectedCompletionId: string, now?: number): ReadCompletionResult;
    /**
     * Rebind this exact finished completion to a caller-verified shared identity.
     * The registry must derive the identity from the same real terminal turn/end,
     * never from updatedAt. A racing run, deletion, or replacement rejects it.
     */
    promoteCompletion(sessionId: string, expectedCompletionId: string, sharedCompletionId: string): boolean;
    /**
     * Finish a legacy shared merge batch before publishing to token-aware clients.
     * Keeps low-level legacy LWW until explicitly called; emits one publication
     * for all migrations. Persist the returned ids' new metadata before restart.
     */
    migrateLegacyIds(): string[];
    /** One unread notification/revision, while preserving every per-Session cursor. */
    markManyRead(predicate: (sessionId: string) => boolean, now?: number): string[];
    mergeEntry(sessionId: string, entry: SessionReadState): boolean;
    /** Legacy/manual API: it cannot reopen an already cursorized completion. */
    markUnread(sessionId: string, now?: number): boolean;
    isUnread(sessionId: string): boolean;
    unreadIds(): string[];
    /** Includes already-read completions; clients need the identity for read ACKs. */
    completionIds(): Record<string, string>;
    /** Tombstones and both cursor fields survive persistence and shared replay. */
    entriesSnapshot(): Record<string, SessionReadState>;
    /**
     * Upgrade legacy unread once so token-aware native pages can acknowledge it.
     * The caller must persist entriesSnapshot after hydration: the `legacy:` UUID
     * is a compatibility read cursor, not a newly observed completion. Already-read
     * legacy entries stay legacy and keep their original LWW behavior.
     */
    hydrate(value: unknown): void;
    /** Keep a terminal tombstone so old shared unread cannot revive this id. */
    remove(sessionId: string, now?: number): void;
    /**
     * Only call with authoritative existence information. Offline/unknown/empty
     * catalogs are NOT evidence of deletion; the registry must guard that boundary.
     */
    prune(predicate: (sessionId: string, state: SessionReadState) => boolean): number;
    /** Config removal is deletion, not permission for stale shared replay. */
    retain(predicate: (sessionId: string) => boolean): void;
    trim(limit?: number): void;
    private setEntry;
}

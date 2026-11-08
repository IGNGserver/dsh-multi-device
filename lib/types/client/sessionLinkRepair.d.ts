/** Ids a Workspace row points at that the Session store cannot resolve. */
export interface SessionLinkGap {
    /** Distinct Session ids referenced by the current Workspace projection. */
    readonly referenced: number;
    /** Referenced ids with no summary in the browser's Session store. */
    readonly missing: number;
    /** Missing ids per owning device (`local` for plain local ids). */
    readonly byDevice: Readonly<Record<string, number>>;
    /** First few missing ids, for the Diagnostics report only. */
    readonly sample: readonly string[];
}
/** What the Diagnostics panel reports about the repair loop. */
export interface SessionLinkReport extends SessionLinkGap {
    /** Epoch ms of the last check. */
    readonly checkedAt: number;
    /** Connected devices at the last check. */
    readonly connectedDevices: number;
    /** Refreshes attempted in the current repair budget. */
    readonly attempts: number;
    /** Epoch ms of the last attempted `sessions.refresh()`. */
    readonly refreshedAt?: number;
    /** Last `sessions.refresh()` failure, kept so Diagnostics can show it. */
    readonly lastError?: string;
    /** Whether the last check found every referenced id resolvable. */
    readonly resolved: boolean;
    /**
     * The initial backoff budget is spent but ids are still missing: the loop
     * now retries at the persistent interval. Surfaced so the UI can tell
     * "healing soon" apart from "silently broken".
     */
    readonly exhausted: boolean;
}
/** Injectable side effects so the loop is testable without a browser. */
export interface SessionLinkRepairDeps {
    /** Compute the current gap from the projection and the Session store. */
    computeGap(): SessionLinkGap;
    /** Whether a refresh can help right now (Aggregated Mode with a live device). */
    canRepair(): {
        readonly ok: boolean;
        readonly connectedDevices: number;
    };
    /** Re-run DSH's `session.list` fetch. */
    refresh(): Promise<void>;
}
export interface SessionLinkRepairOptions {
    /** Delays between attempts. The length is the initial attempt budget. */
    readonly delaysMs?: readonly number[];
    /**
     * After the initial budget is spent, keep retrying at this interval instead
     * of giving up silently. A lost replay used to leave Workspaces empty until
     * the next device-state change; a persistent slow retry heals them no
     * matter when the Host finally projects the missing summaries.
     */
    readonly persistentRetryMs?: number;
    /** How many missing ids to keep in the report sample. */
    readonly maxSample?: number;
    readonly setTimeoutFn?: (fn: () => void, ms: number) => unknown;
    readonly clearTimeoutFn?: (handle: unknown) => void;
    readonly now?: () => number;
    /** Called after every check so the UI can react (diagnostics, toasts). */
    readonly onReport?: (report: SessionLinkReport) => void;
}
/** Backoff for a store that keeps answering with the same incomplete list. */
export declare const DEFAULT_REPAIR_DELAYS_MS: readonly number[];
/**
 * Compute the gap between a Workspace projection and the Session store.
 *
 * Archived Sessions stay in the store, and subagent children never render as
 * rows, so both are excluded from the referenced set before the comparison.
 */
export declare function computeSessionLinkGap(workspaces: readonly {
    readonly sessionIds: readonly string[];
}[], knownSessionIds: ReadonlySet<string> | Iterable<string>, options?: {
    readonly excludedSessionIds?: ReadonlySet<string>;
    readonly maxSample?: number;
}): SessionLinkGap;
/**
 * Watch the projection and keep asking DSH to refetch while ids are missing.
 *
 * One instance per browser generation. `noteChange()` is cheap and idempotent:
 * it only schedules work when the previous attempt finished or none is pending,
 * so a busy `$events` stream cannot turn the repair into a refresh storm.
 */
export declare class SessionLinkRepair {
    private readonly deps;
    private readonly delays;
    private readonly persistentRetryMs;
    private readonly maxSample;
    private readonly setTimeoutFn;
    private readonly clearTimeoutFn;
    private readonly now;
    private readonly onReport;
    private attempts;
    private refreshError;
    private timer;
    private inFlight;
    private disposed;
    private lastReport;
    constructor(deps: SessionLinkRepairDeps, options?: SessionLinkRepairOptions);
    /** Delay before the next attempt once the initial budget is spent. */
    private nextDelay;
    /** Recompute the gap and schedule a refresh when it is non-empty. */
    noteChange(): SessionLinkReport | undefined;
    /**
     * Forget attempted refreshes. Called when the inputs legitimately change —
     * a device connects, the mode switches, the user opens a Workspace — so a
     * later gap is retried even after the budget was spent.
     */
    resetBudget(): void;
    /** Stop every pending timer. */
    dispose(): void;
    /** Latest report, for the Diagnostics payload. */
    report(): SessionLinkReport | undefined;
    private check;
    private attempt;
}
/** Publish the browser generation's repair loop for the Diagnostics report. */
export declare function setActiveSessionLinkRepair(repair: SessionLinkRepair | undefined): void;
/** Read the active repair report (undefined outside a browser generation). */
export declare function readSessionLinkReport(): SessionLinkReport | undefined;
/** Owning device of a namespaced Session id, or `local` for a plain id. */
export declare function sessionOwnerKey(sessionId: string): string;

/** Pure, shared attention projection. No runtime or Node dependencies. */
export interface SessionAttentionFact {
    readonly sessionId: string;
    readonly deviceId: string;
    readonly running: boolean;
    readonly blank?: boolean;
    readonly origin?: string;
    readonly archived?: boolean;
    readonly pendingInteractionKind?: string;
    readonly pendingRequestCount?: number;
    readonly runningSubagentCount?: number;
}
/** Why one Session is counted as running: its own run, its children, or both. */
export interface RunningDetail {
    readonly self: boolean;
    readonly subagentCount: number;
}
export interface DeviceAttentionView {
    readonly eligibleSessionIds: string[];
    readonly runningSessionIds: string[];
    readonly pendingSessionIds: string[];
    readonly unreadSessionIds: string[];
    readonly pendingRequestCount: number;
    /** False means retained/partial data, not an authoritative zero. */
    readonly fresh: boolean;
    /**
     * Per-running-Session attribution, present only when at least one Session is
     * running. The menu and Diagnostics use it to explain a blue count that has
     * no visible running row of its own.
     */
    readonly runningDetails?: Readonly<Record<string, RunningDetail>>;
}
export interface AttentionPolicy {
    readonly currentSessionId?: string;
    readonly fresh?: boolean;
}
export declare function emptyDeviceAttention(fresh?: boolean): DeviceAttentionView;
/**
 * Merge duplicate catalog facts before classifying. Never truncate to a visible
 * sidebar page. `parentSessionId` deliberately plays no role: forks are roots
 * for attention purposes; only explicit subagent origin excludes a row.
 * Pending > running (including running children) > unread, exclusively.
 */
export declare function selectDeviceAttention(facts: readonly SessionAttentionFact[], unread: ReadonlySet<string>, policy?: AttentionPolicy): Record<string, DeviceAttentionView>;
/** All UI unread surfaces consume this exact union when the Host supplies it. */
export declare function attentionUnreadIds(byDevice: Readonly<Record<string, DeviceAttentionView>>): Set<string>;

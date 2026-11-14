/**
 * Client-side reactive store, SSE live synchronization, and control-plane RPC client.
 *
 * The Host owns the device list and read state; this store mirrors the Host
 * snapshot and maintains the LRU Keep-Alive set of device pages.
 * `activeNativeDeviceId === undefined` means the leftmost tab, 本机, which is
 * the unmodified local DSH page.
 *
 * @module dsh-multi-device/client/state
 */
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';
import { type DeviceConnectionState, DeviceId, type MultiDeviceSnapshot, type MultiDeviceUiPreferences, type SshKeyEntry, type UpsertDeviceInput, type WorkspaceViewState } from '../contract.ts';
import type { ControlPlaneRequest, DiagnosticsClientReport, MultiDeviceDiagnostics } from '../runtime.ts';
/**
 * Decide whether an incoming Host snapshot may replace the current one.
 *
 * `revision` only orders snapshots from one Host process; a restart resets it
 * to 1. When `hostEpoch` changes, the sequence starts over and the next
 * snapshot must be accepted even though its number is lower — otherwise a page
 * left open across a restart would drop every update and freeze its counts.
 * Older Hosts omit the epoch, in which case the plain revision comparison
 * applies.
 *
 * @param current - the snapshot the store currently holds.
 * @param next - the incoming snapshot.
 * @param force - accept an equal revision (initial load, error recovery, or an
 *   explicit device-tab override).
 */
export declare function shouldApplySnapshot(current: Pick<MultiDeviceSnapshot, 'revision' | 'hostEpoch'>, next: Pick<MultiDeviceSnapshot, 'revision' | 'hostEpoch'>, force?: boolean): boolean;
/** Map device connection lifecycle states to official DSH `StateDot` states. */
export declare function deviceStateToDotState(state: DeviceConnectionState): StateDotState;
/**
 * Browser-safe parser for shorthand SSH host specifications (`alias`, `user@host`,
 * `user@host:2222`, or `ssh://user@host:2222`).
 */
export declare function parseSshHostInput(raw: string): {
    readonly host: string;
    readonly username?: string;
    readonly port?: number;
};
export interface MultiDeviceClientState {
    readonly snapshot: MultiDeviceSnapshot;
    readonly loading: boolean;
    readonly error?: string;
    /** Selected device tab; `undefined` is the 本机 tab. */
    readonly activeNativeDeviceId?: DeviceId;
    /**
     * The local Session currently shown in the conversation pane. The Host uses
     * it to decide whether a completion lands on a conversation the user is
     * actually looking at.
     */
    readonly activeSessionId?: string;
    /** Devices whose Native Mode `<webview>` / `<iframe>` instances are kept alive in the DOM. */
    readonly keepAliveDeviceIds: readonly DeviceId[];
    /** Reload counter per deviceId for triggering iframe/webview reload without losing other devices. */
    readonly reloadCounters: Readonly<Record<string, number>>;
    /** Fallback settings modal open state when the host shell does not expose `sidebar.settings`. */
    readonly settingsModalOpen: boolean;
}
type ControlPlaneResult<T> = ({
    ok: true;
    value: T;
} | {
    ok: false;
    error: string;
}) & {
    stale?: true;
};
export declare class MultiDeviceClientStore {
    readonly clientId: string;
    private mainViewVisible;
    private state;
    private readonly listeners;
    private eventSource;
    private pollTimer;
    private sseRetryTimer;
    private sseAttempt;
    private started;
    private disposed;
    private lifecycleGeneration;
    private lifecycleAbort;
    private snapshotInFlight;
    private navigationGeneration;
    private connectionGeneration;
    private hostGeneration;
    private requestSequence;
    private readonly latestRequests;
    private readonly responseFences;
    /** Epochs are opaque identities, never lexically or numerically ordered. */
    private readonly retiredEpochs;
    private visibilityDocument;
    private readonly onVisibilityChange;
    /** Latest Session reported to the Host, used to dedupe mount/cleanup races. */
    private reportedSessionId;
    private hasReportedSession;
    private observedLocalMainSessionId;
    /** Ignore the unchanged background main view, not an actual local navigation. */
    reportLocalMainSession(sessionId: string): Promise<void>;
    private reportingSessionId;
    private activeSessionInFlight;
    /** Monotonic control-plane sequence so an older HTTP request cannot win. */
    private activeSessionSeq;
    private lastPollAt;
    /** Sessions for which this client already asked the Host to clear unread. */
    private readonly unreadClearInFlight;
    constructor();
    getSnapshot: () => MultiDeviceClientState;
    subscribe: (listener: () => void) => (() => void);
    private setState;
    private resetActiveSessionReport;
    private isFenceCurrent;
    private isResponseCurrent;
    start(): () => void;
    private stop;
    /** Final teardown (including HMR): a disposed store cannot be restarted. */
    dispose(): void;
    private connectSse;
    private applyIncomingSnapshot;
    /**
     * A completion can arrive while its conversation is already the main view.
     * The Host has no reliable cross-client presence signal, so every *visible*
     * viewing client clears the marker as soon as it sees it. The next snapshot
     * removes the dot everywhere; the round-trip is short enough to avoid a
     * lingering reminder and keeps the "main view is read" rule identical to
     * DSH's.
     *
     * A hidden tab must NOT clear: nobody is looking at it, so consuming the
     * unread marker would silently drop the only reminder the user had. The
     * visibilitychange handler clears it immediately when the tab becomes visible.
     */
    private clearUnreadForActiveSession;
    private activateNativeDevice;
    /**
     * Mount (and keep alive) one device frame without selecting its tab.
     * Idempotent; unknown/disabled devices are ignored.
     */
    ensureKeepAliveDevice(deviceId: DeviceId): void;
    /** Switch to a remote device tab. */
    selectNativeDevice(deviceId: DeviceId): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** Return to the 本机 tab. */
    selectLocalNativeTab(): void;
    /** Restore the local Session scope for the 本机 tab, even when none exists. */
    private enterLocalScope;
    releaseKeepAliveDevice(deviceId: DeviceId): void;
    reloadNativeDevice(deviceId: DeviceId): void;
    setSettingsModalOpen(open: boolean): void;
    /** The local mirror is mounted behind device tabs and global panels. */
    effectiveSessionId(): string | undefined;
    setMainViewVisible(visible: boolean): void;
    setActiveSession(sessionId: string | undefined): Promise<void>;
    /** Clear the scope only when the unmounting Session is still the reported one. */
    clearActiveSession(sessionId: string): void;
    private readCompletionId;
    /** Ask the Host to clear only the completion this browser actually observed. */
    markSessionRead(sessionId: string): Promise<boolean>;
    /**
     * Clear every unread marker owned by one device (本机 included).
     *
     * The per-Session read signal depends on a page the Host can observe. When a
     * device is read outside that path (another browser, or a native page whose
     * bridge never became ready), this is the explicit way out.
     */
    markDeviceRead(deviceId: DeviceId): Promise<{
        ok: boolean;
        changed: number;
        error?: string;
    }>;
    callControlPlane<T = unknown>(request: ControlPlaneRequest): Promise<ControlPlaneResult<T>>;
    refreshSnapshot(): Promise<void>;
    /**
     * Ask the Host for a support report. The browser contributes the geometry it
     * alone can see (viewport + Native Mode bar box), so a clipped mode switch is
     * visible in the copied report instead of being lost with the screenshot.
     */
    fetchDiagnostics(): Promise<{
        ok: true;
        value: MultiDeviceDiagnostics;
    } | {
        ok: false;
        error: string;
    }>;
    upsertDevice(input: UpsertDeviceInput): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /**
     * Force a fresh credential for one device. An optional launch URL/token
     * replaces the stored credential; without one the host re-runs the SSH
     * bootstrap so a rotated remote signing secret recovers automatically.
     */
    authenticateDevice(deviceId: DeviceId, credential?: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    removeDevice(deviceId: DeviceId): Promise<{
        ok: boolean;
        error?: string;
    }>;
    setDeviceEnabled(deviceId: DeviceId, enabled: boolean): Promise<{
        ok: boolean;
        error?: string;
    }>;
    reconnectDevice(deviceId: DeviceId): Promise<{
        ok: boolean;
        error?: string;
    }>;
    testDevice(input: UpsertDeviceInput): Promise<{
        ok: true;
        protocolVersion: string;
        remoteDshVersion?: string;
        latencyMs: number;
    } | {
        ok: false;
        error: string;
    }>;
    listSshKeys(): Promise<SshKeyEntry[]>;
    /**
     * Report this browser's DSH workspace view state to the Host.
     *
     * The Host stamps and republishes it to every attached browser; the page that
     * reported it also receives the snapshot, so applying it must be idempotent.
     */
    patchUiState(state: WorkspaceViewState): Promise<{
        ok: boolean;
        error?: string;
    }>;
    setUiPreferences(patch: Partial<MultiDeviceUiPreferences>): Promise<{
        ok: boolean;
        error?: string;
    }>;
}
/**
 * Browser-only geometry for a Diagnostics report.
 *
 * `undefined` outside a browser (SSR/test), so the Host falls back to its own
 * snapshot without inventing viewport numbers.
 */
export declare function collectClientDiagnosticsReport(): DiagnosticsClientReport | undefined;
export declare const clientStore: MultiDeviceClientStore;
export declare function useMultiDeviceState(): MultiDeviceClientState;
export {};

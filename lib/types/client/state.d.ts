/**
 * Client-side reactive store, SSE live synchronization, and control-plane RPC client.
 *
 * The Host owns the aggregated/native mode (it must, because it decides whether
 * remote workspaces and sessions are merged into the local DSH surface). This
 * store mirrors the host snapshot and maintains the LRU Keep-Alive set of
 * Native Mode device pages. `activeNativeDeviceId === undefined` means the
 * leftmost Native tab, 本机, which is the unmodified local DSH page.
 *
 * @module dsh-multi-device/client/state
 */
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';
import { type DeviceConnectionState, DeviceId, type DisplayMode, type ManualWorkspaceRule, type MultiDeviceSnapshot, type MultiDeviceUiPreferences, type RemoteSessionCreateInput, type RemoteWorkspaceCreateInput, type SshKeyEntry, type UpsertDeviceInput, type WorkspaceAggregationConfig } from '../contract.ts';
import type { ControlPlaneRequest, DiagnosticsClientReport, MultiDeviceDiagnostics } from '../runtime.ts';
export type HubTabId = 'native' | 'devices' | 'git';
/** Decode the owning device of a remote Session, or undefined for local/empty. */
export declare function remoteDeviceForSession(sessionId: string | undefined): DeviceId | undefined;
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
    /** Host-authoritative mode: `'aggregated'` (merged sidebar) or `'native'` (local page + device tabs). */
    readonly displayMode: DisplayMode;
    /** Selected remote device tab in Native Mode; `undefined` is the 本机 tab. */
    readonly activeNativeDeviceId?: DeviceId;
    /**
     * The Session currently shown in the conversation pane. The Host uses this to
     * scope the model catalog: a remote Session must expose exactly the owning
     * device's models, never a local/remote mix.
     */
    readonly activeSessionId?: string;
    /** Devices whose Native Mode `<webview>` / `<iframe>` instances are kept alive in the DOM. */
    readonly keepAliveDeviceIds: readonly DeviceId[];
    /** Reload counter per deviceId for triggering iframe/webview reload without losing other devices. */
    readonly reloadCounters: Readonly<Record<string, number>>;
    /** Active tab inside the Multi-Device Hub panel (retained for API compatibility). */
    readonly activeHubTab: HubTabId;
    /** Fallback settings modal open state when the host shell does not expose `sidebar.settings`. */
    readonly settingsModalOpen: boolean;
    /**
     * A remote Session to reopen after the next Aggregated Mode snapshot is
     * applied. Set when leaving a Native device tab so the mode switch returns to
     * the conversation the user was actually looking at.
     */
    readonly pendingAggregatedSessionId?: string;
}
declare class MultiDeviceClientStore {
    private state;
    private readonly listeners;
    private eventSource;
    private pollTimer;
    private sseRetryTimer;
    private sseAttempt;
    private started;
    /** Latest Session reported to the Host, used to dedupe mount/cleanup races. */
    private reportedSessionId;
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
    start(): () => void;
    private connectSse;
    private applyIncomingSnapshot;
    /**
     * A completion can arrive while its conversation is already the main view.
     * The Host has no reliable cross-client presence signal, so every viewing
     * client clears the marker as soon as it sees it. The next snapshot removes
     * the dot everywhere; the round-trip is short enough to avoid a lingering
     * reminder and keeps the "main view is read" rule identical to DSH's.
     */
    private clearUnreadForActiveSession;
    private activateNativeDevice;
    /**
     * Mount (and keep alive) one device frame for the aggregated Native Pane
     * without entering Native Mode. Idempotent; unknown/disabled devices are
     * ignored so a cached Session row cannot create a frame for a removed device.
     */
    ensureKeepAliveDevice(deviceId: DeviceId): void;
    /**
     * Switch modes through the Host. The Host persists the mode and immediately
     * stops/starts merging remote rows into the local surface; the resulting
     * snapshot is applied here. `targetDeviceId` selects a remote tab; omitting
     * it lands on 本机.
     */
    setDisplayMode(mode: DisplayMode, targetDeviceId?: DeviceId): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** Consume the remote Session captured when leaving Native Mode. */
    takePendingAggregatedSession(): string | undefined;
    /** Switch to a remote device tab, entering Native Mode if necessary. */
    selectNativeDevice(deviceId: DeviceId): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** Return to the 本机 tab while staying in Native Mode. */
    selectLocalNativeTab(): void;
    releaseKeepAliveDevice(deviceId: DeviceId): void;
    reloadNativeDevice(deviceId: DeviceId): void;
    setActiveHubTab(tab: HubTabId): void;
    setSettingsModalOpen(open: boolean): void;
    /**
     * Track the Session currently rendered in the conversation pane and report it
     * to the Host. The Host answers `session/modelCatalog` with exactly that
     * Session owner's catalog, so a remote conversation never mixes in local
     * models (and vice versa).
     */
    setActiveSession(sessionId: string | undefined): Promise<void>;
    /** Clear the scope only when the unmounting Session is still the reported one. */
    clearActiveSession(sessionId: string): void;
    /** Ask the Host to clear one Session's unread marker. */
    markSessionRead(sessionId: string): Promise<boolean>;
    callControlPlane<T = unknown>(request: ControlPlaneRequest): Promise<{
        ok: true;
        value: T;
    } | {
        ok: false;
        error: string;
    }>;
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
    createRemoteSession(input: RemoteSessionCreateInput): Promise<{
        ok: boolean;
        sessionId?: string;
        error?: string;
    }>;
    createRemoteWorkspace(input: RemoteWorkspaceCreateInput): Promise<{
        ok: boolean;
        error?: string;
    }>;
    updateAggregationConfig(patch: Partial<WorkspaceAggregationConfig>): Promise<{
        ok: boolean;
        error?: string;
    }>;
    upsertManualRule(rule: ManualWorkspaceRule): Promise<void>;
    removeManualRule(ruleId: string): Promise<void>;
    setMemberExcluded(memberKey: string, excluded: boolean): Promise<{
        ok: boolean;
        error?: string;
    }>;
    startGitMatch(): Promise<{
        ok: boolean;
        error?: string;
    }>;
    cancelGitMatch(): Promise<boolean>;
    /** Persist a display preference; the Host echoes the full snapshot back. */
    setUiPreferences(patch: Partial<MultiDeviceUiPreferences>): Promise<{
        ok: boolean;
        error?: string;
    }>;
    setPreferredDevice(logicalWorkspaceId: string, deviceId: DeviceId): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /**
     * Point a logical workspace at another device and open the New Session there.
     *
     * The Host registers the workspace path on a device that does not own it yet
     * (nothing is copied) and creates that Session itself. A device that already
     * owns the workspace only stores the preference; DSH's `startSession` then
     * creates through the aggregated gateway. The previous device keeps its blank
     * session, so an unsent draft is never copied or destroyed here.
     */
    switchNewSessionDevice(uiWorkspace: {
        startSession?: (workspaceId?: string) => void;
        openSession?: (sessionId: string) => void;
    } | undefined, logicalWorkspaceId: string, deviceId: DeviceId): Promise<{
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

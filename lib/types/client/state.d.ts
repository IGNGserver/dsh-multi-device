/**
 * Client-side reactive store, SSE live synchronization, and control-plane RPC client.
 *
 * Persists UI mode (`aggregated` vs `native`) and active device selection in `localStorage`,
 * and maintains the LRU Keep-Alive set of Native Mode device pages so switching between
 * Aggregated Mode and Native Mode never destroys loaded remote DSH pages.
 *
 * @module dsh-multi-device/client/state
 */
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';
import { type DeviceConnectionState, type DeviceId, type DisplayMode, type ManualWorkspaceRule, type MultiDeviceSnapshot, type RemoteSessionCreateInput, type RemoteWorkspaceCreateInput, type SshKeyEntry, type UpsertDeviceInput, type WorkspaceAggregationConfig } from '../contract.ts';
import type { ControlPlaneRequest } from '../runtime.ts';
export type HubTabId = 'native' | 'devices' | 'git';
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
    /** Current global mode: `'aggregated'` (unified sidebar) or `'native'` (full-window remote DSH Web UI). */
    readonly displayMode: DisplayMode;
    /** Currently selected device in Native Mode. */
    readonly activeNativeDeviceId?: DeviceId;
    /** Devices whose Native Mode `<webview>` / `<iframe>` instances are kept alive in the DOM. */
    readonly keepAliveDeviceIds: readonly DeviceId[];
    /** Reload counter per deviceId for triggering iframe/webview reload without losing other devices. */
    readonly reloadCounters: Readonly<Record<string, number>>;
    /** Active tab inside the Multi-Device Hub panel (retained for API compatibility). */
    readonly activeHubTab: HubTabId;
    /** Fallback settings modal open state when the host shell does not expose `sidebar.settings`. */
    readonly settingsModalOpen: boolean;
}
declare class MultiDeviceClientStore {
    private state;
    private readonly listeners;
    private eventSource;
    private pollTimer;
    private sseRetryTimer;
    private sseAttempt;
    private started;
    constructor();
    getSnapshot: () => MultiDeviceClientState;
    subscribe: (listener: () => void) => (() => void);
    private setState;
    start(): () => void;
    private connectSse;
    private applyIncomingSnapshot;
    setDisplayMode(mode: DisplayMode, targetDeviceId?: DeviceId): void;
    toggleDisplayMode(): void;
    selectNativeDevice(deviceId: DeviceId): void;
    releaseKeepAliveDevice(deviceId: DeviceId): void;
    reloadNativeDevice(deviceId: DeviceId): void;
    setActiveHubTab(tab: HubTabId): void;
    setSettingsModalOpen(open: boolean): void;
    callControlPlane<T = unknown>(request: ControlPlaneRequest): Promise<{
        ok: true;
        value: T;
    } | {
        ok: false;
        error: string;
    }>;
    refreshSnapshot(): Promise<void>;
    upsertDevice(input: UpsertDeviceInput): Promise<{
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
    setPreferredDevice(logicalWorkspaceId: string, deviceId: DeviceId): Promise<void>;
}
export declare const clientStore: MultiDeviceClientStore;
export declare function useMultiDeviceState(): MultiDeviceClientState;
export {};

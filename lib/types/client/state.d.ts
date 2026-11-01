import { type DeviceId, type DisplayMode, type ManualWorkspaceRule, type MultiDeviceSnapshot, type UpsertDeviceInput, type WorkspaceAggregationConfig } from '../contract.ts';
import type { ControlPlaneRequest } from '../runtime.ts';
export type HubTabId = 'native' | 'devices' | 'git';
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
    /** Active tab inside the Multi-Device Hub panel. */
    readonly activeHubTab: HubTabId;
    /** Whether the floating mode-switcher pill in `shell.overlay` is minimized. */
    readonly overlayCollapsed: boolean;
}
declare class MultiDeviceClientStore {
    private state;
    private readonly listeners;
    private eventSource;
    private pollTimer;
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
    setOverlayCollapsed(collapsed: boolean): void;
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
    removeDevice(deviceId: DeviceId): Promise<void>;
    reconnectDevice(deviceId: DeviceId): Promise<void>;
    testDevice(input: UpsertDeviceInput): Promise<{
        ok: true;
        protocolVersion: string;
        remoteDshVersion?: string;
        latencyMs: number;
    } | {
        ok: false;
        error: string;
    }>;
    updateAggregationConfig(patch: Partial<WorkspaceAggregationConfig>): Promise<void>;
    upsertManualRule(rule: ManualWorkspaceRule): Promise<void>;
    removeManualRule(ruleId: string): Promise<void>;
    setMemberExcluded(memberKey: string, excluded: boolean): Promise<void>;
    setPreferredDevice(logicalWorkspaceId: string, deviceId: DeviceId): Promise<void>;
}
export declare const clientStore: MultiDeviceClientStore;
export declare function useMultiDeviceState(): MultiDeviceClientState;
export {};

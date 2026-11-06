import { type IncomingMessage } from 'node:http';
import type { DeviceConfig, DeviceId, NativePaneState } from '../contract.ts';
import { DeviceAuthManager } from './auth.ts';
/**
 * Copy a client request onto the upstream connection.
 * The plugin supplies Cookie and Authorization itself; client values, proxy
 * headers, and `x-forwarded-*` are dropped so a page cannot smuggle credentials
 * or rewrite the remote's view of the caller.
 */
export declare function buildForwardHeaders(incoming: IncomingMessage['headers'], injected: {
    readonly host: string;
    readonly origin?: string;
    readonly cookie?: string;
    readonly authorization?: string;
}): Record<string, string | string[]>;
/** Bound and normalize a remote page title before it enters local window chrome. */
export declare function sanitizeBridgeTitle(value: unknown): string | undefined;
export interface NativeProxyHooks {
    /** Report the credential state observed while proxying a device. */
    readonly onAuthState?: (deviceId: DeviceId, state: 'ok' | 'required' | 'error', error?: string) => void;
    /** Report the injected Native Pane bridge lifecycle for one device. */
    readonly onBridgeState?: (deviceId: DeviceId, state: NativePaneState, error?: string) => void;
    /** Report the raw remote Session the framed page currently shows. */
    readonly onBridgeSelection?: (deviceId: DeviceId, sessionId: string | undefined) => void;
    /** Report the framed page's own `document.title` (empty means no title). */
    readonly onBridgeTitle?: (deviceId: DeviceId, title: string | undefined) => void;
    /** Report whether at least one framed page for this device is actually visible. */
    readonly onBridgeVisibility?: (deviceId: DeviceId, visible: boolean) => void;
    /** Persist the port a proxy actually bound, so the next restart keeps the origin. */
    readonly onPortAllocated?: (deviceId: DeviceId, port: number) => void;
    /** Last Host-owned workspace fold state for the bridge's first render. */
    readonly getGroupState?: (deviceId: DeviceId) => Readonly<Record<string, boolean>> | undefined;
    /** The framed page reported a fold change the Host should persist. */
    readonly onGroupState?: (deviceId: DeviceId, groups: Record<string, boolean>) => void;
    /** Raw remote Session IDs whose completion is unread on the Host. */
    readonly getUnreadState?: (deviceId: DeviceId) => readonly string[] | undefined;
    /** The framed page opened a Session and considers its unread marker read. */
    readonly onBridgeRead?: (deviceId: DeviceId, sessionId: string) => void;
}
/** Backwards-compatible alias for callers that only cared about auth hooks. */
export type NativeProxyAuthHooks = NativeProxyHooks;
export declare class NativeDeviceProxy {
    private device;
    private readonly getUpstreamBaseUrl;
    private readonly authManager;
    private readonly localOrigin?;
    private readonly hooks;
    private server;
    private localPort;
    private readonly sockets;
    private stopped;
    private lastAuthAttemptAt;
    private lastAuthRecoveryAt;
    private authRecoveryInFlight;
    private readonly token;
    private bridgeServer;
    private readonly bridgeClients;
    private bridgeState;
    private bridgeError;
    private bridgeSessionId;
    private bridgeTitle;
    private bridgeVisible;
    /** Per-bridge page visibility; the device is visible if any bridge is. */
    private readonly bridgeVisibility;
    private bridgeReadyTimer;
    private pendingOpenSession;
    /** Pane mode hides the remote sidebar; native full mode restores it. */
    private bridgeEmbedded;
    /** Host-owned workspace fold state, applied before the remote page's first render. */
    private groupState;
    /** Host-owned raw Session IDs whose completion is unread. */
    private unreadState;
    constructor(device: DeviceConfig, getUpstreamBaseUrl: () => string | undefined, authManager: DeviceAuthManager, localOrigin?: (() => string | undefined) | undefined, hooks?: NativeProxyHooks);
    updateDevice(device: DeviceConfig): void;
    private refreshHostState;
    proxyUrl(): string | undefined;
    private proxyOrigin;
    private allowedFramingAncestors;
    private isAllowedCallerOrigin;
    port(): number | undefined;
    start(preferredPort?: number): Promise<void>;
    stop(): void;
    /** Current bridge lifecycle, for the Host snapshot. */
    bridgeSnapshot(): {
        state: NativePaneState;
        error?: string;
        sessionId?: string;
    };
    /**
     * Ask the framed page to open one raw remote Session. The command is held
     * until the bridge reports readiness so a not-yet-loaded frame still lands on
     * the Session the aggregated sidebar selected.
     */
    openSession(sessionId: string): void;
    /** Ask the framed page to refresh its own Session list (after fork/create). */
    requestRefresh(): void;
    /** Switch the same framed page between embedded pane and full native mode. */
    setEmbedded(enabled: boolean): void;
    /** Apply Host-owned fold state to the framed page and every open client. */
    setGroupState(groups: Readonly<Record<string, boolean>>): void;
    /** Apply Host-owned unread state to the framed page. */
    setUnreadState(unreadSessionIds: readonly string[]): void;
    /** Reset the cached bridge command target (device switched away). */
    clearPendingSession(): void;
    private sendToBridge;
    private setBridgeState;
    private clearBridgeTimer;
    private armBridgeTimer;
    private handleHttp;
    /**
     * Buffer one HTML document, inject the bridge script and forward it.
     *
     * The response is held only for documents (the SPA shell); assets keep the
     * streaming path. Compression is normally already removed by
     * `accept-encoding: identity`, but a proxy in front of DSH may still compress,
     * so gzip/deflate/br are decoded before injection.
     */
    private streamInjectedHtml;
    /** Validate one same-origin bridge upgrade and hand it to the WebSocket server. */
    private handleBridgeUpgrade;
    /** Own one framed page's bridge socket, its readiness and its selection reports. */
    private attachBridge;
    private anyBridgeVisible;
    private updateBridgeVisibility;
    private resetBridgeSelection;
    private ensureAuthenticated;
    private recoverAuthentication;
    private respondAuthRequired;
    private handleUpgrade;
}
export declare class NativeProxyManager {
    private readonly authManager;
    private readonly localOrigin?;
    private readonly hooks;
    private readonly proxies;
    constructor(authManager: DeviceAuthManager, localOrigin?: (() => string | undefined) | undefined, hooks?: NativeProxyHooks);
    ensureProxy(device: DeviceConfig, getUpstreamBaseUrl: () => string | undefined): Promise<string | undefined>;
    proxyUrl(deviceId: DeviceId): string | undefined;
    /** Current injected-bridge lifecycle for one device. */
    bridgeSnapshot(deviceId: DeviceId): {
        state: NativePaneState;
        error?: string;
        sessionId?: string;
    };
    /** Navigate the framed page to one raw remote Session (queued until ready). */
    openSession(deviceId: DeviceId, sessionId: string): boolean;
    /** Ask the framed page to refresh its own Session catalog. */
    requestRefresh(deviceId: DeviceId): boolean;
    /** Toggle the remote sidebar for pane vs full native rendering. */
    setEmbedded(deviceId: DeviceId, enabled: boolean): void;
    /** Push Host-owned fold state to the device's framed page(s). */
    setGroupState(deviceId: DeviceId, groups: Readonly<Record<string, boolean>>): void;
    /** Push Host-owned unread Session IDs to the device's framed page(s). */
    setUnreadState(deviceId: DeviceId, unreadSessionIds: readonly string[]): void;
    removeProxy(deviceId: DeviceId): void;
    dispose(): void;
}

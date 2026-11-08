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
/** Messages the framed page's bridge can send to the proxy. */
export interface NativeBridgeNavigation {
    readonly sessionId: string;
    readonly requestSeq: number;
    readonly openState: 'loading' | 'open' | 'error';
    readonly error?: string;
}
/** Host acceptance only: this ACK does not promise synchronous disk persistence. */
export interface NativeBridgeReadResult {
    readonly accepted: boolean;
    readonly currentCompletionId?: string;
    readonly unread: boolean;
}
export interface NativeProxyHooks {
    /** Report the credential state observed while proxying a device. */
    readonly onAuthState?: (deviceId: DeviceId, state: 'ok' | 'required' | 'error', error?: string) => void;
    /** Report the injected Native Pane bridge lifecycle for one device. */
    readonly onBridgeState?: (deviceId: DeviceId, state: NativePaneState, error?: string, clientId?: string) => void;
    /** Report the raw remote Session the framed page currently shows. */
    readonly onBridgeSelection?: (deviceId: DeviceId, sessionId: string | undefined, clientId?: string) => void;
    /** History-open acknowledgement, independent from the UI selection report. */
    readonly onBridgeNavigation?: (deviceId: DeviceId, navigation: NativeBridgeNavigation, clientId?: string) => void;
    /** Report the framed page's own `document.title` (empty means no title). */
    readonly onBridgeTitle?: (deviceId: DeviceId, title: string | undefined, clientId?: string) => void;
    /** Report whether at least one framed page for this device is actually visible. */
    readonly onBridgeVisibility?: (deviceId: DeviceId, visible: boolean, clientId?: string) => void;
    /** Persist the port a proxy actually bound, so the next restart keeps the origin. */
    readonly onPortAllocated?: (deviceId: DeviceId, port: number) => void;
    /** Last Host-owned workspace fold state for the bridge's first render. */
    readonly getGroupState?: (deviceId: DeviceId) => Readonly<Record<string, boolean>> | undefined;
    /** The framed page reported a fold change the Host should persist. */
    readonly onGroupState?: (deviceId: DeviceId, groups: Record<string, boolean>) => void;
    /** Raw remote Session IDs whose completion is unread on the Host. */
    readonly getUnreadState?: (deviceId: DeviceId) => readonly string[] | undefined;
    /** Current completion tokens, including completions already read. */
    readonly getReadCompletions?: (deviceId: DeviceId) => Readonly<Record<string, string>> | undefined;
    /** Accept a read for precisely this completion (omitted token is legacy). */
    readonly onBridgeRead?: (deviceId: DeviceId, sessionId: string, expectedCompletionId?: string) => void | NativeBridgeReadResult;
}
/** Backwards-compatible alias for callers that only cared about auth hooks. */
export type NativeProxyAuthHooks = NativeProxyHooks;
export interface NativeBridgeSnapshot {
    state: NativePaneState;
    error?: string;
    sessionId?: string;
    title?: string;
}
export declare class NativeDeviceProxy {
    private device;
    private readonly getUpstreamBaseUrl;
    private readonly authManager;
    private readonly localOrigin?;
    private readonly hooks;
    private server;
    private startPromise;
    private startAbort;
    private generation;
    /** Includes requests waiting on authentication, HTTP streams and WS handshakes. */
    private readonly cancelUpstreams;
    private localPort;
    private readonly sockets;
    private stopped;
    private lastAuthAttemptAt;
    private lastAuthRecoveryAt;
    private authRecoveryInFlight;
    private readonly token;
    private bridgeServer;
    private readonly cookieName;
    private readonly bridgeClients;
    private readonly clientStates;
    private readonly bridgeVisibility;
    private readonly readyBridgeClients;
    /** Host-owned workspace fold state, applied before the remote page's first render. */
    private groupState;
    /** Host-owned raw Session IDs whose completion is unread. */
    private unreadState;
    private readCompletions;
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
    /** Keep recent disconnected panes/pending navigation without evicting live bridges. */
    private trimClientStates;
    private clientState;
    /** Current bridge lifecycle for this client only (legacy never aggregates). */
    bridgeSnapshot(clientId?: string): NativeBridgeSnapshot;
    /** Queue/replay navigation only within the requesting browser client. */
    openSession(sessionId: string, clientId?: string, requestSeq?: number): void;
    /** Ask the framed page to refresh its own Session list (after fork/create). */
    requestRefresh(): void;
    /** Switch the same framed page between embedded pane and full native mode. */
    setEmbedded(enabled: boolean, clientId?: string): void;
    /** Apply Host-owned fold state to the framed page and every open client. */
    setGroupState(groups: Readonly<Record<string, boolean>>): void;
    /** Apply Host-owned unread state to the framed page. */
    setUnreadState(unreadSessionIds: readonly string[], readCompletions?: Readonly<Record<string, string>>): void;
    /** Reset only this client's cached command target (device switched away). */
    clearPendingSession(clientId?: string): void;
    private sendToSocket;
    private sendToBridge;
    private setBridgeState;
    private clearBridgeTimer;
    private armBridgeTimer;
    private respondProxyError;
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
    private reportBridgeVisibility;
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
    bridgeSnapshot(deviceId: DeviceId, clientId?: string): NativeBridgeSnapshot;
    /** Navigate the framed page to one raw remote Session (queued until ready). */
    openSession(deviceId: DeviceId, sessionId: string, clientId?: string, requestSeq?: number): boolean;
    /** Ask the framed page to refresh its own Session catalog. */
    requestRefresh(deviceId: DeviceId): boolean;
    /** Toggle the remote sidebar for pane vs full native rendering. */
    setEmbedded(deviceId: DeviceId, enabled: boolean, clientId?: string): void;
    /** Push Host-owned fold state to the device's framed page(s). */
    setGroupState(deviceId: DeviceId, groups: Readonly<Record<string, boolean>>): void;
    /** Push Host-owned unread Session IDs to the device's framed page(s). */
    setUnreadState(deviceId: DeviceId, unreadSessionIds: readonly string[], readCompletions?: Readonly<Record<string, string>>): void;
    removeProxy(deviceId: DeviceId): void;
    dispose(): void;
}

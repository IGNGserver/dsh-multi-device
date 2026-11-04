import { type IncomingMessage } from 'node:http';
import type { DeviceConfig, DeviceId } from '../contract.ts';
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
export declare class NativeDeviceProxy {
    private device;
    private readonly getUpstreamBaseUrl;
    private readonly authManager;
    private readonly localOrigin?;
    private server;
    private localPort;
    private readonly sockets;
    private stopped;
    private lastAuthAttemptAt;
    private readonly token;
    constructor(device: DeviceConfig, getUpstreamBaseUrl: () => string | undefined, authManager: DeviceAuthManager, localOrigin?: (() => string | undefined) | undefined);
    updateDevice(device: DeviceConfig): void;
    proxyUrl(): string | undefined;
    private proxyOrigin;
    port(): number | undefined;
    start(): Promise<void>;
    stop(): void;
    private handleHttp;
    private handleUpgrade;
}
export declare class NativeProxyManager {
    private readonly authManager;
    private readonly localOrigin?;
    private readonly proxies;
    constructor(authManager: DeviceAuthManager, localOrigin?: (() => string | undefined) | undefined);
    ensureProxy(device: DeviceConfig, getUpstreamBaseUrl: () => string | undefined): Promise<string | undefined>;
    proxyUrl(deviceId: DeviceId): string | undefined;
    removeProxy(deviceId: DeviceId): void;
    dispose(): void;
}

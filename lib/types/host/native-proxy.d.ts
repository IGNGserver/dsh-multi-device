import type { DeviceConfig, DeviceId } from '../contract.ts';
import { DeviceAuthManager } from './auth.ts';
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

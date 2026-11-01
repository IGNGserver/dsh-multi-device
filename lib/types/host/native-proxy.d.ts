import type { DeviceConfig, DeviceId } from '../contract.ts';
import { DeviceAuthManager } from './auth.ts';
export declare class NativeDeviceProxy {
    private device;
    private readonly getUpstreamBaseUrl;
    private readonly authManager;
    private server;
    private localPort;
    private readonly sockets;
    private stopped;
    constructor(device: DeviceConfig, getUpstreamBaseUrl: () => string | undefined, authManager: DeviceAuthManager);
    updateDevice(device: DeviceConfig): void;
    proxyUrl(): string | undefined;
    port(): number | undefined;
    start(): Promise<void>;
    stop(): void;
    private handleHttp;
    private handleUpgrade;
}
export declare class NativeProxyManager {
    private readonly authManager;
    private readonly proxies;
    constructor(authManager: DeviceAuthManager);
    ensureProxy(device: DeviceConfig, getUpstreamBaseUrl: () => string | undefined): Promise<string | undefined>;
    proxyUrl(deviceId: DeviceId): string | undefined;
    removeProxy(deviceId: DeviceId): void;
    dispose(): void;
}

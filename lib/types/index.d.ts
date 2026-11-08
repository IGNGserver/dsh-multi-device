/**
 * `dsh-multi-device` Host Plugin Entry.
 *
 * Mounts:
 * 1. `DeviceRegistry`: persistent device registry, SSH tunnel supervisor, and
 *    the independent Native Mode reverse-proxy manager.
 * 2. `MultiDeviceControlPlane`: `/multi-device/api` and `/multi-device/events` SSE routes
 *    so the Client UI can manage devices, import `~/.ssh/config`, and drive the
 *    device tab strip. Nothing is injected into the local Session Controller:
 *    remote Sessions are only ever rendered by their own device's DSH page.
 *
 * @module dsh-multi-device
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-multi-device";
/**
 * Only require `webServer` as a hard Cordis injection so the plugin still loads
 * and provides the device tab strip even if higher-level controller services
 * change in future DSH releases.
 */
export declare const inject: string[];
export interface Config {
    /** Custom path to persist device config; defaults to the current Profile plugin storage. */
    readonly dataFile?: string;
    /** Custom path to persist device auth secrets; defaults to the current Profile plugin storage. */
    readonly secretsFile?: string;
    readonly features?: {
        /** Enable automatic SSH tunnel management. Default: true. */
        readonly sshTunnel?: boolean;
        /**
         * Expose the legacy HTTP(S) direct transport. SSH is the supported user
         * flow; direct exists only for advanced compatibility and tests.
         * Default: false.
         */
        readonly directTransport?: boolean;
    };
}
export declare const Config: import("@deepseek-ai/schemastery").Schema<{
    dataFile?: string | undefined;
    secretsFile?: string | undefined;
    features?: {
        sshTunnel?: boolean | undefined;
        directTransport?: boolean | undefined;
    } | undefined;
}, {
    dataFile: string;
    secretsFile: string;
    features: {
        sshTunnel: boolean;
        directTransport: boolean;
    };
}>;
export declare function apply(ctx: Context, config?: Config): void;
export * from './contract.ts';

/**
 * `dsh-multi-device` Host Plugin Entry.
 *
 * Mounts:
 * 1. `DeviceRegistry`: persistent device & Git workspace aggregation registry,
 *    SSH tunnel supervisor, and independent Native Mode reverse-proxy manager.
 * 2. `MultiDeviceControlPlane`: `/multi-device/api` and `/multi-device/events` SSE routes
 *    so the Client UI can manage devices, import `~/.ssh/config`, configure Git aggregation,
 *    and use Native Mode independently of Aggregated Mode.
 * 3. `AggregatedGateway`: attaches reversibly to `sessionController`, `workspaceController`,
 *    and `typertGateway` (with isolated failure containment so any incompatibility never
 *    impairs Native Mode or the host DSH instance).
 *
 * @module dsh-multi-device
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-multi-device";
/**
 * Only require `webServer` as a hard Cordis injection so the plugin still loads
 * and provides Native Mode even if higher-level controller services change in
 * future DSH releases.
 */
export declare const inject: string[];
export interface Config {
    /** Custom path to persist device & aggregation config; defaults to `$DSH_HOME/plugins/dsh-multi-device.json`. */
    readonly dataFile?: string;
    /** Custom path to persist device auth secrets; defaults to `$DSH_HOME/plugins/dsh-multi-device-secrets.json`. */
    readonly secretsFile?: string;
    readonly features?: {
        /** Enable Aggregated Mode (unified sidebar workspaces & sessions). Default: true. */
        readonly aggregatedMode?: boolean;
        /** Enable Native Mode local reverse-proxy & keep-alive viewport. Default: true. */
        readonly nativeMode?: boolean;
        /** Enable automatic SSH tunnel management. Default: true. */
        readonly sshTunnel?: boolean;
        /** Enable automatic Git remote workspace aggregation by default. Default: true. */
        readonly autoGitAggregate?: boolean;
    };
}
export declare const Config: import("@deepseek-ai/schemastery").Schema<{
    dataFile?: string | undefined;
    secretsFile?: string | undefined;
    features?: {
        aggregatedMode?: boolean | undefined;
        nativeMode?: boolean | undefined;
        sshTunnel?: boolean | undefined;
        autoGitAggregate?: boolean | undefined;
    } | undefined;
}, {
    dataFile: string;
    secretsFile: string;
    features: {
        aggregatedMode: boolean;
        nativeMode: boolean;
        sshTunnel: boolean;
        autoGitAggregate: boolean;
    };
}>;
export declare function apply(ctx: Context, config?: Config): void;
export * from './contract.ts';

/**
 * Shared contracts, wire protocols, and deterministic identity mapping between
 * the Host and Client halves of `dsh-multi-device`.
 *
 * Zero Node-only imports so both Node Host and Browser Client bundles can
 * import this module directly.
 *
 * @module dsh-multi-device/contract
 */
/** Branded string helper compatible with `@deepseek-ai/dsh-brand`. */
export type Branded<T extends string> = string & {
    readonly __brand?: T;
};
/** Unique identifier of a configured remote device (or `'local'` for this machine). */
export type DeviceId = Branded<'DeviceId'>;
export declare function DeviceId(id: string): DeviceId;
/** Reserved device identifier representing the local DSH host. */
export declare const LOCAL_DEVICE_ID: DeviceId;
/** UI display mode: unified sidebar aggregation vs full native remote Web UI. */
export type DisplayMode = 'aggregated' | 'native';
/** SSH tunnel implementation strategy. */
export type SshTunnelEngine = 'auto' | 'system-ssh' | 'ssh2';
/** SSH tunnel connection parameters. */
export interface SshTransportConfig {
    readonly kind: 'ssh';
    /** Hostname, IP, or Host alias defined in `~/.ssh/config`. */
    readonly host: string;
    /** SSH port; omitted uses `~/.ssh/config` Port or 22. */
    readonly port?: number;
    /** SSH username; omitted uses `~/.ssh/config` User or current OS user. */
    readonly username?: string;
    /** Optional explicit private key path (`~` supported); omitted uses `~/.ssh/config` / SSH agent / default keys. */
    readonly privateKeyPath?: string;
    /** Optional passphrase for encrypted private key (used with ssh2 engine). */
    readonly passphrase?: string;
    /** Optional ProxyJump specification (`user@jumphost:port`); omitted uses `~/.ssh/config`. */
    readonly proxyJump?: string;
    /** Remote loopback host where `dsh web` listens; defaults to `127.0.0.1`. */
    readonly remoteBindHost?: string;
    /** Remote port where `dsh web` listens; defaults to `3080`. */
    readonly remotePort?: number;
    /** Remote `$DSH_HOME` directory for auto-ssh credential bootstrap; defaults to `~/.dsh`. */
    readonly remoteDshHome?: string;
    /** Preferred SSH tunnel engine (`auto` prefers `system-ssh` for 100% `~/.ssh/config` fidelity). */
    readonly engine?: SshTunnelEngine;
}
/** Direct HTTP or HTTPS connection parameters. */
export interface DirectTransportConfig {
    readonly kind: 'direct';
    /** Base URL of the remote DSH Web server, e.g. `http://127.0.0.1:3081` or `https://dev.example.com:3080`. */
    readonly baseUrl: string;
    /** Whether to reject unauthorized TLS certificates on HTTPS connections; defaults to true. */
    readonly rejectUnauthorized?: boolean;
}
export type DeviceTransportConfig = SshTransportConfig | DirectTransportConfig;
/**
 * Authentication mode for reaching the remote DSH server:
 * - `'auto'`: tries existing persisted cookie -> launch token exchange -> SSH `.credentials.yaml` bootstrap -> unauthenticated (0.1.x).
 * - `'token'`: exchanges a `?token=...` launch URL or raw launch token for a persistent 30-day signed cookie.
 * - `'cookie'`: sends an explicit Cookie header (e.g. `dsh-auth-...=v1...`).
 * - `'bearer'`: sends `Authorization: Bearer <token>`.
 * - `'none'`: sends no authentication credentials (suitable for DSH 0.1.x behind SSH tunnel).
 */
export type DeviceAuthMode = 'auto' | 'token' | 'cookie' | 'bearer' | 'none';
export interface DeviceAuthConfig {
    readonly mode: DeviceAuthMode;
    /** Launch token, tokenized URL (`http://127.0.0.1:3080/?token=...`), Cookie value, or Bearer token. */
    readonly credential?: string;
}
/** Persisted configuration for one remote device. */
export interface DeviceConfig {
    readonly id: DeviceId;
    /** User-facing display name (e.g. `ubuntu-dev`, `macbook-pro`). */
    readonly name: string;
    /** Optional color tag or environment label (e.g. `Linux GPU`, `macOS`). */
    readonly label?: string;
    /** Whether this device is enabled for connection. */
    readonly enabled: boolean;
    /** Transport configuration (SSH tunnel recommended by default, or HTTP/S direct). */
    readonly transport: DeviceTransportConfig;
    /** Authentication configuration. */
    readonly auth: DeviceAuthConfig;
    /** Whether to keep Native Mode page alive in background once opened; defaults to true. */
    readonly keepNativeAlive?: boolean;
}
/** Input payload for adding or updating a device. */
export interface UpsertDeviceInput {
    readonly id?: string;
    readonly name: string;
    readonly label?: string;
    readonly enabled?: boolean;
    readonly transport: DeviceTransportConfig;
    readonly auth?: DeviceAuthConfig;
    readonly keepNativeAlive?: boolean;
}
/** Connection lifecycle state of a device. */
export type DeviceConnectionState = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'error';
/**Detected remote DSH wire protocol generation. */
export type RemoteProtocolVersion = '0.2' | '0.1' | 'unknown';
/** Live runtime telemetry and status of a device. */
export interface DeviceView {
    readonly id: DeviceId;
    readonly name: string;
    readonly label?: string;
    readonly enabled: boolean;
    readonly state: DeviceConnectionState;
    readonly transportKind: 'ssh' | 'direct';
    /** Display target summary, e.g. `ssh://root@10.0.0.5:22 -> 127.0.0.1:3080` or `https://dev.internal:3080`. */
    readonly targetSummary: string;
    /** Effective local URL when tunnel is up or direct URL. */
    readonly effectiveBaseUrl?: string;
    /**
     * Dedicated local loopback reverse-proxy URL (`http://127.0.0.1:<port>/`) for Native Mode.
     * Pre-authenticated and header-normalized so `<webview>` and `<iframe>` load the remote DSH Web UI directly.
     */
    readonly nativeProxyUrl?: string;
    readonly keepNativeAlive: boolean;
    readonly protocolVersion: RemoteProtocolVersion;
    readonly remoteDshVersion?: string;
    readonly remoteHome?: string;
    readonly latencyMs?: number;
    readonly connectedAt?: number;
    readonly lastError?: string;
    readonly reconnectAttempt: number;
    readonly sessionCount: number;
    readonly runningSessionCount: number;
    readonly pendingApprovalCount: number;
    readonly workspaceCount: number;
}
/** Parsed entry from the user's `~/.ssh/config`. */
export interface SshConfigHostEntry {
    /** Alias from `Host <alias>`. */
    readonly alias: string;
    /** Effective `HostName` (defaults to `alias`). */
    readonly hostName: string;
    readonly user?: string;
    readonly port?: number;
    readonly identityFile?: string;
    readonly proxyJump?: string;
    readonly proxyCommand?: string;
    readonly forwardAgent?: boolean;
    readonly sourceFile: string;
}
/** Origin reference of a physical workspace on a specific device. */
export interface WorkspaceMemberRef {
    readonly deviceId: DeviceId;
    readonly deviceName: string;
    readonly remoteWorkspaceId: string;
    readonly path: string;
    readonly title: string;
    /** Normalized Git remote identity (`github.com/org/repo`) when discovered. */
    readonly gitRemote?: string;
    /** Raw Git remote URL (`git@github.com:org/repo.git`) when discovered. */
    readonly rawGitRemote?: string;
    readonly sessionCount: number;
    readonly runningSessionCount: number;
}
/** Manual workspace aggregation rule configured by the user. */
export interface ManualWorkspaceRule {
    readonly id: string;
    /** Display title for this logical workspace. */
    readonly title: string;
    /** Explicit member keys (`<deviceId>:<path>`) bound into this logical workspace. */
    readonly memberKeys: readonly string[];
    /** Optional Git remote key (`github.com/org/repo`) to also match into this group. */
    readonly gitRemote?: string;
    /** Preferred device ID when clicking "+ New Session" on this logical workspace. */
    readonly preferredDeviceId?: DeviceId;
}
/** Persisted Git & manual workspace aggregation settings. */
export interface WorkspaceAggregationConfig {
    /** Whether to automatically merge workspaces across devices that share the same Git remote. Default: true. */
    readonly autoGitAggregate: boolean;
    /** Whether unmatched remote workspaces should be prefixed with `[DeviceName]`. Default: true. */
    readonly prefixUnmatchedWithDevice: boolean;
    /** Member keys (`<deviceId>:<path>`) explicitly excluded from automatic Git aggregation. */
    readonly excludedMemberKeys: readonly string[];
    /** Preferred target device ID per logical workspace ID (`md-lws~...`) for "+ New Session". */
    readonly preferredDeviceByLogicalId: Readonly<Record<string, DeviceId>>;
    /** Custom display titles per logical workspace ID (`md-lws~...`). */
    readonly customTitleByLogicalId: Readonly<Record<string, string>>;
    /** User-defined manual aggregation rules. */
    readonly manualRules: readonly ManualWorkspaceRule[];
}
/** Computed Logical Workspace view for the UI and sidebar tree. */
export interface LogicalWorkspaceView {
    /** Workspace ID exposed in the merged sidebar tree. */
    readonly logicalWorkspaceId: string;
    readonly title: string;
    /** Aggregation source: `'git'` (auto-matched by Git remote), `'manual'` (user rule), or `'single'` (unmerged single-device workspace). */
    readonly kind: 'git' | 'manual' | 'single';
    /** Canonical normalized Git remote (`github.com/org/repo`), if any. */
    readonly gitRemote?: string;
    /** Device ID where "+ New Session" will create a session. */
    readonly targetDeviceId: DeviceId;
    /** Target path on `targetDeviceId` where "+ New Session" will create a session. */
    readonly targetPath: string;
    /** All physical device workspace members belonging to this logical workspace. */
    readonly members: readonly WorkspaceMemberRef[];
    /** All merged session IDs (with remote IDs namespaced) in display order. */
    readonly sessionIds: readonly string[];
    readonly createdAt: string;
    readonly updatedAt: string;
}
/** Metadata about a session's device ownership, exposed to client UI badges & hover cards. */
export interface SessionOriginMetadata {
    readonly namespacedSessionId: string;
    readonly rawSessionId: string;
    readonly deviceId: DeviceId;
    readonly deviceName: string;
    readonly deviceState: DeviceConnectionState;
    readonly cwd?: string;
    readonly gitRemote?: string;
    readonly logicalWorkspaceId?: string;
    readonly running: boolean;
    readonly pendingInteractionKind?: 'approval' | 'question' | 'plan-review';
    readonly nativeUrl?: string;
}
/** Complete Hub snapshot returned to the Client UI. */
export interface MultiDeviceSnapshot {
    readonly revision: number;
    readonly hostStatus: {
        readonly aggregatedGatewayActive: boolean;
        readonly aggregatedGatewayError?: string;
        readonly nativeProxyActive: boolean;
    };
    readonly devices: readonly DeviceView[];
    readonly sshConfigHosts: readonly SshConfigHostEntry[];
    readonly aggregationConfig: WorkspaceAggregationConfig;
    readonly logicalWorkspaces: readonly LogicalWorkspaceView[];
    readonly allPhysicalWorkspaces: readonly WorkspaceMemberRef[];
    readonly sessionOrigins: Readonly<Record<string, SessionOriginMetadata>>;
}
/**
 * Encode a `(deviceId, remoteSessionId)` pair into a collision-free local `SessionId`.
 * Local sessions keep their original `SessionId` untouched.
 *
 * Uses `~` as delimiter because `~` is permitted by DSH's `ENDPOINT_SEGMENT_PATTERN`
 * and never appears in standard UUID-based `session-<uuid>` identifiers.
 * Any `~` or `%` inside `deviceId` is percent-escaped so decoding is 100% lossless.
 *
 * @param deviceId - owning device id.
 * @param remoteSessionId - raw session id on that device.
 * @returns namespaced session id.
 */
export declare function encodeRemoteSessionId(deviceId: DeviceId, remoteSessionId: string): string;
/**
 * Decode a possibly-namespaced `SessionId` into its owning `deviceId` and raw `remoteSessionId`.
 *
 * @param sessionId - candidate session id from the browser or host.
 * @returns `{ deviceId, rawSessionId, isRemote }`.
 */
export declare function decodeSessionId(sessionId: string): {
    readonly deviceId: DeviceId;
    readonly rawSessionId: string;
    readonly isRemote: boolean;
};
/**
 * Encode a `(deviceId, remoteWorkspaceId)` pair into a single-device workspace ID.
 */
export declare function encodeRemoteWorkspaceId(deviceId: DeviceId, remoteWorkspaceId: string): string;
/**
 * Decode a single-device workspace ID.
 */
export declare function decodeRemoteWorkspaceId(workspaceId: string): {
    readonly deviceId: DeviceId;
    readonly rawWorkspaceId: string;
    readonly isRemote: boolean;
};
/**
 * Mint a stable logical workspace ID for a Git remote or manual aggregation rule.
 */
export declare function encodeLogicalWorkspaceId(kind: 'git' | 'manual', key: string): string;
/**
 * Decode a logical workspace ID (`md-lws~git~...` or `md-lws~manual~...`).
 */
export declare function decodeLogicalWorkspaceId(workspaceId: string): {
    readonly kind: 'git' | 'manual';
    readonly key: string;
} | undefined;
/**
 * Encode a remote `$events` waterfall `eventId` so `/api/$events/result` can route the user's
 * approval or question answer back to the exact remote device and active `$events` stream.
 */
export declare function encodeRemoteEventId(deviceId: DeviceId, remoteEventId: string): string;
/**
 * Decode a remote `$events` waterfall `eventId`.
 */
export declare function decodeRemoteEventId(eventId: string): {
    readonly deviceId: DeviceId;
    readonly remoteEventId: string;
} | undefined;
/** Build a canonical member key `<deviceId>:<normalizedPath>`. */
export declare function workspaceMemberKey(deviceId: DeviceId, path: string): string;
/** Normalize POSIX and Windows directory paths for comparison without touching filesystem. */
export declare function normalizeWorkspacePath(rawPath: string): string;
/**
 * Normalize any Git remote URL (`git@github.com:org/repo.git`, `https://github.com/org/repo.git`,
 * `ssh://git@gitlab.example.com:2222/group/sub/repo/`) into a canonical repository key
 * (`github.com/org/repo`).
 *
 * Returns `undefined` when the input is not a recognizable Git remote URL.
 */
export declare function normalizeGitRemote(rawUrl: string | undefined | null): string | undefined;

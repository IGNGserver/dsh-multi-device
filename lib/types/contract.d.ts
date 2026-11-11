/**
 * Shared contracts, wire protocols, and deterministic identity mapping between
 * the Host and Client halves of `dsh-multi-device`.
 *
 * Zero Node-only imports so both Node Host and Browser Client bundles can
 * import this module directly.
 *
 * @module dsh-multi-device/contract
 */
import type { DeviceAttentionView } from './attention.ts';
/** Branded string helper compatible with `@deepseek-ai/dsh-brand`. */
export type Branded<T extends string> = string & {
    readonly __brand?: T;
};
/** Unique identifier of a configured remote device (or `'local'` for this machine). */
export type DeviceId = Branded<'DeviceId'>;
export declare function DeviceId(id: string): DeviceId;
/** Reserved device identifier representing the local DSH host. */
export declare const LOCAL_DEVICE_ID: DeviceId;
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
    /** Remote `$DSH_HOME` directory used only when bootstrap is explicitly enabled; defaults to `~/.dsh`. */
    readonly remoteDshHome?: string;
    /**
     * When true, `auto` reads the remote `.credentials.yaml` over SSH and mints a
     * browser cookie. The signing secret itself is never persisted. The device
     * form turns this on for SSH + auto. Omit it (or set false) to keep `auto`
     * limited to a saved cookie or a pasted launch token.
     */
    readonly bootstrapFromRemoteCredentials?: boolean;
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
 * - `'auto'`: saved cookie, then a pasted launch token, then (SSH only, when `bootstrapFromRemoteCredentials` is set) a cookie minted from the remote `.credentials.yaml`. The form enables that read for SSH devices. Unauthenticated 0.1.x still works when none of those yield a credential.
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
    /**
     * Preferred loopback port for this device's native reverse proxy. Persisted
     * after the first allocation so the proxy origin (and the remote page's
     * localStorage) survives Host restarts.
     */
    readonly nativeProxyPort?: number;
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
/**
 * Lifecycle of the injected Native Pane bridge for one device.
 *
 * `loading` means the framed remote page was served and the bridge socket has
 * not reported readiness yet; `failed` is a version/CSP incompatibility (the
 * client then falls back to the local mirror), not a device outage.
 */
export type NativePaneState = 'idle' | 'loading' | 'ready' | 'failed';
/** Live runtime telemetry and status of a device. */
export type DeviceAuthState = 'unknown' | 'ok' | 'required' | 'error';
export interface DeviceView {
    readonly id: DeviceId;
    readonly name: string;
    readonly label?: string;
    readonly enabled: boolean;
    readonly state: DeviceConnectionState;
    /** Native-mode authentication state of the current credential (never carries secrets). */
    readonly authState?: DeviceAuthState;
    /** Human-readable reason when `authState` is `required` or `error`. */
    readonly authError?: string;
    readonly transportKind: 'ssh' | 'direct';
    /** Sanitized SSH transport fields for the edit form (never includes a passphrase). */
    readonly ssh?: {
        readonly host: string;
        readonly port?: number;
        readonly username?: string;
        readonly privateKeyPath?: string;
        readonly proxyJump?: string;
        readonly remotePort?: number;
        readonly remoteDshHome?: string;
        /** Whether auto auth may mint a cookie from the remote signing secret. */
        readonly bootstrapFromRemoteCredentials?: boolean;
        readonly engine?: SshTunnelEngine;
    };
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
    /**
     * Whether this device has a live event stream. DSH 0.1 is list-only: the
     * client polls session and workspace lists and does not follow history.
     */
    readonly realtime: boolean;
    readonly remoteDshVersion?: string;
    readonly remoteHome?: string;
    readonly latencyMs?: number;
    readonly connectedAt?: number;
    readonly lastError?: string;
    /**
     * Why this device's summaries were dropped from the merged `session.list`.
     *
     * The merged list is one RPC: before failure isolation, a single device that
     * could not be projected failed the whole call, so the browser kept its old
     * (local-only) Session store and every remote Workspace expanded empty. The
     * offending device is reported here instead.
     */
    readonly sessionListError?: string;
    readonly reconnectAttempt: number;
    /**
     * Sessions the sidebar can actually render. Archived rows (collapsed by
     * default) and subagent children (nested under their parent) are excluded, so
     * the tab bar and the sidebar agree; {@link allSessionCount} keeps the raw
     * catalog total for Diagnostics.
     */
    readonly sessionCount: number;
    /** Running Sessions among {@link sessionCount}; the raw total is {@link allRunningSessionCount}. */
    readonly runningSessionCount: number;
    /** Every catalog row, including archived and subagent Sessions. */
    readonly allSessionCount?: number;
    /** Every running catalog row; can exceed {@link runningSessionCount} when a subagent is active. */
    readonly allRunningSessionCount?: number;
    readonly pendingApprovalCount: number;
    readonly workspaceCount: number;
    /**
     * Epoch ms when the device catalog was last synced successfully. Present on
     * cached rows too, so an offline device can say "last synced 12:30" instead
     * of pretending the list is live.
     */
    readonly lastSyncedAt?: number;
    /** True while `sessions`/`workspaces` come from the persisted catalog cache (no live baseline yet). */
    readonly catalogStale?: boolean;
    /**
     * Injected device-page bridge state. `ready` means the framed remote page
     * captured its own services and reported its current Session.
     */
    readonly nativePaneState?: NativePaneState;
    /** Why the bridge failed (version/CSP), never a device transport error. */
    readonly nativePaneError?: string;
    /** Raw remote Session the framed page currently shows, for no-flash switching. */
    readonly nativePaneSessionId?: string;
    /**
     * The framed page's own `document.title`, reported by the bridge. The client
     * uses it for the window/taskbar title while that device is the active tab.
     */
    readonly nativePaneTitle?: string;
}
/** One cached remote Session summary; projections are never persisted. */
export interface CachedSessionSummary {
    readonly sessionId: string;
    readonly updatedAt: number;
    readonly agentAvailable: boolean;
    readonly running: boolean;
    readonly blank: boolean;
    readonly parentSessionId?: string;
    readonly origin?: 'subagent';
    readonly cwd?: string;
}
/** One cached remote workspace entry. */
export interface CachedWorkspace {
    readonly workspaceId: string;
    readonly path: string;
    readonly title: string;
    readonly sessionIds: readonly string[];
    readonly createdAt: string;
    readonly updatedAt: string;
}
/**
 * Last-known catalog of one remote device, persisted in the plugin data file.
 *
 * An offline device tab must still report the counts it had when it was last
 * reachable instead of pretending to have zero; the live client keeps the same
 * data in memory, and this type is the durable mirror. It never carries
 * projections, pending interactions, or credentials.
 */
export interface DeviceCatalogCache {
    readonly deviceId: DeviceId;
    /** Epoch ms of the last successful baseline. */
    readonly syncedAt: number;
    readonly protocolVersion: RemoteProtocolVersion;
    readonly sessions: readonly CachedSessionSummary[];
    readonly workspaces: readonly CachedWorkspace[];
    readonly archivedSessionIds: readonly string[];
    readonly pinnedSessionIds: readonly string[];
    /**
     * True when this cache was cut down to the persistence limits, i.e. the
     * last-known counts are known to be missing older Sessions after a restart.
     */
    readonly catalogTruncated?: boolean;
}
/** A local private key discovered under `~/.ssh` for the device form. */
export interface SshKeyEntry {
    /** Absolute path on the local machine, e.g. `~/.ssh/id_ed25519` (expanded). */
    readonly path: string;
    /** Basename shown in the picker. */
    readonly name: string;
    /** Matching public key path when present. */
    readonly publicKeyPath?: string;
    /** Whether the private key material is passphrase-protected. */
    readonly encrypted: boolean;
    /** True when the file has group/other permission bits (ssh will reject it). */
    readonly permissionsTooOpen: boolean;
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
/** Display preferences persisted by the Host. */
export interface MultiDeviceUiPreferences {
    /**
     * Publish read/unread state into each SSH device's DSH home so separate DSH
     * Hosts can converge. Off by default: it writes a small, non-secret file on
     * the remote device and is only needed when several Hosts own the same
     * remote Sessions.
     */
    readonly crossHostReadState: boolean;
    /**
     * Replace the window/taskbar title with the aggregate of every device's
     * Session status, using exactly the three categories the tab capsule shows
     * (needs reply, running, finished-unread). Off by default: the title then
     * keeps naming the conversation on screen, which is what a single-window
     * desktop expects. A category with no members is omitted, and an all-zero
     * aggregate leaves the title to DSH.
     */
    readonly taskbarSummary: boolean;
}
/** Complete Hub snapshot returned to the Client UI. */
export interface MultiDeviceSnapshot {
    readonly revision: number;
    /** Stable Host identity used to detect self-loops across any hostname/IP. */
    readonly hostId?: string;
    /**
     * Random identity of this Host process, regenerated on every start.
     *
     * `revision` restarts at 1 when the Host boots, so a browser page that stayed
     * open across a restart would otherwise drop every new snapshot as "older"
     * and freeze all counts. A changed epoch tells the Client to accept the new
     * sequence instead of comparing it with the previous process's numbers.
     */
    readonly hostEpoch?: string;
    readonly devices: readonly DeviceView[];
    readonly sshConfigHosts: readonly SshConfigHostEntry[];
    /**
     * Sessions whose completion has not been read since. Local Session IDs are
     * plain; remote ones are namespaced. The Host owns the set so every browser
     * client and every device tab agree on read state.
     */
    readonly unreadSessionIds: readonly string[];
    /** Opaque completion identities; read requests may only consume the identity they observed. */
    readonly readCompletions?: Readonly<Record<string, string>>;
    /** Shared sidebar-policy projection, including local; members make badges explainable. */
    readonly attentionByDevice?: Readonly<Record<string, DeviceAttentionView>>;
    /**
     * Titles for the remote Sessions named in {@link attentionByDevice}.
     *
     * A remote conversation lives inside a cross-origin device page, so the local
     * Session store cannot name it. The Host already holds each device's catalog
     * titles, so it joins the ones an attention menu can open. Only those IDs are
     * published — never whole catalogs, and never local IDs (the browser store
     * names those itself). Keys are namespaced (`md~<device>~<raw>`). Optional so
     * a newer Client still parses older Host snapshots.
     */
    readonly sessionTitles?: Readonly<Record<string, string>>;
    /**
     * Sessions archived on their owning device. Local Session IDs are plain;
     * remote ones are namespaced. DSH hides archived rows by default, so the
     * unread counters subtract this set instead of reporting reminders the
     * sidebar cannot show. Optional so a newer Client still parses older Host
     * snapshots.
     */
    readonly archivedSessionIds?: readonly string[];
    /**
     * Subagent-origin Sessions. DSH nests them under their parent Session's
     * catalog instead of rendering standalone rows, so unread counters subtract
     * them for the same reason as {@link archivedSessionIds}.
     */
    readonly subagentSessionIds?: readonly string[];
    /** Persisted display preferences; optional so older Hosts still parse. */
    readonly ui?: MultiDeviceUiPreferences;
}
/** True when a Session ID is already namespaced by `dsh-multi-device`. */
export declare function isNamespacedSessionId(sessionId: string): boolean;
/** True when an Event ID is already namespaced by `dsh-multi-device`. */
export declare function isNamespacedEventId(eventId: string): boolean;
/** Waterfall interactions the host tracks per remote device. */
export type PendingInteractionKind = 'approval' | 'question' | 'plan-review';
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
 * Encode a remote `$events` waterfall `eventId` so `/api/$events/result` can route the user's
 * approval or question answer back to the exact remote device and active `$events` stream.
 *
 * The remote part is opaque and appended verbatim; an id that already looks
 * namespaced is rejected by {@link decodeRemoteEventId} rather than routed as
 * another device's waterfall.
 */
export declare function encodeRemoteEventId(deviceId: DeviceId, remoteEventId: string): string;

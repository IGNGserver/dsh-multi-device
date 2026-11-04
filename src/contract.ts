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
export type Branded<T extends string> = string & { readonly __brand?: T }

/** Unique identifier of a configured remote device (or `'local'` for this machine). */
export type DeviceId = Branded<'DeviceId'>
export function DeviceId(id: string): DeviceId {
  return id as DeviceId
}

/** Reserved device identifier representing the local DSH host. */
export const LOCAL_DEVICE_ID = 'local' as DeviceId

/** UI display mode: unified sidebar aggregation vs full native remote Web UI. */
export type DisplayMode = 'aggregated' | 'native'

/** SSH tunnel implementation strategy. */
export type SshTunnelEngine = 'auto' | 'system-ssh' | 'ssh2'

/** SSH tunnel connection parameters. */
export interface SshTransportConfig {
  readonly kind: 'ssh'
  /** Hostname, IP, or Host alias defined in `~/.ssh/config`. */
  readonly host: string
  /** SSH port; omitted uses `~/.ssh/config` Port or 22. */
  readonly port?: number
  /** SSH username; omitted uses `~/.ssh/config` User or current OS user. */
  readonly username?: string
  /** Optional explicit private key path (`~` supported); omitted uses `~/.ssh/config` / SSH agent / default keys. */
  readonly privateKeyPath?: string
  /** Optional passphrase for encrypted private key (used with ssh2 engine). */
  readonly passphrase?: string
  /** Optional ProxyJump specification (`user@jumphost:port`); omitted uses `~/.ssh/config`. */
  readonly proxyJump?: string
  /** Remote loopback host where `dsh web` listens; defaults to `127.0.0.1`. */
  readonly remoteBindHost?: string
  /** Remote port where `dsh web` listens; defaults to `3080`. */
  readonly remotePort?: number
  /** Remote `$DSH_HOME` directory used only when bootstrap is explicitly enabled; defaults to `~/.dsh`. */
  readonly remoteDshHome?: string
  /**
   * When true, `auto` reads the remote `.credentials.yaml` over SSH and mints a
   * browser cookie. The signing secret itself is never persisted. The device
   * form turns this on for SSH + auto. Omit it (or set false) to keep `auto`
   * limited to a saved cookie or a pasted launch token.
   */
  readonly bootstrapFromRemoteCredentials?: boolean
  /** Preferred SSH tunnel engine (`auto` prefers `system-ssh` for 100% `~/.ssh/config` fidelity). */
  readonly engine?: SshTunnelEngine
}

/** Direct HTTP or HTTPS connection parameters. */
export interface DirectTransportConfig {
  readonly kind: 'direct'
  /** Base URL of the remote DSH Web server, e.g. `http://127.0.0.1:3081` or `https://dev.example.com:3080`. */
  readonly baseUrl: string
  /** Whether to reject unauthorized TLS certificates on HTTPS connections; defaults to true. */
  readonly rejectUnauthorized?: boolean
}

export type DeviceTransportConfig = SshTransportConfig | DirectTransportConfig

/**
 * Authentication mode for reaching the remote DSH server:
 * - `'auto'`: saved cookie, then a pasted launch token, then (SSH only, when `bootstrapFromRemoteCredentials` is set) a cookie minted from the remote `.credentials.yaml`. The form enables that read for SSH devices. Unauthenticated 0.1.x still works when none of those yield a credential.
 * - `'token'`: exchanges a `?token=...` launch URL or raw launch token for a persistent 30-day signed cookie.
 * - `'cookie'`: sends an explicit Cookie header (e.g. `dsh-auth-...=v1...`).
 * - `'bearer'`: sends `Authorization: Bearer <token>`.
 * - `'none'`: sends no authentication credentials (suitable for DSH 0.1.x behind SSH tunnel).
 */
export type DeviceAuthMode = 'auto' | 'token' | 'cookie' | 'bearer' | 'none'

export interface DeviceAuthConfig {
  readonly mode: DeviceAuthMode
  /** Launch token, tokenized URL (`http://127.0.0.1:3080/?token=...`), Cookie value, or Bearer token. */
  readonly credential?: string
}

/** Persisted configuration for one remote device. */
export interface DeviceConfig {
  readonly id: DeviceId
  /** User-facing display name (e.g. `ubuntu-dev`, `macbook-pro`). */
  readonly name: string
  /** Optional color tag or environment label (e.g. `Linux GPU`, `macOS`). */
  readonly label?: string
  /** Whether this device is enabled for connection. */
  readonly enabled: boolean
  /** Transport configuration (SSH tunnel recommended by default, or HTTP/S direct). */
  readonly transport: DeviceTransportConfig
  /** Authentication configuration. */
  readonly auth: DeviceAuthConfig
  /** Whether to keep Native Mode page alive in background once opened; defaults to true. */
  readonly keepNativeAlive?: boolean
}

/** Input payload for adding or updating a device. */
export interface UpsertDeviceInput {
  readonly id?: string
  readonly name: string
  readonly label?: string
  readonly enabled?: boolean
  readonly transport: DeviceTransportConfig
  readonly auth?: DeviceAuthConfig
  readonly keepNativeAlive?: boolean
}

/** Explicitly create a Session on one remote device (per-conversation device choice). */
export interface RemoteSessionCreateInput {
  readonly deviceId: DeviceId
  /** Remote workspace id on that device, when known. */
  readonly workspaceId?: string
  /** Remote working directory on that device, used when no workspace id is known. */
  readonly cwd?: string
  readonly agentPreset?: string
}

/** Register a new folder as a Workspace on one remote device. */
export interface RemoteWorkspaceCreateInput {
  readonly deviceId: DeviceId
  readonly path: string
}

/** Connection lifecycle state of a device. */
export type DeviceConnectionState =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

/**Detected remote DSH wire protocol generation. */
export type RemoteProtocolVersion = '0.2' | '0.1' | 'unknown'

/** Live runtime telemetry and status of a device. */
export type DeviceAuthState = 'unknown' | 'ok' | 'required' | 'error'

export interface DeviceView {
  readonly id: DeviceId
  readonly name: string
  readonly label?: string
  readonly enabled: boolean
  readonly state: DeviceConnectionState
  /** Native-mode authentication state of the current credential (never carries secrets). */
  readonly authState?: DeviceAuthState
  /** Human-readable reason when `authState` is `required` or `error`. */
  readonly authError?: string
  readonly transportKind: 'ssh' | 'direct'
  /** Sanitized SSH transport fields for the edit form (never includes a passphrase). */
  readonly ssh?: {
    readonly host: string
    readonly port?: number
    readonly username?: string
    readonly privateKeyPath?: string
    readonly proxyJump?: string
    readonly remotePort?: number
    readonly remoteDshHome?: string
    /** Whether auto auth may mint a cookie from the remote signing secret. */
    readonly bootstrapFromRemoteCredentials?: boolean
    readonly engine?: SshTunnelEngine
  }
  /** Display target summary, e.g. `ssh://root@10.0.0.5:22 -> 127.0.0.1:3080` or `https://dev.internal:3080`. */
  readonly targetSummary: string
  /** Effective local URL when tunnel is up or direct URL. */
  readonly effectiveBaseUrl?: string
  /**
   * Dedicated local loopback reverse-proxy URL (`http://127.0.0.1:<port>/`) for Native Mode.
   * Pre-authenticated and header-normalized so `<webview>` and `<iframe>` load the remote DSH Web UI directly.
   */
  readonly nativeProxyUrl?: string
  readonly keepNativeAlive: boolean
  readonly protocolVersion: RemoteProtocolVersion
  /**
   * Whether this device has a live event stream. DSH 0.1 is list-only: the
   * client polls session and workspace lists and does not follow history.
   */
  readonly realtime: boolean
  readonly remoteDshVersion?: string
  readonly remoteHome?: string
  readonly latencyMs?: number
  readonly connectedAt?: number
  readonly lastError?: string
  readonly reconnectAttempt: number
  readonly sessionCount: number
  readonly runningSessionCount: number
  readonly pendingApprovalCount: number
  readonly workspaceCount: number
}

/** A local private key discovered under `~/.ssh` for the device form. */
export interface SshKeyEntry {
  /** Absolute path on the local machine, e.g. `~/.ssh/id_ed25519` (expanded). */
  readonly path: string
  /** Basename shown in the picker. */
  readonly name: string
  /** Matching public key path when present. */
  readonly publicKeyPath?: string
  /** Whether the private key material is passphrase-protected. */
  readonly encrypted: boolean
  /** True when the file has group/other permission bits (ssh will reject it). */
  readonly permissionsTooOpen: boolean
}

/** Parsed entry from the user's `~/.ssh/config`. */
export interface SshConfigHostEntry {
  /** Alias from `Host <alias>`. */
  readonly alias: string
  /** Effective `HostName` (defaults to `alias`). */
  readonly hostName: string
  readonly user?: string
  readonly port?: number
  readonly identityFile?: string
  readonly proxyJump?: string
  readonly proxyCommand?: string
  readonly forwardAgent?: boolean
  readonly sourceFile: string
}

/** Origin reference of a physical workspace on a specific device. */
export interface WorkspaceMemberRef {
  readonly deviceId: DeviceId
  readonly deviceName: string
  readonly remoteWorkspaceId: string
  readonly path: string
  readonly title: string
  /** Normalized Git remote identity (`github.com/org/repo`) when discovered. */
  readonly gitRemote?: string
  /** Raw Git remote URL (`git@github.com:org/repo.git`) when discovered. */
  readonly rawGitRemote?: string
  readonly sessionCount: number
  readonly runningSessionCount: number
}

/** Manual workspace aggregation rule configured by the user. */
export interface ManualWorkspaceRule {
  readonly id: string
  /** Display title for this logical workspace. */
  readonly title: string
  /** Explicit member keys (`<deviceId>:<path>`) bound into this logical workspace. */
  readonly memberKeys: readonly string[]
  /** Optional Git remote key (`github.com/org/repo`) to also match into this group. */
  readonly gitRemote?: string
  /** Preferred device ID when clicking "+ New Session" on this logical workspace. */
  readonly preferredDeviceId?: DeviceId
}

/** Persisted Git & manual workspace aggregation settings. */
export interface WorkspaceAggregationConfig {
  /** Whether to automatically merge workspaces across devices that share the same Git remote. Default: true. */
  readonly autoGitAggregate: boolean
  /** Whether unmatched remote workspaces should be prefixed with `[DeviceName]`. Default: true. */
  readonly prefixUnmatchedWithDevice: boolean
  /** Member keys (`<deviceId>:<path>`) explicitly excluded from automatic Git aggregation. */
  readonly excludedMemberKeys: readonly string[]
  /** Preferred target device ID per logical workspace ID (`md-lws~...`) for "+ New Session". */
  readonly preferredDeviceByLogicalId: Readonly<Record<string, DeviceId>>
  /** Custom display titles per logical workspace ID (`md-lws~...`). */
  readonly customTitleByLogicalId: Readonly<Record<string, string>>
  /** Persisted display order of logical workspace IDs. */
  readonly workspaceOrder: readonly string[]
  /** User-defined manual aggregation rules. */
  readonly manualRules: readonly ManualWorkspaceRule[]
}

/** Computed Logical Workspace view for the UI and sidebar tree. */
export interface LogicalWorkspaceView {
  /** Workspace ID exposed in the merged sidebar tree. */
  readonly logicalWorkspaceId: string
  readonly title: string
  /** Aggregation source: `'git'` (auto-matched by Git remote), `'manual'` (user rule), or `'single'` (unmerged single-device workspace). */
  readonly kind: 'git' | 'manual' | 'single'
  /** Canonical normalized Git remote (`github.com/org/repo`), if any. */
  readonly gitRemote?: string
  /** Device ID where "+ New Session" will create a session. */
  readonly targetDeviceId: DeviceId
  /** Target path on `targetDeviceId` where "+ New Session" will create a session. */
  readonly targetPath: string
  /** All physical device workspace members belonging to this logical workspace. */
  readonly members: readonly WorkspaceMemberRef[]
  /** All merged session IDs (with remote IDs namespaced) in display order. */
  readonly sessionIds: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** Metadata about a session's device ownership, exposed to client UI badges & hover cards. */
export interface SessionOriginMetadata {
  readonly namespacedSessionId: string
  readonly rawSessionId: string
  readonly deviceId: DeviceId
  readonly deviceName: string
  readonly deviceState: DeviceConnectionState
  readonly cwd?: string
  readonly gitRemote?: string
  readonly logicalWorkspaceId?: string
  readonly running: boolean
  readonly pendingInteractionKind?: PendingInteractionKind
  readonly nativeUrl?: string
}

/** Complete Hub snapshot returned to the Client UI. */
export interface MultiDeviceSnapshot {
  readonly revision: number
  readonly hostStatus: {
    readonly aggregatedGatewayActive: boolean
    readonly aggregatedGatewayError?: string
    readonly nativeProxyActive: boolean
  }
  readonly devices: readonly DeviceView[]
  readonly sshConfigHosts: readonly SshConfigHostEntry[]
  readonly aggregationConfig: WorkspaceAggregationConfig
  readonly logicalWorkspaces: readonly LogicalWorkspaceView[]
  readonly allPhysicalWorkspaces: readonly WorkspaceMemberRef[]
  readonly sessionOrigins: Readonly<Record<string, SessionOriginMetadata>>
}

// ============================================================================
// Deterministic Collision-Free Identity Mapping
// ============================================================================

const REMOTE_SESSION_PREFIX = 'md~'
const REMOTE_WORKSPACE_PREFIX = 'md-ws~'
const LOGICAL_WORKSPACE_PREFIX = 'md-lws~'
const REMOTE_EVENT_PREFIX = 'md-ev~'
const SEPARATOR = '~'

/** Waterfall interactions the host tracks per remote device. */
export type PendingInteractionKind = 'approval' | 'question' | 'plan-review'

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
export function encodeRemoteSessionId(deviceId: DeviceId, remoteSessionId: string): string {
  if (deviceId === LOCAL_DEVICE_ID) return remoteSessionId
  return `${REMOTE_SESSION_PREFIX}${escapeSegment(deviceId)}${SEPARATOR}${remoteSessionId}`
}

/**
 * Decode a possibly-namespaced `SessionId` into its owning `deviceId` and raw `remoteSessionId`.
 *
 * @param sessionId - candidate session id from the browser or host.
 * @returns `{ deviceId, rawSessionId, isRemote }`.
 */
export function decodeSessionId(sessionId: string): {
  readonly deviceId: DeviceId
  readonly rawSessionId: string
  readonly isRemote: boolean
} {
  if (!sessionId.startsWith(REMOTE_SESSION_PREFIX)) {
    return { deviceId: LOCAL_DEVICE_ID, rawSessionId: sessionId, isRemote: false }
  }
  const rest = sessionId.slice(REMOTE_SESSION_PREFIX.length)
  const sepIndex = rest.indexOf(SEPARATOR)
  if (sepIndex <= 0 || sepIndex === rest.length - 1) {
    return { deviceId: LOCAL_DEVICE_ID, rawSessionId: sessionId, isRemote: false }
  }
  const deviceId = unescapeSegment(rest.slice(0, sepIndex)) as DeviceId
  const rawSessionId = rest.slice(sepIndex + 1)
  return { deviceId, rawSessionId, isRemote: true }
}

/**
 * Encode a `(deviceId, remoteWorkspaceId)` pair into a single-device workspace ID.
 */
export function encodeRemoteWorkspaceId(deviceId: DeviceId, remoteWorkspaceId: string): string {
  if (deviceId === LOCAL_DEVICE_ID) return remoteWorkspaceId
  return `${REMOTE_WORKSPACE_PREFIX}${escapeSegment(deviceId)}${SEPARATOR}${remoteWorkspaceId}`
}

/**
 * Decode a single-device workspace ID.
 */
export function decodeRemoteWorkspaceId(workspaceId: string): {
  readonly deviceId: DeviceId
  readonly rawWorkspaceId: string
  readonly isRemote: boolean
} {
  if (!workspaceId.startsWith(REMOTE_WORKSPACE_PREFIX)) {
    return { deviceId: LOCAL_DEVICE_ID, rawWorkspaceId: workspaceId, isRemote: false }
  }
  const rest = workspaceId.slice(REMOTE_WORKSPACE_PREFIX.length)
  const sepIndex = rest.indexOf(SEPARATOR)
  if (sepIndex <= 0 || sepIndex === rest.length - 1) {
    return { deviceId: LOCAL_DEVICE_ID, rawWorkspaceId: workspaceId, isRemote: false }
  }
  return {
    deviceId: unescapeSegment(rest.slice(0, sepIndex)) as DeviceId,
    rawWorkspaceId: rest.slice(sepIndex + 1),
    isRemote: true,
  }
}

/**
 * Mint a stable logical workspace ID for a Git remote or manual aggregation rule.
 */
export function encodeLogicalWorkspaceId(kind: 'git' | 'manual', key: string): string {
  return `${LOGICAL_WORKSPACE_PREFIX}${kind}${SEPARATOR}${escapeSegment(key)}`
}

/**
 * Decode a logical workspace ID (`md-lws~git~...` or `md-lws~manual~...`).
 */
export function decodeLogicalWorkspaceId(workspaceId: string): {
  readonly kind: 'git' | 'manual'
  readonly key: string
} | undefined {
  if (!workspaceId.startsWith(LOGICAL_WORKSPACE_PREFIX)) return undefined
  const rest = workspaceId.slice(LOGICAL_WORKSPACE_PREFIX.length)
  const sepIndex = rest.indexOf(SEPARATOR)
  if (sepIndex <= 0) return undefined
  const kind = rest.slice(0, sepIndex)
  if (kind !== 'git' && kind !== 'manual') return undefined
  return {
    kind,
    key: unescapeSegment(rest.slice(sepIndex + 1)),
  }
}

/**
 * Encode a remote `$events` waterfall `eventId` so `/api/$events/result` can route the user's
 * approval or question answer back to the exact remote device and active `$events` stream.
 *
 * The remote part is opaque and appended verbatim; an id that already looks
 * namespaced is rejected by {@link decodeRemoteEventId} rather than routed as
 * another device's waterfall.
 */
export function encodeRemoteEventId(deviceId: DeviceId, remoteEventId: string): string {
  return `${REMOTE_EVENT_PREFIX}${escapeSegment(deviceId)}${SEPARATOR}${remoteEventId}`
}

/**
 * Decode a remote `$events` waterfall `eventId`.
 *
 * The remote part is opaque, but a remote must not smuggle a second namespaced
 * id through it: decoding that would let one device address another device's
 * waterfall. Reject double-prefixed ids instead of routing them.
 */
export function decodeRemoteEventId(eventId: string): {
  readonly deviceId: DeviceId
  readonly remoteEventId: string
} | undefined {
  if (!eventId.startsWith(REMOTE_EVENT_PREFIX)) return undefined
  const rest = eventId.slice(REMOTE_EVENT_PREFIX.length)
  const sepIndex = rest.indexOf(SEPARATOR)
  if (sepIndex <= 0 || sepIndex === rest.length - 1) return undefined
  const remoteEventId = rest.slice(sepIndex + 1)
  if (remoteEventId.startsWith(REMOTE_EVENT_PREFIX)) return undefined
  return {
    deviceId: unescapeSegment(rest.slice(0, sepIndex)) as DeviceId,
    remoteEventId,
  }
}

/** Build a canonical member key `<deviceId>:<normalizedPath>`. */
export function workspaceMemberKey(deviceId: DeviceId, path: string): string {
  return `${deviceId}:${normalizeWorkspacePath(path)}`
}

/** Normalize POSIX and Windows directory paths for comparison without touching filesystem. */
export function normalizeWorkspacePath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (trimmed === '') return ''
  const isWin = /^[A-Za-z]:[/\\]/.test(trimmed) || trimmed.startsWith('\\\\')
  const unified = isWin ? trimmed.replaceAll('\\', '/') : trimmed
  const stripped = unified.replace(/\/+$/, '')
  if (stripped === '') return '/'
  if (/^[A-Za-z]:$/.test(stripped)) return `${stripped.toLowerCase()}/`
  return isWin ? stripped.toLowerCase() : stripped
}

/**
 * Normalize any Git remote URL (`git@github.com:org/repo.git`, `https://github.com/org/repo.git`,
 * `ssh://git@gitlab.example.com:2222/group/sub/repo/`) into a canonical repository key
 * (`github.com/org/repo`).
 *
 * Returns `undefined` when the input is not a recognizable Git remote URL.
 */
export function normalizeGitRemote(rawUrl: string | undefined | null): string | undefined {
  if (typeof rawUrl !== 'string') return undefined
  const trimmed = rawUrl.trim()
  if (trimmed === '') return undefined

  let host = ''
  let pathPart = ''

  // Case 1: Standard URL with scheme (https://, http://, ssh://, git://, git+ssh://)
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol === 'file:') return undefined
      host = parsed.hostname.toLowerCase()
      const port = parsed.port
      const defaultPort = parsed.protocol === 'ssh:' || parsed.protocol === 'git+ssh:' ? '22' : ''
      if (port !== '' && port !== defaultPort && port !== '443' && port !== '80') {
        host = `${host}:${port}`
      }
      pathPart = parsed.pathname
    } catch {
      return undefined
    }
  } else {
    // Case 2: SCP-like syntax `[user@]host:path/to/repo.git`
    const scpMatch = /^(?:[^@/\s]+@)?([A-Za-z0-9.-]+|\[[0-9a-fA-F:]+\]):(.+)$/.exec(trimmed)
    if (!scpMatch || scpMatch[1] === undefined || scpMatch[2] === undefined) {
      return undefined
    }
    // Reject Windows drive letters like `C:\path`
    if (scpMatch[1].length === 1 && /^[A-Za-z]$/.test(scpMatch[1])) {
      return undefined
    }
    host = scpMatch[1].toLowerCase()
    pathPart = scpMatch[2]
  }

  const cleanPath = pathPart
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/^~\//, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')

  if (host === '' || cleanPath === '') return undefined
  return `${host}/${cleanPath.toLowerCase()}`
}

function escapeSegment(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('~', '%7E')
}

function unescapeSegment(value: string): string {
  return value.replaceAll('%7E', '~').replaceAll('%25', '%')
}

/**
 * Persistent Device & Workspace Aggregation Registry (`DeviceRegistry`).
 *
 * Coordinates:
 * - Persisted device list and aggregation config in `$DSH_HOME/plugins/dsh-multi-device.json` (`0600` atomic write).
 * - Per-device `RemoteDeviceClient` and `NativeDeviceProxy` lifecycles.
 * - Self-loop detection so a user cannot accidentally add the local DSH host as a remote device.
 * - Live snapshot generation (`MultiDeviceSnapshot`) for the UI.
 *
 * @module dsh-multi-device/host/registry
 */
import { randomUUID } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname } from 'node:path'
import {
  type DeviceAuthState,
  type DeviceCatalogCache,
  type DeviceConfig,
  type DeviceConnectionState,
  DeviceId,
  type DeviceView,
  type DisplayMode,
  decodeSessionId,
  encodeRemoteSessionId,
  type GitMatchRun,
  LOCAL_DEVICE_ID,
  type MultiDeviceSnapshot,
  type NativePaneState,
  normalizeWorkspacePath,
  type MultiDeviceUiPreferences,
  type RemoteSessionCreateInput,
  type RemoteWorkspaceCreateInput,
  type SessionOriginMetadata,
  type SshKeyEntry,
  type UpsertDeviceInput,
  type WorkspaceAggregationConfig,
} from '../contract.ts'
import { DeviceAuthManager } from './auth.ts'
import {
  DEFAULT_AGGREGATION_CONFIG,
  discoverRemoteGitRemotesViaSsh,
  type PhysicalWorkspaceInput,
  WorkspaceAggregator,
} from './git-aggregator.ts'
import {
  createIdleGitMatch,
  GitMatchRunner,
  type GitMatchDeviceTarget,
} from './git-match.ts'
import { scanLocalGitRepos, scanRemoteGitRepos, type ScannedRepository } from './git-scan.ts'
import { requestRemote } from './http-request.ts'
import { sanitizeGroupState } from './native-bridge.ts'
import { NativeProxyManager } from './native-proxy.ts'
import { ReadStateTracker, type SessionReadState } from './read-state.ts'
import {
  buildReadSharedStateCommand,
  buildSharedReadDocument,
  buildWriteSharedStateCommand,
  isPosixRemoteHome,
  parseSharedReadDocument,
  sharedReadStatePath,
  type SharedReadEntry,
} from './shared-state.ts'
import {
  classifyRemoteProtocol,
  RemoteDeviceClient,
  resolveProbedProtocol,
  type RemoteDeviceCallbacks,
} from './remote-client.ts'
import {
  listLocalSshKeys,
  listSshConfigHosts,
  resolveSshConfigForTransport,
} from './ssh-config.ts'
import { execSshCommand, probeSshTunnel } from './tunnel.ts'

/**
 * The SSH tunnel can be up while DSH itself still rejects the HTTP call.
 * Say so, instead of pointing the user at the private key.
 */
export function describeProbeFailure(
  status: number | undefined,
  input: UpsertDeviceInput,
): string {
  if (status === undefined) {
    return 'Could not reach remote DSH HTTP endpoint over the connection'
  }
  if (status === 401 || status === 403) {
    const ssh = input.transport.kind === 'ssh' ? input.transport : undefined
    const sshAuto = ssh !== undefined && (input.auth?.mode ?? 'auto') === 'auto'
    const bootstrapping = sshAuto && ssh?.bootstrapFromRemoteCredentials === true
    if (sshAuto && !bootstrapping) {
      return `SSH tunnel is up, but remote DSH answered HTTP ${String(status)}. Auto auth did not read the remote credentials; enable SSH credential bootstrap or paste the launch URL.`
    }
    if (bootstrapping) {
      return `SSH tunnel is up, but remote DSH rejected the minted cookie (HTTP ${String(status)}). Check the remote DSH port (${input.transport.kind === 'ssh' ? String(input.transport.remotePort ?? 3080) : 'direct'}) and that dsh web is the process listening there.`
    }
    return `SSH tunnel is up, but remote DSH answered HTTP ${String(status)}. Check the authentication token or DSH port.`
  }
  return `Remote DSH answered HTTP ${String(status)} (check authentication token or DSH port)`
}

/**
 * Credentials never belong in the device/aggregation document. Keep the
 * public config free of launch tokens, cookies, bearer tokens and SSH
 * passphrases; `DeviceAuthManager` owns them in the 0600 secrets file.
 */
function sanitizeDeviceConfig(config: DeviceConfig): DeviceConfig {
  return {
    ...config,
    auth: {
      mode: config.auth?.mode ?? 'auto',
    },
    transport:
      config.transport.kind === 'ssh'
        ? {
            ...config.transport,
            passphrase: undefined,
          }
        : config.transport,
  }
}

interface PersistedRegistryDocument {
  readonly version: 1
  readonly devices: readonly DeviceConfig[]
  readonly aggregation: WorkspaceAggregationConfig
  /**
   * Host-side mode. Persisting it matters: `native` means the local DSH
   * surface must stay local-only from the very first API response after a
   * restart, before any browser-side mode state could be applied.
   */
  readonly displayMode?: DisplayMode
  /** Last manual Git match outcome, so the panel can show it after a reload. */
  readonly gitMatch?: GitMatchRun
  /** Last-known catalogs, keyed by device id, so offline devices keep their sidebar rows. */
  readonly catalogs?: Record<string, DeviceCatalogCache>
  /** Persisted display preferences. */
  readonly ui?: MultiDeviceUiPreferences
  /**
   * Per-device workspace fold state last reported by a native page. Keyed by
   * device id and then by the remote workspace key used by DSH's sidebar.
   */
  readonly nativeGroups?: Record<string, Record<string, boolean>>
  /** Host-owned unread/read state, keyed by namespaced remote Session id. */
  readonly readState?: {
    readonly entries: Record<string, SessionReadState>
  }
  /** Stable identity for this Host, used by the optional cross-Host state file. */
  readonly hostId?: string
}

const DEFAULT_UI_PREFERENCES: MultiDeviceUiPreferences = {
  sessionRowDeviceDot: false,
  nativePane: true,
  crossHostReadState: false,
}

/** Structural equality for a bounded workspace fold map. */
function sameGroupState(
  left: Readonly<Record<string, boolean>>,
  right: Readonly<Record<string, boolean>>,
): boolean {
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) return false
  return leftKeys.every(key => left[key] === right[key])
}

/** Bound one device's persisted fold map; the remote sidebar has far fewer rows. */
function sanitizeNativeGroups(value: unknown): Record<DeviceId, Record<string, boolean>> {
  const out: Record<DeviceId, Record<string, boolean>> = {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out
  for (const [deviceId, groups] of Object.entries(value as Record<string, unknown>)) {
    if (deviceId === '') continue
    const clean = sanitizeGroupState(groups)
    if (Object.keys(clean).length > 0) out[DeviceId(deviceId)] = clean
  }
  return out
}

export interface LocalHostProvider {
  /** Local webserver port, used for self-loop prevention. */
  readonly localPort: () => number | undefined
  /** Read current local workspaces from `ctx.workspaceRegistry`. */
  readonly localWorkspaces: () => PhysicalWorkspaceInput[]
  /** Read current local session summaries. */
  readonly localSessionUpdatedAt: () => Map<string, number>
  /**
   * Local archived Session IDs (`ctx.workspaceRegistry.archivedSessionIds`).
   * Optional so registries built by older callers and tests keep working;
   * a missing provider simply means "no local Session is archived".
   */
  readonly localArchivedSessionIds?: () => readonly string[]
  /**
   * Local subagent-origin Session IDs (`session.header.origin === 'subagent'`).
   * DSH renders these under their parent, never as standalone sidebar rows.
   */
  readonly localSubagentSessionIds?: () => readonly string[]
}

/**
 * The model-catalog scope for the Session currently shown in the conversation
 * pane. A remote Session must use only its owner's catalog; there is no local
 * fallback because that would offer models the remote Agent cannot run.
 */
export type ActiveSessionScope =
  | { readonly kind: 'local' }
  | {
      readonly kind: 'remote'
      readonly deviceId: DeviceId
      readonly deviceName: string
      readonly client: RemoteDeviceClient | undefined
    }

export class DeviceRegistry {
  readonly authManager: DeviceAuthManager
  readonly nativeProxyManager: NativeProxyManager
  readonly aggregator: WorkspaceAggregator

  private readonly configs = new Map<DeviceId, DeviceConfig>()
  private readonly clients = new Map<DeviceId, RemoteDeviceClient>()
  private readonly listeners = new Set<() => void>()
  private readonly eventListeners = new Set<
    (
      deviceId: DeviceId,
      frame:
        | { type: 'emit'; event: string; args: unknown[] }
        | { type: 'waterfall'; event: string; eventId: string; agentId: string; request: Record<string, unknown> }
        | { type: 'cancel'; eventId: string },
    ) => void
  >()
  private readonly projectionListeners = new Set<
    (deviceId: DeviceId, frame: { sessionId: string; key: string; value: unknown; seq: number }) => void
  >()
  private readonly workspaceListeners = new Set<() => void>()
  private readonly modelCatalogListeners = new Set<() => void>()
  private readonly modeListeners = new Set<(mode: DisplayMode) => void>()

  private activeSessionSeq = -1
  private activeSessionClientId: string | undefined
  private activeSessionIsRemote = false
  private activeSessionDeviceId: DeviceId | undefined
  private activeSessionId: string | undefined
  /** The one framed device currently rendered as the aggregated pane. */
  private paneEmbeddedDeviceId: DeviceId | undefined

  private revision = 1
  private displayMode: DisplayMode = 'aggregated'
  private gitMatchRunner: GitMatchRunner | undefined
  private gitMatchRun: GitMatchRun = createIdleGitMatch()
  private localWorkspaceCreator: ((path: string) => Promise<void>) | undefined
  private aggregatedGatewayActive = false
  private aggregatedGatewayError: string | undefined
  private nativeProxyActive = true
  private readonly authStates = new Map<DeviceId, { state: DeviceAuthState; error?: string }>()
  /** Durable mirror of each device catalog (see {@link DeviceCatalogCache}). */
  private readonly catalogs = new Map<DeviceId, DeviceCatalogCache>()
  /** Injected Native Pane bridge lifecycle and last page selection per device. */
  private readonly nativePanes = new Map<DeviceId, { state: NativePaneState; error?: string; sessionId?: string }>()
  /** Previous connection state per device, so workspace rows are recomputed on a real transition. */
  private readonly lastDeviceStates = new Map<DeviceId, DeviceConnectionState>()
  /** Host-owned fold state per device, restored into the framed page before its first render. */
  private readonly nativeGroups = new Map<DeviceId, Record<string, boolean>>()
  /** Host-owned read/unread state for namespaced remote Sessions. */
  private readonly readTracker = new ReadStateTracker((sessionId, _state, unreadChanged) => {
    this.schedulePersist()
    if (unreadChanged) this.bumpRevision()
    this.publishUnreadState(sessionId)
  })
  /** Stable Host identity (used by the optional cross-Host state file). */
  private hostId: string = randomUUID()
  private uiPreferences: MultiDeviceUiPreferences = { ...DEFAULT_UI_PREFERENCES }
  private catalogPersistTimer: ReturnType<typeof setTimeout> | undefined
  private persistTimer: ReturnType<typeof setTimeout> | undefined
  /** Optional cross-Host read-state polling and per-device push debounce. */
  private sharedReadStateTimer: ReturnType<typeof setInterval> | undefined
  private readonly sharedReadStateInFlight = new Set<DeviceId>()
  private readonly sharedReadStateInitialized = new Set<DeviceId>()
  private readonly sharedReadStatePushTimers = new Map<DeviceId, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly dataFilePath: string,
    secretsFilePath: string,
    private readonly localHost: LocalHostProvider,
    private readonly options: {
      enableTunnels?: boolean
      enableNativeProxy?: boolean
      localOrigin?: () => string | undefined
      allowDirectTransport?: boolean
    } = {},
  ) {
    this.authManager = new DeviceAuthManager(secretsFilePath)
    this.nativeProxyManager = new NativeProxyManager(
      this.authManager,
      options.localOrigin,
      {
        onAuthState: (deviceId, state, error) => {
          this.setAuthState(deviceId, state, error)
        },
        onBridgeState: (deviceId, state, error) => {
          this.setNativePaneState(deviceId, state, error)
        },
        onBridgeSelection: (deviceId, sessionId) => {
          this.setNativePaneSelection(deviceId, sessionId)
        },
        getGroupState: deviceId => this.nativeGroups.get(deviceId),
        onGroupState: (deviceId, groups) => {
          this.setNativeGroupState(deviceId, groups)
        },
        getUnreadState: deviceId => this.unreadForDevice(deviceId),
        onBridgeRead: (deviceId, sessionId) => {
          this.readTracker.markRead(encodeRemoteSessionId(deviceId, sessionId))
        },
      },
    )
    this.aggregator = new WorkspaceAggregator()
    this.nativeProxyActive = options.enableNativeProxy !== false
    this.loadFromDisk()
    this.syncSharedReadStateTimer()
  }

  setGatewayStatus(active: boolean, error?: string): void {
    this.aggregatedGatewayActive = active
    this.aggregatedGatewayError = error
    this.bumpRevision()
  }

  onSnapshotChanged(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onRemoteEvent(
    listener: (
      deviceId: DeviceId,
      frame:
        | { type: 'emit'; event: string; args: unknown[] }
        | { type: 'waterfall'; event: string; eventId: string; agentId: string; request: Record<string, unknown> }
        | { type: 'cancel'; eventId: string },
    ) => void,
  ): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  onControlProjection(
    listener: (deviceId: DeviceId, frame: { sessionId: string; key: string; value: unknown; seq: number }) => void,
  ): () => void {
    this.projectionListeners.add(listener)
    return () => this.projectionListeners.delete(listener)
  }

  onWorkspacesChanged(listener: () => void): () => void {
    this.workspaceListeners.add(listener)
    return () => this.workspaceListeners.delete(listener)
  }

  /**
   * Subscribe to model-catalog scope changes. The Host re-emits DSH's
   * `llm/adapters-updated` event so the browser's shared model picker drops its
   * cached catalog and asks `session/modelCatalog` again.
   */
  onModelCatalogChanged(listener: () => void): () => void {
    this.modelCatalogListeners.add(listener)
    return () => this.modelCatalogListeners.delete(listener)
  }

  /**
   * Record the Session currently rendered on the right. `requestSeq` is
   * client-monotonic so out-of-order control-plane HTTP requests cannot move
   * the scope back to a previously selected Session.
   */
  setActiveSession(
    sessionId: string | undefined,
    requestSeq = 0,
    clientId = '',
  ): boolean {
    // A different tab starts its own sequence at 1; do not compare it with the
    // previous tab's counter.
    const sameClient = clientId === '' || clientId === this.activeSessionClientId
    if (sameClient && requestSeq > 0 && requestSeq <= this.activeSessionSeq) return false
    if (clientId !== '') this.activeSessionClientId = clientId
    if (requestSeq > 0) this.activeSessionSeq = requestSeq

    const previousKind = this.activeSessionIsRemote ? 'remote' : 'local'
    const previousDeviceId = this.activeSessionDeviceId
    const next = sessionId === undefined || sessionId === '' ? undefined : sessionId
    const decoded = next !== undefined ? decodeSessionId(next) : undefined
    this.activeSessionId = next
    this.activeSessionIsRemote = decoded?.isRemote === true
    this.activeSessionDeviceId = decoded?.isRemote === true ? decoded.deviceId : undefined

    const changed =
      previousKind !== (this.activeSessionIsRemote ? 'remote' : 'local') ||
      previousDeviceId !== this.activeSessionDeviceId
    if (changed) this.notifyModelCatalogChanged()
    if (this.activeSessionIsRemote && this.activeSessionDeviceId !== undefined) {
      this.publishNativePaneSession(this.activeSessionDeviceId)
    }
    this.syncNativePaneEmbedding()
    if (next !== undefined) this.readTracker.markRead(next)
    return changed
  }

  /**
   * Clear one remote Session's unread marker. Returns true when this call
   * actually removed a marker, so callers can distinguish a real transition
   * from a redundant read touch.
   */
  markSessionRead(sessionId: string): boolean {
    return this.readTracker.markRead(sessionId)
  }

  /** Local DSH session status, observed through this Host's own event bus. */
  observeLocalSessionStatus(sessionId: string, running: boolean): void {
    if (typeof sessionId !== 'string' || sessionId === '') return
    this.readTracker.observeRunning(sessionId, running)
    if (!running && sessionId === this.activeSessionId) {
      this.readTracker.markRead(sessionId)
    }
  }

  /** Persisted fold state for one device; the bridge injection uses this map. */
  nativeGroupState(deviceId: DeviceId): Readonly<Record<string, boolean>> | undefined {
    return this.nativeGroups.get(deviceId)
  }

  /**
   * Accept a fold-state report from a framed page. This is deliberately not
   * part of the UI snapshot: only the device's bridge needs it, and routing it
   * through revisions would re-render every sidebar row on each fold click.
   */
  private setNativeGroupState(deviceId: DeviceId, groups: Readonly<Record<string, boolean>>): void {
    if (!this.configs.has(deviceId)) return
    const next = sanitizeGroupState(groups)
    const previous = this.nativeGroups.get(deviceId)
    if (previous !== undefined && sameGroupState(previous, next)) return
    if (Object.keys(next).length === 0) this.nativeGroups.delete(deviceId)
    else this.nativeGroups.set(deviceId, next)
    this.schedulePersist()
    this.nativeProxyManager.setGroupState(deviceId, next)
  }

  /** Raw remote Session IDs that are unread on one device. */
  private unreadForDevice(deviceId: DeviceId): string[] {
    const out: string[] = []
    for (const sessionId of this.readTracker.unreadIds()) {
      const decoded = decodeSessionId(sessionId)
      if (decoded.isRemote && decoded.deviceId === deviceId) out.push(decoded.rawSessionId)
    }
    return out
  }

  /** Push the new unread set to the owning device's framed page. */
  private publishUnreadState(sessionId: string): void {
    const decoded = decodeSessionId(sessionId)
    if (!decoded.isRemote) return
    this.nativeProxyManager.setUnreadState(decoded.deviceId, this.unreadForDevice(decoded.deviceId))
    this.scheduleSharedReadStatePush(decoded.deviceId)
  }

  /**
   * Reconcile running flags from the authoritative list. DSH can miss a
   * `api-session/status` frame across a stream gap; the list refresh still
   * carries the final flag, and a live `true -> false` there is a completion
   * for the same reason a stream event is.
   */
  private isCurrentlyViewedSession(sessionId: string): boolean {
    if (sessionId === this.activeSessionId) return true
    const decoded = decodeSessionId(sessionId)
    if (!decoded.isRemote) return false
    const pane = this.nativePanes.get(decoded.deviceId)
    return pane?.state === 'ready' && pane.sessionId === decoded.rawSessionId && (
      this.displayMode === 'native' || this.paneEmbeddedDeviceId === decoded.deviceId
    )
  }

  private reconcileRunningForDevice(deviceId: DeviceId): void {
    const client = this.clients.get(deviceId)
    if (client === undefined || !client.isConnected()) return
    if (client.toView().catalogStale === true) return
    for (const summary of client.sessionSummaries()) {
      const namespacedId = encodeRemoteSessionId(deviceId, summary.sessionId)
      this.readTracker.observeRunning(namespacedId, summary.running)
      if (!summary.running && this.isCurrentlyViewedSession(namespacedId)) {
        this.readTracker.markRead(namespacedId)
      }
    }
  }

  /** Observe one remote event before it is forwarded to the local mirror. */
  private observeRemoteFrame(
    deviceId: DeviceId,
    frame:
      | { type: 'emit'; event: string; args: unknown[] }
      | { type: 'waterfall'; event: string; eventId: string; agentId: string; request: Record<string, unknown> }
      | { type: 'cancel'; eventId: string },
  ): void {
    if (frame.type !== 'emit' || frame.event !== 'api-session/status') return
    const [sessionId, running] = frame.args
    if (typeof sessionId !== 'string' || typeof running !== 'boolean') return
    // `markDisconnected()` deliberately emits `running:false` so local
    // spinners stop. An outage is not a completion: only a live client may
    // turn the transition into an unread reminder.
    const client = this.clients.get(deviceId)
    if (client === undefined || !client.isConnected()) return
    this.readTracker.observeRunning(sessionId, running)
    if (!running && this.isCurrentlyViewedSession(sessionId)) {
      this.readTracker.markRead(sessionId)
    }
  }

  /**
   * Optional cross-Host sync. The state file lives in the remote DSH home and
   * is written only over an existing SSH transport; direct-only devices and
   * Windows remote homes are skipped rather than guessed at.
   */
  /** Seed the transition baseline from a cached catalog without marking it unread. */
  private seedRunningFromCatalog(client: RemoteDeviceClient): void {
    for (const summary of client.sessionSummaries()) {
      if (!summary.running) continue
      this.readTracker.observeRunning(encodeRemoteSessionId(client.id, summary.sessionId), true)
    }
  }

  /** One pull+push per connection once the remote home is known. */
  private maybeInitializeSharedReadState(deviceId: DeviceId): void {
    if (!this.uiPreferences.crossHostReadState) return
    if (this.sharedReadStateInitialized.has(deviceId)) return
    const client = this.clients.get(deviceId)
    if (client === undefined || !client.isConnected()) return
    if (!isPosixRemoteHome(client.toView().remoteHome)) return
    this.sharedReadStateInitialized.add(deviceId)
    void this.pullSharedReadState(deviceId).then(() => {
      this.scheduleSharedReadStatePush(deviceId, 0)
    })
  }

  private sharedReadStateTarget(deviceId: DeviceId):
    | { readonly transport: Extract<DeviceConfig['transport'], { kind: 'ssh' }>; readonly path: string }
    | undefined {
    if (!this.uiPreferences.crossHostReadState) return undefined
    const client = this.clients.get(deviceId)
    if (client === undefined || !client.isConnected()) return undefined
    const transport = client.deviceConfig.transport
    if (transport.kind !== 'ssh') return undefined
    const remoteHome = client.toView().remoteHome
    if (!isPosixRemoteHome(remoteHome)) return undefined
    return { transport, path: sharedReadStatePath(remoteHome!) }
  }

  private scheduleSharedReadStatePush(deviceId: DeviceId, delayMs = 1_500): void {
    if (!this.uiPreferences.crossHostReadState) return
    if (this.sharedReadStateInFlight.has(deviceId)) return
    if (this.sharedReadStatePushTimers.has(deviceId)) return
    const timer = setTimeout(() => {
      this.sharedReadStatePushTimers.delete(deviceId)
      void this.pushSharedReadState(deviceId)
    }, delayMs)
    timer.unref?.()
    this.sharedReadStatePushTimers.set(deviceId, timer)
  }

  /** Read the remote file and merge every Host's Session entries locally. */
  private async pullSharedReadState(deviceId: DeviceId): Promise<void> {
    const target = this.sharedReadStateTarget(deviceId)
    if (target === undefined || this.sharedReadStateInFlight.has(deviceId)) return
    this.sharedReadStateInFlight.add(deviceId)
    try {
      const read = await execSshCommand(
        target.transport,
        buildReadSharedStateCommand(target.path),
        8_000,
      )
      if (!read.ok) return
      const doc = parseSharedReadDocument(read.stdout)
      if (doc !== undefined) this.mergeSharedReadDocument(deviceId, doc)
    } catch {
      // Cross-Host sync is best-effort; never break the local unread state.
    } finally {
      this.sharedReadStateInFlight.delete(deviceId)
    }
  }

  /**
   * Read-merge-write one Host section. Preserving the other sections is what
   * makes several Hosts converge; the write only happens after a successful
   * read so an unreachable file cannot clobber another machine's reminders.
   */
  private async pushSharedReadState(deviceId: DeviceId): Promise<void> {
    const target = this.sharedReadStateTarget(deviceId)
    if (target === undefined || this.sharedReadStateInFlight.has(deviceId)) return
    this.sharedReadStateInFlight.add(deviceId)
    try {
      const read = await execSshCommand(
        target.transport,
        buildReadSharedStateCommand(target.path),
        8_000,
      )
      if (!read.ok) return
      const existing = parseSharedReadDocument(read.stdout)
      if (existing !== undefined) this.mergeSharedReadDocument(deviceId, existing)

      const sessions: Record<string, SharedReadEntry> = {}
      for (const [sessionId, entry] of Object.entries(this.readTracker.entriesSnapshot())) {
        const decoded = decodeSessionId(sessionId)
        if (!decoded.isRemote || decoded.deviceId !== deviceId) continue
        if (decoded.rawSessionId === '__proto__' || decoded.rawSessionId === 'constructor' || decoded.rawSessionId === 'prototype') continue
        sessions[decoded.rawSessionId] = entry
      }
      const doc = buildSharedReadDocument(existing, this.hostId, sessions, Date.now())
      await execSshCommand(
        target.transport,
        buildWriteSharedStateCommand(target.path, doc),
        15_000,
      )
    } catch {
      // Best-effort, like the pull path.
    } finally {
      this.sharedReadStateInFlight.delete(deviceId)
    }
  }

  private mergeSharedReadDocument(deviceId: DeviceId, doc: ReturnType<typeof parseSharedReadDocument>): void {
    if (doc === undefined) return
    for (const section of Object.values(doc.hosts)) {
      for (const [rawSessionId, entry] of Object.entries(section.sessions)) {
        this.readTracker.mergeEntry(encodeRemoteSessionId(deviceId, rawSessionId), entry)
      }
    }
  }

  /** Start/stop the 30s remote scan when the preference changes. */
  private syncSharedReadStateTimer(): void {
    if (!this.uiPreferences.crossHostReadState) {
      if (this.sharedReadStateTimer !== undefined) {
        clearInterval(this.sharedReadStateTimer)
        this.sharedReadStateTimer = undefined
      }
      this.sharedReadStateInitialized.clear()
      return
    }
    if (this.sharedReadStateTimer !== undefined) return
    const timer = setInterval(() => {
      for (const deviceId of this.clients.keys()) {
        void this.pullSharedReadState(deviceId)
      }
    }, 30_000)
    timer.unref?.()
    this.sharedReadStateTimer = timer
    for (const deviceId of this.clients.keys()) {
      this.maybeInitializeSharedReadState(deviceId)
      this.scheduleSharedReadStatePush(deviceId, 0)
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer !== undefined) return
    const timer = setTimeout(() => {
      this.persistTimer = undefined
      try { this.saveToDisk() } catch { /* persistence is best-effort */ }
    }, 800)
    timer.unref?.()
    this.persistTimer = timer
  }

  /**
   * Keep exactly one device frame in embedded mode (remote sidebar hidden) and
   * restore every other frame's sidebar for full native rendering.
   */
  private syncNativePaneEmbedding(): void {
    const next = this.displayMode === 'aggregated' &&
      this.uiPreferences.nativePane &&
      this.activeSessionIsRemote &&
      this.activeSessionDeviceId !== undefined
      ? this.activeSessionDeviceId
      : undefined
    if (next === this.paneEmbeddedDeviceId) return
    const previous = this.paneEmbeddedDeviceId
    this.paneEmbeddedDeviceId = next
    if (previous !== undefined && previous !== next) {
      this.nativeProxyManager.setEmbedded(previous, false)
    }
    if (next !== undefined) this.nativeProxyManager.setEmbedded(next, true)
  }

  /**
   * Ask the framed page of the active remote device to show the selected
   * Session. Called on every selection and when a bridge becomes ready; the
   * proxy queues the command until then, so an iframe that is still loading
   * still lands on the right conversation.
   */
  private publishNativePaneSession(deviceId: DeviceId): void {
    if (this.displayMode !== 'aggregated') return
    if (!this.uiPreferences.nativePane) return
    if (this.activeSessionDeviceId !== deviceId || this.activeSessionId === undefined) return
    const decoded = decodeSessionId(this.activeSessionId)
    if (!decoded.isRemote || decoded.deviceId !== deviceId) return
    this.nativeProxyManager.openSession(deviceId, decoded.rawSessionId)
  }

  private setNativePaneState(
    deviceId: DeviceId,
    state: NativePaneState,
    error?: string,
  ): void {
    const previous = this.nativePanes.get(deviceId)
    const nextError = error?.trim() === '' ? undefined : error
    const nextSessionId = state === 'ready' ? previous?.sessionId : undefined
    if (
      previous?.state === state &&
      previous.error === nextError &&
      previous.sessionId === nextSessionId
    ) {
      return
    }
    this.nativePanes.set(deviceId, {
      state,
      ...(nextError !== undefined ? { error: nextError } : {}),
      ...(nextSessionId !== undefined ? { sessionId: nextSessionId } : {}),
    })
    this.bumpRevision()
    if (state === 'ready') {
      this.publishNativePaneSession(deviceId)
      // The proxy may have started after the selection; replay the pane mode
      // so the remote sidebar is hidden for the aggregated pane.
      if (this.paneEmbeddedDeviceId === deviceId) {
        this.nativeProxyManager.setEmbedded(deviceId, true)
      }
    }
  }

  private setNativePaneSelection(deviceId: DeviceId, sessionId: string | undefined): void {
    const previous = this.nativePanes.get(deviceId)
    if (previous?.sessionId === sessionId) return
    this.nativePanes.set(deviceId, {
      state: previous?.state ?? 'idle',
      ...(previous?.error !== undefined ? { error: previous.error } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
    })
    this.bumpRevision()
    if (sessionId !== undefined) {
      this.readTracker.markRead(encodeRemoteSessionId(deviceId, sessionId))
    }
  }

  private withNativePane(view: DeviceView): DeviceView {
    const pane = this.nativePanes.get(view.id)
    if (pane === undefined) return view
    return {
      ...view,
      nativePaneState: pane.state,
      ...(pane.error !== undefined ? { nativePaneError: pane.error } : {}),
      ...(pane.sessionId !== undefined ? { nativePaneSessionId: pane.sessionId } : {}),
    }
  }

  /** Scope `session/modelCatalog` to the Session currently shown on the right. */
  activeSessionScope(): ActiveSessionScope {
    if (!this.activeSessionIsRemote || this.activeSessionDeviceId === undefined) {
      return { kind: 'local' }
    }
    const client = this.clients.get(this.activeSessionDeviceId)
    return {
      kind: 'remote',
      deviceId: this.activeSessionDeviceId,
      deviceName: client?.toView().name ?? String(this.activeSessionDeviceId),
      client,
    }
  }

  private notifyModelCatalogChanged(): void {
    for (const listener of this.modelCatalogListeners) {
      try { listener() } catch { /* ignore */ }
    }
  }

  onDisplayModeChanged(listener: (mode: DisplayMode) => void): () => void {
    this.modeListeners.add(listener)
    return () => this.modeListeners.delete(listener)
  }

  /** Host-authoritative UI mode. Defaults to aggregated for existing installs. */
  getDisplayMode(): DisplayMode {
    return this.displayMode
  }

  /** Aggregated mode is the only mode that may merge or route remote data. */
  isAggregatedMode(): boolean {
    return this.displayMode === 'aggregated'
  }

  /**
   * Persist and publish a mode change. The workspace stream recomputes its
   * snapshot immediately, so already-connected clients receive remove/upsert
   * frames for the rows that just became invisible (or visible again).
   */
  setDisplayMode(mode: DisplayMode): void {
    if (this.displayMode === mode) return
    this.displayMode = mode
    this.saveToDisk()
    this.bumpRevision()
    this.notifyWorkspacesChanged()
    this.syncNativePaneEmbedding()
    for (const listener of this.modeListeners) {
      try { listener(mode) } catch { /* ignore */ }
    }
  }

  startAll(): void {
    for (const config of this.configs.values()) {
      void this.mountClient(config)
    }
  }

  dispose(): void {
    // Persist the last captured catalogs before the timers are torn down.
    try {
      this.flushCatalogCache()
      this.saveToDisk()
    } catch {
      // Shutdown must stay best-effort.
    }
    for (const client of this.clients.values()) {
      client.stop()
    }
    this.clients.clear()
    if (this.catalogPersistTimer !== undefined) {
      clearTimeout(this.catalogPersistTimer)
      this.catalogPersistTimer = undefined
    }
    if (this.persistTimer !== undefined) {
      clearTimeout(this.persistTimer)
      this.persistTimer = undefined
    }
    if (this.sharedReadStateTimer !== undefined) {
      clearInterval(this.sharedReadStateTimer)
      this.sharedReadStateTimer = undefined
    }
    for (const timer of this.sharedReadStatePushTimers.values()) clearTimeout(timer)
    this.sharedReadStatePushTimers.clear()
    this.nativeProxyManager.dispose()
  }

  client(deviceId: DeviceId): RemoteDeviceClient | undefined {
    return this.clients.get(deviceId)
  }

  clientList(): RemoteDeviceClient[] {
    return [...this.clients.values()]
  }

  deviceConfig(deviceId: DeviceId): DeviceConfig | undefined {
    return this.configs.get(deviceId)
  }

  /** Add or update a device configuration, preventing self-loops. */
  async upsertDevice(input: UpsertDeviceInput): Promise<{ ok: true; device: DeviceView } | { ok: false; error: string }> {
    const name = input.name.trim()
    if (name === '') return { ok: false, error: 'Device name must not be empty' }

    if (this.isSelfLoop(input.transport)) {
      return {
        ok: false,
        error: 'Self-loop rejected: the target points to this local DSH host itself',
      }
    }

    if (input.transport.kind === 'ssh' && this.options.enableTunnels === false) {
      return { ok: false, error: 'SSH tunnels are disabled in plugin configuration' }
    }
    if (input.transport.kind === 'direct' && this.options.allowDirectTransport !== true) {
      return {
        ok: false,
        error: 'HTTP(S) direct transport is disabled; add the device over SSH',
      }
    }

    const id = input.id ? DeviceId(input.id.trim()) : DeviceId(`dev-${randomUUID().slice(0, 8)}`)
    if (id === LOCAL_DEVICE_ID) {
      return { ok: false, error: '"local" is a reserved device ID' }
    }

    const config: DeviceConfig = {
      id,
      name,
      ...(input.label !== undefined && input.label.trim() !== '' ? { label: input.label.trim() } : {}),
      enabled: input.enabled !== false,
      transport: input.transport,
      auth: input.auth ?? { mode: 'auto' },
      keepNativeAlive: input.keepNativeAlive !== false,
    }

    if (input.auth?.credential !== undefined) {
      this.authManager.setAuthCredential(id, input.auth.credential)
    }
    if (input.transport.kind === 'ssh') {
      const keyPath = input.transport.privateKeyPath?.trim() ?? ''
      if (input.transport.passphrase !== undefined && input.transport.passphrase.trim() !== '') {
        this.authManager.setSshPassphrase(id, input.transport.passphrase)
      } else if (keyPath === '') {
        // Switching back to Auto (SSH Agent / default keys) clears any old encrypted-key passphrase.
        this.authManager.setSshPassphrase(id, null)
      }
    }
    const sanitized = sanitizeDeviceConfig(config)
    this.configs.set(id, sanitized)
    this.authStates.delete(id)
    this.saveToDisk()

    const client = await this.mountClient(sanitized)
    this.bumpRevision()
    this.notifyWorkspacesChanged()
    return { ok: true, device: this.withNativePane(this.withAuthState(client.toView())) }
  }

  removeDevice(deviceId: DeviceId): boolean {
    const existing = this.configs.get(deviceId)
    if (existing === undefined) return false
    this.configs.delete(deviceId)
    const client = this.clients.get(deviceId)
    if (client !== undefined) {
      client.stop()
      this.clients.delete(deviceId)
    }
    this.nativeProxyManager.removeProxy(deviceId)
    this.authManager.removeDevice(deviceId)
    this.authStates.delete(deviceId)
    this.catalogs.delete(deviceId)
    this.nativePanes.delete(deviceId)
    this.nativeGroups.delete(deviceId)
    this.sharedReadStateInitialized.delete(deviceId)
    const pendingPush = this.sharedReadStatePushTimers.get(deviceId)
    if (pendingPush !== undefined) {
      clearTimeout(pendingPush)
      this.sharedReadStatePushTimers.delete(deviceId)
    }
    this.readTracker.retain(sessionId => {
      const decoded = decodeSessionId(sessionId)
      return !decoded.isRemote || decoded.deviceId !== deviceId
    })
    this.lastDeviceStates.delete(deviceId)
    if (this.paneEmbeddedDeviceId === deviceId) this.paneEmbeddedDeviceId = undefined
    this.saveToDisk()
    this.bumpRevision()
    this.notifyWorkspacesChanged()
    return true
  }

  reconnectDevice(deviceId: DeviceId): boolean {
    const client = this.clients.get(deviceId)
    if (client === undefined) return false
    this.authStates.delete(deviceId)
    client.reconnectNow()
    this.bumpRevision()
    return true
  }

  /** Current native-mode credential state for one device. */
  authStateOf(deviceId: DeviceId): DeviceAuthState {
    return this.authStates.get(deviceId)?.state ?? 'unknown'
  }

  private setAuthState(deviceId: DeviceId, state: DeviceAuthState, error?: string): void {
    const previous = this.authStates.get(deviceId)
    const nextError = error?.trim() === '' ? undefined : error
    if (previous?.state === state && previous.error === nextError) return
    this.authStates.set(deviceId, {
      state,
      ...(nextError !== undefined ? { error: nextError } : {}),
    })
    this.bumpRevision()
  }

  private withAuthState(view: DeviceView): DeviceView {
    const auth = this.authStates.get(view.id)
    if (auth === undefined) return view
    return {
      ...view,
      authState: auth.state,
      ...(auth.error !== undefined ? { authError: auth.error } : {}),
    }
  }

  /**
   * Re-authenticate one device on user request. An explicit credential (launch
   * URL/token) replaces the stored one; otherwise the SSH bootstrap path runs
   * again. Always forces a fresh cookie so a rotated remote secret recovers.
   */
  async authenticateDevice(
    deviceId: DeviceId,
    credential?: string,
  ): Promise<{ ok: true; authState: DeviceAuthState } | { ok: false; error: string }> {
    const storedConfig = this.configs.get(deviceId)
    const client = this.clients.get(deviceId)
    if (storedConfig === undefined || client === undefined) {
      return { ok: false, error: 'Device is not configured' }
    }
    if (credential !== undefined && credential.trim() !== '') {
      this.authManager.setAuthCredential(deviceId, credential.trim())
    }
    const config = this.hydrateConfig(storedConfig)
    const baseUrl = client.effectiveBaseUrl()
    if (baseUrl === undefined) {
      return { ok: false, error: 'The SSH tunnel is not ready yet. Try again in a moment.' }
    }
    this.authManager.invalidate(deviceId)
    // An explicit "repair via SSH" action may read the remote signing secret
    // even when the device opted out of automatic bootstrap. The opt-out only
    // governs background connects, not this deliberate user request.
    const repairConfig: DeviceConfig = {
      ...config,
      auth: { ...(config.auth ?? { mode: 'auto' }), mode: 'auto' },
      ...(config.transport.kind === 'ssh'
        ? {
            transport: {
              ...config.transport,
              bootstrapFromRemoteCredentials: true,
            },
          }
        : {}),
    }
    const result = await this.authManager.ensureAuthenticated(repairConfig, baseUrl, true)
    if (!result.ok) {
      this.setAuthState(deviceId, 'required', result.error)
      return result
    }
    this.setAuthState(deviceId, 'ok')
    return { ok: true, authState: 'ok' }
  }

  /** List local private-key candidates for the add/edit device form. */
  listSshKeys(): SshKeyEntry[] {
    return listLocalSshKeys()
  }

  /**
   * Create a Session directly on an explicitly chosen remote device. The
   * returned ID is namespaced exactly like a Session discovered by polling, so
   * the official Session view can open it immediately.
   */
  async createRemoteSession(
    input: RemoteSessionCreateInput,
  ): Promise<{ ok: true; sessionId: string; agentPreset?: string } | { ok: false; error: string }> {
    const client = this.clients.get(input.deviceId)
    if (client === undefined) return { ok: false, error: 'Device is not configured' }
    try {
      const created = (await client.invokeUnary('session', 'create', {
        request: {
          ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
          ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
          ...(input.agentPreset !== undefined ? { agentPreset: input.agentPreset } : {}),
        },
      })) as { sessionId: string; agentPreset?: string }
      await client.refreshSessionCatalog().catch(() => {})
      this.nativeProxyManager.requestRefresh(input.deviceId)
      this.bumpRevision()
      this.notifyWorkspacesChanged()
      return {
        ok: true,
        sessionId: encodeRemoteSessionId(input.deviceId, created.sessionId),
        ...(created.agentPreset !== undefined ? { agentPreset: created.agentPreset } : {}),
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Register one folder as a Workspace on a remote device. */
  async createRemoteWorkspace(
    input: RemoteWorkspaceCreateInput,
  ): Promise<{ ok: true; workspace: unknown } | { ok: false; error: string }> {
    const client = this.clients.get(input.deviceId)
    if (client === undefined) return { ok: false, error: 'Device is not configured' }
    try {
      const created = await client.invokeUnary('workspace', 'create', {
        request: { path: input.path },
      })
      this.bumpRevision()
      this.notifyWorkspacesChanged()
      return { ok: true, workspace: created }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Test reachability & authentication of a candidate device without saving it. */
  async testDeviceConnection(
    input: UpsertDeviceInput,
  ): Promise<{ ok: true; protocolVersion: string; remoteDshVersion?: string; latencyMs: number } | { ok: false; error: string }> {
    if (this.isSelfLoop(input.transport)) {
      return { ok: false, error: 'Self-loop rejected: target points to this local DSH host' }
    }
    if (input.transport.kind === 'direct' && this.options.allowDirectTransport !== true) {
      return {
        ok: false,
        error: 'HTTP(S) direct transport is disabled; add the device over SSH',
      }
    }

    const existingId = input.id !== undefined && input.id.trim() !== ''
      ? DeviceId(input.id.trim())
      : undefined
    const existingSecret = existingId !== undefined ? this.authManager.storedSecret(existingId) : undefined
    const effectiveTransport: UpsertDeviceInput['transport'] =
      input.transport.kind === 'ssh' &&
      (input.transport.passphrase === undefined || input.transport.passphrase === '') &&
      existingSecret?.sshPassphrase !== undefined &&
      existingSecret.sshPassphrase !== '' &&
      input.transport.privateKeyPath !== undefined &&
      input.transport.privateKeyPath.trim() !== ''
        ? { ...input.transport, passphrase: existingSecret.sshPassphrase }
        : input.transport
    const effectiveCredential =
      input.auth?.credential?.trim() || existingSecret?.authCredential

    let baseUrl: string
    let cleanup: (() => void) | undefined

    if (effectiveTransport.kind === 'ssh') {
      const probed = await probeSshTunnel(effectiveTransport)
      if (!probed.ok) return probed
      baseUrl = probed.baseUrl
      cleanup = probed.close
    } else {
      baseUrl = effectiveTransport.baseUrl.replace(/\/+$/, '')
    }

    const tempConfig: DeviceConfig = {
      id: DeviceId('probe-temp'),
      name: input.name || 'probe',
      enabled: true,
      transport: effectiveTransport,
      auth: {
        mode: input.auth?.mode ?? 'auto',
        ...(effectiveCredential !== undefined && effectiveCredential !== ''
          ? { credential: effectiveCredential }
          : {}),
      },
    }

    try {
      const t0 = Date.now()
      const authRes = await this.authManager.ensureAuthenticated(tempConfig, baseUrl, true)
      if (!authRes.ok) return authRes

      const headers: Record<string, string> = {
        ...this.authManager.getAuthHeaders(tempConfig),
        'content-type': 'application/json',
      }

      // Self-loop check by Host identity over any IP/alias
      const selfProbe = await requestRemote(new URL('/multi-device/api', baseUrl).href, {
        method: 'GET',
        headers,
        timeoutMs: 3_000,
      }).catch(() => undefined)
      if (selfProbe !== undefined && selfProbe.status === 200) {
        try {
          const parsedSelf = JSON.parse(selfProbe.body.toString('utf8')) as {
            ok?: boolean
            value?: { hostId?: string }
          }
          if (parsedSelf?.value?.hostId === this.hostId) {
            return { ok: false, error: 'Self-loop rejected: target points to this local DSH host' }
          }
        } catch {
          // Not a matching control-plane endpoint
        }
      }

      // Probe 0.2
      const res02 = await requestRemote(new URL('/api/session/list', baseUrl).href, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'client-request',
          rpcId: randomUUID(),
          method: 'session/list',
          payload: { args: { _request: {} } },
        }),
        timeoutMs: 15_000,
      }).catch(() => undefined)

      const listValue = res02 !== undefined && res02.status >= 200 && res02.status < 300
        ? parseProbeBody(res02.body).result?.value
        : undefined
      const listGen = classifyRemoteProtocol(listValue)

      // Probe 0.1 only when session/list did not already declare 0.2.
      // A versionless items body stays 0.2 unless host.describe says 0.1.
      let describeValue: unknown
      if (listGen !== '0.2') {
        const res01 = await requestRemote(new URL('/api/host.describe', baseUrl).href, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type: 'client-request',
            rpcId: randomUUID(),
            method: 'host.describe',
            payload: {},
          }),
          timeoutMs: 15_000,
        }).catch(() => undefined)
        if (res01 !== undefined && res01.status >= 200 && res01.status < 300) {
          describeValue = parseProbeBody(res01.body).result?.value
        }
      }

      const resolved = resolveProbedProtocol(listValue, describeValue)
      if (resolved !== undefined) {
        return {
          ok: true,
          protocolVersion: resolved.protocol,
          remoteDshVersion: resolved.version ?? (resolved.protocol === '0.2' ? '0.2.x' : '0.1.x'),
          latencyMs: Date.now() - t0,
        }
      }

      return {
        ok: false,
        error: describeProbeFailure(res02?.status, input),
      }
    } finally {
      this.authManager.removeDevice(tempConfig.id)
      cleanup?.()
    }
  }

  updateAggregationConfig(patch: Partial<WorkspaceAggregationConfig>): WorkspaceAggregationConfig {
    const updated = this.aggregator.setConfig(patch)
    this.saveToDisk()
    this.bumpRevision()
    this.notifyWorkspacesChanged()
    return updated
  }

  /** Wire the local Workspace controller so a match can register local folders. */
  setLocalWorkspaceCreator(creator: (path: string) => Promise<void>): void {
    this.localWorkspaceCreator = creator
  }

  /** Latest manual Git match state (running progress or the last outcome). */
  gitMatch(): GitMatchRun {
    return this.gitMatchRun
  }

  /**
   * Start the manual Git match run. This is the only trigger: nothing in the
   * device/session streams starts a scan or registers a workspace.
   */
  startGitMatch(): { ok: true } | { ok: false; error: string } {
    if (this.gitMatchRunner?.running === true) {
      return { ok: false, error: 'A Git match run is already in progress' }
    }
    const targets = this.gitMatchTargets()
    if (targets.length === 0) {
      return { ok: false, error: 'No device to scan' }
    }
    const runner = new GitMatchRunner({
      devices: () => this.gitMatchTargets(),
      discoverRemoteOrigins: (deviceId, paths) => this.discoverRemoteOrigins(deviceId, paths),
      scanRemoteRepos: (deviceId, roots) => this.scanRemoteRepos(deviceId, roots),
      scanLocalRepos: roots => scanLocalGitRepos(roots),
      createLocalWorkspace: async (path) => {
        if (this.localWorkspaceCreator === undefined) {
          return { ok: false as const, error: 'Local workspace creation is unavailable' }
        }
        try {
          await this.localWorkspaceCreator(path)
          return { ok: true as const }
        } catch (error) {
          return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
        }
      },
      createRemoteWorkspace: async (deviceId, path) => {
        const res = await this.createRemoteWorkspace({ deviceId, path })
        return res.ok ? { ok: true as const } : { ok: false as const, error: res.error }
      },
      noteOrigin: (deviceId, path, rawOrigin) => {
        this.aggregator.noteGitRemote(deviceId, path, rawOrigin)
      },
      localHome: () => homedir(),
      onProgress: (run) => {
        this.gitMatchRun = run
        this.bumpRevision()
        // Persist the outcome, not every progress tick.
        if (run.status !== 'running') this.saveToDisk()
      },
    })
    this.gitMatchRunner = runner
    void runner.execute()
    return { ok: true }
  }

  /** Ask the running manual Git match to stop. */
  cancelGitMatch(): boolean {
    return this.gitMatchRunner?.cancel() === true
  }

  private gitMatchTargets(): GitMatchDeviceTarget[] {
    const targets: GitMatchDeviceTarget[] = [
      {
        deviceId: LOCAL_DEVICE_ID,
        deviceName: 'Local',
        state: 'connected',
        local: true,
        home: homedir(),
        workspacePaths: this.localHost.localWorkspaces().map(ws => ws.path),
      },
    ]
    for (const [deviceId, config] of this.configs) {
      const client = this.clients.get(deviceId)
      const view = client?.toView()
      targets.push({
        deviceId,
        deviceName: view?.name ?? config.name,
        state: view?.state ?? 'connecting',
        local: false,
        ...(view?.remoteHome !== undefined ? { home: view.remoteHome } : {}),
        workspacePaths: client?.workspaceItems().map(ws => ws.path) ?? [],
      })
    }
    return targets
  }

  private async discoverRemoteOrigins(
    deviceId: DeviceId,
    paths: readonly string[],
  ): Promise<Map<string, string>> {
    if (paths.length === 0) return new Map()
    const storedConfig = this.configs.get(deviceId)
    if (storedConfig === undefined || storedConfig.transport.kind !== 'ssh') return new Map()
    const config = this.hydrateConfig(storedConfig)
    if (config.transport.kind !== 'ssh') return new Map()
    const found = await discoverRemoteGitRemotesViaSsh(config.transport, paths)
    for (const [path, rawUrl] of found) this.aggregator.noteGitRemote(deviceId, path, rawUrl)
    return found
  }

  private async scanRemoteRepos(
    deviceId: DeviceId,
    roots: readonly string[],
  ): Promise<{ ok: true; repos: ScannedRepository[] } | { ok: false; error: string }> {
    const storedConfig = this.configs.get(deviceId)
    if (storedConfig === undefined) return { ok: false, error: 'Device is not configured' }
    const config = this.hydrateConfig(storedConfig)
    if (config.transport.kind !== 'ssh') {
      return { ok: false, error: 'Scanning requires an SSH transport' }
    }
    return scanRemoteGitRepos(config.transport, roots)
  }

  /**
   * Local archived Session IDs. A missing provider (older callers, tests that
   * do not care) or a stale controller simply means "nothing archived", so a
   * read failure must never break the whole snapshot.
   */
  private localArchivedIds(): string[] {
    try {
      return (this.localHost.localArchivedSessionIds?.() ?? []).map(String)
    } catch {
      return []
    }
  }

  /** Local subagent-origin Session IDs; same failure policy as {@link localArchivedIds}. */
  private localSubagentIds(): string[] {
    try {
      return (this.localHost.localSubagentSessionIds?.() ?? []).map(String)
    } catch {
      return []
    }
  }

  /** Build the complete snapshot for the Client UI and Aggregated Gateway. */
  snapshot(): MultiDeviceSnapshot {
    const physicalInputs: PhysicalWorkspaceInput[] = [...this.localHost.localWorkspaces()]
    const updatedAtMap = this.localHost.localSessionUpdatedAt()
    const sessionOrigins: Record<string, SessionOriginMetadata> = Object.create(null)
    const archivedSessionIds = new Set<string>(this.localArchivedIds())
    const subagentSessionIds = new Set<string>(this.localSubagentIds())

    for (const client of this.clients.values()) {
      const view = client.toView()
      const summaries = client.sessionSummaries()
      const runningBySession = new Map<string, boolean>()
      const archived = new Set(client.archivedIds())
      for (const archivedId of archived) {
        archivedSessionIds.add(encodeRemoteSessionId(client.id, archivedId))
      }
      const attached = new Set(
        client.workspaceItems().flatMap(ws => [...ws.sessionIds]),
      )
      /**
       * A workspace registered by the manual Git match starts with an empty
       * `sessionIds` list, so Sessions created there before the registration
       * would stay invisible. DSH itself links a Session to a workspace by the
       * exact canonical cwd; mirror that rule read-only, without taking over
       * another workspace's members.
       */
      const orphanByCwd = new Map<string, string[]>()
      for (const s of summaries) {
        if (s.blank || s.cwd === undefined || s.parentSessionId !== undefined) continue
        if (archived.has(s.sessionId) || attached.has(s.sessionId)) continue
        const key = normalizeWorkspacePath(s.cwd)
        if (key === '') continue
        const list = orphanByCwd.get(key) ?? []
        list.push(s.sessionId)
        orphanByCwd.set(key, list)
      }

      for (const s of summaries) {
        const namespacedId = client.namespaceSummary(s).sessionId
        updatedAtMap.set(namespacedId, s.updatedAt)
        runningBySession.set(s.sessionId, s.running)
        if (s.origin === 'subagent') subagentSessionIds.add(namespacedId)
        const pending = client.pendingInteractionList().find(p => p.rawSessionId === s.sessionId)
        sessionOrigins[namespacedId] = {
          namespacedSessionId: namespacedId,
          rawSessionId: s.sessionId,
          deviceId: client.id,
          deviceName: view.name,
          deviceState: view.state,
          ...(s.cwd !== undefined ? { cwd: s.cwd } : {}),
          ...(s. cwd !== undefined ? { gitRemote: this.aggregator.getCachedGitRemote(client.id, s.cwd) } : {}),
          running: s.running,
          ...(pending !== undefined ? { pendingInteractionKind: pending.kind } : {}),
          ...(view.nativeProxyUrl !== undefined ? { nativeUrl: view.nativeProxyUrl } : {}),
        }
      }

      for (const ws of client.workspaceItems()) {
        const adopted = orphanByCwd.get(normalizeWorkspacePath(ws.path)) ?? []
        const sessionIds = adopted.length === 0 ? [...ws.sessionIds] : [...ws.sessionIds, ...adopted]
        const runningCount = sessionIds.filter(id => runningBySession.get(id) === true).length
        physicalInputs.push({
          deviceId: client.id,
          deviceName: view.name,
          workspaceId: ws.workspaceId,
          path: ws.path,
          title: ws.title,
          sessionIds,
          runningSessionCount: runningCount,
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt,
        })
      }
    }

    const deviceStates = new Map<DeviceId, DeviceConnectionState>([
      [LOCAL_DEVICE_ID, 'connected'],
    ])
    for (const [deviceId, client] of this.clients.entries()) {
      deviceStates.set(deviceId, client.toView().state)
    }

    const { logicalWorkspaces, allPhysicalWorkspaces } = this.aggregator.aggregate(
      physicalInputs,
      updatedAtMap,
      deviceStates,
    )

    // Backfill logicalWorkspaceId onto sessionOrigins
    for (const lws of logicalWorkspaces) {
      for (const sid of lws.sessionIds) {
        const origin = sessionOrigins[sid]
        if (origin !== undefined) {
          sessionOrigins[sid] = {
            ...origin,
            logicalWorkspaceId: lws.logicalWorkspaceId,
            ...(lws.gitRemote !== undefined ? { gitRemote: lws.gitRemote } : {}),
          }
        }
      }
    }

    return {
      revision: this.revision,
      hostId: this.hostId,
      displayMode: this.displayMode,
      hostStatus: {
        aggregatedGatewayActive: this.aggregatedGatewayActive,
        ...(this.aggregatedGatewayError !== undefined ? { aggregatedGatewayError: this.aggregatedGatewayError } : {}),
        nativeProxyActive: this.nativeProxyActive,
      },
      devices: [...this.clients.values()].map(c => this.withNativePane(this.withAuthState(c.toView()))),
      sshConfigHosts: listSshConfigHosts(),
      aggregationConfig: this.aggregator.getConfig(),
      logicalWorkspaces,
      allPhysicalWorkspaces,
      sessionOrigins,
      unreadSessionIds: this.readTracker.unreadIds(),
      archivedSessionIds: [...archivedSessionIds].sort(),
      subagentSessionIds: [...subagentSessionIds].sort(),
      gitMatch: this.gitMatchRun,
      ui: this.uiPreferences,
    }
  }

  /** Persisted display preferences (Snapshot also carries them under `ui`). */
  ui(): MultiDeviceUiPreferences {
    return this.uiPreferences
  }

  /** Update and persist display preferences; unknown keys are ignored by the type. */
  updateUiPreferences(patch: Partial<MultiDeviceUiPreferences>): MultiDeviceUiPreferences {
    this.uiPreferences = {
      sessionRowDeviceDot: patch.sessionRowDeviceDot === undefined
        ? this.uiPreferences.sessionRowDeviceDot
        : patch.sessionRowDeviceDot === true,
      nativePane: patch.nativePane === undefined
        ? this.uiPreferences.nativePane
        : patch.nativePane === true,
      crossHostReadState: patch.crossHostReadState === undefined
        ? this.uiPreferences.crossHostReadState
        : patch.crossHostReadState === true,
    }
    this.saveToDisk()
    this.bumpRevision()
    this.syncNativePaneEmbedding()
    this.syncSharedReadStateTimer()
    return this.uiPreferences
  }

  /**
   * Wait for a device to become reachable, bounded by `timeoutMs`.
   *
   * The local machine is always reachable; an unconfigured or disabled device
   * answers false immediately. Callers use this before opening a Session so a
   * tunnel that is still coming back up does not surface as a transport error.
   */
  async waitForDeviceConnected(
    deviceId: DeviceId,
    signal: AbortSignal,
    timeoutMs: number,
  ): Promise<boolean> {
    if (deviceId === LOCAL_DEVICE_ID) return true
    const client = this.clients.get(deviceId)
    if (client === undefined) return false
    if (client.isConnected()) return true
    if (!client.deviceConfig.enabled) return false
    return client.waitForConnected(signal, timeoutMs)
  }

  /** Resolve which remote client owns a given namespaced session ID. */
  resolveSessionOwner(sessionId: string): { client: RemoteDeviceClient; rawSessionId: string } | undefined {
    const decoded = decodeSessionId(sessionId)
    if (!decoded.isRemote) return undefined
    const client = this.clients.get(decoded.deviceId)
    if (client === undefined) return undefined
    return { client, rawSessionId: decoded.rawSessionId }
  }

  private hydrateConfig(config: DeviceConfig): DeviceConfig {
    const secret = this.authManager.storedSecret(config.id)
    const credential = secret?.authCredential
    const passphrase = secret?.sshPassphrase
    return {
      ...config,
      auth: {
        ...config.auth,
        ...(credential !== undefined && credential !== '' ? { credential } : {}),
      },
      transport:
        config.transport.kind === 'ssh' && passphrase !== undefined && passphrase !== ''
          ? { ...config.transport, passphrase }
          : config.transport,
    }
  }

  private async mountClient(storedConfig: DeviceConfig): Promise<RemoteDeviceClient> {
    const config = this.hydrateConfig(storedConfig)
    let client = this.clients.get(config.id)
    const callbacks: RemoteDeviceCallbacks = {
      onStateChanged: (deviceId) => {
        this.bumpRevision()
        this.scheduleCatalogPersist()
        // A device going offline/online changes which physical member is the
        // effective "+ New Session" target, so the workspace projection must be
        // recomputed (not only the JSON snapshot). Without this wake, the
        // logical workspace keeps its old path and device until an unrelated
        // workspace event happens to arrive.
        const state = this.clients.get(deviceId)?.connectionState
        if (state === 'connected') {
          this.reconcileRunningForDevice(deviceId)
          this.maybeInitializeSharedReadState(deviceId)
        } else {
          this.sharedReadStateInitialized.delete(deviceId)
        }
        if (state !== undefined && this.lastDeviceStates.get(deviceId) !== state) {
          this.lastDeviceStates.set(deviceId, state)
          this.notifyWorkspacesChanged()
        }
        // Connecting/disconnecting the device that owns the open Session also
        // changes which catalog is authoritative for that conversation.
        if (
          this.activeSessionIsRemote &&
          this.activeSessionDeviceId === deviceId
        ) {
          this.notifyModelCatalogChanged()
        }
      },
      onModelCatalogChanged: (deviceId) => {
        if (
          this.activeSessionIsRemote &&
          this.activeSessionDeviceId === deviceId
        ) {
          this.notifyModelCatalogChanged()
        }
      },
      onRemoteEventFrame: (deviceId, frame) => {
        this.observeRemoteFrame(deviceId, frame)
        for (const listener of this.eventListeners) listener(deviceId, frame)
      },
      onControlProjectionFrame: (deviceId, frame) => {
        for (const listener of this.projectionListeners) listener(deviceId, frame)
      },
      onWorkspacesChanged: (deviceId) => {
        this.reconcileRunningForDevice(deviceId)
        this.bumpRevision()
        this.notifyWorkspacesChanged()
        this.scheduleCatalogPersist()
      },
      onGitRemotesDiscovered: (deviceId, remotesByPath) => {
        for (const [path, rawUrl] of remotesByPath.entries()) {
          this.aggregator.noteGitRemote(deviceId, path, rawUrl)
        }
        this.bumpRevision()
      },
      onAuthState: (deviceId, state, error) => {
        this.setAuthState(deviceId, state, error)
      },
    }

    if (client === undefined) {
      client = new RemoteDeviceClient(config, this.authManager, callbacks)
      client.hydrateCatalog(this.catalogs.get(config.id))
      this.clients.set(config.id, client)
      this.seedRunningFromCatalog(client)
    } else {
      client.updateConfig(config)
    }

    if (this.nativeProxyActive) {
      const proxyUrl = await this.nativeProxyManager.ensureProxy(config, () => client.effectiveBaseUrl())
      client.setNativeProxyUrl(proxyUrl)
      if (proxyUrl !== undefined) this.bumpRevision()
    }

    if (config.enabled) {
      client.start()
    }
    return client
  }

  private isSelfLoop(transport: UpsertDeviceInput['transport']): boolean {
    const localPort = this.localHost.localPort()
    if (localPort === undefined) return false
    if (transport.kind === 'direct') {
      try {
        const url = new URL(transport.baseUrl)
        const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
        const isLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname.toLowerCase())
        return isLoopback && port === localPort
      } catch {
        return false
      }
    }
    // An SSH tunnel pointing back at this same DSH listener creates a loop.
    // Resolve `~/.ssh/config` so an alias pointing at 127.0.0.1:22 is caught,
    // while a non-22 SSH port (e.g. a local VM/container port forward) is allowed.
    const resolved = resolveSshConfigForTransport(transport)
    const hostPart = resolved.hostName.trim().toLowerCase()
    const remotePort = transport.remotePort ?? 3080
    const sshPort = resolved.port
    return (
      ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostPart) &&
      sshPort === 22 &&
      resolved.proxyJump === undefined &&
      resolved.proxyCommand === undefined &&
      remotePort === localPort
    )
  }

  /**
   * Publish a workspace-set change made directly through the aggregator
   * (a logical-workspace split, an external organizer, ...). Workspace
   * consumers derive both data and visibility from the registry snapshot, so
   * they must be woken even when no platform controller method ran.
   */
  refreshWorkspaceView(): void {
    this.bumpRevision()
    this.notifyWorkspacesChanged()
  }

  private bumpRevision(): void {
    this.revision += 1
    for (const listener of this.listeners) {
      try { listener() } catch { /* ignore */ }
    }
  }

  private notifyWorkspacesChanged(): void {
    for (const listener of this.workspaceListeners) {
      try { listener() } catch { /* ignore */ }
    }
  }

  private loadFromDisk(): void {
    if (!existsSync(this.dataFilePath)) return
    let migratedSecrets = false
    try {
      const raw = JSON.parse(readFileSync(this.dataFilePath, 'utf8')) as Partial<PersistedRegistryDocument>
      if (typeof raw.hostId === 'string' && /^[A-Za-z0-9-]{8,80}$/.test(raw.hostId)) {
        this.hostId = raw.hostId
      }
      if (Array.isArray(raw.devices)) {
        for (const dev of raw.devices) {
          if (dev && typeof dev.id === 'string' && typeof dev.name === 'string' && dev.transport) {
            const id = DeviceId(dev.id)
            // Migrate credentials that older builds wrote into the device file.
            const legacyCredential = dev.auth?.credential
            const legacyPassphrase = dev.transport.kind === 'ssh' ? dev.transport.passphrase : undefined
            if (legacyCredential !== undefined && legacyCredential.trim() !== '') {
              this.authManager.setAuthCredential(id, legacyCredential)
              migratedSecrets = true
            }
            if (legacyPassphrase !== undefined && legacyPassphrase.trim() !== '') {
              this.authManager.setSshPassphrase(id, legacyPassphrase)
              migratedSecrets = true
            }
            this.configs.set(id, sanitizeDeviceConfig(dev))
          }
        }
      }
      if (raw.aggregation && typeof raw.aggregation === 'object') {
        this.aggregator.setConfig({ ...DEFAULT_AGGREGATION_CONFIG, ...raw.aggregation })
      }
      if (raw.ui && typeof raw.ui === 'object') {
        this.uiPreferences = {
          sessionRowDeviceDot: raw.ui.sessionRowDeviceDot === true,
          // Older documents predate the preference; the pane is the default.
          nativePane: raw.ui.nativePane !== false,
          crossHostReadState: raw.ui.crossHostReadState === true,
        }
      }
      if (raw.displayMode === 'native') this.displayMode = 'native'
      else if (raw.displayMode === 'aggregated') this.displayMode = 'aggregated'
      if (raw.catalogs && typeof raw.catalogs === 'object') {
        for (const [deviceId, catalog] of Object.entries(raw.catalogs)) {
          if (this.configs.has(DeviceId(deviceId))) {
            this.catalogs.set(DeviceId(deviceId), catalog)
          }
        }
      }
      for (const [deviceId, groups] of Object.entries(sanitizeNativeGroups(raw.nativeGroups))) {
        if (this.configs.has(deviceId)) this.nativeGroups.set(deviceId, groups)
      }
      if (raw.readState && typeof raw.readState === 'object') {
        this.readTracker.hydrate(raw.readState.entries)
        this.readTracker.retain(sessionId => {
          const decoded = decodeSessionId(sessionId)
          return !decoded.isRemote || this.configs.has(decoded.deviceId)
        })
      }
      if (raw.gitMatch && typeof raw.gitMatch === 'object') {
        const restored = raw.gitMatch as GitMatchRun
        // A run cannot survive the process that was driving it.
        this.gitMatchRun = restored.status === 'running'
          ? {
              ...restored,
              status: 'failed',
              phase: 'finished',
              error: 'Interrupted before completion',
              currentDeviceId: undefined,
              currentDeviceName: undefined,
              currentProject: undefined,
            }
          : restored
      }
      if (migratedSecrets) this.saveToDisk()
    } catch {
      // Ignore corrupt config file
    }
  }

  /** Persisted catalog of one device (hydrated cache or the last capture). */
  deviceCatalog(deviceId: DeviceId): DeviceCatalogCache | undefined {
    return this.catalogs.get(deviceId)
  }

  /**
   * Replace the persisted catalog of one device. Used for hydration and by
   * tests; live clients are captured through {@link scheduleCatalogPersist}.
   */
  setDeviceCatalog(cache: DeviceCatalogCache): void {
    this.catalogs.set(cache.deviceId, trimCatalog(cache))
  }

  /**
   * Capture every live client's catalog and write it to disk. Debounced: the
   * session/workspace streams can burst many changes per turn, and the file is
   * rewritten atomically on each save.
   */
  private scheduleCatalogPersist(): void {
    if (this.catalogPersistTimer !== undefined) return
    this.catalogPersistTimer = setTimeout(() => {
      this.catalogPersistTimer = undefined
      try {
        this.flushCatalogCache()
        this.saveToDisk()
      } catch {
        // Persisting the catalog must never break the live aggregation.
      }
    }, 3_000)
    // Do not keep the Host process alive just for this timer.
    if (typeof this.catalogPersistTimer === 'object' && this.catalogPersistTimer !== null) {
      const timer = this.catalogPersistTimer as { unref?: () => void }
      timer.unref?.()
    }
  }

  /** Copy each client's current catalog into the durable map. */
  private flushCatalogCache(): void {
    for (const [deviceId, client] of this.clients.entries()) {
      const snapshot = client.catalogSnapshot()
      if (snapshot.syncedAt === 0 && snapshot.sessions.length === 0 && snapshot.workspaces.length === 0) continue
      this.catalogs.set(deviceId, trimCatalog(snapshot))
    }
  }

  saveToDisk(): void {
    const dir = dirname(this.dataFilePath)
    mkdirSync(dir, { recursive: true })
    const tmp = `${this.dataFilePath}.${randomUUID()}.tmp`
    const readEntries = this.readTracker.entriesSnapshot()
    const doc: PersistedRegistryDocument = {
      version: 1,
      devices: [...this.configs.values()],
      aggregation: this.aggregator.getConfig(),
      displayMode: this.displayMode,
      gitMatch: this.gitMatchRun,
      ui: this.uiPreferences,
      hostId: this.hostId,
      ...(this.catalogs.size > 0
        ? { catalogs: Object.fromEntries(this.catalogs) }
        : {}),
      ...(this.nativeGroups.size > 0
        ? { nativeGroups: Object.fromEntries(this.nativeGroups) }
        : {}),
      ...(Object.keys(readEntries).length > 0
        ? { readState: { entries: readEntries } }
        : {}),
    }
    try {
      writeFileSync(tmp, JSON.stringify(doc, null, 2), { mode: 0o600 })
      try { chmodSync(tmp, 0o600) } catch { /* Windows fallback */ }
      copyFileSync(tmp, this.dataFilePath)
      try { chmodSync(this.dataFilePath, 0o600) } catch { /* Windows fallback */ }
    } finally {
      try { unlinkSync(tmp) } catch { /* sibling may not exist if the write failed */ }
    }
  }
}

const CATALOG_SESSION_LIMIT = 2_000
const CATALOG_WORKSPACE_LIMIT = 300
const CATALOG_ID_LIMIT = 5_000

/**
 * Bound one device's persisted catalog. A device with thousands of Sessions
 * (long-lived dev boxes) must not turn the plugin data file into a choke point;
 * the newest Sessions are the ones the sidebar actually shows.
 */
function trimCatalog(cache: DeviceCatalogCache): DeviceCatalogCache {
  const sessions = cache.sessions.length > CATALOG_SESSION_LIMIT
    ? [...cache.sessions]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, CATALOG_SESSION_LIMIT)
    : cache.sessions
  return {
    ...cache,
    sessions,
    workspaces: cache.workspaces.length > CATALOG_WORKSPACE_LIMIT
      ? cache.workspaces.slice(0, CATALOG_WORKSPACE_LIMIT)
      : cache.workspaces,
    archivedSessionIds: cache.archivedSessionIds.slice(0, CATALOG_ID_LIMIT),
    pinnedSessionIds: cache.pinnedSessionIds.slice(0, CATALOG_ID_LIMIT),
  }
}

function parseProbeBody(body: Buffer): { result?: { value?: { version?: string } } } {
  try {
    return JSON.parse(body.toString('utf8')) as { result?: { value?: { version?: string } } }
  } catch {
    return {}
  }
}

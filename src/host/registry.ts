/**
 * Persistent Device Registry (`DeviceRegistry`) for Native Mode.
 *
 * Coordinates:
 * - Persisted device list in `$DSH_HOME/plugins/dsh-multi-device.json` (`0600` atomic write).
 * - Per-device `RemoteDeviceClient` and `NativeDeviceProxy` lifecycles.
 * - Self-loop detection so a user cannot accidentally add the local DSH host as a remote device.
 * - Live snapshot generation (`MultiDeviceSnapshot`) for the UI.
 *
 * @module dsh-multi-device/host/registry
 */
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  type DeviceAuthState,
  type DeviceCatalogCache,
  type DeviceConfig,
  type DeviceConnectionState,
  DeviceId,
  type DeviceView,
  decodeSessionId,
  encodeRemoteSessionId,
  LOCAL_DEVICE_ID,
  type MultiDeviceSnapshot,
  type NativePaneState,
  type MultiDeviceUiPreferences,
  type SshKeyEntry,
  type UpsertDeviceInput,
} from '../contract.ts'
import {
  type DeviceAttentionView,
  emptyDeviceAttention,
  selectDeviceAttention,
  type SessionAttentionFact,
} from '../attention.ts'
import { readRemoteCompletionIdentity } from './completion-identity.ts'
import { DeviceAuthManager } from './auth.ts'
import { decodeCatalogDocument, decodeLegacyCatalogs, encodeCatalogDocument } from './catalog-codec.ts'
import { JsonSnapshotFile } from './storage.ts'
import { requestRemote } from './http-request.ts'
import { sanitizeGroupState } from './native-bridge.ts'
import { NativeProxyManager, sanitizeBridgeTitle } from './native-proxy.ts'
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
 * Join the remote Sessions an attention menu can open to the titles the Host
 * already holds for them.
 *
 * Pure on purpose: the catalog is only reached through `titlesFor`, which is
 * called at most once per device that actually appears in `attention`. Only
 * remote IDs are emitted — local conversations are named by the browser's own
 * Session store, which is live and knows renames first.
 */
export function collectAttentionSessionTitles(
  attention: Readonly<Record<string, DeviceAttentionView>>,
  titlesFor: (deviceId: DeviceId) => ReadonlyMap<string, string> | undefined,
): Record<string, string> {
  const titles: Record<string, string> = {}
  const perDevice = new Map<DeviceId, ReadonlyMap<string, string> | undefined>()
  const seen = new Set<string>()
  for (const view of Object.values(attention)) {
    for (const sessionId of [...view.runningSessionIds, ...view.pendingSessionIds, ...view.unreadSessionIds]) {
      if (seen.has(sessionId)) continue
      seen.add(sessionId)
      const decoded = decodeSessionId(sessionId)
      if (!decoded.isRemote) continue
      if (!perDevice.has(decoded.deviceId)) perDevice.set(decoded.deviceId, titlesFor(decoded.deviceId))
      const title = perDevice.get(decoded.deviceId)?.get(decoded.rawSessionId)?.trim()
      if (title !== undefined && title !== '') titles[sessionId] = title
    }
  }
  return titles
}

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
 * Credentials never belong in the device document. Keep the
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
  /** Last-known catalogs, keyed by device id, so offline devices keep their last-known counts. */
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
  crossHostReadState: false,
}

/**
 * How often a connected device re-reads `session/list`.
 *
 * `api-session/status` is a single frame: one lost across a stream gap would
 * leave a finished Session "running" forever. The list is the authoritative
 * repair path (`reconcileSessionSummaries` → `reconcileRunningForDevice`), so a
 * low-frequency refresh bounds how long a stale count can survive.
 */
const RUNNING_RECONCILE_INTERVAL_MS = 45_000

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
  /** Full persisted + live identities. Undefined means unavailable, never an authoritative empty list. */
  readonly localSessionCatalog?: (signal?: AbortSignal) => Promise<readonly SessionAttentionFact[] | undefined>
  /** Local webserver port, used for self-loop prevention. */
  readonly localPort: () => number | undefined
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

export class DeviceRegistry {
  readonly authManager: DeviceAuthManager
  readonly nativeProxyManager: NativeProxyManager

  private readonly configs = new Map<DeviceId, DeviceConfig>()
  private readonly clients = new Map<DeviceId, RemoteDeviceClient>()
  /** Invalidates asynchronous proxy mounts when a device is updated, removed or disposed. */
  private readonly mountGenerations = new Map<DeviceId, number>()
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

  /** Navigation belongs to a browser instance, never to the Host process. */
  private readonly activeSessions = new Map<string, { sessionId?: string; seq: number }>()

  private revision = 1

  private readonly snapshotCache = new Map<string, { readonly revision: number; readonly value: MultiDeviceSnapshot }>()
  private disposed = false
  private readonly lifetime = new AbortController()
  private localCatalog: readonly SessionAttentionFact[] | undefined
  private localCatalogFresh = false
  private localCatalogInflight: Promise<void> | undefined
  private localCatalogMutations: Array<(rows: readonly SessionAttentionFact[]) => readonly SessionAttentionFact[]> | undefined
  private readonly localStatus = new Map<string, boolean>()
  private readonly localPending = new Map<string, { sessionId: string; kind: 'approval' | 'question' | 'plan-review' }>()
  private readonly authStates = new Map<DeviceId, { state: DeviceAuthState; error?: string }>()
  /** Durable mirror of each device catalog (see {@link DeviceCatalogCache}). */
  private readonly catalogs = new Map<DeviceId, DeviceCatalogCache>()
  /** Why one device's summaries could not be projected into the merged `session.list`. */
  private readonly sessionListErrors = new Map<DeviceId, string>()
  /**
   * Live `$events` generations that must be told to (re)publish Session
   * summaries before a Workspace row referencing them reaches the sidebar.
   */
  private readonly sessionPublishListeners = new Set<(sessionIds: readonly string[]) => void>()
  /** Injected Native Pane bridge lifecycle, last page selection/title, and visibility per device. */
  private readonly nativePanes = new Map<string, {
    state: NativePaneState
    error?: string
    sessionId?: string
    title?: string
    visible?: boolean
  }>()
  /** Previous connection state per device, so workspace rows are recomputed on a real transition. */
  private readonly lastDeviceStates = new Map<DeviceId, DeviceConnectionState>()
  /** Host-owned fold state per device, restored into the framed page before its first render. */
  private readonly nativeGroups = new Map<DeviceId, Record<string, boolean>>()
  private readonly remoteRunningEvidence = new Map<string, number>()
  private readonly completionBindings = new Map<string, { completionId: string; generation: number }>()
  private readonly completionBindingOffsets = new Map<DeviceId, number>()
  private readonly sharedReadStateDirty = new Set<DeviceId>()

  private readonly sharedReadStateFailures = new Map<DeviceId, number>()
  /** Host-owned read/unread state for namespaced remote Sessions. */
  private readonly readTracker = new ReadStateTracker((sessionId, state, unreadChanged) => {
    const decoded = decodeSessionId(sessionId)
    const generation = decoded.isRemote ? this.clients.get(decoded.deviceId)?.connectionGeneration : undefined
    if (state.unread && state.completionId !== undefined && !state.completionId.startsWith('legacy:') && !state.completionId.startsWith('turn:') && generation !== undefined && this.remoteRunningEvidence.get(sessionId) === generation) {
      this.completionBindings.set(sessionId, { completionId: state.completionId, generation })
      while (this.completionBindings.size > 2_000) this.completionBindings.delete(this.completionBindings.keys().next().value!)
    }
    this.schedulePersist()
    if (unreadChanged) this.bumpRevision()
    this.publishUnreadState(sessionId)
  })
  /** Stable Host identity (used by the optional cross-Host state file). */
  private hostId: string = randomUUID()
  /** Identity of this Host process; clients reset their revision when it changes. */
  private readonly hostEpoch: string = randomUUID()
  /** Low-frequency catalog refresh that heals lost running-status frames. */
  private runningReconcileTimer: ReturnType<typeof setInterval> | undefined
  private uiPreferences: MultiDeviceUiPreferences = { ...DEFAULT_UI_PREFERENCES }
  private catalogPersistTimer: ReturnType<typeof setTimeout> | undefined
  private persistTimer: ReturnType<typeof setTimeout> | undefined
  /** Optional cross-Host read-state polling and per-device push debounce. */
  private sharedReadStateTimer: ReturnType<typeof setInterval> | undefined
  private readonly sharedReadStateInFlight = new Set<DeviceId>()
  private readonly sharedReadStateInitialized = new Set<DeviceId>()
  private readonly sharedReadStatePushTimers = new Map<DeviceId, ReturnType<typeof setTimeout>>()

  private readonly storage: JsonSnapshotFile
  private readonly catalogStorage: JsonSnapshotFile
  private catalogWrite: Promise<void> | undefined
  private catalogWriteAgain = false
  private catalogDirty = false
  private catalogMigrationPending = false
  private catalogPersistFailures = 0
  private catalogPersistenceError: string | undefined

  constructor(
    private readonly dataFilePath: string,
    secretsFilePath: string,
    private readonly localHost: LocalHostProvider,
    private readonly options: {
      enableTunnels?: boolean
      localOrigin?: () => string | undefined
      allowDirectTransport?: boolean
    } = {},
  ) {
    this.storage = new JsonSnapshotFile(dataFilePath, value => value.version === 1 && Array.isArray(value.devices))
    this.catalogStorage = new JsonSnapshotFile(join(dirname(dataFilePath), 'catalogs.json'),
      value => value.version === 2 && typeof value.catalogs === 'object' && value.catalogs !== null && !Array.isArray(value.catalogs))
    this.authManager = new DeviceAuthManager(secretsFilePath)
    this.nativeProxyManager = new NativeProxyManager(
      this.authManager,
      options.localOrigin,
      {
        onAuthState: (deviceId, state, error) => {
          this.setAuthState(deviceId, state, error)
        },
        onBridgeState: (deviceId, state, error, clientId) => {
          this.setNativePaneState(deviceId, state, error, clientId)
        },
        onBridgeSelection: (deviceId, sessionId, clientId) => {
          this.setNativePaneSelection(deviceId, sessionId, clientId)
        },
        onBridgeTitle: (deviceId, title, clientId) => {
          this.setNativePaneTitle(deviceId, title, clientId)
        },
        onBridgeVisibility: (deviceId, visible, clientId) => {
          this.setNativePaneVisibility(deviceId, visible, clientId)
        },
        onPortAllocated: (deviceId, port) => {
          this.persistNativeProxyPort(deviceId, port)
        },
        getGroupState: deviceId => this.nativeGroups.get(deviceId),
        onGroupState: (deviceId, groups) => {
          this.setNativeGroupState(deviceId, groups)
        },
        getUnreadState: deviceId => this.unreadForDevice(deviceId),
        getReadCompletions: deviceId => this.completionsForDevice(deviceId),
        onBridgeRead: (deviceId, sessionId, expectedCompletionId) => {
          const id = encodeRemoteSessionId(deviceId, sessionId)
          if (expectedCompletionId !== undefined) return this.readTracker.readCompletion(id, expectedCompletionId)
          this.readTracker.markRead(id)
        },
      },
    )
    this.loadFromDisk()
    if (this.catalogMigrationPending) {
      this.catalogDirty = true
      void this.persistCatalogsAsync().catch(() => {})
    }
    this.syncSharedReadStateTimer()
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
   * Ask every live multiplexed `$events` generation to publish
   * `api-session/added` for the given namespaced Session ids.
   *
   * The sidebar silently skips Workspace children that have no summary in the
   * browser's Session store, so a Workspace frame must never outrun the
   * summaries it references. The `workspace/follow` stream calls
   * this before emitting any frame that carries `sessionIds`; each event
   * generation dedupes against the ids it already pushed. Cross-stream wire
   * order is not guaranteed, but the store update re-renders the row, so the
   * "expanded but empty" state can only last milliseconds, never forever.
   */
  requestSessionPublish(sessionIds: readonly string[]): void {
    if (sessionIds.length === 0) return
    for (const listener of this.sessionPublishListeners) {
      try {
        listener(sessionIds)
      } catch {
        // One failing generation must not block the others.
      }
    }
  }

  onSessionPublishRequest(listener: (sessionIds: readonly string[]) => void): () => void {
    this.sessionPublishListeners.add(listener)
    return () => this.sessionPublishListeners.delete(listener)
  }

  /**
   * Record that one device's summaries could not be projected into the merged
   * `session.list`. The rest of the list still ships, and the failing device
   * says why in the sidebar/diagnostics instead of silently blanking every
   * remote Workspace.
   */
  noteSessionListError(deviceId: DeviceId, message: string): void {
    if (this.sessionListErrors.get(deviceId) === message) return
    this.sessionListErrors.set(deviceId, message)
    this.bumpRevision()
  }

  /** Clear the recorded projection failure after a successful merge. */
  clearSessionListError(deviceId: DeviceId): void {
    if (!this.sessionListErrors.delete(deviceId)) return
    this.bumpRevision()
  }

  /** Last recorded projection failure for one device, if any. */
  sessionListErrorFor(deviceId: DeviceId): string | undefined {
    return this.sessionListErrors.get(deviceId)
  }

  /**
   * Subscribe to model-catalog scope changes. The Host re-emits DSH's
   * `llm/adapters-updated` event so the browser's shared model picker drops its
   * cached catalog and asks `session/modelCatalog` again.
   */
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
    const key = clientId || 'legacy'
    const previous = this.activeSessions.get(key)
    if (requestSeq > 0 && previous !== undefined && requestSeq <= previous.seq) return false
    const next = sessionId || undefined
    const changed = previous?.sessionId !== next
    const navigationChanged = changed || previous?.seq !== requestSeq
    // Bound untrusted browser-instance ids. Eviction loses presence, not data.
    if (!this.activeSessions.has(key) && this.activeSessions.size >= 256) {
      const oldest = this.activeSessions.keys().next().value
      if (oldest !== undefined) this.activeSessions.delete(oldest)
    }
    this.activeSessions.set(key, { sessionId: next, seq: requestSeq })
    // Hand a *new* remote selection to that device's framed page. Without this
    // the browser switched tabs and the Host recorded the Session, but nothing
    // ever reached the page, so an attention row clicked from a device tab
    // opened nothing at all. Only a real change publishes: the Client reports
    // the same selection on every snapshot poll, and re-sending `open-session`
    // would restart the remote navigation each time.
    if (changed) this.publishRemoteSelection(previous?.sessionId, next, key)
    // Snapshot caching is revision-based: local selection and same-session
    // sequence retries must invalidate it just like a remote tab selection.
    if (navigationChanged) this.bumpRevision()
    // Selection is not presence. Only a visible viewing client explicitly marks read.
    return changed
  }

  /**
   * Publish a changed selection to the owning device page, and forget the old
   * device's queued target.
   *
   * A queued target outlives the switch on purpose: the proxy replays it when
   * that page's bridge connects. It must not outlive the device actually being
   * left, or a later reconnect would re-open a conversation the user left.
   */
  private publishRemoteSelection(
    previousSessionId: string | undefined,
    nextSessionId: string | undefined,
    clientId: string,
  ): void {
    const previous = previousSessionId === undefined ? undefined : decodeSessionId(previousSessionId)
    const next = nextSessionId === undefined ? undefined : decodeSessionId(nextSessionId)
    if (previous?.isRemote && previous.deviceId !== next?.deviceId) {
      this.nativeProxyManager.clearPendingSession(previous.deviceId, clientId)
    }
    if (next?.isRemote) this.publishNativePaneSession(next.deviceId, clientId)
  }

  /**
   * Clear one remote Session's unread marker. Returns true when this call
   * actually removed a marker, so callers can distinguish a real transition
   * from a redundant read touch.
   */
  markSessionRead(sessionId: string, expectedCompletionId?: string): boolean {
    return this.readTracker.markRead(sessionId, Date.now(), expectedCompletionId)
  }

  /**
   * Clear every unread marker owned by one device (本机 included).
   *
   * A safety valve for the one read signal the Host cannot observe — a Remote
   * page viewed outside this plugin, or a native page whose injected bridge
   * never became ready. Without it those reminders could only be cleared by
   * deleting the Session.
   *
   * @returns how many markers were actually removed.
   */
  markDeviceRead(deviceId: DeviceId): number {
    const changed = this.readTracker.markManyRead(
      sessionId => decodeSessionId(sessionId).deviceId === deviceId,
    )
    return changed.length
  }

  /** Local DSH session status, observed through this Host's own event bus. */
  observeLocalSessionStatus(sessionId: string, running: boolean): void {
    if (this.disposed || typeof sessionId !== 'string' || sessionId === '' || decodeSessionId(sessionId).isRemote) return
    this.localStatus.set(sessionId, running)
    const mutation = (rows: readonly SessionAttentionFact[]): readonly SessionAttentionFact[] => rows.map(row =>
      row.sessionId === sessionId ? { ...row, running } : row)
    this.localCatalogMutations?.push(mutation)
    if (this.localCatalog !== undefined) this.localCatalog = mutation(this.localCatalog)
    this.readTracker.observeRunning(sessionId, running)
    this.bumpRevision()
  }

  /** A local live summary was added or changed; a full query supplies persisted identities. */
  observeLocalSessionAdded(fact: SessionAttentionFact): void {
    if (this.disposed || decodeSessionId(fact.sessionId).isRemote) return
    const mutation = (rows: readonly SessionAttentionFact[]): readonly SessionAttentionFact[] =>
      [...rows.filter(row => row.sessionId !== fact.sessionId), { ...fact, deviceId: LOCAL_DEVICE_ID }]
    this.localCatalogMutations?.push(mutation)
    if (this.localCatalog !== undefined) this.localCatalog = mutation(this.localCatalog)
    this.observeLocalSessionStatus(fact.sessionId, fact.running)
    void this.refreshLocalCatalog()
  }

  /** Internal adapter for the local gateway's still-pending requests; never persists requests. */
  observeLocalPending(requests: readonly { eventId: string; sessionId: string; kind: 'approval' | 'question' | 'plan-review' }[]): void {
    if (this.disposed) return
    const next = new Map(requests.filter(request => !decodeSessionId(request.sessionId).isRemote).map(request => [request.eventId, request]))
    if (next.size === this.localPending.size && [...next].every(([id, request]) => {
      const old = this.localPending.get(id)
      return old?.sessionId === request.sessionId && old.kind === request.kind
    })) return
    this.localPending.clear()
    for (const [id, request] of next) this.localPending.set(id, request)
    this.bumpRevision()
  }

  /** Complete, successful persisted+live query only; failed/unavailable reads never mean deleted. */
  refreshLocalCatalog(): Promise<void> {
    if (this.disposed || this.localHost.localSessionCatalog === undefined) return Promise.resolve()
    if (this.localCatalogInflight !== undefined) return this.localCatalogInflight
    const mutations: NonNullable<DeviceRegistry['localCatalogMutations']> = []
    this.localCatalogMutations = mutations
    const operation = Promise.resolve().then(() => this.localHost.localSessionCatalog!(this.lifetime.signal)).then(rows => {
      if (this.disposed || this.localCatalogMutations !== mutations) return
      if (rows === undefined) {
        this.localCatalogFresh = false
        this.bumpRevision()
        return
      }
      this.localCatalogFresh = true
      let current: readonly SessionAttentionFact[] = rows.filter(row => row.sessionId !== '' && !decodeSessionId(row.sessionId).isRemote)
      for (const mutation of mutations) current = mutation(current)
      this.localCatalog = current
      const known = new Set(current.map(row => row.sessionId))
      this.readTracker.prune(id => decodeSessionId(id).isRemote || known.has(id))
      for (const id of this.localStatus.keys()) if (!known.has(id)) this.localStatus.delete(id)
      for (const [id, request] of this.localPending) if (!known.has(request.sessionId)) this.localPending.delete(id)
      this.localStatus.clear()
      for (const row of current) {
        this.localStatus.set(row.sessionId, row.running)
        this.readTracker.observeRunning(row.sessionId, row.running)
      }
      this.schedulePersist()
      this.bumpRevision()
    }).catch(() => {
      if (!this.disposed && this.localCatalogMutations === mutations) {
        this.localCatalogFresh = false
        this.bumpRevision()
      }
    }).finally(() => {
      if (this.localCatalogMutations === mutations) {
        this.localCatalogMutations = undefined
        this.localCatalogInflight = undefined
      }
    })
    this.localCatalogInflight = operation
    return operation
  }

  /**
   * Forget Host-owned read state for a local Session DSH deleted. Remote
   * removals arrive as `api-session/removed` on the device stream.
   */
  forgetLocalSession(sessionId: string): void {
    if (sessionId === '') return
    if (decodeSessionId(sessionId).isRemote) return
    this.readTracker.remove(sessionId)
    this.localStatus.delete(sessionId)
    const mutation = (rows: readonly SessionAttentionFact[]): readonly SessionAttentionFact[] => rows.filter(row => row.sessionId !== sessionId)
    this.localCatalogMutations?.push(mutation)
    if (this.localCatalog !== undefined) this.localCatalog = mutation(this.localCatalog)
    for (const [id, request] of this.localPending) if (request.sessionId === sessionId) this.localPending.delete(id)
    this.schedulePersist()
    this.bumpRevision()
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

  private completionsForDevice(deviceId: DeviceId): Record<string, string> {
    const out: Record<string, string> = Object.create(null)
    for (const [id, completion] of Object.entries(this.readTracker.completionIds())) {
      const decoded = decodeSessionId(id)
      if (decoded.isRemote && decoded.deviceId === deviceId) out[decoded.rawSessionId] = completion
    }
    return out
  }

  /** Push the new unread set to the owning device's framed page. */
  private publishUnreadState(sessionId: string): void {
    const decoded = decodeSessionId(sessionId)
    if (!decoded.isRemote) return
    this.nativeProxyManager.setUnreadState(decoded.deviceId, this.unreadForDevice(decoded.deviceId), this.completionsForDevice(decoded.deviceId))
    this.scheduleSharedReadStatePush(decoded.deviceId)
  }

  /**
   * Reconcile running flags from the authoritative list. DSH can miss a
   * `api-session/status` frame across a stream gap; the list refresh still
   * carries the final flag, and a live `true -> false` there is a completion
   * for the same reason a stream event is.
   */
  private reconcileRunningForDevice(deviceId: DeviceId): void {
    const client = this.clients.get(deviceId)
    if (this.disposed || client === undefined || !client.isConnected()) return
    if (client.toView().catalogStale === true) return
    for (const summary of client.sessionSummaries()) {
      const namespacedId = encodeRemoteSessionId(deviceId, summary.sessionId)
      if (summary.running) this.remoteRunningEvidence.set(namespacedId, client.connectionGeneration)
      this.readTracker.observeRunning(namespacedId, summary.running)
      if (!summary.running) this.remoteRunningEvidence.delete(namespacedId)
    }
    this.pruneDeviceReadState(deviceId)
  }

  /**
   * Drop Host-owned read state for Sessions the device's live catalog no
   * longer lists. A deleted Session can never be read again, so keeping its
   * unread marker would pin the tab badge forever.
   */
  private pruneDeviceReadState(deviceId: DeviceId): void {
    const client = this.clients.get(deviceId)
    if (this.disposed || client === undefined || !client.catalogFresh) return
    const known = new Set(
      client.sessionSummaries().map(summary => encodeRemoteSessionId(deviceId, summary.sessionId)),
    )
    this.readTracker.prune(sessionId => {
      const decoded = decodeSessionId(sessionId)
      if (!decoded.isRemote) return true
      if (decoded.deviceId !== deviceId) return true
      return known.has(sessionId)
    })
    this.schedulePersist()
  }

  /**
   * Refresh every connected device's catalog on a slow timer.
   *
   * `session/list` is the authoritative repair path for a missed
   * `api-session/status` frame: `reconcileSessionSummaries` emits the changed
   * rows and `reconcileRunningForDevice` turns them into running transitions
   * (and prunes read state for Sessions that disappeared).
   */
  private startRunningReconcile(): void {
    if (this.runningReconcileTimer !== undefined) return
    const timer = setInterval(() => {
      this.refreshConnectedCatalogs()
    }, RUNNING_RECONCILE_INTERVAL_MS)
    timer.unref?.()
    this.runningReconcileTimer = timer
  }

  private refreshConnectedCatalogs(): void {
    if (this.disposed) return
    void this.refreshLocalCatalog()
    for (const client of this.clients.values()) {
      if (!client.isConnected()) continue
      void client.refreshSessionCatalog(this.lifetime.signal).catch(() => {
        // The next tick retries; client owns single-flight and generation fences.
      })
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
    if (frame.type !== 'emit') return
    // A deleted Session must not keep an unread marker: nothing can ever open
    // it again, so the badge would stay pinned until the Host restarted.
    if (frame.event === 'api-session/removed') {
      const [removedId] = frame.args
      if (typeof removedId === 'string') {
        this.readTracker.remove(removedId)
        this.schedulePersist()
      }
      return
    }
    if (frame.event !== 'api-session/status') return
    const [sessionId, running] = frame.args
    if (typeof sessionId !== 'string' || typeof running !== 'boolean') return
    // `markDisconnected()` deliberately emits `running:false` so local
    // spinners stop. An outage is not a completion: only a live client may
    // turn the transition into an unread reminder.
    const client = this.clients.get(deviceId)
    if (client === undefined || !client.isConnected()) return
    if (running) this.remoteRunningEvidence.set(sessionId, client.connectionGeneration)
    this.readTracker.observeRunning(sessionId, running)
    if (!running) this.remoteRunningEvidence.delete(sessionId)
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
    if (!this.uiPreferences.crossHostReadState || this.disposed) return
    if (this.sharedReadStateInFlight.has(deviceId)) {
      this.sharedReadStateDirty.add(deviceId)
      return
    }
    if (this.sharedReadStatePushTimers.has(deviceId)) return
    const timer = setTimeout(() => {
      this.sharedReadStatePushTimers.delete(deviceId)
      void this.pushSharedReadState(deviceId)
    }, delayMs)
    timer.unref?.()
    this.sharedReadStatePushTimers.set(deviceId, timer)
  }

  /** Resolve only a bounded batch of idle completions using real durable terminal events. */
  private async promoteSharedCompletions(deviceId: DeviceId): Promise<void> {
    const client = this.clients.get(deviceId)
    if (this.disposed || !this.uiPreferences.crossHostReadState || client === undefined || !client.catalogFresh) return
    const generation = client.connectionGeneration
    const entries = this.readTracker.entriesSnapshot()
    const eligible = client.sessionSummaries().filter(summary => {
      const id = encodeRemoteSessionId(deviceId, summary.sessionId)
      const entry = entries[id]
      const binding = this.completionBindings.get(id)
      return !summary.running && entry?.completionId !== undefined && !entry.completionId.startsWith('turn:') && entry.deleted !== true &&
        binding?.completionId === entry.completionId && binding.generation === generation
    })
    const offset = (this.completionBindingOffsets.get(deviceId) ?? 0) % Math.max(1, eligible.length)
    const candidates = [...eligible.slice(offset), ...eligible.slice(0, offset)].slice(0, 8)
    this.completionBindingOffsets.set(deviceId, offset + candidates.length)
    for (const summary of candidates) {
      const id = encodeRemoteSessionId(deviceId, summary.sessionId)
      const expected = entries[id]!.completionId!
      try {
        const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(5_000)])
        const identity = await readRemoteCompletionIdentity(client, summary.sessionId, signal)
        if (this.disposed || this.clients.get(deviceId) !== client || generation !== client.connectionGeneration || !client.catalogFresh) return
        if (identity !== undefined && !client.sessionSummaries().find(row => row.sessionId === summary.sessionId)?.running) {
          this.readTracker.promoteCompletion(id, expected, identity)
        }
      } catch { /* No trustworthy terminal identity: keep the local token, never wall-clock clear it. */ }
    }
  }

  /** Read the remote file and merge every Host's Session entries locally. */
  private async pullSharedReadState(deviceId: DeviceId): Promise<void> {
    const target = this.sharedReadStateTarget(deviceId)
    const client = this.clients.get(deviceId)
    const generation = client?.connectionGeneration
    if (this.disposed || target === undefined || this.sharedReadStateInFlight.has(deviceId)) return
    this.sharedReadStateInFlight.add(deviceId)
    try {
      await this.promoteSharedCompletions(deviceId)
      if (this.disposed || this.clients.get(deviceId) !== client || client?.connectionGeneration !== generation) return
      const read = await execSshCommand(
        target.transport,
        buildReadSharedStateCommand(target.path),
        8_000,
        this.lifetime.signal,
      )
      if (!read.ok || this.disposed || this.clients.get(deviceId) !== client || client?.connectionGeneration !== generation) return
      const doc = parseSharedReadDocument(read.stdout)
      if (doc !== undefined) this.mergeSharedReadDocument(deviceId, doc)
    } catch {
      // Cross-Host sync is best-effort; never break the local unread state.
    } finally {
      this.sharedReadStateInFlight.delete(deviceId)
      if (this.sharedReadStateDirty.delete(deviceId) && !this.disposed) this.scheduleSharedReadStatePush(deviceId, 0)
    }
  }

  /**
   * Read-merge-write one Host section. Preserving the other sections is what
   * makes several Hosts converge; the write only happens after a successful
   * read so an unreachable file cannot clobber another machine's reminders.
   */
  private async pushSharedReadState(deviceId: DeviceId): Promise<void> {
    const target = this.sharedReadStateTarget(deviceId)
    const client = this.clients.get(deviceId)
    const generation = client?.connectionGeneration
    if (this.disposed || target === undefined || this.sharedReadStateInFlight.has(deviceId)) return
    this.sharedReadStateInFlight.add(deviceId)
    let committed = false
    let failed = false
    try {
      await this.promoteSharedCompletions(deviceId)
      if (this.disposed || this.clients.get(deviceId) !== client || client?.connectionGeneration !== generation) return
      const read = await execSshCommand(
        target.transport,
        buildReadSharedStateCommand(target.path),
        8_000,
        this.lifetime.signal,
      )
      if (!read.ok) throw new Error(read.error)
      if (this.disposed || this.clients.get(deviceId) !== client || client?.connectionGeneration !== generation) return
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
      const write = await execSshCommand(
        target.transport,
        buildWriteSharedStateCommand(target.path, doc, this.hostId),
        15_000,
        this.lifetime.signal,
      )
      if (!write.ok) throw new Error(write.error)
      if (this.disposed || this.clients.get(deviceId) !== client || client?.connectionGeneration !== generation) return
      committed = true
      this.sharedReadStateFailures.delete(deviceId)
    } catch {
      failed = true
      if (!this.disposed && this.clients.get(deviceId) === client) {
        this.sharedReadStateFailures.set(deviceId, (this.sharedReadStateFailures.get(deviceId) ?? 0) + 1)
      }
      // A failed write must remain pending even when no new unread event arrives.
    } finally {
      this.sharedReadStateInFlight.delete(deviceId)
      if (!committed && !this.disposed && this.sharedReadStateTarget(deviceId) !== undefined) {
        this.sharedReadStateDirty.add(deviceId)
      }
      if (this.sharedReadStateDirty.delete(deviceId) && !this.disposed) {
        const failures = this.sharedReadStateFailures.get(deviceId) ?? 0
        const delay = failed ? Math.min(30_000, 1_000 * 2 ** Math.min(failures - 1, 5)) : 0
        this.scheduleSharedReadStatePush(deviceId, delay)
      }
    }
  }

  private mergeSharedReadDocument(deviceId: DeviceId, doc: ReturnType<typeof parseSharedReadDocument>): void {
    if (doc === undefined) return
    // A peer Host may still carry an entry for a Session this device deleted.
    // Merging it would resurrect the reminder on every 30s pull (and the next
    // push would write it back), so drop unknown ids while the live catalog is
    // authoritative. Offline devices keep the entries until they reconnect.
    const client = this.clients.get(deviceId)
    const known = client !== undefined && client.isConnected() && client.toView().catalogStale !== true
      ? new Set(client.sessionSummaries().map(summary => summary.sessionId))
      : undefined
    for (const section of Object.values(doc.hosts)) {
      for (const [rawSessionId, entry] of Object.entries(section.sessions)) {
        if (known !== undefined && !known.has(rawSessionId)) continue
        this.readTracker.mergeEntry(encodeRemoteSessionId(deviceId, rawSessionId), entry)
      }
    }
    this.readTracker.migrateLegacyIds()
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
   * Push the Client's selected remote Session into that device's framed page.
   *
   * Opening a Session from an attention menu switches to the device tab and
   * must also take the framed page to that conversation; `NativeDeviceProxy`
   * remembers the command and replays it when the frame's bridge connects, so
   * publishing before the tab is mounted is safe.
   */
  private publishNativePaneSession(deviceId: DeviceId, clientId = 'legacy'): void {
    const decoded = decodeSessionId(this.activeSessions.get(clientId)?.sessionId ?? '')
    if (!decoded.isRemote || decoded.deviceId !== deviceId) return
    this.nativeProxyManager.openSession(deviceId, decoded.rawSessionId, clientId, this.activeSessions.get(clientId)?.seq)
  }
  private paneKey(deviceId: DeviceId, clientId = 'legacy'): string {
    return `${clientId}\0${deviceId}`
  }

  private setNativePaneState(
    deviceId: DeviceId,
    state: NativePaneState,
    error?: string,
    clientId = 'legacy',
  ): void {
    const previous = this.nativePanes.get(this.paneKey(deviceId, clientId))
    const nextError = error?.trim() === '' ? undefined : error
    const nextSessionId = state === 'ready' ? previous?.sessionId : undefined
    const nextTitle = state === 'ready' ? previous?.title : undefined
    const nextVisible = state === 'ready' ? previous?.visible === true : false
    if (
      previous?.state === state &&
      previous.error === nextError &&
      previous.sessionId === nextSessionId &&
      previous.title === nextTitle &&
      (previous.visible === true) === nextVisible
    ) {
      return
    }
    this.nativePanes.set(this.paneKey(deviceId, clientId), {
      state,
      ...(nextError !== undefined ? { error: nextError } : {}),
      ...(nextSessionId !== undefined ? { sessionId: nextSessionId } : {}),
      ...(nextTitle !== undefined ? { title: nextTitle } : {}),
      ...(nextVisible ? { visible: true } : {}),
    })
    this.bumpRevision()
  }

  private setNativePaneSelection(deviceId: DeviceId, sessionId: string | undefined, clientId = 'legacy'): void {
    const previous = this.nativePanes.get(this.paneKey(deviceId, clientId))
    if (previous?.sessionId === sessionId) return
    this.nativePanes.set(this.paneKey(deviceId, clientId), {
      ...previous,
      state: previous?.state ?? 'idle',
      sessionId,
      ...(previous?.error !== undefined ? { error: previous.error } : {}),
      ...(previous?.title !== undefined ? { title: previous.title } : {}),
      ...(previous?.visible === true ? { visible: true } : {}),
    })
    this.bumpRevision()
    // Selecting a Session is not the same as viewing it: keep-alive frames for
    // other devices select Sessions in the background. The bridge sends an
    // explicit `read` only while its page is visible, which is the sole clear
    // signal besides the active local Session.
  }

  /** Persist the framed page's own document title for window chrome. */
  private setNativePaneTitle(deviceId: DeviceId, title: string | undefined, clientId = 'legacy'): void {
    const previous = this.nativePanes.get(this.paneKey(deviceId, clientId))
    const next = sanitizeBridgeTitle(title)
    if (previous === undefined && next === undefined) return
    if (previous?.title === next) return
    this.nativePanes.set(this.paneKey(deviceId, clientId), {
      ...previous,
      state: previous?.state ?? 'idle',
      ...(previous?.error !== undefined ? { error: previous.error } : {}),
      ...(previous?.sessionId !== undefined ? { sessionId: previous.sessionId } : {}),
      ...(next !== undefined ? { title: next } : {}),
      ...(previous?.visible === true ? { visible: true } : {}),
    })
    this.bumpRevision()
  }

  /**
   * Track whether any framed page for this device is actually on screen.
   * Read clearing and "currently viewed" detection must not treat a hidden
   * keep-alive page as if the user were reading it.
   */
  private setNativePaneVisibility(deviceId: DeviceId, visible: boolean, clientId = 'legacy'): void {
    const previous = this.nativePanes.get(this.paneKey(deviceId, clientId))
    if (previous === undefined && !visible) return
    if (previous?.visible === visible) return
    this.nativePanes.set(this.paneKey(deviceId, clientId), {
      ...previous,
      state: previous?.state ?? 'idle',
      ...(previous?.error !== undefined ? { error: previous.error } : {}),
      ...(previous?.sessionId !== undefined ? { sessionId: previous.sessionId } : {}),
      ...(previous?.title !== undefined ? { title: previous.title } : {}),
      visible,
    })
  }

  /** Persist the actually-bound native proxy port so the origin stays stable. */
  private persistNativeProxyPort(deviceId: DeviceId, port: number): void {
    const current = this.configs.get(deviceId)
    if (current === undefined || current.nativeProxyPort === port) return
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) return
    this.configs.set(deviceId, { ...current, nativeProxyPort: port })
    this.schedulePersist()
  }

  private withNativePane(view: DeviceView, clientId = 'legacy'): DeviceView {
    const pane = this.nativePanes.get(this.paneKey(view.id, clientId))
    if (pane === undefined) return view
    return {
      ...view,
      nativePaneState: pane.state,
      ...(pane.error !== undefined ? { nativePaneError: pane.error } : {}),
      ...(pane.sessionId !== undefined ? { nativePaneSessionId: pane.sessionId } : {}),
      ...(pane.title !== undefined ? { nativePaneTitle: pane.title } : {}),
    }
  }

  startAll(): void {
    if (this.disposed) return
    void this.refreshLocalCatalog()
    for (const config of this.configs.values()) {
      void this.mountClient(config)
    }
    this.startRunningReconcile()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const deviceId of this.mountGenerations.keys()) {
      this.mountGenerations.set(deviceId, (this.mountGenerations.get(deviceId) ?? 0) + 1)
    }
    this.lifetime.abort()
    this.localCatalogMutations = undefined
    this.localCatalogInflight = undefined
    this.localCatalogFresh = false
    // Persist the last captured catalogs before the timers are torn down.
    try {
      this.flushCatalogCache()
      this.saveToDisk()
    } catch {
      // Shutdown must stay best-effort.
    }
    // The lifecycle owner explicitly awaits flushPersistence() after this
    // synchronous teardown. Do not start an unawaited write here: embedders
    // and tests may release the data directory immediately after dispose().
    for (const client of this.clients.values()) {
      try { client.stop() } catch { /* Continue disposing the remaining clients. */ }
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
    if (this.runningReconcileTimer !== undefined) {
      clearInterval(this.runningReconcileTimer)
      this.runningReconcileTimer = undefined
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
    this.storage.assertWritable()
    this.authManager.assertWritable()
    const previous = this.configs.get(id)

    const config: DeviceConfig = {
      id,
      name,
      ...(input.label !== undefined && input.label.trim() !== '' ? { label: input.label.trim() } : {}),
      enabled: input.enabled !== false,
      transport: input.transport,
      auth: input.auth ?? { mode: 'auto' },
      keepNativeAlive: input.keepNativeAlive !== false,
      ...(previous?.nativeProxyPort !== undefined
        ? { nativeProxyPort: previous.nativeProxyPort }
        : {}),
    }

    const previousSecret = this.authManager.snapshotDevice(id)
    const sanitized = sanitizeDeviceConfig(config)
    try {
      if (input.auth?.credential !== undefined) {
        this.authManager.setAuthCredential(id, input.auth.credential)
      }
      if (input.transport.kind === 'ssh') {
        const keyPath = input.transport.privateKeyPath?.trim() ?? ''
        if (input.transport.passphrase !== undefined && input.transport.passphrase.trim() !== '') {
          this.authManager.setSshPassphrase(id, input.transport.passphrase)
        } else if (keyPath === '') {
          // Switching to SSH Agent / default keys clears an encrypted-key passphrase.
          this.authManager.setSshPassphrase(id, null)
        }
      }
      this.configs.set(id, sanitized)
      this.saveToDisk()
    } catch (error) {
      if (previous === undefined) this.configs.delete(id)
      else this.configs.set(id, previous)
      try { this.authManager.restoreDevice(id, previousSecret) }
      catch (rollbackError) {
        throw new AggregateError([error, rollbackError],
          `${error instanceof Error ? error.message : String(error)}; credential rollback also failed`, { cause: error })
      }
      throw error
    }
    this.authStates.delete(id)

    const client = await this.mountClient(sanitized)
    this.bumpRevision()
    this.notifyWorkspacesChanged()
    return { ok: true, device: this.withNativePane(this.withAuthState(client.toView())) }
  }

  removeDevice(deviceId: DeviceId): boolean {
    const existing = this.configs.get(deviceId)
    if (existing === undefined) return false
    this.mountGenerations.set(deviceId, (this.mountGenerations.get(deviceId) ?? 0) + 1)
    this.storage.assertWritable()
    this.authManager.assertWritable()
    // Compensate ordinary IO failures; independent files are not crash-atomic.
    const previousSecret = this.authManager.snapshotDevice(deviceId)
    try {
      this.authManager.removeDevice(deviceId)
      this.configs.delete(deviceId)
      this.saveToDisk()
    } catch (error) {
      this.configs.set(deviceId, existing)
      try { this.authManager.restoreDevice(deviceId, previousSecret) }
      catch (rollbackError) {
        throw new AggregateError([error, rollbackError],
          `${error instanceof Error ? error.message : String(error)}; credential rollback also failed`, { cause: error })
      }
      throw error
    }
    const client = this.clients.get(deviceId)
    if (client !== undefined) {
      client.stop()
      this.clients.delete(deviceId)
    }
    this.nativeProxyManager.removeProxy(deviceId)
    this.authStates.delete(deviceId)
    this.catalogs.delete(deviceId)
    this.scheduleCatalogPersist()
    for (const [clientId, selection] of this.activeSessions) {
      const owner = decodeSessionId(selection.sessionId ?? '')
      if (owner.isRemote && owner.deviceId === deviceId) this.activeSessions.set(clientId, { seq: selection.seq })
    }
    for (const key of this.nativePanes.keys()) {
      if (key.endsWith(`\0${deviceId}`)) this.nativePanes.delete(key)
    }
    this.nativeGroups.delete(deviceId)
    this.sharedReadStateInitialized.delete(deviceId)
    this.sharedReadStateDirty.delete(deviceId)
    this.sharedReadStateFailures.delete(deviceId)
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
    this.schedulePersist()
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

    const probeAuth = new DeviceAuthManager(undefined)
    const tempConfig: DeviceConfig = {
      id: DeviceId(`probe-${randomUUID()}`),
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
      const authRes = await probeAuth.ensureAuthenticated(tempConfig, baseUrl, true)
      if (!authRes.ok) return authRes

      const headers: Record<string, string> = {
        ...probeAuth.getAuthHeaders(tempConfig),
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
      probeAuth.removeDevice(tempConfig.id)
      cleanup?.()
    }
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

  /** Build the complete snapshot for the Client UI. */
  snapshot(clientId = 'legacy'): MultiDeviceSnapshot {
    const cached = this.snapshotCache.get(clientId)
    if (cached?.revision === this.revision) return cached.value
    const archivedSessionIds = new Set<string>(this.localArchivedIds())
    const subagentSessionIds = new Set<string>(this.localSubagentIds())
    const attentionFacts: SessionAttentionFact[] = (this.localCatalog ?? []).map(row => ({
      ...row,
      deviceId: LOCAL_DEVICE_ID,
      archived: archivedSessionIds.has(row.sessionId),
      origin: subagentSessionIds.has(row.sessionId) ? 'subagent' : row.origin,
    }))
    const localPendingBySession = new Map<string, { count: number; kind: string }>()
    for (const pending of this.localPending.values()) {
      const old = localPendingBySession.get(pending.sessionId)
      localPendingBySession.set(pending.sessionId, { count: (old?.count ?? 0) + 1, kind: pending.kind })
    }
    for (let index = 0; index < attentionFacts.length; index += 1) {
      const row = attentionFacts[index]!
      const pending = localPendingBySession.get(row.sessionId)
      if (pending !== undefined) attentionFacts[index] = { ...row, pendingInteractionKind: pending.kind, pendingRequestCount: pending.count }
    }

    for (const client of this.clients.values()) {
      const summaries = client.sessionSummaries()
      const pendingBySession = new Map<string, { count: number; kind: import('../contract.ts').PendingInteractionKind }>()
      for (const pending of client.pendingInteractionList()) {
        const previous = pendingBySession.get(pending.rawSessionId)
        pendingBySession.set(pending.rawSessionId, { count: (previous?.count ?? 0) + 1, kind: pending.kind })
      }
      const childrenByParent = new Map<string, number>()
      for (const summary of summaries) if (summary.origin === 'subagent' && summary.running && summary.parentSessionId !== undefined) {
        childrenByParent.set(summary.parentSessionId, (childrenByParent.get(summary.parentSessionId) ?? 0) + 1)
      }
      const archived = new Set(client.archivedIds())
      for (const archivedId of archived) {
        archivedSessionIds.add(encodeRemoteSessionId(client.id, archivedId))
      }
      for (const summary of summaries) {
        const namespacedId = encodeRemoteSessionId(client.id, summary.sessionId)
        if (summary.origin === 'subagent') subagentSessionIds.add(namespacedId)
        const pending = pendingBySession.get(summary.sessionId)
        attentionFacts.push({
          sessionId: namespacedId, deviceId: client.id, running: summary.running,
          blank: summary.blank, origin: summary.origin, archived: archived.has(summary.sessionId),
          runningSubagentCount: childrenByParent.get(summary.sessionId) ?? 0,
          ...(pending !== undefined ? { pendingInteractionKind: pending.kind, pendingRequestCount: pending.count } : {}),
        })
      }
    }

    const attentionByDevice = selectDeviceAttention(attentionFacts, new Set(this.readTracker.unreadIds()), {
      currentSessionId: this.activeSessions.get(clientId)?.sessionId,
    })
    attentionByDevice[LOCAL_DEVICE_ID] = { ...(attentionByDevice[LOCAL_DEVICE_ID] ?? emptyDeviceAttention()), fresh: this.localCatalogFresh }
    for (const client of this.clients.values()) {
      const fresh = client.catalogFresh
      const rawSelected = this.nativePanes.get(this.paneKey(client.id, clientId))?.sessionId
      const currentSessionId = rawSelected === undefined ? this.activeSessions.get(clientId)?.sessionId : encodeRemoteSessionId(client.id, rawSelected)
      const projected = selectDeviceAttention(attentionFacts.filter(fact => fact.deviceId === client.id), new Set(this.readTracker.unreadIds()), { currentSessionId, fresh })
      attentionByDevice[client.id] = projected[client.id] ?? emptyDeviceAttention(fresh)
    }

    // Remote conversations cannot be named by the browser (their page is
    // cross-origin). Join the ones an attention menu can open to this device's
    // catalog titles, which the Host already keeps for its own list surface.
    const sessionTitles = collectAttentionSessionTitles(attentionByDevice, (deviceId) => {
      const owner = this.clients.get(deviceId)
      if (owner === undefined) return undefined
      const titles = new Map<string, string>()
      for (const summary of owner.sessionSummaries()) {
        const title = summary.projections?.values.title
        if (typeof title === 'string') titles.set(summary.sessionId, title)
      }
      return titles
    })

    const result: MultiDeviceSnapshot = {
      revision: this.revision,
      hostId: this.hostId,
      hostEpoch: this.hostEpoch,
      devices: [...this.clients.values()].map(c => {
        const attention = attentionByDevice[c.id]!
        const view = this.withNativePane(this.withAuthState({
          ...c.toView(),
          runningSessionCount: attention.runningSessionIds.length,
          pendingApprovalCount: attention.pendingSessionIds.length,
        }), clientId)
        const sessionListError = this.sessionListErrors.get(view.id)
        return sessionListError === undefined ? view : { ...view, sessionListError }
      }),
      sshConfigHosts: listSshConfigHosts(),
      unreadSessionIds: this.readTracker.unreadIds(),
      readCompletions: this.readTracker.completionIds(),
      attentionByDevice,
      ...(Object.keys(sessionTitles).length > 0 ? { sessionTitles } : {}),
      archivedSessionIds: [...archivedSessionIds].sort(),
      subagentSessionIds: [...subagentSessionIds].sort(),
      ui: { ...this.uiPreferences },
    }
    this.snapshotCache.delete(clientId)
    this.snapshotCache.set(clientId, { revision: this.revision, value: result })
    while (this.snapshotCache.size > 16) {
      const oldest = this.snapshotCache.keys().next().value
      if (oldest === undefined) break
      this.snapshotCache.delete(oldest)
    }
    return result
  }

  /** Persisted display preferences (Snapshot also carries them under `ui`). */
  ui(): MultiDeviceUiPreferences {
    return this.uiPreferences
  }

  /** Update and persist display preferences; unknown keys are ignored by the type. */
  updateUiPreferences(patch: Partial<MultiDeviceUiPreferences>): MultiDeviceUiPreferences {
    this.storage.assertWritable()
    const previous = this.uiPreferences
    this.uiPreferences = {
      crossHostReadState: patch.crossHostReadState === undefined
        ? this.uiPreferences.crossHostReadState
        : patch.crossHostReadState === true,
    }
    try { this.saveToDisk() }
    catch (error) { this.uiPreferences = previous; throw error }
    this.bumpRevision()
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
    if (this.disposed) throw new Error('Device registry is disposed')
    const mountGeneration = (this.mountGenerations.get(storedConfig.id) ?? 0) + 1
    this.mountGenerations.set(storedConfig.id, mountGeneration)
    const isMountCurrent = (client: RemoteDeviceClient): boolean =>
      !this.disposed && this.mountGenerations.get(storedConfig.id) === mountGeneration &&
      this.clients.get(storedConfig.id) === client
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

    const proxyUrl = await this.nativeProxyManager.ensureProxy(config, () => client.effectiveBaseUrl())
    if (!isMountCurrent(client)) return client
    client.setNativeProxyUrl(proxyUrl)
    if (proxyUrl !== undefined) this.bumpRevision()

    if (!isMountCurrent(client)) return client
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

  private bumpRevision(): void {
    this.revision += 1
    this.snapshotCache.clear()
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
    let migratedSecrets = false
    try {
      const raw = this.storage.read<Partial<PersistedRegistryDocument>>()
      if (raw === undefined) return
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
      if (raw.ui && typeof raw.ui === 'object') {
        this.uiPreferences = { crossHostReadState: raw.ui.crossHostReadState === true }
      }
      const persistedCatalogDocument = this.catalogStorage.read<Parameters<typeof decodeCatalogDocument>[0]>()
      const restoredCatalogs = persistedCatalogDocument !== undefined
        ? decodeCatalogDocument(persistedCatalogDocument)
        : raw.catalogs && typeof raw.catalogs === 'object' ? decodeLegacyCatalogs(raw.catalogs) : undefined
      if (persistedCatalogDocument === undefined && restoredCatalogs !== undefined) this.catalogMigrationPending = true
      for (const [deviceId, cache] of restoredCatalogs ?? []) {
        if (this.configs.has(deviceId)) this.catalogs.set(deviceId, cache)
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
    this.catalogDirty = true
  }

  /**
   * Capture every live client's catalog and write it to disk. Debounced: the
   * session/workspace streams can burst many changes per turn, and the file is
   * rewritten atomically on each save.
   */
  private scheduleCatalogPersist(): void {
    this.catalogDirty = true
    if (this.catalogPersistTimer !== undefined || this.disposed) return
    const delay = Math.min(30_000, 3_000 * 2 ** Math.min(this.catalogPersistFailures, 3))
    this.catalogPersistTimer = setTimeout(() => {
      this.catalogPersistTimer = undefined
      try {
        this.flushCatalogCache()
        void this.persistCatalogsAsync().catch(() => {})
      } catch {
        // Capturing a live catalog must never break persistence.
      }
    }, delay)
    // Do not keep the Host process alive just for this timer.
    if (typeof this.catalogPersistTimer === 'object' && this.catalogPersistTimer !== null) {
      const timer = this.catalogPersistTimer as { unref?: () => void }
      timer.unref?.()
    }
  }

  /** Coalesce bursts into the newest document while one async write is active. */
  private persistCatalogsAsync(): Promise<void> {
    if (!this.catalogDirty && !this.catalogMigrationPending) return this.catalogWrite ?? Promise.resolve()
    this.catalogWriteAgain = true
    if (this.catalogWrite !== undefined) return this.catalogWrite
    const operation = (async () => {
      try {
        do {
          this.catalogWriteAgain = false
          this.catalogDirty = false
          await this.catalogStorage.writeAsync(encodeCatalogDocument(this.catalogs))
          if (this.catalogMigrationPending) {
            // The new file is durable before legacy embedded catalogs are removed.
            this.catalogMigrationPending = false
            try { this.saveToDisk() } catch (error) { this.catalogMigrationPending = true; throw error }
          }
        } while (this.catalogWriteAgain || this.catalogDirty || this.catalogMigrationPending)
        this.catalogPersistFailures = 0
        const recovered = this.catalogPersistenceError !== undefined
        this.catalogPersistenceError = undefined
        if (recovered) this.bumpRevision()
      } catch (error) {
        this.catalogDirty = true
        this.catalogPersistFailures += 1
        this.catalogPersistenceError = error instanceof Error ? error.message : String(error)
        this.bumpRevision()
        if (!this.disposed) this.scheduleCatalogPersist()
        throw error
      } finally {
        this.catalogWrite = undefined
      }
    })()
    this.catalogWrite = operation
    return operation
  }

  /** Wait for the final asynchronous catalog write during Host shutdown. */
  async flushPersistence(): Promise<void> {
    if (this.catalogPersistTimer !== undefined) {
      clearTimeout(this.catalogPersistTimer)
      this.catalogPersistTimer = undefined
    }
    this.flushCatalogCache()
    await this.persistCatalogsAsync()
  }

  /** Copy each client's current catalog into the durable map. */
  private flushCatalogCache(): void {
    for (const [deviceId, client] of this.clients.entries()) {
      const snapshot = client.catalogSnapshot()
      if (snapshot.syncedAt === 0 && snapshot.sessions.length === 0 && snapshot.workspaces.length === 0) continue
      this.catalogs.set(deviceId, trimCatalog(snapshot))
      this.catalogDirty = true
    }
  }

  saveToDisk(): void {
    const readEntries = this.readTracker.entriesSnapshot()
    const doc: PersistedRegistryDocument = {
      version: 1,
      devices: [...this.configs.values()],
      ui: this.uiPreferences,
      hostId: this.hostId,
      ...(this.catalogMigrationPending && this.catalogs.size > 0
        ? { catalogs: Object.fromEntries(this.catalogs) }
        : {}),
      ...(this.nativeGroups.size > 0
        ? { nativeGroups: Object.fromEntries(this.nativeGroups) }
        : {}),
      ...(Object.keys(readEntries).length > 0
        ? { readState: { entries: readEntries } }
        : {}),
    }
    this.storage.write(doc)
  }
}

/** The workspace id returned by a remote `workspace/create`, when the body has one. */
function workspaceIdFromCreate(created: unknown): string | undefined {
  if (typeof created !== 'object' || created === null) return undefined
  const body = created as { workspace?: { workspaceId?: unknown }; workspaceId?: unknown }
  const nested = body.workspace?.workspaceId
  if (typeof nested === 'string' && nested !== '') return nested
  return typeof body.workspaceId === 'string' && body.workspaceId !== '' ? body.workspaceId : undefined
}

const CATALOG_ID_LIMIT = 5_000

/** Keep the complete lightweight directory. Only ancillary pin/archive sets are bounded. */
function trimCatalog(cache: DeviceCatalogCache): DeviceCatalogCache {
  const sessions = cache.sessions
  const workspaces = cache.workspaces
  const archivedSessionIds = cache.archivedSessionIds.length > CATALOG_ID_LIMIT
    ? cache.archivedSessionIds.slice(0, CATALOG_ID_LIMIT) : cache.archivedSessionIds
  const pinnedSessionIds = cache.pinnedSessionIds.length > CATALOG_ID_LIMIT
    ? cache.pinnedSessionIds.slice(0, CATALOG_ID_LIMIT) : cache.pinnedSessionIds
  const trimmed =
    sessions !== cache.sessions ||
    workspaces !== cache.workspaces ||
    archivedSessionIds !== cache.archivedSessionIds ||
    pinnedSessionIds !== cache.pinnedSessionIds
  return {
    ...cache,
    sessions,
    workspaces,
    archivedSessionIds,
    pinnedSessionIds,
    catalogTruncated: trimmed,
  }
}

function parseProbeBody(body: Buffer): { result?: { value?: { version?: string } } } {
  try {
    return JSON.parse(body.toString('utf8')) as { result?: { value?: { version?: string } } }
  } catch {
    return {}
  }
}

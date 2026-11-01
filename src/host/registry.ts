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
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  type DeviceConfig,
  DeviceId,
  type DeviceView,
  decodeSessionId,
  LOCAL_DEVICE_ID,
  type MultiDeviceSnapshot,
  type SessionOriginMetadata,
  type UpsertDeviceInput,
  type WorkspaceAggregationConfig,
} from '../contract.ts'
import { DeviceAuthManager } from './auth.ts'
import {
  DEFAULT_AGGREGATION_CONFIG,
  type PhysicalWorkspaceInput,
  WorkspaceAggregator,
} from './git-aggregator.ts'
import { NativeProxyManager } from './native-proxy.ts'
import { RemoteDeviceClient, type RemoteDeviceCallbacks } from './remote-client.ts'
import { listSshConfigHosts } from './ssh-config.ts'
import { probeSshTunnel } from './tunnel.ts'

interface PersistedRegistryDocument {
  readonly version: 1
  readonly devices: readonly DeviceConfig[]
  readonly aggregation: WorkspaceAggregationConfig
}

export interface LocalHostProvider {
  /** Local webserver port, used for self-loop prevention. */
  readonly localPort: () => number | undefined
  /** Read current local workspaces from `ctx.workspaceRegistry`. */
  readonly localWorkspaces: () => PhysicalWorkspaceInput[]
  /** Read current local session summaries. */
  readonly localSessionUpdatedAt: () => Map<string, number>
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

  private revision = 1
  private aggregatedGatewayActive = false
  private aggregatedGatewayError: string | undefined
  private nativeProxyActive = true

  constructor(
    private readonly dataFilePath: string,
    secretsFilePath: string,
    private readonly localHost: LocalHostProvider,
    private readonly options: { enableTunnels?: boolean; enableNativeProxy?: boolean } = {},
  ) {
    this.authManager = new DeviceAuthManager(secretsFilePath)
    this.nativeProxyManager = new NativeProxyManager(this.authManager)
    this.aggregator = new WorkspaceAggregator()
    this.nativeProxyActive = options.enableNativeProxy !== false
    this.loadFromDisk()
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

  startAll(): void {
    for (const config of this.configs.values()) {
      void this.mountClient(config)
    }
  }

  dispose(): void {
    for (const client of this.clients.values()) {
      client.stop()
    }
    this.clients.clear()
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

    this.configs.set(id, config)
    this.saveToDisk()

    const client = await this.mountClient(config)
    this.bumpRevision()
    this.notifyWorkspacesChanged()
    return { ok: true, device: client.toView() }
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
    this.saveToDisk()
    this.bumpRevision()
    this.notifyWorkspacesChanged()
    return true
  }

  reconnectDevice(deviceId: DeviceId): boolean {
    const client = this.clients.get(deviceId)
    if (client === undefined) return false
    client.reconnectNow()
    return true
  }

  /** Test reachability & authentication of a candidate device without saving it. */
  async testDeviceConnection(
    input: UpsertDeviceInput,
  ): Promise<{ ok: true; protocolVersion: string; remoteDshVersion?: string; latencyMs: number } | { ok: false; error: string }> {
    if (this.isSelfLoop(input.transport)) {
      return { ok: false, error: 'Self-loop rejected: target points to this local DSH host' }
    }

    let baseUrl: string
    let cleanup: (() => void) | undefined

    if (input.transport.kind === 'ssh') {
      const probed = await probeSshTunnel(input.transport)
      if (!probed.ok) return probed
      baseUrl = probed.baseUrl
      cleanup = probed.close
    } else {
      baseUrl = input.transport.baseUrl.replace(/\/+$/, '')
    }

    const tempConfig: DeviceConfig = {
      id: DeviceId('probe-temp'),
      name: input.name || 'probe',
      enabled: true,
      transport: input.transport,
      auth: input.auth ?? { mode: 'auto' },
    }

    try {
      const t0 = Date.now()
      const authRes = await this.authManager.ensureAuthenticated(tempConfig, baseUrl, true)
      if (!authRes.ok) return authRes

      const headers: Record<string, string> = {
        ...this.authManager.getAuthHeaders(tempConfig),
        'content-type': 'application/json',
      }

      // Probe 0.2
      const res02 = await fetch(new URL('/api/session/list', baseUrl).href, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'client-request',
          rpcId: randomUUID(),
          method: 'session/list',
          payload: { args: { _request: {} } },
        }),
      }).catch(() => undefined)

      if (res02?.ok) {
        return {
          ok: true,
          protocolVersion: '0.2',
          remoteDshVersion: '0.2.x',
          latencyMs: Date.now() - t0,
        }
      }

      // Probe 0.1
      const res01 = await fetch(new URL('/api/host.describe', baseUrl).href, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'client-request',
          rpcId: randomUUID(),
          method: 'host.describe',
          payload: {},
        }),
      }).catch(() => undefined)

      if (res01?.ok) {
        const body = (await res01.json().catch(() => ({}))) as { result?: { value?: { version?: string } } }
        return {
          ok: true,
          protocolVersion: '0.1',
          remoteDshVersion: body.result?.value?.version ?? '0.1.x',
          latencyMs: Date.now() - t0,
        }
      }

      return {
        ok: false,
        error: res02
          ? `Remote DSH answered HTTP ${String(res02.status)} (check authentication token or DSH port)`
          : 'Could not reach remote DSH HTTP endpoint over the connection',
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

  /** Build the complete snapshot for the Client UI and Aggregated Gateway. */
  snapshot(): MultiDeviceSnapshot {
    const physicalInputs: PhysicalWorkspaceInput[] = [...this.localHost.localWorkspaces()]
    const updatedAtMap = this.localHost.localSessionUpdatedAt()
    const sessionOrigins: Record<string, SessionOriginMetadata> = Object.create(null)

    for (const client of this.clients.values()) {
      const view = client.toView()
      const summaries = client.sessionSummaries()
      const runningBySession = new Map<string, boolean>()

      for (const s of summaries) {
        const namespacedId = client.namespaceSummary(s).sessionId
        updatedAtMap.set(namespacedId, s.updatedAt)
        runningBySession.set(s.sessionId, s.running)
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
        const runningCount = ws.sessionIds.filter(id => runningBySession.get(id) === true).length
        physicalInputs.push({
          deviceId: client.id,
          deviceName: view.name,
          workspaceId: ws.workspaceId,
          path: ws.path,
          title: ws.title,
          sessionIds: ws.sessionIds,
          runningSessionCount: runningCount,
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt,
        })
      }
    }

    const { logicalWorkspaces, allPhysicalWorkspaces } = this.aggregator.aggregate(
      physicalInputs,
      updatedAtMap,
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
      hostStatus: {
        aggregatedGatewayActive: this.aggregatedGatewayActive,
        ...(this.aggregatedGatewayError !== undefined ? { aggregatedGatewayError: this.aggregatedGatewayError } : {}),
        nativeProxyActive: this.nativeProxyActive,
      },
      devices: [...this.clients.values()].map(c => c.toView()),
      sshConfigHosts: listSshConfigHosts(),
      aggregationConfig: this.aggregator.getConfig(),
      logicalWorkspaces,
      allPhysicalWorkspaces,
      sessionOrigins,
    }
  }

  /** Resolve which remote client owns a given namespaced session ID. */
  resolveSessionOwner(sessionId: string): { client: RemoteDeviceClient; rawSessionId: string } | undefined {
    const decoded = decodeSessionId(sessionId)
    if (!decoded.isRemote) return undefined
    const client = this.clients.get(decoded.deviceId)
    if (client === undefined) return undefined
    return { client, rawSessionId: decoded.rawSessionId }
  }

  private async mountClient(config: DeviceConfig): Promise<RemoteDeviceClient> {
    let client = this.clients.get(config.id)
    const callbacks: RemoteDeviceCallbacks = {
      onStateChanged: () => {
        this.bumpRevision()
      },
      onRemoteEventFrame: (deviceId, frame) => {
        for (const listener of this.eventListeners) listener(deviceId, frame)
      },
      onControlProjectionFrame: (deviceId, frame) => {
        for (const listener of this.projectionListeners) listener(deviceId, frame)
      },
      onWorkspacesChanged: () => {
        this.bumpRevision()
        this.notifyWorkspacesChanged()
      },
      onGitRemotesDiscovered: (deviceId, remotesByPath) => {
        for (const [path, rawUrl] of remotesByPath.entries()) {
          this.aggregator.noteGitRemote(deviceId, path, rawUrl)
        }
        this.bumpRevision()
      },
    }

    if (client === undefined) {
      client = new RemoteDeviceClient(config, this.authManager, callbacks)
      this.clients.set(config.id, client)
    } else {
      client.updateConfig(config)
    }

    if (this.nativeProxyActive) {
      const proxyUrl = await this.nativeProxyManager.ensureProxy(config, () => client.effectiveBaseUrl())
      client.setNativeProxyUrl(proxyUrl)
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
    return false
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
    try {
      const raw = JSON.parse(readFileSync(this.dataFilePath, 'utf8')) as Partial<PersistedRegistryDocument>
      if (Array.isArray(raw.devices)) {
        for (const dev of raw.devices) {
          if (dev && typeof dev.id === 'string' && typeof dev.name === 'string' && dev.transport) {
            this.configs.set(DeviceId(dev.id), dev)
          }
        }
      }
      if (raw.aggregation && typeof raw.aggregation === 'object') {
        this.aggregator.setConfig({ ...DEFAULT_AGGREGATION_CONFIG, ...raw.aggregation })
      }
    } catch {
      // Ignore corrupt config file
    }
  }

  saveToDisk(): void {
    try {
      const dir = dirname(this.dataFilePath)
      mkdirSync(dir, { recursive: true })
      const tmp = `${this.dataFilePath}.${randomUUID()}.tmp`
      const doc: PersistedRegistryDocument = {
        version: 1,
        devices: [...this.configs.values()],
        aggregation: this.aggregator.getConfig(),
      }
      writeFileSync(tmp, JSON.stringify(doc, null, 2), { mode: 0o600 })
      try { chmodSync(tmp, 0o600) } catch { /* Windows fallback */ }
      renameSync(tmp, this.dataFilePath)
    } catch {
      // Non-fatal
    }
  }
}

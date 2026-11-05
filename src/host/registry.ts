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
  type DeviceConfig,
  DeviceId,
  type DeviceView,
  decodeSessionId,
  encodeRemoteSessionId,
  type GitMatchRun,
  LOCAL_DEVICE_ID,
  type MultiDeviceSnapshot,
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
import { NativeProxyManager } from './native-proxy.ts'
import {
  classifyRemoteProtocol,
  RemoteDeviceClient,
  resolveProbedProtocol,
  type RemoteDeviceCallbacks,
} from './remote-client.ts'
import { listLocalSshKeys, listSshConfigHosts } from './ssh-config.ts'
import { probeSshTunnel } from './tunnel.ts'

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
  /** Last manual Git match outcome, so the panel can show it after a reload. */
  readonly gitMatch?: GitMatchRun
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
  private gitMatchRunner: GitMatchRunner | undefined
  private gitMatchRun: GitMatchRun = createIdleGitMatch()
  private localWorkspaceCreator: ((path: string) => Promise<void>) | undefined
  private aggregatedGatewayActive = false
  private aggregatedGatewayError: string | undefined
  private nativeProxyActive = true
  private readonly authStates = new Map<DeviceId, { state: DeviceAuthState; error?: string }>()

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
      },
    )
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
    if (input.transport.kind === 'ssh' && input.transport.passphrase !== undefined) {
      this.authManager.setSshPassphrase(id, input.transport.passphrase)
    }
    const sanitized = sanitizeDeviceConfig(config)
    this.configs.set(id, sanitized)
    this.authStates.delete(id)
    this.saveToDisk()

    const client = await this.mountClient(sanitized)
    this.bumpRevision()
    this.notifyWorkspacesChanged()
    return { ok: true, device: this.withAuthState(client.toView()) }
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
    const config = this.configs.get(deviceId)
    const client = this.clients.get(deviceId)
    if (config === undefined || client === undefined) {
      return { ok: false, error: 'Device is not configured' }
    }
    if (credential !== undefined && credential.trim() !== '') {
      this.authManager.setAuthCredential(deviceId, credential.trim())
    }
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
    const config = this.configs.get(deviceId)
    if (config === undefined || config.transport.kind !== 'ssh') return new Map()
    const found = await discoverRemoteGitRemotesViaSsh(config.transport, paths)
    for (const [path, rawUrl] of found) this.aggregator.noteGitRemote(deviceId, path, rawUrl)
    return found
  }

  private async scanRemoteRepos(
    deviceId: DeviceId,
    roots: readonly string[],
  ): Promise<{ ok: true; repos: ScannedRepository[] } | { ok: false; error: string }> {
    const config = this.configs.get(deviceId)
    if (config === undefined) return { ok: false, error: 'Device is not configured' }
    if (config.transport.kind !== 'ssh') {
      return { ok: false, error: 'Scanning requires an SSH transport' }
    }
    return scanRemoteGitRepos(config.transport, roots)
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
      devices: [...this.clients.values()].map(c => this.withAuthState(c.toView())),
      sshConfigHosts: listSshConfigHosts(),
      aggregationConfig: this.aggregator.getConfig(),
      logicalWorkspaces,
      allPhysicalWorkspaces,
      sessionOrigins,
      gitMatch: this.gitMatchRun,
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
    // An SSH tunnel pointing back at this same DSH listener creates a loop.
    const hostPart = transport.host.trim().replace(/^.*@/, '').replace(/:\d+$/, '')
    const remotePort = transport.remotePort ?? 3080
    return (
      ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostPart.toLowerCase()) &&
      remotePort === localPort
    )
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

  saveToDisk(): void {
    const dir = dirname(this.dataFilePath)
    mkdirSync(dir, { recursive: true })
    const tmp = `${this.dataFilePath}.${randomUUID()}.tmp`
    const doc: PersistedRegistryDocument = {
      version: 1,
      devices: [...this.configs.values()],
      aggregation: this.aggregator.getConfig(),
      gitMatch: this.gitMatchRun,
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

function parseProbeBody(body: Buffer): { result?: { value?: { version?: string } } } {
  try {
    return JSON.parse(body.toString('utf8')) as { result?: { value?: { version?: string } } }
  } catch {
    return {}
  }
}

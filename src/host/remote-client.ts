/**
 * Cross-version Remote DSH Client (`RemoteDeviceClient`).
 *
 * Connects to one remote DSH instance (over an SSH tunnel or direct HTTP/S) and speaks
 * BOTH **DSH 0.2.x** (`/api/<namespace>/<method>` + `/api/remote.mux`) AND **DSH 0.1.x**
 * (`/api/<domain>.<method>` + `/api/events.mux` + `/api/events.host`)!
 *
 * Features:
 * - Automatic protocol version detection (`0.2` vs `0.1`).
 * - Persistent authentication via `DeviceAuthManager` (automatic 401 token/SSH re-auth).
 * - Live multiplexed WebSocket streams (`workspace/follow`, `session/control`, `$events`,
 *   and on-demand `session/follow`).
 * - Real-time tracking of remote sessions, workspaces, projections, running status,
 *   and pending user interactions (`approval/request`, `user-questions/request`).
 * - Automatic exponential backoff reconnection and RTT latency measurement.
 *
 * @module dsh-multi-device/host/remote-client
 */
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import {
  type DeviceAuthState,
  type DeviceCatalogCache,
  type DeviceConfig,
  type DeviceConnectionState,
  type DeviceId,
  type DeviceView,
  encodeRemoteEventId,
  encodeRemoteSessionId,
  isNamespacedEventId,
  isNamespacedSessionId,
  isNamespacedWorkspaceId,
  type PendingInteractionKind,
  type RemoteProtocolVersion,
} from '../contract.ts'
import { DeviceAuthManager } from './auth.ts'
import { discoverRemoteGitRemotesViaSsh } from './git-aggregator.ts'
import { headerValue, requestRemote, responseAsFetchResponse } from './http-request.ts'
import { BoundedStreamQueue } from './stream-queue.ts'
import { SshTunnel } from './tunnel.ts'

/** Map a remote waterfall event name (and payload) to the pending kind shown in the UI. */
export function pendingInteractionKind(
  event: string,
  request?: Record<string, unknown>,
): PendingInteractionKind | undefined {
  switch (event) {
    case 'approval/request':
      return 'approval'
    case 'user-questions/request': {
      const questions = Array.isArray(request?.questions) ? request.questions : []
      if (questions.length === 1 && isRecord(questions[0]) && isRecord(questions[0].intent)) {
        if (questions[0].intent.kind === 'plan-review') return 'plan-review'
      }
      return 'question'
    }
    case 'plan-review/request':
      return 'plan-review'
    default:
      return undefined
  }
}

export interface RemoteSessionSummary {
  readonly sessionId: string
  readonly updatedAt: number
  readonly agentAvailable: boolean
  readonly running: boolean
  readonly blank: boolean
  readonly parentSessionId?: string
  readonly origin?: 'subagent'
  readonly cwd?: string
  readonly projections?: {
    readonly kind: 'cached' | 'sequenced'
    readonly asOfSeq: number
    readonly values: Record<string, unknown>
  }
}

export interface RemoteWorkspaceItem {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly sessionIds: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** Device counts split by what the sidebar can actually render. */
export interface VisibleSessionCounts {
  /** Sessions with a sidebar row: not archived and not a subagent child. */
  readonly sessionCount: number
  /** Running Sessions among {@link sessionCount}. */
  readonly runningSessionCount: number
  /** Every catalog row, including archived and subagent Sessions. */
  readonly allSessionCount: number
  /** Every running catalog row. */
  readonly allRunningSessionCount: number
}

/**
 * Count a device's Sessions the way the tab bar must show them.
 *
 * Archived rows are collapsed by default and subagent children render under
 * their parent's catalog, so counting them would claim running work the sidebar
 * cannot show. The raw totals stay available for Diagnostics.
 */
export function countVisibleSessions(
  summaries: readonly RemoteSessionSummary[],
  archivedSessionIds: readonly string[],
): VisibleSessionCounts {
  const archived = new Set(archivedSessionIds)
  let sessionCount = 0
  let runningSessionCount = 0
  let allRunningSessionCount = 0
  for (const summary of summaries) {
    if (summary.running) allRunningSessionCount += 1
    if (summary.origin === 'subagent' || archived.has(summary.sessionId)) continue
    sessionCount += 1
    if (summary.running) runningSessionCount += 1
  }
  return {
    sessionCount,
    runningSessionCount,
    allSessionCount: summaries.length,
    allRunningSessionCount,
  }
}

export interface RemotePendingInteraction {
  readonly eventId: string
  readonly namespacedEventId: string
  readonly deviceId: DeviceId
  readonly rawSessionId: string
  readonly namespacedSessionId: string
  readonly kind: PendingInteractionKind
  readonly eventName: string
  readonly request: Record<string, unknown>
}

export interface RemoteDeviceCallbacks {
  readonly onStateChanged: (deviceId: DeviceId) => void
  readonly onRemoteEventFrame: (
    deviceId: DeviceId,
    frame:
      | { type: 'emit'; event: string; args: unknown[] }
      | { type: 'waterfall'; event: string; eventId: string; agentId: string; request: Record<string, unknown> }
      | { type: 'cancel'; eventId: string },
  ) => void
  readonly onControlProjectionFrame: (
    deviceId: DeviceId,
    frame: { sessionId: string; key: string; value: unknown; seq: number },
  ) => void
  readonly onWorkspacesChanged: (deviceId: DeviceId) => void
  readonly onGitRemotesDiscovered: (deviceId: DeviceId, remotesByPath: ReadonlyMap<string, string>) => void
  /** The device's model list changed (or it just connected); refresh the picker. */
  readonly onModelCatalogChanged: (deviceId: DeviceId) => void
  /** Optional auth-state callback so 401/403 on control/RPC surfaces in the UI. */
  readonly onAuthState?: (deviceId: DeviceId, state: DeviceAuthState, error?: string) => void
}

/** Plain predicate keeps callers from narrowing a live lifecycle field. */
function isConnectedState(state: DeviceConnectionState): boolean {
  return state === 'connected'
}

const BACKOFF_BASE_MS = 600
const BACKOFF_MAX_MS = 12_000

export class RemoteDeviceClient {
  private config: DeviceConfig
  private tunnel: SshTunnel | undefined
  private state: DeviceConnectionState = 'connecting'
  private protocolVersion: RemoteProtocolVersion = 'unknown'
  /** 0.1 has no live stream. The UI uses this to show a list-only device. */
  private realtime = false
  private remoteDshVersion: string | undefined
  private remoteHome: string | undefined
  private latencyMs: number | undefined
  private connectedAt: number | undefined
  private lastError: string | undefined
  private reconnectAttempt = 0
  private nativeProxyUrl: string | undefined
  /** Epoch ms of the last successful catalog sync (live or hydrated from disk). */
  private lastSyncedAt: number | undefined
  /** True while the catalog rows predate a live baseline (hydrated cache). */
  private catalogStale = false

  private summaries: RemoteSessionSummary[] = []
  private workspaces: RemoteWorkspaceItem[] = []
  private archivedSessionIds: string[] = []
  private pinnedSessionIds: string[] = []
  private readonly projectionsBySession = new Map<string, { asOfSeq: number; values: Record<string, unknown> }>()
  private readonly pendingInteractions = new Map<string, RemotePendingInteraction>()
  private readonly discoveredGitPaths = new Set<string>()
  private readonly gitProbeAttemptedAt = new Map<string, number>()

  private remoteEventsClientId: string | undefined
  private muxSocket: WebSocket | undefined
  private readonly muxStreams = new Map<
    string,
    {
      push: (frame: { type: 'item'; value?: unknown } | { type: 'end' } | { type: 'error'; error: { code: string; message: string; details: object } }) => void
    }
  >()

  private running = false
  private loopAbort: AbortController | undefined
  private iterationAbort: AbortController | undefined

  constructor(
    config: DeviceConfig,
    private readonly authManager: DeviceAuthManager,
    private readonly callbacks: RemoteDeviceCallbacks,
  ) {
    this.config = config
    if (!config.enabled) {
      this.state = 'disabled'
    }
  }

  get id(): DeviceId {
    return this.config.id
  }

  get deviceConfig(): DeviceConfig {
    return this.config
  }

  setNativeProxyUrl(url: string | undefined): void {
    this.nativeProxyUrl = url
  }

  effectiveBaseUrl(): string | undefined {
    if (this.config.transport.kind === 'ssh') {
      return this.tunnel?.baseUrl()
    }
    return this.config.transport.baseUrl.replace(/\/+$/, '')
  }

  targetSummary(): string {
    const t = this.config.transport
    if (t.kind === 'ssh') {
      const userPrefix = t.username ? `${t.username}@` : ''
      const portSuffix = t.port && t.port !== 22 ? `:${t.port}` : ''
      const remotePort = t.remotePort ?? 3080
      return `ssh://${userPrefix}${t.host}${portSuffix} → 127.0.0.1:${remotePort}`
    }
    return t.baseUrl
  }

  toView(): DeviceView {
    // A hydrated catalog is not a live claim: never show a spinner for a
    // Session whose Host has not been reachable since this process started.
    const summaries = this.sessionSummaries()
    // Count what the sidebar can actually render. Archived rows are collapsed
    // by default and subagent children sit under their parent, so counting
    // them would make the tab bar claim running work the user cannot see.
    const counts = countVisibleSessions(summaries, this.archivedSessionIds)
    return {
      id: this.config.id,
      name: this.config.name,
      ...(this.config.label !== undefined ? { label: this.config.label } : {}),
      enabled: this.config.enabled,
      state: this.state,
      transportKind: this.config.transport.kind,
      ...(this.config.transport.kind === 'ssh'
        ? {
            ssh: {
              host: this.config.transport.host,
              ...(this.config.transport.port !== undefined ? { port: this.config.transport.port } : {}),
              ...(this.config.transport.username !== undefined ? { username: this.config.transport.username } : {}),
              ...(this.config.transport.privateKeyPath !== undefined
                ? { privateKeyPath: this.config.transport.privateKeyPath }
                : {}),
              ...(this.config.transport.proxyJump !== undefined ? { proxyJump: this.config.transport.proxyJump } : {}),
              ...(this.config.transport.remotePort !== undefined ? { remotePort: this.config.transport.remotePort } : {}),
              ...(this.config.transport.remoteDshHome !== undefined
                ? { remoteDshHome: this.config.transport.remoteDshHome }
                : {}),
              ...(this.config.transport.bootstrapFromRemoteCredentials === true
                ? { bootstrapFromRemoteCredentials: true }
                : {}),
              ...(this.config.transport.engine !== undefined ? { engine: this.config.transport.engine } : {}),
            },
          }
        : {}),
      targetSummary: this.targetSummary(),
      ...(this.effectiveBaseUrl() !== undefined ? { effectiveBaseUrl: this.effectiveBaseUrl() } : {}),
      ...(this.nativeProxyUrl !== undefined ? { nativeProxyUrl: this.nativeProxyUrl } : {}),
      keepNativeAlive: this.config.keepNativeAlive !== false,
      protocolVersion: this.protocolVersion,
      realtime: this.realtime,
      ...(this.remoteDshVersion !== undefined ? { remoteDshVersion: this.remoteDshVersion } : {}),
      ...(this.remoteHome !== undefined ? { remoteHome: this.remoteHome } : {}),
      ...(this.latencyMs !== undefined ? { latencyMs: this.latencyMs } : {}),
      ...(this.connectedAt !== undefined ? { connectedAt: this.connectedAt } : {}),
      ...(this.lastError !== undefined ? { lastError: this.lastError } : {}),
      reconnectAttempt: this.reconnectAttempt,
      sessionCount: counts.sessionCount,
      runningSessionCount: counts.runningSessionCount,
      allSessionCount: counts.allSessionCount,
      allRunningSessionCount: counts.allRunningSessionCount,
      pendingApprovalCount: this.catalogStale ? 0 : this.pendingInteractions.size,
      workspaceCount: this.workspaces.length,
      ...(this.lastSyncedAt !== undefined ? { lastSyncedAt: this.lastSyncedAt } : {}),
      ...(this.catalogStale ? { catalogStale: true } : {}),
    }
  }

  /** Current lifecycle state, read through a getter so callers never narrow a stale value. */
  get connectionState(): DeviceConnectionState {
    return this.state
  }

  /** True while this device has a live baseline and can answer RPCs. */
  isConnected(): boolean {
    return this.connectionState === 'connected'
  }

  /**
   * Seed the in-memory catalog from the persisted cache before the first
   * connection attempt, so an offline device keeps its sidebar rows after a
   * Host restart. A later live baseline replaces everything.
   */
  hydrateCatalog(cache: DeviceCatalogCache | undefined): void {
    if (cache === undefined) return
    if (this.summaries.length > 0 || this.workspaces.length > 0) return
    this.summaries = cache.sessions.map(session => ({
      sessionId: session.sessionId,
      updatedAt: session.updatedAt,
      agentAvailable: session.agentAvailable,
      running: session.running,
      blank: session.blank,
      ...(session.parentSessionId !== undefined ? { parentSessionId: session.parentSessionId } : {}),
      ...(session.origin !== undefined ? { origin: session.origin } : {}),
      ...(session.cwd !== undefined ? { cwd: session.cwd } : {}),
    }))
    this.workspaces = cache.workspaces.map(workspace => ({
      workspaceId: workspace.workspaceId,
      path: workspace.path,
      title: workspace.title,
      sessionIds: [...workspace.sessionIds],
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    }))
    this.archivedSessionIds = [...cache.archivedSessionIds]
    this.pinnedSessionIds = [...cache.pinnedSessionIds]
    if (cache.protocolVersion !== 'unknown') this.protocolVersion = cache.protocolVersion
    this.lastSyncedAt = cache.syncedAt
    this.catalogStale = true
  }

  /** Durable mirror of the current catalog; projections and secrets stay out. */
  catalogSnapshot(): DeviceCatalogCache {
    return {
      deviceId: this.config.id,
      syncedAt: this.lastSyncedAt ?? 0,
      protocolVersion: this.protocolVersion,
      sessions: this.summaries.map(session => ({
        sessionId: session.sessionId,
        updatedAt: session.updatedAt,
        agentAvailable: session.agentAvailable,
        running: session.running,
        blank: session.blank,
        ...(session.parentSessionId !== undefined ? { parentSessionId: session.parentSessionId } : {}),
        ...(session.origin !== undefined ? { origin: session.origin } : {}),
        ...(session.cwd !== undefined ? { cwd: session.cwd } : {}),
      })),
      workspaces: this.workspaces.map(workspace => ({
        workspaceId: workspace.workspaceId,
        path: workspace.path,
        title: workspace.title,
        sessionIds: [...workspace.sessionIds],
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      })),
      archivedSessionIds: [...this.archivedSessionIds],
      pinnedSessionIds: [...this.pinnedSessionIds],
    }
  }

  /**
   * Wait until the device reaches `connected`, for a Session that is opened
   * while the tunnel is still coming up. Polling keeps this free of extra
   * listener lifecycles; the wait is bounded by the caller's timeout.
   */
  async waitForConnected(signal: AbortSignal, timeoutMs: number): Promise<boolean> {
    if (isConnectedState(this.connectionState)) return true
    if (this.connectionState === 'disabled' || timeoutMs <= 0) return false
    const deadline = Date.now() + timeoutMs
    while (!signal.aborted) {
      if (isConnectedState(this.connectionState)) return true
      if (!this.running) return false
      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      await sleepWithSignal(Math.min(250, remaining), signal)
    }
    return isConnectedState(this.connectionState)
  }

  sessionSummaries(): readonly RemoteSessionSummary[] {
    if (!this.catalogStale) return this.summaries
    return this.summaries.map(summary =>
      summary.running ? { ...summary, running: false, agentAvailable: false } : summary,
    )
  }

  workspaceItems(): readonly RemoteWorkspaceItem[] {
    return this.workspaces
  }

  archivedIds(): readonly string[] {
    return this.archivedSessionIds
  }

  setArchivedIds(ids: readonly string[]): void {
    this.archivedSessionIds = ids.filter(id => typeof id === 'string' && !isNamespacedSessionId(id))
  }

  pinnedIds(): readonly string[] {
    return this.pinnedSessionIds
  }

  setPinnedIds(ids: readonly string[]): void {
    this.pinnedSessionIds = ids.filter(id => typeof id === 'string' && !isNamespacedSessionId(id))
  }

  /**
   * Refresh the remote `session/list` catalog and notify local `$events`
   * listeners of any newly created or updated remote Sessions.
   */
  async refreshSessionCatalog(signal?: AbortSignal): Promise<void> {
    if (this.protocolVersion !== '0.2') return
    const previousSummaries = new Map(this.summaries.map(summary => [summary.sessionId, summary]))
    const res = await this.rawRpcPost('session/list', { args: { _request: {} } }, signal)
    if (res.ok && isRecord(res.value) && Array.isArray(res.value.items)) {
      this.summaries = (res.value.items as RemoteSessionSummary[]).filter(
        item => typeof item?.sessionId === 'string' && !isNamespacedSessionId(item.sessionId),
      )
      this.reconcileSessionSummaries(previousSummaries)
    }
  }

  controlProjections(): ReadonlyMap<string, { asOfSeq: number; values: Record<string, unknown> }> {
    return this.projectionsBySession
  }

  pendingInteractionList(): readonly RemotePendingInteraction[] {
    // The persisted catalog never stores interactions; a stale row cannot
    // truthfully claim a pending approval either.
    if (this.catalogStale) return []
    return [...this.pendingInteractions.values()]
  }

  start(): void {
    if (!this.config.enabled) {
      this.state = 'disabled'
      this.callbacks.onStateChanged(this.id)
      return
    }
    if (this.running) return
    this.running = true
    this.loopAbort = new AbortController()
    void this.superviseLoop(this.loopAbort.signal)
  }

  stop(): void {
    this.running = false
    this.loopAbort?.abort()
    this.loopAbort = undefined
    this.iterationAbort?.abort()
    this.iterationAbort = undefined
    this.closeMuxSocket()
    this.tunnel?.stop()
    this.tunnel = undefined
    this.state = this.config.enabled ? 'error' : 'disabled'
    if (!this.config.enabled) this.clearPendingInteractions()
    this.markDisconnected()
    this.callbacks.onStateChanged(this.id)
  }

  /**
   * A transport generation ended. The last catalog remains visible, but a
   * Session that was running cannot still be running on an unreachable Host:
   * report the transition so the sidebar spinner stops and completion becomes
   * detectable. Pending waterfalls are cancelled in the local UI but kept so a
   * reconnect can replay them (the remote may still be waiting for an answer).
   */
  private markDisconnected(): void {
    this.catalogStale = true
    const running = this.summaries.filter(summary => summary.running)
    if (running.length > 0) {
      this.summaries = this.summaries.map(summary =>
        summary.running ? { ...summary, running: false, agentAvailable: false } : summary,
      )
      for (const summary of running) {
        this.callbacks.onRemoteEventFrame(this.id, {
          type: 'emit',
          event: 'api-session/status',
          args: [encodeRemoteSessionId(this.id, summary.sessionId), false],
        })
      }
    }
    for (const pending of this.pendingInteractions.values()) {
      this.callbacks.onRemoteEventFrame(this.id, {
        type: 'cancel',
        eventId: pending.namespacedEventId,
      })
    }
  }

  /** Drop every pending waterfall and close its local card (device removed/disabled). */
  private clearPendingInteractions(): void {
    if (this.pendingInteractions.size === 0) return
    for (const pending of this.pendingInteractions.values()) {
      this.callbacks.onRemoteEventFrame(this.id, {
        type: 'cancel',
        eventId: pending.namespacedEventId,
      })
    }
    this.pendingInteractions.clear()
  }

  /** Re-deliver still-pending waterfalls after the `$events` stream comes back. */
  private replayPendingInteractions(): void {
    for (const pending of this.pendingInteractions.values()) {
      this.callbacks.onRemoteEventFrame(this.id, {
        type: 'waterfall',
        event: pending.eventName,
        eventId: pending.namespacedEventId,
        agentId: pending.namespacedSessionId,
        request: pending.request,
      })
    }
  }

  updateConfig(next: DeviceConfig): void {
    const wasRunning = this.running
    if (wasRunning) this.stop()
    this.config = next
    if (next.enabled) {
      this.start()
    } else {
      this.state = 'disabled'
      this.callbacks.onStateChanged(this.id)
    }
  }

  reconnectNow(): void {
    if (!this.config.enabled) return
    this.stop()
    this.reconnectAttempt = 0
    this.start()
  }

  // ==========================================================================
  // Public Remote RPC & Stream Operations (called by AggregatedGateway)
  // ==========================================================================

  /**
   * Invoke a DSH 0.2 unary endpoint (`<namespace>/<method>`) on the remote device,
   * automatically adapting to DSH 0.1 if the remote runs 0.1.x.
   */
  async invokeUnary(
    namespace: string,
    method: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (this.protocolVersion === '0.1') {
      return this.invokeLegacy01(namespace, method, args, signal)
    }
    const endpoint = `${namespace}/${method}`
    const response = await this.rawRpcPost(endpoint, { args }, signal)
    if (!response.ok) {
      const rawDetails = isRecord(response.error.details) ? { ...response.error.details } : {}
      if (typeof rawDetails.sessionId === 'string' && !isNamespacedSessionId(rawDetails.sessionId)) {
        rawDetails.sessionId = encodeRemoteSessionId(this.id, rawDetails.sessionId)
      }
      const err = new Error(response.error.message) as Error & {
        code: string
        details: object
        isDSHRemoteError: boolean
      }
      err.name = 'RemoteError'
      err.code = response.error.code
      err.details = rawDetails
      err.isDSHRemoteError = true
      throw err
    }
    return response.value
  }

  /**
   * Open a logical stream (`session/follow`, etc.) over the remote device's `/api/remote.mux`.
   */
  async *openStream(
    endpoint: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): AsyncIterable<unknown> {
    if (this.protocolVersion === '0.1' && endpoint === 'session/follow') {
      yield* this.openLegacy01SessionFollow(args, signal)
      return
    }
    const socket = this.muxSocket
    if (socket === undefined || socket.readyState !== WebSocket.OPEN) {
      throw new Error(`Device "${this.config.name}" stream socket is not connected`)
    }

    const streamId = randomUUID()
    const queue = new BoundedStreamQueue<
      | { type: 'item'; value?: unknown }
      | { type: 'end' }
      | { type: 'error'; error: { code: string; message: string; details: object } }
    >()

    this.muxStreams.set(streamId, {
      push: (frame) => {
        queue.push(frame)
      },
    })

    const onAbort = (): void => {
      queue.notify()
    }
    signal.addEventListener('abort', onAbort, { once: true })

    try {
      socket.send(
        JSON.stringify({
          type: 'open',
          streamId,
          endpoint,
          payload: { args },
        }),
      )

      while (!signal.aborted) {
        if (queue.overflow) {
          throw new Error(`Remote ${endpoint} stream consumer fell behind; reconnect to replay history`)
        }
        const frame = queue.shift()
        if (frame === undefined) {
          await queue.wait()
          continue
        }
        if (frame.type === 'item') {
          yield frame.value
          continue
        }
        if (frame.type === 'error') {
          const err = new Error(frame.error.message) as Error & {
            code: string
            details: object
            isDSHRemoteError: boolean
          }
          err.name = 'RemoteError'
          err.code = frame.error.code
          err.details = frame.error.details ?? {}
          err.isDSHRemoteError = true
          throw err
        }
        return
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
      this.muxStreams.delete(streamId)
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: 'cancel', streamId }))
        } catch {
          // Socket closing
        }
      }
    }
  }

  /**
   * Deliver the user's answer for a remote `$events` waterfall (`approval/request` or `user-questions/request`).
   */
  async respondWaterfall(
    remoteEventId: string,
    outcome:
      | { readonly kind: 'next' }
      | { readonly kind: 'result'; readonly value?: unknown }
      | { readonly kind: 'rejected'; readonly error: { readonly name: string; readonly message: string; readonly code?: string; readonly details?: unknown } },
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; error?: string }> {
    if (outcome.kind !== 'next') {
      this.pendingInteractions.delete(remoteEventId)
      this.callbacks.onStateChanged(this.id)
    }

    if (this.protocolVersion === '0.1') {
      const value = outcome.kind === 'result' ? outcome.value : undefined
      const res = await this.rawRpcPost(
        'respond',
        {
          type: 'client-response',
          rpcId: remoteEventId,
          result: { ok: outcome.kind === 'result', value },
        },
        signal,
        'respond',
      )
      return { ok: res.ok, ...(res.ok ? {} : { error: res.error.message }) }
    }

    if (this.remoteEventsClientId === undefined) {
      return { ok: false, error: 'Remote $events stream is not active' }
    }

    const res = await this.rawRpcPost(
      '$events/result',
      {
        args: {
          clientId: this.remoteEventsClientId,
          eventId: remoteEventId,
          outcome,
        },
      },
      signal,
    )
    return { ok: res.ok, ...(res.ok ? {} : { error: res.error.message }) }
  }

  // ==========================================================================
  // Internal Connection & Stream Supervision Loop
  // ==========================================================================

  private async superviseLoop(outerSignal: AbortSignal): Promise<void> {
    while (this.running && !outerSignal.aborted) {
      this.iterationAbort?.abort()
      const iterAbort = new AbortController()
      this.iterationAbort = iterAbort
      const signal = AbortSignal.any([outerSignal, iterAbort.signal])
      try {
        this.state = this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting'
        this.callbacks.onStateChanged(this.id)

        // Step 1: Ensure transport (SSH tunnel or direct URL) is up
        const baseUrl = await this.ensureTransportUp(signal)
        if (baseUrl === undefined) {
          throw new Error(this.tunnel?.status().error ?? 'Transport endpoint unavailable')
        }

        // Step 2: Ensure authentication
        const authRes = await this.authManager.ensureAuthenticated(this.config, baseUrl)
        if (!authRes.ok) {
          throw new Error(authRes.error)
        }

        // Step 3: Probe protocol & fetch initial session list
        const t0 = Date.now()
        const probed = await this.handshakeAndLoadInitial(baseUrl, signal)
        this.latencyMs = Date.now() - t0
        this.protocolVersion = probed.protocolVersion
        this.realtime = probed.protocolVersion === '0.2'
        if (probed.remoteDshVersion !== undefined) {
          this.remoteDshVersion = probed.remoteDshVersion
        }

        // Step 4: Hold live streams until disconnection.
        // For 0.2, only mark `connected` once `/api/remote.mux` WebSocket is open
        // so `waitForClient` callers never hit a still-connecting mux socket.
        if (this.protocolVersion === '0.2') {
          await this.runProtocol02Streams(baseUrl, signal, () => {
            this.state = 'connected'
            this.connectedAt = Date.now()
            this.lastError = undefined
            this.reconnectAttempt = 0
            this.lastSyncedAt = Date.now()
            this.catalogStale = false
            this.callbacks.onStateChanged(this.id)
          })
        } else {
          this.state = 'connected'
          this.connectedAt = Date.now()
          this.lastError = undefined
          this.reconnectAttempt = 0
          this.lastSyncedAt = Date.now()
          this.catalogStale = false
          this.callbacks.onStateChanged(this.id)
          await this.runProtocol01Polling(baseUrl, signal)
        }
      } catch (error) {
        if (outerSignal.aborted || !this.running) return
        this.lastError = error instanceof Error ? error.message : String(error)
        this.state = 'error'
        this.closeMuxSocket()
        this.markDisconnected()
        this.callbacks.onStateChanged(this.id)
      } finally {
        iterAbort.abort()
        if (this.iterationAbort === iterAbort) this.iterationAbort = undefined
        this.closeMuxSocket()
      }

      if (!this.running || outerSignal.aborted) return
      const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.reconnectAttempt)
      this.reconnectAttempt += 1
      await sleepWithSignal(delay + Math.floor(Math.random() * 250), outerSignal)
    }
  }

  private async ensureTransportUp(signal: AbortSignal): Promise<string | undefined> {
    if (this.config.transport.kind === 'direct') {
      return this.config.transport.baseUrl.replace(/\/+$/, '')
    }
    if (this.tunnel === undefined) {
      this.tunnel = new SshTunnel(this.config.transport, () => {
        this.callbacks.onStateChanged(this.id)
      })
      await this.tunnel.start()
    }
    const base = this.tunnel.baseUrl()
    if (base !== undefined) return base

    // Wait briefly if tunnel is still connecting
    for (let i = 0; i < 20 && !signal.aborted; i++) {
      const current = this.tunnel.baseUrl()
      if (current !== undefined) return current
      if (this.tunnel.status().state === 'error') break
      await sleepWithSignal(250, signal)
    }
    return this.tunnel.baseUrl()
  }

  private async handshakeAndLoadInitial(
    baseUrl: string,
    signal: AbortSignal,
  ): Promise<{ protocolVersion: '0.2' | '0.1'; remoteDshVersion?: string }> {
    // Try DSH 0.2 `/api/session/list` first
    let res02 = await this.rawRpcPost('session/list', { args: { _request: {} } }, signal)
    if (!res02.ok && (res02.httpStatus === 401 || res02.httpStatus === 403)) {
      // Force re-auth and retry once
      this.authManager.invalidate(this.config.id)
      await this.authManager.ensureAuthenticated(this.config, baseUrl, true)
      res02 = await this.rawRpcPost('session/list', { args: { _request: {} } }, signal)
      if (!res02.ok && (res02.httpStatus === 401 || res02.httpStatus === 403)) {
        this.callbacks.onAuthState?.(this.id, 'required', res02.error.message)
      }
    }
    if (res02.ok) {
      this.callbacks.onAuthState?.(this.id, 'ok')
    }

    const previousSummaries = new Map(this.summaries.map(summary => [summary.sessionId, summary]))
    const body02 = res02.ok ? res02.value : undefined
    const listGen = classifyRemoteProtocol(body02)
    // A versionless `items` body is the normal 0.2 list. Ask host.describe
    // before trusting it, because a 0.1 server can return `items` too.
    let hostValue: unknown
    if (listGen !== '0.2') {
      const res01 = await this.rawRpcPost('host.describe', {}, signal, 'host.describe')
      if (res01.ok) hostValue = res01.value
    }
    const resolved = resolveProbedProtocol(body02, hostValue)
    if (resolved?.protocol === '0.2') {
      if (isRecord(body02) && Array.isArray(body02.items)) {
        this.summaries = (body02.items as RemoteSessionSummary[]).filter(
          item => typeof item?.sessionId === 'string' && !isNamespacedSessionId(item.sessionId),
        )
      }
      this.reconcileSessionSummaries(previousSummaries)
      this.realtime = true
      return { protocolVersion: '0.2', remoteDshVersion: resolved.version ?? '0.2.x' }
    }
    if (resolved?.protocol === '0.1') {
      if (isRecord(hostValue) && typeof hostValue.cwd === 'string') {
        this.remoteHome = hostValue.cwd
      }
      await this.refreshLegacy01Lists(signal)
      this.realtime = false
      return { protocolVersion: '0.1', remoteDshVersion: resolved.version ?? '0.1.x' }
    }

    throw new Error(res02.ok ? 'Unrecognized DSH /api response' : res02.error.message)
  }

  private async runProtocol02Streams(
    baseUrl: string,
    signal: AbortSignal,
    onReady?: () => void,
  ): Promise<void> {
    const wsUrl = new URL('/api/remote.mux', baseUrl)
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    const headers = this.authManager.getAuthHeaders(this.config)

    const socket = new WebSocket(wsUrl.href, {
      headers,
      rejectUnauthorized:
        this.config.transport.kind === 'direct'
          ? this.config.transport.rejectUnauthorized !== false
          : true,
    })
    this.muxSocket = socket

    await new Promise<void>((resolve, reject) => {
      const onOpen = (): void => {
        cleanup()
        resolve()
      }
      const onErr = (err: Error): void => {
        cleanup()
        reject(err)
      }
      const cleanup = (): void => {
        socket.off('open', onOpen)
        socket.off('error', onErr)
      }
      socket.once('open', onOpen)
      socket.once('error', onErr)
    })

    onReady?.()

    socket.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString('utf8')) as {
          type: 'item' | 'end' | 'error'
          streamId: string
          value?: unknown
          error?: { code: string; message: string; details: object }
        }
        const handler = this.muxStreams.get(frame.streamId)
        if (handler === undefined) return
        if (frame.type === 'item') handler.push({ type: 'item', value: frame.value })
        else if (frame.type === 'end') handler.push({ type: 'end' })
        else if (frame.type === 'error' && frame.error) handler.push({ type: 'error', error: frame.error })
      } catch {
        // Ignore malformed frame
      }
    })

    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        try { socket.ping() } catch { /* ignore */ }
      }
    }, 15_000)
    pingInterval.unref?.()

    const closed = new Promise<void>((_, reject) => {
      socket.once('close', (code, reason) => {
        reject(new Error(`Remote stream WebSocket closed (${String(code)} ${reason.toString()})`))
      })
      socket.once('error', (err) => reject(err))
    })

    try {
      await Promise.race([
        closed,
        this.pump02RemoteEvents(signal),
        this.pump02WorkspaceFollow(signal),
        this.pump02SessionControl(signal),
      ])
    } finally {
      clearInterval(pingInterval)
    }
  }

  private async pump02RemoteEvents(signal: AbortSignal): Promise<void> {
    for await (const item of this.openStream('$events', {}, signal)) {
      if (!isRecord(item) || typeof item.type !== 'string') continue
      if (item.type === 'ready') {
        if (typeof item.clientId === 'string') {
          this.remoteEventsClientId = item.clientId
        }
        if (isRecord(item.host) && typeof item.host.home === 'string') {
          this.remoteHome = item.host.home
          this.callbacks.onStateChanged(this.id)
        }
        // A reconnect starts a fresh `$events` client id. Re-show waterfalls
        // that were cancelled locally while the device was away so the user can
        // still answer a request the remote Host is still waiting on.
        this.replayPendingInteractions()
        continue
      }

      if (item.type === 'emit' && typeof item.event === 'string' && Array.isArray(item.args)) {
        this.handle02EmitEvent(item.event, item.args)
        continue
      }

      if (
        item.type === 'waterfall' &&
        typeof item.event === 'string' &&
        typeof item.eventId === 'string' &&
        typeof item.agentId === 'string' &&
        isRecord(item.request)
      ) {
        if (isNamespacedSessionId(item.agentId) || isNamespacedEventId(item.eventId)) continue
        const namespacedSessionId = encodeRemoteSessionId(this.id, item.agentId)
        const namespacedEventId = encodeRemoteEventId(this.id, item.eventId)
        const kind = pendingInteractionKind(item.event, item.request)
        if (kind !== undefined) {
          this.pendingInteractions.set(item.eventId, {
            eventId: item.eventId,
            namespacedEventId,
            deviceId: this.id,
            rawSessionId: item.agentId,
            namespacedSessionId,
            kind,
            eventName: item.event,
            request: item.request,
          })
          this.callbacks.onStateChanged(this.id)
        }
        this.callbacks.onRemoteEventFrame(this.id, {
          type: 'waterfall',
          event: item.event,
          eventId: namespacedEventId,
          agentId: namespacedSessionId,
          request: item.request,
        })
        continue
      }

      if (item.type === 'cancel' && typeof item.eventId === 'string') {
        if (isNamespacedEventId(item.eventId)) continue
        this.pendingInteractions.delete(item.eventId)
        this.callbacks.onStateChanged(this.id)
        this.callbacks.onRemoteEventFrame(this.id, {
          type: 'cancel',
          eventId: encodeRemoteEventId(this.id, item.eventId),
        })
      }
    }
  }

  private handle02EmitEvent(event: string, args: unknown[]): void {
    switch (event) {
      case 'api-session/added': {
        const raw = args[0]
        if (isRecord(raw) && typeof raw.sessionId === 'string') {
          if (isNamespacedSessionId(raw.sessionId)) break
          const summary = raw as unknown as RemoteSessionSummary
          const idx = this.summaries.findIndex(s => s.sessionId === summary.sessionId)
          if (idx === -1) this.summaries = [summary, ...this.summaries]
          else this.summaries = this.summaries.map((s, i) => (i === idx ? summary : s))
          this.callbacks.onStateChanged(this.id)
          this.callbacks.onWorkspacesChanged(this.id)
          this.callbacks.onRemoteEventFrame(this.id, {
            type: 'emit',
            event,
            args: [this.namespaceSummary(summary)],
          })
        }
        break
      }
      case 'api-session/removed': {
        const sessionId = args[0]
        if (typeof sessionId === 'string') {
          if (isNamespacedSessionId(sessionId)) break
          this.summaries = this.summaries.filter(s => s.sessionId !== sessionId)
          this.projectionsBySession.delete(sessionId)
          this.callbacks.onStateChanged(this.id)
          this.callbacks.onWorkspacesChanged(this.id)
          this.callbacks.onRemoteEventFrame(this.id, {
            type: 'emit',
            event,
            args: [encodeRemoteSessionId(this.id, sessionId)],
          })
        }
        break
      }
      case 'api-session/status': {
        const [sessionId, running] = args
        if (typeof sessionId === 'string' && typeof running === 'boolean') {
          if (isNamespacedSessionId(sessionId)) break
          this.summaries = this.summaries.map(s =>
            s.sessionId === sessionId ? { ...s, running, agentAvailable: true } : s,
          )
          this.callbacks.onStateChanged(this.id)
          this.callbacks.onRemoteEventFrame(this.id, {
            type: 'emit',
            event,
            args: [encodeRemoteSessionId(this.id, sessionId), running],
          })
        }
        break
      }
      case 'api-session/activity': {
        const [sessionId, updatedAt] = args
        if (typeof sessionId === 'string' && typeof updatedAt === 'number') {
          if (isNamespacedSessionId(sessionId)) break
          this.summaries = this.summaries.map(s =>
            s.sessionId === sessionId && updatedAt > s.updatedAt ? { ...s, updatedAt } : s,
          )
          this.callbacks.onWorkspacesChanged(this.id)
          this.callbacks.onRemoteEventFrame(this.id, {
            type: 'emit',
            event,
            args: [encodeRemoteSessionId(this.id, sessionId), updatedAt],
          })
        }
        break
      }
      case 'api-session/error': {
        const [sessionId, message] = args
        if (typeof sessionId === 'string' && typeof message === 'string') {
          if (isNamespacedSessionId(sessionId)) break
          this.callbacks.onRemoteEventFrame(this.id, {
            type: 'emit',
            event,
            args: [encodeRemoteSessionId(this.id, sessionId), message],
          })
        }
        break
      }
      case 'llm/adapters-updated':
      case 'settings/document-updated':
      case 'credentials/record-updated':
      case 'credentials/reference-updated': {
        // The remote Agent's model catalog is part of its own settings. The
        // aggregate picker must invalidate instead of keeping a stale list.
        this.callbacks.onModelCatalogChanged(this.id)
        break
      }
      default:
        break
    }
  }

  private sanitizeRemoteWorkspace(ws: RemoteWorkspaceItem): RemoteWorkspaceItem | undefined {
    if (typeof ws?.workspaceId !== 'string' || isNamespacedWorkspaceId(ws.workspaceId)) return undefined
    const sessionIds = Array.isArray(ws.sessionIds)
      ? ws.sessionIds.filter(id => typeof id === 'string' && !isNamespacedSessionId(id))
      : []
    return { ...ws, sessionIds }
  }

  private async pump02WorkspaceFollow(signal: AbortSignal): Promise<void> {
    for await (const frame of this.openStream('workspace/follow', {}, signal)) {
      if (!isRecord(frame) || typeof frame.type !== 'string') continue
      // DSH 0.2.2 can replace the complete projection when a remote-access
      // filter changes. Treat it exactly like a reconnect baseline: the old
      // row set is no longer authoritative.
      if ((frame.type === 'baseline' || frame.type === 'replace') && isRecord(frame.value)) {
        const val = frame.value
        this.workspaces = Array.isArray(val.items)
          ? (val.items as RemoteWorkspaceItem[])
              .map(w => this.sanitizeRemoteWorkspace(w))
              .filter((w): w is RemoteWorkspaceItem => w !== undefined)
          : []
        this.archivedSessionIds = Array.isArray(val.archivedSessionIds)
          ? (val.archivedSessionIds as string[]).filter(id => typeof id === 'string' && !isNamespacedSessionId(id))
          : []
        this.pinnedSessionIds = Array.isArray(val.pinnedSessionIds)
          ? (val.pinnedSessionIds as string[]).filter(id => typeof id === 'string' && !isNamespacedSessionId(id))
          : []
        this.callbacks.onStateChanged(this.id)
        this.callbacks.onWorkspacesChanged(this.id)
        void this.refreshRegisteredWorkspaceOrigins()
        continue
      }
      if (frame.type === 'upsert' && isRecord(frame.workspace)) {
        const ws = this.sanitizeRemoteWorkspace(frame.workspace as unknown as RemoteWorkspaceItem)
        if (ws === undefined) continue
        const idx = this.workspaces.findIndex(w => w.workspaceId === ws.workspaceId)
        if (idx === -1) this.workspaces = [ws, ...this.workspaces]
        else this.workspaces = this.workspaces.map((w, i) => (i === idx ? ws : w))
        this.callbacks.onWorkspacesChanged(this.id)
        void this.refreshRegisteredWorkspaceOrigins()
      } else if (frame.type === 'remove' && typeof frame.workspaceId === 'string') {
        if (isNamespacedWorkspaceId(frame.workspaceId)) continue
        this.workspaces = this.workspaces.filter(w => w.workspaceId !== frame.workspaceId)
        this.callbacks.onWorkspacesChanged(this.id)
      } else if (frame.type === 'order' && Array.isArray(frame.workspaceIds)) {
        const rank = new Map((frame.workspaceIds as string[]).map((id, i) => [id, i]))
        this.workspaces = [...this.workspaces].sort(
          (a, b) => (rank.get(a.workspaceId) ?? 9999) - (rank.get(b.workspaceId) ?? 9999),
        )
        this.callbacks.onWorkspacesChanged(this.id)
      } else if (frame.type === 'archived' && Array.isArray(frame.archivedSessionIds)) {
        this.archivedSessionIds = (frame.archivedSessionIds as string[]).filter(
          id => typeof id === 'string' && !isNamespacedSessionId(id),
        )
        this.callbacks.onWorkspacesChanged(this.id)
      } else if (frame.type === 'pinned' && Array.isArray(frame.pinnedSessionIds)) {
        this.pinnedSessionIds = (frame.pinnedSessionIds as string[]).filter(
          id => typeof id === 'string' && !isNamespacedSessionId(id),
        )
        this.callbacks.onWorkspacesChanged(this.id)
      }
    }
  }

  private async pump02SessionControl(signal: AbortSignal): Promise<void> {
    for await (const frame of this.openStream('session/control', {}, signal)) {
      if (!isRecord(frame) || typeof frame.type !== 'string') continue
      if (frame.type === 'baseline' && isRecord(frame.value) && isRecord(frame.value.projections)) {
        this.projectionsBySession.clear()
        for (const [sid, block] of Object.entries(frame.value.projections)) {
          if (isNamespacedSessionId(sid)) continue
          if (isRecord(block) && typeof block.asOfSeq === 'number' && isRecord(block.values)) {
            const namespacedValues = this.namespaceProjectionValues(block.values)
            this.projectionsBySession.set(sid, {
              asOfSeq: block.asOfSeq,
              values: namespacedValues,
            })
            for (const [key, value] of Object.entries(namespacedValues)) {
              this.callbacks.onControlProjectionFrame(this.id, {
                sessionId: encodeRemoteSessionId(this.id, sid),
                key,
                value,
                seq: Math.max(0, block.asOfSeq),
              })
            }
          }
        }
        continue
      }
      if (
        frame.type === 'projection' &&
        typeof frame.sessionId === 'string' &&
        typeof frame.key === 'string' &&
        typeof frame.seq === 'number'
      ) {
        if (isNamespacedSessionId(frame.sessionId)) continue
        const namespacedValue = this.namespaceProjectionValue(frame.key, frame.value)
        const existing = this.projectionsBySession.get(frame.sessionId) ?? { asOfSeq: frame.seq, values: {} }
        existing.values[frame.key] = namespacedValue
        existing.asOfSeq = Math.max(existing.asOfSeq, frame.seq)
        this.projectionsBySession.set(frame.sessionId, existing)
        this.callbacks.onControlProjectionFrame(this.id, {
          sessionId: encodeRemoteSessionId(this.id, frame.sessionId),
          key: frame.key,
          value: namespacedValue,
          seq: frame.seq,
        })
      }
    }
  }

  /**
   * Read `remote.origin.url` for workspaces that are already registered on this
   * device, so devices that both registered the same repository keep grouping.
   *
   * This is deliberately not a filesystem scan and it never registers anything:
   * only the paths DSH already lists are read. Discovering projects that exist
   * on disk but are not registered happens solely in the manual Git match.
   */
  private async refreshRegisteredWorkspaceOrigins(): Promise<void> {
    if (this.config.transport.kind !== 'ssh') return
    const now = Date.now()
    const pendingPaths = this.workspaces
      .map(w => w.path)
      .filter(p => p && !this.discoveredGitPaths.has(p))
      .filter(p => now - (this.gitProbeAttemptedAt.get(p) ?? 0) >= 60_000)
    if (pendingPaths.length === 0) return
    for (const p of pendingPaths) this.gitProbeAttemptedAt.set(p, now)

    const discovered = await discoverRemoteGitRemotesViaSsh(this.config.transport, pendingPaths)
    // Only mark a path as complete when a remote URL was actually found; a
    // transient SSH/git failure must be retryable on a later workspace change.
    for (const path of discovered.keys()) this.discoveredGitPaths.add(path)
    if (discovered.size > 0) {
      this.callbacks.onGitRemotesDiscovered(this.id, discovered)
      this.callbacks.onWorkspacesChanged(this.id)
    }
  }

  // ==========================================================================
  // DSH 0.1.x Compatibility Layer
  // ==========================================================================

  private async refreshLegacy01Lists(signal: AbortSignal): Promise<void> {
    const previousSummaries = new Map(this.summaries.map(summary => [summary.sessionId, summary]))
    // The two lists are independent: fetch them in parallel so a 0.1 device
    // with a large catalog reconciles in one round-trip instead of two.
    const [sRes, wRes] = await Promise.all([
      this.rawRpcPost('session.list', {}, signal, 'session.list'),
      this.rawRpcPost('workspace.list', {}, signal, 'workspace.list'),
    ])
    if (sRes.ok && isRecord(sRes.value) && Array.isArray(sRes.value.items)) {
      this.summaries = (sRes.value.items as Record<string, unknown>[]).map(item => ({
        sessionId: String(item.sessionId ?? ''),
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
        agentAvailable: true,
        running: Boolean(item.running),
        blank: Boolean(item.blank),
        ...(typeof item.parentSessionId === 'string' ? { parentSessionId: item.parentSessionId } : {}),
        ...(typeof item.cwd === 'string' ? { cwd: item.cwd } : {}),
        ...(isRecord(item.projections)
          ? {
              projections: {
                kind: 'cached' as const,
                asOfSeq: typeof item.projections.asOfSeq === 'number' ? item.projections.asOfSeq : 0,
                values: isRecord(item.projections.values) ? item.projections.values : {},
              },
            }
          : {}),
      }))
    }
    if (wRes.ok && isRecord(wRes.value) && Array.isArray(wRes.value.items)) {
      this.workspaces = wRes.value.items as RemoteWorkspaceItem[]
      if (Array.isArray(wRes.value.archivedSessionIds)) {
        this.archivedSessionIds = wRes.value.archivedSessionIds as string[]
      }
      this.callbacks.onWorkspacesChanged(this.id)
      void this.refreshRegisteredWorkspaceOrigins()
    }
    this.reconcileSessionSummaries(previousSummaries)
  }

  private async runProtocol01Polling(_baseUrl: string, signal: AbortSignal): Promise<void> {
    while (!signal.aborted && this.running) {
      await sleepWithSignal(3_000, signal)
      if (signal.aborted) return
      const probe = await this.rawRpcPost('host.describe', {}, signal, 'host.describe')
      if (!probe.ok) throw new Error(probe.error.message)
      await this.refreshLegacy01Lists(signal)
    }
  }

  private async invokeLegacy01(
    namespace: string,
    method: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const req = (args.request ?? args._request ?? args) as Record<string, unknown>
    const wireMethod = `${namespace}.${method}`
    const res = await this.rawRpcPost(wireMethod, req, signal, wireMethod)
    if (!res.ok) {
      throw new Error(res.error.message)
    }
    return res.value
  }

  private async *openLegacy01SessionFollow(
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): AsyncIterable<unknown> {
    const req = (args.request ?? {}) as { address?: { sessionId?: string }; maxMessages?: number }
    const sessionId = req.address?.sessionId ?? ''
    const res = await this.rawRpcPost(
      'session.history',
      { sessionId, ...(req.maxMessages !== undefined ? { maxMessages: req.maxMessages } : {}) },
      signal,
      'session.history',
    )
    // 0.1 has no incremental follow. Return an empty snapshot so the caller
    // does not treat a one-shot history dump as a live stream, then wait
    // until the caller aborts. Lists keep refreshing in the poll loop.
    yield {
      type: 'snapshot',
      header: { version: 2, id: sessionId, createdAt: Date.now(), isSeeded: false },
      cursor: -1,
      records: [],
      hasMore: false,
      degraded: 'list-only',
      projections: { asOfSeq: -1, values: {} },
      assistantStream: { revision: 0 },
    }
    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true })
    })
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Push the initial/reconnected session list into the browser's Session store.
   *
   * DSH fetches `session.list` once per connection and then relies exclusively
   * on `api-session/added` / `api-session/removed` events. A remote device that
   * finishes its SSH handshake after that initial fetch would otherwise keep
   * its Sessions invisible even though `workspace/follow` already lists their
   * ids; the sidebar silently skips ids with no summary.
   */
  private reconcileSessionSummaries(
    previous: ReadonlyMap<string, RemoteSessionSummary>,
  ): void {
    const current = new Map(this.summaries.map(summary => [summary.sessionId, summary]))
    let changed = false

    for (const summary of this.summaries) {
      const old = previous.get(summary.sessionId)
      if (
        old !== undefined &&
        old.updatedAt === summary.updatedAt &&
        old.running === summary.running &&
        old.blank === summary.blank &&
        old.agentAvailable === summary.agentAvailable &&
        old.parentSessionId === summary.parentSessionId &&
        old.origin === summary.origin &&
        old.cwd === summary.cwd &&
        // Projections carry the title, model, queue and other list-surface
        // facts. A rename made while this Host was offline changes only this
        // block, so it must invalidate the summary or the reconnect keeps the
        // stale title forever.
        projectionsEqual(old.projections, summary.projections)
      ) {
        continue
      }
      changed = true
      this.callbacks.onRemoteEventFrame(this.id, {
        type: 'emit',
        event: 'api-session/added',
        args: [this.namespaceSummary(summary)],
      })
    }

    for (const sessionId of previous.keys()) {
      if (current.has(sessionId)) continue
      changed = true
      this.callbacks.onRemoteEventFrame(this.id, {
        type: 'emit',
        event: 'api-session/removed',
        args: [encodeRemoteSessionId(this.id, sessionId)],
      })
    }

    if (changed) this.callbacks.onWorkspacesChanged(this.id)
  }

  namespaceProjectionValue(key: string, value: unknown): unknown {
    if (key === 'subagentCatalog' && Array.isArray(value)) {
      return value.map(entry => {
        if (!isRecord(entry) || typeof entry.id !== 'string') return entry
        return {
          ...entry,
          id: encodeRemoteSessionId(this.id, entry.id),
          ...(typeof entry.parentSessionId === 'string'
            ? { parentSessionId: encodeRemoteSessionId(this.id, entry.parentSessionId) }
            : {}),
        }
      })
    }
    return value
  }

  namespaceProjectionValues(values: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(values)) {
      out[key] = this.namespaceProjectionValue(key, val)
    }
    return out
  }

  namespaceSummary(summary: RemoteSessionSummary): RemoteSessionSummary {
    return {
      ...summary,
      sessionId: encodeRemoteSessionId(this.id, summary.sessionId),
      ...(summary.parentSessionId !== undefined
        ? { parentSessionId: encodeRemoteSessionId(this.id, summary.parentSessionId) }
        : {}),
      ...(summary.projections !== undefined
        ? {
            projections: {
              ...summary.projections,
              values: this.namespaceProjectionValues(summary.projections.values),
            },
          }
        : {}),
    }
  }

  private closeMuxSocket(): void {
    const socket = this.muxSocket
    this.muxSocket = undefined
    this.remoteEventsClientId = undefined
    for (const stream of this.muxStreams.values()) {
      stream.push({
        type: 'error',
        error: { code: 'gateway/cancelled', message: 'Remote connection closed', details: {} },
      })
    }
    this.muxStreams.clear()
    if (socket !== undefined) {
      socket.removeAllListeners()
      try { socket.close() } catch { /* ignore */ }
    }
  }

  private async rawRpcPost(
    endpointPath: string,
    payload: unknown,
    signal?: AbortSignal,
    methodField = endpointPath,
  ): Promise<
    | { ok: true; value: unknown; httpStatus: number }
    | { ok: false; httpStatus: number; error: { code: string; message: string; details?: object } }
  > {
    const baseUrl = this.effectiveBaseUrl()
    if (baseUrl === undefined) {
      return {
        ok: false,
        httpStatus: 503,
        error: { code: 'gateway/service-unavailable', message: `Device "${this.config.name}" is not connected` },
      }
    }

    const rpcId = randomUUID()
    const url = new URL(`/api/${endpointPath}`, baseUrl)
    const headers: Record<string, string> = {
      ...this.authManager.getAuthHeaders(this.config),
      'content-type': 'application/json',
    }

    try {
      const response = await requestRemote(url.href, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'client-request',
          rpcId,
          method: methodField,
          payload,
        }),
        ...(signal !== undefined ? { signal } : {}),
        rejectUnauthorized:
          this.config.transport.kind === 'direct'
            ? this.config.transport.rejectUnauthorized !== false
            : true,
      })

      if (response.status < 200 || response.status >= 300) {
        const text = response.body.toString('utf8').slice(0, 200)
        return {
          ok: false,
          httpStatus: response.status,
          error: {
            code: response.status === 401 ? 'unauthorized' : 'transport',
            message: `HTTP ${String(response.status)}: ${text || response.statusText}`,
          },
        }
      }

      const contentType = headerValue(response.headers, 'content-type') ?? ''
      if (contentType.includes('multipart/form-data')) {
        const formData = await responseAsFetchResponse(response).formData()
        const metaRaw = formData.get('metadata')
        if (typeof metaRaw === 'string') {
          const parsed = JSON.parse(metaRaw) as {
            result: { ok: boolean; value?: unknown; error?: { code: string; message: string; details?: object } }
          }
          if (parsed.result.ok) {
            return { ok: true, value: parsed.result.value, httpStatus: 200 }
          }
        }
      }

      const body = JSON.parse(response.body.toString('utf8')) as {
        type?: string
        result?:
          | { ok: true; value: unknown }
          | { ok: false; error: { code: string; message: string; details?: object } }
      }

      if (body?.result?.ok === true) {
        return { ok: true, value: body.result.value, httpStatus: 200 }
      }
      if (body?.result?.ok === false && body.result.error) {
        return { ok: false, httpStatus: 200, error: body.result.error }
      }
      return {
        ok: false,
        httpStatus: 502,
        error: { code: 'gateway/protocol', message: 'Invalid RPC envelope from remote DSH' },
      }
    } catch (error) {
      return {
        ok: false,
        httpStatus: 0,
        error: {
          code: 'transport',
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }
}

/** Compare the optional list-surface projection hint block without sharing identity. */
function projectionsEqual(
  left: RemoteSessionSummary['projections'],
  right: RemoteSessionSummary['projections'],
): boolean {
  if (left === right) return true
  if (left === undefined || right === undefined) return false
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Major generation of a DSH version string. `0.1.x` is list-only. */
export function protocolGeneration(version: string | undefined): '0.2' | '0.1' | 'unknown' {
  if (version === undefined) return 'unknown'
  const match = /^v?(\d+)\.(\d+)/.exec(version.trim())
  if (match === null) return 'unknown'
  const major = Number(match[1])
  const minor = Number(match[2])
  if (major > 0 || minor >= 2) return '0.2'
  if (major === 0 && minor === 1) return '0.1'
  return 'unknown'
}

/**
 * A body is 0.2 only when it says so. An `items` array alone is shared with
 * 0.1 list responses and must not promote the device to the live protocol.
 */
export function classifyRemoteProtocol(value: unknown): '0.2' | '0.1' | 'unknown' {
  if (!isRecord(value)) return 'unknown'
  const fromVersion = protocolGeneration(typeof value.version === 'string' ? value.version : undefined)
  if (fromVersion !== 'unknown') return fromVersion
  const fromProtocol = protocolGeneration(typeof value.protocolVersion === 'string' ? value.protocolVersion : undefined)
  if (fromProtocol !== 'unknown') return fromProtocol
  if (value.protocol === '0.2' || value.wire === '0.2') return '0.2'
  return 'unknown'
}

/**
 * Decide the protocol from the two probes.
 * `session/list` without a version stays 0.2 unless `host.describe` says 0.1.
 * An `items` array on its own is not enough when the legacy probe disagrees.
 */
export function resolveProbedProtocol(
  sessionListValue: unknown,
  hostDescribeValue: unknown,
): { protocol: '0.2' | '0.1'; version?: string } | undefined {
  const listGen = classifyRemoteProtocol(sessionListValue)
  const describeGen = classifyRemoteProtocol(hostDescribeValue)
  const listVersion = isRecord(sessionListValue) && typeof sessionListValue.version === 'string'
    ? sessionListValue.version
    : undefined
  const describeVersion = isRecord(hostDescribeValue) && typeof hostDescribeValue.version === 'string'
    ? hostDescribeValue.version
    : undefined

  if (listGen === '0.1' || describeGen === '0.1') {
    return { protocol: '0.1', ...(describeVersion ?? listVersion ? { version: describeVersion ?? listVersion } : {}) }
  }
  if (listGen === '0.2' || describeGen === '0.2') {
    return { protocol: '0.2', ...(listVersion ?? describeVersion ? { version: listVersion ?? describeVersion } : {}) }
  }
  if (isRecord(sessionListValue) && Array.isArray(sessionListValue.items)) {
    return { protocol: '0.2', ...(listVersion !== undefined ? { version: listVersion } : {}) }
  }
  if (describeVersion !== undefined || (isRecord(hostDescribeValue) && typeof hostDescribeValue.cwd === 'string')) {
    return { protocol: '0.1', ...(describeVersion !== undefined ? { version: describeVersion } : {}) }
  }
  return undefined
}

function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    function done(): void {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

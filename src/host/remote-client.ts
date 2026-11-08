/**
 * Cross-version Remote DSH Client (`RemoteDeviceClient`).
 *
 * Connects to one remote DSH instance (over an SSH tunnel or direct HTTP/S) and speaks
 * BOTH **DSH 0.2.x** (`/api/<namespace>/<method>` + `/api/remote.mux`) AND **DSH 0.1.x**
 * (`/api/<domain>.<method>`, list-only polling compatibility).
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
  type PendingInteractionKind,
  type RemoteProtocolVersion,
} from '../contract.ts'
import { DeviceCatalog } from './device-catalog.ts'
import { DeviceAuthManager } from './auth.ts'
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
  /** Optional auth-state callback so 401/403 on control/RPC surfaces in the UI. */
  readonly onAuthState?: (deviceId: DeviceId, state: DeviceAuthState, error?: string) => void
}

/** Plain predicate keeps callers from narrowing a live lifecycle field. */
function isConnectedState(state: DeviceConnectionState): boolean {
  return state === 'connected'
}

const BACKOFF_BASE_MS = 600
const BACKOFF_MAX_MS = 12_000
const MAX_MUX_PAYLOAD_BYTES = 16 * 1024 * 1024

type RawRpcResult =
  | { ok: true; value: unknown; httpStatus: number }
  | { ok: false; httpStatus: number; error: { code: string; message: string; details?: object } }

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
  private readonly catalog = new DeviceCatalog()
  private refreshHealthy = true
  private generationAbort = new AbortController()
  private baselineGeneration: number | undefined
  private get generation(): number { return this.catalog.epoch }
  private get lastSyncedAt(): number | undefined { return this.catalog.syncedAt }
  private get catalogStale(): boolean { return this.catalog.stale }
  private get summaries(): readonly RemoteSessionSummary[] { return this.catalog.sessions }
  private get workspaces(): readonly RemoteWorkspaceItem[] { return this.catalog.workspaces }
  private get archivedSessionIds(): readonly string[] { return this.catalog.archivedIds }
  private get pinnedSessionIds(): readonly string[] { return this.catalog.pinnedIds }
  private get projectionsBySession(): ReadonlyMap<string, { asOfSeq: number; values: Record<string, unknown> }> {
    return this.catalog.controlProjections
  }
  private baselineFlight: { epoch: number; promise: Promise<void> } | undefined
  private authRecovery: { epoch: number; promise: Promise<boolean> } | undefined
  private readonly pendingInteractions = new Map<string, RemotePendingInteraction>()

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
              bootstrapFromRemoteCredentials: this.config.transport.bootstrapFromRemoteCredentials === true,
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

  /** Monotonic transport epoch; asynchronous work must never cross this fence. */
  get connectionGeneration(): number {
    return this.generation
  }

  /** A live, events-ready baseline (never merely an open socket or cached rows). */
  get catalogFresh(): boolean {
    return this.isConnected() && !this.catalogStale && this.refreshHealthy && this.baselineGeneration === this.generation
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
    if (cache === undefined || !this.catalog.hydrate(cache)) return
    if (cache.protocolVersion !== 'unknown') this.protocolVersion = cache.protocolVersion
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
    return this.catalog.visibleSessions()
  }

  workspaceItems(): readonly RemoteWorkspaceItem[] {
    return this.workspaces
  }

  archivedIds(): readonly string[] {
    return this.archivedSessionIds
  }

  setArchivedIds(ids: readonly string[]): void {
    this.catalog.setArchivedIds(ids)
  }

  pinnedIds(): readonly string[] {
    return this.pinnedSessionIds
  }

  setPinnedIds(ids: readonly string[]): void {
    this.catalog.setPinnedIds(ids)
  }

  /**
   * Refresh the remote `session/list` catalog and notify local `$events`
   * listeners of any newly created or updated remote Sessions.
   */
  refreshSessionCatalog(signal?: AbortSignal): Promise<void> {
    if (this.protocolVersion !== '0.2' || signal?.aborted) return Promise.resolve()
    if (this.running && !this.catalog.eventsReady) return Promise.resolve()
    return this.loadSessionBaseline(this.catalog.epoch, signal)
  }

  private setRefreshHealthy(healthy: boolean): void {
    if (this.refreshHealthy === healthy) return
    this.refreshHealthy = healthy
    this.callbacks.onStateChanged(this.id)
  }

  private loadSessionBaseline(epoch: number, callerSignal?: AbortSignal): Promise<void> {
    if (this.baselineFlight?.epoch === epoch) return this.baselineFlight.promise
    const signal = AbortSignal.any([this.generationAbort.signal,
      ...(this.iterationAbort === undefined ? [] : [this.iterationAbort.signal]),
      ...(callerSignal === undefined ? [] : [callerSignal])])
    let previous: ReadonlyMap<string, RemoteSessionSummary> = new Map()
    let transportThrew = false
    const promise = this.catalog.refreshSessions(epoch, async () => {
      try {
        const res = await this.rawRpcPost('session/list', { args: { _request: {} } }, signal)
        if (!res.ok) return undefined
        return res.value
      } catch (error) { transportThrew = true; throw error }
    }, false, signal, () => {
      // Event deltas already reached consumers: compare with the current table.
      previous = new Map(this.summaries.map(summary => [summary.sessionId, summary]))
    }).then(applied => {
      if (!applied || signal.aborted || !this.catalog.isCurrent(epoch)) return
      this.prunePendingInteractions(new Set(this.summaries.map(summary => summary.sessionId)))
      this.baselineGeneration = epoch
      this.refreshHealthy = true
      this.reconcileSessionSummaries(previous)
      this.callbacks.onStateChanged(this.id)
    }).catch(error => {
      if (signal.aborted || !this.catalog.isCurrent(epoch)) return
      this.setRefreshHealthy(false)
      // Preserve public behavior: RPC/malformed failures lower freshness; thrown IO still rejects.
      if (transportThrew) throw error
    }).finally(() => {
      if (this.baselineFlight?.promise === promise) this.baselineFlight = undefined
    })
    this.baselineFlight = { epoch, promise }
    return promise
  }

  private prunePendingInteractions(sessionIds: ReadonlySet<string>): void {
    for (const [eventId, pending] of this.pendingInteractions) {
      if (sessionIds.has(pending.rawSessionId)) continue
      this.pendingInteractions.delete(eventId)
      this.callbacks.onRemoteEventFrame(this.id, { type: 'cancel', eventId: pending.namespacedEventId })
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
    this.invalidateGeneration()
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

  /** Fence every async operation before a transport/configuration can change. */
  private invalidateGeneration(): void {
    this.generationAbort.abort()
    this.generationAbort = new AbortController()
    this.catalog.beginEpoch()
    this.baselineFlight = undefined
    this.authRecovery = undefined
    this.baselineGeneration = undefined
    this.refreshHealthy = true
    this.remoteEventsClientId = undefined
    this.clearPendingInteractions()
  }

  /** Preserve offline rows, but never claim live execution or pending requests. */
  private markDisconnected(): void {
    // A transport loss is not a terminal execution observation. Merely expose
    // stale rows with running masked; never mint an unread completion from it.
    this.clearPendingInteractions()
  }

  /** Drop every pending waterfall and close its local card. */
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

  updateConfig(next: DeviceConfig): void {
    this.stop()
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
  // Public Remote RPC & Stream Operations
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
      if (socket === this.muxSocket) this.muxStreams.delete(streamId)
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
    const generation = this.generation
    const pending = this.pendingInteractions.get(remoteEventId)
    const acknowledge = (ok: boolean): void => {
      if (!ok || outcome.kind === 'next' || generation !== this.generation) return
      if (this.pendingInteractions.get(remoteEventId) !== pending) return
      if (this.pendingInteractions.delete(remoteEventId)) this.callbacks.onStateChanged(this.id)
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
      acknowledge(res.ok)
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
      AbortSignal.any([this.generationAbort.signal, ...(signal !== undefined ? [signal] : [])]),
    )
    acknowledge(res.ok)
    return { ok: res.ok, ...(res.ok ? {} : { error: res.error.message }) }
  }

  // ==========================================================================
  // Internal Connection & Stream Supervision Loop
  // ==========================================================================

  private async superviseLoop(outerSignal: AbortSignal): Promise<void> {
    while (this.running && !outerSignal.aborted) {
      this.iterationAbort?.abort()
      this.invalidateGeneration()
      const iterAbort = new AbortController()
      this.iterationAbort = iterAbort
      const signal = AbortSignal.any([outerSignal, iterAbort.signal, this.generationAbort.signal])
      const epoch = this.catalog.epoch
      try {
        this.state = this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting'
        this.callbacks.onStateChanged(this.id)

        // Step 1: Ensure transport (SSH tunnel or direct URL) is up
        const baseUrl = await this.ensureTransportUp(signal)
        if (signal.aborted || !this.catalog.isCurrent(epoch)) return
        if (baseUrl === undefined) {
          throw new Error(this.tunnel?.status().error ?? 'Transport endpoint unavailable')
        }

        // Step 2: Ensure authentication
        const authRes = await this.authManager.ensureAuthenticated(this.config, baseUrl)
        if (signal.aborted || !this.catalog.isCurrent(epoch)) return
        if (!authRes.ok) {
          throw new Error(authRes.error)
        }

        // Step 3: Probe protocol & fetch initial session list
        const t0 = Date.now()
        const probed = await this.handshakeAndLoadInitial(baseUrl, signal, epoch)
        if (signal.aborted || !this.catalog.isCurrent(epoch)) return
        this.latencyMs = Date.now() - t0
        this.protocolVersion = probed.protocolVersion
        this.realtime = probed.protocolVersion === '0.2'
        if (probed.remoteDshVersion !== undefined) {
          this.remoteDshVersion = probed.remoteDshVersion
        }

        // Step 4: Hold live streams until disconnection.
        // A socket is not a directory baseline: all live subscriptions must be ready.
        if (this.protocolVersion === '0.2') {
          await this.runProtocol02Streams(baseUrl, signal, () => {
            if (signal.aborted || !this.catalog.markLive(epoch)) return
            this.state = 'connected'
            this.connectedAt = Date.now()
            this.lastError = undefined
            this.reconnectAttempt = 0
            this.callbacks.onStateChanged(this.id)
            this.callbacks.onWorkspacesChanged(this.id)
          }, epoch)
        } else {
          if (!this.catalog.markLive(epoch, true)) return
          this.state = 'connected'
          this.connectedAt = Date.now()
          this.lastError = undefined
          this.reconnectAttempt = 0
          this.callbacks.onStateChanged(this.id)
          await this.runProtocol01Polling(baseUrl, signal)
        }
      } catch (error) {
        if (signal.aborted || !this.running || !this.catalog.isCurrent(epoch)) return
        this.lastError = error instanceof Error ? error.message : String(error)
        this.state = 'error'
        this.invalidateGeneration()
        this.closeMuxSocket()
        this.markDisconnected()
        this.callbacks.onStateChanged(this.id)
      } finally {
        iterAbort.abort()
        if (this.iterationAbort === iterAbort) {
          this.iterationAbort = undefined
          this.closeMuxSocket()
        }
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
    const tunnel = this.tunnel
    const base = tunnel.baseUrl()
    if (base !== undefined) return base

    // Wait briefly if tunnel is still connecting
    for (let i = 0; i < 20 && !signal.aborted; i++) {
      const current = tunnel.baseUrl()
      if (current !== undefined) return current
      if (tunnel.status().state === 'error') break
      await sleepWithSignal(250, signal)
    }
    return signal.aborted ? undefined : tunnel.baseUrl()
  }

  private async handshakeAndLoadInitial(
    baseUrl: string,
    signal: AbortSignal,
    epoch = this.catalog.epoch,
  ): Promise<{ protocolVersion: '0.2' | '0.1'; remoteDshVersion?: string }> {
    // Try DSH 0.2 `/api/session/list` first
    let res02 = await this.rawRpcPost('session/list', { args: { _request: {} } }, signal)
    if (signal.aborted || !this.catalog.isCurrent(epoch)) throw new Error('Remote connection superseded')
    if (!res02.ok && (res02.httpStatus === 401 || res02.httpStatus === 403)) {
      // Force re-auth and retry once
      this.authManager.invalidate(this.config.id)
      await this.authManager.ensureAuthenticated(this.config, baseUrl, true)
      if (signal.aborted || !this.catalog.isCurrent(epoch)) throw new Error('Remote connection superseded')
      res02 = await this.rawRpcPost('session/list', { args: { _request: {} } }, signal)
      if (signal.aborted || !this.catalog.isCurrent(epoch)) throw new Error('Remote connection superseded')
      if (!res02.ok && (res02.httpStatus === 401 || res02.httpStatus === 403)) {
        this.callbacks.onAuthState?.(this.id, 'required', res02.error.message)
      }
    }
    if (res02.ok) {
      this.callbacks.onAuthState?.(this.id, 'ok')
    }

    if (signal.aborted || !this.catalog.isCurrent(epoch)) throw new Error('Remote connection superseded')
    const body02 = res02.ok ? res02.value : undefined
    const listGen = classifyRemoteProtocol(body02)
    // A versionless `items` body is the normal 0.2 list. Ask host.describe
    // before trusting it, because a 0.1 server can return `items` too.
    let hostValue: unknown
    if (listGen !== '0.2') {
      const res01 = await this.rawRpcPost('host.describe', {}, signal, 'host.describe')
      if (res01.ok) hostValue = res01.value
    }
    signal.throwIfAborted()
    const resolved = resolveProbedProtocol(body02, hostValue)
    if (signal.aborted || !this.catalog.isCurrent(epoch)) throw new Error('Remote connection superseded')
    if (resolved?.protocol === '0.2') {
      // Probe only: the authoritative list is fetched after `$events` ready.
      this.realtime = true
      return { protocolVersion: '0.2', remoteDshVersion: resolved.version ?? '0.2.x' }
    }
    if (resolved?.protocol === '0.1') {
      if (isRecord(hostValue) && typeof hostValue.cwd === 'string') {
        this.remoteHome = hostValue.cwd
      }
      await this.refreshLegacy01Lists(signal)
      if (signal.aborted || !this.catalog.isCurrent(epoch)) throw new Error('Remote connection superseded')
      this.realtime = false
      return { protocolVersion: '0.1', remoteDshVersion: resolved.version ?? '0.1.x' }
    }

    throw new Error(res02.ok ? 'Unrecognized DSH /api response' : res02.error.message)
  }

  private async runProtocol02Streams(
    baseUrl: string,
    signal: AbortSignal,
    onReady?: () => void,
    epoch = this.catalog.epoch,
  ): Promise<void> {
    signal.throwIfAborted()
    const wsUrl = new URL('/api/remote.mux', baseUrl)
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    const headers = this.authManager.getAuthHeaders(this.config)

    const socket = new WebSocket(wsUrl.href, {
      headers,
      maxPayload: MAX_MUX_PAYLOAD_BYTES,
      rejectUnauthorized:
        this.config.transport.kind === 'direct'
          ? this.config.transport.rejectUnauthorized !== false
          : true,
    })
    this.muxSocket = socket

    await new Promise<void>((resolve, reject) => {
      const onOpen = (): void => { cleanup(); resolve() }
      const onErr = (err: Error): void => { cleanup(); reject(err) }
      const onAbort = (): void => { cleanup(); reject(new Error('Remote connection aborted')) }
      const onClose = (): void => onErr(new Error('Remote stream WebSocket closed before open'))
      const cleanup = (): void => {
        socket.off('open', onOpen)
        socket.off('error', onErr)
        socket.off('close', onClose)
        signal.removeEventListener('abort', onAbort)
      }
      socket.once('open', onOpen)
      socket.once('error', onErr)
      socket.once('close', onClose)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    })
    if (signal.aborted || !this.catalog.isCurrent(epoch)) return
    let announced = false
    let baselineTimer: ReturnType<typeof setTimeout> | undefined
    const ready = (): void => {
      if (announced || signal.aborted || !this.catalog.isCurrent(epoch) || !this.catalog.ready) return
      announced = true
      clearTimeout(baselineTimer)
      onReady?.()
    }

    socket.on('message', (data) => {
      if (signal.aborted || !this.catalog.isCurrent(epoch)) return
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

    const baselineTimeout = new Promise<never>((_, reject) => {
      baselineTimer = setTimeout(() => reject(new Error('Remote catalog baseline timed out')), 15_000)
      baselineTimer.unref?.()
    })
    try {
      await Promise.race([
        closed,
        baselineTimeout,
        this.pump02RemoteEvents(signal, epoch, ready).then(() => { if (!signal.aborted) throw new Error('Remote $events stream ended') }),
        this.pump02WorkspaceFollow(signal, epoch, ready),
        this.pump02SessionControl(signal, epoch, ready).then(() => { if (!signal.aborted) throw new Error('Remote session/control stream ended') }),
      ])
    } finally {
      clearInterval(pingInterval)
      clearTimeout(baselineTimer)
    }
  }

  private async pump02RemoteEvents(signal: AbortSignal, epoch = this.catalog.epoch, onReady = (): void => {}): Promise<void> {
    let baseline: Promise<void> | undefined
    let baselineError: unknown
    for await (const item of this.openStream('$events', {}, signal)) {
      if (signal.aborted || !this.catalog.isCurrent(epoch)) return
      if (baselineError !== undefined) throw baselineError
      if (!isRecord(item) || typeof item.type !== 'string') continue
      if (item.type === 'ready') {
        if (typeof item.clientId === 'string') {
          this.remoteEventsClientId = item.clientId
        }
        if (isRecord(item.host) && typeof item.host.home === 'string') {
          this.remoteHome = item.host.home
          this.callbacks.onStateChanged(this.id)
        }
        if (typeof item.clientId !== 'string' || item.clientId.length === 0) continue
        this.catalog.markEventsReady(epoch)
        // Do not await here: the event pump must journal all deltas during HTTP IO.
        baseline ??= this.loadSessionBaseline(epoch).then(() => {
          if (!signal.aborted && this.catalog.isCurrent(epoch) && !this.refreshHealthy) throw new Error('Remote session baseline unavailable')
          onReady()
        }).catch(error => {
          baselineError = error
          if (this.catalog.isCurrent(epoch) && !signal.aborted) this.muxSocket?.close()
        })
        continue
      }

      if (item.type === 'emit' && typeof item.event === 'string' && Array.isArray(item.args)) {
        this.handle02EmitEvent(item.event, item.args, epoch)
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

  private handle02EmitEvent(event: string, args: unknown[], epoch = this.catalog.epoch): void {
    if (!this.catalog.isCurrent(epoch)) return
    switch (event) {
      case 'api-session/added':
      case 'api-session/removed':
      case 'api-session/status':
      case 'api-session/activity': {
        if (!this.catalog.applySessionEvent(epoch, event, args)) break
        if (event === 'api-session/removed') this.prunePendingInteractions(new Set(this.summaries.map(summary => summary.sessionId)))
        const raw = args[0]
        const summary = event === 'api-session/added' && isRecord(raw)
          ? this.summaries.find(row => row.sessionId === raw.sessionId) : undefined
        this.callbacks.onStateChanged(this.id)
        this.callbacks.onWorkspacesChanged(this.id)
        this.callbacks.onRemoteEventFrame(this.id, {
          type: 'emit', event,
          args: summary !== undefined ? [this.namespaceSummary(summary)]
            : [encodeRemoteSessionId(this.id, args[0] as string), ...args.slice(1)],
        })
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
        // The remote page owns its own settings surfaces; only the device
        // summary (protocol, version, errors) needs a republish.
        this.callbacks.onStateChanged(this.id)
        break
      }
      default:
        break
    }
  }

  private async pump02WorkspaceFollow(signal: AbortSignal, epoch = this.catalog.epoch, onReady = (): void => {}): Promise<void> {
    for await (const frame of this.openStream('workspace/follow', {}, signal)) {
      if (signal.aborted || !this.catalog.isCurrent(epoch)) return
      if (!this.catalog.applyWorkspaceFrame(epoch, frame)) continue
      this.callbacks.onStateChanged(this.id)
      this.callbacks.onWorkspacesChanged(this.id)
      onReady()
    }
    if (!signal.aborted) throw new Error('Remote workspace/follow stream ended')
  }

  private async pump02SessionControl(signal: AbortSignal, epoch = this.catalog.epoch, onReady = (): void => {}): Promise<void> {
    for await (const frame of this.openStream('session/control', {}, signal)) {
      if (signal.aborted || !this.catalog.isCurrent(epoch)) return
      const previous = new Map(this.summaries.map(summary => [summary.sessionId, summary]))
      const updates = this.catalog.applyControlFrame(epoch, frame, (key, value) => this.namespaceProjectionValue(key, value))
      if (updates === undefined) continue
      for (const update of updates) this.callbacks.onControlProjectionFrame(this.id, {
        ...update, sessionId: encodeRemoteSessionId(this.id, update.sessionId),
      })
      if (updates.some(update => update.key === 'title' || update.key === 'sessionListMetadata')) {
        this.reconcileSessionSummaries(previous)
        this.callbacks.onWorkspacesChanged(this.id)
        this.callbacks.onStateChanged(this.id)
      }
      onReady()
    }

  }

  // ==========================================================================
  // DSH 0.1.x Compatibility Layer
  // ==========================================================================

  private async refreshLegacy01Lists(signal: AbortSignal): Promise<void> {
    const epoch = this.catalog.epoch
    const previous = new Map(this.summaries.map(summary => [summary.sessionId, summary]))
    const [sessions, workspaces] = await Promise.all([
      this.catalog.refreshSessions(epoch, async () => {
        const res = await this.rawRpcPost('session.list', {}, signal, 'session.list')
        if (!res.ok) throw new Error(res.error.message)
        return res.value
      }, true),
      this.rawRpcPost('workspace.list', {}, signal, 'workspace.list'),
    ])
    if (signal.aborted || !this.catalog.isCurrent(epoch)) return
    if (!workspaces.ok) throw new Error(workspaces.error.message)
    if (!this.catalog.applyWorkspaceFrame(epoch, { type: 'baseline', value: workspaces.value }, true)) {
      throw new Error('Invalid legacy workspace.list baseline')
    }
    if (sessions) {
      this.baselineGeneration = epoch
      this.refreshHealthy = true
      this.prunePendingInteractions(new Set(this.summaries.map(summary => summary.sessionId)))
      this.reconcileSessionSummaries(previous)
    }
    this.callbacks.onWorkspacesChanged(this.id)
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
    if (signal.aborted) return
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
      socket.on('error', () => { /* Closing a CONNECTING socket emits asynchronously. */ })
      try { socket.close() } catch { /* ignore */ }
    }
  }

  private async rawRpcPost(
    endpointPath: string,
    payload: unknown,
    signal?: AbortSignal,
    methodField = endpointPath,
  ): Promise<RawRpcResult> {
    const epoch = this.generation
    let result = await this.rawRpcPostOnce(endpointPath, payload, signal, methodField)
    // The handshake owns its legacy retry path. Once 0.2 is established, an
    // HTTP auth rejection happens before the RPC handler and is safe to retry
    // once after refreshing the cookie; structured application errors are not.
    if (this.protocolVersion === '0.2' && !result.ok &&
      (result.httpStatus === 401 || result.httpStatus === 403)) {
      const recovered = await this.recoverAuthentication(epoch, signal)
      if (recovered && epoch === this.generation) {
        result = await this.rawRpcPostOnce(endpointPath, payload, signal, methodField)
      }
    }
    if (!result.ok && (result.httpStatus === 401 || result.httpStatus === 403)) {
      this.callbacks.onAuthState?.(this.id, 'required', result.error.message)
    }
    return result
  }

  private recoverAuthentication(epoch: number, signal?: AbortSignal): Promise<boolean> {
    if (this.authRecovery?.epoch === epoch) return this.authRecovery.promise
    if (this.config.auth.mode === 'none' || this.config.auth.mode === 'cookie' || this.config.auth.mode === 'bearer') {
      return Promise.resolve(false)
    }
    const promise = (async (): Promise<boolean> => {
      const isAborted = (): boolean => signal?.aborted === true
      const baseUrl = this.effectiveBaseUrl()
      if (baseUrl === undefined || isAborted()) return false
      this.callbacks.onAuthState?.(this.id, 'unknown')
      this.authManager.invalidate(this.id)
      const result = await this.authManager.ensureAuthenticated(this.config, baseUrl, true)
      if (epoch !== this.generation || isAborted()) return false
      if (result.ok) {
        this.callbacks.onAuthState?.(this.id, 'ok')
        return true
      }
      this.lastError = result.error
      this.state = 'error'
      this.callbacks.onAuthState?.(this.id, 'required', result.error)
      this.callbacks.onStateChanged(this.id)
      // Wake the supervision loop instead of remaining falsely "connected"
      // with a dead cookie. The epoch fence prevents late writes on success.
      this.closeMuxSocket()
      return false
    })()
    this.authRecovery = { epoch, promise }
    const clearRecovery = (): void => {
      if (this.authRecovery?.promise === promise) this.authRecovery = undefined
    }
    void promise.then(clearRecovery, clearRecovery)
    return promise
  }

  private async rawRpcPostOnce(
    endpointPath: string,
    payload: unknown,
    signal?: AbortSignal,
    methodField = endpointPath,
  ): Promise<RawRpcResult> {
    signal = AbortSignal.any([this.generationAbort.signal, ...(signal !== undefined ? [signal] : [])])
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
            return { ok: true, value: parsed.result.value, httpStatus: response.status }
          }
          if (parsed.result.ok === false && parsed.result.error !== undefined) {
            return { ok: false, httpStatus: response.status, error: parsed.result.error }
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

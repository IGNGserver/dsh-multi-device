/**
 * Client-side reactive store, SSE live synchronization, and control-plane RPC client.
 *
 * The Host owns the device list and read state; this store mirrors the Host
 * snapshot and maintains the LRU Keep-Alive set of device pages.
 * `activeNativeDeviceId === undefined` means the leftmost tab, 本机, which is
 * the unmodified local DSH page.
 *
 * @module dsh-multi-device/client/state
 */
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import { useSyncExternalStore } from 'react'
import {
  decodeSessionId,
  type DeviceConnectionState,
  DeviceId,
  encodeRemoteSessionId,
  type MultiDeviceSnapshot,
  type MultiDeviceUiPreferences,
  type SshKeyEntry,
  type UpsertDeviceInput,
  type WorkspaceViewState,
} from '../contract.ts'
import type { ControlPlaneRequest, DiagnosticsClientReport, MultiDeviceDiagnostics } from '../runtime.ts'
import { readNativeBarMetrics, readNativeBarObstruction } from './barMetrics.ts'

/** Per-browser memory of the device tab. */
const ACTIVE_NATIVE_DEVICE_KEY = 'dsh-multi-device.active-native-device'

/**
 * Decide whether an incoming Host snapshot may replace the current one.
 *
 * `revision` only orders snapshots from one Host process; a restart resets it
 * to 1. When `hostEpoch` changes, the sequence starts over and the next
 * snapshot must be accepted even though its number is lower — otherwise a page
 * left open across a restart would drop every update and freeze its counts.
 * Older Hosts omit the epoch, in which case the plain revision comparison
 * applies.
 *
 * @param current - the snapshot the store currently holds.
 * @param next - the incoming snapshot.
 * @param force - accept an equal revision (initial load, error recovery, or an
 *   explicit device-tab override).
 */
export function shouldApplySnapshot(
  current: Pick<MultiDeviceSnapshot, 'revision' | 'hostEpoch'>,
  next: Pick<MultiDeviceSnapshot, 'revision' | 'hostEpoch'>,
  force = false,
): boolean {
  const epochChanged = next.hostEpoch !== undefined && next.hostEpoch !== current.hostEpoch
  if (epochChanged) return true
  if (next.revision < current.revision) return false
  if (next.revision === current.revision && !force) return false
  return true
}

function readStoredActiveNativeDevice(): DeviceId | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined
    const value = localStorage.getItem(ACTIVE_NATIVE_DEVICE_KEY)
    return value === null || value === '' ? undefined : DeviceId(value)
  } catch {
    return undefined
  }
}

function storeActiveNativeDevice(deviceId: DeviceId | undefined): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (deviceId === undefined) localStorage.removeItem(ACTIVE_NATIVE_DEVICE_KEY)
    else localStorage.setItem(ACTIVE_NATIVE_DEVICE_KEY, deviceId)
  } catch {
    // Private mode / blocked storage: keep the in-memory tab only.
  }
}

/** Map device connection lifecycle states to official DSH `StateDot` states. */
export function deviceStateToDotState(state: DeviceConnectionState): StateDotState {
  switch (state) {
    case 'connected':
      return 'done'
    case 'connecting':
    case 'reconnecting':
      return 'ongoing'
    case 'error':
      return 'error'
    case 'disabled':
    default:
      return 'idle'
  }
}

/**
 * Browser-safe parser for shorthand SSH host specifications (`alias`, `user@host`,
 * `user@host:2222`, or `ssh://user@host:2222`).
 */
export function parseSshHostInput(raw: string): {
  readonly host: string
  readonly username?: string
  readonly port?: number
} {
  let trimmed = raw.trim()
  if (trimmed === '') return { host: '' }

  if (trimmed.toLowerCase().startsWith('ssh://')) {
    try {
      const parsed = new URL(trimmed)
      const portNum = parsed.port !== '' ? Number(parsed.port) : undefined
      return {
        host: parsed.hostname,
        ...(parsed.username !== '' ? { username: decodeURIComponent(parsed.username) } : {}),
        ...(portNum !== undefined && Number.isInteger(portNum) && portNum > 0 && portNum <= 65535
          ? { port: portNum }
          : {}),
      }
    } catch {
      trimmed = trimmed.slice('ssh://'.length)
    }
  }

  let username: string | undefined
  const atIndex = trimmed.lastIndexOf('@')
  if (atIndex > 0 && atIndex < trimmed.length - 1) {
    username = trimmed.slice(0, atIndex)
    trimmed = trimmed.slice(atIndex + 1)
  }

  // Bracketed IPv6: [::1]:2222 or [::1]
  if (trimmed.startsWith('[')) {
    const closeIdx = trimmed.indexOf(']')
    if (closeIdx > 1) {
      const host = trimmed.slice(1, closeIdx)
      const rest = trimmed.slice(closeIdx + 1)
      if (rest.startsWith(':')) {
        const portNum = Number(rest.slice(1))
        if (Number.isInteger(portNum) && portNum > 0 && portNum <= 65535) {
          return {
            host,
            ...(username !== undefined ? { username } : {}),
            port: portNum,
          }
        }
      }
      return { host, ...(username !== undefined ? { username } : {}) }
    }
  }

  // Host:port (only when there is a single colon, avoiding unbracketed IPv6 literals)
  const firstColon = trimmed.indexOf(':')
  if (firstColon > 0 && firstColon === trimmed.lastIndexOf(':')) {
    const hostPart = trimmed.slice(0, firstColon)
    const portPart = trimmed.slice(firstColon + 1)
    const portNum = Number(portPart)
    if (hostPart !== '' && /^\d+$/.test(portPart) && portNum > 0 && portNum <= 65535) {
      return {
        host: hostPart,
        ...(username !== undefined ? { username } : {}),
        port: portNum,
      }
    }
  }

  return {
    host: trimmed,
    ...(username !== undefined ? { username } : {}),
  }
}

export interface MultiDeviceClientState {
  readonly snapshot: MultiDeviceSnapshot
  readonly loading: boolean
  readonly error?: string
  /** Selected device tab; `undefined` is the 本机 tab. */
  readonly activeNativeDeviceId?: DeviceId
  /**
   * The local Session currently shown in the conversation pane. The Host uses
   * it to decide whether a completion lands on a conversation the user is
   * actually looking at.
   */
  readonly activeSessionId?: string
  /** Devices whose Native Mode `<webview>` / `<iframe>` instances are kept alive in the DOM. */
  readonly keepAliveDeviceIds: readonly DeviceId[]
  /** Reload counter per deviceId for triggering iframe/webview reload without losing other devices. */
  readonly reloadCounters: Readonly<Record<string, number>>
  /** Fallback settings modal open state when the host shell does not expose `sidebar.settings`. */
  readonly settingsModalOpen: boolean
}

const MAX_KEEP_ALIVE_PAGES = 6

/** Identify this browser instance so two tabs cannot starve each other's sequences. */
const CLIENT_INSTANCE_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `client-${String(Date.now())}-${Math.random().toString(36).slice(2)}`

const EMPTY_SNAPSHOT: MultiDeviceSnapshot = {
  revision: 0,
  devices: [],
  sshConfigHosts: [],
  unreadSessionIds: [],
  ui: { crossHostReadState: false, crossHostUiState: false, taskbarSummary: false },
}

interface ResponseFence {
  readonly lifecycle: number
  readonly connection: number
  host: number
  readonly request: number
  readonly key: string
}

type ControlPlaneResult<T> = ({ ok: true; value: T } | { ok: false; error: string }) & { stale?: true }

export class MultiDeviceClientStore {
  readonly clientId = CLIENT_INSTANCE_ID
  private mainViewVisible = true
  private state: MultiDeviceClientState
  private readonly listeners = new Set<() => void>()
  private eventSource: EventSource | undefined
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private sseRetryTimer: ReturnType<typeof setTimeout> | undefined
  private sseAttempt = 0
  private started = false
  private disposed = false
  private lifecycleGeneration = 0
  private lifecycleAbort = new AbortController()
  private snapshotInFlight: Promise<void> | undefined
  private navigationGeneration = 0
  private connectionGeneration = 0
  private hostGeneration = 0
  private requestSequence = 0
  private readonly latestRequests = new Map<string, number>()
  private readonly responseFences = new WeakMap<object, ResponseFence>()
  /** Epochs are opaque identities, never lexically or numerically ordered. */
  private readonly retiredEpochs = new Set<string>()
  private visibilityDocument: Document | undefined
  private readonly onVisibilityChange = (): void => {
    this.clearUnreadForActiveSession(this.state.snapshot)
  }
  /** Latest Session reported to the Host, used to dedupe mount/cleanup races. */
  private reportedSessionId: string | undefined
  private hasReportedSession = false
  private observedLocalMainSessionId: string | undefined

  /** Ignore the unchanged background main view, not an actual local navigation. */
  reportLocalMainSession(sessionId: string): Promise<void> {
    this.observedLocalMainSessionId = sessionId
    return this.setActiveSession(sessionId)
  }
  private reportingSessionId: string | undefined
  private activeSessionInFlight: Promise<void> | undefined
  /** Monotonic control-plane sequence so an older HTTP request cannot win. */
  private activeSessionSeq = 0
  private lastPollAt = 0
  /** Sessions for which this client already asked the Host to clear unread. */
  private readonly unreadClearInFlight = new Map<string, { completionId: string | undefined }>()

  constructor() {
    this.state = {
      snapshot: EMPTY_SNAPSHOT,
      loading: true,
      // Restored so a browser refresh keeps the last device tab while the
      // device still exists in the Host snapshot.
      activeNativeDeviceId: readStoredActiveNativeDevice(),
      keepAliveDeviceIds: [],
      reloadCounters: {},
      settingsModalOpen: false,
    }
  }

  getSnapshot = (): MultiDeviceClientState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setState(patch: Partial<MultiDeviceClientState>): void {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) {
      try { listener() } catch { /* ignore */ }
    }
  }

  private resetActiveSessionReport(): void {
    this.hasReportedSession = false
    this.reportedSessionId = undefined
    this.activeSessionSeq += 1
    this.activeSessionInFlight = undefined
    this.reportingSessionId = undefined
  }

  private isFenceCurrent(fence: ResponseFence): boolean {
    return !this.disposed && fence.lifecycle === this.lifecycleGeneration &&
      fence.connection === this.connectionGeneration && fence.host === this.hostGeneration &&
      this.latestRequests.get(fence.key) === fence.request
  }

  private isResponseCurrent(response: { stale?: true }): boolean {
    if (response.stale === true || this.disposed) return false
    const fence = this.responseFences.get(response)
    return fence === undefined || this.isFenceCurrent(fence)
  }

  start(): () => void {
    if (this.started || this.disposed) return () => {}
    this.started = true
    this.lifecycleAbort = new AbortController()
    const lifecycle = ++this.lifecycleGeneration
    this.resetActiveSessionReport()
    this.sseAttempt = 0
    this.lastPollAt = 0
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this.visibilityDocument = document
      document.addEventListener('visibilitychange', this.onVisibilityChange)
    }
    // Establish the connection fence before issuing the initial HTTP request.
    this.connectSse()
    void this.refreshSnapshot()
    this.clearUnreadForActiveSession(this.state.snapshot)
    this.pollTimer = setInterval(() => {
      if (!this.started || lifecycle !== this.lifecycleGeneration) return
      const sseOpen = typeof EventSource !== 'undefined' && this.eventSource?.readyState === EventSource.OPEN
      if (sseOpen) return
      const now = Date.now()
      if (now - this.lastPollAt < 4_000) return
      this.lastPollAt = now
      void this.refreshSnapshot()
    }, 5_000)
    return () => {
      if (lifecycle === this.lifecycleGeneration) this.stop()
    }
  }

  private stop(): void {
    this.started = false
    this.lifecycleGeneration += 1
    this.navigationGeneration += 1
    this.lifecycleAbort.abort()
    this.connectionGeneration += 1
    this.latestRequests.clear()
    this.snapshotInFlight = undefined
    this.resetActiveSessionReport()
    this.unreadClearInFlight.clear()
    if (this.pollTimer !== undefined) clearInterval(this.pollTimer)
    this.pollTimer = undefined
    this.eventSource?.close()
    this.eventSource = undefined
    if (this.sseRetryTimer !== undefined) clearTimeout(this.sseRetryTimer)
    this.sseRetryTimer = undefined
    this.visibilityDocument?.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.visibilityDocument = undefined
  }

  /** Final teardown (including HMR): a disposed store cannot be restarted. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stop()
    this.listeners.clear()
  }

  private connectSse(): void {
    if (typeof EventSource === 'undefined' || !this.started || this.disposed) return
    this.eventSource?.close()
    const lifecycle = this.lifecycleGeneration
    const connection = ++this.connectionGeneration
    this.resetActiveSessionReport()
    this.unreadClearInFlight.clear()
    const current = (): boolean => this.started && !this.disposed &&
      lifecycle === this.lifecycleGeneration && connection === this.connectionGeneration
    try {
      const es = new EventSource(`/multi-device/events?clientId=${encodeURIComponent(this.clientId)}`)
      this.eventSource = es
      es.addEventListener('snapshot', (ev) => {
        if (!current() || this.eventSource !== es) return
        this.sseAttempt = 0
        try {
          const snap = JSON.parse((ev as MessageEvent<string>).data) as MultiDeviceSnapshot
          this.applyIncomingSnapshot(snap)
        } catch {
          // Ignore malformed event
        }
      })
      es.onerror = () => {
        if (!current() || this.eventSource !== es) return
        es.close()
        this.eventSource = undefined
        // Retire callbacks and HTTP requests from the failed connection now,
        // rather than waiting for the retry timer to establish a new one.
        this.connectionGeneration += 1
        this.resetActiveSessionReport()
        this.unreadClearInFlight.clear()
        if (this.sseRetryTimer !== undefined) return
        const delay = Math.min(15_000, 500 * 2 ** this.sseAttempt)
        this.sseAttempt = Math.min(this.sseAttempt + 1, 6)
        this.sseRetryTimer = setTimeout(() => {
          if (!this.started || lifecycle !== this.lifecycleGeneration || this.disposed) return
          this.sseRetryTimer = undefined
          this.connectSse()
        }, delay)
      }
    } catch {
      // Fallback to polling
    }
  }

  private applyIncomingSnapshot(
    snap: MultiDeviceSnapshot,
    activeOverride?: DeviceId | null,
  ): void {
    if (this.disposed) return
    const fence = this.responseFences.get(snap)
    if (fence !== undefined && !this.isFenceCurrent(fence)) return
    const previous = this.state.snapshot
    if (snap.hostEpoch !== undefined && this.retiredEpochs.has(snap.hostEpoch)) return
    // Once this connection speaks epochs, an unversioned late reply cannot
    // downgrade it back to the legacy protocol.
    if (previous.hostEpoch !== undefined && snap.hostEpoch === undefined) return
    const force = activeOverride !== undefined ||
      this.state.loading ||
      this.state.error !== undefined
    if (!shouldApplySnapshot(previous, snap, force)) return
    const epochChanged = snap.hostEpoch !== undefined && snap.hostEpoch !== previous.hostEpoch
    if (epochChanged) {
      if (previous.hostEpoch !== undefined) this.retiredEpochs.add(previous.hostEpoch)
      this.hostGeneration += 1
      // The response establishing this epoch belongs to the new generation;
      // all other outstanding HTTP responses remain fenced out.
      if (fence !== undefined) fence.host = this.hostGeneration
      this.resetActiveSessionReport()
      this.unreadClearInFlight.clear()
    }
    const configuredIds = new Set(snap.devices.map(device => device.id))
    const keepAliveEligible = new Set(
      snap.devices.filter(device => device.keepNativeAlive !== false).map(device => device.id),
    )

    let activeNative: DeviceId | undefined
    if (activeOverride === null) {
      activeNative = undefined
    } else if (activeOverride !== undefined && configuredIds.has(activeOverride)) {
      activeNative = activeOverride
    } else if (
      this.state.activeNativeDeviceId !== undefined &&
      configuredIds.has(this.state.activeNativeDeviceId)
    ) {
      activeNative = this.state.activeNativeDeviceId
    }
    // No "first device" fallback: 本机 is the stable default and the only tab
    // guaranteed to exist.
    storeActiveNativeDevice(activeNative)

    const keepAlive = this.state.keepAliveDeviceIds
      .filter(id => keepAliveEligible.has(id))
      .slice(-MAX_KEEP_ALIVE_PAGES)
    if (activeNative !== undefined && keepAliveEligible.has(activeNative) && !keepAlive.includes(activeNative)) {
      keepAlive.push(activeNative)
      while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) keepAlive.shift()
    }
    this.setState({
      snapshot: snap,
      loading: false,
      error: undefined,
      activeNativeDeviceId: activeNative,
      keepAliveDeviceIds: keepAlive,
    })
    this.clearUnreadForActiveSession(snap)
    if (epochChanged) void this.setActiveSession(this.state.activeSessionId)
  }

  /**
   * A completion can arrive while its conversation is already the main view.
   * The Host has no reliable cross-client presence signal, so every *visible*
   * viewing client clears the marker as soon as it sees it. The next snapshot
   * removes the dot everywhere; the round-trip is short enough to avoid a
   * lingering reminder and keeps the "main view is read" rule identical to
   * DSH's.
   *
   * A hidden tab must NOT clear: nobody is looking at it, so consuming the
   * unread marker would silently drop the only reminder the user had. The
   * visibilitychange handler clears it immediately when the tab becomes visible.
   */
  private clearUnreadForActiveSession(snap: MultiDeviceSnapshot): void {
    if (this.disposed) return
    const active = this.state.activeSessionId
    if (active === undefined) return
    if (this.effectiveSessionId() !== active) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const unread = snap.unreadSessionIds ?? []
    if (!unread.includes(active)) return
    const completionId = this.readCompletionId(snap, active)
    const previous = this.unreadClearInFlight.get(active)
    if (previous !== undefined && previous.completionId === completionId) return
    const pending = { completionId }
    this.unreadClearInFlight.set(active, pending)
    void this.markSessionRead(active).finally(() => {
      if (this.unreadClearInFlight.get(active) === pending) this.unreadClearInFlight.delete(active)
    })
  }

  private activateNativeDevice(deviceId: DeviceId): void {
    const device = this.state.snapshot.devices.find(candidate => candidate.id === deviceId)
    if (device === undefined) return
    const keepAliveEligible = new Set(
      this.state.snapshot.devices
        .filter(candidate => candidate.keepNativeAlive !== false)
        .map(candidate => candidate.id),
    )
    const keepAlive = this.state.keepAliveDeviceIds.filter(id => keepAliveEligible.has(id) && id !== deviceId)
    if (keepAliveEligible.has(deviceId)) {
      keepAlive.push(deviceId)
      while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) keepAlive.shift()
    }
    storeActiveNativeDevice(deviceId)
    this.setState({ activeNativeDeviceId: deviceId, keepAliveDeviceIds: keepAlive })
  }

  /**
   * Mount (and keep alive) one device frame without selecting its tab.
   * Idempotent; unknown/disabled devices are ignored.
   */
  ensureKeepAliveDevice(deviceId: DeviceId): void {
    const device = this.state.snapshot.devices.find(candidate => candidate.id === deviceId)
    if (device === undefined || device.keepNativeAlive === false) return
    if (this.state.keepAliveDeviceIds.includes(deviceId)) return
    const keepAlive = [...this.state.keepAliveDeviceIds, deviceId]
    while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) keepAlive.shift()
    this.setState({ keepAliveDeviceIds: keepAlive })
  }

  // ==========================================================================
  // UI Navigation & Keep-Alive Actions
  // ==========================================================================

  /** Switch to a remote device tab. */
  selectNativeDevice(deviceId: DeviceId): Promise<{ ok: boolean; error?: string }> {
    this.activateNativeDevice(deviceId)
    return Promise.resolve({ ok: true })
  }

  /** Return to the 本机 tab. */
  selectLocalNativeTab(): void {
    this.navigationGeneration += 1
    this.enterLocalScope()
  }

  /** Restore the local Session scope for the 本机 tab, even when none exists. */
  private enterLocalScope(): void {
    const localSessionId = this.observedLocalMainSessionId
    storeActiveNativeDevice(undefined)
    this.setState({ activeNativeDeviceId: undefined, activeSessionId: localSessionId })
    void this.setActiveSession(localSessionId)
    this.clearUnreadForActiveSession(this.state.snapshot)
  }

  releaseKeepAliveDevice(deviceId: DeviceId): void {
    const nextKeepAlive = this.state.keepAliveDeviceIds.filter(id => id !== deviceId)
    const nextActive =
      this.state.activeNativeDeviceId === deviceId
        ? nextKeepAlive[nextKeepAlive.length - 1]
        : this.state.activeNativeDeviceId
    storeActiveNativeDevice(nextActive)
    this.setState({
      keepAliveDeviceIds: nextKeepAlive,
      activeNativeDeviceId: nextActive,
    })
    if (nextActive === undefined) this.enterLocalScope()
  }

  reloadNativeDevice(deviceId: DeviceId): void {
    const current = this.state.reloadCounters[deviceId] ?? 0
    this.setState({
      reloadCounters: {
        ...this.state.reloadCounters,
        [deviceId]: current + 1,
      },
    })
  }

  setSettingsModalOpen(open: boolean): void {
    this.setState({ settingsModalOpen: open })
  }

  /** The local mirror is mounted behind device tabs and global panels. */
  effectiveSessionId(): string | undefined {
    if (!this.mainViewVisible) return undefined
    if (this.state.activeNativeDeviceId !== undefined) return undefined
    return this.state.activeSessionId
  }

  setMainViewVisible(visible: boolean): void {
    if (this.mainViewVisible === visible) return
    this.mainViewVisible = visible
    this.setState({})
    if (visible) this.clearUnreadForActiveSession(this.state.snapshot)
  }

  setActiveSession(sessionId: string | undefined): Promise<void> {
    if (this.disposed) return Promise.resolve()
    const next = sessionId || undefined
    if (this.state.activeSessionId !== next) this.setState({ activeSessionId: next })
    this.clearUnreadForActiveSession(this.state.snapshot)
    if (this.hasReportedSession && this.reportedSessionId === next && this.activeSessionInFlight === undefined) return Promise.resolve()
    if (this.activeSessionInFlight !== undefined && this.reportingSessionId === next) return this.activeSessionInFlight
    const requestSeq = ++this.activeSessionSeq
    this.reportingSessionId = next
    const promise = this.callControlPlane<{ accepted: true }>({
      action: 'setActiveSession', payload: { sessionId: next ?? '', requestSeq },
    }).then(result => {
      if (this.isResponseCurrent(result) && result.ok && requestSeq === this.activeSessionSeq) {
        this.reportedSessionId = next
        this.hasReportedSession = true
      }
    }).finally(() => {
      if (this.activeSessionInFlight === promise) this.activeSessionInFlight = undefined
    })
    this.activeSessionInFlight = promise
    this.clearUnreadForActiveSession(this.state.snapshot)
    return promise
  }

  /** Clear the scope only when the unmounting Session is still the reported one. */
  clearActiveSession(sessionId: string): void {
    if (this.state.activeSessionId !== sessionId) return
    void this.setActiveSession(undefined)
  }

  private readCompletionId(snap: MultiDeviceSnapshot, sessionId: string): string | undefined {
    return (snap as MultiDeviceSnapshot & { readCompletions?: Readonly<Record<string, string>> }).readCompletions?.[sessionId]
  }

  /** Ask the Host to clear only the completion this browser actually observed. */
  async markSessionRead(sessionId: string): Promise<boolean> {
    if (sessionId === '') return false
    const expectedCompletionId = this.readCompletionId(this.state.snapshot, sessionId)
    const res = await this.callControlPlane<{ changed: boolean; snapshot: MultiDeviceSnapshot }>({
      action: 'markSessionRead',
      payload: { sessionId, ...(expectedCompletionId !== undefined ? { expectedCompletionId } : {}) },
    })
    if (!this.isResponseCurrent(res) || !res.ok) return false
    this.applyIncomingSnapshot(res.value.snapshot)
    return res.value.changed
  }

  /**
   * Clear every unread marker owned by one device (本机 included).
   *
   * The per-Session read signal depends on a page the Host can observe. When a
   * device is read outside that path (another browser, or a native page whose
   * bridge never became ready), this is the explicit way out.
   */
  async markDeviceRead(deviceId: DeviceId): Promise<{ ok: boolean; changed: number; error?: string }> {
    const res = await this.callControlPlane<{ changed: number; snapshot: MultiDeviceSnapshot }>({
      action: 'markDeviceRead',
      payload: { deviceId },
    })
    if (!this.isResponseCurrent(res)) return { ok: false, changed: 0, error: 'stale-response' }
    if (!res.ok) return { ok: false, changed: 0, error: res.error }
    this.applyIncomingSnapshot(res.value.snapshot)
    return { ok: true, changed: res.value.changed }
  }

  // ==========================================================================
  // Control-Plane RPC Calls
  // ==========================================================================

  async callControlPlane<T = unknown>(
    request: ControlPlaneRequest,
  ): Promise<ControlPlaneResult<T>> {
    const payload = request.payload as Record<string, unknown> | undefined
    const scope = request.action === 'setActiveSession' ? '' :
      payload?.logicalWorkspaceId ?? payload?.sessionId ?? payload?.deviceId ?? payload?.memberKey ?? payload?.ruleId ?? payload?.id ?? ''
    const key = `${request.action}:${String(scope)}`
    const fence: ResponseFence = {
      lifecycle: this.lifecycleGeneration,
      connection: this.connectionGeneration,
      host: this.hostGeneration,
      request: ++this.requestSequence,
      key,
    }
    this.latestRequests.set(key, fence.request)
    const stale = (): ControlPlaneResult<T> => ({ ok: false, error: 'stale-response', stale: true })
    if (this.disposed) return stale()
    try {
      const response = await fetch('/multi-device/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, payload: { ...request.payload, clientId: this.clientId } }),
        signal: AbortSignal.any([this.lifecycleAbort.signal, AbortSignal.timeout(30_000)]),
      })
      const data = (await response.json()) as ControlPlaneResult<T>
      if (!this.isFenceCurrent(fence)) return stale()
      if (data.ok && data.value !== null && typeof data.value === 'object') {
        const value = data.value as { revision?: unknown; snapshot?: MultiDeviceSnapshot }
        const snapshot = typeof value.revision === 'number' ? data.value as unknown as MultiDeviceSnapshot : value.snapshot
        if (snapshot !== undefined && (
          (snapshot.hostEpoch !== undefined && this.retiredEpochs.has(snapshot.hostEpoch)) ||
          (this.state.snapshot.hostEpoch !== undefined && snapshot.hostEpoch === undefined) ||
          (snapshot.hostEpoch === this.state.snapshot.hostEpoch && snapshot.revision < this.state.snapshot.revision)
        )) return stale()
      }
      this.responseFences.set(data, fence)
      if (data.ok && data.value !== null && typeof data.value === 'object') {
        this.responseFences.set(data.value, fence)
        const snapshot = (data.value as { snapshot?: unknown }).snapshot
        if (snapshot !== null && typeof snapshot === 'object') this.responseFences.set(snapshot, fence)
      }
      return data
    } catch (error) {
      if (!this.isFenceCurrent(fence)) return stale()
      const result: ControlPlaneResult<T> = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
      this.responseFences.set(result, fence)
      return result
    }
  }

  async refreshSnapshot(): Promise<void> {
    if (this.disposed) return
    if (this.snapshotInFlight !== undefined) return this.snapshotInFlight
    const pending = this.callControlPlane<MultiDeviceSnapshot>({ action: 'snapshot' })
      .then(async res => {
        if (!this.isResponseCurrent(res)) return
        if (res.ok) {
          this.applyIncomingSnapshot(res.value)
          if (this.isResponseCurrent(res)) await this.setActiveSession(this.state.activeSessionId)
        } else if (!res.stale) {
          this.setState({ loading: false, error: res.error })
        }
      })
    this.snapshotInFlight = pending
    try {
      await pending
    } finally {
      if (this.snapshotInFlight === pending) this.snapshotInFlight = undefined
    }
  }

  /**
   * Ask the Host for a support report. The browser contributes the geometry it
   * alone can see (viewport + Native Mode bar box), so a clipped mode switch is
   * visible in the copied report instead of being lost with the screenshot.
   */
  async fetchDiagnostics(): Promise<{ ok: true; value: MultiDeviceDiagnostics } | { ok: false; error: string }> {
    const client = collectClientDiagnosticsReport()
    return this.callControlPlane<MultiDeviceDiagnostics>({
      action: 'diagnostics',
      payload: client === undefined ? {} : { client: client as unknown as Record<string, unknown> },
    })
  }

  async upsertDevice(input: UpsertDeviceInput): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<{ snapshot: MultiDeviceSnapshot }>({
      action: 'upsertDevice',
      payload: input as unknown as Record<string, unknown>,
    })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot)
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }

  /**
   * Force a fresh credential for one device. An optional launch URL/token
   * replaces the stored credential; without one the host re-runs the SSH
   * bootstrap so a rotated remote signing secret recovers automatically.
   */
  async authenticateDevice(
    deviceId: DeviceId,
    credential?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<{ snapshot: MultiDeviceSnapshot }>({
      action: 'authenticateDevice',
      payload: {
        deviceId,
        ...(credential !== undefined && credential.trim() !== ''
          ? { credential: credential.trim() }
          : {}),
      },
    })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot)
      return { ok: true }
    }
    // The host records the failure in the snapshot; pick it up without waiting
    // for the 5s poll so the panel can show the real reason immediately.
    void this.refreshSnapshot()
    return { ok: false, error: res.error }
  }

  async removeDevice(deviceId: DeviceId): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<{ snapshot: MultiDeviceSnapshot }>({
      action: 'removeDevice',
      payload: { deviceId },
    })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (res.ok) {
      this.releaseKeepAliveDevice(deviceId)
      this.applyIncomingSnapshot(res.value.snapshot)
      this.setState({ error: undefined })
      return { ok: true }
    }
    this.setState({ error: res.error })
    return { ok: false, error: res.error }
  }

  async reconnectDevice(deviceId: DeviceId): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<{ snapshot: MultiDeviceSnapshot }>({
      action: 'reconnectDevice',
      payload: { deviceId },
    })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot)
      this.setState({ error: undefined })
      return { ok: true }
    }
    this.setState({ error: res.error })
    return { ok: false, error: res.error }
  }

  async testDevice(
    input: UpsertDeviceInput,
  ): Promise<{ ok: true; protocolVersion: string; remoteDshVersion?: string; latencyMs: number } | { ok: false; error: string }> {
    const res = await this.callControlPlane<{
      protocolVersion: string
      remoteDshVersion?: string
      latencyMs: number
    }>({
      action: 'testDevice',
      payload: input as unknown as Record<string, unknown>,
    })
    return res.ok ? { ok: true, ...res.value } : res
  }

  async listSshKeys(): Promise<SshKeyEntry[]> {
    const res = await this.callControlPlane<{ keys: SshKeyEntry[] }>({ action: 'listSshKeys' })
    return res.ok ? res.value.keys : []
  }

  /**
   * Report this browser's DSH workspace view state to the Host.
   *
   * The Host stamps and republishes it to every attached browser; the page that
   * reported it also receives the snapshot, so applying it must be idempotent.
   */
  async patchUiState(state: WorkspaceViewState): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<MultiDeviceSnapshot>({
      action: 'patchUiState',
      payload: { state: state as unknown as Record<string, unknown> },
    })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (res.ok) {
      this.applyIncomingSnapshot(res.value)
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }

  async setUiPreferences(patch: Partial<MultiDeviceUiPreferences>): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<MultiDeviceSnapshot>({
      action: 'setUiPreferences',
      payload: patch as Record<string, unknown>,
    })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (res.ok) {
      this.applyIncomingSnapshot(res.value)
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }
}

/**
 * Browser-only geometry for a Diagnostics report.
 *
 * `undefined` outside a browser (SSR/test), so the Host falls back to its own
 * snapshot without inventing viewport numbers.
 */
export function collectClientDiagnosticsReport(): DiagnosticsClientReport | undefined {
  if (typeof window === 'undefined') return undefined
  const bar = readNativeBarMetrics()
  const obstruction = readNativeBarObstruction()
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    ...(Number.isFinite(window.devicePixelRatio) ? { devicePixelRatio: window.devicePixelRatio } : {}),
    ...(bar !== undefined
      ? {
          barLeft: bar.barLeft,
          barWidth: bar.barWidth,
          barClampedWidth: bar.clampedWidth,
          compact: bar.compact,
        }
      : {}),
    ...(obstruction !== undefined ? { barObstruction: obstruction.detail } : {}),
    ...(typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
      ? { userAgent: navigator.userAgent }
      : {}),
  }
}

export const clientStore = new MultiDeviceClientStore()

export function useMultiDeviceState(): MultiDeviceClientState {
  return useSyncExternalStore(clientStore.subscribe, clientStore.getSnapshot, clientStore.getSnapshot)
}

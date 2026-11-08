/**
 * Client-side reactive store, SSE live synchronization, and control-plane RPC client.
 *
 * The Host owns the aggregated/native mode (it must, because it decides whether
 * remote workspaces and sessions are merged into the local DSH surface). This
 * store mirrors the host snapshot and maintains the LRU Keep-Alive set of
 * Native Mode device pages. `activeNativeDeviceId === undefined` means the
 * leftmost Native tab, 本机, which is the unmodified local DSH page.
 *
 * @module dsh-multi-device/client/state
 */
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import { useSyncExternalStore } from 'react'
import {
  decodeSessionId,
  type DeviceConnectionState,
  DeviceId,
  type DisplayMode,
  encodeRemoteSessionId,
  type ManualWorkspaceRule,
  type MultiDeviceSnapshot,
  type MultiDeviceUiPreferences,
  type RemoteSessionCreateInput,
  type RemoteWorkspaceCreateInput,
  type SshKeyEntry,
  type UpsertDeviceInput,
  type WorkspaceAggregationConfig,
} from '../contract.ts'
import type { ControlPlaneRequest, DiagnosticsClientReport, MultiDeviceDiagnostics } from '../runtime.ts'
import { readNativeBarMetrics } from './barMetrics.ts'
import { getClientServices } from './clientServices.ts'
import { readSessionLinkReport } from './sessionLinkRepair.ts'

export type HubTabId = 'native' | 'devices' | 'git'

/** Per-browser memory of the Native Mode device tab. */
const ACTIVE_NATIVE_DEVICE_KEY = 'dsh-multi-device.active-native-device'

/** Decode the owning device of a remote Session, or undefined for local/empty. */
export function remoteDeviceForSession(sessionId: string | undefined): DeviceId | undefined {
  if (sessionId === undefined || sessionId === '') return undefined
  const decoded = decodeSessionId(sessionId)
  return decoded.isRemote ? decoded.deviceId : undefined
}

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
  /** Host-authoritative mode: `'aggregated'` (merged sidebar) or `'native'` (local page + device tabs). */
  readonly displayMode: DisplayMode
  /** Selected remote device tab in Native Mode; `undefined` is the 本机 tab. */
  readonly activeNativeDeviceId?: DeviceId
  /**
   * The Session currently shown in the conversation pane. The Host uses this to
   * scope the model catalog: a remote Session must expose exactly the owning
   * device's models, never a local/remote mix.
   */
  readonly activeSessionId?: string
  /** Devices whose Native Mode `<webview>` / `<iframe>` instances are kept alive in the DOM. */
  readonly keepAliveDeviceIds: readonly DeviceId[]
  /** Reload counter per deviceId for triggering iframe/webview reload without losing other devices. */
  readonly reloadCounters: Readonly<Record<string, number>>
  /** Active tab inside the Multi-Device Hub panel (retained for API compatibility). */
  readonly activeHubTab: HubTabId
  /** Fallback settings modal open state when the host shell does not expose `sidebar.settings`. */
  readonly settingsModalOpen: boolean
  /**
   * A remote Session to reopen after the next Aggregated Mode snapshot is
   * applied. Set when leaving a Native device tab so the mode switch returns to
   * the conversation the user was actually looking at.
   */
  readonly pendingAggregatedSessionId?: string
  /**
   * Distilled Session-link repair status. `missing > 0` means at least one
   * aggregated Workspace references Sessions the browser store has no summary
   * for — the "expanded but empty" symptom. Surfaced as a banner so a stuck
   * repair is never silent.
   */
  readonly sessionLinkStatus?: SessionLinkStatus
}

/** Reactive distillation of {@link SessionLinkReport} for banner rendering. */
export interface SessionLinkStatus {
  /** Referenced ids with no summary in the Session store. */
  readonly missing: number
  /** The initial fast-retry budget is spent; retries continue at a slow pace. */
  readonly exhausted: boolean
  /** Owning device id → missing count. */
  readonly byDevice: Readonly<Record<string, number>>
  /** Last `sessions.refresh()` failure, when any. */
  readonly lastError?: string
}

const MAX_KEEP_ALIVE_PAGES = 6

/** Identify this browser instance so two tabs cannot starve each other's sequences. */
const CLIENT_INSTANCE_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `client-${String(Date.now())}-${Math.random().toString(36).slice(2)}`

const EMPTY_SNAPSHOT: MultiDeviceSnapshot = {
  revision: 0,
  displayMode: 'aggregated',
  hostStatus: {
    aggregatedGatewayActive: true,
    nativeProxyActive: true,
  },
  devices: [],
  sshConfigHosts: [],
  aggregationConfig: {
    autoGitAggregate: true,
    prefixUnmatchedWithDevice: false,
    excludedMemberKeys: [],
    preferredDeviceByLogicalId: {},
    customTitleByLogicalId: {},
    workspaceOrder: [],
    manualRules: [],
  },
  logicalWorkspaces: [],
  allPhysicalWorkspaces: [],
  sessionOrigins: {},
  unreadSessionIds: [],
  ui: { sessionRowDeviceDot: false, nativePane: true, crossHostReadState: false },
  gitMatch: {
    status: 'idle',
    totalDevices: 0,
    processedDevices: 0,
    totalProjects: 0,
    processedProjects: 0,
    createdCount: 0,
    alreadyTrackedCount: 0,
    notFoundCount: 0,
    reports: [],
  },
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
    const changed = this.observedLocalMainSessionId !== undefined && this.observedLocalMainSessionId !== sessionId
    this.observedLocalMainSessionId = sessionId
    const remoteSelected = this.state.activeSessionId !== undefined && decodeSessionId(this.state.activeSessionId).isRemote
    if (this.state.snapshot.catalog && this.state.displayMode === 'aggregated' && remoteSelected && !changed) return Promise.resolve()
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
      // The Host snapshot is authoritative. Starting in Aggregated Mode only
      // avoids showing a Native tab bar before the first snapshot arrives; the
      // local surface is already filtered by the Host if it persisted native.
      displayMode: 'aggregated',
      // Restored so a browser refresh keeps the last Native device tab once the
      // Host snapshot confirms Native Mode and the device still exists.
      activeNativeDeviceId: readStoredActiveNativeDevice(),
      keepAliveDeviceIds: [],
      reloadCounters: {},
      activeHubTab: 'devices',
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

  /**
   * Publish the Session-link repair status. Diffs against the previous value
   * so the per-change `check()` does not churn React renders.
   */
  updateSessionLinkStatus(status: SessionLinkStatus | undefined): void {
    const previous = this.state.sessionLinkStatus
    if (
      previous === status ||
      (previous !== undefined && status !== undefined &&
        previous.missing === status.missing &&
        previous.exhausted === status.exhausted &&
        previous.lastError === status.lastError &&
        JSON.stringify(previous.byDevice) === JSON.stringify(status.byDevice))
    ) {
      return
    }
    this.setState({ sessionLinkStatus: status })
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
    const selectedOwner = decodeSessionId(this.state.activeSessionId ?? '')
    if (snap.catalog && selectedOwner.isRemote && !configuredIds.has(selectedOwner.deviceId)) {
      this.hasReportedSession = false
      const observed = this.observedLocalMainSessionId
      const localSessionId = observed !== undefined && !decodeSessionId(observed).isRemote ? observed : undefined
      this.state = { ...this.state, activeSessionId: localSessionId }
      void this.setActiveSession(localSessionId)
    }
    const keepAliveEligible = new Set(
      snap.devices.filter(device => device.keepNativeAlive !== false).map(device => device.id),
    )
    const nextDisplayMode: DisplayMode = snap.displayMode ?? this.state.displayMode

    let activeNative: DeviceId | undefined
    if (nextDisplayMode === 'native') {
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
      // No "first device" fallback: 本机 is the stable default and the only
      // tab guaranteed to exist.
      storeActiveNativeDevice(activeNative)
    }

    const keepAlive = this.state.keepAliveDeviceIds
      .filter(id => keepAliveEligible.has(id))
      .slice(-MAX_KEEP_ALIVE_PAGES)
    if (
      nextDisplayMode === 'native' &&
      activeNative !== undefined &&
      keepAliveEligible.has(activeNative) &&
      !keepAlive.includes(activeNative)
    ) {
      keepAlive.push(activeNative)
      while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) keepAlive.shift()
    }
    // The aggregated pane keeps the selected remote device's frame mounted so
    // switching between remote Sessions and local Sessions never reloads it.
    const paneSession = this.state.activeSessionId
    const paneDevice = paneSession !== undefined ? decodeSessionId(paneSession) : undefined
    if (
      nextDisplayMode === 'aggregated' &&
      paneDevice?.isRemote === true &&
      keepAliveEligible.has(paneDevice.deviceId) &&
      !keepAlive.includes(paneDevice.deviceId)
    ) {
      keepAlive.push(paneDevice.deviceId)
      while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) keepAlive.shift()
    }
    if (
      nextDisplayMode === 'aggregated' &&
      (snap.ui?.nativePane === false || snap.hostStatus.nativeProxyActive === false)
    ) {
      // Do not keep a hidden pane frame alive when the feature is off.
      const index = keepAlive.indexOf(paneDevice?.deviceId as DeviceId)
      if (index !== -1) keepAlive.splice(index, 1)
    }
    if (snap.catalogSelection && snap.catalogSelection.requestSeq === this.activeSessionSeq && this.hasReportedSession) {
      this.reportedSessionId = snap.catalogSelection.sessionId
      this.state = { ...this.state, activeSessionId: snap.catalogSelection.sessionId }
    }
    this.setState({
      snapshot: snap,
      loading: false,
      error: undefined,
      displayMode: nextDisplayMode,
      activeNativeDeviceId: activeNative,
      keepAliveDeviceIds: keepAlive,
    })
    if (nextDisplayMode === 'native' && activeNative === undefined &&
      this.state.activeSessionId !== undefined && decodeSessionId(this.state.activeSessionId).isRemote) {
      this.enterLocalScope()
    }
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
    const owner = decodeSessionId(active)
    if (snap.catalog && owner.isRemote) {
      const device = snap.devices.find(candidate => candidate.id === owner.deviceId)
      if (device?.nativeNavigation?.openState !== 'open' || device.nativeNavigation.sessionId !== owner.rawSessionId) return
    }
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
   * Mount (and keep alive) one device frame for the aggregated Native Pane
   * without entering Native Mode. Idempotent; unknown/disabled devices are
   * ignored so a cached Session row cannot create a frame for a removed device.
   */
  ensureKeepAliveDevice(deviceId: DeviceId): void {
    if (this.state.snapshot.ui?.nativePane === false) return
    if (!this.state.snapshot.hostStatus.nativeProxyActive) return
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

  /**
   * Switch modes through the Host. The Host persists the mode and immediately
   * stops/starts merging remote rows into the local surface; the resulting
   * snapshot is applied here. `targetDeviceId` selects a remote tab; omitting
   * it lands on 本机.
   */
  async setDisplayMode(
    mode: DisplayMode,
    targetDeviceId?: DeviceId,
  ): Promise<{ ok: boolean; error?: string }> {
    const previousMode = this.state.displayMode
    const previousNativeId = this.state.activeNativeDeviceId
    const previousNative = previousNativeId === undefined
      ? undefined
      : this.state.snapshot.devices.find(device => device.id === previousNativeId)
    const pendingAggregated = mode === 'aggregated' &&
      previousMode === 'native' &&
      previousNativeId !== undefined &&
      previousNative?.nativePaneSessionId !== undefined
      ? encodeRemoteSessionId(previousNativeId, previousNative.nativePaneSessionId)
      : undefined
    const nativeTarget = mode === 'native'
      ? targetDeviceId ?? remoteDeviceForSession(this.state.activeSessionId)
      : undefined
    if (mode === 'aggregated') {
      // Publish this before the mode snapshot so the reconcile effect can
      // reopen the remote conversation after the aggregated catalog refreshes.
      this.setState({ pendingAggregatedSessionId: pendingAggregated })
    } else if (this.state.pendingAggregatedSessionId !== undefined) {
      // Entering Native Mode again cancels a restore that never ran.
      this.setState({ pendingAggregatedSessionId: undefined })
    }
    const res = await this.callControlPlane<{ snapshot: MultiDeviceSnapshot }>({
      action: 'setDisplayMode',
      payload: { displayMode: mode },
    })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (!res.ok) {
      if (mode === 'aggregated') this.setState({ pendingAggregatedSessionId: undefined })
      this.setState({ error: res.error })
      return { ok: false, error: res.error }
    }
    this.applyIncomingSnapshot(
      res.value.snapshot,
      mode === 'native' ? nativeTarget ?? null : null,
    )
    return { ok: true }
  }

  /** Consume the remote Session captured when leaving Native Mode. */
  takePendingAggregatedSession(): string | undefined {
    const pending = this.state.pendingAggregatedSessionId
    if (pending !== undefined) this.setState({ pendingAggregatedSessionId: undefined })
    return pending
  }

  /** Switch to a remote device tab, entering Native Mode if necessary. */
  async selectNativeDevice(deviceId: DeviceId): Promise<{ ok: boolean; error?: string }> {
    if (this.state.displayMode === 'native') {
      this.activateNativeDevice(deviceId)
      return { ok: true }
    }
    return this.setDisplayMode('native', deviceId)
  }

  /** Return to the 本机 tab while staying in Native Mode. */
  selectLocalNativeTab(): void {
    if (this.state.displayMode !== 'native') return
    this.navigationGeneration += 1
    this.enterLocalScope()
  }

  /** Clear the remote scope before restoring a real local Session, even when none exists. */
  private enterLocalScope(): void {
    const observed = this.observedLocalMainSessionId
    const localSessionId = observed !== undefined && !decodeSessionId(observed).isRemote ? observed : undefined
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
    if (this.state.displayMode === 'native' && nextActive === undefined) this.enterLocalScope()
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

  setActiveHubTab(tab: HubTabId): void {
    this.setState({ activeHubTab: tab })
  }

  setSettingsModalOpen(open: boolean): void {
    this.setState({ settingsModalOpen: open })
  }

  /**
   * Track the Session currently rendered in the conversation pane and report it
   * to the Host. The Host answers `session/modelCatalog` with exactly that
   * Session owner's catalog, so a remote conversation never mixes in local
   * models (and vice versa).
   */
  /** The local mirror remains mounted behind native tabs/global panels. */
  effectiveSessionId(): string | undefined {
    if (!this.mainViewVisible) return undefined
    if (this.state.displayMode === 'native') {
      if (this.state.activeNativeDeviceId !== undefined) return undefined
      const active = this.state.activeSessionId
      return active !== undefined && decodeSessionId(active).isRemote ? undefined : active
    }
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
    if (next !== undefined && decodeSessionId(next).isRemote) this.ensureKeepAliveDevice(decodeSessionId(next).deviceId)
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

  async retryCatalogNavigation(): Promise<void> {
    this.hasReportedSession = false
    await this.setActiveSession(this.state.activeSessionId)
  }

  /** Open navigation metadata without retaining a foreign Session in the local Controller. */
  async openCatalogSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
    const navigation = ++this.navigationGeneration
    const isCurrent = (): boolean => !this.disposed && navigation === this.navigationGeneration
    const owner = decodeSessionId(sessionId)
    if (owner.isRemote) {
      if (!this.state.snapshot.devices.some(device => device.id === owner.deviceId)) return { ok: false, error: 'The owning device was removed' }
      getClientServices().revealMain?.()
      this.setMainViewVisible(true)
      this.hasReportedSession = false
      await this.setActiveSession(sessionId)
      if (!isCurrent()) return { ok: false, error: 'stale-navigation', }
      return this.hasReportedSession && this.reportedSessionId === sessionId ? { ok: true } : { ok: false, error: 'The Host did not accept this navigation; retry or check the connection.' }
    }
    try {
      const services = getClientServices()
      if (!services.uiWorkspace || typeof services.uiWorkspace.openSession !== 'function') return { ok: false, error: 'Local DSH navigation is not ready' }
      await services.sessions?.refresh?.()
      if (!isCurrent()) return { ok: false, error: 'stale-navigation' }
      services.revealMain?.()
      this.setMainViewVisible(true)
      if (!isCurrent()) return { ok: false, error: 'stale-navigation' }
      services.uiWorkspace.openSession(sessionId)
      await this.setActiveSession(sessionId)
      return isCurrent() ? { ok: true } : { ok: false, error: 'stale-navigation' }
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
  }

  async catalogSessionAction(sessionId: string, action: import('../contract.ts').CatalogSessionAction, title?: string, stopActivity = false): Promise<{ ok: boolean; error?: string; sessionId?: string }> {
    const result = await this.callControlPlane<{ snapshot: MultiDeviceSnapshot; sessionId?: string }>({ action: 'catalogSessionAction', payload: { sessionId, operation: action, title, stopActivity } })
    if (!result.ok) return result
    this.applyIncomingSnapshot(result.value.snapshot)
    if (result.value.sessionId) await this.openCatalogSession(result.value.sessionId)
    return { ok: true, sessionId: result.value.sessionId }
  }

  async searchCatalogSessions(query: string): Promise<{ ok: boolean; error?: string; sessionIds?: readonly string[]; errors?: Readonly<Record<string, string>> }> {
    const result = await this.callControlPlane<{ sessionIds: readonly string[]; errors?: Readonly<Record<string, string>> }>({ action: 'searchCatalogSessions', payload: { query } })
    return result.ok ? { ok: true, sessionIds: result.value.sessionIds, errors: result.value.errors } : result
  }

  async startSessionOnDevice(logicalWorkspaceId: string, deviceId: DeviceId): Promise<{ ok: boolean; error?: string }> {
    return this.switchNewSessionDevice(getClientServices().uiWorkspace, logicalWorkspaceId, deviceId)
  }

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

  async createRemoteSession(
    input: RemoteSessionCreateInput,
  ): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
    const res = await this.callControlPlane<{ sessionId: string; snapshot: MultiDeviceSnapshot }>({
      action: 'createSession',
      payload: input as unknown as Record<string, unknown>,
    })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot)
      return { ok: true, sessionId: res.value.sessionId }
    }
    return { ok: false, error: res.error }
  }

  async createRemoteWorkspace(
    input: RemoteWorkspaceCreateInput,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<{ snapshot: MultiDeviceSnapshot }>({
      action: 'createRemoteWorkspace',
      payload: input as unknown as Record<string, unknown>,
    })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot)
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }

  async updateAggregationConfig(patch: Partial<WorkspaceAggregationConfig>): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<MultiDeviceSnapshot>({
      action: 'updateAggregationConfig',
      payload: patch as unknown as Record<string, unknown>,
    })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (res.ok) {
      this.applyIncomingSnapshot(res.value)
      this.setState({ error: undefined })
      return { ok: true }
    }
    this.setState({ error: res.error })
    return { ok: false, error: res.error }
  }

  async upsertManualRule(rule: ManualWorkspaceRule): Promise<void> {
    const res = await this.callControlPlane<MultiDeviceSnapshot>({
      action: 'upsertManualRule',
      payload: rule as unknown as Record<string, unknown>,
    })
    if (!this.isResponseCurrent(res)) return
    if (res.ok) this.applyIncomingSnapshot(res.value)
  }

  async removeManualRule(ruleId: string): Promise<void> {
    const res = await this.callControlPlane<MultiDeviceSnapshot>({
      action: 'removeManualRule',
      payload: { ruleId },
    })
    if (!this.isResponseCurrent(res)) return
    if (res.ok) this.applyIncomingSnapshot(res.value)
  }

  async setMemberExcluded(memberKey: string, excluded: boolean): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<MultiDeviceSnapshot>({
      action: 'setMemberExcluded',
      payload: { memberKey, excluded },
    })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (res.ok) {
      this.applyIncomingSnapshot(res.value)
      this.setState({ error: undefined })
      return { ok: true }
    }
    this.setState({ error: res.error })
    return { ok: false, error: res.error }
  }

  async startGitMatch(): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<{ snapshot: MultiDeviceSnapshot }>({ action: 'startGitMatch' })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot)
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }

  async cancelGitMatch(): Promise<boolean> {
    const res = await this.callControlPlane<{ cancelled: boolean }>({ action: 'cancelGitMatch' })
    return res.ok ? res.value.cancelled : false
  }

  /** Persist a display preference; the Host echoes the full snapshot back. */
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

  async setPreferredDevice(
    logicalWorkspaceId: string,
    deviceId: DeviceId,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<MultiDeviceSnapshot>({
      action: 'setPreferredDevice',
      payload: { logicalWorkspaceId, deviceId },
    })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (res.ok) {
      this.applyIncomingSnapshot(res.value)
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }

  /**
   * Point a logical workspace at another device and open the New Session there.
   *
   * The Host registers the workspace path on a device that does not own it yet
   * (nothing is copied) and creates that Session itself. A device that already
   * owns the workspace only stores the preference; DSH's `startSession` then
   * creates through the aggregated gateway. The previous device keeps its blank
   * session, so an unsent draft is never copied or destroyed here.
   */
  async switchNewSessionDevice(
    uiWorkspace: { startSession?: (workspaceId?: string) => void; openSession?: (sessionId: string) => void } | undefined,
    logicalWorkspaceId: string,
    deviceId: DeviceId,
  ): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<{
      mode: 'member' | 'registered'
      sessionId?: string
      snapshot: MultiDeviceSnapshot
    }>({
      action: 'startSessionOnDevice',
      payload: { logicalWorkspaceId, deviceId },
    })
    if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
    if (!res.ok) return { ok: false, error: res.error }
    this.applyIncomingSnapshot(res.value.snapshot)
    if (res.value.mode === 'registered' && res.value.sessionId !== undefined) {
      if (this.state.snapshot.catalog) return this.openCatalogSession(res.value.sessionId)
      try {
        await getClientServices().sessions?.refresh?.()
      } catch {
        // The Host already replayed the new summary; opening still works when
        // the list already contains it.
      }
      try {
        if (!this.isResponseCurrent(res)) return { ok: false, error: 'stale-response' }
        uiWorkspace?.openSession?.(res.value.sessionId)
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'openSession-failed' }
      }
      return { ok: true }
    }
    if (typeof uiWorkspace?.startSession !== 'function') {
      return { ok: false, error: 'startSession-unavailable' }
    }
    uiWorkspace.startSession(logicalWorkspaceId)
    return { ok: true }
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
  // The repair loop runs in the browser and owns the only view of the Session
  // store, so it contributes the evidence the Host cannot see.
  const sessionLink = readSessionLinkReport()
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
    ...(typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
      ? { userAgent: navigator.userAgent }
      : {}),
    ...(sessionLink !== undefined
      ? {
          sessionLink: {
            referenced: sessionLink.referenced,
            missing: sessionLink.missing,
            byDevice: sessionLink.byDevice,
            sample: sessionLink.sample,
            connectedDevices: sessionLink.connectedDevices,
            attempts: sessionLink.attempts,
            resolved: sessionLink.resolved,
            ...(sessionLink.refreshedAt !== undefined ? { refreshedAt: sessionLink.refreshedAt } : {}),
            ...(sessionLink.lastError !== undefined ? { lastError: sessionLink.lastError } : {}),
          },
        }
      : {}),
  }
}

export const clientStore = new MultiDeviceClientStore()

export function useMultiDeviceState(): MultiDeviceClientState {
  return useSyncExternalStore(clientStore.subscribe, clientStore.getSnapshot, clientStore.getSnapshot)
}

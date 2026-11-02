/**
 * Client-side reactive store, SSE live synchronization, and control-plane RPC client.
 *
 * Persists UI mode (`aggregated` vs `native`) and active device selection in `localStorage`,
 * and maintains the LRU Keep-Alive set of Native Mode device pages so switching between
 * Aggregated Mode and Native Mode never destroys loaded remote DSH pages.
 *
 * @module dsh-multi-device/client/state
 */
import { useSyncExternalStore } from 'react'
import {
  type DeviceId,
  type DisplayMode,
  type ManualWorkspaceRule,
  type MultiDeviceSnapshot,
  type RemoteSessionCreateInput,
  type RemoteWorkspaceCreateInput,
  type SshKeyEntry,
  type UpsertDeviceInput,
  type WorkspaceAggregationConfig,
} from '../contract.ts'
import type { ControlPlaneRequest } from '../runtime.ts'

export type HubTabId = 'native' | 'devices' | 'git'

export interface MultiDeviceClientState {
  readonly snapshot: MultiDeviceSnapshot
  readonly loading: boolean
  readonly error?: string
  /** Current global mode: `'aggregated'` (unified sidebar) or `'native'` (full-window remote DSH Web UI). */
  readonly displayMode: DisplayMode
  /** Currently selected device in Native Mode. */
  readonly activeNativeDeviceId?: DeviceId
  /** Devices whose Native Mode `<webview>` / `<iframe>` instances are kept alive in the DOM. */
  readonly keepAliveDeviceIds: readonly DeviceId[]
  /** Reload counter per deviceId for triggering iframe/webview reload without losing other devices. */
  readonly reloadCounters: Readonly<Record<string, number>>
  /** Active tab inside the Multi-Device Hub panel. */
  readonly activeHubTab: HubTabId
  /** Whether the floating mode-switcher pill in `shell.overlay` is minimized. */
  readonly overlayCollapsed: boolean
}

const UI_STORAGE_KEY = 'dsh.multi-device.ui.v1'
const MAX_KEEP_ALIVE_PAGES = 6

const EMPTY_SNAPSHOT: MultiDeviceSnapshot = {
  revision: 0,
  hostStatus: {
    aggregatedGatewayActive: true,
    nativeProxyActive: true,
  },
  devices: [],
  sshConfigHosts: [],
  aggregationConfig: {
    autoGitAggregate: true,
    prefixUnmatchedWithDevice: true,
    excludedMemberKeys: [],
    preferredDeviceByLogicalId: {},
    customTitleByLogicalId: {},
    workspaceOrder: [],
    manualRules: [],
  },
  logicalWorkspaces: [],
  allPhysicalWorkspaces: [],
  sessionOrigins: {},
}

function loadPersistedUiPrefs(): {
  displayMode: DisplayMode
  activeNativeDeviceId?: DeviceId
  overlayCollapsed: boolean
} {
  if (typeof localStorage === 'undefined') {
    return { displayMode: 'aggregated', overlayCollapsed: false }
  }
  try {
    const raw = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? '{}') as {
      displayMode?: string
      activeNativeDeviceId?: string
      overlayCollapsed?: boolean
    }
    return {
      displayMode: raw.displayMode === 'native' ? 'native' : 'aggregated',
      ...(typeof raw.activeNativeDeviceId === 'string' && raw.activeNativeDeviceId !== ''
        ? { activeNativeDeviceId: raw.activeNativeDeviceId as DeviceId }
        : {}),
      overlayCollapsed: raw.overlayCollapsed === true,
    }
  } catch {
    return { displayMode: 'aggregated', overlayCollapsed: false }
  }
}

function savePersistedUiPrefs(state: MultiDeviceClientState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({
        displayMode: state.displayMode,
        activeNativeDeviceId: state.activeNativeDeviceId,
        overlayCollapsed: state.overlayCollapsed,
      }),
    )
  } catch {
    // Ignore storage quota errors
  }
}

class MultiDeviceClientStore {
  private state: MultiDeviceClientState
  private readonly listeners = new Set<() => void>()
  private eventSource: EventSource | undefined
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private sseRetryTimer: ReturnType<typeof setTimeout> | undefined
  private sseAttempt = 0
  private started = false

  constructor() {
    const prefs = loadPersistedUiPrefs()
    this.state = {
      snapshot: EMPTY_SNAPSHOT,
      loading: true,
      displayMode: prefs.displayMode,
      ...(prefs.activeNativeDeviceId !== undefined
        ? { activeNativeDeviceId: prefs.activeNativeDeviceId }
        : {}),
      keepAliveDeviceIds: prefs.activeNativeDeviceId ? [prefs.activeNativeDeviceId] : [],
      reloadCounters: {},
      activeHubTab: 'devices',
      overlayCollapsed: prefs.overlayCollapsed,
    }
  }

  getSnapshot = (): MultiDeviceClientState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setState(patch: Partial<MultiDeviceClientState>, persistPrefs = false): void {
    this.state = { ...this.state, ...patch }
    if (persistPrefs) savePersistedUiPrefs(this.state)
    for (const listener of this.listeners) {
      try { listener() } catch { /* ignore */ }
    }
  }

  start(): () => void {
    if (this.started) return () => {}
    this.started = true
    void this.refreshSnapshot()
    this.connectSse()
    this.pollTimer = setInterval(() => {
      void this.refreshSnapshot()
    }, 5_000)

    return () => {
      this.started = false
      if (this.pollTimer !== undefined) {
        clearInterval(this.pollTimer)
        this.pollTimer = undefined
      }
      this.eventSource?.close()
      this.eventSource = undefined
      if (this.sseRetryTimer !== undefined) {
        clearTimeout(this.sseRetryTimer)
        this.sseRetryTimer = undefined
      }
    }
  }

  private connectSse(): void {
    if (typeof EventSource === 'undefined' || !this.started) return
    this.eventSource?.close()
    try {
      const es = new EventSource('/multi-device/events')
      this.eventSource = es
      es.addEventListener('snapshot', (ev) => {
        this.sseAttempt = 0
        try {
          const snap = JSON.parse((ev as MessageEvent<string>).data) as MultiDeviceSnapshot
          this.applyIncomingSnapshot(snap)
        } catch {
          // Ignore malformed event
        }
      })
      es.onerror = () => {
        es.close()
        if (this.eventSource === es) this.eventSource = undefined
        if (!this.started || this.sseRetryTimer !== undefined) return
        const delay = Math.min(15_000, 500 * 2 ** this.sseAttempt)
        this.sseAttempt = Math.min(this.sseAttempt + 1, 6)
        this.sseRetryTimer = setTimeout(() => {
          this.sseRetryTimer = undefined
          this.connectSse()
        }, delay)
      }
    } catch {
      // Fallback to polling
    }
  }

  private applyIncomingSnapshot(snap: MultiDeviceSnapshot): void {
    if (snap.revision < this.state.snapshot.revision) return
    const alive = new Set(
      snap.devices.filter(device => device.keepNativeAlive !== false).map(device => device.id),
    )
    let activeNative = this.state.activeNativeDeviceId
    if (activeNative === undefined || !alive.has(activeNative)) {
      activeNative = snap.devices.find(device => alive.has(device.id))?.id
    }
    const keepAlive = this.state.keepAliveDeviceIds.filter(id => alive.has(id)).slice(-MAX_KEEP_ALIVE_PAGES)
    if (
      this.state.displayMode === 'native' &&
      activeNative !== undefined &&
      !keepAlive.includes(activeNative)
    ) {
      keepAlive.push(activeNative)
      while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) keepAlive.shift()
    }
    this.setState({
      snapshot: snap,
      loading: false,
      error: undefined,
      ...(activeNative !== undefined ? { activeNativeDeviceId: activeNative } : {}),
      keepAliveDeviceIds: keepAlive,
    })
  }

  // ==========================================================================
  // UI Navigation & Keep-Alive Actions
  // ==========================================================================

  setDisplayMode(mode: DisplayMode, targetDeviceId?: DeviceId): void {
    const nextDeviceId =
      targetDeviceId ??
      this.state.activeNativeDeviceId ??
      this.state.snapshot.devices[0]?.id

    const alive = new Set(
      this.state.snapshot.devices.filter(device => device.keepNativeAlive !== false).map(device => device.id),
    )
    const keepAlive = this.state.keepAliveDeviceIds.filter(id => alive.has(id))
    if (mode === 'native' && nextDeviceId !== undefined && alive.has(nextDeviceId)) {
      const existingIdx = keepAlive.indexOf(nextDeviceId)
      if (existingIdx !== -1) keepAlive.splice(existingIdx, 1)
      keepAlive.push(nextDeviceId)
      while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) {
        keepAlive.shift()
      }
    }

    this.setState(
      {
        displayMode: mode,
        ...(nextDeviceId !== undefined ? { activeNativeDeviceId: nextDeviceId } : {}),
        keepAliveDeviceIds: keepAlive,
      },
      true,
    )
  }

  toggleDisplayMode(): void {
    this.setDisplayMode(this.state.displayMode === 'native' ? 'aggregated' : 'native')
  }

  selectNativeDevice(deviceId: DeviceId): void {
    this.setDisplayMode('native', deviceId)
  }

  releaseKeepAliveDevice(deviceId: DeviceId): void {
    const nextKeepAlive = this.state.keepAliveDeviceIds.filter(id => id !== deviceId)
    const nextActive =
      this.state.activeNativeDeviceId === deviceId
        ? nextKeepAlive[nextKeepAlive.length - 1] ?? this.state.snapshot.devices.find(d => d.id !== deviceId)?.id
        : this.state.activeNativeDeviceId
    this.setState(
      {
        keepAliveDeviceIds: nextKeepAlive,
        activeNativeDeviceId: nextActive,
        ...(nextKeepAlive.length === 0 ? { displayMode: 'aggregated' } : {}),
      },
      true,
    )
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

  setOverlayCollapsed(collapsed: boolean): void {
    this.setState({ overlayCollapsed: collapsed }, true)
  }

  // ==========================================================================
  // Control-Plane RPC Calls
  // ==========================================================================

  async callControlPlane<T = unknown>(
    request: ControlPlaneRequest,
  ): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
    try {
      const response = await fetch('/multi-device/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      })
      const data = (await response.json()) as { ok: true; value: T } | { ok: false; error: string }
      return data
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async refreshSnapshot(): Promise<void> {
    const res = await this.callControlPlane<MultiDeviceSnapshot>({ action: 'snapshot' })
    if (res.ok) {
      this.applyIncomingSnapshot(res.value)
    } else {
      this.setState({ loading: false, error: res.error })
    }
  }

  async upsertDevice(input: UpsertDeviceInput): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<{ snapshot: MultiDeviceSnapshot }>({
      action: 'upsertDevice',
      payload: input as unknown as Record<string, unknown>,
    })
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot)
      return { ok: true }
    }
    return { ok: false, error: res.error }
  }

  async removeDevice(deviceId: DeviceId): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<{ snapshot: MultiDeviceSnapshot }>({
      action: 'removeDevice',
      payload: { deviceId },
    })
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
    if (res.ok) this.applyIncomingSnapshot(res.value)
  }

  async removeManualRule(ruleId: string): Promise<void> {
    const res = await this.callControlPlane<MultiDeviceSnapshot>({
      action: 'removeManualRule',
      payload: { ruleId },
    })
    if (res.ok) this.applyIncomingSnapshot(res.value)
  }

  async setMemberExcluded(memberKey: string, excluded: boolean): Promise<{ ok: boolean; error?: string }> {
    const res = await this.callControlPlane<MultiDeviceSnapshot>({
      action: 'setMemberExcluded',
      payload: { memberKey, excluded },
    })
    if (res.ok) {
      this.applyIncomingSnapshot(res.value)
      this.setState({ error: undefined })
      return { ok: true }
    }
    this.setState({ error: res.error })
    return { ok: false, error: res.error }
  }

  async setPreferredDevice(logicalWorkspaceId: string, deviceId: DeviceId): Promise<void> {
    const res = await this.callControlPlane<MultiDeviceSnapshot>({
      action: 'setPreferredDevice',
      payload: { logicalWorkspaceId, deviceId },
    })
    if (res.ok) this.applyIncomingSnapshot(res.value)
  }
}

export const clientStore = new MultiDeviceClientStore()

export function useMultiDeviceState(): MultiDeviceClientState {
  return useSyncExternalStore(clientStore.subscribe, clientStore.getSnapshot, clientStore.getSnapshot)
}

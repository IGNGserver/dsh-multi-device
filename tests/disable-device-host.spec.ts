/**
 * Host, Control-Plane, Client-Store, and Taskbar/Title tests for disabling devices.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DeviceId,
  encodeRemoteSessionId,
  type DeviceView,
  type MultiDeviceSnapshot,
  type RemoteDeviceCatalog,
} from '../src/contract.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import { RemoteDeviceClient } from '../src/host/remote-client.ts'
import { MultiDeviceControlPlane, parseControlPlaneRequest } from '../src/runtime.ts'
import { MultiDeviceClientStore } from '../src/client/state.ts'
import { tallyTaskbarSessions } from '../src/client/taskbarSummary.ts'
import { resolveWindowTitle } from '../src/client/windowTitle.ts'

const cleanups: Array<() => void> = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function makeRegistry(initialState?: Record<string, unknown>, initialSecrets?: Record<string, unknown>): {
  dir: string
  dataFile: string
  secretsFile: string
  registry: DeviceRegistry
} {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-md-disable-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  const dataFile = join(dir, 'devices.json')
  const secretsFile = join(dir, 'secrets.json')
  if (initialState !== undefined) {
    writeFileSync(dataFile, JSON.stringify(initialState))
  }
  if (initialSecrets !== undefined) {
    writeFileSync(secretsFile, JSON.stringify(initialSecrets))
  }
  const registry = new DeviceRegistry(
    dataFile,
    secretsFile,
    { localPort: () => 3080 },
    { enableTunnels: false, allowDirectTransport: true },
  )
  cleanups.push(() => registry.dispose())
  return { dir, dataFile, secretsFile, registry }
}

const sampleCatalog: RemoteDeviceCatalog = {
  deviceId: DeviceId('dev-a'),
  syncedAt: 500,
  protocolVersion: '0.2',
  sessions: [
    {
      sessionId: 's1',
      updatedAt: 500,
      agentAvailable: true,
      running: true,
      blank: false,
      projections: { values: { title: 'Remote Task' } },
    },
    {
      sessionId: 's-arch',
      updatedAt: 400,
      agentAvailable: true,
      running: false,
      blank: false,
    },
    {
      sessionId: 's-sub',
      updatedAt: 450,
      agentAvailable: true,
      running: false,
      blank: false,
      origin: 'subagent',
    },
  ],
  workspaces: [{ path: '/srv/repo', name: 'repo' }],
  archivedSessionIds: ['s-arch'],
  pinnedSessionIds: [],
}

describe('Host & Control Plane disable-device lifecycle', () => {
  it('validates and parses setDeviceEnabled control-plane requests', () => {
    expect(parseControlPlaneRequest({
      action: 'setDeviceEnabled',
      payload: { deviceId: 'dev-a', enabled: false },
    })).toEqual({
      action: 'setDeviceEnabled',
      payload: { deviceId: 'dev-a', enabled: false },
    })

    expect(() => parseControlPlaneRequest({
      action: 'setDeviceEnabled',
      payload: { deviceId: 'dev-a', enabled: 'false' },
    })).toThrow(/boolean/i)
  })

  it('does not start connections or native proxies when startAll() mounts a disabled device', () => {
    const startSpy = vi.spyOn(RemoteDeviceClient.prototype, 'start').mockImplementation(() => {})
    const { registry } = makeRegistry({
      version: 1,
      devices: [
        {
          id: 'dev-disabled',
          name: 'Disabled Node',
          enabled: false,
          transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:3999' },
          auth: { mode: 'none' },
        },
      ],
    })
    const ensureProxySpy = vi.spyOn(registry.nativeProxyManager, 'ensureProxy')

    registry.startAll()

    const client = registry.client(DeviceId('dev-disabled'))
    expect(client).toBeDefined()
    expect(client!.connectionState).toBe('disabled')
    expect(client!.effectiveBaseUrl()).toBeUndefined()
    expect(startSpy).not.toHaveBeenCalled()
    expect(ensureProxySpy).not.toHaveBeenCalled()
  })

  it('stops proxy & connection cleanly on disable, hides runtime attention/unread, preserves disk state, and restores on enable', async () => {
    const startSpy = vi.spyOn(RemoteDeviceClient.prototype, 'start').mockImplementation(() => {})
    const stopSpy = vi.spyOn(RemoteDeviceClient.prototype, 'stop')
    const remoteUnreadId = encodeRemoteSessionId(DeviceId('dev-a'), 's-done')
    const { dir, dataFile, secretsFile, registry } = makeRegistry(
      {
        version: 1,
        devices: [
          {
            id: 'dev-a',
            name: 'Node A',
            enabled: true,
            transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:3999' },
            auth: { mode: 'token' },
          },
        ],
        readState: {
          entries: {
            [remoteUnreadId]: { unread: true, at: 200 },
          },
        },
      },
      {
        version: 1,
        credentials: {
          'dev-a': { credential: 'secret-token-value' },
        },
      },
    )

    const removeProxySpy = vi.spyOn(registry.nativeProxyManager, 'removeProxy')
    const ensureProxySpy = vi.spyOn(registry.nativeProxyManager, 'ensureProxy')
      .mockResolvedValue('http://127.0.0.1:41234')

    registry.setDeviceCatalog(sampleCatalog)
    registry.saveToDisk()
    registry.startAll()
    await vi.waitFor(() => expect(registry.client(DeviceId('dev-a'))?.toView().nativeProxyUrl).toBe('http://127.0.0.1:41234'))

    // Simulate active navigation into the remote device before disabling it.
    registry.setActiveSession(encodeRemoteSessionId(DeviceId('dev-a'), 's1'), 1, 'tab-1')

    const enabledSnap = registry.snapshot('tab-1')
    expect(enabledSnap.devices[0]?.enabled).toBe(true)
    expect(enabledSnap.attentionByDevice?.['dev-a']).toBeDefined()
    expect(enabledSnap.unreadSessionIds).toContain(remoteUnreadId)
    expect(enabledSnap.archivedSessionIds).toContain(encodeRemoteSessionId(DeviceId('dev-a'), 's-arch'))
    expect(enabledSnap.subagentSessionIds).toContain(encodeRemoteSessionId(DeviceId('dev-a'), 's-sub'))

    const plane = new MultiDeviceControlPlane(registry, () => true)
    const disableRes = await plane.dispatch({
      action: 'setDeviceEnabled',
      payload: { deviceId: 'dev-a', enabled: false, clientId: 'tab-1' },
    })
    expect(disableRes.ok).toBe(true)
    expect(stopSpy).toHaveBeenCalled()
    expect(removeProxySpy).toHaveBeenCalledWith(DeviceId('dev-a'))

    const clientAfterDisable = registry.client(DeviceId('dev-a'))!
    expect(clientAfterDisable.connectionState).toBe('disabled')
    expect(clientAfterDisable.effectiveBaseUrl()).toBeUndefined()
    expect(clientAfterDisable.toView().nativeProxyUrl).toBeUndefined()
    expect(clientAfterDisable.toView().lastError).toBeUndefined()

    const disabledSnap = registry.snapshot('tab-1')
    expect(disabledSnap.devices).toHaveLength(1)
    expect(disabledSnap.devices[0]?.enabled).toBe(false)
    expect(disabledSnap.devices[0]?.state).toBe('disabled')
    expect(disabledSnap.devices[0]?.runningSessionCount).toBe(0)
    expect(disabledSnap.devices[0]?.pendingApprovalCount).toBe(0)
    expect(disabledSnap.devices[0]?.allRunningSessionCount).toBe(0)
    expect(disabledSnap.attentionByDevice?.['dev-a']).toBeUndefined()
    expect(disabledSnap.unreadSessionIds).not.toContain(remoteUnreadId)
    expect(disabledSnap.archivedSessionIds).not.toContain(encodeRemoteSessionId(DeviceId('dev-a'), 's-arch'))
    expect(disabledSnap.subagentSessionIds).not.toContain(encodeRemoteSessionId(DeviceId('dev-a'), 's-sub'))

    // Reconnect and authenticate must reject disabled devices.
    expect(registry.reconnectDevice(DeviceId('dev-a'))).toBe(false)
    const reconnectRpc = await plane.dispatch({
      action: 'reconnectDevice',
      payload: { deviceId: 'dev-a' },
    })
    expect(reconnectRpc).toEqual({ ok: false, error: 'Device is disabled' })
    const authRes = await registry.authenticateDevice(DeviceId('dev-a'))
    expect(authRes).toEqual({ ok: false, error: 'Device is disabled' })

    // Config, credentials, catalog cache, and readState remain preserved on disk.
    await registry.flushPersistence()
    const persistedDevices = JSON.parse(readFileSync(dataFile, 'utf8')) as {
      devices: Array<{ id: string; enabled: boolean }>
      readState?: { entries?: Record<string, { unread?: boolean }> }
    }
    expect(persistedDevices.devices[0]?.enabled).toBe(false)
    expect(persistedDevices.readState?.entries?.[remoteUnreadId]?.unread).toBe(true)

    const persistedSecrets = JSON.parse(readFileSync(secretsFile, 'utf8')) as {
      credentials?: Record<string, { credential?: string }>
    }
    expect(persistedSecrets.credentials?.['dev-a']?.credential).toBe('secret-token-value')
    expect(readFileSync(join(dir, 'catalogs.json'), 'utf8')).toContain('"s1"')

    // Re-enable restores proxy, start(), attention, and unread markers.
    const startCallsBefore = startSpy.mock.calls.length
    const enableRes = await plane.dispatch({
      action: 'setDeviceEnabled',
      payload: { deviceId: 'dev-a', enabled: true, clientId: 'tab-1' },
    })
    expect(enableRes.ok).toBe(true)
    expect(ensureProxySpy).toHaveBeenCalledTimes(2)
    expect(startSpy.mock.calls.length).toBeGreaterThan(startCallsBefore)

    const reEnabledSnap = registry.snapshot('tab-1')
    expect(reEnabledSnap.devices[0]?.enabled).toBe(true)
    expect(reEnabledSnap.attentionByDevice?.['dev-a']).toBeDefined()
    expect(reEnabledSnap.unreadSessionIds).toContain(remoteUnreadId)
    expect(reEnabledSnap.devices[0]?.nativeProxyUrl).toBe('http://127.0.0.1:41234')
  })
})

describe('MultiDeviceClientStore disable-device transitions', () => {
  function makeDevice(over: Partial<DeviceView> = {}): DeviceView {
    return {
      id: DeviceId('dev-a'),
      name: 'Node A',
      enabled: true,
      state: 'connected',
      transportKind: 'ssh',
      targetSummary: 'ssh://node-a',
      keepNativeAlive: true,
      protocolVersion: '0.2',
      realtime: true,
      reconnectAttempt: 0,
      sessionCount: 0,
      runningSessionCount: 0,
      pendingApprovalCount: 0,
      workspaceCount: 0,
      ...over,
    } as DeviceView
  }

  it('falls back to 本机 and evicts keepAlive when the active device is disabled', async () => {
    const fetchCalls: Array<{ action: string; payload?: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as { action: string; payload?: Record<string, unknown> }
      fetchCalls.push(parsed)
      return new Response(JSON.stringify({ ok: true, value: { accepted: true } }), { status: 200 })
    }))

    const store = new MultiDeviceClientStore()
    cleanups.push(() => store.dispose())
    await store.reportLocalMainSession('local-session-1')

    const enabledSnap: MultiDeviceSnapshot = {
      revision: 1,
      hostEpoch: 'epoch-1',
      devices: [makeDevice({ enabled: true })],
      sshConfigHosts: [],
      unreadSessionIds: [],
    }
    store.applyIncomingSnapshot(enabledSnap)
    const selectEnabled = await store.selectNativeDevice(DeviceId('dev-a'))
    expect(selectEnabled.ok).toBe(true)
    expect(store.getSnapshot().activeNativeDeviceId).toBe(DeviceId('dev-a'))
    expect(store.getSnapshot().keepAliveDeviceIds).toContain(DeviceId('dev-a'))

    const disabledSnap: MultiDeviceSnapshot = {
      revision: 2,
      hostEpoch: 'epoch-1',
      devices: [makeDevice({ enabled: false, state: 'disabled' })],
      sshConfigHosts: [],
      unreadSessionIds: [],
    }
    store.applyIncomingSnapshot(disabledSnap)

    expect(store.getSnapshot().activeNativeDeviceId).toBeUndefined()
    expect(store.getSnapshot().keepAliveDeviceIds).not.toContain(DeviceId('dev-a'))
    expect(store.getSnapshot().activeSessionId).toBe('local-session-1')

    const selectDisabled = await store.selectNativeDevice(DeviceId('dev-a'))
    expect(selectDisabled.ok).toBe(false)
    store.ensureKeepAliveDevice(DeviceId('dev-a'))
    expect(store.getSnapshot().keepAliveDeviceIds).toEqual([])
    expect(fetchCalls.some(c => c.action === 'setActiveSession' && c.payload?.sessionId === 'local-session-1')).toBe(true)
  })
})

describe('Taskbar summary & window title exclusion for disabled devices', () => {
  it('excludes disabled devices in both attentionByDevice and fallback modes, and ignores disabled window title', () => {
    const devA = {
      id: DeviceId('dev-a'),
      name: 'Node A',
      enabled: false,
      state: 'disabled',
      transportKind: 'ssh',
      targetSummary: 'ssh://node-a',
      keepNativeAlive: true,
      protocolVersion: '0.2',
      realtime: false,
      reconnectAttempt: 0,
      sessionCount: 2,
      runningSessionCount: 3,
      pendingApprovalCount: 2,
      workspaceCount: 1,
    } as DeviceView
    const devB = {
      ...devA,
      id: DeviceId('dev-b'),
      name: 'Node B',
      enabled: true,
      state: 'connected',
      runningSessionCount: 1,
      pendingApprovalCount: 1,
      nativePaneTitle: 'B Remote Title',
    } as DeviceView

    const unreadDisabled = encodeRemoteSessionId(DeviceId('dev-a'), 's1')
    const unreadEnabled = encodeRemoteSessionId(DeviceId('dev-b'), 's2')

    expect(tallyTaskbarSessions({
      devices: [devA, devB],
      unreadSessionIds: [unreadDisabled, unreadEnabled],
    })).toEqual({ running: 1, pending: 1, unread: 1 })

    expect(tallyTaskbarSessions({
      devices: [devA, devB],
      attentionByDevice: {
        'dev-a': {
          eligibleSessionIds: ['s1'],
          runningSessionIds: [encodeRemoteSessionId(DeviceId('dev-a'), 'r1')],
          pendingSessionIds: [],
          unreadSessionIds: [unreadDisabled],
          pendingRequestCount: 0,
          fresh: true,
        },
        'dev-b': {
          eligibleSessionIds: ['s2'],
          runningSessionIds: [encodeRemoteSessionId(DeviceId('dev-b'), 'r2')],
          pendingSessionIds: [],
          unreadSessionIds: [],
          pendingRequestCount: 0,
          fresh: true,
        },
      },
      unreadSessionIds: [],
    })).toEqual({ running: 1, pending: 0, unread: 0 })

    expect(resolveWindowTitle({
      activeNativeDeviceId: DeviceId('dev-a'),
      devices: [devA, devB],
    })).toBeUndefined()

    expect(resolveWindowTitle({
      activeNativeDeviceId: DeviceId('dev-b'),
      devices: [devA, devB],
    })).toBe('B Remote Title')
  })
})

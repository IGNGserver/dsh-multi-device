import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceId, encodeRemoteSessionId, type DeviceView, type MultiDeviceSnapshot } from '../src/contract.ts'
import { bindClientServices } from '../src/client/clientServices.ts'
import { MultiDeviceClientStore } from '../src/client/state.ts'
import { DeviceRegistry } from '../src/host/registry.ts'

const deviceId = DeviceId('catalog-remote')
const remoteId = encodeRemoteSessionId(deviceId, 'remote-session')
const disposers: (() => void)[] = []
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Exercise the public client store over its real JSON control-plane boundary. */
async function clientHarness() {
  const store = new MultiDeviceClientStore()
  let directory: MultiDeviceSnapshot = {
    ...store.getSnapshot().snapshot,
    revision: 1, displayMode: 'aggregated',
    catalog: { schema: 1, revision: 1, pinnedSessionIds: [], issues: {}, sessions: {
      [remoteId]: { id: remoteId, rawSessionId: 'remote-session', deviceId, title: 'Remote', updatedAt: 1,
        running: false, blank: false, stale: false },
    } },
    devices: [{ id: deviceId, name: 'Remote host', state: 'connected', enabled: true,
      keepNativeAlive: true, nativePaneSessionId: 'remote-session' } as DeviceView],
  }
  const requests: { action: string; payload: Record<string, any> }[] = []
  let failSelection = false
  const fetch = vi.fn(async (_url: unknown, init: any) => {
    const request = JSON.parse(init.body)
    requests.push(request)
    let value: unknown
    if (request.action === 'snapshot') value = directory
    else if (request.action === 'setDisplayMode') {
      // Mode acknowledgements may legitimately carry the same directory revision.
      directory = { ...directory, displayMode: request.payload.displayMode }
      value = { snapshot: directory }
    } else if (request.action === 'removeDevice') {
      directory = { ...directory, revision: directory.revision + 1, devices: [],
        catalog: { ...directory.catalog!, revision: directory.catalog!.revision + 1, sessions: {} } }
      value = { snapshot: directory }
    } else if (request.action === 'setActiveSession' && failSelection) {
      failSelection = false
      return { json: async () => ({ ok: false, error: 'transport refused selection' }) }
    } else value = { accepted: true }
    return { json: async () => ({ ok: true, value }) }
  })
  vi.stubGlobal('fetch', fetch)
  await store.refreshSnapshot()
  await flush()
  const selections = () => requests.filter(request => request.action === 'setActiveSession')
  return { store, fetch, requests, selections,
    failNextSelection: () => { failSelection = true },
    publish: async (patch: Partial<MultiDeviceSnapshot>) => {
      directory = { ...directory, ...patch, revision: directory.revision + 1 }
      await store.refreshSnapshot(); await flush()
    },
  }
}

describe('independent catalog navigation and the mounted local main session', () => {
  it('ignores unchanged background local reports, but accepts new local navigation and a later return', async () => {
    const h = await clientHarness()
    await h.store.reportLocalMainSession('local-a')
    await h.store.openCatalogSession(remoteId)
    const before = h.selections().length
    await h.store.reportLocalMainSession('local-a')
    expect(h.store.getSnapshot().activeSessionId).toBe(remoteId)
    expect(h.selections()).toHaveLength(before)
    await h.store.reportLocalMainSession('local-b')
    expect(h.store.getSnapshot().activeSessionId).toBe('local-b')
    expect(h.selections().at(-1)?.payload.sessionId).toBe('local-b')
    await h.store.openCatalogSession(remoteId)
    await h.store.reportLocalMainSession('local-a')
    expect(h.store.getSnapshot().activeSessionId).toBe('local-a')
  })

  it('does not let the first background-main mount override a remote click', async () => {
    const h = await clientHarness()
    await h.store.openCatalogSession(remoteId)
    const count = h.selections().length
    await h.store.reportLocalMainSession('already-mounted-local')
    expect(h.store.getSnapshot().activeSessionId).toBe(remoteId)
    expect(h.selections()).toHaveLength(count)
    await h.store.reportLocalMainSession('new-local-navigation')
    expect(h.store.getSnapshot().activeSessionId).toBe('new-local-navigation')
  })

  it('retries the same remote click with a new sequence without opening or refreshing local mirrors', async () => {
    const h = await clientHarness()
    const reveal = vi.fn()
    const localOpen = vi.fn()
    const refresh = vi.fn(async () => {})
    disposers.push(bindClientServices({ revealMain: reveal, uiWorkspace: { openSession: localOpen },
      sessions: { list: { getSnapshot: () => ({ ids: [], byId: {} }) }, refresh } }))
    h.store.setMainViewVisible(false)
    h.failNextSelection()
    expect(await h.store.openCatalogSession(remoteId)).toMatchObject({ ok: false, error: expect.stringContaining('did not accept') })
    expect(await h.store.openCatalogSession(remoteId)).toEqual({ ok: true })
    const selected = h.selections().filter(request => request.payload.sessionId === remoteId)
    expect(selected).toHaveLength(2)
    expect(selected[1]!.payload.requestSeq).toBeGreaterThan(selected[0]!.payload.requestSeq)
    expect(selected.every(request => request.payload.clientId === h.store.clientId)).toBe(true)
    expect(reveal).toHaveBeenCalledTimes(2)
    expect(h.store.effectiveSessionId()).toBe(remoteId)
    expect(localOpen).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('explicit navigation retry republishes an already-acknowledged remote selection', async () => {
    const h = await clientHarness()
    await h.store.openCatalogSession(remoteId)
    const before = h.selections().at(-1)!.payload.requestSeq
    await h.store.retryCatalogNavigation()
    expect(h.selections().at(-1)?.payload).toMatchObject({ sessionId: remoteId, requestSeq: before + 1 })
  })

  it('refreshes and opens actual local sessions, and exposes local refresh failure without changing remote selection', async () => {
    const h = await clientHarness()
    await h.store.openCatalogSession(remoteId)
    const order: string[] = []
    const refresh = vi.fn(async () => { order.push('refresh') })
    const localOpen = vi.fn((id: string) => { order.push(`open:${id}`) })
    disposers.push(bindClientServices({ uiWorkspace: { openSession: localOpen }, sessions: {
      list: { getSnapshot: () => ({ ids: ['local-a'], byId: { 'local-a': {} } }) }, refresh,
    } }))
    expect(await h.store.openCatalogSession('local-a')).toEqual({ ok: true })
    expect(order).toEqual(['refresh', 'open:local-a'])
    expect(h.store.getSnapshot().activeSessionId).toBe('local-a')
    await h.store.openCatalogSession(remoteId)
    refresh.mockRejectedValueOnce(new Error('local catalog unavailable'))
    expect(await h.store.openCatalogSession('local-b')).toEqual({ ok: false, error: 'local catalog unavailable' })
    expect(h.store.getSnapshot().activeSessionId).toBe(remoteId)
    expect(localOpen).toHaveBeenCalledExactlyOnceWith('local-a')
  })

  it('restores the observed local session when removing the selected remote device, and rejects subsequent stale clicks', async () => {
    const h = await clientHarness()
    await h.store.reportLocalMainSession('local-return')
    await h.store.openCatalogSession(remoteId)
    expect(h.store.getSnapshot().keepAliveDeviceIds).toContain(deviceId)
    expect(await h.store.removeDevice(deviceId)).toEqual({ ok: true })
    await flush()
    expect(h.store.getSnapshot().activeSessionId).toBe('local-return')
    expect(h.store.getSnapshot().keepAliveDeviceIds).not.toContain(deviceId)
    expect(h.selections().at(-1)?.payload.sessionId).toBe('local-return')
    const before = h.selections().length
    expect(await h.store.openCatalogSession(remoteId)).toEqual({ ok: false, error: 'The owning device was removed' })
    expect(h.selections()).toHaveLength(before)
  })

  it('accepts same-revision mode acknowledgements and retains one-shot native-to-aggregated restore', async () => {
    const h = await clientHarness()
    await h.store.reportLocalMainSession('local-return')
    await h.store.openCatalogSession(remoteId)
    const revision = h.store.getSnapshot().snapshot.revision
    expect(await h.store.setDisplayMode('native')).toEqual({ ok: true })
    expect(h.store.getSnapshot()).toMatchObject({ displayMode: 'native', activeNativeDeviceId: deviceId })
    expect(h.store.getSnapshot().snapshot.revision).toBe(revision)
    expect(h.store.effectiveSessionId()).toBeUndefined()
    expect(await h.store.setDisplayMode('aggregated')).toEqual({ ok: true })
    expect(h.store.getSnapshot().displayMode).toBe('aggregated')
    expect(h.store.takePendingAggregatedSession()).toBe(remoteId)
    expect(h.store.takePendingAggregatedSession()).toBeUndefined()
  })

  it('selecting the local Native tab restores the observed local session rather than leaving remote scope active', async () => {
    const h = await clientHarness()
    await h.store.reportLocalMainSession('local-return')
    await h.store.openCatalogSession(remoteId)
    await h.store.setDisplayMode('native')
    h.store.selectLocalNativeTab()
    await flush()
    expect(h.store.getSnapshot().activeNativeDeviceId).toBeUndefined()
    expect(h.store.getSnapshot().activeSessionId).toBe('local-return')
    expect(h.store.effectiveSessionId()).toBe('local-return')
  })
})

describe('registry mode transition preserves browser navigation sequencing', () => {
  it('does not reset the selected request sequence or accept stale same-sequence navigation after toggling modes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-catalog-navigation-'))
    const registry = new DeviceRegistry(join(directory, 'devices.json'), join(directory, 'secrets.json'),
      { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() },
      { enableNativeProxy: false, enableTunnels: false })
    disposers.push(() => registry.dispose())
    registry.setActiveSession(remoteId, 23, 'browser-a')
    registry.setActiveSession('other-local', 1, 'browser-b')
    registry.setDisplayMode('native')
    expect(registry.snapshot('browser-a').catalogSelection).toEqual({ sessionId: remoteId, requestSeq: 23 })
    registry.setDisplayMode('aggregated')
    expect(registry.snapshot('browser-a').catalogSelection).toEqual({ sessionId: remoteId, requestSeq: 23 })
    expect(registry.setActiveSession('stale-local', 23, 'browser-a')).toBe(false)
    expect(registry.snapshot('browser-a').catalogSelection).toEqual({ sessionId: remoteId, requestSeq: 23 })
    expect(registry.activeSessionScope('browser-b')).toEqual({ kind: 'local' })
    expect(registry.setActiveSession('new-local', 24, 'browser-a')).toBe(true)
    expect(registry.snapshot('browser-a').catalogSelection).toEqual({ sessionId: 'new-local', requestSeq: 24 })
  })
})

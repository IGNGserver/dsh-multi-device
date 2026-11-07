import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DeviceId, encodeRemoteSessionId } from '../src/contract.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import { installScopedCatalog, type CatalogRpc } from '../src/client/modelCatalog.ts'
import { MultiDeviceClientStore } from '../src/client/state.ts'

const registries: DeviceRegistry[] = []
afterEach(() => { for (const registry of registries.splice(0)) registry.dispose(); vi.unstubAllGlobals() })
function registry(): DeviceRegistry {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-client-scope-'))
  const value = new DeviceRegistry(join(dir, 'devices.json'), join(dir, 'secrets.json'),
    { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() }, { enableNativeProxy: false, enableTunnels: false })
  registries.push(value)
  return value
}

describe('browser-local catalog and navigation', () => {
  it('isolates sequence checks and scopes when two clients interleave', () => {
    const value = registry()
    const remote = encodeRemoteSessionId(DeviceId('dev-a'), 'remote')
    value.setActiveSession(remote, 10, 'a')
    value.setActiveSession('local', 1, 'b')
    expect(value.activeSessionScope('a')).toMatchObject({ kind: 'remote', deviceId: 'dev-a' })
    expect(value.activeSessionScope('b')).toEqual({ kind: 'local' })
    expect(value.setActiveSession('stale', 9, 'a')).toBe(false)
    expect(value.activeSessionScope('a').kind).toBe('remote')
  })

  it('selection never silently acknowledges a completion', () => {
    const value = registry()
    value.setActiveSession('local', 1, 'a')
    value.observeLocalSessionStatus('local', true)
    value.observeLocalSessionStatus('local', false)
    expect(value.snapshot().unreadSessionIds).toContain('local')
    value.markSessionRead('local')
    expect(value.snapshot().unreadSessionIds).not.toContain('local')
  })

  it('adapts only one browser RPC and restores it on dispose', async () => {
    const local = vi.fn(async () => ({ ok: true, value: 'local' }))
    const a: CatalogRpc = { call: local }
    const b: CatalogRpc = { call: vi.fn(async () => ({ ok: true, value: 'other-browser' })) }
    const load = vi.fn(async id => ({ ok: true, value: id }))
    const signal = new AbortController().signal
    const dispose = installScopedCatalog(a, () => 'remote-a', id => id.startsWith('remote'), load)
    expect(await a.call('/api', 'session/modelCatalog', {}, signal)).toEqual({ ok: true, value: 'remote-a' })
    expect(load).toHaveBeenCalledWith('remote-a', signal)
    expect(await b.call('/api', 'session/modelCatalog', {})).toEqual({ ok: true, value: 'other-browser' })
    await a.call('/api', 'session/list', {})
    expect(local).toHaveBeenCalledOnce()
    dispose()
    expect(a.call).toBe(local)
  })

  it('retries the same selection after transport failure', async () => {
    const store = new MultiDeviceClientStore()
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ json: async () => ({ ok: true, value: { accepted: true } }) })
    vi.stubGlobal('fetch', fetch)
    await store.setActiveSession('local')
    await store.setActiveSession('local')
    expect(fetch).toHaveBeenCalledTimes(2)
    await store.setActiveSession('local')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('ignores old component cleanup while a new selection is awaiting acknowledgement', async () => {
    const store = new MultiDeviceClientStore()
    let release: (() => void) | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const payload = JSON.parse(init.body).payload
      if (payload.sessionId === 'b') await new Promise<void>(resolve => { release = resolve })
      return { json: async () => ({ ok: true, value: { accepted: true } }) }
    }))
    await store.setActiveSession('a')
    const pending = store.setActiveSession('b')
    store.clearActiveSession('a')
    expect(store.getSnapshot().activeSessionId).toBe('b')
    release?.()
    await pending
  })

  it('does not clear a hidden local mirror under a remote native tab or global panel', async () => {
    const store = new MultiDeviceClientStore()
    const fetch = vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body)
      if (request.action === 'snapshot') return { json: async () => ({ ok: true, value: {
        ...store.getSnapshot().snapshot, revision: 1, hostEpoch: 'test', displayMode: 'native',
        unreadSessionIds: ['local'], devices: [{ id: 'dev-a', keepNativeAlive: true }],
      } }) }
      return { json: async () => ({ ok: true, value: { accepted: true } }) }
    })
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('document', { visibilityState: 'visible' })
    await store.refreshSnapshot()
    await store.selectNativeDevice(DeviceId('dev-a'))
    await store.setActiveSession('local')
    expect(fetch.mock.calls.filter(([, init]) => JSON.parse(init.body).action === 'markSessionRead')).toHaveLength(0)
    store.setMainViewVisible(false)
    store.selectLocalNativeTab()
    await store.setActiveSession('local')
    expect(fetch.mock.calls.filter(([, init]) => JSON.parse(init.body).action === 'markSessionRead')).toHaveLength(0)
  })
})

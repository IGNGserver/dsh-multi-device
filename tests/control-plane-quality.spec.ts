import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceId, encodeRemoteSessionId, type MultiDeviceSnapshot } from '../src/contract.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import { BoundedStreamQueue } from '../src/host/stream-queue.ts'
import { MultiDeviceControlPlane, parseControlPlaneRequest } from '../src/runtime.ts'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.restoreAllMocks() })
function registry() {
  const directory = mkdtempSync(join(process.cwd(), '.quality-control-'))
  const instance = new DeviceRegistry(join(directory, 'state.json'), join(directory, 'secrets.json'), {
    localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map(),
  }, { enableNativeProxy: false, enableTunnels: false })
  cleanups.push(() => { instance.dispose(); rmSync(directory, { recursive: true, force: true }) })
  return instance
}

describe('partial catalog search', () => {
  it('returns successful sources and identifies each failed device', async () => {
    const instance = registry()
    const internal = instance as any
    internal.localCatalogSearch = async () => ['local-hit']
    internal.clients.set(DeviceId('bad'), {
      id: DeviceId('bad'), deviceConfig: { name: 'Bad' }, isConnected: () => true, stop() {},
      invokeUnary: async () => { throw new Error('search backend failed') },
    })
    internal.clients.set(DeviceId('good'), {
      id: DeviceId('good'), deviceConfig: { name: 'Good' }, isConnected: () => true, stop() {},
      invokeUnary: async () => ({ items: [{ sessionId: 'remote-hit' }] }),
    })
    const result = await instance.searchCatalogSessions('hit')
    expect(result.sessionIds).toEqual(expect.arrayContaining(['local-hit', encodeRemoteSessionId(DeviceId('good'), 'remote-hit')]))
    expect(result.errors).toEqual({ bad: 'search backend failed' })
  })
  it('cancels local catalog search through the dispatch signal instead of reporting partial failure', async () => {
    const instance = registry()
    const search = vi.fn(async (_query: string, signal?: AbortSignal) => await new Promise<readonly string[]>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('adapter cancelled')), { once: true })
    }))
    instance.setLocalCatalogAdapters(async () => ({}), search)
    const controller = new AbortController()
    const pending = new MultiDeviceControlPlane(instance).dispatch({ action: 'searchCatalogSessions', payload: { query: 'hit' } }, controller.signal)
    controller.abort()
    expect(await pending).toEqual({ ok: false, error: 'Catalog search aborted' })
    expect(search).toHaveBeenCalledOnce()
    expect(search.mock.calls[0]?.[1]).toBe(controller.signal)
  })
  it('propagates caller cancellation to the read-only remote model catalog', async () => {
    const instance = registry()
    const invokeUnary = vi.fn(async () => ({ models: [] }))
    vi.spyOn(instance, 'isAggregatedMode').mockReturnValue(true)
    vi.spyOn(instance, 'sessionScope').mockReturnValue({
      kind: 'remote', deviceName: 'Remote',
      client: { isConnected: () => true, invokeUnary },
    } as any)
    const controller = new AbortController()
    const result = await new MultiDeviceControlPlane(instance).dispatch({
      action: 'modelCatalog', payload: { sessionId: 'md~device~session' },
    }, controller.signal)
    expect(result).toEqual({ ok: true, value: { models: [] } })
    expect(invokeUnary).toHaveBeenCalledWith('session', 'modelCatalog', {}, controller.signal)
  })
})

describe('bounded stream queue', () => {
  it('preserves FIFO order across repeated ring-buffer compaction', () => {
    const queue = new BoundedStreamQueue<number>(32)
    const expected: number[] = []
    for (let value = 0; value < 5000; value += 1) {
      queue.push(value)
      expected.push(value)
      if (expected.length >= 16) expect(queue.shift()).toBe(expected.shift())
    }
    while (expected.length > 0) expect(queue.shift()).toBe(expected.shift())
    expect(queue.shift()).toBeUndefined()
    expect(queue.overflow).toBe(false)
  })
})

describe('control-plane transport boundaries', () => {
  it('rejects unknown actions and non-object payloads at runtime', () => {
    expect(() => parseControlPlaneRequest({ action: 'not-real' })).toThrow('Unknown action')
    expect(() => parseControlPlaneRequest({ action: 'snapshot', payload: [] })).toThrow('Payload')
    expect(parseControlPlaneRequest({ action: 'snapshot', payload: { clientId: 'a' } })).toMatchObject({ action: 'snapshot' })
  })

  it('rejects malformed fields before dispatch and preserves valid optional/empty fields', async () => {
    const invalid: unknown[] = [
      { action: 'setMemberExcluded', payload: { memberKey: 'local:/repo', excluded: 'false' } },
      { action: 'setActiveSession', payload: { sessionId: 'local', requestSeq: 1.5 } },
      { action: 'removeDevice', payload: { deviceId: 42 } },
      { action: 'upsertDevice', payload: { name: 'bad', transport: { kind: 'ssh', host: 'host', port: 70000 } } },
      { action: 'testDevice', payload: { name: 'bad', transport: { kind: 'direct', baseUrl: 'https://host', rejectUnauthorized: 'no' } } },
      { action: 'upsertDevice', payload: { name: 'bad', transport: { kind: 'ssh', host: 'host' }, auth: { mode: 'unknown' } } },
      { action: 'updateAggregationConfig', payload: { excludedMemberKeys: 'local:/repo' } },
      { action: 'upsertManualRule', payload: { id: 'rule', title: '', memberKeys: [42] } },
      { action: 'setUiPreferences', payload: { nativePane: 1 } },
    ]
    for (const request of invalid) expect(() => parseControlPlaneRequest(request)).toThrow()
    const instance = registry()
    const excluded = vi.spyOn(instance.aggregator, 'setMemberExcluded')
    const upsert = vi.spyOn(instance, 'upsertDevice')
    expect(await new MultiDeviceControlPlane(instance).dispatch(invalid[0] as any)).toMatchObject({ ok: false })
    expect(await new MultiDeviceControlPlane(instance).dispatch(invalid[3] as any)).toMatchObject({ ok: false })
    expect(excluded).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
    const valid: unknown[] = [
      { action: 'setActiveSession', payload: { sessionId: '', requestSeq: 0 } },
      { action: 'catalogSessionAction', payload: { sessionId: 'local', operation: 'rename', title: '', stopActivity: false } },
      { action: 'createSession', payload: { deviceId: 'remote', cwd: '/repo' } },
      { action: 'setCustomTitle', payload: { logicalWorkspaceId: 'workspace', title: '' } },
      { action: 'authenticateDevice', payload: { deviceId: 'remote', credential: '' } },
    ]
    for (const request of valid) expect(() => parseControlPlaneRequest(request)).not.toThrow()
  })

  it('coalesces revisions while an SSE socket is backpressured', async () => {
    const instance = registry()
    const plane = new MultiDeviceControlPlane(instance, () => true)
    const req = new EventEmitter() as any
    req.url = '/multi-device/events?clientId=test'
    const res = new EventEmitter() as any
    const writes: string[] = []
    let block = true
    res.destroyed = false
    res.writableNeedDrain = false
    res.writeHead = () => res
    res.write = (value: string) => {
      writes.push(value)
      if (block) { block = false; res.writableNeedDrain = true; return false }
      return true
    }
    res.destroy = () => { res.destroyed = true; res.emit('close'); return res }
    plane.handleEventsSse(req, res)
    expect(writes).toHaveLength(1)
    const snapshotSpy = vi.spyOn(instance, 'snapshot')
    ;(instance as any).bumpRevision()
    ;(instance as any).bumpRevision()
    ;(instance as any).bumpRevision()
    res.writableNeedDrain = false
    res.emit('drain')
    await vi.waitFor(() => expect(writes).toHaveLength(2))
    expect(snapshotSpy).toHaveBeenCalledTimes(1)
    const projected = JSON.parse(writes[1]!.match(/^event: snapshot\ndata: (.*)\n\n$/s)![1]!) as MultiDeviceSnapshot
    expect(projected.revision).toBe(instance.snapshot().revision)
    req.emit('close')
    const count = writes.length
    ;(instance as any).bumpRevision()
    await Promise.resolve()
    expect(writes).toHaveLength(count)
  })
})

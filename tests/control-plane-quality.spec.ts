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
  }, { enableTunnels: false })
  cleanups.push(() => { instance.dispose(); rmSync(directory, { recursive: true, force: true }) })
  return instance
}

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
      // Removed aggregated-mode actions must be rejected as unknown, not ignored.
      { action: 'setDisplayMode', payload: { displayMode: 'native' } },
      { action: 'catalogSessionAction', payload: { sessionId: 'local', operation: 'rename' } },
      { action: 'searchCatalogSessions', payload: { query: 'hit' } },
      { action: 'modelCatalog', payload: { sessionId: 'md~device~session' } },
      { action: 'createSession', payload: { deviceId: 'remote', cwd: '/repo' } },
      { action: 'updateAggregationConfig', payload: { autoGitAggregate: true } },
      { action: 'startGitMatch', payload: {} },
      { action: 'setPreferredDevice', payload: { logicalWorkspaceId: 'ws', deviceId: 'remote' } },
      { action: 'setActiveSession', payload: { sessionId: 'local', requestSeq: 1.5 } },
      { action: 'removeDevice', payload: { deviceId: 42 } },
      { action: 'upsertDevice', payload: { name: 'bad', transport: { kind: 'ssh', host: 'host', port: 70000 } } },
      { action: 'testDevice', payload: { name: 'bad', transport: { kind: 'direct', baseUrl: 'https://host', rejectUnauthorized: 'no' } } },
      { action: 'upsertDevice', payload: { name: 'bad', transport: { kind: 'ssh', host: 'host' }, auth: { mode: 'unknown' } } },
      { action: 'setUiPreferences', payload: { crossHostReadState: 1 } },
    ]
    for (const request of invalid) expect(() => parseControlPlaneRequest(request)).toThrow()
    const instance = registry()
    const upsert = vi.spyOn(instance, 'upsertDevice')
    expect(await new MultiDeviceControlPlane(instance).dispatch(invalid[0] as any)).toMatchObject({ ok: false })
    expect(await new MultiDeviceControlPlane(instance).dispatch(invalid[10] as any)).toMatchObject({ ok: false })
    expect(upsert).not.toHaveBeenCalled()
    const valid: unknown[] = [
      { action: 'setActiveSession', payload: { sessionId: '', requestSeq: 0 } },
      { action: 'setUiPreferences', payload: { crossHostReadState: true } },
      { action: 'authenticateDevice', payload: { deviceId: 'remote', credential: '' } },
      { action: 'markSessionRead', payload: { sessionId: 'md~remote~session' } },
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

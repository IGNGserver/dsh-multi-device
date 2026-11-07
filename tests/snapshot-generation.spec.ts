import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceId, type MultiDeviceSnapshot } from '../src/contract.ts'
import { MultiDeviceClientStore } from '../src/client/state.ts'
import { getClientServices } from '../src/client/clientServices.ts'

vi.mock('../src/client/clientServices.ts', () => ({ getClientServices: vi.fn(() => ({})) }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve() }
const response = (value: unknown) => ({ json: async () => ({ ok: true, value }) })
const stores: MultiDeviceClientStore[] = []
function store() {
  const value = new MultiDeviceClientStore()
  stores.push(value)
  return value
}
function snapshot(value: MultiDeviceClientStore, revision: number, hostEpoch?: string, patch = {}): MultiDeviceSnapshot {
  return { ...value.getSnapshot().snapshot, hostEpoch, revision, ...patch }
}
function ingest(value: MultiDeviceClientStore, snap: MultiDeviceSnapshot) {
  ;(value as unknown as { applyIncomingSnapshot(snap: MultiDeviceSnapshot): void }).applyIncomingSnapshot(snap)
}
class EventSourceMock {
  static OPEN = 1
  static instances: EventSourceMock[] = []
  readyState = 1
  onerror: (() => void) | undefined
  listener: ((event: { data: string }) => void) | undefined
  close = vi.fn()
  constructor(_url: string) { EventSourceMock.instances.push(this) }
  addEventListener(_name: string, listener: (event: { data: string }) => void) { this.listener = listener }
  emit(snap: MultiDeviceSnapshot) { this.listener?.({ data: JSON.stringify(snap) }) }
}
function transport(handler: (request: any) => unknown | Promise<unknown>) {
  const calls: any[] = []
  const fetch = vi.fn(async (_url, init) => {
    const request = JSON.parse(init.body)
    calls.push(request)
    if (request.action === 'setActiveSession') return response({ accepted: true })
    return handler(request)
  })
  vi.stubGlobal('fetch', fetch)
  return { fetch, calls }
}
afterEach(() => {
  for (const value of stores.splice(0)) value.dispose()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  EventSourceMock.instances = []
})

describe('snapshot generation fences', () => {
  it('accepts opaque epoch transitions but never resurrects a retired epoch via SSE or HTTP', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', EventSourceMock)
    const value = store()
    const { calls } = transport(() => new Promise(() => {}))
    value.start()
    const es = EventSourceMock.instances[0]
    es.emit(snapshot(value, 800, 'zzzz'))
    es.emit(snapshot(value, 1, 'aaaa'))
    expect(value.getSnapshot().snapshot.hostEpoch).toBe('aaaa')
    es.emit(snapshot(value, 999, 'zzzz'))
    expect(value.getSnapshot().snapshot.hostEpoch).toBe('aaaa')
    vi.stubGlobal('fetch', vi.fn(async () => response(snapshot(value, 1000, 'zzzz'))))
    await value.refreshSnapshot()
    expect(value.getSnapshot().snapshot.hostEpoch).toBe('aaaa')
    expect(calls.filter(call => call.action === 'setActiveSession')).toHaveLength(2)
  })

  it('does not let HTTP started under one host introduce an unknown old epoch after SSE restart', async () => {
    const value = store()
    const late = deferred<unknown>()
    transport(() => late.promise)
    ingest(value, snapshot(value, 10, 'current'))
    const pending = value.refreshSnapshot()
    ingest(value, snapshot(value, 1, 'restart'))
    late.resolve(response(snapshot(value, 900, 'never-before-seen-old')))
    await pending
    expect(value.getSnapshot().snapshot.hostEpoch).toBe('restart')
  })

  it('fences overlapping HTTP successes and failures by request order', async () => {
    const value = store()
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    let count = 0
    transport(() => ++count === 1 ? first.promise : second.promise)
    const a = value.refreshSnapshot()
    const b = value.refreshSnapshot()
    second.resolve(response(snapshot(value, 1, 'new')))
    await b
    first.reject(new Error('old network failure'))
    await a
    expect(value.getSnapshot()).toMatchObject({ loading: false, error: undefined })
    expect(value.getSnapshot().snapshot.hostEpoch).toBe('new')
  })

  it.each(['success', 'failure'])('ignores a pending %s after stop without emitting state', async outcome => {
    vi.useFakeTimers()
    const value = store()
    const late = deferred<unknown>()
    transport(() => late.promise)
    const off = value.start()
    const listener = vi.fn()
    value.subscribe(listener)
    const before = value.getSnapshot()
    off()
    if (outcome === 'success') late.resolve(response(snapshot(value, 99, 'late')))
    else late.reject(new Error('late failure'))
    await flush()
    expect(value.getSnapshot()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('isolates restart from the old cleanup, HTTP response, SSE event and active acknowledgement', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', EventSourceMock)
    const value = store()
    const old = deferred<unknown>()
    let count = 0
    const { calls } = transport(() => ++count === 1 ? old.promise : response(snapshot(value, 1, 'new')))
    const offOld = value.start()
    const esOld = EventSourceMock.instances[0]
    offOld()
    value.start()
    offOld()
    await flush()
    old.resolve(response(snapshot(value, 999, 'old')))
    esOld.emit(snapshot(value, 1000, 'old'))
    esOld.onerror?.()
    await flush()
    expect(value.getSnapshot().snapshot.hostEpoch).toBe('new')
    expect(EventSourceMock.instances[1].close).not.toHaveBeenCalled()
    expect(calls.filter(call => call.action === 'setActiveSession')).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('fences callbacks and HTTP on SSE failure before and after reconnect', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', EventSourceMock)
    const value = store()
    const late = deferred<unknown>()
    transport(() => late.promise)
    value.start()
    const old = EventSourceMock.instances[0]
    old.onerror?.()
    old.emit(snapshot(value, 30, 'old'))
    late.resolve(response(snapshot(value, 31, 'old')))
    await flush()
    expect(value.getSnapshot().snapshot.revision).toBe(0)
    await vi.advanceTimersByTimeAsync(500)
    const current = EventSourceMock.instances[1]
    current.emit(snapshot(value, 1, 'new'))
    old.emit(snapshot(value, 50, 'old'))
    old.onerror?.()
    expect(value.getSnapshot().snapshot.hostEpoch).toBe('new')
    expect(current.close).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('does not coalesce a new active-session report with the failed SSE connection request', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', EventSourceMock)
    const value = store()
    const oldAck = deferred<unknown>()
    const calls: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body)
      calls.push(request)
      if (request.action !== 'setActiveSession') return new Promise(() => {})
      if (calls.filter(call => call.action === 'setActiveSession').length === 1) return oldAck.promise
      return response({ accepted: true })
    }))
    value.start()
    const pending = value.setActiveSession('s')
    EventSourceMock.instances[0].onerror?.()
    await vi.advanceTimersByTimeAsync(500)
    await value.setActiveSession('s')
    expect(calls.filter(call => call.action === 'setActiveSession')).toHaveLength(2)
    oldAck.resolve(response({ accepted: true }))
    await pending
  })

  it('fences the JSON body phase, not just the fetch promise, after disposal', async () => {
    const value = store()
    const json = deferred<unknown>()
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: () => json.promise })))
    const pending = value.refreshSnapshot()
    await flush()
    value.dispose()
    const before = value.getSnapshot()
    json.resolve({ ok: true, value: snapshot(value, 999, 'late-json') })
    await pending
    expect(value.getSnapshot()).toBe(before)
  })

  it('does not release keep-alive for a lower-revision remove response', async () => {
    const value = store()
    ingest(value, snapshot(value, 5, 'host', { devices: [{ id: 'dev' }] }))
    value.ensureKeepAliveDevice(DeviceId('dev'))
    transport(() => response({ snapshot: snapshot(value, 4, 'host', { devices: [] }) }))
    expect(await value.removeDevice(DeviceId('dev'))).toMatchObject({ ok: false })
    expect(value.getSnapshot().keepAliveDeviceIds).toEqual(['dev'])
    expect(value.getSnapshot().snapshot.revision).toBe(5)
  })

  it('retains plain revision ordering for hosts without epochs', async () => {
    const value = store()
    let revision = 8
    transport(() => response(snapshot(value, revision)))
    await value.refreshSnapshot()
    revision = 1
    await value.refreshSnapshot()
    expect(value.getSnapshot().snapshot.revision).toBe(8)
    revision = 9
    await value.refreshSnapshot()
    expect(value.getSnapshot().snapshot.revision).toBe(9)
  })

  it('does not publish old mutation failure or release keep-alive after stop', async () => {
    vi.useFakeTimers()
    const value = store()
    const removal = deferred<unknown>()
    const failure = deferred<unknown>()
    transport(request => request.action === 'removeDevice' ? removal.promise : request.action === 'reconnectDevice' ? failure.promise : new Promise(() => {}))
    ingest(value, snapshot(value, 1, undefined, { devices: [{ id: 'dev', keepNativeAlive: true }] }))
    value.ensureKeepAliveDevice(DeviceId('dev'))
    const off = value.start()
    const a = value.removeDevice(DeviceId('dev'))
    const b = value.reconnectDevice(DeviceId('dev'))
    off()
    const before = value.getSnapshot()
    removal.resolve(response({ snapshot: snapshot(value, 2) }))
    failure.reject(new Error('late reconnect failure'))
    await Promise.all([a, b])
    expect(value.getSnapshot()).toBe(before)
    expect(value.getSnapshot().keepAliveDeviceIds).toEqual(['dev'])
  })

  it('rejects older mode response even with a forced active-tab override', async () => {
    const value = store()
    const late = deferred<unknown>()
    let modeRequests = 0
    transport(() => ++modeRequests === 1 ? late.promise : response({ snapshot: snapshot(value, 2, undefined, { displayMode: 'aggregated' }) }))
    const a = value.setDisplayMode('native', DeviceId('a'))
    await value.setDisplayMode('aggregated')
    late.resolve(response({ snapshot: snapshot(value, 900, 'stale-host', { displayMode: 'native', devices: [{ id: 'a' }] }) }))
    expect(await a).toMatchObject({ ok: false })
    expect(value.getSnapshot().displayMode).toBe('aggregated')
  })

  it('cancels post-refresh navigation after dispose', async () => {
    const value = store()
    const refresh = deferred<void>()
    vi.mocked(getClientServices).mockReturnValue({ sessions: { refresh: () => refresh.promise } } as any)
    transport(() => response({ mode: 'registered', sessionId: 'created', snapshot: snapshot(value, 1) }))
    const openSession = vi.fn()
    const pending = value.switchNewSessionDevice({ openSession }, 'workspace', DeviceId('dev'))
    await flush()
    value.dispose()
    refresh.resolve()
    expect(await pending).toMatchObject({ ok: false })
    expect(openSession).not.toHaveBeenCalled()
    vi.mocked(getClientServices).mockReturnValue({} as any)
  })

  it('does not accept a legacy snapshot downgrade once an epoch has been established', async () => {
    const value = store()
    transport(() => response(snapshot(value, 1000)))
    ingest(value, snapshot(value, 1, 'host'))
    await value.refreshSnapshot()
    expect(value.getSnapshot().snapshot.hostEpoch).toBe('host')
  })

  it('re-reports the same session after restart and ignores the old acknowledgement', async () => {
    vi.useFakeTimers()
    const value = store()
    const oldAck = deferred<unknown>()
    const calls: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body)
      calls.push(request)
      if (request.action === 'snapshot') return new Promise(() => {})
      if (calls.filter(call => call.action === 'setActiveSession').length === 1) return oldAck.promise
      return response({ accepted: true })
    }))
    const first = value.setActiveSession('s')
    const off = value.start()
    off()
    value.start()
    await value.setActiveSession('s')
    oldAck.resolve(response({ accepted: true }))
    await first
    await value.setActiveSession('s')
    const reports = calls.filter(call => call.action === 'setActiveSession')
    expect(reports).toHaveLength(2)
    expect(reports[1].payload.requestSeq).toBeGreaterThan(reports[0].payload.requestSeq)
  })
})

describe('visible completion acknowledgement', () => {
  it('immediately clears active unread on visibilitychange and removes its listener on stop/dispose', async () => {
    vi.useFakeTimers()
    const doc = Object.assign(new EventTarget(), { visibilityState: 'hidden' })
    const remove = vi.spyOn(doc, 'removeEventListener')
    vi.stubGlobal('document', doc)
    const value = store()
    const { calls } = transport(() => new Promise(() => {}))
    const off = value.start()
    await value.setActiveSession('s')
    ingest(value, snapshot(value, 1, 'host', { unreadSessionIds: ['s'], readCompletions: { s: 'completion-1' } }))
    expect(calls.filter(call => call.action === 'markSessionRead')).toHaveLength(0)
    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(calls.filter(call => call.action === 'markSessionRead')).toMatchObject([{ payload: { sessionId: 's', expectedCompletionId: 'completion-1' } }])
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(calls.filter(call => call.action === 'markSessionRead')).toHaveLength(1)
    off()
    expect(remove).toHaveBeenCalledTimes(1)
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(calls.filter(call => call.action === 'markSessionRead')).toHaveLength(1)
    value.start()
    expect(calls.filter(call => call.action === 'markSessionRead')).toHaveLength(2)
    value.dispose()
    expect(remove).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not clear an obscured main view, but clears immediately when the view is shown', async () => {
    vi.useFakeTimers()
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    vi.stubGlobal('document', doc)
    const value = store()
    const { calls } = transport(() => new Promise(() => {}))
    value.start()
    value.setMainViewVisible(false)
    await value.setActiveSession('s')
    ingest(value, snapshot(value, 1, undefined, { unreadSessionIds: ['s'] }))
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(calls.filter(call => call.action === 'markSessionRead')).toHaveLength(0)
    value.setMainViewVisible(true)
    expect(calls.filter(call => call.action === 'markSessionRead')).toHaveLength(1)
  })

  it('sends distinct completion tokens while an older read is pending, never applies its stale response', async () => {
    const value = store()
    const old = deferred<unknown>()
    const newer = deferred<unknown>()
    const { calls } = transport(request => request.payload.expectedCompletionId === 'one' ? old.promise : newer.promise)
    ingest(value, snapshot(value, 1, undefined, { unreadSessionIds: ['s'], readCompletions: { s: 'one' } }))
    await value.setActiveSession('s')
    ingest(value, snapshot(value, 2, undefined, { unreadSessionIds: ['s'], readCompletions: { s: 'two' } }))
    expect(calls.filter(call => call.action === 'markSessionRead').map(call => call.payload.expectedCompletionId)).toEqual(['one', 'two'])
    old.resolve(response({ changed: true, snapshot: snapshot(value, 3, undefined, { unreadSessionIds: [] }) }))
    await flush()
    expect(value.getSnapshot().snapshot.unreadSessionIds).toEqual(['s'])
    newer.resolve(response({ changed: true, snapshot: snapshot(value, 4, undefined, { unreadSessionIds: [] }) }))
    await flush()
    expect(value.getSnapshot().snapshot.unreadSessionIds).toEqual([])
  })

  it('omits expectedCompletionId for legacy hosts', async () => {
    const value = store()
    const { calls } = transport(() => response({ changed: true, snapshot: snapshot(value, 1) }))
    await value.markSessionRead('s')
    expect(calls[0].payload.sessionId).toBe('s')
    expect(calls[0].payload).not.toHaveProperty('expectedCompletionId')
  })
})

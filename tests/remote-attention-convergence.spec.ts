/** Deterministic catalog races plus a real loopback mux startup/reconnect fixture. */
import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import { DeviceId, encodeRemoteEventId, type DeviceConfig } from '../src/contract.ts'
import { DeviceCatalog } from '../src/host/device-catalog.ts'
import { DeviceAuthManager } from '../src/host/auth.ts'
import { RemoteDeviceClient, type RemoteDeviceCallbacks, type RemotePendingInteraction, type RemoteSessionSummary } from '../src/host/remote-client.ts'

const ID = DeviceId('attention-convergence')
const disposers: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
  vi.restoreAllMocks()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function summary(sessionId: string, patch: Partial<RemoteSessionSummary> = {}): RemoteSessionSummary {
  return { sessionId, updatedAt: 1, agentAvailable: true, running: false, blank: false, ...patch }
}
function config(baseUrl = 'http://127.0.0.1:1'): DeviceConfig {
  return { id: ID, name: 'Fixture', enabled: true, auth: { mode: 'auto' }, transport: { kind: 'direct', baseUrl } }
}
function callbacks(): RemoteDeviceCallbacks {
  return {
    onStateChanged: vi.fn(), onRemoteEventFrame: vi.fn(), onControlProjectionFrame: vi.fn(),
    onWorkspacesChanged: vi.fn(), onGitRemotesDiscovered: vi.fn(), onModelCatalogChanged: vi.fn(),
  }
}
type RpcResult = { ok: true; value: unknown; httpStatus: number } | { ok: false; httpStatus: number; error: { code: string; message: string } }
type Internals = {
  protocolVersion: string
  catalog: DeviceCatalog
  state: string
  baselineGeneration: number | undefined
  remoteEventsClientId: string | undefined
  pendingInteractions: Map<string, RemotePendingInteraction>
  projectionsBySession: Map<string, { asOfSeq: number; values: Record<string, unknown> }>
  rawRpcPost: (path: string, payload: unknown, signal?: AbortSignal) => Promise<RpcResult>
  handle02EmitEvent: (event: string, args: unknown[]) => void
  pump02RemoteEvents: (signal: AbortSignal, epoch?: number, onReady?: () => void) => Promise<void>
  pump02SessionControl: (signal: AbortSignal) => Promise<void>
  handshakeAndLoadInitial: (url: string, signal: AbortSignal) => Promise<unknown>
}
function fixture() {
  const cb = callbacks()
  const auth = new DeviceAuthManager()
  const client = new RemoteDeviceClient(config(), auth, cb)
  const inner = client as unknown as Internals
  inner.protocolVersion = '0.2'
  inner.catalog.markEventsReady(inner.catalog.epoch)
  disposers.push(() => client.stop())
  return { client, inner, cb, auth }
}
function pending(eventId: string, rawSessionId = 's'): RemotePendingInteraction {
  return { eventId, namespacedEventId: encodeRemoteEventId(ID, eventId), deviceId: ID, rawSessionId,
    namespacedSessionId: `remote:${rawSessionId}`, kind: 'approval', eventName: 'approval/request', request: {} }
}
const success = (items: RemoteSessionSummary[]): RpcResult => ({ ok: true, value: { items }, httpStatus: 200 })

// Private seams deliberately keep these races scheduler-controlled, not timer-driven.
describe('RemoteDeviceClient catalog convergence', () => {
  it('shares one request and replays added/removed/status/activity in order without duplicate live events', async () => {
    const { client, inner, cb } = fixture()
    inner.catalog.replaceSessions([summary('s', { running: true }), summary('removed')])
    const response = deferred<RpcResult>()
    const post = vi.spyOn(inner, 'rawRpcPost').mockReturnValue(response.promise)
    const first = client.refreshSessionCatalog()
    const second = client.refreshSessionCatalog()
    expect(first).toBe(second)
    await Promise.resolve()
    expect(post).toHaveBeenCalledTimes(1)
    inner.handle02EmitEvent('api-session/added', [summary('new')])
    inner.handle02EmitEvent('api-session/status', ['new', true])
    inner.handle02EmitEvent('api-session/status', ['s', false])
    inner.handle02EmitEvent('api-session/activity', ['s', 20])
    inner.handle02EmitEvent('api-session/removed', ['removed'])
    inner.handle02EmitEvent('api-session/added', [summary('transient')])
    inner.handle02EmitEvent('api-session/removed', ['transient'])
    const frames = vi.mocked(cb.onRemoteEventFrame).mock.calls.length
    response.resolve(success([summary('s', { running: true }), summary('removed')]))
    await first
    expect(client.sessionSummaries()).toEqual([summary('new', { running: true }), summary('s', { updatedAt: 20 })])
    expect(vi.mocked(cb.onRemoteEventFrame).mock.calls).toHaveLength(frames)
    await client.refreshSessionCatalog()
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('compares the committed snapshot with the current live table, not the request-start table', async () => {
    const { client, inner, cb } = fixture()
    inner.catalog.replaceSessions([summary('s', { running: true })])
    const response = deferred<RpcResult>()
    vi.spyOn(inner, 'rawRpcPost').mockReturnValue(response.promise)
    const refresh = client.refreshSessionCatalog()
    await Promise.resolve()
    inner.handle02EmitEvent('api-session/status', ['s', false])
    response.resolve(success([summary('s', { running: true })]))
    await refresh
    expect(client.sessionSummaries()[0]?.running).toBe(false)
    expect(cb.onRemoteEventFrame).toHaveBeenCalledTimes(1)
  })

  it.each(['stop', 'disable', 'reconnect'] as const)('aborts and fences old responses across %s, including old finally cleanup', async boundary => {
    const { client, inner } = fixture()
    inner.catalog.replaceSessions([summary('old')])
    const old = deferred<RpcResult>()
    const fresh = deferred<RpcResult>()
    const post = vi.spyOn(inner, 'rawRpcPost').mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
    const before = client.connectionGeneration
    const staleRequest = client.refreshSessionCatalog()
    await Promise.resolve()
    const oldSignal = post.mock.calls[0]?.[2]
    // Prevent actual networking; this case isolates generation ownership.
    vi.spyOn(client, 'start').mockImplementation(() => {})
    if (boundary === 'stop') client.stop()
    if (boundary === 'disable') client.updateConfig({ ...config(), enabled: false })
    if (boundary === 'reconnect') client.reconnectNow()
    expect(client.connectionGeneration).toBeGreaterThan(before)
    expect(oldSignal?.aborted).toBe(true)
    expect(client.catalogFresh).toBe(false)
    const currentRequest = client.refreshSessionCatalog()
    await Promise.resolve()
    old.resolve(success([summary('obsolete')]))
    await staleRequest
    expect(client.refreshSessionCatalog()).toBe(currentRequest)
    fresh.resolve(success([summary('current')]))
    await currentRequest
    expect(client.sessionSummaries().map(item => item.sessionId)).toEqual(['current'])
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('ignores caller-aborted responses and retries a failed request rather than retaining a stuck flight', async () => {
    const { client, inner } = fixture()
    inner.catalog.replaceSessions([summary('s')])
    const response = deferred<RpcResult>()
    const post = vi.spyOn(inner, 'rawRpcPost').mockReturnValueOnce(response.promise).mockResolvedValue(success([summary('fresh')]))
    const abort = new AbortController()
    const refresh = client.refreshSessionCatalog(abort.signal)
    await Promise.resolve()
    abort.abort()
    response.resolve(success([summary('obsolete')]))
    await refresh
    expect(client.sessionSummaries()[0]?.sessionId).toBe('s')
    await client.refreshSessionCatalog()
    expect(client.sessionSummaries()[0]?.sessionId).toBe('fresh')
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('releases a failed flight and never dispatches one invalidated before its microtask starts', async () => {
    const { client, inner } = fixture()
    inner.catalog.replaceSessions([summary('s')])
    const post = vi.spyOn(inner, 'rawRpcPost').mockResolvedValueOnce({ ok: false, httpStatus: 500, error: { code: 'failed', message: 'retry' } }).mockResolvedValue(success([summary('fresh')]))
    await client.refreshSessionCatalog()
    expect(client.sessionSummaries()[0]?.sessionId).toBe('s')
    await client.refreshSessionCatalog()
    expect(client.sessionSummaries()[0]?.sessionId).toBe('fresh')
    const cancelled = client.refreshSessionCatalog()
    client.stop()
    await cancelled
    expect(post).toHaveBeenCalledTimes(2)
  })

  it.each(['rpc', 'throw', 'malformed'] as const)('lowers freshness after %s failure without masking running, then recovers', async failure => {
    const { client, inner, cb } = fixture()
    inner.state = 'connected'
    inner.catalog.setStale(false)
    const post = vi.spyOn(inner, 'rawRpcPost').mockResolvedValue(success([summary('s', { running: true })]))
    await client.refreshSessionCatalog()
    expect(client.catalogFresh).toBe(true)
    vi.mocked(cb.onRemoteEventFrame).mockClear()
    vi.mocked(cb.onStateChanged).mockClear()
    if (failure === 'rpc') post.mockResolvedValueOnce({ ok: false, httpStatus: 500, error: { code: 'failed', message: 'retry' } })
    if (failure === 'throw') post.mockRejectedValueOnce(new Error('transport failure'))
    if (failure === 'malformed') post.mockResolvedValueOnce({ ok: true, httpStatus: 200, value: {} })
    const refresh = client.refreshSessionCatalog()
    if (failure === 'throw') await expect(refresh).rejects.toThrow('transport failure')
    else await refresh
    expect(client.catalogFresh).toBe(false)
    expect(client.toView().catalogStale).not.toBe(true)
    expect(client.sessionSummaries()[0]?.running).toBe(true)
    expect(cb.onRemoteEventFrame).not.toHaveBeenCalled()
    expect(cb.onStateChanged).toHaveBeenCalledTimes(1)
    await client.refreshSessionCatalog()
    expect(client.catalogFresh).toBe(true)
    expect(client.sessionSummaries()[0]?.running).toBe(true)
  })

  it('does not commit the protocol probe snapshot before subscribing to events', async () => {
    const { client, inner } = fixture()
    inner.catalog.replaceSessions([summary('cached')])
    vi.spyOn(inner, 'rawRpcPost').mockResolvedValue({ ok: true, httpStatus: 200, value: { version: '0.2.0', items: [summary('probe')] } })
    await inner.handshakeAndLoadInitial('http://127.0.0.1:1', new AbortController().signal)
    expect(client.sessionSummaries()[0]?.sessionId).toBe('cached')
    expect(client.catalogFresh).toBe(false)
  })
})

describe('RemoteDeviceClient ordered session metadata', () => {
  it('updates blank immediately before running status and replays it over an inflight stale list', async () => {
    const { client, inner, cb } = fixture()
    inner.catalog.replaceSessions([summary('s', { blank: true })])
    const response = deferred<RpcResult>()
    vi.spyOn(inner, 'rawRpcPost').mockReturnValue(response.promise)
    const refresh = client.refreshSessionCatalog()
    await Promise.resolve()
    vi.spyOn(client, 'openStream').mockImplementation(async function* () {
      yield { type: 'projection', sessionId: 's', key: 'sessionListMetadata', seq: 4, value: { blank: false } }
    })
    await inner.pump02SessionControl(new AbortController().signal)
    expect(client.sessionSummaries()[0]?.blank).toBe(false)
    expect(cb.onStateChanged).toHaveBeenCalled()
    expect(cb.onWorkspacesChanged).toHaveBeenCalled()
    expect(vi.mocked(cb.onRemoteEventFrame).mock.calls.some(([, frame]) => frame.type === 'emit' && frame.event === 'api-session/added')).toBe(true)
    inner.handle02EmitEvent('api-session/status', ['s', true])
    expect(client.sessionSummaries()[0]).toMatchObject({ blank: false, running: true })
    response.resolve(success([summary('s', { blank: true })]))
    await refresh
    expect(client.sessionSummaries()[0]).toMatchObject({ blank: false, running: true })
  })

  it('rejects same-key duplicate/older seqs without dropping lower-seq updates for a different key', async () => {
    const { client, inner, cb } = fixture()
    inner.catalog.replaceSessions([summary('s', { blank: true })])
    vi.spyOn(client, 'openStream').mockImplementation(async function* () {
      yield { type: 'projection', sessionId: 's', key: 'sessionListMetadata', seq: 5, value: { blank: false } }
      yield { type: 'projection', sessionId: 's', key: 'sessionListMetadata', seq: 4, value: { blank: true } }
      yield { type: 'projection', sessionId: 's', key: 'sessionListMetadata', seq: 5, value: { blank: true } }
      yield { type: 'projection', sessionId: 's', key: 'title', seq: 3, value: 'different-key' }
    })
    await inner.pump02SessionControl(new AbortController().signal)
    expect(client.sessionSummaries()[0]?.blank).toBe(false)
    expect(client.controlProjections().get('s')?.values.title).toBe('different-key')
    expect(cb.onControlProjectionFrame).toHaveBeenCalledTimes(2)
  })

  it('applies baseline metadata and fences omitted keys, resetting ordering only on a new generation', async () => {
    const { client, inner } = fixture()
    inner.catalog.replaceSessions([summary('s', { blank: true })])
    const stream = vi.spyOn(client, 'openStream').mockImplementation(async function* () {
      yield { type: 'baseline', value: { projections: { s: { asOfSeq: 10, values: { sessionListMetadata: { blank: false } } } } } }
    })
    await inner.pump02SessionControl(new AbortController().signal)
    expect(client.sessionSummaries()[0]?.blank).toBe(false)
    // New authoritative baseline has no metadata key; never reuse its old value.
    stream.mockImplementation(async function* () {
      yield { type: 'baseline', value: { projections: { s: { asOfSeq: 12, values: {} } } } }
      yield { type: 'projection', sessionId: 's', key: 'sessionListMetadata', seq: 11, value: { blank: true } }
    })
    await inner.pump02SessionControl(new AbortController().signal)
    expect(client.controlProjections().get('s')?.values).toEqual({})
    expect(client.sessionSummaries()[0]?.blank).toBe(false)
    client.stop()
    inner.catalog.setStale(false)
    stream.mockImplementation(async function* () {
      yield { type: 'baseline', value: { projections: { s: { asOfSeq: 1, values: { sessionListMetadata: { blank: true } } } } } }
      yield { type: 'projection', sessionId: 's', key: 'sessionListMetadata', seq: 2, value: { blank: false } }
    })
    await inner.pump02SessionControl(new AbortController().signal)
    expect(client.sessionSummaries()[0]?.blank).toBe(false)
    expect(client.controlProjections().get('s')?.asOfSeq).toBe(2)
  })
})

describe('RemoteDeviceClient pending authority', () => {
  it('cancels and forgets pending requests on disconnect, disable and authoritative deletion', async () => {
    const { client, inner, cb } = fixture()
    inner.catalog.replaceSessions([summary('s'), summary('keep')])
    inner.pendingInteractions.set('event', pending('event'))
    inner.projectionsBySession.set('s', { asOfSeq: 3, values: {} })
    vi.spyOn(inner, 'rawRpcPost').mockResolvedValue(success([summary('keep')]))
    await client.refreshSessionCatalog()
    expect(client.pendingInteractionList()).toEqual([])
    expect(inner.projectionsBySession.has('s')).toBe(false)
    expect(cb.onRemoteEventFrame).toHaveBeenCalledWith(ID, { type: 'cancel', eventId: encodeRemoteEventId(ID, 'event') })
    inner.pendingInteractions.set('removed', pending('removed', 'keep'))
    inner.handle02EmitEvent('api-session/removed', ['keep'])
    expect(inner.pendingInteractions.size).toBe(0)
    inner.pendingInteractions.set('offline', pending('offline'))
    client.stop()
    expect(inner.pendingInteractions.size).toBe(0)
    inner.pendingInteractions.set('disabled', pending('disabled'))
    client.updateConfig({ ...config(), enabled: false })
    expect(inner.pendingInteractions.size).toBe(0)
  })

  it('keeps failed/missing-client/next responses pending and deletes only after successful acknowledgement', async () => {
    const { client, inner } = fixture()
    inner.pendingInteractions.set('event', pending('event'))
    expect((await client.respondWaterfall('event', { kind: 'result', value: true })).ok).toBe(false)
    expect(inner.pendingInteractions.size).toBe(1)
    inner.remoteEventsClientId = 'client'
    const post = vi.spyOn(inner, 'rawRpcPost').mockResolvedValue({ ok: false, httpStatus: 500, error: { code: 'failed', message: 'retry' } })
    expect((await client.respondWaterfall('event', { kind: 'result', value: true })).ok).toBe(false)
    expect(inner.pendingInteractions.size).toBe(1)
    post.mockResolvedValue({ ok: true, httpStatus: 200, value: {} })
    await client.respondWaterfall('event', { kind: 'next' })
    expect(inner.pendingInteractions.size).toBe(1)
    const ack = deferred<RpcResult>()
    post.mockReturnValue(ack.promise)
    const response = client.respondWaterfall('event', { kind: 'result', value: true })
    expect(inner.pendingInteractions.size).toBe(1)
    ack.resolve({ ok: true, httpStatus: 200, value: {} })
    await response
    expect(inner.pendingInteractions.size).toBe(0)
  })

  it('cannot let an old acknowledgement delete a new-generation request with the same id', async () => {
    const { client, inner } = fixture()
    inner.remoteEventsClientId = 'old-client'
    inner.pendingInteractions.set('event', pending('event'))
    const ack = deferred<RpcResult>()
    vi.spyOn(inner, 'rawRpcPost').mockReturnValue(ack.promise)
    const response = client.respondWaterfall('event', { kind: 'result', value: true })
    client.stop()
    const current = pending('event')
    inner.pendingInteractions.set('event', current)
    ack.resolve({ ok: true, httpStatus: 200, value: {} })
    await response
    expect(inner.pendingInteractions.get('event')).toBe(current)
  })

  it('events ready alone never replays an old request', async () => {
    const { client, inner, cb } = fixture()
    inner.pendingInteractions.set('old', pending('old'))
    client.stop()
    vi.spyOn(inner, 'rawRpcPost').mockResolvedValue(success([]))
    vi.spyOn(client, 'openStream').mockImplementation(async function* () { yield { type: 'ready', clientId: 'new' } })
    await inner.pump02RemoteEvents(new AbortController().signal)
    expect(inner.pendingInteractions.size).toBe(0)
    expect(vi.mocked(cb.onRemoteEventFrame).mock.calls.filter(([, frame]) => frame.type === 'waterfall')).toEqual([])
  })
})

describe('real mux events-ready baseline ordering', () => {
  it('keeps startup stale until events ready + merged list, consumes inflight events, and starts after reconnect without deadlock', async () => {
    const connections: Array<{ socket: WebSocket; eventsId?: string }> = []
    let listCalls = 0
    let releaseBaseline: (() => void) | undefined
    const baselineRequested = deferred<void>()
    const server = createServer((req, res) => {
      req.resume()
      req.on('end', () => {
        if (req.url !== '/api/session/list') { res.writeHead(404); res.end(); return }
        listCalls += 1
        const send = () => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ result: { ok: true, value: { version: '0.2.0', items: [summary('s', { running: true })] } } })) }
        if (listCalls === 2) { releaseBaseline = send; baselineRequested.resolve() } else send()
      })
    })
    const wss = new WebSocketServer({ server })
    wss.on('connection', socket => {
      const connection: { socket: WebSocket; eventsId?: string } = { socket }
      connections.push(connection)
      socket.on('message', data => {
        const frame = JSON.parse(data.toString())
        if (frame.type !== 'open') return
        if (frame.endpoint === '$events') connection.eventsId = frame.streamId
        if (frame.endpoint === 'workspace/follow') socket.send(JSON.stringify({ type: 'item', streamId: frame.streamId,
          value: { type: 'baseline', value: { items: [], archivedSessionIds: [], pinnedSessionIds: [] } } }))
        if (frame.endpoint === 'session/control') socket.send(JSON.stringify({ type: 'item', streamId: frame.streamId,
          value: { type: 'baseline', value: { projections: {} } } }))
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    disposers.push(async () => {
      for (const connection of connections) connection.socket.terminate()
      await new Promise<void>(resolve => wss.close(() => resolve()))
      await new Promise<void>(resolve => server.close(() => resolve()))
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Missing test listener')
    const auth = new DeviceAuthManager()
    vi.spyOn(auth, 'ensureAuthenticated').mockResolvedValue({ ok: true })
    const cb = callbacks()
    const client = new RemoteDeviceClient(config(`http://127.0.0.1:${address.port}`), auth, cb)
    disposers.push(() => client.stop())
    client.start()
    await vi.waitFor(() => expect(connections[0]?.eventsId).toBeDefined())
    expect(client.connectionState).toBe('connecting')
    expect(client.catalogFresh).toBe(false)
    expect(listCalls).toBe(1)
    const emit = (index: number, value: unknown) => {
      const connection = connections[index]!
      connection.socket.send(JSON.stringify({ type: 'item', streamId: connection.eventsId, value }))
    }
    emit(0, { type: 'ready', clientId: 'first' })
    await baselineRequested.promise
    expect(client.catalogFresh).toBe(false)
    emit(0, { type: 'emit', event: 'api-session/status', args: ['s', false] })
    await vi.waitFor(() => expect(vi.mocked(cb.onRemoteEventFrame).mock.calls.some(([, frame]) => frame.type === 'emit' && frame.event === 'api-session/status')).toBe(true))
    releaseBaseline!()
    await vi.waitFor(() => expect(client.catalogFresh).toBe(true))
    expect(client.sessionSummaries()[0]?.running).toBe(false)
    emit(0, { type: 'waterfall', event: 'approval/request', eventId: 'old-event', agentId: 's', request: {} })
    await vi.waitFor(() => expect(client.pendingInteractionList()).toHaveLength(1))
    const generation = client.connectionGeneration
    client.reconnectNow()
    expect(client.pendingInteractionList()).toEqual([])
    expect(client.connectionGeneration).toBeGreaterThan(generation)
    await vi.waitFor(() => expect(connections[1]?.eventsId).toBeDefined())
    expect(client.catalogFresh).toBe(false)
    emit(1, { type: 'ready', clientId: 'second' })
    await vi.waitFor(() => expect(client.catalogFresh).toBe(true))
    expect(client.pendingInteractionList()).toEqual([])
    expect(vi.mocked(cb.onRemoteEventFrame).mock.calls.filter(([, frame]) => frame.type === 'waterfall')).toHaveLength(1)
    emit(1, { type: 'waterfall', event: 'approval/request', eventId: 'server-replay', agentId: 's', request: {} })
    await vi.waitFor(() => expect(client.pendingInteractionList().map(item => item.eventId)).toEqual(['server-replay']))
  })
})

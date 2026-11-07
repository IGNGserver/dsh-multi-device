import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { DeviceId, encodeRemoteSessionId } from '../src/contract.ts'
import { DeviceCatalog, parseSessionSummary, parseWorkspace } from '../src/host/device-catalog.ts'
import { RemoteDeviceClient, type RemoteDeviceCallbacks } from '../src/host/remote-client.ts'
import type { DeviceAuthManager } from '../src/host/auth.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const summary = (sessionId: string, running = false) => ({ sessionId, updatedAt: 1, agentAvailable: true, running, blank: false })
const workspace = (workspaceId = 'w') => ({ workspaceId, path: '/repo', title: 'repo', sessionIds: ['s'], createdAt: '', updatedAt: '' })
const passthrough = (_key: string, value: unknown) => value
const controlBaseline = (seq = 2, title = 'baseline') => ({ type: 'baseline', value: { projections: { s: { asOfSeq: seq, values: { title } } } } })
const workspaceBaseline = () => ({ type: 'baseline', value: { items: [workspace()] } })

describe('DeviceCatalog deterministic reducer', () => {
  it('single-flights a list and replays adds/removes/status/activity over its delayed snapshot', async () => {
    const catalog = new DeviceCatalog()
    const epoch = catalog.beginEpoch()
    const result = deferred<unknown>()
    const load = vi.fn(() => result.promise)
    const first = catalog.refreshSessions(epoch, load)
    const second = catalog.refreshSessions(epoch, load)
    expect(first).toBe(second)
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(1)
    catalog.applySessionEvent(epoch, 'api-session/added', [summary('new')])
    catalog.applySessionEvent(epoch, 'api-session/removed', ['deleted'])
    catalog.applySessionEvent(epoch, 'api-session/status', ['s', true])
    catalog.applySessionEvent(epoch, 'api-session/activity', ['s', 50])
    result.resolve({ items: [summary('s'), summary('deleted')] })
    await expect(first).resolves.toBe(true)
    expect(catalog.sessions).toEqual([summary('new'), { ...summary('s', true), updatedAt: 50 }])
    // A later refresh is a fresh flight, not a permanently cached promise.
    await catalog.refreshSessions(epoch, async () => ({ items: [summary('next')] }))
    expect(catalog.sessions.map(row => row.sessionId)).toEqual(['next'])
  })

  it('cleans failed flights and retries without losing existing facts', async () => {
    const catalog = new DeviceCatalog()
    const epoch = catalog.beginEpoch()
    await catalog.refreshSessions(epoch, async () => ({ items: [summary('s')] }))
    const failure = deferred<unknown>()
    const first = catalog.refreshSessions(epoch, () => failure.promise)
    const joined = catalog.refreshSessions(epoch, async () => ({ items: [] }))
    expect(joined).toBe(first)
    failure.reject(new Error('temporary failure'))
    await expect(first).rejects.toThrow('temporary failure')
    expect(catalog.sessions.map(row => row.sessionId)).toEqual(['s'])
    await catalog.refreshSessions(epoch, async () => ({ items: [summary('recovered')] }))
    expect(catalog.sessions.map(row => row.sessionId)).toEqual(['recovered'])
  })

  it('fences retired requests, streams and cleanup across reconnects', async () => {
    const catalog = new DeviceCatalog()
    const oldEpoch = catalog.beginEpoch()
    const old = deferred<unknown>()
    const first = catalog.refreshSessions(oldEpoch, () => old.promise)
    const epoch = catalog.beginEpoch()
    const next = deferred<unknown>()
    const second = catalog.refreshSessions(epoch, () => next.promise)
    old.resolve({ items: [summary('obsolete')] })
    await expect(first).resolves.toBe(false)
    expect(catalog.refreshSessions(epoch, async () => ({ items: [] }))).toBe(second)
    expect(catalog.applySessionEvent(oldEpoch, 'api-session/added', [summary('obsolete')])).toBe(false)
    expect(catalog.applyWorkspaceFrame(oldEpoch, workspaceBaseline())).toBe(false)
    expect(catalog.applyControlFrame(oldEpoch, controlBaseline(), passthrough)).toBeUndefined()
    catalog.markEventsReady(oldEpoch)
    next.resolve({ items: [summary('current')] })
    await second
    expect(catalog.sessions.map(row => row.sessionId)).toEqual(['current'])
    expect(catalog.ready).toBe(false)
  })

  it('requires events/list/workspace/control baselines and preserves offline facts without live claims', async () => {
    const catalog = new DeviceCatalog()
    const epoch = catalog.beginEpoch()
    await catalog.refreshSessions(epoch, async () => ({ items: [summary('s', true)] }))
    catalog.applyWorkspaceFrame(epoch, workspaceBaseline())
    catalog.applyControlFrame(epoch, controlBaseline(), passthrough)
    expect(catalog.markLive(epoch)).toBe(false)
    catalog.markEventsReady(epoch)
    expect(catalog.markLive(epoch)).toBe(true)
    expect(catalog.visibleSessions()[0]?.running).toBe(true)
    const syncedAt = catalog.syncedAt
    catalog.disconnect()
    expect(catalog.stale).toBe(true)
    expect(catalog.visibleSessions()[0]).toMatchObject({ running: false, agentAvailable: false })
    expect(catalog.sessions[0]?.running).toBe(true)
    expect(catalog.workspaces).toEqual([workspace()])
    expect(catalog.syncedAt).toBe(syncedAt)
    expect(catalog.controlProjections.size).toBe(0)
    expect(catalog.markLive(epoch)).toBe(false)
  })

  it('isolates malformed rows, raw identities and optional projection corruption', async () => {
    const catalog = new DeviceCatalog()
    const epoch = catalog.beginEpoch()
    const nested = encodeRemoteSessionId(DeviceId('other'), 's')
    await catalog.refreshSessions(epoch, async () => ({ items: [null, 3, {}, summary(nested),
      { ...summary('nan'), updatedAt: NaN }, { ...summary('truthy'), running: 'false' },
      { ...summary('parent'), parentSessionId: nested }, { ...summary('good'), projections: { values: null } }] }))
    expect(catalog.sessions).toEqual([summary('good')])
    expect(catalog.applySessionEvent(epoch, 'api-session/added', [{ sessionId: 'bad' }])).toBe(false)
    catalog.applyWorkspaceFrame(epoch, { type: 'baseline', value: { items: [null, {}, workspace(),
      { ...workspace('bad'), path: 12 }], archivedSessionIds: [null, nested, 's', 's'] } })
    expect(catalog.workspaces).toEqual([workspace()])
    expect(catalog.archivedIds).toEqual(['s'])
    expect(parseWorkspace(null)).toBeUndefined()
    expect(parseSessionSummary({ sessionId: 42 }, true)).toBeUndefined()
    await expect(catalog.refreshSessions(epoch, async () => ({ items: null }))).rejects.toThrow('baseline')
    expect(catalog.sessions).toEqual([summary('good')])
  })

  it('rejects old/duplicate projection frames and baselines including before the first baseline', () => {
    const catalog = new DeviceCatalog()
    const epoch = catalog.beginEpoch()
    const projection = (seq: number, value: unknown) => ({ type: 'projection', sessionId: 's', key: 'title', seq, value })
    expect(catalog.applyControlFrame(epoch, projection(5, 'new'), passthrough)).toHaveLength(1)
    catalog.applyControlFrame(epoch, controlBaseline(2, 'old'), passthrough)
    expect(catalog.applyControlFrame(epoch, projection(4, 'old'), passthrough)).toBeUndefined()
    expect(catalog.applyControlFrame(epoch, projection(5, 'duplicate'), passthrough)).toBeUndefined()
    expect(catalog.applyControlFrame(epoch, projection(NaN, 'bad'), passthrough)).toBeUndefined()
    expect(catalog.controlProjections.get('s')).toEqual({ asOfSeq: 5, values: { title: 'new' } })
    expect(catalog.applyControlFrame(epoch, { ...projection(5, 'model'), key: 'model' }, passthrough)).toHaveLength(1)
    catalog.applyControlFrame(epoch, projection(6, 'newer'), passthrough)
    catalog.applyControlFrame(epoch, controlBaseline(5, 'old'), passthrough)
    expect(catalog.controlProjections.get('s')?.values.title).toBe('newer')
  })

  it('mirrors live titles into directory facts without a cached list rewind', async () => {
    const catalog = new DeviceCatalog()
    const epoch = catalog.beginEpoch()
    await catalog.refreshSessions(epoch, async () => ({ items: [summary('s')] }))
    catalog.applyControlFrame(epoch, controlBaseline(5, 'renamed'), passthrough)
    expect(catalog.sessions[0]?.projections?.values.title).toBe('renamed')
    await catalog.refreshSessions(epoch, async () => ({ items: [{ ...summary('s'),
      projections: { kind: 'cached', asOfSeq: 100, values: { title: 'old cached' } } }] }))
    expect(catalog.sessions[0]?.projections?.values.title).toBe('renamed')
    catalog.applySessionEvent(epoch, 'api-session/added', [{ ...summary('s'),
      projections: { kind: 'cached', asOfSeq: 0, values: { title: 'older' } } }])
    expect(catalog.sessions[0]?.projections?.values.title).toBe('renamed')
    catalog.applyControlFrame(epoch, { type: 'projection', sessionId: 's', key: 'title', seq: 6, value: 'renamed again' }, passthrough)
    expect(catalog.sessions[0]?.projections?.values.title).toBe('renamed again')
    await catalog.refreshSessions(epoch, async () => ({ items: [{ ...summary('s'),
      projections: { kind: 'sequenced', asOfSeq: 9, values: { title: 'newer list' } } }] }))
    catalog.applyControlFrame(epoch, { type: 'projection', sessionId: 's', key: 'title', seq: 8, value: 'late stream' }, passthrough)
    expect(catalog.sessions[0]?.projections?.values.title).toBe('newer list')
  })

  it('keeps 0.1 normalization list-only without promoting live stream readiness', async () => {
    const catalog = new DeviceCatalog()
    const epoch = catalog.beginEpoch()
    await catalog.refreshSessions(epoch, async () => ({ items: [{ sessionId: 'legacy' }, null, { sessionId: 3 }] }), true)
    catalog.applyWorkspaceFrame(epoch, { type: 'baseline', value: { items: [{ workspaceId: 'w', path: '/repo' }] } }, true)
    expect(catalog.sessions).toEqual([{ ...summary('legacy'), updatedAt: 0, agentAvailable: false }])
    expect(catalog.ready).toBe(false)
    expect(catalog.markLive(epoch, true)).toBe(true)
  })
})

it('RemoteDeviceClient subscribes before baseline, journals deltas and waits for control readiness', async () => {
  const eventsOpened = deferred<(value: unknown) => void>()
  const controlOpened = deferred<(value: unknown) => void>()
  const workspaceOpened = deferred<(value: unknown) => void>()
  const baselineRequested = deferred<void>()
  const baselineResponse = deferred<unknown>()
  const connected = deferred<void>()
  const deltasObserved = deferred<void>()
  let lists = 0
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString())
    let value: unknown
    if (body.method === 'session/list') {
      lists += 1
      if (lists === 1) value = { version: '0.2.2', items: [summary('probe-only')] }
      else { baselineRequested.resolve(); value = await baselineResponse.promise }
    } else value = { version: '0.2.2' }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ result: { ok: true, value } }))
  })
  const wss = new WebSocketServer({ server, path: '/api/remote.mux' })
  wss.on('connection', socket => socket.on('message', raw => {
    const msg = JSON.parse(raw.toString())
    if (msg.type !== 'open') return
    const send = (value: unknown) => socket.send(JSON.stringify({ type: 'item', streamId: msg.streamId, value }))
    if (msg.endpoint === '$events') eventsOpened.resolve(send)
    if (msg.endpoint === 'workspace/follow') workspaceOpened.resolve(send)
    if (msg.endpoint === 'session/control') controlOpened.resolve(send)
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing listener')
  const callbacks: RemoteDeviceCallbacks = {
    onStateChanged: () => { if (client.isConnected()) connected.resolve() },
    onRemoteEventFrame: vi.fn((_id, frame) => {
      if (frame.type === 'emit' && frame.event === 'api-session/removed') deltasObserved.resolve()
    }), onControlProjectionFrame: vi.fn(), onWorkspacesChanged: vi.fn(),
    onGitRemotesDiscovered: vi.fn(), onModelCatalogChanged: vi.fn(),
  }
  const auth = { ensureAuthenticated: async () => ({ ok: true }), getAuthHeaders: () => ({}) } as unknown as DeviceAuthManager
  const client = new RemoteDeviceClient({ id: DeviceId('test'), name: 'test', enabled: true,
    transport: { kind: 'direct', baseUrl: `http://127.0.0.1:${address.port}` }, auth: { mode: 'none' } }, auth, callbacks)
  try {
    client.start()
    const [events, workspaces, control] = await Promise.all([eventsOpened.promise, workspaceOpened.promise, controlOpened.promise])
    expect(client.isConnected()).toBe(false)
    expect(client.sessionSummaries()).toEqual([]) // Probe never becomes authoritative.
    events({ type: 'ready', clientId: 'client-1' })
    await baselineRequested.promise
    workspaces(workspaceBaseline())
    events({ type: 'emit', event: 'api-session/added', args: [summary('new')] })
    events({ type: 'emit', event: 'api-session/removed', args: ['deleted'] })
    // Gate the baseline on observing the events rather than relying on wall-clock sleeps.
    await deltasObserved.promise
    const refreshA = client.refreshSessionCatalog()
    const refreshB = client.refreshSessionCatalog()
    baselineResponse.resolve({ items: [summary('s'), summary('deleted')] })
    await Promise.all([refreshA, refreshB])
    expect(lists).toBe(2)
    expect(client.isConnected()).toBe(false)
    control(controlBaseline())
    await connected.promise
    expect(client.sessionSummaries().map(row => row.sessionId)).toEqual(['new', 's'])
    expect(client.sessionSummaries().find(row => row.sessionId === 's')?.projections?.values.title).toBe('baseline')
    expect(client.toView()).toMatchObject({ state: 'connected', realtime: true })
  } finally {
    baselineResponse.resolve({ items: [] })
    client.stop()
    for (const socket of wss.clients) socket.terminate()
    await new Promise<void>(resolve => wss.close(() => resolve()))
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

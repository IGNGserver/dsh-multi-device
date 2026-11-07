import { once } from 'node:events'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { DeviceId } from '../src/contract.ts'
import { DeviceAuthManager } from '../src/host/auth.ts'
import { buildNativeBridgeScript, sanitizeReadCompletions } from '../src/host/native-bridge.ts'
import { NativeProxyManager, type NativeProxyHooks } from '../src/host/native-proxy.ts'

type Message = { type: string; sessionId?: string; requestId?: string; completionId?: string; [key: string]: unknown }
const cleanup: (() => void)[] = []
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close() })

async function proxyFor(hooks: NativeProxyHooks = {}) {
  const id = DeviceId('read-ack-device')
  const device = { id, name: 'ACK', enabled: true, transport: { kind: 'direct' as const, baseUrl: 'http://127.0.0.1:1' }, auth: { mode: 'none' as const } }
  const manager = new NativeProxyManager(new DeviceAuthManager(), undefined, hooks)
  cleanup.push(() => manager.dispose())
  const url = (await manager.ensureProxy(device, () => device.transport.baseUrl))!
  const origin = new URL(url).origin
  const response = await fetch(url, { redirect: 'manual' })
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!
  const connect = async () => {
    const ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/__md/bridge?client=same-client`, { headers: { cookie } })
    cleanup.push(() => ws.terminate())
    const messages: Message[] = []
    ws.on('message', raw => messages.push(JSON.parse(raw.toString()) as Message))
    await once(ws, 'open')
    const send = (message: unknown) => ws.send(JSON.stringify(message))
    send({ type: 'ready' })
    await vi.waitFor(() => expect(messages.some(message => message.type === 'read-state')).toBe(true))
    return { ws, messages, send }
  }
  return { id, manager, connect, origin, cookie }
}

function bridgeVm(initial?: { unread?: string[]; readCompletions?: Record<string, string> }) {
  let now = 1000
  let timerId = 0
  let selected: string | null = null
  let hidden = false
  const timers = new Map<number, { at: number; run: () => void }>()
  const windowListeners = new Map<string, (event: unknown) => void>()
  const documentListeners = new Map<string, () => void>()
  const selectionListeners: (() => void)[] = []
  class FakeDate extends Date { static override now() { return now } }
  class Socket {
    static instances: Socket[] = []
    readyState = 1
    failSend = false
    sent: Message[] = []
    listeners = new Map<string, (event: unknown) => void>()
    constructor() { Socket.instances.push(this) }
    send(raw: string) { if (this.failSend) throw new Error('send failed'); this.sent.push(JSON.parse(raw) as Message) }
    addEventListener(type: string, listener: (event: unknown) => void) { this.listeners.set(type, listener) }
    emit(type: string, value: unknown = {}) { this.listeners.get(type)?.(value) }
    receive(message: unknown) { this.emit('message', { data: JSON.stringify(message) }) }
    close() { this.readyState = 3; this.emit('close') }
    reads() { return this.sent.filter(message => message.type === 'read') }
  }
  const status = {
    getSnapshot: () => new Map(['s', 'other'].map(id => [id, { running: false, completionUnread: false }])),
    subscribe: () => () => {},
  }
  const sandbox: Record<string, unknown> = {
    document: {
      currentScript: { src: 'http://127.0.0.1:1/__md/bridge.js?device=dev' },
      documentElement: {}, querySelector: () => null,
      get visibilityState() { return hidden ? 'hidden' : 'visible' },
      addEventListener: (type: string, listener: () => void) => documentListeners.set(type, listener),
    },
    location: { protocol: 'http:', host: '127.0.0.1:1' },
    addEventListener: (type: string, listener: (event: unknown) => void) => windowListeners.set(type, listener),
    WebSocket: Socket, URL, URLSearchParams, Date: FakeDate,
    setTimeout: (run: () => void, delay: number) => { const id = ++timerId; timers.set(id, { at: now + delay, run }); return id },
    clearTimeout: (id: number) => timers.delete(id),
  }
  sandbox.window = sandbox
  runInNewContext(buildNativeBridgeScript(initial), sandbox, { timeout: 2000 })
  let registration: { factory: () => { apply: (context: unknown) => void } } | undefined
  const loader = { load: (record: typeof registration) => { registration = record } }
  sandbox.__ModuleLoader__ = loader
  loader.load({ id: '@deepseek-ai/dsh-client-ui-workspace', factory: () => ({ apply: () => {} }) } as typeof registration)
  registration!.factory().apply({
    uiWorkspace: {
      selection: { getSnapshot: () => ({ sessionId: selected }), subscribe: (listener: () => void) => { selectionListeners.push(listener); return () => {} } },
      openSession: (id: string) => { selected = id },
    },
    uiSession: { sessionStatus: status },
    sessions: {
      list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} },
      // Official 0.2.1-rc.5 readiness requires borrowed Session bindings;
      // READ/ACK still follows selection and visibility, not history loading.
      binding: (sessionId: string) => ({ session: {
        getSnapshot: () => ({ sessionId, openState: 'open', openError: null }),
        subscribe: (_listener: () => void) => () => {},
      } }),
    },
  })
  const tick = (ms: number) => {
    const end = now + ms
    let count = 0
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      if (++count > 10000) throw new Error('timer loop')
      now = next[1].at; timers.delete(next[0]); next[1].run()
    }
    now = end
  }
  return {
    Socket, status, tick,
    get socket() { return Socket.instances.at(-1)! },
    select(id: string | null) { selected = id; selectionListeners.forEach(listener => listener()) },
    visibility(visible: boolean) { hidden = !visible; documentListeners.get('visibilitychange')?.() },
    parentVisibility(visible: boolean) { windowListeners.get('message')?.({ data: { __dshMdVisibility: true, visible } }) },
    unread(id = 's') { return status.getSnapshot().get(id)?.completionUnread },
    state(ids: string[], tokens?: Record<string, string>) { this.socket.receive({ type: 'read-state', unreadSessionIds: ids, ...(tokens === undefined ? {} : { readCompletions: tokens }) }) },
  }
}

function ack(read: Message, values: Record<string, unknown> = {}) {
  return { ...read, type: 'read-ack', accepted: true, unread: false, ...values }
}

describe('native read token and Host-acceptance ACK protocol', () => {
  it('initializes token state, broadcasts token-only changes, and ACKs only the originating socket after a synchronous state bump', async () => {
    let current = 'one'
    const onRead = vi.fn((_device: string, sessionId: string, expected?: string) => {
      target.manager.setUnreadState(target.id, [], { s: current })
      return { accepted: expected === current, currentCompletionId: current, unread: expected !== current }
    })
    const target = await proxyFor({ getUnreadState: () => ['s'], getReadCompletions: () => ({ s: current }), onBridgeRead: onRead })
    const a = await target.connect()
    const b = await target.connect()
    expect(a.messages).toContainEqual({ type: 'read-state', unreadSessionIds: ['s'], readCompletions: { s: 'one' } })
    const script = await fetch(`${target.origin}/__md/bridge.js`, { headers: { cookie: target.cookie } })
    expect(await script.text()).toContain('window.__DSH_MD_READ_COMPLETIONS__ = {"s":"one"}')
    current = 'two'
    target.manager.setUnreadState(target.id, ['s'], { s: current })
    await vi.waitFor(() => expect(b.messages).toContainEqual({ type: 'read-state', unreadSessionIds: ['s'], readCompletions: { s: 'two' } }))
    a.send({ type: 'read', sessionId: 's', completionId: 'one', requestId: 'r' })
    await vi.waitFor(() => expect(a.messages).toContainEqual({ type: 'read-ack', sessionId: 's', completionId: 'one', requestId: 'r', accepted: false, currentCompletionId: 'two', unread: true }))
    expect(onRead).toHaveBeenCalledWith(target.id, 's', 'one')
    expect(b.messages.some(message => message.type === 'read-ack')).toBe(false)
    expect(a.messages.at(-2)?.type).toBe('read-state')
  })

  it('ACKs old tokenless messages and legacy void hooks without claiming disk persistence', async () => {
    const onRead = vi.fn(() => {})
    const target = await proxyFor({ onBridgeRead: onRead })
    const page = await target.connect()
    page.send({ type: 'read', sessionId: 's' })
    await vi.waitFor(() => expect(page.messages).toContainEqual({ type: 'read-ack', sessionId: 's', accepted: true, unread: false }))
    expect(onRead).toHaveBeenCalledWith(target.id, 's', undefined)
    expect(page.messages).toContainEqual({ type: 'read-state', unreadSessionIds: [] })
  })

  it('rejects thrown hooks and never downgrades malformed completion tokens to a legacy read', async () => {
    const onRead = vi.fn(() => { throw new Error('Host unavailable') })
    const target = await proxyFor({ onBridgeRead: onRead, getUnreadState: () => ['s'], getReadCompletions: () => ({ s: 'two' }) })
    const page = await target.connect()
    for (const completionId of ['', 42, 'x'.repeat(513)]) page.send({ type: 'read', sessionId: 's', completionId })
    page.send({ type: 'read', sessionId: 's', completionId: 'one', requestId: 'retry' })
    await vi.waitFor(() => expect(page.messages).toContainEqual({ type: 'read-ack', sessionId: 's', completionId: 'one', requestId: 'retry', accepted: false, currentCompletionId: 'two', unread: true }))
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('retains successful and failed sends until a matching ACK and retries with bounded backoff', () => {
    const page = bridgeVm()
    page.select('s')
    page.socket.failSend = true
    page.state(['s'], { s: 'one' })
    expect(page.unread()).toBe(false)
    page.socket.failSend = false
    page.tick(999)
    expect(page.socket.reads()).toHaveLength(0)
    page.tick(1)
    const read = page.socket.reads()[0]!
    expect(read).toMatchObject({ sessionId: 's', completionId: 'one', requestId: expect.any(String) })
    page.tick(1999)
    expect(page.socket.reads()).toHaveLength(1)
    page.tick(1)
    expect(page.socket.reads()).toEqual([read, read])
    page.socket.receive(ack(read, { requestId: 'wrong' }))
    page.tick(4000)
    expect(page.socket.reads()).toHaveLength(3)
    page.socket.receive(ack(read))
    page.socket.receive(ack(read))
    page.tick(60000)
    expect(page.socket.reads()).toHaveLength(3)
  })

  it('waits for fresh read-state before reconnect replay, even after a prior read-state cleared the overlay', () => {
    const page = bridgeVm()
    page.select('s'); page.state(['s'], { s: 'one' })
    const read = page.socket.reads()[0]!
    page.state([], { s: 'one' }) // Host bump may precede ACK; cannot discard pending.
    page.socket.close(); page.tick(1200)
    expect(page.Socket.instances).toHaveLength(2)
    page.socket.emit('open')
    page.tick(5000)
    expect(page.socket.reads()).toHaveLength(0)
    page.state([], { s: 'one' })
    expect(page.socket.reads()).toEqual([read])
    page.socket.receive(ack(read, { currentCompletionId: 'one' }))
    page.tick(60000)
    expect(page.socket.reads()).toHaveLength(1)
  })

  it('does not consume a newer completion while hidden or let late ACKs erase it', () => {
    const page = bridgeVm()
    page.select('s'); page.state(['s'], { s: 'one' })
    const oldRead = page.socket.reads()[0]!
    page.visibility(false)
    page.state(['s'], { s: 'two' })
    page.socket.receive(ack(oldRead, { currentCompletionId: 'one' }))
    page.socket.receive(ack(oldRead, { currentCompletionId: 'two', unread: true }))
    page.tick(30000)
    expect(page.unread()).toBe(true)
    expect(page.socket.reads()).toHaveLength(1)
    page.visibility(true)
    expect(page.socket.reads().at(-1)).toMatchObject({ completionId: 'two' })
    expect(page.unread()).toBe(false)
  })

  it('handles synchronous read-state-before-ACK and stale rejection without clearing the next token', () => {
    const page = bridgeVm()
    page.select('s'); page.state(['s'], { s: 'one' })
    const oldRead = page.socket.reads()[0]!
    page.parentVisibility(false)
    page.state(['s'], { s: 'two' })
    page.socket.receive(ack(oldRead, { accepted: false, currentCompletionId: 'two', unread: true }))
    page.tick(10000)
    expect(page.unread()).toBe(true)
    expect(page.socket.reads()).toHaveLength(1)
    page.parentVisibility(true)
    const newRead = page.socket.reads().at(-1)!
    expect(newRead.completionId).toBe('two')
    page.state([], { s: 'two' })
    page.socket.receive(ack(newRead, { currentCompletionId: 'two' }))
    page.tick(60000)
    expect(page.socket.reads()).toHaveLength(2)
  })

  it('supports legacy read-state and old ACK-less Hosts without consuming hidden reminders on retry', () => {
    const page = bridgeVm({ unread: ['other'] })
    page.select('s'); page.state(['s'])
    expect(page.socket.reads()[0]).toMatchObject({ sessionId: 's', requestId: expect.any(String) })
    expect(page.socket.reads()[0]).not.toHaveProperty('completionId')
    page.visibility(false); page.state(['s'])
    page.tick(60000)
    expect(page.socket.reads()).toHaveLength(1)
    expect(page.unread()).toBe(true)
    page.visibility(true)
    expect(page.unread()).toBe(false)
    expect(page.socket.reads()).toHaveLength(2)
  })

  it('keeps tokenless pending reads from clearing token-aware state after an upgrade', () => {
    const page = bridgeVm()
    page.select('s'); page.state(['s'])
    const oldRead = page.socket.reads()[0]!
    page.visibility(false); page.state(['s'], { s: 'two' })
    page.tick(60000)
    expect(page.socket.reads()).toHaveLength(1)
    page.socket.receive(ack(oldRead))
    expect(page.unread()).toBe(true)
    page.visibility(true)
    expect(page.socket.reads().at(-1)?.completionId).toBe('two')
  })

  it('keeps rejected reads pending until accepted and does not use a tokenless fallback for incomplete token state', () => {
    const page = bridgeVm()
    page.select('s'); page.state(['s'], {})
    expect(page.unread()).toBe(true)
    expect(page.socket.reads()).toHaveLength(0)
    page.state(['s'], { s: 'one' })
    const read = page.socket.reads()[0]!
    page.socket.receive(ack(read, { accepted: false, currentCompletionId: 'one', unread: true }))
    page.tick(1000)
    expect(page.socket.reads()).toEqual([read, read])
    page.socket.receive(ack(read, { currentCompletionId: 'one' }))
    page.tick(60000)
    expect(page.socket.reads()).toHaveLength(2)
  })

  it('bounds pending reads without evicting unacknowledged tokens or clearing unsent overlays', () => {
    const page = bridgeVm()
    page.select('s')
    for (let i = 0; i < 257; i++) page.state(['s'], { s: `token-${i}` })
    const reads = page.socket.reads()
    expect(reads).toHaveLength(256)
    expect(page.unread()).toBe(true)
    page.socket.receive(ack(reads[0]!, { currentCompletionId: 'token-0' }))
    expect(page.socket.reads()).toHaveLength(257)
    expect(page.socket.reads().at(-1)?.completionId).toBe('token-256')
    expect(page.unread()).toBe(false)
  })

  it('releases deleted completion ACKs from a full queue without consuming a newer hidden completion', () => {
    const page = bridgeVm()
    page.select('s')
    for (let i = 0; i < 256; i++) page.state(['s'], { s: `token-${i}` })
    const reads = page.socket.reads()
    page.visibility(false)
    page.state(['s'], { s: 'new-completion' })
    const deleted = ack(reads[0]!, { accepted: false, unread: false })
    page.socket.receive(deleted)
    page.socket.receive(deleted)
    expect(page.unread()).toBe(true)
    expect(page.socket.reads()).toHaveLength(256)
    page.visibility(true)
    expect(page.socket.reads()).toHaveLength(257)
    expect(page.socket.reads().at(-1)?.completionId).toBe('new-completion')
    expect(page.unread()).toBe(false)
  })

  it('retires ACK-less legacy reads from authoritative absence and preserves later hidden reminders', () => {
    const page = bridgeVm()
    for (let i = 0; i < 256; i++) {
      page.select(`legacy-${i}`)
      page.state([`legacy-${i}`])
      // Explicitly no ACK: only the fresh legacy Host state confirms absence.
      page.state([])
    }
    page.select('s')
    page.visibility(false)
    page.state(['s'])
    expect(page.unread()).toBe(true)
    expect(page.socket.reads()).toHaveLength(256)
    page.visibility(true)
    const read = page.socket.reads().at(-1)!
    expect(read.sessionId).toBe('s')
    expect(page.socket.reads()).toHaveLength(257)
    page.visibility(false)
    page.state([])
    page.state(['s'])
    page.socket.receive(ack(read)) // retired request cannot erase the new reminder
    page.tick(60000)
    expect(page.unread()).toBe(true)
    expect(page.socket.reads()).toHaveLength(257)
    page.visibility(true)
    expect(page.socket.reads()).toHaveLength(258)
    expect(page.socket.reads().at(-1)?.requestId).not.toBe(read.requestId)
  })

  it('bounds and safely serializes the injected completion map', () => {
    const value = Object.fromEntries(Array.from({ length: 2100 }, (_, i) => [`s${i}`, `token${i}`]))
    expect(Object.keys(sanitizeReadCompletions(value))).toHaveLength(2000)
    expect(buildNativeBridgeScript({ readCompletions: { s: '</script>\u2028' } })).not.toContain('</script>')
    expect(buildNativeBridgeScript()).not.toContain('window.__DSH_MD_READ_COMPLETIONS__ =')
  })
})

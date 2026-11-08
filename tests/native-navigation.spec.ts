import { EventEmitter } from 'node:events'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceId, type DeviceConfig } from '../src/contract.ts'
import { DeviceAuthManager } from '../src/host/auth.ts'
import { NATIVE_BRIDGE_SCRIPT } from '../src/host/native-bridge.ts'
import { NativeDeviceProxy, NativeProxyManager, type NativeBridgeNavigation } from '../src/host/native-proxy.ts'

function observable<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  const allListeners: (() => void)[] = []
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      allListeners.push(listener)
      return () => { listeners.delete(listener) }
    },
    set: (next: T) => { value = next; for (const listener of [...listeners]) listener() },
    listeners, allListeners,
  }
}
type Snapshot = { sessionId: string; openState: string; openError?: unknown }
function harness(options: { known?: boolean; binding?: boolean; publishOnRefresh?: boolean; refresh?: () => Promise<void> } = {}) {
  const messages: Record<string, unknown>[] = []
  const sockets: Socket[] = []
  class Socket extends EventEmitter {
    readyState = 1
    constructor(_url: string) { super(); sockets.push(this) }
    addEventListener(event: string, handler: (...args: any[]) => void): void { this.on(event, handler) }
    send(data: string): void { messages.push(JSON.parse(data)) }
    close(): void { this.readyState = 3; this.emit('close') }
    command(sessionId: string, requestSeq: number): void {
      this.emit('message', { data: JSON.stringify({ type: 'open-session', sessionId, requestSeq }) })
    }
  }
  const selection = observable<{ sessionId?: string }>({})
  const list = observable({ byId: options.known === false ? {} : { a: {}, b: {} } })
  const faces = new Map<string, ReturnType<typeof observable<Snapshot>>>()
  for (const id of ['a', 'b']) faces.set(id, observable<Snapshot>({ sessionId: id, openState: 'loading' }))
  const openSession = vi.fn((id: string) => { selection.set({ sessionId: id }) })
  const context = {
    uiWorkspace: { selection, openSession },
    sessions: {
      list, refresh: async () => { await (options.refresh?.() ?? Promise.resolve()); if (options.publishOnRefresh !== false) list.set({ byId: { a: {}, b: {} } }) },
      ...(options.binding === false ? {} : { binding: (id: string) => ({ session: faces.get(id) }) }),
    },
  }
  const window: Record<string, any> = {}
  runInNewContext(NATIVE_BRIDGE_SCRIPT, {
    window, document: { currentScript: { src: 'http://remote/__md/bridge.js?device=test' } },
    location: { protocol: 'http:', host: 'remote', search: '?md_client=browser' },
    WebSocket: Socket, URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval,
  })
  let registration: any
  window.__ModuleLoader__ = { load: (record: unknown) => { registration = record } }
  window.__ModuleLoader__.load({ id: '@deepseek-ai/dsh-client-ui-workspace', factory: () => ({ apply: () => {} }) })
  registration.factory().apply(context)
  sockets[0]!.emit('open')
  const navigation = () => messages.filter(m => m.type === 'navigation')
  return { messages, sockets, faces, openSession, selection, navigation, list }
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('native history navigation acknowledgements (official 0.2.1-rc.5 contract)', () => {
  it('does not acknowledge selection until the Session snapshot is open, including empty history', () => {
    vi.useFakeTimers()
    const h = harness()
    h.sockets[0]!.command('a', 7)
    expect(h.selection.getSnapshot()).toEqual({ sessionId: 'a' })
    expect(h.navigation()).toEqual([{ type: 'navigation', sessionId: 'a', requestSeq: 7, openState: 'loading' }])
    h.faces.get('a')!.set({ sessionId: 'a', openState: 'open' })
    expect(h.navigation().at(-1)).toEqual({ type: 'navigation', sessionId: 'a', requestSeq: 7, openState: 'open' })
    expect(h.faces.get('a')!.listeners.size).toBe(0)
    vi.advanceTimersByTime(16000)
    expect(h.navigation()).toHaveLength(2)
  })

  it('ignores stale refresh completions, stale subscribers and out-of-order requests during fast switching', async () => {
    vi.useFakeTimers()
    let finish!: () => void
    const refresh = new Promise<void>(resolve => { finish = resolve })
    const h = harness({ known: false, refresh: () => refresh })
    h.sockets[0]!.command('a', 1)
    h.sockets[0]!.command('b', 2)
    finish()
    await refresh
    await Promise.resolve()
    await Promise.resolve()
    expect(h.openSession.mock.calls).toEqual([['b']])
    h.sockets[0]!.command('a', 1)
    const stale = h.faces.get('b')!.allListeners[0]!
    h.sockets[0]!.command('a', 3)
    await Promise.resolve()
    h.faces.get('b')!.set({ sessionId: 'b', openState: 'open' })
    stale()
    expect(h.navigation().filter(m => m.openState === 'open')).toEqual([])
    h.faces.get('a')!.set({ sessionId: 'a', openState: 'open' })
    expect(h.navigation().at(-1)).toMatchObject({ sessionId: 'a', requestSeq: 3, openState: 'open' })
  })

  it('waits for a published directory after an old-generation refresh resolves without installing rows', async () => {
    vi.useFakeTimers()
    const h = harness({ known: false, publishOnRefresh: false })
    h.sockets[0]!.command('a', 1)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    vi.advanceTimersByTime(100)
    expect(h.openSession).not.toHaveBeenCalled()
    expect(h.navigation().at(-1)).toMatchObject({ openState: 'loading' })
    h.list.set({ byId: { a: {}, b: {} } })
    vi.advanceTimersByTime(50)
    expect(h.openSession).toHaveBeenCalledWith('a')
    h.faces.get('a')!.set({ sessionId: 'a', openState: 'open' })
    expect(h.navigation().at(-1)).toMatchObject({ openState: 'open' })
  })

  it('reports history errors and times out while selection alone looks successful', () => {
    vi.useFakeTimers()
    const h = harness()
    h.sockets[0]!.command('a', 1)
    h.faces.get('a')!.set({ sessionId: 'a', openState: 'error', openError: { code: 'history/failed', message: 'cannot read' } })
    expect(h.navigation().at(-1)).toMatchObject({ openState: 'error', error: 'history/failed: cannot read' })
    h.sockets[0]!.command('b', 2)
    vi.advanceTimersByTime(15000)
    expect(h.navigation().at(-1)).toMatchObject({ sessionId: 'b', requestSeq: 2, openState: 'error', error: expect.stringContaining('Timed out') })
    expect(h.faces.get('b')!.listeners.size).toBe(0)
  })

  it('rebinds replaced Session generations and ignores disposed generation callbacks', () => {
    vi.useFakeTimers()
    const h = harness()
    h.sockets[0]!.command('a', 1)
    const old = h.faces.get('a')!
    const next = observable<Snapshot>({ sessionId: 'a', openState: 'loading' })
    h.faces.set('a', next)
    vi.advanceTimersByTime(50)
    old.set({ sessionId: 'a', openState: 'open' })
    old.allListeners[0]!()
    expect(h.navigation()).toHaveLength(1)
    next.set({ sessionId: 'a', openState: 'open' })
    expect(h.navigation().at(-1)).toMatchObject({ openState: 'open' })
    expect(old.listeners.size).toBe(0)
  })

  it('isolates disconnected socket callbacks and accepts replay on a new socket generation', () => {
    vi.useFakeTimers()
    const h = harness()
    h.sockets[0]!.command('a', 8)
    const stale = h.faces.get('a')!.allListeners[0]!
    h.sockets[0]!.close()
    vi.advanceTimersByTime(1200)
    const next = h.sockets[1]!
    next.emit('open')
    next.command('b', 8)
    h.sockets[0]!.command('a', 99)
    h.sockets[0]!.emit('close')
    stale()
    h.faces.get('b')!.set({ sessionId: 'b', openState: 'open' })
    expect(h.openSession.mock.calls).toEqual([['a'], ['b']])
    expect(h.navigation().at(-1)).toMatchObject({ sessionId: 'b', requestSeq: 8, openState: 'open' })
  })

  it('explicitly rejects an incompatible remote instead of trusting its selection', () => {
    vi.useFakeTimers()
    const h = harness({ binding: false })
    expect(h.messages).toContainEqual({ type: 'failed', error: expect.stringContaining('Incompatible DSH version') })
    h.sockets[0]!.command('a', 1)
    expect(h.navigation().at(-1)).toMatchObject({ openState: 'error', error: expect.stringContaining('0.2.1-rc.5') })
    expect(h.openSession).not.toHaveBeenCalled()
  })
})

class ProxySocket extends EventEmitter {
  readyState = 1
  commands: Record<string, unknown>[] = []
  send(raw: string): void { this.commands.push(JSON.parse(raw)) }
  message(value: unknown): void { this.emit('message', Buffer.from(JSON.stringify(value))) }
  terminate(): void { this.emit('close') }
}
const device: DeviceConfig = {
  id: DeviceId('navigation'), name: 'navigation', enabled: true,
  transport: { kind: 'direct', baseUrl: 'http://remote' }, auth: { mode: 'none' },
}
function proxyHarness() {
  const onBridgeNavigation = vi.fn()
  const proxy = new NativeDeviceProxy(device, () => 'http://remote', new DeviceAuthManager(), undefined, { onBridgeNavigation })
  const attach = (clientId: string) => {
    const socket = new ProxySocket()
    ;(proxy as any).attachBridge(socket, clientId)
    socket.message({ type: 'ready' })
    return socket
  }
  return { proxy, attach, onBridgeNavigation }
}
function ack(sessionId: string, requestSeq: number, openState: NativeBridgeNavigation['openState'] = 'open') {
  return { type: 'navigation', sessionId, requestSeq, openState }
}

describe('native proxy navigation ownership', () => {
  it('gates acknowledgements by client, latest request and container/socket generation; selection is not success', () => {
    const { proxy, attach, onBridgeNavigation } = proxyHarness()
    try {
      const old = attach('a')
      const other = attach('b')
      proxy.openSession('one', 'a', 1)
      proxy.openSession('two', 'a', 2)
      old.message({ type: 'selection', sessionId: 'two' })
      old.message(ack('one', 1))
      old.message(ack('two', 1))
      other.message(ack('two', 2))
      expect(onBridgeNavigation).not.toHaveBeenCalled()
      const current = attach('a')
      old.message(ack('two', 2))
      expect(onBridgeNavigation).not.toHaveBeenCalled()
      current.message(ack('two', 2, 'loading'))
      current.message(ack('two', 2))
      expect(onBridgeNavigation).toHaveBeenLastCalledWith(device.id, { sessionId: 'two', requestSeq: 2, openState: 'open' }, 'a')
      const count = old.commands.length
      proxy.openSession('three', 'a', 3)
      expect(old.commands).toHaveLength(count)
      expect(current.commands.at(-1)).toEqual({ type: 'open-session', sessionId: 'three', requestSeq: 3 })
    } finally { proxy.stop() }
  })

  it('replays pending navigation with its original sequence on reconnect and supports legacy callers', () => {
    const { proxy, attach, onBridgeNavigation } = proxyHarness()
    try {
      proxy.openSession('target', 'a', 42)
      const first = attach('a')
      expect(first.commands.at(-1)).toEqual({ type: 'open-session', sessionId: 'target', requestSeq: 42 })
      first.terminate()
      const second = attach('a')
      expect(second.commands.at(-1)).toEqual({ type: 'open-session', sessionId: 'target', requestSeq: 42 })
      second.message(ack('target', 42))
      expect(onBridgeNavigation).toHaveBeenCalledTimes(1)
      proxy.openSession('legacy')
      const legacy = attach('legacy')
      expect(legacy.commands.at(-1)).toEqual({ type: 'open-session', sessionId: 'legacy' })
      legacy.message(ack('legacy', 1))
      expect(onBridgeNavigation).toHaveBeenCalledTimes(2)
      proxy.clearPendingSession('a')
      second.message(ack('target', 42))
      expect(onBridgeNavigation).toHaveBeenCalledTimes(2)
    } finally { proxy.stop() }
  })

})

import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { DeviceId, type DeviceConfig } from '../src/contract.ts'
import { DeviceAuthManager } from '../src/host/auth.ts'
import { NATIVE_BRIDGE_SCRIPT } from '../src/host/native-bridge.ts'
import { NativeDeviceProxy, NativeProxyManager, type NativeProxyHooks } from '../src/host/native-proxy.ts'

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function upstream(): Promise<{ server: Server; base: string; requests: string[] }> {
  const requests: string[] = []
  const server = createServer((req, res) => {
    requests.push(req.url ?? '')
    res.writeHead(200, {
      'content-type': 'text/html',
      ...(req.url?.startsWith('/unsupported') ? { 'content-encoding': 'unsupported' } : {}),
    })
    res.end('<html><head><title>Remote</title></head><body>OK</body></html>')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  cleanup.push(() => new Promise<void>(resolve => {
    server.closeAllConnections()
    server.close(() => resolve())
  }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing upstream port')
  return { server, base: `http://127.0.0.1:${address.port}`, requests }
}

function device(base: string, id = 'native-isolation'): DeviceConfig {
  return {
    id: DeviceId(id), name: id, enabled: true,
    transport: { kind: 'direct', baseUrl: base }, auth: { mode: 'none' },
  }
}

async function proxyFor(base: string, hooks: NativeProxyHooks = {}) {
  const proxy = new NativeDeviceProxy(device(base), () => base, new DeviceAuthManager(),
    () => 'http://127.0.0.1:3080', hooks)
  await proxy.start()
  cleanup.push(() => proxy.stop())
  const url = proxy.proxyUrl()!
  const response = await fetch(url, { redirect: 'manual' })
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!
  return { proxy, url, origin: new URL(url).origin, cookie }
}

type Command = { type: string; sessionId?: string; enabled?: boolean; groups?: Record<string, boolean>; unreadSessionIds?: string[] }
async function bridge(origin: string, cookie: string, clientId?: string) {
  const commands: Command[] = []
  const query = clientId === undefined ? '' : `?client=${encodeURIComponent(clientId)}`
  const ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/__md/bridge${query}`, { headers: { cookie } })
  cleanup.push(() => { ws.terminate() })
  ws.on('message', raw => commands.push(JSON.parse(raw.toString()) as Command))
  await once(ws, 'open')
  const send = (value: unknown): void => { ws.send(JSON.stringify(value)) }
  const ready = async (): Promise<void> => {
    const count = commands.filter(x => x.type === 'read-state').length
    send({ type: 'ready' })
    await vi.waitFor(() => expect(commands.filter(x => x.type === 'read-state')).toHaveLength(count + 1))
  }
  return { ws, commands, send, ready }
}

describe('native proxy browser isolation', () => {
  it('uses independent cookie names so one shared loopback cookie jar authenticates both proxies', async () => {
    const remote = await upstream()
    const a = await proxyFor(remote.base)
    const b = await proxyFor(remote.base)
    expect(a.cookie.split('=')[0]).toMatch(/^dsh-md-native-[a-f0-9]+$/)
    expect(a.cookie.split('=')[0]).not.toBe(b.cookie.split('=')[0])
    const cookieJar = `${a.cookie}; ${b.cookie}`
    for (const target of [a, b]) {
      const page = await fetch(`${target.origin}/`, { headers: { cookie: cookieJar } })
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('OK')
    }
    const denied = await fetch(`${a.origin}/`, { headers: { cookie: b.cookie } })
    expect(denied.status).toBe(403)
  })

  it('applies the WS Origin allowlist to authenticated HTTP and bootstrap before upstream side effects', async () => {
    const remote = await upstream()
    const target = await proxyFor(remote.base)
    for (const method of ['GET', 'POST', 'OPTIONS']) {
      const rejected = await fetch(`${target.origin}/api/mutate`, {
        method, headers: { cookie: target.cookie, origin: 'http://evil.invalid' },
      })
      expect(rejected.status).toBe(403)
    }
    const bootstrap = await fetch(target.url, { redirect: 'manual', headers: { origin: 'http://evil.invalid' } })
    expect(bootstrap.status).toBe(403)
    expect(bootstrap.headers.get('set-cookie')).toBeNull()
    expect(remote.requests).toEqual([])
    for (const origin of [undefined, target.origin, 'http://localhost:3080']) {
      const response = await fetch(`${target.origin}/api/ok`, {
        headers: { cookie: target.cookie, ...(origin === undefined ? {} : { origin }) },
      })
      expect(response.status).toBe(200)
    }
  })

  it('partitions pending navigation, embedded mode, ready initialization, hooks and disconnect state', async () => {
    const remote = await upstream()
    const hooks = {
      onBridgeState: vi.fn(), onBridgeSelection: vi.fn(),
      onBridgeTitle: vi.fn(), onBridgeVisibility: vi.fn(),
    }
    const { proxy, origin, cookie } = await proxyFor(remote.base, hooks)
    proxy.openSession('session-a', 'client-a')
    proxy.setEmbedded(true, 'client-a')
    proxy.openSession('session-b', 'client-b')
    proxy.openSession('legacy-session')
    const a = await bridge(origin, cookie, 'client-a')
    await a.ready()
    expect(a.commands).toContainEqual({ type: 'open-session', sessionId: 'session-a' })
    expect(a.commands).toContainEqual({ type: 'set-embedded', enabled: true })
    a.send({ type: 'selection', sessionId: 'selection-a' })
    a.send({ type: 'title', title: 'Title A' })
    a.send({ type: 'visibility', visible: true })
    await vi.waitFor(() => expect(proxy.bridgeSnapshot('client-a')).toEqual({
      state: 'ready', sessionId: 'selection-a', title: 'Title A',
    }))
    await vi.waitFor(() => expect(hooks.onBridgeVisibility).toHaveBeenCalledWith(DeviceId('native-isolation'), true, 'client-a'))
    const beforeB = a.commands.length
    const b = await bridge(origin, cookie, 'client-b')
    await b.ready()
    expect(a.commands).toHaveLength(beforeB)
    expect(b.commands).toContainEqual({ type: 'open-session', sessionId: 'session-b' })
    expect(b.commands).toContainEqual({ type: 'set-embedded', enabled: false })
    expect(proxy.bridgeSnapshot('client-a').sessionId).toBe('selection-a')
    expect(proxy.bridgeSnapshot()).toEqual({ state: 'idle' })
    expect(hooks.onBridgeSelection).toHaveBeenCalledWith(DeviceId('native-isolation'), 'selection-a', 'client-a')
    expect(hooks.onBridgeTitle).toHaveBeenCalledWith(DeviceId('native-isolation'), 'Title A', 'client-a')
    expect(hooks.onBridgeState).toHaveBeenCalledWith(DeviceId('native-isolation'), 'ready', undefined, 'client-b')
    const legacy = await bridge(origin, cookie)
    await legacy.ready()
    expect(legacy.commands).toContainEqual({ type: 'open-session', sessionId: 'legacy-session' })
    expect(a.commands).toHaveLength(beforeB)
    expect(b.commands.filter(x => x.type === 'open-session')).toEqual([{ type: 'open-session', sessionId: 'session-b' }])
    const beforeLegacy = legacy.commands.length
    proxy.openSession('next-a', 'client-a')
    proxy.setEmbedded(false, 'client-a')
    await vi.waitFor(() => expect(a.commands).toContainEqual({ type: 'open-session', sessionId: 'next-a' }))
    expect(legacy.commands).toHaveLength(beforeLegacy)
    expect(b.commands.filter(x => x.type === 'set-embedded')).toEqual([{ type: 'set-embedded', enabled: false }])
    b.send({ type: 'failed', error: 'B failed' })
    await vi.waitFor(() => expect(proxy.bridgeSnapshot('client-b')).toEqual({ state: 'failed', error: 'B failed' }))
    expect(proxy.bridgeSnapshot('client-a').state).toBe('ready')
    a.ws.close()
    await once(a.ws, 'close')
    await vi.waitFor(() => expect(proxy.bridgeSnapshot('client-a')).toEqual({ state: 'idle' }))
    expect(proxy.bridgeSnapshot('client-b')).toEqual({ state: 'failed', error: 'B failed' })
    const reconnected = await bridge(origin, cookie, 'client-a')
    await reconnected.ready()
    expect(reconnected.commands).toContainEqual({ type: 'open-session', sessionId: 'next-a' })
    expect(reconnected.commands).toContainEqual({ type: 'set-embedded', enabled: false })
    proxy.setGroupState({ shared: true })
    proxy.setUnreadState(['unread-shared'])
    for (const page of [b, legacy, reconnected]) {
      await vi.waitFor(() => expect(page.commands).toContainEqual({ type: 'group-expansion', groups: { shared: true } }))
      expect(page.commands).toContainEqual({ type: 'read-state', unreadSessionIds: ['unread-shared'] })
    }
  })

  it('initializes only the newly ready socket even when another socket has the same clientId', async () => {
    const remote = await upstream()
    const { proxy, origin, cookie } = await proxyFor(remote.base)
    const first = await bridge(origin, cookie, 'same-client')
    await first.ready()
    first.send({ type: 'selection', sessionId: 'kept-selection' })
    await vi.waitFor(() => expect(proxy.bridgeSnapshot('same-client').sessionId).toBe('kept-selection'))
    const second = await bridge(origin, cookie, 'same-client')
    expect(proxy.bridgeSnapshot('same-client').sessionId).toBe('kept-selection')
    const before = first.commands.length
    await second.ready()
    expect(first.commands).toHaveLength(before)
    second.ws.close()
    await once(second.ws, 'close')
    expect(proxy.bridgeSnapshot('same-client').state).toBe('ready')
    expect(proxy.bridgeSnapshot('same-client').sessionId).toBe('kept-selection')
  })

  it('scopes HTML injection failures and manager API snapshots to the requesting client', async () => {
    const remote = await upstream()
    const manager = new NativeProxyManager(new DeviceAuthManager())
    cleanup.push(() => manager.dispose())
    const id = DeviceId('manager-device')
    const url = (await manager.ensureProxy(device(remote.base, id), () => remote.base))!
    const origin = new URL(url).origin
    const bootstrap = await fetch(url, { redirect: 'manual' })
    const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0]!
    const a = await bridge(origin, cookie, 'a')
    await a.ready()
    a.send({ type: 'title', title: 'manager title' })
    await vi.waitFor(() => expect(manager.bridgeSnapshot(id, 'a').title).toBe('manager title'))
    const failed = await fetch(`${origin}/unsupported?md_client=b`, {
      headers: { cookie, accept: 'text/html' },
    })
    await failed.text()
    expect(manager.bridgeSnapshot(id, 'b').state).toBe('failed')
    expect(manager.bridgeSnapshot(id, 'a')).toEqual({ state: 'ready', title: 'manager title' })
    expect(manager.bridgeSnapshot(id)).toEqual({ state: 'idle' })
  })

  it.each(['browser-a', 'browser &+?b', ''])('gets socket ownership from the frame URL, not the script URL: %s', clientId => {
    const urls: string[] = []
    class Socket {
      readyState = 1
      constructor(url: string) { urls.push(url) }
      addEventListener(): void {}
      send(): void {}
    }
    runInNewContext(NATIVE_BRIDGE_SCRIPT, {
      window: {},
      document: { currentScript: { src: 'http://127.0.0.1:1/__md/bridge.js?device=remote&md_client=wrong-script-client' } },
      location: { protocol: 'http:', host: '127.0.0.1:1', search: `?md_client=${encodeURIComponent(clientId)}` },
      WebSocket: Socket, URL, URLSearchParams, setTimeout: () => 0,
    })
    const socketUrl = new URL(urls[0]!)
    expect(socketUrl.searchParams.get('client')).toBe(clientId || null)
    expect(socketUrl.searchParams.get('device')).toBe('remote')
  })
})

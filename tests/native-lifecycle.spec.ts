import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { DeviceId, type DeviceConfig } from '../src/contract.ts'
import { DeviceAuthManager } from '../src/host/auth.ts'
import { NativeDeviceProxy, NativeProxyManager, type NativeProxyHooks } from '../src/host/native-proxy.ts'

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
  vi.restoreAllMocks()
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
async function remote(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler)
  const sockets = new Set<Socket>()
  server.on('connection', socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  cleanup.push(() => new Promise<void>(resolve => {
    for (const socket of sockets) socket.destroy()
    server.close(() => resolve())
  }))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing port')
  return { server, port: address.port, base: `http://127.0.0.1:${address.port}` }
}
function config(base: string): DeviceConfig {
  const id = randomUUID()
  return { id: DeviceId(id), name: id, enabled: true, transport: { kind: 'direct', baseUrl: base }, auth: { mode: 'none' } }
}
function makeProxy(base: string, auth = new DeviceAuthManager(), hooks: NativeProxyHooks = {}) {
  const proxy = new NativeDeviceProxy(config(base), () => base, auth, undefined, hooks)
  cleanup.push(() => proxy.stop())
  return proxy
}
async function target(base: string, auth = new DeviceAuthManager()) {
  const proxy = makeProxy(base, auth)
  await proxy.start()
  const bootstrap = await fetch(proxy.proxyUrl()!, { redirect: 'manual' })
  await bootstrap.arrayBuffer()
  const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0]!
  return { proxy, origin: new URL(proxy.proxyUrl()!).origin, cookie }
}
function client(origin: string, cookie: string, path = '/', options: { method?: string; html?: boolean } = {}) {
  const response = deferred<IncomingMessage>()
  const req = request(`${origin}${path}`, {
    method: options.method ?? 'GET', agent: false,
    headers: { cookie, ...(options.html ? { accept: 'text/html' } : {}) },
  }, res => { res.on('error', () => {}); response.resolve(res) })
  req.on('error', () => {})
  cleanup.push(() => { req.destroy() })
  if (options.method !== 'POST') req.end()
  return { req, response: response.promise }
}
async function body(res: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of res) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString()
}
function pendingCount(proxy: NativeDeviceProxy): number {
  return (proxy as unknown as { cancelUpstreams: Set<unknown> }).cancelUpstreams.size
}

describe('native proxy lifecycle', () => {
  it('owns a pending listener immediately, coalesces starts and cannot resurrect after stop', async () => {
    const available = await remote((_req, res) => res.end())
    const port = available.port
    await new Promise<void>(resolve => available.server.close(() => resolve()))
    const allocated = vi.fn()
    const proxy = makeProxy(available.base, undefined, { onPortAllocated: allocated })
    const first = proxy.start(port)
    expect(proxy.start(port)).toBe(first)
    proxy.stop()
    await first
    await proxy.start(port)
    expect(proxy.proxyUrl()).toBeUndefined()
    expect(proxy.port()).toBeUndefined()
    expect(allocated).not.toHaveBeenCalled()
    // A leaked listener would make this exact port unavailable.
    const probe = createServer()
    cleanup.push(() => { probe.close() })
    probe.listen(port, '127.0.0.1')
    await once(probe, 'listening')
  })

  it('falls back from an occupied preferred port and concurrent manager callers await the same proxy', async () => {
    const occupied = await remote((_req, res) => res.end())
    const manager = new NativeProxyManager(new DeviceAuthManager())
    cleanup.push(() => manager.dispose())
    const device = { ...config(occupied.base), nativeProxyPort: occupied.port }
    const [a, b] = await Promise.all([
      manager.ensureProxy(device, () => occupied.base), manager.ensureProxy(device, () => occupied.base),
    ])
    expect(a).toBeDefined()
    expect(a).toBe(b)
    expect(Number(new URL(a!).port)).not.toBe(occupied.port)
  })

  it('does not return or delete a removed proxy while a replacement is starting', async () => {
    const upstream = await remote((_req, res) => res.end('OK'))
    const manager = new NativeProxyManager(new DeviceAuthManager())
    cleanup.push(() => manager.dispose())
    const device = config(upstream.base)
    const old = manager.ensureProxy(device, () => upstream.base)
    manager.removeProxy(device.id)
    const replacement = manager.ensureProxy(device, () => upstream.base)
    expect(await old).toBeUndefined()
    const url = await replacement
    expect(url).toBeDefined()
    expect(manager.proxyUrl(device.id)).toBe(url)
  })

  it('renders an initial asynchronous authentication rejection as 502 without leaking a request', async () => {
    let requests = 0
    const upstream = await remote((_req, res) => { requests++; res.end('unexpected') })
    const auth = new DeviceAuthManager()
    vi.spyOn(auth, 'ensureAuthenticated').mockRejectedValue(new Error('initial authentication failed'))
    const { proxy, origin, cookie } = await target(upstream.base, auth)
    const response = await client(origin, cookie).response
    expect(response.statusCode).toBe(502)
    expect(await body(response)).toContain('initial authentication failed')
    expect(requests).toBe(0)
    await vi.waitFor(() => expect(pendingCount(proxy)).toBe(0))
  })

  it.each(['disconnect', 'stop'])('does not forward after pending authentication: %s', async mode => {
    let requests = 0
    const upstream = await remote((_req, res) => { requests++; res.end('unexpected') })
    const auth = new DeviceAuthManager()
    const pending = deferred<{ ok: true }>()
    const authenticate = vi.spyOn(auth, 'ensureAuthenticated').mockImplementation(() => pending.promise)
    const { proxy, origin, cookie } = await target(upstream.base, auth)
    const local = client(origin, cookie)
    await vi.waitFor(() => expect(authenticate).toHaveBeenCalledTimes(1))
    if (mode === 'stop') proxy.stop()
    else local.req.destroy()
    await vi.waitFor(() => expect(pendingCount(proxy)).toBe(0))
    pending.resolve({ ok: true })
    await pending.promise
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(requests).toBe(0)
  })

  it.each(['application/octet-stream', 'text/event-stream'])('destroys upstream when a downstream stream disconnects: %s', async contentType => {
    const closed = deferred<void>()
    const upstream = await remote((_req, res) => {
      res.on('close', () => closed.resolve())
      res.writeHead(200, { 'content-type': contentType })
      res.write('data: first\n\n')
    })
    const { proxy, origin, cookie } = await target(upstream.base)
    const local = client(origin, cookie)
    const response = await local.response
    await once(response, 'data')
    response.destroy()
    await closed.promise
    await vi.waitFor(() => expect(pendingCount(proxy)).toBe(0))
  })

  it('aborts an incomplete upload upstream without waiting for a response', async () => {
    const received = deferred<void>()
    const aborted = deferred<void>()
    const upstream = await remote((req, _res) => {
      req.on('error', () => {})
      req.once('data', () => received.resolve())
      req.once('aborted', () => aborted.resolve())
    })
    const { proxy, origin, cookie } = await target(upstream.base)
    const local = client(origin, cookie, '/upload', { method: 'POST' })
    local.req.write('partial upload')
    await received.promise
    local.req.destroy()
    await aborted.promise
    await vi.waitFor(() => expect(pendingCount(proxy)).toBe(0))
  })

  it('stop destroys every active HTTP/SSE stream and upload', async () => {
    let opened = 0
    let closed = 0
    const upstream = await remote((req, res) => {
      opened++
      res.on('close', () => { closed++ })
      req.on('error', () => {})
      if (req.method === 'POST') req.resume()
      else { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: ready\n\n') }
    })
    const { proxy, origin, cookie } = await target(upstream.base)
    const a = client(origin, cookie, '/a')
    const b = client(origin, cookie, '/b')
    const upload = client(origin, cookie, '/upload', { method: 'POST' })
    upload.req.write('partial')
    await Promise.all([a.response, b.response])
    await vi.waitFor(() => expect(opened).toBe(3))
    proxy.stop()
    await vi.waitFor(() => expect(closed).toBe(3))
    expect(pendingCount(proxy)).toBe(0)
  })

  it('cancels buffered HTML when downstream disappears and clears its ready timer', async () => {
    const opened = deferred<void>()
    const closed = deferred<void>()
    const upstream = await remote((_req, res) => {
      res.on('close', () => closed.resolve())
      res.writeHead(200, { 'content-type': 'text/html' })
      res.write('<html><head>')
      opened.resolve()
    })
    const { proxy, origin, cookie } = await target(upstream.base)
    const local = client(origin, cookie, '/', { html: true })
    await opened.promise
    await vi.waitFor(() => expect(proxy.bridgeSnapshot().state).toBe('loading'))
    local.req.destroy()
    await closed.promise
    await vi.waitFor(() => expect(pendingCount(proxy)).toBe(0))
    const states = (proxy as unknown as { clientStates: Map<string, { readyTimer?: unknown }> }).clientStates
    expect(states.get('legacy')?.readyTimer).toBeUndefined()
  })

  it('rejects oversized never-ending HTML immediately rather than draining it forever', async () => {
    const closed = deferred<void>()
    const upstream = await remote((_req, res) => {
      res.on('close', () => closed.resolve())
      res.writeHead(200, { 'content-type': 'text/html' })
      res.write(Buffer.alloc(20 * 1024 * 1024 + 1, 120))
    })
    const { proxy, origin, cookie } = await target(upstream.base)
    const response = await client(origin, cookie, '/', { html: true }).response
    expect(response.statusCode).toBe(502)
    expect(await body(response)).toContain('too large')
    await closed.promise
    expect(proxy.bridgeSnapshot().state).toBe('failed')
  })

  it.each([false, true])('handles upstream response abort without an uncaught stream error (HTML=%s)', async html => {
    const sent = deferred<ServerResponse>()
    const upstream = await remote((_req, res) => {
      res.writeHead(200, { 'content-type': html ? 'text/html' : 'text/plain' })
      res.write('<html>partial')
      sent.resolve(res)
    })
    const { proxy, origin, cookie } = await target(upstream.base)
    const local = client(origin, cookie, '/', { html })
    const res = await sent.promise
    if (html) await vi.waitFor(() => expect(proxy.bridgeSnapshot().state).toBe('loading'))
    else await local.response
    res.destroy()
    await vi.waitFor(() => expect(pendingCount(proxy)).toBe(0))
    if (html) expect(proxy.bridgeSnapshot().state).toBe('failed')
  })

  it('keeps successful compressed HTML injection and ordinary POST completion working', async () => {
    const upstream = await remote((req, res) => {
      if (req.method === 'POST') {
        let data = ''
        req.on('data', chunk => { data += chunk.toString() })
        req.on('end', () => res.end(data))
      } else {
        res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' })
        res.end(gzipSync('<html><head></head><body>OK</body></html>'))
      }
    })
    const { proxy, origin, cookie } = await target(upstream.base)
    const page = await client(origin, cookie, '/', { html: true }).response
    expect(page.headers['content-encoding']).toBeUndefined()
    expect(await body(page)).toContain('/__md/bridge.js')
    const upload = client(origin, cookie, '/', { method: 'POST' })
    upload.req.end('whole upload')
    expect(await body(await upload.response)).toBe('whole upload')
    await vi.waitFor(() => expect(pendingCount(proxy)).toBe(0))
  })

  it('consumes async authentication failure and closes rejected response bodies', async () => {
    const auth = new DeviceAuthManager()
    vi.spyOn(auth, 'ensureAuthenticated').mockResolvedValueOnce({ ok: true }).mockRejectedValue(new Error('auth failed'))
    const closed = deferred<void>()
    const upstream = await remote((_req, res) => {
      res.on('close', () => closed.resolve())
      res.writeHead(401)
      res.write('never ending rejection')
    })
    const { proxy, origin, cookie } = await target(upstream.base, auth)
    const response = await client(origin, cookie, '/', { method: 'POST' })
    response.req.end('x')
    const result = await response.response
    expect(result.headers['x-dsh-md-auth-required']).toBe('1')
    expect(await body(result)).toContain('Sign-in required')
    await closed.promise
    await vi.waitFor(() => expect(pendingCount(proxy)).toBe(0))
  })

  it.each(['disconnect', 'stop'])('cancels a pending WS handshake: %s', async mode => {
    const opened = deferred<void>()
    const closed = deferred<void>()
    const upstream = await remote((_req, res) => res.end())
    upstream.server.on('upgrade', (_req, socket) => {
      socket.on('error', () => {})
      socket.once('close', () => closed.resolve())
      socket.once('end', () => socket.destroy())
      socket.resume()
      opened.resolve()
    })
    const { proxy, origin, cookie } = await target(upstream.base)
    const ws = new WebSocket(`${origin.replace('http:', 'ws:')}/socket`, { headers: { cookie } })
    ws.on('error', () => {})
    cleanup.push(() => ws.terminate())
    await opened.promise
    if (mode === 'stop') proxy.stop()
    else ws.terminate()
    await closed.promise
    await vi.waitFor(() => expect(pendingCount(proxy)).toBe(0))
  })

  it('bounds offline client state without evicting live bridge navigation', async () => {
    const upstream = await remote((_req, res) => res.end('OK'))
    const { proxy, origin, cookie } = await target(upstream.base)
    proxy.openSession('kept', 'live')
    const ws = new WebSocket(`${origin.replace('http:', 'ws:')}/__md/bridge?client=live`, { headers: { cookie } })
    ws.on('error', () => {})
    cleanup.push(() => ws.terminate())
    await once(ws, 'open')
    for (let i = 0; i < 300; i++) proxy.openSession(`session-${i}`, `offline-${i}`)
    const states = (proxy as unknown as { clientStates: Map<string, { pendingOpenSession?: string }> }).clientStates
    expect(states.size).toBe(257)
    expect(states.get('live')?.pendingOpenSession).toBe('kept')
    expect(states.has('offline-0')).toBe(false)
    expect(states.get('offline-299')?.pendingOpenSession).toBe('session-299')
    proxy.stop()
    expect(states.size).toBe(0)
  })

  it('does not retry an unauthorized GET after disconnect during auth recovery', async () => {
    let requests = 0
    const upstream = await remote((_req, res) => { requests++; res.writeHead(401); res.end('no') })
    const auth = new DeviceAuthManager()
    const recovery = deferred<{ ok: true }>()
    const authenticate = vi.spyOn(auth, 'ensureAuthenticated').mockResolvedValueOnce({ ok: true }).mockImplementation(() => recovery.promise)
    vi.spyOn(auth, 'getAuthHeaders').mockReturnValue({ Cookie: 'authenticated=yes' })
    const { proxy, origin, cookie } = await target(upstream.base, auth)
    const local = client(origin, cookie)
    await vi.waitFor(() => expect(authenticate).toHaveBeenCalledTimes(2))
    local.req.destroy()
    await vi.waitFor(() => expect(pendingCount(proxy)).toBe(0))
    recovery.resolve({ ok: true })
    await recovery.promise
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(requests).toBe(1)
  })

  it('closes an infinite WS rejection body and consumes failed reauthentication', async () => {
    const closed = deferred<void>()
    const upstream = await remote((_req, res) => {
      res.once('close', () => closed.resolve())
      res.writeHead(403)
      res.write('no upgrade')
    })
    const auth = new DeviceAuthManager()
    vi.spyOn(auth, 'ensureAuthenticated').mockRejectedValue(new Error('rejected auth'))
    const { proxy, origin, cookie } = await target(upstream.base, auth)
    const ws = new WebSocket(`${origin.replace('http:', 'ws:')}/socket`, { headers: { cookie } })
    ws.on('error', () => {})
    cleanup.push(() => ws.terminate())
    await new Promise<void>(resolve => ws.once('close', () => resolve()))
    await closed.promise
    await vi.waitFor(() => expect(pendingCount(proxy)).toBe(0))
  })

  it.each(['disconnect', 'stop'])('destroys upgraded WS upstream sockets: %s', async mode => {
    const upstream = await remote((_req, res) => res.end())
    const wss = new WebSocketServer({ server: upstream.server })
    cleanup.push(() => { for (const ws of wss.clients) ws.terminate(); wss.close() })
    const closed = deferred<void>()
    wss.on('connection', ws => {
      ws.on('error', () => {})
      ws.on('close', () => closed.resolve())
    })
    const { proxy, origin, cookie } = await target(upstream.base)
    const ws = new WebSocket(`${origin.replace('http:', 'ws:')}/socket`, { headers: { cookie } })
    ws.on('error', () => {})
    cleanup.push(() => ws.terminate())
    await once(ws, 'open')
    if (mode === 'stop') proxy.stop()
    else ws.terminate()
    await closed.promise
    await vi.waitFor(() => expect(pendingCount(proxy)).toBe(0))
  })
})

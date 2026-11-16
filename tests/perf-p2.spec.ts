/**
 * Phase P2 resilience, watchdog recovery & fleet scheduling regression suite.
 */
import { EventEmitter, once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { DeviceId, type DeviceConfig } from '../src/contract.ts'
import { DeviceAuthManager } from '../src/host/auth.ts'
import { NativeDeviceProxy } from '../src/host/native-proxy.ts'
import {
  ACTIVE_RECONCILE_BASE_MS,
  computeAdaptiveReconcileDelayMs,
  DeviceRegistry,
  IDLE_RECONCILE_BASE_MS,
} from '../src/host/registry.ts'
import {
  ADAPTIVE_SSH_COMPRESS_RTT_MS,
  RemoteDeviceClient,
  type RemoteSessionSummary,
} from '../src/host/remote-client.ts'
import { resolveSshConfigForTransport } from '../src/host/ssh-config.ts'
import {
  buildSystemSshArgs,
  execSshCommand,
  MAX_CONCURRENT_SSH_HANDSHAKES,
  setMaxConcurrentSshHandshakes,
  setSshSpawn,
} from '../src/host/tunnel.ts'
import { parseControlPlaneRequest } from '../src/runtime.ts'

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  setSshSpawn(null)
  setMaxConcurrentSshHandshakes(null)
  vi.restoreAllMocks()
  vi.useRealTimers()
  while (cleanups.length > 0) {
    await cleanups.pop()!()
  }
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-md-perf-p2-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

describe('Phase P2 optimizations', () => {
  it('detects half-open /api/remote.mux streams via ping/pong watchdog and reconnects automatically', async () => {
    let wsConnections = 0
    let dropPongs = false

    const httpServer: Server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { rpcId?: string }
        res.writeHead(200, { 'content-type': 'application/json' })
        if (req.url === '/api/host.describe') {
          res.end(JSON.stringify({
            type: 'server-response',
            rpcId: body.rpcId,
            result: { ok: true, value: { version: '0.2.1' } },
          }))
          return
        }
        res.end(JSON.stringify({
          type: 'server-response',
          rpcId: body.rpcId,
          result: { ok: true, value: { items: [] } },
        }))
      })
    })

    // autoPong: false lets us simulate a blackholed NAT/SSH TCP stream that stops answering pings
    const wss = new WebSocketServer({ server: httpServer, path: '/api/remote.mux', autoPong: false })
    wss.on('connection', (ws) => {
      wsConnections += 1
      ws.on('ping', (data) => {
        if (!dropPongs && ws.readyState === WebSocket.OPEN) {
          ws.pong(data)
        }
      })
      ws.on('message', (raw) => {
        const frame = JSON.parse(String(raw)) as { type?: string; streamId?: string; endpoint?: string }
        if (frame.type === 'open' && typeof frame.streamId === 'string') {
          if (frame.endpoint === '$events') {
            ws.send(JSON.stringify({
              type: 'item',
              streamId: frame.streamId,
              value: { type: 'ready', clientId: `c-${String(wsConnections)}`, host: { home: '/home/dev' } },
            }))
          } else if (frame.endpoint === 'workspace/follow') {
            ws.send(JSON.stringify({
              type: 'item',
              streamId: frame.streamId,
              value: { type: 'baseline', value: { items: [], archivedSessionIds: [], pinnedSessionIds: [] } },
            }))
          } else if (frame.endpoint === 'session/control') {
            ws.send(JSON.stringify({
              type: 'item',
              streamId: frame.streamId,
              value: { type: 'baseline', value: { projections: {} } },
            }))
          }
        }
      })
    })

    await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve))
    cleanups.push(() => new Promise<void>(resolve => {
      for (const s of wss.clients) s.terminate()
      wss.close(() => httpServer.close(() => resolve()))
    }))
    const baseUrl = `http://127.0.0.1:${String((httpServer.address() as AddressInfo).port)}`

    const config: DeviceConfig = {
      id: DeviceId('dev-watchdog'),
      name: 'Watchdog 0.2',
      enabled: true,
      transport: { kind: 'direct', baseUrl },
      auth: { mode: 'none' },
    }
    const client = new RemoteDeviceClient(
      config,
      new DeviceAuthManager(),
      {
        onStateChanged: () => {},
        onRemoteEventFrame: () => {},
        onControlProjectionFrame: () => {},
        onWorkspacesChanged: () => {},
      },
      { muxPingIntervalMs: 35, muxPongTimeoutMs: 40 },
    )
    cleanups.push(() => client.stop())

    client.start()
    await vi.waitFor(() => expect(client.isConnected()).toBe(true), { timeout: 2_000 })
    expect(wsConnections).toBe(1)

    // Healthy pongs keep connection 1 alive across multiple ping cycles
    await new Promise(resolve => setTimeout(resolve, 110))
    expect(wsConnections).toBe(1)
    expect(client.isConnected()).toBe(true)

    // Blackhole pongs on connection 1, then restore pongs once terminated so reconnect succeeds
    dropPongs = true
    await vi.waitFor(() => {
      expect(client.toView().lastError).toContain('ping timed out')
    }, { timeout: 1_500 })

    dropPongs = false
    await vi.waitFor(() => {
      expect(wsConnections).toBeGreaterThanOrEqual(2)
      expect(client.isConnected()).toBe(true)
    }, { timeout: 2_500 })
  })

  it('sweeps half-open /__md/bridge sockets via periodic ping while preserving responsive clients', async () => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><head><title>Remote</title></head><body>OK</body></html>')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanups.push(() => new Promise<void>(resolve => {
      server.closeAllConnections()
      server.close(() => resolve())
    }))
    const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`

    const config: DeviceConfig = {
      id: DeviceId('dev-bridge-ping'),
      name: 'Bridge Watchdog',
      enabled: true,
      transport: { kind: 'direct', baseUrl: base },
      auth: { mode: 'none' },
    }
    const proxy = new NativeDeviceProxy(
      config,
      () => base,
      new DeviceAuthManager(),
      () => 'http://127.0.0.1:3080',
      { bridgePingIntervalMs: 35 },
    )
    await proxy.start()
    cleanups.push(() => proxy.stop())

    const bootstrapUrl = proxy.proxyUrl()!
    const origin = new URL(bootstrapUrl).origin
    const bootstrapRes = await fetch(bootstrapUrl, { redirect: 'manual' })
    const cookie = bootstrapRes.headers.get('set-cookie')!.split(';')[0]!

    const healthyWs = new WebSocket(`${origin.replace(/^http/, 'ws')}/__md/bridge?client=healthy`, {
      headers: { cookie },
      autoPong: true,
    })
    const stalledWs = new WebSocket(`${origin.replace(/^http/, 'ws')}/__md/bridge?client=stalled`, {
      headers: { cookie },
      autoPong: false,
    })
    cleanups.push(() => {
      healthyWs.terminate()
      stalledWs.terminate()
    })
    await Promise.all([once(healthyWs, 'open'), once(stalledWs, 'open')])
    healthyWs.send(JSON.stringify({ type: 'ready' }))
    stalledWs.send(JSON.stringify({ type: 'ready' }))

    await vi.waitFor(() => {
      expect(proxy.bridgeSnapshot('healthy').state).toBe('ready')
      expect(proxy.bridgeSnapshot('stalled').state).toBe('ready')
    })

    // After 2+ sweep ticks (~80-120ms), stalledWs (autoPong: false) must be terminated,
    // while healthyWs remains ready!
    await vi.waitFor(() => {
      expect(proxy.bridgeSnapshot('stalled').state).toBe('idle')
    }, { timeout: 1_000 })
    expect(proxy.bridgeSnapshot('healthy').state).toBe('ready')
  })

  it('supports explicit SSH Compression flags and enables adaptive SSH compression when RTT >= 60ms', async () => {
    const baseTransport = { kind: 'ssh' as const, host: 'wan-box' }
    const resolved = resolveSshConfigForTransport(baseTransport)

    const defaultArgs = buildSystemSshArgs(baseTransport, resolved, 43100)
    expect(defaultArgs.some(a => a.startsWith('Compression='))).toBe(false)

    const compressedArgs = buildSystemSshArgs({ ...baseTransport, compress: true }, resolved, 43100)
    expect(compressedArgs).toContain('Compression=yes')

    const uncompressedArgs = buildSystemSshArgs({ ...baseTransport, compress: false }, resolved, 43100)
    expect(uncompressedArgs).toContain('Compression=no')

    // Control-plane schema validation accepts boolean compress and rejects invalid types
    expect(() =>
      parseControlPlaneRequest({
        action: 'upsertDevice',
        payload: { name: 'WAN', transport: { kind: 'ssh', host: 'wan-box', compress: true } },
      }),
    ).not.toThrow()
    expect(() =>
      parseControlPlaneRequest({
        action: 'upsertDevice',
        payload: { name: 'WAN', transport: { kind: 'ssh', host: 'wan-box', compress: 'yes' } },
      }),
    ).toThrow(/compress/)

    // Adaptive compression activates automatically when RTT >= ADAPTIVE_SSH_COMPRESS_RTT_MS (60ms)
    // and compress was left undefined.
    const client = new RemoteDeviceClient(
      {
        id: DeviceId('dev-wan'),
        name: 'WAN SSH',
        enabled: false,
        transport: { kind: 'ssh', host: 'wan-box' },
        auth: { mode: 'auto' },
      },
      new DeviceAuthManager(),
      {
        onStateChanged: () => {},
        onRemoteEventFrame: () => {},
        onControlProjectionFrame: () => {},
        onWorkspacesChanged: () => {},
      },
    )
    expect((client.effectiveTransportConfig() as { compress?: boolean }).compress).toBeUndefined()

    ;(client as any).latencyMs = ADAPTIVE_SSH_COMPRESS_RTT_MS - 10
    ;(client as any).maybeEnableAdaptiveSshCompression()
    expect((client.effectiveTransportConfig() as { compress?: boolean }).compress).toBeUndefined()

    ;(client as any).latencyMs = ADAPTIVE_SSH_COMPRESS_RTT_MS + 15
    ;(client as any).maybeEnableAdaptiveSshCompression()
    expect((client.effectiveTransportConfig() as { compress?: boolean }).compress).toBe(true)
  })

  it('backs off quiet 0.2 catalog reconciles to ~180s with jitter and immediately tightens to ~45s on running work', () => {
    expect(computeAdaptiveReconcileDelayMs(true, () => 0)).toBe(Math.round(ACTIVE_RECONCILE_BASE_MS * 0.85))
    expect(computeAdaptiveReconcileDelayMs(true, () => 1)).toBe(Math.round(ACTIVE_RECONCILE_BASE_MS * 1.15))
    expect(computeAdaptiveReconcileDelayMs(false, () => 0)).toBe(Math.round(IDLE_RECONCILE_BASE_MS * 0.85))
    expect(computeAdaptiveReconcileDelayMs(false, () => 1)).toBe(Math.round(IDLE_RECONCILE_BASE_MS * 1.15))

    const dir = tempDir()
    const registry = new DeviceRegistry(
      join(dir, 'devices.json'),
      join(dir, 'secrets.json'),
      { localPort: () => 3080 },
      { enableTunnels: false },
    )
    cleanups.push(() => registry.dispose())

    let rows: RemoteSessionSummary[] = [
      { sessionId: 's1', updatedAt: 1, agentAvailable: true, running: false, blank: false },
    ]
    const refreshSpy = vi.fn(async () => {})
    const mockClient = {
      id: DeviceId('dev-idle'),
      connectionGeneration: 1,
      catalogFresh: true,
      isConnected: () => true,
      sessionSummaries: () => rows,
      refreshSessionCatalog: refreshSpy,
      toView: () => ({ id: DeviceId('dev-idle'), state: 'connected', realtime: true }),
      stop: () => {},
    }
    ;(registry as any).clients.set(DeviceId('dev-idle'), mockClient)

    const t0 = 1_000_000
    // Initial tick arms the idle schedule at t0 + 180_000 (with midpoint randomFn = 0.5)
    registry.tickConnectedCatalogReconcile(t0, () => 0.5)
    expect(refreshSpy).not.toHaveBeenCalled()

    // At +60s and +120s, the quiet 0.2 device is NOT polled
    registry.tickConnectedCatalogReconcile(t0 + 60_000, () => 0.5)
    registry.tickConnectedCatalogReconcile(t0 + 120_000, () => 0.5)
    expect(refreshSpy).not.toHaveBeenCalled()

    // At +180s, the idle reconcile fires once and schedules the next idle window at t0 + 360_000
    registry.tickConnectedCatalogReconcile(t0 + 180_000, () => 0.5)
    expect(refreshSpy).toHaveBeenCalledTimes(1)

    // At +185s, a session begins running: the distant +360s deadline must tighten to +185s + 45s = +230s!
    rows = [{ sessionId: 's1', updatedAt: 2, agentAvailable: true, running: true, blank: false }]
    registry.tickConnectedCatalogReconcile(t0 + 185_000, () => 0.5)
    expect(refreshSpy).toHaveBeenCalledTimes(1)

    registry.tickConnectedCatalogReconcile(t0 + 230_000, () => 0.5)
    expect(refreshSpy).toHaveBeenCalledTimes(2)
  })

  it('bounds concurrent cold SSH handshakes to MAX_CONCURRENT_SSH_HANDSHAKES and honors AbortSignal while queued', async () => {
    expect(MAX_CONCURRENT_SSH_HANDSHAKES).toBe(4)

    let activeChildren = 0
    let peakChildren = 0
    const openChildren: Array<{ finish: () => void }> = []

    setSshSpawn(((_cmd, args) => {
      const child = new EventEmitter() as any
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.kill = vi.fn()
      activeChildren += 1
      peakChildren = Math.max(peakChildren, activeChildren)
      const host = args[args.length - 2] ?? 'unknown'
      openChildren.push({
        finish: () => {
          activeChildren -= 1
          child.stdout.emit('data', Buffer.from(`ok:${host}`))
          child.emit('close', 0)
        },
      })
      return child
    }) as any)

    const abortQueued = new AbortController()
    const tasks = Array.from({ length: 7 }, (_, idx) =>
      execSshCommand(
        { kind: 'ssh', host: `node-${String(idx)}`, engine: 'system-ssh', compress: true },
        'true',
        5_000,
        idx === 5 ? abortQueued.signal : undefined,
      ),
    )

    await vi.waitFor(() => expect(openChildren).toHaveLength(4))
    expect(activeChildren).toBe(4)
    expect(peakChildren).toBe(4)

    // Cancel task #5 while it is still waiting in the semaphore queue: it must reject immediately
    // without ever spawning a child process!
    abortQueued.abort()
    expect(await tasks[5]).toEqual({ ok: false, error: 'ssh command aborted' })
    expect(openChildren).toHaveLength(4)

    // Complete the first 4 handshakes; the remaining 2 queued tasks (#4 and #6) now acquire slots
    for (const item of openChildren.splice(0, 4)) item.finish()
    await vi.waitFor(() => expect(openChildren).toHaveLength(2))
    expect(peakChildren).toBe(4)

    for (const item of openChildren.splice(0)) item.finish()
    const results = await Promise.all(tasks)
    expect(results[0]).toEqual({ ok: true, stdout: 'ok:node-0' })
    expect(results[4]).toEqual({ ok: true, stdout: 'ok:node-4' })
    expect(results[5]).toEqual({ ok: false, error: 'ssh command aborted' })
    expect(results[6]).toEqual({ ok: true, stdout: 'ok:node-6' })
    expect(peakChildren).toBe(4)
  })
})

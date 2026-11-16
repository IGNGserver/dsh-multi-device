/**
 * Phase P1 memory footprint, transport reuse & cold-connect optimization regression suite.
 */
import { EventEmitter, once } from 'node:events'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { MultiDeviceClientStore } from '../src/client/state.ts'
import {
  DeviceId,
  encodeRemoteSessionId,
  type DeviceConfig,
  type DeviceView,
  type MultiDeviceSnapshot,
} from '../src/contract.ts'
import { DeviceAuthManager } from '../src/host/auth.ts'
import { DeviceCatalog } from '../src/host/device-catalog.ts'
import { NativeDeviceProxy, type NativeProxyHooks } from '../src/host/native-proxy.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import {
  buildSystemSshArgs,
  execSshCommand,
  setSshSpawn,
  sshControlMultiplexArgs,
} from '../src/host/tunnel.ts'

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  setSshSpawn(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  while (cleanups.length > 0) {
    await cleanups.pop()!()
  }
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-md-perf-p1-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function mockDeviceView(
  id: string,
  overrides: Partial<DeviceView> = {},
): DeviceView {
  return {
    id: DeviceId(id),
    name: `Device ${id}`,
    enabled: true,
    transportKind: 'ssh',
    targetSummary: `${id}.internal:3080`,
    authMode: 'auto',
    authState: 'authenticated',
    state: 'connected',
    keepNativeAlive: true,
    runningSessionCount: 0,
    totalSessionCount: 1,
    ...overrides,
  }
}

describe('Phase P1 optimizations', () => {
  it('enforces configurable Keep-Alive page budget, spares composer drafts, hibernates idle tabs, and restores evicted sessions', async () => {
    const store = new MultiDeviceClientStore()
    cleanups.push(() => store.dispose())
    const activeSessionSpy = vi.spyOn(store, 'setActiveSession').mockResolvedValue()

    const devA = DeviceId('dev-a')
    const devB = DeviceId('dev-b')
    const devC = DeviceId('dev-c')

    const snapshot1: MultiDeviceSnapshot = {
      revision: 1,
      hostEpoch: 'epoch-p1',
      devices: [
        mockDeviceView('dev-a', { nativePaneHasDraft: true, nativePaneSessionId: 'sess-a' }),
        mockDeviceView('dev-b', { nativePaneHasDraft: false, nativePaneSessionId: 'sess-b' }),
        mockDeviceView('dev-c', { nativePaneHasDraft: false, nativePaneSessionId: 'sess-c' }),
      ],
      sshConfigHosts: [],
      unreadSessionIds: [],
      ui: {
        crossHostReadState: false,
        crossHostUiState: false,
        taskbarSummary: false,
        maxKeepAlivePages: 2,
        keepAliveIdleMinutes: 10,
      },
    }

    ;(store as any).applyIncomingSnapshot(snapshot1)

    // Activate A (oldest, has draft), then B (clean), then C (active):
    // With maxKeepAlivePages = 2, B must be evicted while A (draft) + C (active) stay alive!
    await store.selectNativeDevice(devA)
    await store.selectNativeDevice(devB)
    await store.selectNativeDevice(devC)
    expect(store.getSnapshot().keepAliveDeviceIds).toEqual([devA, devC])

    // Re-selecting evicted B must restore its prior session ('sess-b') via setActiveSession!
    activeSessionSpy.mockClear()
    await store.selectNativeDevice(devB)
    expect(activeSessionSpy).toHaveBeenCalledWith(encodeRemoteSessionId(devB, 'sess-b'))
    // Now A (draft) + B (active) stay alive; C (clean background) was evicted
    expect(store.getSnapshot().keepAliveDeviceIds).toEqual([devA, devB])

    // Switch to 本机 and advance beyond 10m idle threshold
    const baseNow = Date.now()
    const snapshot2: MultiDeviceSnapshot = {
      ...snapshot1,
      revision: 2,
      devices: [
        mockDeviceView('dev-a', { nativePaneHasDraft: true, nativePaneSessionId: 'sess-a' }),
        mockDeviceView('dev-b', { nativePaneHasDraft: false, nativePaneSessionId: 'sess-b' }),
        mockDeviceView('dev-c', { nativePaneHasDraft: false, nativePaneSessionId: 'sess-c' }),
      ],
    }
    ;(store as any).applyIncomingSnapshot(snapshot2)
    store.selectLocalNativeTab()

    // After 11 minutes idle: B (clean background) is hibernated; A (has draft) is spared!
    store.sweepIdleKeepAlive(baseNow + 11 * 60_000)
    expect(store.getSnapshot().keepAliveDeviceIds).toEqual([devA])
  })

  it('indexes DeviceCatalog sessions in O(1) and drops heavy non-hint projections when retainOnlyHintKeys is true', () => {
    const catalog = new DeviceCatalog()
    const epoch = catalog.beginEpoch()

    catalog.replaceSessions([
      { sessionId: 's1', updatedAt: 10, agentAvailable: true, running: false, blank: false, projections: { kind: 'sequenced', asOfSeq: 0, values: { title: 'First' } } },
      { sessionId: 's2', updatedAt: 20, agentAvailable: true, running: false, blank: false, projections: { kind: 'sequenced', asOfSeq: 0, values: { title: 'Second' } } },
      { sessionId: 's3', updatedAt: 30, agentAvailable: true, running: false, blank: false, projections: { kind: 'sequenced', asOfSeq: 0, values: { title: 'Third' } } },
    ])
    expect(catalog.getSession('s2')?.projections?.values.title).toBe('Second')

    // O(1) status & activity updates preserve exact row order and O(1) lookup consistency
    expect(catalog.applySessionEvent(epoch, 'api-session/status', ['s2', true])).toBe(true)
    expect(catalog.getSession('s2')?.running).toBe(true)
    expect(catalog.sessions.map(s => s.sessionId)).toEqual(['s1', 's2', 's3'])

    expect(catalog.applySessionEvent(epoch, 'api-session/removed', ['s1'])).toBe(true)
    expect(catalog.getSession('s1')).toBeUndefined()
    expect(catalog.getSession('s3')?.projections?.values.title).toBe('Third')
    expect(catalog.sessions.map(s => s.sessionId)).toEqual(['s2', 's3'])

    // With retainOnlyHintKeys = true, heavy keys (contextUsage, plan) are NOT retained in projections,
    // while title & sessionListMetadata still update session hints cleanly.
    const identityNs = (_key: string, value: unknown): unknown => value
    expect(
      catalog.applyControlFrame(
        epoch,
        { type: 'projection', sessionId: 's2', key: 'contextUsage', value: { tokens: 128_000, blob: 'x'.repeat(1024) }, seq: 1 },
        identityNs,
        true,
      ),
    ).toBeUndefined()
    catalog.applyControlFrame(
      epoch,
      { type: 'projection', sessionId: 's2', key: 'title', value: 'Renamed Second', seq: 2 },
      identityNs,
      true,
    )
    catalog.applyControlFrame(
      epoch,
      { type: 'projection', sessionId: 's2', key: 'sessionListMetadata', value: { blank: true, cwd: '/srv/app' }, seq: 3 },
      identityNs,
      true,
    )

    expect(catalog.getSession('s2')?.projections?.values.title).toBe('Renamed Second')
    expect(catalog.getSession('s2')?.blank).toBe(true)
    const s2Proj = catalog.controlProjections.get('s2')
    expect(Object.hasOwn(s2Proj?.values ?? {}, 'contextUsage')).toBe(false)
    expect(s2Proj?.values.title).toBe('Renamed Second')
  })

  it('serves /__md/bridge.js with SHA-1 ETag + 304 Not Modified and tracks composer draft dirty transitions', async () => {
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

    const draftEvents: Array<{ deviceId: DeviceId; dirty: boolean; clientId?: string }> = []
    const hooks: NativeProxyHooks = {
      onBridgeDraft: (deviceId, dirty, clientId) => {
        draftEvents.push({ deviceId, dirty, clientId })
      },
    }
    const config: DeviceConfig = {
      id: DeviceId('dev-bridge'),
      name: 'Bridge Perf',
      enabled: true,
      transport: { kind: 'direct', baseUrl: base },
      auth: { mode: 'none' },
    }
    const proxy = new NativeDeviceProxy(config, () => base, new DeviceAuthManager(), () => 'http://127.0.0.1:3080', hooks)
    await proxy.start()
    cleanups.push(() => proxy.stop())

    const bootstrapUrl = proxy.proxyUrl()!
    const origin = new URL(bootstrapUrl).origin
    const bootstrapRes = await fetch(bootstrapUrl, { redirect: 'manual' })
    const cookie = bootstrapRes.headers.get('set-cookie')!.split(';')[0]!

    // 1. Initial GET /__md/bridge.js -> 200 with ETag
    const scriptRes1 = await fetch(`${origin}/__md/bridge.js`, { headers: { cookie } })
    expect(scriptRes1.status).toBe(200)
    const etag1 = scriptRes1.headers.get('etag')
    expect(etag1).toMatch(/^"[a-f0-9]{40}"$/)
    const body1 = await scriptRes1.text()
    expect(body1.length).toBeGreaterThan(1_000)

    // 2. Conditional GET with matching If-None-Match -> 304 Not Modified with empty body
    const scriptRes304 = await fetch(`${origin}/__md/bridge.js`, {
      headers: { cookie, 'if-none-match': etag1! },
    })
    expect(scriptRes304.status).toBe(304)
    expect(await scriptRes304.text()).toBe('')

    // 3. Updating unread state rotates the cached script ETag -> 200 with new ETag
    proxy.setUnreadState(['sess-unread-1'])
    const scriptRes2 = await fetch(`${origin}/__md/bridge.js`, {
      headers: { cookie, 'if-none-match': etag1! },
    })
    expect(scriptRes2.status).toBe(200)
    expect(scriptRes2.headers.get('etag')).not.toBe(etag1)

    // 4. Composer draft tracking over /__md/bridge WebSocket + auto-clear on disconnect
    const ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/__md/bridge?client=tab-1`, {
      headers: { cookie },
    })
    cleanups.push(() => ws.terminate())
    await once(ws, 'open')
    ws.send(JSON.stringify({ type: 'ready' }))
    ws.send(JSON.stringify({ type: 'draft', dirty: true }))

    await vi.waitFor(() => {
      expect(proxy.bridgeSnapshot('tab-1').draft).toBe(true)
    })
    expect(draftEvents).toContainEqual({ deviceId: DeviceId('dev-bridge'), dirty: true, clientId: 'tab-1' })

    ws.close()
    await once(ws, 'close')
    await vi.waitFor(() => {
      expect(proxy.bridgeSnapshot('tab-1').draft).toBeUndefined()
    })
    expect(draftEvents.at(-1)).toEqual({ deviceId: DeviceId('dev-bridge'), dirty: false, clientId: 'tab-1' })
  })

  it('configures POSIX SSH ControlMaster multiplexing and drains execSshCommand promptly when mux master holds stdio open', async () => {
    if (process.platform !== 'win32') {
      const muxArgs = sshControlMultiplexArgs()
      expect(muxArgs).toContain('ControlMaster=auto')
      expect(muxArgs).toContain('ControlPersist=60')
      const controlPathArg = muxArgs.find(arg => arg.startsWith('ControlPath='))
      expect(controlPathArg).toBeDefined()
      const socketTemplate = controlPathArg!.slice('ControlPath='.length)
      expect(socketTemplate.length).toBeLessThanOrEqual(92)
      const mode = statSync(dirname(socketTemplate)).mode & 0o777
      expect(mode).toBe(0o700)

      const tunnelArgs = buildSystemSshArgs({ kind: 'ssh', host: 'gpu-dev' }, 41234)
      expect(tunnelArgs).toContain('ControlMaster=auto')
    }

    // Simulate OpenSSH spawning a background ControlPersist master that inherits stdout/stderr
    // pipes so 'exit' fires immediately with code 0 while 'close' never fires.
    setSshSpawn((() => {
      const child = new EventEmitter() as any
      child.stdout = Object.assign(new EventEmitter(), { destroy: vi.fn() })
      child.stderr = Object.assign(new EventEmitter(), { destroy: vi.fn() })
      child.kill = vi.fn()
      setTimeout(() => {
        child.stdout.emit('data', Buffer.from('mux-fast-output'))
        child.emit('exit', 0)
        // Intentionally do NOT emit 'close'!
      }, 5)
      return child
    }) as any)

    const startedAt = Date.now()
    const result = await execSshCommand({ kind: 'ssh', host: 'mux-host', engine: 'system-ssh' }, 'echo ok', 5_000)
    const elapsedMs = Date.now() - startedAt
    expect(result).toEqual({ ok: true, stdout: 'mux-fast-output' })
    expect(elapsedMs).toBeLessThan(400)
  })

  it('reuses preflight-verified cookie auth and 0.2 protocol capability when upsertDevice follows testDeviceConnection', async () => {
    let tokenExchanges = 0
    let hostDescribeCalls = 0

    const httpServer: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (req.method === 'GET' && url.pathname === '/' && url.searchParams.get('token') === 'launch-secret-p1') {
        tokenExchanges += 1
        res.writeHead(303, {
          location: '/',
          'set-cookie': 'dsh-auth-p1=verified-cookie-val; Path=/; HttpOnly',
        })
        res.end()
        return
      }

      if (!(req.headers.cookie ?? '').includes('dsh-auth-p1=verified-cookie-val')) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'unauthorized' }))
        return
      }

      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { rpcId?: string }
        res.writeHead(200, { 'content-type': 'application/json' })
        if (url.pathname === '/api/host.describe') {
          hostDescribeCalls += 1
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

    const wss = new WebSocketServer({ server: httpServer, path: '/api/remote.mux' })
    wss.on('connection', (ws, req) => {
      if (!(req.headers.cookie ?? '').includes('dsh-auth-p1=verified-cookie-val')) {
        ws.close(1008, 'unauthorized')
        return
      }
      ws.on('message', (raw) => {
        const frame = JSON.parse(String(raw)) as { type?: string; streamId?: string; endpoint?: string }
        if (frame.type === 'open' && typeof frame.streamId === 'string') {
          if (frame.endpoint === '$events') {
            ws.send(JSON.stringify({
              type: 'item',
              streamId: frame.streamId,
              value: { type: 'ready', clientId: 'c-p1', host: { home: '/home/dev' } },
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
    const port = (httpServer.address() as AddressInfo).port
    const baseUrl = `http://127.0.0.1:${String(port)}`

    const dir = tempDir()
    const registry = new DeviceRegistry(
      join(dir, 'devices.json'),
      join(dir, 'secrets.json'),
      { localPort: () => 3080 },
      { allowDirectTransport: true },
    )
    cleanups.push(async () => {
      registry.dispose()
      await registry.flushPersistence()
    })

    const input = {
      name: 'Preflight Cached Box',
      transport: { kind: 'direct' as const, baseUrl },
      auth: { mode: 'token' as const, credential: 'launch-secret-p1' },
    }

    const preflight = await registry.testDeviceConnection(input)
    expect(preflight.ok).toBe(true)
    expect(tokenExchanges).toBe(1)
    expect(hostDescribeCalls).toBe(1)

    const saved = await registry.upsertDevice(input)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    await vi.waitFor(() => {
      const view = registry.snapshot().devices.find(d => d.id === saved.device.id)
      expect(view?.state).toBe('connected')
    }, { timeout: 3_000 })

    // Neither token exchange nor host.describe was repeated on save!
    expect(tokenExchanges).toBe(1)
    expect(hostDescribeCalls).toBe(1)
  })
})

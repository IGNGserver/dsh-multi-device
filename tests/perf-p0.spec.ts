/**
 * Phase P0 performance & runtime optimization regression suite.
 */
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGunzip, gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { DeviceId, type DeviceConfig, type MultiDeviceSnapshot } from '../src/contract.ts'
import { DeviceAuthManager, readRemoteCredentials } from '../src/host/auth.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import { RemoteDeviceClient } from '../src/host/remote-client.ts'
import * as tunnelModule from '../src/host/tunnel.ts'
import { MultiDeviceControlPlane } from '../src/runtime.ts'

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  while (cleanups.length > 0) {
    await cleanups.pop()!()
  }
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-md-perf-p0-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

describe('Phase P0 optimizations', () => {
  it('skips PowerShell SSH cold-start when POSIX credential read exits 0 without a secret', async () => {
    const execSpy = vi.spyOn(tunnelModule, 'execSshCommand')
      .mockResolvedValueOnce({ ok: true, stdout: '' })
    const result = await readRemoteCredentials({ kind: 'ssh', host: 'dev-posix' }, '~/.dsh')
    expect(result.ok).toBe(false)
    expect(execSpy).toHaveBeenCalledTimes(1)
  })

  it('still falls back to PowerShell when POSIX credential read fails on Windows shells', async () => {
    const secret = Buffer.alloc(32, 7).toString('base64url')
    const yaml = `client-connection/browser-session:\n  payload:\n    secret: ${secret}\n`
    const execSpy = vi.spyOn(tunnelModule, 'execSshCommand')
      .mockResolvedValueOnce({ ok: false, error: "'cat' is not recognized" })
      .mockResolvedValueOnce({ ok: true, stdout: yaml })
    const result = await readRemoteCredentials({ kind: 'ssh', host: 'dev-win' }, '~/.dsh')
    expect(result).toEqual({ ok: true, text: yaml })
    expect(execSpy).toHaveBeenCalledTimes(2)
  })

  it('probes session/list + host.describe concurrently on cold connect and skips host.describe on 0.2 reconnect', async () => {
    let hostDescribeCalls = 0
    let sessionListCalls = 0
    const callTimestamps: { method: string; at: number }[] = []

    const httpServer: Server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { rpcId?: string; method?: string }
        callTimestamps.push({ method: req.url ?? '', at: Date.now() })
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' })
          if (req.url === '/api/host.describe') {
            hostDescribeCalls += 1
            res.end(JSON.stringify({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value: { version: '0.2.1' } } }))
            return
          }
          sessionListCalls += 1
          res.end(JSON.stringify({
            type: 'server-response',
            rpcId: body.rpcId,
            result: { ok: true, value: { items: [] } },
          }))
        }, 40)
      })
    })
    const wss = new WebSocketServer({ server: httpServer, path: '/api/remote.mux' })
    wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        const frame = JSON.parse(String(raw)) as { type?: string; streamId?: string; endpoint?: string }
        if (frame.type === 'open' && typeof frame.streamId === 'string') {
          if (frame.endpoint === '$events') {
            ws.send(JSON.stringify({
              type: 'item',
              streamId: frame.streamId,
              value: { type: 'ready', clientId: 'c1', host: { home: '/home/dev' } },
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
      for (const clientSocket of wss.clients) clientSocket.terminate()
      wss.close(() => {
        httpServer.close(() => resolve())
      })
    }))
    const port = (httpServer.address() as AddressInfo).port
    const baseUrl = `http://127.0.0.1:${String(port)}`

    const config: DeviceConfig = {
      id: DeviceId('dev-fast'),
      name: 'Fast 0.2',
      enabled: true,
      transport: { kind: 'direct', baseUrl },
      auth: { mode: 'none' },
    }
    const client = new RemoteDeviceClient(config, new DeviceAuthManager(), {
      onStateChanged: () => {},
      onRemoteEventFrame: () => {},
      onControlProjectionFrame: () => {},
      onWorkspacesChanged: () => {},
      onGitRemotesDiscovered: () => {},
      onModelCatalogChanged: () => {},
    })
    cleanups.push(() => client.stop())

    client.start()
    await vi.waitFor(() => expect(client.isConnected()).toBe(true), { timeout: 3_000 })
    expect(hostDescribeCalls).toBe(1)
    // Both cold-probe requests must have been dispatched concurrently before the 40ms response delay
    expect(Math.abs(callTimestamps[0]!.at - callTimestamps[1]!.at)).toBeLessThan(35)

    // Trigger reconnect to the same target: host.describe must be skipped!
    const listBeforeReconnect = sessionListCalls
    client.reconnectNow()
    await vi.waitFor(() => {
      expect(client.isConnected()).toBe(true)
      expect(sessionListCalls).toBeGreaterThan(listBeforeReconnect)
    }, { timeout: 3_000 })
    expect(hostDescribeCalls).toBe(1)
  })

  it('coalesces synchronous revision bursts via microtask and streams Z_SYNC_FLUSH gzip over HTTP & SSE', async () => {
    const dir = tempDir()
    const registry = new DeviceRegistry(
      join(dir, 'devices.json'),
      join(dir, 'secrets.json'),
      {
        localPort: () => 3080,
        localSessionCatalog: async () => Array.from({ length: 40 }, (_, idx) => ({
          sessionId: `local-session-${String(idx).padStart(4, '0')}-${'x'.repeat(32)}`,
          deviceId: DeviceId('local'),
          running: idx % 3 === 0,
          blank: false,
        })),
      },
    )
    cleanups.push(async () => {
      registry.dispose()
      await registry.flushPersistence()
    })
    await registry.refreshLocalCatalog()

    const plane = new MultiDeviceControlPlane(registry, () => true)

    // 1. Test HTTP GET /multi-device/api gzip compression
    const apiReq = new EventEmitter() as any
    apiReq.method = 'GET'
    apiReq.url = '/multi-device/api?clientId=gzip-client'
    apiReq.headers = { host: '127.0.0.1:3080', 'accept-encoding': 'gzip, deflate, br' }
    let apiStatus = 0
    let apiHeaders: Record<string, string> = {}
    let apiBody: Buffer = Buffer.alloc(0)
    const apiRes = new EventEmitter() as any
    apiRes.writeHead = (status: number, headers: Record<string, string>) => {
      apiStatus = status
      apiHeaders = headers
      return apiRes
    }
    apiRes.end = (chunk: Buffer | string) => {
      apiBody = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      return apiRes
    }
    await plane.handleApiHttp(apiReq, apiRes)
    expect(apiStatus).toBe(200)
    expect(apiHeaders['content-encoding']).toBe('gzip')
    const decodedApi = JSON.parse(gunzipSync(apiBody).toString('utf8')) as { ok: boolean; value: MultiDeviceSnapshot }
    expect(decodedApi.ok).toBe(true)
    expect(decodedApi.value.attentionByDevice.local?.eligibleSessionIds).toHaveLength(40)
    expect(apiBody.byteLength).toBeLessThan(gunzipSync(apiBody).byteLength / 2)

    // 2. Test SSE microtask coalescing + incremental Z_SYNC_FLUSH gzip decompression
    const sseReq = new EventEmitter() as any
    sseReq.url = '/multi-device/events?clientId=sse-gzip'
    sseReq.headers = { host: '127.0.0.1:3080', 'accept-encoding': 'gzip' }
    let sseHeaders: Record<string, string> = {}
    const gunzip = createGunzip()
    let decompressedText = ''
    gunzip.on('data', (chunk: Buffer) => {
      decompressedText += chunk.toString('utf8')
    })
    const sseRes = new EventEmitter() as any
    sseRes.destroyed = false
    sseRes.writableNeedDrain = false
    sseRes.writeHead = (_status: number, headers: Record<string, string>) => {
      sseHeaders = headers
      return sseRes
    }
    sseRes.write = (chunk: Buffer | string) => {
      gunzip.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      return true
    }
    sseRes.destroy = () => {
      sseRes.destroyed = true
      sseRes.emit('close')
      return sseRes
    }

    plane.handleEventsSse(sseReq, sseRes)
    expect(sseHeaders['content-encoding']).toBe('gzip')
    await vi.waitFor(() => expect(decompressedText.split('\n\n').filter(Boolean)).toHaveLength(1))

    // Fire 5 synchronous revision bumps WITHOUT socket backpressure: must coalesce into 1 snapshot!
    const snapSpy = vi.spyOn(registry, 'snapshot')
    for (let i = 0; i < 5; i += 1) {
      ;(registry as any).bumpRevision()
    }
    await vi.waitFor(() => expect(decompressedText.split('\n\n').filter(Boolean)).toHaveLength(2))
    expect(snapSpy).toHaveBeenCalledTimes(1)

    sseReq.emit('close')
    gunzip.destroy()
  })

  it('persists background schedulePersist changes asynchronously without blocking on synchronous storage.write', async () => {
    const dir = tempDir()
    const registry = new DeviceRegistry(
      join(dir, 'devices.json'),
      join(dir, 'secrets.json'),
      { localPort: () => 3080 },
    )
    cleanups.push(async () => {
      registry.dispose()
      await registry.flushPersistence()
    })

    const syncWriteSpy = vi.spyOn((registry as any).storage, 'write')
    const asyncWriteSpy = vi.spyOn((registry as any).storage, 'writeAsync')

    const patched = registry.patchLocalUiState({ groups: { '/repo/a': false } })
    expect(patched.ok).toBe(true)

    await vi.waitFor(() => expect(asyncWriteSpy).toHaveBeenCalledTimes(1), { timeout: 2_500 })
    expect(syncWriteSpy).not.toHaveBeenCalled()
  })
})

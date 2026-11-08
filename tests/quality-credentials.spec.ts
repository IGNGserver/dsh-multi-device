import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceId, type DeviceConfig, type UpsertDeviceInput } from '../src/contract.ts'
import { DeviceAuthManager, dshCookieName } from '../src/host/auth.ts'
import { responseAsFetchResponse } from '../src/host/http-request.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import { RemoteDeviceClient } from '../src/host/remote-client.ts'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.restoreAllMocks()
})

function scratch() {
  const directory = mkdtempSync(join(process.cwd(), '.quality-credentials-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

function registryAt(directory: string) {
  const registry = new DeviceRegistry(join(directory, 'state.json'), join(directory, 'secrets.json'), {
    localPort: () => 3080,
    localWorkspaces: () => [],
    localSessionUpdatedAt: () => new Map(),
  }, { enableNativeProxy: false, enableTunnels: false, allowDirectTransport: true })
  cleanups.push(() => registry.dispose())
  return registry
}

async function server(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const instance = createServer(handler)
  await new Promise<void>(resolve => instance.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => new Promise<void>((resolve, reject) => instance.close(error => error ? reject(error) : resolve())))
  const address = instance.address()
  if (address === null || typeof address === 'string') throw new Error('missing fixture port')
  return `http://127.0.0.1:${address.port}`
}

function rpcList(res: ServerResponse) {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ result: { ok: true, value: { protocolVersion: '0.2.21', items: [] } } }))
}

const token = Buffer.alloc(32, 23).toString('base64url')

describe('credential isolation during probes', () => {
  it('never removes a real probe-temp credential, including concurrent probes', async () => {
    const directory = scratch()
    const secretsPath = join(directory, 'secrets.json')
    const auth = new DeviceAuthManager(secretsPath)
    auth.setAuthCredential(DeviceId('probe-temp'), 'real-user-credential')
    const baseUrl = await server((req, res) => {
      if (req.url?.startsWith('/?token=')) {
        res.writeHead(303, { 'set-cookie': `${dshCookieName('127.0.0.1:3080')}=probe; Path=/; HttpOnly` })
        res.end()
      } else if (req.url === '/api/session/list') rpcList(res)
      else { res.writeHead(404); res.end() }
    })
    const registry = registryAt(directory)
    const input: UpsertDeviceInput = {
      name: 'Candidate', enabled: true,
      transport: { kind: 'direct', baseUrl },
      auth: { mode: 'token', credential: token },
    }
    const results = await Promise.all([registry.testDeviceConnection(input), registry.testDeviceConnection(input)])
    expect(results.every(result => result.ok)).toBe(true)
    expect(new DeviceAuthManager(secretsPath).storedSecret(DeviceId('probe-temp'))?.authCredential).toBe('real-user-credential')
  })
})

describe('remote unary authentication recovery', () => {
  function client(baseUrl: string, states: string[] = []) {
    const config: DeviceConfig = {
      id: DeviceId('auth-client'), name: 'Auth client', enabled: true,
      transport: { kind: 'direct', baseUrl },
      auth: { mode: 'token', credential: token },
    }
    const instance = new RemoteDeviceClient(config, new DeviceAuthManager(), {
      onStateChanged: () => {}, onRemoteEventFrame: () => {}, onControlProjectionFrame: () => {},
      onWorkspacesChanged: () => {}, onGitRemotesDiscovered: () => {}, onModelCatalogChanged: () => {},
      onAuthState: (_id, state) => { states.push(state) },
    })
    ;(instance as any).protocolVersion = '0.2'
    ;(instance as any).state = 'connected'
    cleanups.push(() => instance.stop())
    return instance
  }

  it('single-flights token renewal and retries two unary requests once', async () => {
    let exchanges = 0
    let rpcCalls = 0
    let cookieName = ''
    const baseUrl = await server((req, res) => {
      if (req.url?.startsWith('/?token=')) {
        exchanges += 1
        cookieName = dshCookieName(new URL(baseUrl).host)
        res.writeHead(303, { 'set-cookie': `${cookieName}=fresh; Path=/; HttpOnly` })
        res.end()
        return
      }
      if (req.url === '/api/session/list') {
        rpcCalls += 1
        if (req.headers.cookie === `${cookieName}=fresh`) { rpcList(res); return }
        res.writeHead(401); res.end('expired')
        return
      }
      res.writeHead(404); res.end()
    })
    const states: string[] = []
    const instance = client(baseUrl, states)
    const results = await Promise.all([
      instance.invokeUnary('session', 'list', {}),
      instance.invokeUnary('session', 'list', {}),
    ])
    expect(results).toHaveLength(2)
    expect(exchanges).toBe(1)
    expect(rpcCalls).toBe(4)
    expect(states).toContain('ok')
    expect(states).not.toContain('required')
  })

  it('surfaces a persistent required state when renewal fails', async () => {
    const baseUrl = await server((req, res) => {
      res.writeHead(401)
      res.end(req.url?.startsWith('/?token=') ? 'bad token' : 'expired')
    })
    const states: string[] = []
    const instance = client(baseUrl, states)
    await expect(instance.invokeUnary('session', 'list', {})).rejects.toThrow('HTTP 401')
    expect(instance.connectionState).toBe('error')
    expect(states).toContain('required')
  })

  it('returns a structured multipart error instead of parsing the whole body as JSON', async () => {
    const boundary = 'quality-boundary'
    const metadata = JSON.stringify({ result: { ok: false, error: { code: 'fixture/denied', message: 'multipart denied' } } })
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}--\r\n`
    const baseUrl = await server((_req, res) => {
      res.writeHead(200, { 'content-type': `multipart/form-data; boundary=${boundary}` })
      res.end(body)
    })
    const instance = client(baseUrl)
    await expect(instance.invokeUnary('attachment', 'read', {})).rejects.toMatchObject({ message: 'multipart denied', code: 'fixture/denied' })
  })
})

describe('buffered Fetch response compatibility', () => {
  it.each([204, 205, 304])('uses a null body for HTTP %s', async status => {
    const response = responseAsFetchResponse({ status, statusText: 'fixture', headers: {}, body: Buffer.from('ignored') })
    expect(response.status).toBe(status)
    expect(response.body).toBeNull()
    expect((await response.arrayBuffer()).byteLength).toBe(0)
  })

  it('preserves ordinary bodies and status text', async () => {
    const response = responseAsFetchResponse({ status: 201, statusText: 'Created fixture', headers: {}, body: Buffer.from('created') })
    expect(response.statusText).toBe('Created fixture')
    expect(await response.text()).toBe('created')
  })
})

/** Focused first-batch auth regressions. All credentials below are synthetic fixtures. */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import React from 'react'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceId, type DeviceConfig, type DeviceView } from '../src/contract.ts'
import { DeviceAuthManager, dshCookieName } from '../src/host/auth.ts'
import { RemoteDeviceClient } from '../src/host/remote-client.ts'
import { setSshSpawn } from '../src/host/tunnel.ts'

const ID = DeviceId('auth-regression-fixture')
const TOKEN = Buffer.alloc(32, 17).toString('base64url')
const AUTHORITY = '127.0.0.1:3080'
const COOKIE = `${dshCookieName(AUTHORITY)}=server-issued-fixture`
const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

function device(overrides: Partial<DeviceConfig> = {}): DeviceConfig {
  return {
    id: ID, name: 'Fixture', enabled: true,
    transport: { kind: 'ssh', host: 'fixture-a', remotePort: 3080 },
    auth: { mode: 'token', credential: TOKEN },
    ...overrides,
  }
}

async function launchServer(handler?: (req: IncomingMessage, res: ServerResponse) => void) {
  const requests: string[] = []
  const server = createServer((req, res) => {
    requests.push(req.url ?? '')
    if (handler !== undefined) return handler(req, res)
    res.writeHead(303, { 'set-cookie': `${COOKIE}; Path=/; HttpOnly`, location: '/' })
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected fixture TCP listener')
  return { url: `http://127.0.0.1:${address.port}`, requests }
}

function secretFile(): string {
  // Keep all test artifacts in the caller's scratch checkout, not /tmp or user DSH_HOME.
  const dir = mkdtempSync(join(process.cwd(), '.auth-regressions-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  return join(dir, 'synthetic-secrets.json')
}

describe('launch token exchange and target/credential-bound cache', () => {
  it.each(['auto', 'token'] as const)('exchanges a bare 32-byte base64url token in %s mode; never guesses a signing secret', async mode => {
    const server = await launchServer()
    const auth = new DeviceAuthManager()
    const config = device({ auth: { mode, credential: TOKEN } })
    expect(await auth.ensureAuthenticated(config, server.url)).toEqual({ ok: true })
    expect(server.requests).toEqual([`/?token=${TOKEN}`])
    expect(auth.getAuthHeaders(config).Cookie).toBe(COOKIE)
    expect(auth.storedSecret(ID)?.signingSecret).toBeUndefined()
    expect(auth.storedSecret(ID)?.cacheBinding).toMatch(/^[a-f0-9]{64}$/u)
  })

  it('exchanges a launch URL token, preserving no-redirect behavior', async () => {
    const server = await launchServer()
    const auth = new DeviceAuthManager()
    const config = device({ auth: { mode: 'token', credential: `https://fixture.invalid/?token=${TOKEN}` } })
    expect(await auth.ensureAuthenticated(config, server.url)).toEqual({ ok: true })
    expect(server.requests).toEqual([`/?token=${TOKEN}`])
    expect(auth.getAuthHeaders(config).Cookie).toBe(COOKIE)
  })

  it('reports rejected bare tokens instead of manufacturing a local cookie', async () => {
    const server = await launchServer((_req, res) => { res.writeHead(401); res.end() })
    const auth = new DeviceAuthManager()
    expect(await auth.ensureAuthenticated(device(), server.url)).toMatchObject({ ok: false, error: expect.stringContaining('401') })
    expect(server.requests).toHaveLength(1)
    expect(auth.getAuthHeaders(device()).Cookie).toBeUndefined()
  })

  it('reuses a bound SSH cookie across ephemeral tunnel ports and process reloads', async () => {
    const server = await launchServer()
    const path = secretFile()
    const auth = new DeviceAuthManager(path)
    auth.setAuthCredential(ID, TOKEN)
    const config = device({ auth: { mode: 'token' } })
    expect(await auth.ensureAuthenticated(config, server.url)).toEqual({ ok: true })
    const reloaded = new DeviceAuthManager(path)
    expect(await reloaded.ensureAuthenticated(config, 'http://127.0.0.1:1')).toEqual({ ok: true })
    expect(reloaded.getAuthHeaders(config).Cookie).toBe(COOKIE)
    expect(server.requests).toHaveLength(1)
  })

  it.each([
    { host: 'fixture-b' }, { port: 2222 }, { username: 'another-user' },
    { remoteBindHost: 'localhost' }, { remotePort: 3081 },
    { remoteDshHome: '~/.alternate-dsh' }, { proxyJump: 'jump-fixture' },
    { privateKeyPath: '/synthetic/key' }, { bootstrapFromRemoteCredentials: true },
  ])('does not forward cached cookies after SSH target/policy edit %j', async patch => {
    const server = await launchServer()
    const auth = new DeviceAuthManager()
    const original = device()
    await auth.ensureAuthenticated(original, server.url)
    const changed = device({ transport: { kind: 'ssh', host: 'fixture-a', remotePort: 3080, ...patch } })
    expect(auth.getAuthHeaders(changed).Cookie).toBeUndefined()
    expect(auth.storedSecret(ID)?.cookie).toBeUndefined()
    // A host switch must also miss ensureAuthenticated's fast path.
    expect(await auth.ensureAuthenticated(changed, server.url)).toEqual({ ok: true })
    expect(server.requests).toHaveLength(2)
  })

  it('invalidates on ensureAuthenticated before a failed exchange to a new SSH host', async () => {
    let reject = false
    const server = await launchServer((_req, res) => {
      res.writeHead(reject ? 401 : 303, reject ? {} : { 'set-cookie': COOKIE })
      res.end()
    })
    const auth = new DeviceAuthManager()
    await auth.ensureAuthenticated(device(), server.url)
    reject = true
    const changed = device({ transport: { kind: 'ssh', host: 'fixture-b' } })
    expect(await auth.ensureAuthenticated(changed, server.url)).toMatchObject({ ok: false })
    expect(auth.getAuthHeaders(changed).Cookie).toBeUndefined()
  })

  it('binds direct URL scheme/path and transport kind even with matching cookie authority', async () => {
    const server = await launchServer()
    const auth = new DeviceAuthManager()
    const direct = device({ transport: { kind: 'direct', baseUrl: `http://${AUTHORITY}/a` } })
    await auth.ensureAuthenticated(direct, server.url)
    expect(auth.getAuthHeaders(device({ transport: { kind: 'direct', baseUrl: `http://${AUTHORITY}/b` } })).Cookie).toBeUndefined()
    await auth.ensureAuthenticated(direct, server.url)
    expect(auth.getAuthHeaders(device()).Cookie).toBeUndefined()
    await auth.ensureAuthenticated(direct, server.url)
    expect(auth.getAuthHeaders(device({ transport: { kind: 'direct', baseUrl: `https://${AUTHORITY}/a` } })).Cookie).toBeUndefined()
  })

  it('invalidates immediately on stored credential replacement/clear while preserving passphrase', async () => {
    const server = await launchServer()
    const auth = new DeviceAuthManager()
    const config = device({ auth: { mode: 'token' } })
    auth.setAuthCredential(ID, TOKEN)
    auth.setSshPassphrase(ID, 'synthetic-passphrase')
    await auth.ensureAuthenticated(config, server.url)
    const version = auth.storedSecret(ID)?.credentialVersion ?? 0
    auth.setAuthCredential(ID, 'replacement-fixture')
    expect(auth.storedSecret(ID)?.credentialVersion).toBe(version + 1)
    expect(auth.getAuthHeaders(config).Cookie).toBeUndefined()
    expect(auth.storedSecret(ID)?.sshPassphrase).toBe('synthetic-passphrase')
    await auth.ensureAuthenticated(config, server.url)
    expect(server.requests.at(-1)).toBe('/?token=replacement-fixture')
    auth.setAuthCredential(ID, undefined)
    expect(auth.storedSecret(ID)?.authCredential).toBeUndefined()
    expect(auth.storedSecret(ID)?.cookie).toBeUndefined()
  })

  it('keeps the same trimmed stored credential cache but rejects an inline replacement or mode change', async () => {
    const server = await launchServer()
    const auth = new DeviceAuthManager()
    const config = device({ auth: { mode: 'token' } })
    auth.setAuthCredential(ID, TOKEN)
    await auth.ensureAuthenticated(config, server.url)
    auth.setAuthCredential(ID, ` ${TOKEN} `)
    expect(auth.getAuthHeaders(config).Cookie).toBe(COOKIE)
    expect(auth.getAuthHeaders(device({ auth: { mode: 'token', credential: 'new-inline-fixture' } })).Cookie).toBeUndefined()
    await auth.ensureAuthenticated(config, server.url)
    expect(auth.getAuthHeaders(device({ auth: { mode: 'auto' } })).Cookie).toBeUndefined()
  })

  it('drops legacy unbound derived secrets but retains explicit credentials/passphrases and document v1', () => {
    const path = secretFile()
    writeFileSync(path, JSON.stringify({ version: 1, secrets: { [ID]: {
      deviceId: ID, updatedAt: 1, cookie: COOKIE, cookieAuthority: AUTHORITY,
      bearerToken: 'legacy-derived-bearer', signingSecret: TOKEN,
      authCredential: 'legacy-launch-fixture', sshPassphrase: 'legacy-passphrase-fixture',
    } } }))
    const auth = new DeviceAuthManager(path)
    expect(auth.storedSecret(ID)).toEqual({ deviceId: ID, updatedAt: 1,
      authCredential: 'legacy-launch-fixture', sshPassphrase: 'legacy-passphrase-fixture' })
    expect(auth.getAuthHeaders(device({ auth: { mode: 'auto' } })).Cookie).toBeUndefined()
    const persisted = JSON.parse(readFileSync(path, 'utf8'))
    expect(persisted.version).toBe(1)
    expect(persisted.secrets[ID].cookie).toBeUndefined()
    expect(persisted.secrets[ID].bearerToken).toBeUndefined()
    expect(persisted.secrets[ID].signingSecret).toBeUndefined()
  })

  it('rejects an in-flight token exchange after the persisted credential version changes', async () => {
    let reply: ServerResponse | undefined
    let received!: () => void
    const ready = new Promise<void>(resolve => { received = resolve })
    const server = await launchServer((_req, res) => { reply = res; received() })
    const auth = new DeviceAuthManager()
    auth.setAuthCredential(ID, TOKEN)
    const pending = auth.ensureAuthenticated(device({ auth: { mode: 'token' } }), server.url)
    await ready
    auth.setAuthCredential(ID, 'rotated-during-exchange')
    reply!.writeHead(303, { 'set-cookie': COOKIE })
    reply!.end()
    expect(await pending).toMatchObject({ ok: false, error: expect.stringContaining('changed') })
    expect(auth.storedSecret(ID)?.cookie).toBeUndefined()
    expect(auth.storedSecret(ID)?.authCredential).toBe('rotated-during-exchange')
  })

  it('retains explicit cookie/bearer modes and unauthenticated none mode', () => {
    const auth = new DeviceAuthManager()
    expect(auth.getAuthHeaders(device({ auth: { mode: 'cookie', credential: 'explicit=fixture' } })).Cookie).toBe('explicit=fixture')
    expect(auth.getAuthHeaders(device({ auth: { mode: 'bearer', credential: 'explicit-fixture' } })).Authorization).toBe('Bearer explicit-fixture')
    expect(auth.getAuthHeaders(device({ auth: { mode: 'none' } }))).not.toHaveProperty('Cookie')
  })
})

function view(bootstrap: boolean | undefined): DeviceView {
  const config = device({ transport: { kind: 'ssh', host: 'fixture-a',
    ...(bootstrap !== undefined ? { bootstrapFromRemoteCredentials: bootstrap } : {}) } })
  const noop = () => {}
  return new RemoteDeviceClient(config, new DeviceAuthManager(), {
    onStateChanged: noop, onRemoteEventFrame: noop, onControlProjectionFrame: noop,
    onWorkspacesChanged: noop, onGitRemotesDiscovered: noop, onModelCatalogChanged: noop,
  }).toView()
}

/**
 * Compile only the actual private form into a lightweight hook harness. This
 * exercises its real initializer/buildInput/events without exposing test-only
 * production exports, a DOM dependency, or globally mocking the large suite.
 */
function editorHarness(initialDevice?: DeviceView) {
  const source = readFileSync(new URL('../src/client/MultiDeviceHubPanel.tsx', import.meta.url), 'utf8')
  const form = source.slice(source.indexOf('function DeviceEditorForm('), source.indexOf('export function MultiDeviceHubPanel('))
  const testDevice = vi.fn(async (_input: unknown) => ({ ok: true, remoteDshVersion: 'fixture', latencyMs: 0 }))
  const upsertDevice = vi.fn(async (_input: unknown) => ({ ok: true }))
  const states: unknown[] = []
  let cursor = 0
  const context: Record<string, unknown> = {
    React, useId: () => 'fixture',
    useState(initial: unknown) {
      const index = cursor++
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], (value: unknown) => { states[index] = value }]
    },
    hasCustomAdvancedFields: () => true,
    parseSshHostInput: (host: string) => ({ host }),
    clientStore: { testDevice, upsertDevice },
  }
  for (const name of ['Input', 'Button', 'Switch', 'DisclosureRow', 'DshSelect', 'SecretCredentialInput', 'StateDot']) context[name] = name
  const js = ts.transpileModule(`${form}\nglobalThis.editor = DeviceEditorForm`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(js, context)
  const render = () => {
    cursor = 0
    return (context.editor as (props: object) => React.ReactElement)({
      device: initialDevice, sshConfigHosts: [], sshKeys: [], t: (key: string) => key,
      onSaved: () => {}, onCancel: () => {},
    })
  }
  function elements(node: React.ReactNode): React.ReactElement[] {
    if (!React.isValidElement(node)) return []
    return [node, ...React.Children.toArray(node.props.children).flatMap(elements)]
  }
  const get = (predicate: (element: React.ReactElement) => boolean) => {
    const element = elements(render()).find(predicate)
    if (element === undefined) throw new Error('Fixture form element not found')
    return element
  }
  return { render, get, testDevice, upsertDevice }
}

async function flushFormEvents(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

describe('bootstrap policy projection and form round trips', () => {
  it.each([undefined, false, true])('only performs synthetic SSH bootstrap for explicit true (stored %s)', async value => {
    let calls = 0
    setSshSpawn(() => {
      calls += 1
      const proc = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter; stderr: EventEmitter; stdin: null; kill: () => boolean
      }
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      proc.stdin = null
      proc.kill = () => true
      queueMicrotask(() => {
        proc.stdout.emit('data', Buffer.from(`client-connection/browser-session:\n  payload:\n    secret: ${TOKEN}\n`))
        proc.emit('close', 0)
      })
      return proc as never
    })
    cleanup.push(() => setSshSpawn(null))
    const auth = new DeviceAuthManager()
    const config = device({ auth: { mode: 'auto' }, transport: {
      kind: 'ssh', host: 'fixture-a',
      ...(value !== undefined ? { bootstrapFromRemoteCredentials: value } : {}),
    } })
    expect(await auth.ensureAuthenticated(config, 'http://127.0.0.1:1')).toEqual({ ok: true })
    expect(calls).toBe(value === true ? 1 : 0)
    if (value === true) {
      expect(auth.getAuthHeaders(config).Cookie).toMatch(/^dsh-auth-.*=v1\./u)
      expect(auth.storedSecret(ID)?.signingSecret).toBeUndefined()
      expect(auth.storedSecret(ID)?.cacheBinding).toMatch(/^[a-f0-9]{64}$/u)
    } else expect(auth.getAuthHeaders(config).Cookie).toBeUndefined()
  })

  it.each([undefined, false, true])('projects stored bootstrap %s as an explicit boolean', value => {
    expect(view(value).ssh).toHaveProperty('bootstrapFromRemoteCredentials', value === true)
  })

  it.each([undefined, false, true])('edits existing bootstrap %s without silently enabling it', async value => {
    // Also cover the legacy client view where the field was omitted.
    const current = view(value)
    if (value === undefined) delete (current.ssh as { bootstrapFromRemoteCredentials?: boolean }).bootstrapFromRemoteCredentials
    const harness = editorHarness(current)
    expect(harness.get(element => element.type === 'Switch' && element.props.label === 'authBootstrap').props.checked).toBe(value === true)
    harness.get(element => element.type === 'Button' && element.props.children === 'testConnection').props.onClick()
    expect(harness.testDevice.mock.calls[0]?.[0]).toMatchObject({ transport: { bootstrapFromRemoteCredentials: value === true } })
    await flushFormEvents()
    harness.render().props.onSubmit({ preventDefault() {} })
    await flushFormEvents()
    expect(harness.upsertDevice.mock.calls[0]?.[0]).toMatchObject({ transport: { bootstrapFromRemoteCredentials: value === true } })
  })

  it('defaults a new device to true, then sends explicit false when switched off', async () => {
    const harness = editorHarness()
    expect(harness.get(element => element.type === 'Switch' && element.props.label === 'authBootstrap').props.checked).toBe(true)
    harness.get(element => element.type === 'Input' && element.props.required === true).props.onChange({ currentTarget: { value: 'fixture-new' } })
    harness.get(element => element.type === 'Button' && element.props.children === 'testConnection').props.onClick()
    expect(harness.testDevice.mock.calls[0]?.[0]).toMatchObject({ transport: { bootstrapFromRemoteCredentials: true } })
    await flushFormEvents()
    harness.get(element => element.type === 'Switch' && element.props.label === 'authBootstrap').props.onChange(false)
    harness.get(element => element.type === 'Button' && element.props.children === 'testConnection').props.onClick()
    expect(harness.testDevice.mock.calls[1]?.[0]).toMatchObject({ transport: { bootstrapFromRemoteCredentials: false } })
  })
})

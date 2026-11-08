#!/usr/bin/env node
/**
 * Official-DSH browser E2E for the device tab strip (Native Mode only).
 *
 * Covers: plugin install into an isolated official Host, a real remote device
 * added over the loopback direct transport, the persistent [本机][device] strip,
 * the device's own DSH page inside the frame, Keep-Alive across tab switches
 * and a full page refresh, per-tab client identity, and the guarantee that no
 * remote Session is ever retained by the local Controller.
 *
 * Never a replacement for the existing GUI.
 * Required absolute paths: DSH_SMOKE_ROOT (scratch OUTSIDE this checkout),
 * DSH_SMOKE_PACKAGE (prebuilt .tgz), DSH_SMOKE_CLI (official lib/bin.js),
 * DSH_SMOKE_PLAYWRIGHT_PATH (installed playwright/index.mjs).
 * Optional DSH_SMOKE_BROWSER_EXECUTABLE or BROWSER_EXECUTABLE: cached Chromium.
 * DSH_SMOKE_DIAGNOSTICS=1 exposes a test-only captured bridge context for failure
 * reports; default E2E never rewrites the bridge or reads private client state.
 * Prerequisites: Node 24+, pnpm 11, Playwright installed in scratch. No build,
 * real profiles, home credentials, SSH agent, or paid-model calls are used.
 * Two official servers use --port 0. Only the control instance installs the tgz.
 * An isolated TEST-ONLY Cordis fixture appends official SDK Session events after
 * official session/create. No session/prompt, agent.followup, or model invocation.
 * Screenshots, redacted logs and report.json survive; credential-bearing runtime
 * profiles and browser user data are removed in finally (also after failures).
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { extractBoot, redact, rpcEnvelope, startupUrl } from './smoke-official-install.mjs'

const check = (condition, message) => { if (!condition) throw new Error(message) }
const log = message => console.log(`[device-browser-smoke +${Date.now() - startedAt}ms] ${message}`)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const children = new Set()
const cancellation = new AbortController()
const MAX_OUTPUT = 2 * 1024 * 1024
const TIMEOUT = 90_000
const startedAt = Date.now()
let interrupted = false

function isolatedEnv(root) {
  const env = {}
  for (const key of ['PATH', 'PNPM_HOME', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'WINDIR', 'LANG', 'LC_ALL', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'all_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS']) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  return Object.assign(env, {
    HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), DSH_HOME: join(root, 'dsh'), DSH_AGENTS_HOME: join(root, 'agents'),
    XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'), XDG_STATE_HOME: join(root, 'state'),
    APPDATA: join(root, 'config'), LOCALAPPDATA: join(root, 'data'), TMPDIR: join(root, 'tmp'), TMP: join(root, 'tmp'), TEMP: join(root, 'tmp'),
    COREPACK_HOME: join(root, 'corepack'), COREPACK_ENABLE_PROJECT_SPEC: '0', pnpm_config_pm_on_fail: 'ignore',
    npm_config_userconfig: join(root, 'empty.npmrc'), npm_config_globalconfig: join(root, 'global.npmrc'),
    npm_config_cache: join(root, 'npm-cache'), npm_config_store_dir: join(root, 'pnpm-store'),
    CI: 'true', NO_COLOR: '1', DO_NOT_TRACK: '1', OTEL_SDK_DISABLED: 'true',
  })
}
async function prepare(root) {
  const env = isolatedEnv(root)
  await mkdir(root, { recursive: true })
  for (const [key, value] of Object.entries(env)) {
    if (/^(HOME|USERPROFILE|DSH_HOME|DSH_AGENTS_HOME|XDG_.*|APPDATA|LOCALAPPDATA|TMPDIR|TMP|TEMP|COREPACK_HOME|npm_config_cache|npm_config_store_dir)$/.test(key)) await mkdir(value, { recursive: true })
  }
  await writeFile(env.npm_config_userconfig, '')
  await writeFile(env.npm_config_globalconfig, '')
  return { cwd: root, env }
}
function ownedSpawn(executable, args, options) {
  check(!interrupted, 'Interrupted; refusing another child')
  const child = spawn(executable, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
  children.add(child)
  child.smokeDone = new Promise(resolve => child.once('close', () => { child.smokeClosed = true; children.delete(child); resolve() }))
  child.smokeOutput = ''
  child.stdout.on('data', chunk => { child.smokeOutput = (child.smokeOutput + chunk.toString()).slice(-MAX_OUTPUT) })
  child.stderr.on('data', chunk => { child.smokeOutput = (child.smokeOutput + chunk.toString()).slice(-MAX_OUTPUT) })
  child.once('error', error => { child.smokeError = error })
  return child
}
async function stopChild(child) {
  if (!child || child.smokeClosed) return
  if (child.smokeStopping) return child.smokeStopping
  child.smokeStopping = (async () => {
    child.kill('SIGTERM')
    let timer
    try {
      await Promise.race([child.smokeDone, new Promise(resolve => { timer = setTimeout(resolve, 10_000) })])
      if (!child.smokeClosed) { child.kill('SIGKILL'); await child.smokeDone }
    } finally { clearTimeout(timer) }
  })()
  return child.smokeStopping
}
async function command(executable, args, options, label) {
  const child = ownedSpawn(executable, args, options)
  let timer
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: timeout`)), 300_000) })
    await Promise.race([child.smokeDone, timeout])
    check(!child.smokeError && child.exitCode === 0, `${label} failed (${child.exitCode}): ${redact(child.smokeError?.message ?? child.smokeOutput)}`)
    return child.smokeOutput
  } finally { clearTimeout(timer); await stopChild(child) }
}
async function eventually(operation, label, timeout = TIMEOUT) {
  let last
  const deadline = Date.now() + timeout
  do {
    check(!interrupted, 'Smoke interrupted')
    try { const value = await operation(); if (value) return value } catch (error) { last = error }
    await delay(200)
  } while (Date.now() < deadline)
  throw new Error(`${label}: timed out${last ? `: ${last.message}` : ''}`)
}
async function request(url, options = {}) {
  return fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(20_000)]) })
}
class Server {
  constructor(cli, options, patch, label) { Object.assign(this, { cli, options, patch, label }) }
  async start() {
    this.child = ownedSpawn(process.execPath, [this.cli, '--profile', 'web', '--patch', this.patch, '--no-open', '--host', '127.0.0.1', '--port', '0'], this.options)
    try {
      const url = await eventually(() => {
        check(!this.child.smokeError && !this.child.smokeClosed, `${this.label} exited: ${redact(this.child.smokeOutput)}`)
        return startupUrl(this.child.smokeOutput)
      }, `${this.label} official startup`)
      this.origin = url.origin
      const response = await request(url)
      check([302, 303].includes(response.status), `${this.label} launch exchange HTTP ${response.status}`)
      this.cookie = response.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
      check(this.cookie, 'Owned server set no auth cookie')
      await response.body?.cancel()
      log(`${this.label} ready on an owned ephemeral port (launch token suppressed)`)
    } catch (error) { await stopChild(this.child); throw error }
  }
  async json(path, body) {
    const url = new URL(path, this.origin)
    check(url.origin === this.origin && url.port !== '3080', 'Request escaped owned server')
    const response = await request(url, { method: body ? 'POST' : 'GET', headers: { cookie: this.cookie, origin: this.origin, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    check(response.ok, `${this.label} ${url.pathname}: HTTP ${response.status}`)
    return response.json()
  }
  async rpc(method, args = {}) {
    const envelope = rpcEnvelope(method, { [method === 'session/list' ? '_request' : 'request']: args })
    const result = await this.json(`/api/${method}`, envelope)
    check(result.type === 'server-response' && result.rpcId === envelope.rpcId && result.result?.ok, `${method}: ${JSON.stringify(result.result ?? result)}`)
    return result.result.value
  }
  async control(action, payload = {}) {
    const result = await this.json('/multi-device/api', { action, payload })
    check(result.ok, `${action}: ${result.error}`)
    return result.value
  }
}
async function absoluteFile(key) {
  const value = process.env[key]
  check(value && isAbsolute(value), `${key} must be an absolute file path`)
  const path = await realpath(value)
  check((await stat(path)).isFile(), `${key} is not a regular file`)
  return path
}
export function knownUpstreamCancellation(row) {
  return row.kind === 'console' && row.level === 'error'
    && /^Sidebar Session opening failed: Error: Session reference "[a-z0-9-]+" is released\n/.test(row.text)
    && row.text.includes('ClientSessionReference.release') && row.text.includes('SidebarSessionView.dispose')
    && !row.text.includes('dsh-multi-device')
}
export function seedPlugin(llmUrl) {
  // Seed only explicitly requested official-RPC identities, not incidental UI
  // blanks. Session append records history but never schedules Agent execution.
  return `import { createUserMessage } from ${JSON.stringify(llmUrl)}\nexport const name = 'device-smoke-seed'\nexport const inject = ['agents', 'sessions']\nexport function apply(ctx) {\n  ctx.on('agent/created', ({ agent }) => {\n    if (!agent.id.startsWith('session-md-smoke-') || agent.session.snapshotEvents().some(e => e.type === 'turn/start')) return\n    agent.session.append('turn/start', { turn: 0 })\n    agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Isolated browser smoke fixture: ' + agent.id }], source: { kind: 'user', rpcId: 'isolated-smoke-fixture' } }), { surfaceOp: 'append' })\n    agent.session.append('turn/end', { turn: 0, reason: { kind: 'interrupted' } })\n  })\n}\n`
}
async function fixture(server, path, label, count) {
  await mkdir(path, { recursive: true })
  const { workspace } = await server.rpc('workspace/create', { path })
  await server.rpc('workspace/rename', { workspaceId: workspace.workspaceId, title: `Smoke ${label} project` })
  const sessions = []
  for (let i = 1; i <= count; i++) {
    const created = await server.rpc('session/create', { workspaceId: workspace.workspaceId, sessionId: `session-md-smoke-${label}-${i}-${randomUUID()}` })
    const title = `Smoke ${label} conversation ${i}`
    await server.rpc('session/rename', { sessionId: created.sessionId, title })
    sessions.push({ id: created.sessionId, title })
  }
  const list = await server.rpc('session/list')
  for (const session of sessions) {
    const row = list.items.find(row => row.sessionId === session.id)
    check(row && row.blank === false && !row.running, `${label}: SDK fixture did not produce a nonempty idle session`)
  }
  return { workspace, sessions }
}
function watchPage(page, records, label) {
  page.on('websocket', socket => {
    records.push({ page: label, kind: 'websocket-open', text: redact(socket.url()) })
    socket.on('framesent', event => {
      let value
      try { value = JSON.parse(typeof event.payload === 'string' ? event.payload : event.payload.toString()) } catch { return }
      records.push({ page: label, kind: 'websocket-rpc-sent', text: redact(socket.url()), type: value.type, method: value.method, rpcId: value.rpcId })
    })
    socket.on('framereceived', event => {
      let value
      try { value = JSON.parse(typeof event.payload === 'string' ? event.payload : event.payload.toString()) } catch { return }
      if (value.result?.ok === false) records.push({ page: label, kind: 'websocket-rpc-error', text: redact(socket.url()), rpcId: value.rpcId, error: redact(JSON.stringify(value.result)) })
    })
    socket.on('close', () => records.push({ page: label, kind: 'websocket-close', text: redact(socket.url()) }))
    socket.on('socketerror', error => records.push({ page: label, kind: 'websocket-error', text: redact(error) }))
  })
  page.on('response', response => {
    if (response.status() < 400) return
    const request = response.request()
    let frame
    try { frame = redact(request.frame().url()) } catch {}
    let payload
    try { const body = request.postDataJSON(); payload = { method: body?.method, action: body?.action, argumentNames: Object.keys(body?.payload?.args ?? {}), clientId: body?.payload?.clientId } } catch {}
    records.push({ page: label, kind: 'http-error', status: response.status(), method: request.method(), text: redact(response.url()), frame, payload })
  })
  page.on('console', message => records.push({ elapsedMs: Date.now() - startedAt, page: label, kind: 'console', level: message.type(), text: redact(message.text()) }))
  page.on('pageerror', error => records.push({ page: label, kind: 'pageerror', text: redact(error.message) }))
}
async function pageSnapshot(page, clientId) {
  return page.evaluate(async id => {
    const response = await fetch(`/multi-device/api?clientId=${encodeURIComponent(id)}`)
    const body = await response.json()
    if (!body.ok) throw new Error(body.error)
    return body.value
  }, clientId)
}
async function dismissWelcome(target) {
  // Official first-launch Preview Notice is per origin (including native proxy).
  // Never force-click through a mask or remove production UI from the DOM.
  const accept = target.getByRole('button', { name: /^(继续|Continue)$/i })
  if (await accept.isVisible().catch(() => false)) {
    if (await accept.isEnabled()) await accept.click()
    await accept.waitFor({ state: 'hidden', timeout: TIMEOUT })
  }
}
/**
 * The device tab strip is the plugin's only navigation surface: 本机 first,
 * one tab per configured device, no display-mode switch.
 */
async function expectTabStrip(page, deviceName) {
  const bar = page.locator('.dsh-md-native-bar')
  await bar.waitFor({ state: 'visible', timeout: TIMEOUT })
  await bar.getByRole('tab', { name: /本机|This Device/ }).waitFor({ state: 'visible', timeout: TIMEOUT })
  await bar.getByRole('tab', { name: new RegExp(deviceName) }).waitFor({ state: 'visible', timeout: TIMEOUT })
  // Aggregated mode is gone: no mode switch may remain in the strip.
  check((await page.locator('.dsh-md-native-mode-switch').count()) === 0, 'Unexpected display-mode switch in the device tab strip')
  return bar
}
async function openDeviceTab(page, deviceName) {
  await dismissWelcome(page)
  const bar = await expectTabStrip(page, deviceName)
  await bar.getByRole('tab', { name: new RegExp(deviceName) }).click()
  const wrapper = page.locator('.dsh-md-native-frame-wrap[data-active="true"]')
  await wrapper.waitFor({ state: 'visible', timeout: TIMEOUT })
  return wrapper
}
async function openLocalTab(page) {
  const bar = page.locator('.dsh-md-native-bar')
  await bar.getByRole('tab', { name: /本机|This Device/ }).click()
  await eventually(async () => (await page.locator('.dsh-md-native-frame-wrap[data-active="true"]').count()) === 0, '本机 tab hides the device frame')
}
async function assertDeviceFrame(page, wrapper, deviceId) {
  const src = await wrapper.locator('iframe').getAttribute('src')
  check(src !== null, 'Device frame has no iframe src')
  const clientId = new URL(src).searchParams.get('md_client')
  check(typeof clientId === 'string' && clientId !== '', 'Device frame is missing its client identity')
  const snapshot = await eventually(async () => {
    const value = await pageSnapshot(page, clientId)
    const device = value.devices.find(candidate => candidate.id === deviceId)
    if (device?.nativePaneState === 'failed') throw new Error(`Bridge failed: ${device.nativePaneError ?? 'unknown'}`)
    return device?.nativePaneState === 'ready' ? value : undefined
  }, 'device page bridge ready')
  const device = snapshot.devices.find(candidate => candidate.id === deviceId)
  check(new URL(src).origin === new URL(device.nativeProxyUrl).origin, 'Device iframe origin does not match the native proxy')
  return clientId
}

export async function main() {
  check(Number(process.versions.node.split('.')[0]) >= 24, 'Requires Node 24+')
  const [cli, packagePath, playwrightPath] = await Promise.all(['DSH_SMOKE_CLI', 'DSH_SMOKE_PACKAGE', 'DSH_SMOKE_PLAYWRIGHT_PATH'].map(absoluteFile))
  check(basename(cli) === 'bin.js' && packagePath.endsWith('.tgz'), 'Expected official bin.js and a packed tgz')
  check(process.env.DSH_SMOKE_ROOT && isAbsolute(process.env.DSH_SMOKE_ROOT), 'DSH_SMOKE_ROOT must be an absolute scratch directory')
  const source = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
  let ancestor = resolve(process.env.DSH_SMOKE_ROOT); const suffix = []
  while (true) {
    try { ancestor = await realpath(ancestor); break } catch (error) {
      if (error.code !== 'ENOENT') throw error
      suffix.unshift(basename(ancestor)); ancestor = dirname(ancestor)
    }
  }
  const root = join(ancestor, ...suffix)
  check(root !== source && !root.startsWith(source + sep), 'Scratch root must be outside the source checkout')
  let packageAncestor = root
  while (true) {
    try {
      if ((await stat(join(packageAncestor, 'package.json'))).isFile()) throw new Error('DSH_SMOKE_ROOT must not be inside a package checkout: official DSH may discover ancestor development bundles; choose a standalone scratch sibling')
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    const parent = dirname(packageAncestor)
    if (parent === packageAncestor) break
    packageAncestor = parent
  }
  await mkdir(root, { recursive: true })
  const run = await mkdtemp(join(root, 'device-browser-'))
  const runtime = join(run, 'runtime'); await mkdir(runtime)
  // Official DSH discovers development bundles from ancestor package.json.
  // An owned plain package boundary prevents inheriting a caller's plugin even
  // when CI/scratch is nested below a package checkout. This is not an install.
  await writeFile(join(runtime, 'package.json'), JSON.stringify({ name: 'dsh-device-smoke-isolation-boundary', version: '0.0.0', private: true, type: 'module' }))
  log(`Artifacts: ${run}`)
  const records = []; const report = { status: 'running', coverage: [], artifacts: run, fixture: 'official SDK append, no prompt/model calls', existingGuiTouched: false }
  let context; let page
  const onSignal = signal => {
    interrupted = true
    cancellation.abort()
    process.exitCode = signal === 'SIGINT' ? 130 : 143
    void Promise.all([...children].map(stopChild))
    void context?.close().catch(() => {})
  }
  const sigint = () => onSignal('SIGINT'); const sigterm = () => onSignal('SIGTERM')
  process.once('SIGINT', sigint); process.once('SIGTERM', sigterm)
  const servers = []
  try {
    report.packageSha256 = createHash('sha256').update(await readFile(packagePath)).digest('hex')
    const options = await prepare(join(runtime, 'control'))
    const remoteOptions = await prepare(join(runtime, 'remote'))
    const browserOptions = await prepare(join(runtime, 'browser'))
    const version = await command(process.execPath, [cli, '--version'], options, 'Official CLI version')
    const pnpm = (await command('pnpm', ['--version'], options, 'Isolated pnpm version')).trim()
    check(/^11\./.test(pnpm), `Official install smoke requires pnpm 11, received ${pnpm}`)
    report.runtime = redact(version.trim()); report.node = process.versions.node
    await command(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', packagePath], options, 'Official install packed plugin')
    const require = createRequire(pathToFileURL(cli))
    const seedPath = join(runtime, 'seed.mjs')
    await writeFile(seedPath, seedPlugin(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')).href))
    const fixturePatch = [{ id: 'session-title-llm', disabled: true }, { id: 'ui-settings-models', config: { credentialOnboarding: false } }, { insert: [{ id: 'device-smoke-seed', name: seedPath }] }]
    const controlPatch = join(runtime, 'control.patch.json'); const remotePatch = join(runtime, 'remote.patch.json')
    await writeFile(controlPatch, JSON.stringify([...fixturePatch, { id: 'dsh-multi-device', config: { features: { directTransport: true } } }]))
    await writeFile(remotePatch, JSON.stringify(fixturePatch))
    const control = new Server(cli, options, controlPatch, 'control'); const remote = new Server(cli, remoteOptions, remotePatch, 'remote')
    servers.push(control, remote)
    await remote.start(); await control.start()
    check(control.origin !== remote.origin, 'Official instances share an origin')
    const rawGraphs = {}
    for (const server of [control, remote]) {
      const response = await request(server.origin, { headers: { cookie: server.cookie } })
      const html = await response.text()
      const graph = extractBoot(html)
      rawGraphs[server.label] = { origin: server.origin, hasPlugin: graph.entries.some(row => row.id === 'dsh-multi-device'), graph }
      const config = await command(process.execPath, [cli, '--profile', 'web', '--patch', server.patch, '--dump-config'], server.options, `${server.label} fixture profile dump`)
      if (process.env.DSH_SMOKE_DIAGNOSTICS === '1' && server.label === 'control') await writeFile(join(run, 'control-origin.txt'), server.origin)
      await writeFile(join(run, `${server.label}-config.yml`), redact(config))
    }
    await writeFile(join(run, 'raw-server-boot.json'), redact(JSON.stringify(rawGraphs, null, 2)))
    check(!rawGraphs.remote.hasPlugin, 'Isolated remote boot unexpectedly contains the control plugin')
    const localFixture = await fixture(control, join(runtime, 'projects', 'local'), 'local', 1)
    const remoteFixture = await fixture(remote, join(runtime, 'projects', 'remote'), 'remote', 2)
    log('Official create+rename fixtures are nonempty and idle (no model invocation)')
    report.coverage.push('official install; two isolated official servers; official create+rename; nonempty SDK fixtures')
    const added = await control.control('upsertDevice', { name: 'Smoke remote device', enabled: true, transport: { kind: 'direct', baseUrl: remote.origin }, auth: { mode: 'cookie', credential: remote.cookie } })
    const deviceId = added.device.id
    await eventually(async () => {
      const snapshot = await control.control('snapshot')
      const device = snapshot.devices.find(candidate => candidate.id === deviceId)
      // The device is ready for a tab only once its catalog has published rows:
      // that is what the tab badge and its stale/unread staging read from.
      return device?.state === 'connected' && device.catalogStale !== true &&
        (snapshot.attentionByDevice?.[deviceId]?.eligibleSessionIds ?? []).length >= 2
    }, 'remote device catalog baseline for the tab strip')
    report.coverage.push('device connected with a published catalog baseline')
    const { chromium } = await import(pathToFileURL(playwrightPath).href)
    const executablePath = process.env.DSH_SMOKE_BROWSER_EXECUTABLE ?? process.env.BROWSER_EXECUTABLE
    if (executablePath) check(isAbsolute(executablePath) && (await stat(executablePath)).isFile(), 'Browser executable must be an absolute regular file')
    context = await chromium.launchPersistentContext(join(runtime, 'browser-profile'), { headless: true, ...(executablePath ? { executablePath } : {}), env: browserOptions.env, viewport: { width: 1440, height: 1000 }, downloadsPath: join(runtime, 'downloads') })
    // Do not let browser HTTP traffic reach providers, telemetry or existing GUI.
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (['http:', 'https:'].includes(url.protocol) && (url.hostname !== '127.0.0.1' || url.port === '3080')) { records.push({ kind: 'blocked-external-request', text: redact(url.href) }); await route.abort(); return }
      await route.continue()
    })
    if (process.env.DSH_SMOKE_DIAGNOSTICS === '1') await context.route('**/plugins/**', async route => {
      if (!new URL(route.request().url()).pathname.startsWith('/plugins/??') && !route.request().url().includes('/plugins/??')) { await route.continue(); return }
      const response = await route.fetch()
      let body = await response.text()
      if (body.includes('"@deepseek-ai/dsh-client-ui-workspace"')) {
        const prefix = `(function(){var loader=window.__ModuleLoader__;if(!loader||typeof loader.load!=='function')return;var load=loader.load;loader.load=function(record){if(record&&record.id==='@deepseek-ai/dsh-client-ui-workspace'&&typeof record.factory==='function'){var factory=record.factory;record={...record,factory:function(require){var exports=factory(require);var apply=exports.apply;if(typeof apply==='function')exports.apply=function(ctx){var result=apply(ctx);window.__DSH_MD_SMOKE_CONTEXT__=ctx;return result};return exports}}}return load.call(this,record)}})();\n`
        body = prefix + body
      }
      await route.fulfill({ response, body })
    })
    if (process.env.DSH_SMOKE_DIAGNOSTICS === '1') await context.route('**/__md/bridge.js*', async route => {
      const response = await route.fetch()
      const source = await response.text()
      check(source.includes('captured = context;'), 'Bridge diagnostic capture marker missing')
      await route.fulfill({ response, body: source.replace('captured = context;', 'captured = context; window.__DSH_MD_SMOKE_CONTEXT__ = context;') })
    })
    await context.addCookies(control.cookie.split('; ').map(value => { const index = value.indexOf('='); return { name: value.slice(0, index), value: value.slice(index + 1), url: control.origin, httpOnly: true, sameSite: 'Lax' } }))
    page = context.pages()[0] ?? await context.newPage(); watchPage(page, records, 'tab-1')
    const forbiddenLocalHistory = []
    const watchLocalRetention = target => target.on('websocket', socket => {
      const url = new URL(socket.url())
      if (url.host !== new URL(control.origin).host) return
      socket.on('framesent', event => {
        const text = typeof event.payload === 'string' ? event.payload : event.payload.toString()
        let frame
        try { frame = JSON.parse(text) } catch { return }
        const serialized = JSON.stringify(frame)
        if (/session\/(follow|page|prompt)/.test(serialized) && remoteFixture.sessions.some(session => serialized.includes(session.id))) forbiddenLocalHistory.push(`websocket:${frame.method ?? frame.type}`)
      })
    })
    watchLocalRetention(page)
    context.on('request', request => {
      const url = new URL(request.url())
      if (url.origin === control.origin && /\/api\/session\/(follow|page|prompt)/.test(url.pathname) && remoteFixture.sessions.some(session => (request.postData() ?? '').includes(session.id))) forbiddenLocalHistory.push(url.pathname)
    })
    await page.goto(control.origin, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /^(继续|Continue)$/i }).waitFor({ state: 'visible', timeout: TIMEOUT })
    await dismissWelcome(page)
    await expectTabStrip(page, 'Smoke remote device')
    await page.screenshot({ path: join(run, '01-device-tab-strip.png'), fullPage: true })
    log('Persistent [本机][Smoke remote device] strip rendered with no mode switch')
    // The local official page stays local: its own sidebar shows only local rows.
    await page.getByText(remoteFixture.sessions[0].title, { exact: true }).waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {})
    check((await page.getByText(remoteFixture.sessions[0].title, { exact: true }).count()) === 0, 'Remote Session title leaked into the local sidebar')
    report.coverage.push('tab strip renders [本机][device] and the local sidebar stays local-only')

    const frame1 = await openDeviceTab(page, 'Smoke remote device')
    const client1 = await assertDeviceFrame(page, frame1, deviceId)
    const nativeFrame = frame1.locator('iframe').contentFrame()
    await dismissWelcome(nativeFrame)
    // The device page owns its own navigation: open the fixture conversation
    // from the remote sidebar, exactly as a user would inside that tab.
    const remoteRow = nativeFrame.getByText(remoteFixture.sessions[0].title, { exact: true }).first()
    await remoteRow.waitFor({ timeout: TIMEOUT })
    await page.screenshot({ path: join(run, '02a-device-page-before-open.png'), fullPage: true })
    try {
      await remoteRow.click({ timeout: 20_000 })
    } catch (error) {
      // A slow runner can re-render the first-launch notice over the sidebar
      // between the dismiss and the click. Clear it once, then retry.
      await dismissWelcome(nativeFrame)
      await nativeFrame.getByText(remoteFixture.sessions[0].title, { exact: true }).first().click({ timeout: 20_000 })
    }
    await nativeFrame.getByText(`Isolated browser smoke fixture: ${remoteFixture.sessions[0].id}`, { exact: true }).waitFor({ timeout: TIMEOUT })
    log('Device tab shows the remote DSH page and its own history')
    await page.screenshot({ path: join(run, '02-device-page.png'), fullPage: true })

    // Keep-Alive: switching to 本机 must hide, not unmount, the device frame.
    const frameHandle = await page.locator(`.dsh-md-native-frame-wrap[data-device-id="${deviceId}"]`).elementHandle()
    await openLocalTab(page)
    log('本机 tab hides the device frame')
    check((await page.locator(`.dsh-md-native-frame-wrap[data-device-id="${deviceId}"]`).count()) === 1, 'Device frame was unmounted instead of hidden')
    await frame1.page().waitForTimeout(200)
    check((await page.locator(`.dsh-md-native-frame-wrap[data-device-id="${deviceId}"]`).elementHandle()) !== null, 'Device frame disappeared while Keep-Alive was expected')
    await openDeviceTab(page, 'Smoke remote device')
    log('Returning to the device tab keeps the same live frame')
    check(await page.locator(`.dsh-md-native-frame-wrap[data-device-id="${deviceId}"] iframe`).count() === 1, 'Device frame iframe is missing after the round trip')
    void frameHandle
    check(forbiddenLocalHistory.length === 0, `Remote session retained locally: ${forbiddenLocalHistory}`)
    report.coverage.push('device page origin/client identity; Keep-Alive across 本机 switch; no remote local-history retain')

    await page.reload({ waitUntil: 'domcontentloaded' })
    const reloaded = await openDeviceTab(page, 'Smoke remote device')
    await assertDeviceFrame(page, reloaded, deviceId)
    log('Full browser refresh then device tab reopen verified')
    await control.control('reconnectDevice', { deviceId })
    await eventually(async () => (await control.control('snapshot')).devices.find(device => device.id === deviceId)?.state === 'connected', 'device reconnect baseline')
    await openDeviceTab(page, 'Smoke remote device')
    log('Explicit device reconnect and tab reopen verified')
    report.coverage.push('full refresh; explicit reconnect; device tab reopen')

    const tab2 = await context.newPage(); watchPage(tab2, records, 'tab-2'); watchLocalRetention(tab2)
    await tab2.goto(control.origin, { waitUntil: 'domcontentloaded' })
    const frame2 = await openDeviceTab(tab2, 'Smoke remote device')
    const client2 = await assertDeviceFrame(tab2, frame2, deviceId)
    check(client1 !== client2, 'Tabs share a client identity')
    report.coverage.push('two browser tabs keep independent client identities against one device page')
    await openLocalTab(tab2)
    await tab2.screenshot({ path: join(run, '03-tab-2-local.png'), fullPage: true })
    await page.screenshot({ path: join(run, '04-tab-1-device.png'), fullPage: true })
    await context.addCookies(remote.cookie.split('; ').map(value => { const index = value.indexOf('='); return { name: value.slice(0, index), value: value.slice(index + 1), url: remote.origin, httpOnly: true, sameSite: 'Lax' } }))
    log('Plugin-free raw official UI comparison: opening the remote origin directly')
    const officialOnly = await context.newPage(); watchPage(officialOnly, records, 'official-only-control')
    await officialOnly.goto(remote.origin, { waitUntil: 'domcontentloaded' })
    // The device page inside the tab already accepted this origin's first-launch
    // notice in this profile, so the notice may or may not still be there.
    await dismissWelcome(officialOnly)
    await officialOnly.getByText(remoteFixture.sessions[0].title, { exact: true }).first().waitFor({ timeout: TIMEOUT })
    for (const session of [remoteFixture.sessions[0], remoteFixture.sessions[1], remoteFixture.sessions[0]]) {
      await officialOnly.getByText(session.title, { exact: true }).first().click({ timeout: 10_000 })
      await officialOnly.getByText(`Isolated browser smoke fixture: ${session.id}`, { exact: true }).waitFor({ timeout: 10_000 })
    }
    report.coverage.push('plugin-free raw official UI comparison: both remote fixture histories open and switch')
    log('Plugin-free raw official UI session-switching comparison verified')
    check(forbiddenLocalHistory.length === 0, 'Remote history retained by local Controller')
    const known = records.filter(knownUpstreamCancellation)
    const errors = records.filter(row => (row.kind === 'pageerror' || row.kind === 'console' && row.level === 'error') && !knownUpstreamCancellation(row))
    report.knownUpstreamCancellation = known
    report.knownUpstreamCancellationCount = known.length
    report.unexpectedBrowserErrorCount = errors.length
    check(errors.length === 0, `Unexpected browser error(s): ${errors.map(row => row.text).join('; ')}`)
    report.status = known.length ? 'passed-with-upstream-cancellation' : 'passed'
    log(`PASS: official isolated browser E2E; known upstream cancellation diagnostics=${known.length}; NOT console-clean when nonzero, Desktop, SSH, deployment or paid-model acceptance`)
  } catch (error) {
    report.status = interrupted ? 'interrupted' : 'failed'
    report.error = redact(error?.stack ?? error)
    if (!interrupted && page && !page.isClosed()) {
      await page.screenshot({ path: join(run, 'failure.png'), fullPage: true }).catch(() => {})
      await writeFile(join(run, 'failure-dom.txt'), redact(await page.locator('body').innerText().catch(() => '')))
      const frames = []
      for (const frame of page.frames()) {
        const info = await Promise.race([frame.evaluate(async () => {
          const result = { url: location.href, baseURI: document.baseURI, bootEntries: globalThis.__DSH_BOOT__?.entries?.map(row => row.id), transport: globalThis.__DSH_TRANSPORT__, connectionRecovery: globalThis.__DSH_CONNECTION_RECOVERY__ }
          const context = globalThis.__DSH_MD_SMOKE_CONTEXT__
          if (context) {
            result.clientListBefore = context.sessions?.list?.getSnapshot()
            result.selection = context.uiWorkspace?.selection?.getSnapshot?.()
            try { result.uiSession = context.uiSession?.current?.getSnapshot?.() } catch {}
            result.workspaceView = context.uiWorkspace?.view?.getSnapshot?.()
            result.retained = result.clientListBefore?.ids?.map(id => ({ id, info: context.sessions.retainInfo(id).getSnapshot() }))
            const manager = context.sessions?.manager
            const workspaceManager = context.uiWorkspace?.sessions?.manager
            result.manager = manager ? { listState: manager.listState, listPhase: manager.listPhase, listError: manager.listError, summaryIds: manager.summaries?.map(row => row.sessionId) } : null
            result.workspaceSessions = { sameService: context.uiWorkspace?.sessions === context.sessions, sameManager: workspaceManager === manager, summaryIds: workspaceManager?.summaries?.map(row => row.sessionId), listState: workspaceManager?.listState, listPhase: workspaceManager?.listPhase, listError: workspaceManager?.listError }
            const response = await fetch('/api/session/list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'session/list', payload: { args: { _request: {} } } }) })
            result.rawList = await response.json()
            await context.sessions.refresh()
            result.clientListAfter = context.sessions?.list?.getSnapshot()
          }
          return result
        }), new Promise(resolve => { const timer = setTimeout(() => resolve({ error: 'Frame diagnostics timeout' }), 10_000); timer.unref() })]).catch(error => ({ error: error.message }))
        frames.push(info)
      }
      await writeFile(join(run, 'failure-frames.json'), redact(JSON.stringify(frames, null, 2)))
    }
    if (!interrupted) throw error
    log('Interrupted; owned servers and browser resources will be cleaned before exit')
  } finally {
    await context?.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {})
    await context?.close().catch(() => {})
    await Promise.all([...children].map(stopChild))
    for (const server of servers) if (server.child) await writeFile(join(run, `${server.label}-server.log`), redact(server.child.smokeOutput))
    await writeFile(join(run, 'browser-events.json'), JSON.stringify(records, null, 2))
    await writeFile(join(run, 'report.json'), JSON.stringify(report, null, 2))
    process.removeListener('SIGINT', sigint); process.removeListener('SIGTERM', sigterm)
    const actual = await realpath(runtime)
    check(actual === join(await realpath(run), 'runtime') && dirname(run) === root && basename(run).startsWith('device-browser-'), 'Refusing unsafe runtime cleanup')
    await rm(actual, { recursive: true, force: true })
  }
}
export function selfTest() {
  const env = isolatedEnv('/isolated')
  for (const key of ['HOME', 'DSH_HOME', 'DSH_AGENTS_HOME', 'XDG_CONFIG_HOME', 'TMPDIR']) assert(env[key].startsWith('/isolated/'))
  for (const key of ['DSH_SESSION_ID', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'SSH_AUTH_SOCK']) assert.equal(env[key], undefined)
  const fixture = seedPlugin('file:///official/llm.js')
  assert(fixture.includes('session-md-smoke-') && fixture.includes("surfaceOp: 'append'"))
  assert(!fixture.includes('.prompt(') && !fixture.includes('.followup('))
  const upstream = { kind: 'console', level: 'error', text: 'Sidebar Session opening failed: Error: Session reference "session-example-1" is released\n at ClientSessionReference.release (official/client.js:1)\n at SidebarSessionView.dispose (official/client.js:2)' }
  assert(knownUpstreamCancellation(upstream))
  assert(!knownUpstreamCancellation({ ...upstream, kind: 'pageerror' }))
  assert(!knownUpstreamCancellation({ ...upstream, text: upstream.text + '\n at dsh-multi-device/client.js:3' }))
  assert(!knownUpstreamCancellation({ ...upstream, text: upstream.text.replace('is released', 'is missing') }))
  assert.throws(() => startupUrl('dsh web: http://127.0.0.1:3080/?token=secret\n'))
  log('PASS: isolation, SDK fixture and 3080 guard self-tests; browser E2E NOT run')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else main().catch(error => { console.error(`[device-browser-smoke] FAIL: ${redact(error?.message ?? error)}`); process.exitCode = 1 })
}

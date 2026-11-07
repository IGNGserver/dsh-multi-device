#!/usr/bin/env node
/**
 * CI-only official Web installer smoke (Node 24, pnpm 11 on PATH).
 * Required: DSH_SMOKE_ROOT=<absolute scratch/RUNNER_TEMP>,
 * DSH_SMOKE_PACKAGE=<absolute prebuilt CI .tgz>.
 * Optional: DSH_SMOKE_CLI=<absolute official lib/bin.js> (run with node),
 * DSH_SMOKE_REPLACEMENT=0 to omit synthetic A -> B -> A installer coverage.
 * No source builds, model calls, tasks, real profiles, or Desktop acceptance.
 * `node scripts/smoke-official-install.mjs --self-test` needs no artifacts.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const NAME = 'dsh-multi-device'
const REQUEST_MS = 15_000
const START_MS = 90_000
const COMMAND_MS = 300_000
const MAX_OUTPUT = 2 * 1024 * 1024
const children = new Set()
let interrupted = false
const cancellation = new AbortController()
function ownedSpawn(executable, args, options) {
  check(!interrupted, 'Smoke interrupted; refusing to start another child')
  const child = spawn(executable, args, options)
  children.add(child)
  child.once('close', () => { child.smokeClosed = true; children.delete(child) })
  return child
}
const log = message => console.log(`[official-install-smoke] ${message}`)
const check = (condition, message) => { if (!condition) throw new Error(message) }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export function redact(text) {
  return String(text)
    .replace(/https?:\/\/[^\s<>"']+/gi, value => {
      try {
        const url = new URL(value)
        url.username = ''; url.password = ''
        for (const key of [...url.searchParams.keys()]) {
          if (/token|auth|secret|cookie|key|credential/i.test(key)) url.searchParams.set(key, '[redacted]')
        }
        return url.href
      } catch { return '[redacted URL]' }
    })
    .replace(/((?:set-cookie|cookie|authorization)\s*[:=])[^\r\n]*/gi, '$1 [redacted]')
    .replace(/[^\s"']*\.credentials[^\s"']*/gi, '[private credential path]')
    .replace(/((?:token|password|secret|api[_-]?key)\s*[:=]\s*)[^\s,;}]+/gi, '$1[redacted]')
}

export function startupUrl(output) {
  // Only the child's official readiness announcement is authoritative, not arbitrary log URLs.
  const matches = output.replace(/\u001b\[[0-9;]*m/g, '').matchAll(/^dsh web:[ \t]+(https?:\/\/\S+)[ \t]*\r?\n/gm)
  for (const match of matches) {
    const url = new URL(match[1])
    check(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port !== '' && url.port !== '3080' && url.port !== '0', 'Unsafe child startup origin')
    check(url.pathname === '/' && url.username === '' && url.password === '' && url.hash === '', 'Unexpected child startup URL')
    check(url.searchParams.getAll('token').length === 1 && url.searchParams.get('token'), 'Child startup URL has no unique launch token')
    return url
  }
}

export function localUrl(value, origin) {
  const url = new URL(value, `${origin}/`)
  check(url.origin === origin && !url.username && !url.password && !url.hash && !url.searchParams.has('token'), 'Boot/request URL escaped the owned server')
  return url
}

export function extractBoot(html) {
  // Parse just the JSON literal assigned by the inline injection. Never evaluate the page.
  const marker = /(?:window|globalThis)(?:\.__DSH_BOOT__|\[\s*["']__DSH_BOOT__["']\s*\])\s*=\s*/g
  const results = []
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    marker.lastIndex = 0
    const assignment = marker.exec(script[1])
    if (!assignment) continue
    const body = script[1].slice(marker.lastIndex).trim()
    check(body.startsWith('{'), 'Boot assignment must be a JSON object')
    let depth = 0; let quoted = false; let escaped = false; let end = -1
    for (let i = 0; i < body.length; i++) {
      const char = body[i]
      if (quoted) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') quoted = false
      } else if (char === '"') quoted = true
      else if (char === '{' || char === '[') depth++
      else if (char === '}' || char === ']') { if (--depth === 0) { end = i + 1; break } }
    }
    check(end > 0 && /^;?\s*$/.test(body.slice(end)), 'Boot assignment contains non-JSON executable content')
    results.push(JSON.parse(body.slice(0, end)))
  }
  check(results.length === 1, `Expected one inline boot graph, received ${results.length}; incompatible official HTML protocol`)
  const graph = results[0]
  check(typeof graph.rev === 'string' && Array.isArray(graph.entries) && Array.isArray(graph.batches), 'Incompatible boot graph: expected rev/entries/batches')
  const ids = new Set()
  for (const row of graph.entries) {
    check(typeof row.id === 'string' && typeof row.url === 'string' && typeof row.rev === 'string' && !ids.has(row.id), 'Invalid/duplicate boot graph entry')
    ids.add(row.id)
  }
  const assigned = new Set()
  for (const batch of graph.batches) {
    check(['bootstrap', 'application'].includes(batch.phase) && typeof batch.url === 'string' && typeof batch.rev === 'string' && Array.isArray(batch.entries) && batch.entries.length > 0, 'Invalid boot graph batch')
    for (const id of batch.entries) {
      check(ids.has(id) && !assigned.has(id), 'Unknown/duplicate boot batch entry')
      assigned.add(id)
    }
  }
  check(assigned.size === ids.size, 'Boot entries missing from batches')
  return graph
}

export function registrationIds(source) {
  const registrations = []
  const loader = Object.freeze({ load: row => {
    check(typeof row?.id === 'string' && typeof row.factory === 'function', 'Invalid bundle factory registration')
    registrations.push(row.id)
  } })
  // Only evaluate the fetched combo registration wrapper, never call factories or render UI.
  runInNewContext(source, { window: Object.freeze({ __ModuleLoader__: loader }), __ModuleLoader__: loader }, {
    timeout: 1000, contextCodeGeneration: { strings: false, wasm: false }, filename: 'owned-combo-registration.js',
  })
  check(new Set(registrations).size === registrations.length, 'Duplicate factory registration')
  return registrations
}

export function changeApplication(result) {
  check(result && ['applied', 'restart-required'].includes(result.application) && !result.error && (!result.packageResult || result.packageResult.exitCode === 0), `Manager business application refused: ${JSON.stringify(result)}`)
  return result.application
}

export function rpcEnvelope(method, args = {}, rpcId = randomUUID()) {
  check(args !== null && typeof args === 'object' && !Array.isArray(args), 'RPC args must be a named object')
  return { type: 'client-request', rpcId, method, payload: { args } }
}

function isolatedEnv(temp) {
  const env = {}
  // Do not pass DSH launch context, model/account credentials, SSH agents, or real user config.
  for (const key of ['PATH', 'PNPM_HOME', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'WINDIR', 'LANG', 'LC_ALL', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'all_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS']) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  return Object.assign(env, {
    HOME: join(temp, 'home'), USERPROFILE: join(temp, 'home'), DSH_HOME: join(temp, 'dsh'), DSH_AGENTS_HOME: join(temp, 'agents'),
    XDG_CONFIG_HOME: join(temp, 'config'), XDG_CACHE_HOME: join(temp, 'cache'), XDG_DATA_HOME: join(temp, 'data'), XDG_STATE_HOME: join(temp, 'state'),
    APPDATA: join(temp, 'config'), LOCALAPPDATA: join(temp, 'data'), TMPDIR: join(temp, 'tmp'), TMP: join(temp, 'tmp'), TEMP: join(temp, 'tmp'),
    COREPACK_HOME: join(temp, 'corepack'), COREPACK_ENABLE_PROJECT_SPEC: '0', PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS: 'false',
    npm_config_userconfig: join(temp, 'empty.npmrc'), npm_config_globalconfig: join(temp, 'global.npmrc'),
    npm_config_cache: join(temp, 'npm-cache'), npm_config_store_dir: join(temp, 'pnpm-store'), npm_config_manage_package_manager_versions: 'false',
    CI: 'true', NO_COLOR: '1', DO_NOT_TRACK: '1', OTEL_SDK_DISABLED: 'true',
  })
}

async function stopChild(child) {
  if (child.smokeClosed) return
  if (child.smokeStopping) return child.smokeStopping
  child.smokeStopping = (async () => {
    const closed = new Promise(resolve => child.once('close', resolve))
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) { await closed; return }
    // Only signal the exact ChildProcess we spawned; never scan ports/process names or process groups.
    child.kill('SIGTERM')
    let timer
    try {
      await Promise.race([closed, new Promise(resolve => { timer = setTimeout(resolve, 10_000) })])
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await closed }
    } finally { clearTimeout(timer) }
  })()
  return child.smokeStopping
}

async function command(executable, args, options, label) {
  const child = ownedSpawn(executable, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''; let stderr = ''; let timedOut = false
  child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-MAX_OUTPUT) })
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-MAX_OUTPUT) })
  const timer = setTimeout(() => { timedOut = true; void stopChild(child) }, COMMAND_MS)
  try {
    const [code, signal] = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve([code, signal])) })
    check(!timedOut && code === 0, `${label} failed (${timedOut ? 'timeout' : `exit ${code}, signal ${signal}`}):\nstdout:\n${redact(stdout)}\nstderr:\n${redact(stderr)}`)
    return stdout
  } finally { clearTimeout(timer); await stopChild(child) }
}

async function request(url, options = {}) {
  // Manual redirects prevent token/cookie forwarding and graph redirects outside our child.
  check(!interrupted, 'Smoke interrupted')
  return fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(REQUEST_MS)]) })
}

class Server {
  constructor(cli, options) { this.cli = cli; this.options = options }
  async start() {
    check(!this.child, 'Server already started')
    this.child = ownedSpawn(this.cli[0], [...this.cli.slice(1), 'web', '--no-open', '--host', '127.0.0.1', '--port', '0'], { ...this.options, stdio: ['ignore', 'pipe', 'pipe'] })
    this.stdout = ''; this.stderr = ''; this.spawnError = undefined
    this.child.once('error', error => { this.spawnError = error })
    this.child.stdout.on('data', data => { this.stdout = (this.stdout + data.toString()).slice(-MAX_OUTPUT) })
    this.child.stderr.on('data', data => { this.stderr = (this.stderr + data.toString()).slice(-MAX_OUTPUT) })
    try {
      const deadline = Date.now() + START_MS
      let url
      while (!(url = startupUrl(this.stdout))) {
        check(!this.spawnError, `Official Web CLI spawn failed: ${this.spawnError?.message}`)
        check(this.child.exitCode === null && this.child.signalCode === null && Date.now() < deadline, `Official Web startup failed/timed out; CLI must support --host <host> --port 0.\n${redact(this.stdout + this.stderr)}`)
        await sleep(100)
      }
      this.origin = url.origin
      const response = await request(url)
      check([302, 303].includes(response.status), `Launch-token exchange returned HTTP ${response.status}`)
      const cookies = response.headers.getSetCookie()
      check(cookies.length > 0, 'Launch-token exchange set no cookie')
      this.cookie = cookies.map(value => value.split(';', 1)[0]).join('; ')
      const destination = localUrl(response.headers.get('location') ?? '', this.origin)
      check(destination.pathname === '/' && !destination.search, 'Unexpected token exchange redirect')
      await response.body?.cancel()
      log('Owned Web child ready on an ephemeral loopback port (URL/credentials suppressed)')
    } catch (error) { await this.stop(); throw error }
  }
  async stop() { if (this.child) { await stopChild(this.child); this.child = undefined }; this.cookie = undefined }
  async restart() { await this.stop(); await this.start() }
  headers() { return { cookie: this.cookie, origin: this.origin } }
  async get(path) { return request(localUrl(path, this.origin), { headers: this.headers() }) }
  async rpc(method, args = {}) {
    const envelope = rpcEnvelope(method, args)
    const response = await request(localUrl(`/api/${method}`, this.origin), {
      method: 'POST', headers: { ...this.headers(), 'content-type': 'application/json' }, body: JSON.stringify(envelope),
    })
    check(response.ok, `${method}: HTTP ${response.status}; unsupported official manager/trust protocol`)
    const body = await response.json()
    check(body.type === 'server-response' && body.rpcId === envelope.rpcId && body.result?.ok === true, `${method}: RPC refused/incompatible: ${JSON.stringify(body.result ?? body)}`)
    return body.result.value
  }
  async graph() {
    const response = await this.get('/')
    check(response.ok, `Authenticated root returned HTTP ${response.status}`)
    const graph = extractBoot(await response.text())
    for (const item of [...graph.entries, ...graph.batches]) localUrl(item.url, this.origin)
    return graph
  }
  async observe({ installed, enabled, version, pluginDisabled = false }) {
    const bundles = await this.rpc('pluginManager/listBundles')
    const plugins = await this.rpc('pluginManager/listPlugins')
    check(Array.isArray(bundles) && Array.isArray(plugins), 'Manager inventory is not an array')
    const bundle = bundles.find(row => row.name === NAME)
    const rows = plugins.filter(row => row.moduleName === NAME)
    const graph = await this.graph()
    const entry = graph.entries.find(row => row.id === NAME)
    if (!installed) {
      check(!bundle || bundle.installed === false, 'Removed bundle still installed')
      check(rows.length === 0 && !entry && !graph.batches.some(batch => batch.entries.includes(NAME)), 'Removed plugin remains in Host/boot graph')
    } else {
      check(bundle?.installed === true && bundle.version === version, `Installed bundle version mismatch (expected ${version}, got ${bundle?.version})`)
      check(!bundle.error && bundle.enabled === (enabled || pluginDisabled), 'Bundle selection/error mismatch')
      if (enabled) {
        check(rows.length === 1 && rows[0].enabled === true && rows[0].fiberPhase === 'active', `Host plugin not active: ${JSON.stringify(rows)}`)
        check(entry && graph.batches.some(batch => batch.entries.includes(NAME)), 'Active plugin missing from boot entries/batches')
      } else {
        check(rows.every(row => row.enabled === false && row.fiberPhase !== 'active' && row.fiberPhase !== 'failed'), 'Disabled plugin still active/failed')
        check(!entry && !graph.batches.some(batch => batch.entries.includes(NAME)), 'Disabled plugin remains in boot graph')
        if (pluginDisabled) check(rows.length === 1, 'Disabled entry disappeared from manager inventory')
      }
    }
    const response = await this.get('/multi-device/api')
    if (enabled) {
      check(response.ok, `Control-plane snapshot returned HTTP ${response.status}`)
      const snapshot = await response.json()
      check(snapshot.ok === true && Number.isFinite(snapshot.value?.revision) && Array.isArray(snapshot.value.devices) && snapshot.value.devices.length === 0 && Array.isArray(snapshot.value.logicalWorkspaces) && snapshot.value.hostStatus, 'Invalid/nonempty fresh control-plane snapshot')
      const combo = await this.get(entry.url)
      check(combo.ok, `Actual graph combo returned HTTP ${combo.status}`)
      check(registrationIds(await combo.text()).includes(NAME), 'Actual graph combo did not register plugin factory')
    } else {
      // An SPA fallback may return HTML with status 200. It is not an active plugin API.
      const text = await response.text()
      let value
      try { value = JSON.parse(text) } catch { /* expected missing route or SPA fallback */ }
      check(!(response.ok && value?.ok === true && value.value?.hostStatus), 'Disabled/removed control plane still active')
    }
    return { bundle, rows, graph }
  }
  async settled(expected) {
    const deadline = Date.now() + 20_000
    let last
    do {
      check(!interrupted, 'Smoke interrupted')
      try { return await this.observe(expected) } catch (error) { last = error }
      await sleep(250)
    } while (Date.now() < deadline)
    throw last
  }
  async toggle(method, args, expected) {
    const result = await this.rpc(method, args)
    const application = changeApplication(result)
    if (application === 'restart-required') { log(`${method}: restart-required; stopping and awaiting child before revalidation`); await this.restart() }
    await this.settled(expected)
    log(`${method} enabled=${args.enabled}: ${application}; Host, graph and control plane verified`)
  }
}

async function unpack(packagePath, destination, options) {
  await mkdir(destination)
  const listing = await command('tar', ['-tzf', packagePath], options, 'Inspect CI tarball members')
  check(listing.split('\n').filter(Boolean).every(path => path.startsWith('package/') && !path.split('/').includes('..') && !path.includes('\\')), 'Unsafe/unexpected npm tarball paths')
  const types = await command('tar', ['-tvzf', packagePath], options, 'Inspect CI tarball entry types')
  check(types.split('\n').filter(Boolean).every(line => /^[-d]/.test(line)), 'CI tarball must not contain links or special files')
  await command('tar', ['-xzf', packagePath, '--no-same-owner', '--no-same-permissions', '-C', destination], options, 'Extract prebuilt CI tarball')
  const root = join(destination, 'package')
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  check(manifest.name === NAME && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.version), 'Unexpected CI package identity/version')
  check((await readFile(join(root, 'VERSION'), 'utf8')).trim() === manifest.version, 'CI package VERSION mismatch')
  for (const file of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml']) check((await stat(join(root, file))).isFile(), `Prebuilt CI tarball missing ${file}`)
  return { root, manifest }
}

export async function main() {
  check(Number(process.versions.node.split('.')[0]) >= 24, 'Official installer smoke requires Node 24+')
  check(process.env.DSH_SMOKE_ROOT && isAbsolute(process.env.DSH_SMOKE_ROOT), 'DSH_SMOKE_ROOT is required and must be an absolute scratch/CI RUNNER_TEMP directory')
  check(process.env.DSH_SMOKE_PACKAGE && isAbsolute(process.env.DSH_SMOKE_PACKAGE) && process.env.DSH_SMOKE_PACKAGE.endsWith('.tgz'), 'DSH_SMOKE_PACKAGE is required and must be an absolute prebuilt CI .tgz')
  const source = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
  let ancestor = resolve(process.env.DSH_SMOKE_ROOT)
  const suffix = []
  while (true) {
    try { ancestor = await realpath(ancestor); break } catch (error) {
      if (error.code !== 'ENOENT') throw error
      suffix.unshift(basename(ancestor)); ancestor = dirname(ancestor)
    }
  }
  const candidate = join(ancestor, ...suffix)
  check(candidate !== source && !candidate.startsWith(source + sep), 'Scratch root cannot be in the read-only source tree')
  await mkdir(candidate, { recursive: true })
  const root = await realpath(candidate)
  check(root !== source && !root.startsWith(source + sep), 'Scratch root cannot be in the read-only source tree')
  const packagePath = await realpath(process.env.DSH_SMOKE_PACKAGE)
  check((await stat(packagePath)).isFile(), 'CI tarball is not a regular file')
  const cli = process.env.DSH_SMOKE_CLI
    ? [process.execPath, process.env.DSH_SMOKE_CLI]
    : ['dsh']
  if (process.env.DSH_SMOKE_CLI) {
    check(isAbsolute(cli[1]) && basename(cli[1]) === 'bin.js' && (await stat(cli[1])).isFile(), 'DSH_SMOKE_CLI must be an absolute official bin.js (not a shell command)')
  }
  const temp = await mkdtemp(join(root, 'dsh-official-smoke-'))
  const env = isolatedEnv(temp)
  const options = { cwd: temp, env }
  const server = new Server(cli, options)
  const onSignal = signal => {
    interrupted = true
    cancellation.abort(new Error('Smoke interrupted'))
    process.exitCode = signal === 'SIGINT' ? 130 : 143
    void Promise.all([...children].map(stopChild))
  }
  const sigint = () => onSignal('SIGINT'); const sigterm = () => onSignal('SIGTERM')
  process.once('SIGINT', sigint); process.once('SIGTERM', sigterm)
  try {
    for (const directory of new Set(Object.entries(env).filter(([key]) => /^(HOME|USERPROFILE|DSH_HOME|DSH_AGENTS_HOME|XDG_.*|APPDATA|LOCALAPPDATA|TMPDIR|TMP|TEMP|COREPACK_HOME|npm_config_cache|npm_config_store_dir)$/.test(key)).map(([, value]) => value))) await mkdir(directory, { recursive: true })
    await writeFile(env.npm_config_userconfig, ''); await writeFile(env.npm_config_globalconfig, '')
    const runtime = (await command(cli[0], [...cli.slice(1), '--version'], options, 'Read official CLI version')).trim()
    const pnpm = (await command('pnpm', ['--version'], options, 'Read isolated pnpm version')).trim()
    check(/^11\./.test(pnpm), `Expected CI pnpm 11, received ${pnpm}; disable Corepack project-spec/package-manager switching`)
    log(`Official CLI ${redact(runtime)}; Node ${process.versions.node}; pnpm ${pnpm}`)
    const fixture = await unpack(packagePath, join(temp, 'fixture'), options)
    const version = fixture.manifest.version
    const cliCommand = (args, label) => command(cli[0], [...cli.slice(1), ...args], options, label)
    // Ordinary official install: intentionally no --ignore-scripts, patches, or copied profile.
    await cliCommand(['plugin', '--profile', 'web', 'add', packagePath], 'Official CLI add prebuilt CI tarball')
    const dump = await cliCommand(['--profile', 'web', '--dump-config'], 'Official CLI dump-config')
    check(dump.includes(NAME), 'Composed official profile does not include the plugin')
    await server.start()
    const initial = await server.settled({ installed: true, enabled: true, version })
    log('Installed package, composed config, active Host, boot graph, actual combo factory and snapshot verified')
    const entryId = initial.rows[0].entryId
    check(typeof entryId === 'string', 'Manager returned no exact entryId')
    await server.toggle('pluginManager/setPluginEnabled', { id: entryId, enabled: false }, { installed: true, enabled: false, version, pluginDisabled: true })
    const disabled = await server.rpc('pluginManager/listPlugins')
    const restoreId = disabled.find(row => row.moduleName === NAME)?.entryId
    check(typeof restoreId === 'string', 'No exact disabled entryId for re-enable')
    await server.toggle('pluginManager/setPluginEnabled', { id: restoreId, enabled: true }, { installed: true, enabled: true, version })
    await server.toggle('pluginManager/setBundleEnabled', { name: NAME, enabled: false }, { installed: true, enabled: false, version })
    await server.toggle('pluginManager/setBundleEnabled', { name: NAME, enabled: true }, { installed: true, enabled: true, version })
    await server.stop()
    if (process.env.DSH_SMOKE_REPLACEMENT !== '0') {
      const parts = version.split(/[.+-]/)
      const replacementVersion = `${parts[0]}.${parts[1]}.${parts[2]}-official-smoke.${Date.now()}`
      const modified = { ...fixture.manifest, version: replacementVersion }
      delete modified.scripts // Repack already-built CI bytes only; never invoke a source build.
      await writeFile(join(fixture.root, 'package.json'), `${JSON.stringify(modified, null, 2)}\n`)
      await writeFile(join(fixture.root, 'VERSION'), `${replacementVersion}\n`)
      const packed = await command('npm', ['pack', '--json', '--pack-destination', temp], { ...options, cwd: fixture.root }, 'Repack synthetic version fixture (no build scripts)')
      const records = JSON.parse(packed)
      check(records.length === 1 && basename(records[0].filename) === records[0].filename && records[0].filename.endsWith('.tgz'), 'Unexpected npm pack output')
      for (const [file, expectedVersion] of [[join(temp, records[0].filename), replacementVersion], [packagePath, version]]) {
        await cliCommand(['plugin', '--profile', 'web', 'add', file], 'Official CLI version replacement')
        await server.start()
        await server.settled({ installed: true, enabled: true, version: expectedVersion })
        await server.stop()
      }
      log('A -> synthetic B -> A passed: installer replacement mechanism only; NOT historical-release compatibility')
    } else log('Synthetic replacement coverage explicitly omitted by DSH_SMOKE_REPLACEMENT=0')
    await cliCommand(['plugin', '--profile', 'web', 'remove', NAME], 'Official CLI remove')
    await server.start()
    await server.settled({ installed: false, enabled: false })
    await server.stop()
    log('PASS: official Web install/toggles/restart/remove; factory registration is NOT UI rendering; Desktop/profile acceptance and historical compatibility NOT tested')
  } finally {
    process.removeListener('SIGINT', sigint); process.removeListener('SIGTERM', sigterm)
    await server.stop()
    await Promise.all([...children].map(stopChild))
    // Verify the exact mkdtemp child before recursive cleanup, never delete the supplied root.
    const actual = await realpath(temp)
    check(dirname(actual) === root && basename(actual).startsWith('dsh-official-smoke-') && relative(root, actual) !== '', 'Refusing unsafe smoke cleanup target')
    await rm(actual, { recursive: true, force: true })
  }
}

export function selfTest() {
  const graph = { rev: 'r', entries: [{ id: NAME, url: 'plugins/combo.js?rev=r', rev: 'r' }], batches: [{ phase: 'application', entries: [NAME], url: 'plugins/combo.js?rev=b', rev: 'b' }] }
  assert.deepEqual(extractBoot(`<html><script>globalThis["__DSH_BOOT__"] = ${JSON.stringify(graph)}</script></html>`), graph)
  assert.deepEqual(extractBoot(`<script>window.__DSH_BOOT__=${JSON.stringify(graph)};</script>`), graph)
  assert.throws(() => extractBoot('<script>window.__DSH_BOOT__=(()=>{throw 1})()</script>'))
  assert.throws(() => extractBoot(`<script>window.__DSH_BOOT__=${JSON.stringify(graph)};evil()</script>`))
  assert.throws(() => extractBoot(`<script>window.__DSH_BOOT__=${JSON.stringify({ ...graph, batches: [] })}</script>`))
  assert.equal(startupUrl('untrusted http://127.0.0.1:9999/?token=x\n'), undefined)
  assert.equal(startupUrl('dsh web: http://127.0.0.1:12345/?token=secret'), undefined)
  assert.equal(startupUrl('dsh web: http://127.0.0.1:12345/?token=secret\n').port, '12345')
  assert.throws(() => startupUrl('dsh web: http://127.0.0.1:3080/?token=secret\n'))
  assert.throws(() => startupUrl('dsh web: http://evil.test:12345/?token=secret\n'))
  assert.throws(() => localUrl('//evil.test/x', 'http://127.0.0.1:12345'))
  assert.deepEqual(registrationIds(`window.__ModuleLoader__.load({id:'${NAME}',factory:()=>{throw Error('must not run')}})`), [NAME])
  assert.throws(() => registrationIds('while(true){}'))
  assert.deepEqual(rpcEnvelope('pluginManager/listBundles', {}, 'id'), { type: 'client-request', rpcId: 'id', method: 'pluginManager/listBundles', payload: { args: {} } })
  assert.throws(() => rpcEnvelope('x', []))
  for (const application of ['failed', 'cancelled', 'overridden', undefined]) assert.throws(() => changeApplication({ application }))
  assert.equal(changeApplication({ application: 'restart-required' }), 'restart-required')
  const safe = redact('dsh web: http://127.0.0.1:12345/?token=TOPSECRET\nCookie: PRIVATE\n/home/test/.credentials/private')
  assert(!safe.includes('TOPSECRET') && !safe.includes('PRIVATE') && !safe.includes('.credentials'))
  log('Pure helper self-tests passed (JSON extraction, URL ownership, RPC named args, business outcomes, factory-only VM timeout, redaction)')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).includes('--self-test')) selfTest()
  else main().catch(error => { console.error(`[official-install-smoke] FAIL: ${redact(error?.message ?? error)}`); process.exitCode = 1 })
}

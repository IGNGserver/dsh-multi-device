/**
 * Dual-engine SSH local port-forwarding manager (`system-ssh` + `ssh2` fallback).
 *
 * - Default `system-ssh` spawns the OS `ssh` client (`ssh -N -L 127.0.0.1:<localPort>:<remoteBindHost>:<remotePort>`),
 *   which natively honors 100% of `~/.ssh/config` (`Host`, `ProxyJump`, `ProxyCommand`, `ControlMaster`,
 *   macOS Keychain `UseKeychain`, `IdentityAgent`, 1Password SSH Agent, `SSH_AUTH_SOCK`).
 * - Fallback `ssh2` uses the pure-JS/native `ssh2` library in-process when `passphrase` is provided
 *   or when `engine: 'ssh2'` is explicitly selected.
 * - Automatically allocates a free local loopback port, verifies TCP forwarding readiness,
 *   supervises connection health, and reconnects with exponential backoff + jitter.
 *
 * @module dsh-multi-device/host/tunnel
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createConnection, createServer, type Server, type Socket } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SshTransportConfig } from '../contract.ts'
import {
  expandHomePath,
  parseSshTargetSpec,
  resolveSshConfigForTransport,
  type ResolvedSshParameters,
} from './ssh-config.ts'

export type TunnelState = 'connecting' | 'up' | 'error' | 'stopped'

export interface TunnelStatus {
  readonly state: TunnelState
  readonly localPort?: number
  readonly baseUrl?: string
  readonly engine?: 'system-ssh' | 'ssh2'
  readonly error?: string
  readonly attempt: number
}

const BACKOFF_BASE_MS = 600
const BACKOFF_MAX_MS = 15_000
const READY_TIMEOUT_MS = 15_000
const KEEPALIVE_INTERVAL_SEC = 15

/** Allocate an ephemeral free TCP port on `127.0.0.1`. */
export async function allocateLoopbackPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr === null || typeof addr === 'string') {
        server.close()
        reject(new Error('failed to allocate loopback port'))
        return
      }
      const port = addr.port
      server.close((err) => {
        if (err) reject(err)
        else resolve(port)
      })
    })
  })
}

const LOOPBACK_REMOTE_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * The tunnel may only forward to the remote machine's own loopback DSH listener.
 * An arbitrary `remoteBindHost` would turn the local port into a jump into the remote LAN.
 */
export function assertLoopbackForward(transport: SshTransportConfig): { host: string; port: number } {
  const host = (transport.remoteBindHost ?? '127.0.0.1').trim()
  const port = transport.remotePort ?? 3080
  if (!LOOPBACK_REMOTE_HOSTS.has(host.toLowerCase())) {
    throw new Error(`SSH remote bind host must be loopback (127.0.0.1, localhost, or ::1), got ${host}`)
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`SSH remote DSH port must be an integer between 1 and 65535, got ${String(port)}`)
  }
  return { host: host.toLowerCase() === '[::1]' ? '::1' : host, port }
}

/**
 * Always force `yes`. User config values such as `accept-new`, `no`, or `off`
 * must not be copied onto the command line: the tunnel later reads remote credentials.
 */
export function strictHostKeyCheckingArg(): string {
  return 'StrictHostKeyChecking=yes'
}

/** Build the CLI arguments for `ssh -N -L ...` given transport and resolved parameters. */
export function buildSystemSshArgs(
  transport: SshTransportConfig,
  resolved: ResolvedSshParameters,
  localPort: number,
): string[] {
  const forward = assertLoopbackForward(transport)
  const parsedSpec = parseSshTargetSpec(transport.host)

  const args: string[] = [
    '-N',
    '-T',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'BatchMode=yes',
    '-o', `ServerAliveInterval=${resolved.serverAliveInterval ?? KEEPALIVE_INTERVAL_SEC}`,
    '-o', 'ServerAliveCountMax=3',
    '-o', 'ConnectTimeout=10',
    '-o', strictHostKeyCheckingArg(),
    '-L', `127.0.0.1:${localPort}:${forward.host}:${forward.port}`,
  ]

  const explicitPort = transport.port ?? parsedSpec.port
  if (explicitPort !== undefined) {
    args.push('-p', String(explicitPort))
  }

  const explicitUser = transport.username?.trim() || parsedSpec.username
  if (explicitUser !== undefined && explicitUser !== '') {
    args.push('-l', explicitUser)
  }

  if (transport.privateKeyPath !== undefined && transport.privateKeyPath.trim() !== '') {
    args.push('-i', expandHomePath(transport.privateKeyPath.trim()))
  }

  if (transport.proxyJump !== undefined && transport.proxyJump.trim() !== '') {
    args.push('-J', transport.proxyJump.trim())
  }

  // Pass the original Host alias (or hostname) so `ssh` applies `~/.ssh/config` Host blocks natively!
  args.push(parsedSpec.host)
  return args
}

/**
 * Execute a quick non-interactive command on the remote host over SSH (`system-ssh` or `ssh2`).
 * Used only for read-only discovery (e.g. `.git/config` remote URLs and `.credentials.yaml` bootstrap).
 */
export async function execSshCommand(
  transport: SshTransportConfig,
  command: string,
  timeoutMs = 8_000,
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  const resolved = resolveSshConfigForTransport(transport)
  const useSsh2 =
    transport.engine === 'ssh2' ||
    (transport.passphrase !== undefined && transport.passphrase !== '')

  if (useSsh2) {
    if (resolved.proxyJump !== undefined || resolved.proxyCommand !== undefined) {
      return {
        ok: false,
        error: 'ssh2 engine cannot honor ProxyJump/ProxyCommand; use system-ssh with an SSH agent',
      }
    }
    return execViaSsh2(transport, resolved, command, timeoutMs)
  }

  const parsedSpec = parseSshTargetSpec(transport.host)
  const args: string[] = [
    '-T',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=6',
    '-o', strictHostKeyCheckingArg(),
  ]
  const explicitPort = transport.port ?? parsedSpec.port
  if (explicitPort !== undefined) args.push('-p', String(explicitPort))
  const explicitUser = transport.username?.trim() || parsedSpec.username
  if (explicitUser !== undefined && explicitUser !== '') args.push('-l', explicitUser)
  if (transport.privateKeyPath !== undefined && transport.privateKeyPath.trim() !== '') {
    args.push('-i', expandHomePath(transport.privateKeyPath.trim()))
  }
  if (transport.proxyJump !== undefined && transport.proxyJump.trim() !== '') {
    args.push('-J', transport.proxyJump.trim())
  }
  args.push(parsedSpec.host, command)

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const proc = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const finish = (res: { ok: true; stdout: string } | { ok: false; error: string }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(killTimer)
      resolve(res)
    }
    const timer = setTimeout(() => {
      try { proc.kill('SIGTERM') } catch { /* ignore */ }
    }, timeoutMs)
    // A stuck ProxyCommand can ignore SIGTERM. Escalate so the promise settles.
    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch { /* ignore */ }
      finish({ ok: false, error: 'ssh command timed out' })
    }, timeoutMs + 500)

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    proc.on('error', (err) => {
      finish({ ok: false, error: err.message })
    })
    proc.on('close', (code) => {
      if (code === 0) finish({ ok: true, stdout })
      else finish({ ok: false, error: stderr.trim() || `ssh exited with code ${String(code)}` })
    })
  })
}

async function execViaSsh2(
  transport: SshTransportConfig,
  resolved: ResolvedSshParameters,
  command: string,
  timeoutMs: number,
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  let ClientCtor: new () => Ssh2ClientLike
  try {
    const mod = (await import('ssh2')) as unknown as { Client: new () => Ssh2ClientLike }
    ClientCtor = mod.Client
  } catch {
    return { ok: false, error: 'ssh2 package is not available' }
  }

  let privateKey: Buffer | undefined
  for (const keyPath of resolved.identityFiles) {
    if (existsSync(keyPath)) {
      try {
        privateKey = readFileSync(keyPath)
        break
      } catch {
        // Try next key
      }
    }
  }

  return new Promise((resolve) => {
    const conn = new ClientCtor()
    let settled = false
    const finish = (res: { ok: true; stdout: string } | { ok: false; error: string }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { conn.end() } catch { /* ignore */ }
      resolve(res)
    }
    const timer = setTimeout(() => finish({ ok: false, error: 'ssh2 exec timed out' }), timeoutMs)

    conn.on('ready', () => {
      conn.exec?.(command, (err, stream) => {
        if (err || !stream) {
          finish({ ok: false, error: err?.message ?? 'ssh2 exec failed' })
          return
        }
        let stdout = ''
        let stderr = ''
        stream.on('data', (data: Buffer) => { stdout += data.toString('utf8') })
        stream.stderr?.on('data', (data: Buffer) => { stderr += data.toString('utf8') })
        stream.on('close', (code: number) => {
          if (code === 0) finish({ ok: true, stdout })
          else finish({ ok: false, error: stderr.trim() || `ssh2 command exited ${String(code)}` })
        })
      })
    })
    conn.on('error', (err) => finish({ ok: false, error: err instanceof Error ? err.message : String(err) }))
    conn.connect({
      host: resolved.hostName,
      port: resolved.port,
      username: resolved.user,
      ...(privateKey !== undefined ? { privateKey } : {}),
      ...(transport.passphrase !== undefined ? { passphrase: transport.passphrase } : {}),
      ...(process.env.SSH_AUTH_SOCK !== undefined ? { agent: process.env.SSH_AUTH_SOCK } : {}),
      hostVerifier: (key: Buffer) => verifySsh2HostKey(resolved.hostName, resolved.port, key),
      readyTimeout: timeoutMs,
    })
  })
}

interface Ssh2StreamLike extends NodeJS.ReadWriteStream {
  stderr?: NodeJS.ReadableStream
  on(event: string, listener: (...args: any[]) => void): this
}

interface Ssh2ClientLike {
  on(event: string, handler: (...args: unknown[]) => void): this
  connect(config: Record<string, unknown>): void
  forwardOut(
    srcIp: string,
    srcPort: number,
    dstIp: string,
    dstPort: number,
    cb: (err: Error | undefined, stream: NodeJS.ReadWriteStream) => void,
  ): void
  exec?(command: string, cb: (err: Error | undefined, stream?: Ssh2StreamLike) => void): void
  end(): void
  destroy?(): void
}

/**
 * Managed SSH local-forward tunnel with automatic supervision and exponential backoff.
 */
export class SshTunnel {
  private state: TunnelState = 'connecting'
  private localPort: number | undefined
  private activeEngine: 'system-ssh' | 'ssh2' | undefined
  private lastError: string | undefined
  private stopped = false
  private attempt = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private sshProc: ChildProcess | undefined
  private ssh2Conn: Ssh2ClientLike | undefined
  private ssh2Server: Server | undefined
  private readonly sockets = new Set<Socket>()
  /** Monotonic generation so a late `close`/`fail` cannot tear down a newer tunnel. */
  private generation = 0
  private openInFlight = false

  constructor(
    private readonly transport: SshTransportConfig,
    private readonly notify: () => void,
  ) {}

  baseUrl(): string | undefined {
    return this.localPort === undefined || this.state !== 'up'
      ? undefined
      : `http://127.0.0.1:${this.localPort}`
  }

  status(): TunnelStatus {
    return {
      state: this.state,
      ...(this.localPort !== undefined ? { localPort: this.localPort } : {}),
      ...(this.baseUrl() !== undefined ? { baseUrl: this.baseUrl() } : {}),
      ...(this.activeEngine !== undefined ? { engine: this.activeEngine } : {}),
      ...(this.lastError !== undefined ? { error: this.lastError } : {}),
      attempt: this.attempt,
    }
  }

  async start(): Promise<void> {
    this.stopped = false
    await this.open()
  }

  stop(): void {
    this.stopped = true
    this.generation += 1
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer)
      this.retryTimer = undefined
    }
    this.teardown()
    this.state = 'stopped'
    this.notify()
  }

  /** Kill a child and wait until it exits, escalating to SIGKILL. */
  private killChild(proc: ChildProcess): void {
    proc.removeAllListeners()
    try { proc.kill('SIGTERM') } catch { /* ignore */ }
    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch { /* ignore */ }
    }, 400)
    proc.once('close', () => clearTimeout(killTimer))
    if (killTimer.unref) killTimer.unref()
  }

  private teardown(): void {
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()

    if (this.sshProc !== undefined) {
      const proc = this.sshProc
      this.sshProc = undefined
      this.killChild(proc)
    }

    if (this.ssh2Server !== undefined) {
      try { this.ssh2Server.close() } catch { /* ignore */ }
      this.ssh2Server = undefined
    }

    if (this.ssh2Conn !== undefined) {
      const conn = this.ssh2Conn
      this.ssh2Conn = undefined
      try { conn.end() } catch { conn.destroy?.() }
    }

    this.localPort = undefined
  }

  private scheduleRetry(generation: number): void {
    if (this.stopped || generation !== this.generation || this.retryTimer !== undefined) return
    const exponent = Math.min(this.attempt, 8)
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_MAX_MS)
    this.attempt += 1
    const jitter = Math.floor(Math.random() * Math.min(delay, 1_000))
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      if (generation !== this.generation || this.stopped) return
      void this.open()
    }, delay + jitter)
  }

  private fail(message: string, generation: number, retryable = true): void {
    if (generation !== this.generation || this.stopped) return
    this.lastError = message
    this.state = 'error'
    this.generation += 1
    this.teardown()
    this.notify()
    if (retryable) this.scheduleRetry(this.generation)
  }

  private async open(): Promise<void> {
    if (this.stopped || this.openInFlight || this.state === 'up') return
    const generation = this.generation
    this.openInFlight = true
    this.state = 'connecting'
    this.notify()

    try {
      await this.openOnce(generation)
    } finally {
      this.openInFlight = false
    }
  }

  private async openOnce(generation: number): Promise<void> {
    if (this.stopped || generation !== this.generation) return

    let resolved: ResolvedSshParameters
    let forward: { host: string; port: number }
    try {
      forward = assertLoopbackForward(this.transport)
      resolved = resolveSshConfigForTransport(this.transport)
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error), generation, false)
      return
    }

    const preferSsh2 =
      this.transport.engine === 'ssh2' ||
      (this.transport.passphrase !== undefined && this.transport.passphrase !== '' && this.transport.engine !== 'system-ssh')

    if (!preferSsh2) {
      const ok = await this.openWithSystemSsh(resolved, generation)
      if (ok || this.stopped || generation !== this.generation || this.transport.engine === 'system-ssh') return
    }

    if (resolved.proxyJump !== undefined || resolved.proxyCommand !== undefined) {
      this.fail(
        'ssh2 engine cannot honor ProxyJump/ProxyCommand; use system-ssh with an SSH agent',
        generation,
        false,
      )
      return
    }

    await this.openWithSsh2(resolved, forward, generation)
  }

  private async openWithSystemSsh(resolved: ResolvedSshParameters, generation: number): Promise<boolean> {
    if (generation !== this.generation) return true
    if (
      this.transport.privateKeyPath !== undefined &&
      this.transport.privateKeyPath.trim() !== '' &&
      !existsSync(expandHomePath(this.transport.privateKeyPath.trim()))
    ) {
      this.fail(`SSH private key not found: ${this.transport.privateKeyPath}`, generation, false)
      return false
    }

    let port: number
    try {
      port = await allocateLoopbackPort()
    } catch (error) {
      this.fail(`Failed to allocate local port: ${error instanceof Error ? error.message : String(error)}`, generation)
      return false
    }
    if (generation !== this.generation || this.stopped) return true

    const args = buildSystemSshArgs(this.transport, resolved, port)
    let stderr = ''
    let proc: ChildProcess
    try {
      proc = spawn('ssh', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    } catch (error) {
      if (this.transport.engine === 'system-ssh') {
        this.fail(`Failed to spawn ssh: ${error instanceof Error ? error.message : String(error)}`, generation)
      }
      return false
    }
    if (generation !== this.generation || this.stopped) {
      this.killChild(proc)
      return true
    }

    this.sshProc = proc
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
      if (stderr.length > 4096) stderr = stderr.slice(-4096)
    })

    const readyResult = await waitForLocalForwardReady(proc, port, READY_TIMEOUT_MS)
    if (generation !== this.generation) {
      this.killChild(proc)
      return true
    }
    if (!readyResult.ok) {
      const detail = stderr.trim() || readyResult.error
      if (this.transport.engine === 'system-ssh' || !detail.includes('ENOENT')) {
        this.fail(`SSH tunnel failed (${resolved.hostName}): ${detail}`, generation)
        return true // Handled via fail+retry
      }
      this.killChild(proc)
      if (this.sshProc === proc) this.sshProc = undefined
      return false
    }

    if (this.stopped || generation !== this.generation) {
      this.killChild(proc)
      if (this.sshProc === proc) this.sshProc = undefined
      return true
    }

    this.localPort = port
    this.activeEngine = 'system-ssh'
    this.state = 'up'
    this.lastError = undefined
    this.attempt = 0
    this.notify()

    proc.on('close', (code) => {
      if (this.stopped || this.sshProc !== proc || generation !== this.generation) return
      const msg = stderr.trim() || `ssh tunnel exited (code ${String(code)})`
      this.fail(msg, generation, true)
    })
    proc.on('error', (err) => {
      if (this.stopped || this.sshProc !== proc || generation !== this.generation) return
      this.fail(err.message, generation, true)
    })

    return true
  }

  private async openWithSsh2(
    resolved: ResolvedSshParameters,
    forward: { host: string; port: number },
    generation: number,
  ): Promise<void> {
    if (generation !== this.generation || this.stopped) return
    let ClientCtor: new () => Ssh2ClientLike
    try {
      const mod = (await import('ssh2')) as unknown as { Client: new () => Ssh2ClientLike }
      ClientCtor = mod.Client
    } catch {
      this.fail('Neither system ssh nor ssh2 succeeded; check SSH configuration', generation, true)
      return
    }

    let privateKey: Buffer | undefined
    if (this.transport.privateKeyPath !== undefined && this.transport.privateKeyPath.trim() !== '') {
      const keyFile = expandHomePath(this.transport.privateKeyPath.trim())
      try {
        privateKey = readFileSync(keyFile)
      } catch (error) {
        this.fail(
          `Cannot read private key ${keyFile}: ${error instanceof Error ? error.message : String(error)}`,
          generation,
          false,
        )
        return
      }
    } else {
      for (const candidate of resolved.identityFiles) {
        if (existsSync(candidate)) {
          try {
            privateKey = readFileSync(candidate)
            break
          } catch {
            // Try next key
          }
        }
      }
    }

    if (generation !== this.generation || this.stopped) return
    const conn = new ClientCtor()
    this.ssh2Conn = conn

    const connected = new Promise<void>((res, rej) => {
      conn.on('ready', () => res())
      conn.on('error', (err) => rej(err instanceof Error ? err : new Error(String(err))))
      conn.on('close', () => {
        if (!this.stopped && generation === this.generation && this.state === 'up' && this.ssh2Conn === conn) {
          this.fail('SSH connection closed', generation, true)
        }
      })
      conn.connect({
        host: resolved.hostName,
        port: resolved.port,
        username: resolved.user,
        ...(privateKey !== undefined ? { privateKey } : {}),
        ...(this.transport.passphrase !== undefined ? { passphrase: this.transport.passphrase } : {}),
        ...(process.env.SSH_AUTH_SOCK !== undefined ? { agent: process.env.SSH_AUTH_SOCK } : {}),
        hostVerifier: (key: Buffer) => verifySsh2HostKey(resolved.hostName, resolved.port, key),
        readyTimeout: READY_TIMEOUT_MS,
        keepaliveInterval: KEEPALIVE_INTERVAL_SEC * 1000,
      })
    })

    try {
      await connected
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error), generation, true)
      return
    }

    if (this.stopped || generation !== this.generation) {
      this.teardown()
      return
    }

    const server = createServer((socket: Socket) => {
      this.sockets.add(socket)
      socket.on('close', () => this.sockets.delete(socket))
      socket.on('error', () => socket.destroy())
      conn.forwardOut('127.0.0.1', 0, forward.host, forward.port, (err, stream) => {
        if (err || !stream) {
          socket.destroy()
          return
        }
        socket.pipe(stream).pipe(socket)
        stream.on('error', () => socket.destroy())
      })
    })
    this.ssh2Server = server

    try {
      await new Promise<void>((res, rej) => {
        server.once('error', rej)
        server.listen(0, '127.0.0.1', () => res())
      })
    } catch (error) {
      this.fail(`Cannot bind local forward port: ${error instanceof Error ? error.message : String(error)}`, generation, true)
      return
    }

    if (generation !== this.generation || this.stopped) {
      this.teardown()
      return
    }

    const address = server.address()
    if (address === null || typeof address === 'string') {
      this.fail('Local forward server did not report a port', generation, true)
      return
    }

    this.localPort = address.port
    this.activeEngine = 'ssh2'
    this.state = 'up'
    this.lastError = undefined
    this.attempt = 0
    this.notify()
  }
}

async function waitForLocalForwardReady(
  proc: ChildProcess,
  port: number,
  timeoutMs: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const deadline = Date.now() + timeoutMs
  let exited: { code: number | null; error?: Error } | undefined
  const onExit = (code: number | null): void => { exited = { code } }
  const onError = (error: Error): void => { exited = { code: null, error } }
  proc.once('exit', onExit)
  proc.once('error', onError)

  try {
    while (Date.now() < deadline) {
      if (exited !== undefined) {
        return {
          ok: false,
          error: exited.error?.message ?? `ssh exited early with code ${String(exited.code)}`,
        }
      }
      const reachable = await tryTcpConnect(port, 350)
      if (reachable) return { ok: true }
      await new Promise(r => setTimeout(r, 120))
    }
    return { ok: false, error: 'timed out waiting for SSH local port forward' }
  } finally {
    proc.removeListener('exit', onExit)
    proc.removeListener('error', onError)
  }
}

function tryTcpConnect(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    let settled = false
    const done = (ok: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    const timer = setTimeout(() => done(false), timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      done(true)
    })
    socket.once('error', () => {
      clearTimeout(timer)
      done(false)
    })
  })
}

/**
 * Verify an in-process `ssh2` host key against the user's `known_hosts`.
 *
 * The system `ssh` engine keeps its normal host-key policy. The fallback
 * engine must not silently accept an unknown key, so it requires a matching
 * entry and tells the user to connect once with `ssh` / `ssh-keyscan` when the
 * host is new.
 */
/**
 * Compare one `ssh-keygen -F` output line with the key ssh2 presented.
 *
 * `-F` reprints matching `known_hosts` lines, including hashed hosts
 * (`|1|salt|hash type base64`). The host token can itself contain spaces, so
 * the key is the field after the key-type token, not a fixed index. Comment
 * lines (`# Host … found`) and markers (`@cert-authority`) are not keys.
 */
export function hostKeyMatchesKnownHostsLine(line: string, key: Buffer): boolean {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('@')) return false
  const parts = trimmed.split(/\s+/)
  if (parts.length < 3) return false
  const typeIndex = parts.findIndex(part => /^(?:ssh|ecdsa|sk-ssh|sk-ecdsa)-/.test(part))
  if (typeIndex < 1 || parts[typeIndex + 1] === undefined) return false
  const knownKey = Buffer.from(parts[typeIndex + 1], 'base64')
  if (knownKey.byteLength === 0 || knownKey.byteLength !== key.byteLength) return false
  return knownKey.equals(key)
}

function verifySsh2HostKey(host: string, port: number, key: Buffer): boolean {
  const knownHosts = join(homedir(), '.ssh', 'known_hosts')
  if (!existsSync(knownHosts)) return false
  const target = port === 22 ? host : `[${host}]:${String(port)}`
  try {
    const output = execFileSync('ssh-keygen', ['-F', target, '-f', knownHosts], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    for (const line of output.split(/\r?\n/)) {
      if (hostKeyMatchesKnownHostsLine(line, key)) return true
    }
  } catch {
    // Missing ssh-keygen or unknown host: reject rather than trust blindly.
  }
  return false
}

/** One-shot tunnel probe for the "Test Connection" button. */
export async function probeSshTunnel(
  transport: SshTransportConfig,
): Promise<{ ok: true; baseUrl: string; engine: 'system-ssh' | 'ssh2'; close: () => void } | { ok: false; error: string }> {
  const tunnel = new SshTunnel(transport, () => {})
  await tunnel.start()
  const status = tunnel.status()
  const baseUrl = tunnel.baseUrl()
  if (status.state !== 'up' || baseUrl === undefined) {
    tunnel.stop()
    return { ok: false, error: status.error ?? 'SSH tunnel failed to establish' }
  }
  return {
    ok: true,
    baseUrl,
    engine: status.engine ?? 'system-ssh',
    close: () => tunnel.stop(),
  }
}

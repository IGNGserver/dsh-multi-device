/**
 * Independent Native Mode Reverse Proxy (`NativeDeviceProxy` & `NativeProxyManager`).
 *
 * Why a dedicated local loopback proxy port per device (`http://127.0.0.1:<port>/`):
 * 1. Remote DSH Web UI uses root-relative asset & API paths (`/assets/...`, `/plugins/??...`, `/api/...`,
 *    `/api/remote.mux`). Serving each device on its own loopback port preserves root-relative resolution
 *    100% natively without brittle HTML/JS AST rewriting.
 * 2. Electron Desktop's `DesktopBrowserGuests` blocks `<webview>` navigation to the local Host's own port
 *    (`isApplicationHost`), but allows `http://127.0.0.1:<proxyPort>` because `<proxyPort> !== host.port`.
 * 3. Remote DSH 0.2 enforces `Host`/`Origin` matching and `dsh-auth-<sha256>` signed cookies. This proxy
 *    transparently injects the authenticated `Cookie`/`Authorization` headers, rewrites `Host` and `Origin`
 *    to the remote server's expected authority, strips `X-Frame-Options` and `frame-ancestors` CSP directives,
 *    and forwards both HTTP requests and WebSocket upgrades (`/api/remote.mux`, `/api/events.mux`).
 * 4. Completely independent of Aggregated Mode: even if Aggregated Mode fails or is disabled, Native Mode
 *    continues to work as long as the device's HTTP/tunnel endpoint is reachable.
 * 5. Intercepts upstream 401/403, forces one re-authentication (stale cookies are common after a
 *    remote restart), and serves a branded authorization page instead of the remote's plain-text
 *    login line. The client renders its own authorization panel and never asks users to sign in
 *    inside the frame (browser cookies are stripped by design).
 *
 * @module dsh-multi-device/host/native-proxy
 */
import { randomUUID } from 'node:crypto'
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Duplex } from 'node:stream'
import { brotliDecompress, gunzip, inflate } from 'node:zlib'
import { promisify } from 'node:util'
import { WebSocket, WebSocketServer } from 'ws'
import type { DeviceConfig, DeviceId, NativePaneState } from '../contract.ts'
import { DeviceAuthManager, resolveRemoteAuthority } from './auth.ts'
import {
  buildNativeBridgeScript,
  injectNativeBridge,
  isNativeBridgeScriptPath,
  isNativeBridgeSocketPath,
  sanitizeGroupState,
  sanitizeReadCompletions,
} from './native-bridge.ts'

const PROXY_TOKEN_QUERY = 'md_token'
const PROXY_COOKIE_PREFIX = 'dsh-md-native-'
const LEGACY_CLIENT_ID = 'legacy'

/** Omitted IDs are legacy only, never a wildcard for every bridge. */
function bridgeClientId(value: string | null | undefined): string {
  return value === undefined || value === null || value === '' ? LEGACY_CLIENT_ID : value
}

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/** Headers the browser must not be allowed to inject into the upstream request. */
const CLIENT_AUTH_HEADERS = new Set(['cookie', 'authorization', 'proxy-authorization'])

function isHopByHopHeader(name: string): boolean {
  return HOP_BY_HOP_HEADERS.has(name.toLowerCase())
}

/**
 * Copy a client request onto the upstream connection.
 * The plugin supplies Cookie and Authorization itself; client values, proxy
 * headers, and `x-forwarded-*` are dropped so a page cannot smuggle credentials
 * or rewrite the remote's view of the caller.
 */
export function buildForwardHeaders(
  incoming: IncomingMessage['headers'],
  injected: {
    readonly host: string
    readonly origin?: string
    readonly cookie?: string
    readonly authorization?: string
  },
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const [key, val] of Object.entries(incoming)) {
    if (val === undefined) continue
    const lower = key.toLowerCase()
    if (lower === 'host' || lower === 'origin' || lower === 'referer') continue
    // `connection` and `upgrade` are hop-by-hop, but a WebSocket proxy has to
    // forward them or the upstream answers with a normal HTTP response.
    if (lower !== 'connection' && lower !== 'upgrade' && isHopByHopHeader(lower)) continue
    if (CLIENT_AUTH_HEADERS.has(lower)) continue
    if (lower.startsWith('proxy-') || lower.startsWith('x-forwarded-')) continue
    out[key] = val
  }
  out['host'] = injected.host
  if (injected.origin !== undefined) out['origin'] = injected.origin
  if (injected.cookie !== undefined) out['cookie'] = injected.cookie
  if (injected.authorization !== undefined) out['authorization'] = injected.authorization
  return out
}

/** Bound and normalize a remote page title before it enters local window chrome. */
export function sanitizeBridgeTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
  return text === '' ? undefined : text
}

/** Structural equality for a bounded workspace fold map. */
function sameGroupState(
  left: Readonly<Record<string, boolean>>,
  right: Readonly<Record<string, boolean>>,
): boolean {
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) return false
  return leftKeys.every(key => left[key] === right[key])
}

/** Messages the framed page's bridge can send to the proxy. */
export interface NativeBridgeNavigation {
  readonly sessionId: string
  readonly requestSeq: number
  readonly openState: 'loading' | 'open' | 'error'
  readonly error?: string
}

type NativeBridgeInbound =
  | { readonly type: 'ready'; readonly deviceId?: string }
  | { readonly type: 'failed'; readonly error?: string }
  | ({ readonly type: 'navigation' } & NativeBridgeNavigation)
  | { readonly type: 'selection'; readonly sessionId?: string | null }
  | { readonly type: 'group-expansion'; readonly groups?: unknown }
  | { readonly type: 'read'; readonly sessionId?: string; readonly completionId?: string; readonly requestId?: string }
  | { readonly type: 'title'; readonly title?: string }
  | { readonly type: 'visibility'; readonly visible?: boolean }

/** Commands the proxy sends into the framed page's bridge. */
type NativeBridgeOutbound =
  | { readonly type: 'open-session'; readonly sessionId: string; readonly requestSeq?: number }
  | { readonly type: 'refresh' }
  | { readonly type: 'set-embedded'; readonly enabled: boolean }
  | { readonly type: 'group-expansion'; readonly groups: Record<string, boolean> }
  | { readonly type: 'read-state'; readonly unreadSessionIds: readonly string[]; readonly readCompletions?: Readonly<Record<string, string>> }
  | ({ readonly type: 'read-ack'; readonly sessionId: string; readonly requestId?: string; readonly completionId?: string } & NativeBridgeReadResult)

/** Host acceptance only: this ACK does not promise synchronous disk persistence. */
export interface NativeBridgeReadResult {
  readonly accepted: boolean
  readonly currentCompletionId?: string
  readonly unread: boolean
}

export interface NativeProxyHooks {
  /** Report the credential state observed while proxying a device. */
  readonly onAuthState?: (
    deviceId: DeviceId,
    state: 'ok' | 'required' | 'error',
    error?: string,
  ) => void
  /** Report the injected Native Pane bridge lifecycle for one device. */
  readonly onBridgeState?: (
    deviceId: DeviceId,
    state: NativePaneState,
    error?: string,
    clientId?: string,
  ) => void
  /** Report the raw remote Session the framed page currently shows. */
  readonly onBridgeSelection?: (deviceId: DeviceId, sessionId: string | undefined, clientId?: string) => void
  /** History-open acknowledgement, independent from the UI selection report. */
  readonly onBridgeNavigation?: (deviceId: DeviceId, navigation: NativeBridgeNavigation, clientId?: string) => void
  /** Report the framed page's own `document.title` (empty means no title). */
  readonly onBridgeTitle?: (deviceId: DeviceId, title: string | undefined, clientId?: string) => void
  /** Report whether at least one framed page for this device is actually visible. */
  readonly onBridgeVisibility?: (deviceId: DeviceId, visible: boolean, clientId?: string) => void
  /** Persist the port a proxy actually bound, so the next restart keeps the origin. */
  readonly onPortAllocated?: (deviceId: DeviceId, port: number) => void
  /** Last Host-owned workspace fold state for the bridge's first render. */
  readonly getGroupState?: (deviceId: DeviceId) => Readonly<Record<string, boolean>> | undefined
  /** The framed page reported a fold change the Host should persist. */
  readonly onGroupState?: (deviceId: DeviceId, groups: Record<string, boolean>) => void
  /** Raw remote Session IDs whose completion is unread on the Host. */
  readonly getUnreadState?: (deviceId: DeviceId) => readonly string[] | undefined
  /** Current completion tokens, including completions already read. */
  readonly getReadCompletions?: (deviceId: DeviceId) => Readonly<Record<string, string>> | undefined
  /** Accept a read for precisely this completion (omitted token is legacy). */
  readonly onBridgeRead?: (deviceId: DeviceId, sessionId: string, expectedCompletionId?: string) => void | NativeBridgeReadResult
}

/** Backwards-compatible alias for callers that only cared about auth hooks. */
export type NativeProxyAuthHooks = NativeProxyHooks

/** Upper bound for an HTML document held for bridge injection. */
const MAX_INJECTABLE_HTML_BYTES = 20 * 1024 * 1024
/** How long a framed page may take to report bridge readiness. */
const BRIDGE_READY_TIMEOUT_MS = 15_000

export interface NativeBridgeSnapshot {
  state: NativePaneState
  error?: string
  sessionId?: string
  title?: string
}

interface ClientBridgeState extends NativeBridgeSnapshot {
  visible: boolean
  embedded: boolean
  pendingOpenSession?: string
  pendingRequestSeq?: number
  /** Latest container socket alone may acknowledge or execute navigation. */
  navigationOwner?: WebSocket
  readyTimer?: ReturnType<typeof setTimeout>
}

export class NativeDeviceProxy {
  private server: Server | undefined
  private startPromise: Promise<void> | undefined
  private startAbort: AbortController | undefined
  private generation = 0
  /** Includes requests waiting on authentication, HTTP streams and WS handshakes. */
  private readonly cancelUpstreams = new Set<() => void>()
  private localPort: number | undefined
  private readonly sockets = new Set<Duplex>()
  private stopped = false
  private lastAuthAttemptAt = 0
  private lastAuthRecoveryAt = 0
  private authRecoveryInFlight: Promise<boolean> | undefined
  private readonly token = randomUUID().replaceAll('-', '')
  private bridgeServer: WebSocketServer | undefined
  // Cookies ignore ports: one name per proxy prevents device A/B overwriting
  // each other's loopback bootstrap cookie in the same browser cookie jar.
  private readonly cookieName = `${PROXY_COOKIE_PREFIX}${randomUUID().replaceAll('-', '')}`
  private readonly bridgeClients = new Map<WebSocket, string>()
  private readonly clientStates = new Map<string, ClientBridgeState>()
  private readonly bridgeVisibility = new Map<WebSocket, boolean>()
  private readonly readyBridgeClients = new Set<WebSocket>()
  /** Host-owned workspace fold state, applied before the remote page's first render. */
  private groupState: Record<string, boolean> = {}
  /** Host-owned raw Session IDs whose completion is unread. */
  private unreadState: readonly string[] = []
  private readCompletions: Readonly<Record<string, string>> | undefined

  constructor(
    private device: DeviceConfig,
    private readonly getUpstreamBaseUrl: () => string | undefined,
    private readonly authManager: DeviceAuthManager,
    private readonly localOrigin?: () => string | undefined,
    private readonly hooks: NativeProxyHooks = {},
  ) {
    this.refreshHostState(device)
  }

  updateDevice(device: DeviceConfig): void {
    this.device = device
    this.refreshHostState(device)
  }

  private refreshHostState(device: DeviceConfig): void {
    this.groupState = sanitizeGroupState(this.hooks.getGroupState?.(device.id))
    this.unreadState = this.hooks.getUnreadState?.(device.id) ?? []
    const completions = this.hooks.getReadCompletions?.(device.id)
    this.readCompletions = completions === undefined ? undefined : sanitizeReadCompletions(completions)
  }

  proxyUrl(): string | undefined {
    if (this.localPort === undefined) return undefined
    return `http://127.0.0.1:${this.localPort}/?${PROXY_TOKEN_QUERY}=${this.token}`
  }

  private proxyOrigin(): string | undefined {
    return this.localPort === undefined ? undefined : `http://127.0.0.1:${this.localPort}`
  }

  private allowedFramingAncestors(): string[] {
    const local = this.localOrigin?.()
    if (local === undefined || local === '') return []
    const origins = new Set<string>([local])
    try {
      const parsed = new URL(local)
      const host = parsed.hostname.toLowerCase()
      if (host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1') {
        const portSuffix = parsed.port !== '' ? `:${parsed.port}` : ''
        origins.add(`${parsed.protocol}//127.0.0.1${portSuffix}`)
        origins.add(`${parsed.protocol}//localhost${portSuffix}`)
        origins.add(`${parsed.protocol}//[::1]${portSuffix}`)
      }
    } catch {
      // Keep raw local origin
    }
    return [...origins]
  }

  private isAllowedCallerOrigin(origin: string | undefined): boolean {
    if (origin === undefined || origin === '') return true
    const allowed = new Set<string>(this.allowedFramingAncestors())
    const proxyOrigin = this.proxyOrigin()
    if (proxyOrigin !== undefined) {
      allowed.add(proxyOrigin)
      try {
        const parsed = new URL(proxyOrigin)
        const portSuffix = parsed.port !== '' ? `:${parsed.port}` : ''
        allowed.add(`${parsed.protocol}//127.0.0.1${portSuffix}`)
        allowed.add(`${parsed.protocol}//localhost${portSuffix}`)
        allowed.add(`${parsed.protocol}//[::1]${portSuffix}`)
      } catch {
        // Ignore
      }
    }
    return allowed.has(origin)
  }

  port(): number | undefined {
    return this.localPort
  }

  start(preferredPort?: number): Promise<void> {
    if (this.startPromise !== undefined) return this.startPromise
    if (this.server !== undefined || this.stopped) return Promise.resolve()
    const generation = ++this.generation
    const controller = new AbortController()
    this.startAbort = controller
    const server = createServer((req, res) => {
      void this.handleHttp(req, res).catch((error: unknown) => {
        this.respondProxyError(res, error)
      })
    })
    // Own the server before the first await: stop() must also cancel a pending bind.
    this.server = server
    server.on('upgrade', (req, socket, head) => {
      try {
        const parsed = parseOriginForm(req.url)
        if (parsed !== undefined && isNativeBridgeSocketPath(parsed.pathname)) {
          this.handleBridgeUpgrade(req, socket, head)
          return
        }
        this.handleUpgrade(req, socket, head)
      } catch {
        socket.destroy()
      }
    })
    server.on('connection', (socket) => {
      if (this.stopped) { socket.destroy(); return }
      this.sockets.add(socket)
      socket.once('close', () => this.sockets.delete(socket))
    })

    const listenOn = (port: number): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
          server.off('listening', onListening)
          server.off('error', onError)
          controller.signal.removeEventListener('abort', onAbort)
        }
        const onError = (error: Error): void => { cleanup(); reject(error) }
        const onListening = (): void => { cleanup(); resolve() }
        const onAbort = (): void => { cleanup(); resolve() }
        if (controller.signal.aborted) { resolve(); return }
        server.once('error', onError)
        server.once('listening', onListening)
        controller.signal.addEventListener('abort', onAbort, { once: true })
        try {
          server.listen({ port, host: '127.0.0.1', signal: controller.signal })
        } catch (error) {
          cleanup()
          reject(error)
        }
      })

    const promise = (async () => {
      try {
        const preferred = typeof preferredPort === 'number' &&
          Number.isInteger(preferredPort) && preferredPort > 0 && preferredPort <= 65_535
          ? preferredPort : undefined
        if (preferred !== undefined) {
          try {
            await listenOn(preferred)
          } catch (error) {
            if (this.stopped || generation !== this.generation) return
            if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
            await listenOn(0)
          }
        } else {
          await listenOn(0)
        }
        if (this.stopped || generation !== this.generation) {
          server.close()
          return
        }
        const addr = server.address()
        if (addr !== null && typeof addr === 'object') this.localPort = addr.port
        this.bridgeServer = new WebSocketServer({ noServer: true })
        if (this.localPort !== undefined) {
          try { this.hooks.onPortAllocated?.(this.device.id, this.localPort) } catch { /* optional persistence */ }
        }
      } catch (error) {
        controller.abort()
        server.close()
        if (this.server === server) this.server = undefined
        if (!this.stopped) throw error
      } finally {
        if (this.startAbort === controller) this.startAbort = undefined
        this.startPromise = undefined
      }
    })()
    this.startPromise = promise
    return promise
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    ++this.generation
    this.startAbort?.abort()
    for (const cancel of [...this.cancelUpstreams]) cancel()
    this.cancelUpstreams.clear()
    for (const [clientId, state] of [...this.clientStates]) {
      this.clearBridgeTimer(clientId)
      try {
        if (state.visible) {
          state.visible = false
          this.hooks.onBridgeVisibility?.(this.device.id, false, clientId)
        }
        if (state.title !== undefined) {
          state.title = undefined
          this.hooks.onBridgeTitle?.(this.device.id, undefined, clientId)
        }
        this.resetBridgeSelection(clientId)
        this.setBridgeState('idle', undefined, clientId)
      } catch { /* Notifications must not prevent resource disposal. */ }
    }
    for (const client of this.bridgeClients.keys()) {
      try { client.terminate() } catch { /* ignore */ }
    }
    this.bridgeClients.clear()
    this.bridgeServer?.close()
    this.bridgeServer = undefined
    this.bridgeVisibility.clear()
    this.clientStates.clear()
    for (const socket of this.sockets) {
      try { socket.destroy() } catch { /* ignore */ }
    }
    this.sockets.clear()
    this.server?.close()
    this.server = undefined
    this.localPort = undefined
  }

  /** Keep recent disconnected panes/pending navigation without evicting live bridges. */
  private trimClientStates(protectedClientId?: string): void {
    const live = new Set(this.bridgeClients.values())
    let offline = [...this.clientStates.keys()].filter(id => !live.has(id)).length
    for (const id of this.clientStates.keys()) {
      if (offline <= 256) break
      if (id === protectedClientId || live.has(id)) continue
      this.clearBridgeTimer(id)
      this.clientStates.delete(id)
      offline--
    }
  }

  private clientState(clientId = LEGACY_CLIENT_ID): ClientBridgeState {
    let state = this.clientStates.get(clientId)
    if (state === undefined) state = { state: 'idle', visible: false, embedded: false }
    // Map insertion order doubles as recency for the bounded offline cache.
    this.clientStates.delete(clientId)
    this.clientStates.set(clientId, state)
    this.trimClientStates(clientId)
    return state
  }

  /** Current bridge lifecycle for this client only (legacy never aggregates). */
  bridgeSnapshot(clientId = LEGACY_CLIENT_ID): NativeBridgeSnapshot {
    const state = this.clientStates.get(clientId)
    return {
      state: state?.state ?? 'idle',
      ...(state?.error !== undefined ? { error: state.error } : {}),
      ...(state?.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
      ...(state?.title !== undefined ? { title: state.title } : {}),
    }
  }

  /** Queue/replay navigation only within the requesting browser client. */
  openSession(sessionId: string, clientId = LEGACY_CLIENT_ID, requestSeq?: number): void {
    if (requestSeq !== undefined && (!Number.isSafeInteger(requestSeq) || requestSeq < 0)) return
    const state = this.clientState(clientId)
    // Sequence counters may restart for a replacement container; socket
    // ownership fences its generation, acknowledgements match the latest target.
    state.pendingOpenSession = sessionId
    state.pendingRequestSeq = requestSeq
    this.sendToBridge({ type: 'open-session', sessionId, ...(requestSeq === undefined ? {} : { requestSeq }) }, clientId)
  }

  /** Ask the framed page to refresh its own Session list (after fork/create). */
  requestRefresh(): void {
    this.sendToBridge({ type: 'refresh' })
  }

  /** Switch the same framed page between embedded pane and full native mode. */
  setEmbedded(enabled: boolean, clientId = LEGACY_CLIENT_ID): void {
    const state = this.clientState(clientId)
    if (state.embedded === enabled) return
    state.embedded = enabled
    this.sendToBridge({ type: 'set-embedded', enabled }, clientId)
  }

  /** Apply Host-owned fold state to the framed page and every open client. */
  setGroupState(groups: Readonly<Record<string, boolean>>): void {
    const next = sanitizeGroupState(groups)
    if (sameGroupState(this.groupState, next)) return
    this.groupState = next
    this.sendToBridge({ type: 'group-expansion', groups: next })
  }

  /** Apply Host-owned unread state to the framed page. */
  setUnreadState(unreadSessionIds: readonly string[], readCompletions?: Readonly<Record<string, string>>): void {
    const next = [...unreadSessionIds]
    const tokens = readCompletions === undefined ? undefined : sanitizeReadCompletions(readCompletions)
    const sameTokens = tokens === undefined ? this.readCompletions === undefined
      : this.readCompletions !== undefined && Object.keys(tokens).length === Object.keys(this.readCompletions).length &&
        Object.keys(tokens).every(id => tokens[id] === this.readCompletions?.[id])
    if (
      sameTokens && next.length === this.unreadState.length &&
      next.every((id, index) => id === this.unreadState[index])
    ) {
      return
    }
    this.unreadState = next
    this.readCompletions = tokens
    this.sendToBridge({ type: 'read-state', unreadSessionIds: next, ...(tokens !== undefined ? { readCompletions: tokens } : {}) })
  }

  /** Reset only this client's cached command target (device switched away). */
  clearPendingSession(clientId = LEGACY_CLIENT_ID): void {
    const state = this.clientStates.get(clientId)
    if (state !== undefined) {
      state.pendingOpenSession = undefined
      state.pendingRequestSeq = undefined
    }
  }

  private sendToSocket(client: WebSocket, message: NativeBridgeOutbound): void {
    if (client.readyState !== WebSocket.OPEN) return
    try { client.send(JSON.stringify(message)) } catch { /* ignore */ }
  }

  private sendToBridge(message: NativeBridgeOutbound, clientId?: string): void {
    // Only shared catalog/read/group updates may omit the target. Navigation
    // and embedding must always be addressed, including the legacy partition.
    if (clientId === undefined && (message.type === 'open-session' || message.type === 'set-embedded')) return
    for (const [client, owner] of this.bridgeClients) {
      if (clientId !== undefined && owner !== clientId) continue
      if (message.type === 'open-session' && this.clientStates.get(owner)?.navigationOwner !== client) continue
      this.sendToSocket(client, message)
    }
  }

  private setBridgeState(state: NativePaneState, error?: string, clientId = LEGACY_CLIENT_ID): void {
    const current = this.clientState(clientId)
    const nextError = error?.trim() === '' ? undefined : error
    if (current.state === state && current.error === nextError) return
    current.state = state
    current.error = nextError
    this.hooks.onBridgeState?.(this.device.id, state, nextError, clientId)
  }

  private clearBridgeTimer(clientId = LEGACY_CLIENT_ID): void {
    const state = this.clientStates.get(clientId)
    if (state?.readyTimer !== undefined) {
      clearTimeout(state.readyTimer)
      state.readyTimer = undefined
    }
  }

  private armBridgeTimer(clientId = LEGACY_CLIENT_ID): void {
    this.clearBridgeTimer(clientId)
    const state = this.clientState(clientId)
    const timer = setTimeout(() => {
      state.readyTimer = undefined
      if (state.state === 'ready') return
      this.setBridgeState('failed', 'the framed page never reported a ready bridge', clientId)
    }, BRIDGE_READY_TIMEOUT_MS)
    timer.unref?.()
    state.readyTimer = timer
  }

  private respondProxyError(res: ServerResponse, error: unknown): void {
    if (this.stopped || res.destroyed || res.writableEnded) return
    if (res.headersSent) { res.destroy(); return }
    res.writeHead(502, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(renderUnavailableHtml(this.device.name, error instanceof Error ? error.message : String(error)))
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this.stopped) { res.destroy(); return }
    const upstreamBase = this.getUpstreamBaseUrl()
    if (upstreamBase === undefined) {
      res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(renderUnavailableHtml(this.device.name, 'Device tunnel or connection is not ready yet.'))
      return
    }

    const parsed = parseOriginForm(req.url)
    if (parsed === undefined) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end('Invalid native proxy request target')
      return
    }

    const proxyOrigin = this.proxyOrigin()
    if (proxyOrigin === undefined) {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end('Native proxy is not listening')
      return
    }

    // Same fence as both WebSocket paths, before bootstrap or upstream auth.
    if (!this.isAllowedCallerOrigin(req.headers.origin)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end('Native proxy caller origin is not allowed')
      return
    }

    const rawTarget = stripProxyTokenFromRawTarget(req.url ?? '/')
    const requestUrl = new URL(req.url ?? '/', proxyOrigin)
    const clientId = bridgeClientId(requestUrl.searchParams.get('md_client'))
    const queryToken = requestUrl.searchParams.get(PROXY_TOKEN_QUERY)
    const cookieToken = readCookie(req.headers.cookie, this.cookieName)
    if (queryToken === this.token && cookieToken !== this.token) {
      res.writeHead(302, {
        location: rawTarget,
        'set-cookie': `${this.cookieName}=${this.token}; Path=/; HttpOnly; SameSite=Lax`,
        'cache-control': 'no-store',
      })
      res.end()
      return
    }
    if (cookieToken !== this.token) {
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(renderProxyRejectedHtml('代理访问令牌缺失或与当前页面不匹配。'))
      return
    }
    // SameSite=Lax already prevents this cookie on cross-site subresources;
    // reject an explicit cross-site fetch as a second line of defence.
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(renderProxyRejectedHtml('该请求来自跨站上下文，已被代理拒绝。'))
      return
    }

    if (isNativeBridgeScriptPath(requestUrl.pathname) && (req.method ?? 'GET') === 'GET') {
      res.writeHead(200, {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      })
      res.end(buildNativeBridgeScript({
        groups: this.groupState,
        unread: this.unreadState,
        readCompletions: this.readCompletions,
      }))
      return
    }

    let cancelled = false
    const resources = new Set<{ destroy(): unknown }>()
    const cleanups: (() => void)[] = []
    const cancel = (): void => {
      if (cancelled) return
      cancelled = true
      this.cancelUpstreams.delete(cancel)
      req.off('aborted', cancel)
      // Keep the error sinks until the closed streams are collected: Node can
      // emit ECONNRESET after 'aborted' (and after destroy()).
      res.off('close', cancel)
      res.off('finish', cancel)
      for (const cleanup of cleanups) cleanup()
      for (const resource of resources) resource.destroy()
      resources.clear()
    }
    const active = (): boolean => !cancelled && !this.stopped && !req.aborted && !res.destroyed && !res.writableEnded
    const fail = (error: unknown): void => {
      if (!active()) { cancel(); return }
      this.respondProxyError(res, error)
      cancel()
    }
    this.cancelUpstreams.add(cancel)
    req.once('aborted', cancel)
    req.once('error', cancel)
    res.once('close', cancel)
    res.once('finish', cancel)
    res.once('error', cancel)
    try {
      await this.ensureAuthenticated(upstreamBase)
      if (!active()) { cancel(); return }
    } catch (error) {
      fail(error)
      return
    }

    try {
      const upstream = splitUpstreamBase(upstreamBase)
      const upstreamPath = `${upstream.prefix}${rawTarget}`
      const isHttps = upstream.url.protocol === 'https:'
      const authority = resolveRemoteAuthority(this.device)
      const reqFn = isHttps ? httpsRequest : httpRequest
      const rejectUnauthorized = this.device.transport.kind === 'direct'
        ? this.device.transport.rejectUnauthorized !== false
        : true
      const method = req.method ?? 'GET'
      const injectHtml = isHtmlNavigation(req)

      const forward = (retried: boolean): void => {
        if (!active()) return
        const authHeaders = this.authManager.getAuthHeaders(this.device)
        const outHeaders = buildForwardHeaders(req.headers, {
          host: authority,
          origin: req.headers['origin'] !== undefined
            ? authHeaders['Origin'] ?? `${isHttps ? 'https' : 'http'}://${authority}`
            : undefined,
          cookie: authHeaders['Cookie'],
          authorization: authHeaders['Authorization'],
        })
        if (injectHtml) {
          // Keep the document uncompressed so the bridge tag can be inserted
          // without a second encoding pass; DSH itself has no CSP that would
          // forbid the same-origin script.
          for (const key of Object.keys(outHeaders)) {
            if (key.toLowerCase() === 'accept-encoding') delete outHeaders[key]
          }
        }

        const proxyReq = reqFn(
          upstream.url,
          {
            method,
            path: upstreamPath,
            headers: outHeaders,
            ...(isHttps ? { rejectUnauthorized } : {}),
          },
          (proxyRes) => {
            resources.add(proxyRes)
            proxyRes.once('close', () => resources.delete(proxyRes))
            proxyRes.on('error', fail)
            let discarded = false
            proxyRes.once('aborted', () => {
              if (!discarded) fail(new Error('The upstream response was aborted'))
            })
            if (!active()) { proxyRes.destroy(); return }
            try {
              const status = proxyRes.statusCode ?? 502

              // A remote DSH that rejects the injected credential must never leak its
              // plain-text 401 body into the framed UI. Try one forced re-auth (the
              // stored cookie may be stale after a remote restart), then show the
              // plugin-owned authorization page instead of a blank one-liner.
              if (status === 401 || status === 403) {
                discarded = true
                proxyRes.destroy()
                proxyReq.destroy()
                if (!retried && (method === 'GET' || method === 'HEAD')) {
                  void this.recoverAuthentication(upstreamBase, status)
                    .then((recovered) => {
                      if (!active()) return
                      if (recovered) {
                        forward(true)
                        return
                      }
                      this.respondAuthRequired(res, status)
                    })
                    .catch(fail)
                  return
                }
                // For non-idempotent requests (e.g. POST /api/session/list from an
                // already-loaded SPA), trigger background re-auth so the next retry
                // succeeds without destroying the Keep-Alive frame unless recovery fails.
                void this.recoverAuthentication(upstreamBase, status).then((recovered) => {
                  if (!active()) return
                  if (!recovered) {
                    this.hooks.onAuthState?.(
                      this.device.id,
                      'required',
                      `Remote DSH returned HTTP ${status}`,
                    )
                  }
                }).catch(fail)
                this.respondAuthRequired(res, status)
                return
              }

              if (status >= 200 && status < 400) {
                this.hooks.onAuthState?.(this.device.id, 'ok')
              }

              const resHeaders: Record<string, string | string[]> = {}
              for (const [key, val] of Object.entries(proxyRes.headers)) {
                if (val === undefined) continue
                const lower = key.toLowerCase()
                // The proxy is the only allowed framing parent. Strip the generic
                // DENY header and replace the CSP directive with a local allowlist.
                if (lower === 'x-frame-options') continue
                if (lower === 'content-security-policy') {
                  const cleaned = (Array.isArray(val) ? val.join('; ') : val)
                    .replace(/frame-ancestors[^;]*;?/gi, '')
                    .replace(/;\s*$/u, '')
                    .trim()
                  const allowedAncestors = this.allowedFramingAncestors()
                  const framing = allowedAncestors.length > 0
                    ? `frame-ancestors 'self' ${allowedAncestors.join(' ')}`
                    : ''
                  const next = [cleaned, framing].filter(part => part !== '').join('; ')
                  if (next !== '') resHeaders[key] = next
                  continue
                }
                if (lower === 'set-cookie') {
                  const cookies = Array.isArray(val) ? val : [val]
                  resHeaders[key] = cookies.map(c =>
                    c
                      .replace(/;\s*SameSite=Strict/gi, '; SameSite=Lax')
                      .replace(/;\s*Secure/gi, '')
                      .replace(/;\s*Domain=[^;]*/gi, ''),
                  )
                  continue
                }
                if (lower === 'location' && typeof val === 'string') {
                  resHeaders[key] = rewriteLocation(val, upstreamBase, proxyOrigin)
                  continue
                }
                resHeaders[key] = val
              }

              const contentType = proxyRes.headers['content-type']
              const shouldInject = injectHtml
                && status === 200
                && typeof contentType === 'string'
                && contentType.toLowerCase().includes('text/html')
              if (shouldInject) {
                this.setBridgeState('loading', undefined, clientId)
                this.armBridgeTimer(clientId)
                cleanups.push(this.streamInjectedHtml(proxyRes, res, status, resHeaders, clientId))
                return
              }

              res.writeHead(status, resHeaders)
              proxyRes.pipe(res)
            } catch (error) { fail(error) }
          },
        )
        resources.add(proxyReq)
        proxyReq.once('close', () => resources.delete(proxyReq))
        cleanups.push(() => { req.unpipe(proxyReq) })
        proxyReq.on('error', fail)

        if (retried || method === 'GET' || method === 'HEAD') {
          proxyReq.end()
        } else {
          req.pipe(proxyReq)
        }
      }

      forward(false)
    } catch (error) { fail(error) }
  }

  /**
   * Buffer one HTML document, inject the bridge script and forward it.
   *
   * The response is held only for documents (the SPA shell); assets keep the
   * streaming path. Compression is normally already removed by
   * `accept-encoding: identity`, but a proxy in front of DSH may still compress,
   * so gzip/deflate/br are decoded before injection.
   */
  private streamInjectedHtml(
    proxyRes: IncomingMessage,
    res: ServerResponse,
    status: number,
    baseHeaders: Record<string, string | string[]>,
    clientId: string,
  ): () => void {
    const chunks: Buffer[] = []
    let size = 0
    let finished = false
    const cleanup = (): void => {
      chunks.length = 0
      proxyRes.off('data', onData)
      proxyRes.off('end', onEnd)
      proxyRes.off('error', onError)
      proxyRes.off('aborted', onError)
      if (!finished) this.clearBridgeTimer(clientId)
    }
    const onError = (): void => {
      if (finished) return
      finished = true
      cleanup()
      this.clearBridgeTimer(clientId)
      this.resetBridgeSelection(clientId)
      this.setBridgeState('failed', 'the remote HTML document was interrupted', clientId)
      res.destroy()
    }
    const onData = (chunk: Buffer): void => {
      size += chunk.byteLength
      if (size > MAX_INJECTABLE_HTML_BYTES) {
        finished = true
        cleanup()
        this.clearBridgeTimer(clientId)
        this.resetBridgeSelection(clientId)
        this.setBridgeState('failed', 'the remote HTML document was too large to inject the native bridge', clientId)
        res.writeHead(502, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(renderUnavailableHtml(this.device.name, 'The remote page is too large to inject the native bridge.'))
        proxyRes.destroy()
        return
      }
      chunks.push(chunk)
    }
    const onEnd = (): void => {
      if (finished || res.destroyed || this.stopped) { cleanup(); return }
      finished = true
      const raw = Buffer.concat(chunks)
      cleanup()
      void (async (): Promise<void> => {
        const headers = { ...baseHeaders }
        const encoding = headerValueOf(proxyRes.headers, 'content-encoding')
        let body = raw
        let injected = false
        const decoded = await decodeHtmlBody(raw, encoding)
        if (res.destroyed || this.stopped) return
        if (decoded !== undefined) {
          body = Buffer.from(injectNativeBridge(decoded.toString('utf8'), { deviceId: this.device.id }), 'utf8')
          if (body.byteLength > MAX_INJECTABLE_HTML_BYTES) throw new Error('injected HTML exceeded output limit')
          removeHeader(headers, 'content-encoding')
          injected = true
        }
        if (!injected) {
          this.clearBridgeTimer(clientId)
          this.resetBridgeSelection(clientId)
          this.setBridgeState(
            'failed',
            `the remote HTML document used an unsupported content-encoding (${encoding ?? 'unknown'})`,
            clientId,
          )
        }
        removeHeader(headers, 'content-length')
        // Node framed the upstream body as chunked; we now own a fixed-length
        // buffer, and sending both is an HTTP/1.1 protocol violation.
        removeHeader(headers, 'transfer-encoding')
        removeHeader(headers, 'connection')
        removeHeader(headers, 'keep-alive')
        removeHeader(headers, 'etag')
        removeHeader(headers, 'last-modified')
        headers['cache-control'] = 'no-store'
        headers['content-length'] = String(body.byteLength)
        res.writeHead(status, headers)
        res.end(body)
      })().catch(() => {
        this.clearBridgeTimer(clientId)
        this.resetBridgeSelection(clientId)
        this.setBridgeState('failed', 'the remote HTML document could not be decoded within its output limit', clientId)
        if (!res.destroyed && !res.headersSent && !this.stopped) {
          res.writeHead(502, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
          res.end(renderUnavailableHtml(this.device.name, 'The remote page could not be decoded safely.'))
        }
      })
    }
    proxyRes.on('data', onData)
    proxyRes.prependOnceListener('error', onError)
    proxyRes.prependOnceListener('aborted', onError)
    proxyRes.once('end', onEnd)
    return cleanup
  }

  /** Validate one same-origin bridge upgrade and hand it to the WebSocket server. */
  private handleBridgeUpgrade(req: IncomingMessage, clientSocket: Duplex, head: Buffer): void {
    const parsed = parseOriginForm(req.url)
    const proxyOrigin = this.proxyOrigin()
    const cookieToken = readCookie(req.headers.cookie, this.cookieName)
    if (parsed === undefined || proxyOrigin === undefined || cookieToken !== this.token) {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    const origin = req.headers.origin
    if (!this.isAllowedCallerOrigin(origin)) {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    const bridgeServer = this.bridgeServer
    if (bridgeServer === undefined) {
      clientSocket.destroy()
      return
    }
    bridgeServer.handleUpgrade(req, clientSocket, head, (ws) => {
      this.attachBridge(ws, bridgeClientId(new URLSearchParams(parsed.search).get('client')))
    })
  }

  /** Own one framed page's bridge socket, its readiness and its selection reports. */
  private attachBridge(ws: WebSocket, clientId: string): void {
    const state = this.clientState(clientId)
    const ownerChanged = state.navigationOwner !== ws
    state.navigationOwner = ws
    this.bridgeClients.set(ws, clientId)
    this.bridgeVisibility.set(ws, false)
    if (ownerChanged) {
      // Navigation ownership is per socket; selection/title belong to the
      // logical browser client and survive an overlapping reconnect. The last
      // socket's close still clears them, while stale owners cannot report it.
      this.clearBridgeTimer(clientId)
      this.setBridgeState('loading', undefined, clientId)
      this.armBridgeTimer(clientId)
    }

    ws.on('message', (raw) => {
      if (this.stopped || !this.bridgeClients.has(ws)) return
      let message: NativeBridgeInbound
      try {
        const parsed: unknown = JSON.parse(raw.toString())
        if (typeof parsed !== 'object' || parsed === null) return
        message = parsed as NativeBridgeInbound
      } catch {
        return
      }
      // Older still-connected pages retain their own READ/ACK and visibility
      // lifetimes. Only navigation/selection and shared navigation lifecycle
      // reports are owned by the latest container socket.
      if (state.navigationOwner !== ws &&
          (message.type === 'failed' || message.type === 'navigation' || message.type === 'selection')) return
      if (message.type === 'ready') {
        this.readyBridgeClients.add(ws)
        if (state.navigationOwner === ws) {
          this.clearBridgeTimer(clientId)
          this.setBridgeState('ready', undefined, clientId)
        }
        // Initialization belongs to this new socket, never existing pages.
        this.sendToSocket(ws, { type: 'set-embedded', enabled: state.embedded })
        this.sendToSocket(ws, { type: 'group-expansion', groups: this.groupState })
        const tokens = this.hooks.getReadCompletions?.(this.device.id) ?? this.readCompletions
        this.sendToSocket(ws, {
          type: 'read-state',
          unreadSessionIds: this.hooks.getUnreadState?.(this.device.id) ?? this.unreadState,
          ...(tokens !== undefined ? { readCompletions: sanitizeReadCompletions(tokens) } : {}),
        })
        if (state.navigationOwner === ws && state.pendingOpenSession !== undefined) {
          this.sendToSocket(ws, { type: 'open-session', sessionId: state.pendingOpenSession,
            ...(state.pendingRequestSeq === undefined ? {} : { requestSeq: state.pendingRequestSeq }) })
        }
        return
      }
      if (message.type === 'failed') {
        this.clearBridgeTimer(clientId)
        this.setBridgeState('failed', message.error ?? 'the framed page could not start the native bridge', clientId)
        return
      }
      if (message.type === 'navigation') {
        if (typeof message.sessionId !== 'string' || state.pendingOpenSession === undefined ||
            message.sessionId !== state.pendingOpenSession ||
            !Number.isSafeInteger(message.requestSeq) || message.requestSeq < 0 ||
            (state.pendingRequestSeq !== undefined && message.requestSeq !== state.pendingRequestSeq) ||
            !['loading', 'open', 'error'].includes(message.openState)) return
        const error = typeof message.error === 'string' ? message.error.slice(0, 2000) : undefined
        this.hooks.onBridgeNavigation?.(this.device.id, {
          sessionId: message.sessionId, requestSeq: message.requestSeq, openState: message.openState,
          ...(error === undefined ? {} : { error }),
        }, clientId)
        return
      }
      if (message.type === 'selection') {
        const sessionId = typeof message.sessionId === 'string' && message.sessionId !== ''
          ? message.sessionId
          : undefined
        if (sessionId === state.sessionId) return
        state.sessionId = sessionId
        this.hooks.onBridgeSelection?.(this.device.id, sessionId, clientId)
        return
      }
      if (message.type === 'group-expansion') {
        const groups = sanitizeGroupState(message.groups)
        if (this.hooks.onGroupState !== undefined) {
          this.hooks.onGroupState(this.device.id, groups)
        } else {
          this.setGroupState(groups)
        }
        return
      }
      if (message.type === 'read') {
        const sessionId = typeof message.sessionId === 'string' ? message.sessionId : ''
        if (sessionId === '' || sessionId.length > 512) return
        if (message.completionId !== undefined && (typeof message.completionId !== 'string' || message.completionId === '' || message.completionId.length > 512)) return
        const completionId = typeof message.completionId === 'string' && message.completionId !== '' && message.completionId.length <= 512
          ? message.completionId : undefined
        const requestId = typeof message.requestId === 'string' && message.requestId !== '' && message.requestId.length <= 512
          ? message.requestId : undefined
        let result: NativeBridgeReadResult
        try {
          result = this.hooks.onBridgeRead?.(this.device.id, sessionId, completionId) ?? { accepted: true, unread: false }
        } catch {
          const tokens = this.hooks.getReadCompletions?.(this.device.id) ?? this.readCompletions
          const currentCompletionId = tokens?.[sessionId]
          result = {
            accepted: false,
            unread: (this.hooks.getUnreadState?.(this.device.id) ?? this.unreadState).includes(sessionId),
            ...(currentCompletionId !== undefined ? { currentCompletionId } : {}),
          }
        }
        // onBridgeRead may synchronously broadcast read-state before this ACK.
        // Reply only to the originating socket, even for shared client IDs.
        this.sendToSocket(ws, {
          type: 'read-ack', sessionId,
          ...(requestId !== undefined ? { requestId } : {}),
          ...(completionId !== undefined ? { completionId } : {}),
          ...result,
        })
        return
      }
      if (message.type === 'title') {
        const title = sanitizeBridgeTitle(message.title)
        if (title === state.title) return
        state.title = title
        this.hooks.onBridgeTitle?.(this.device.id, title, clientId)
        return
      }
      if (message.type === 'visibility') {
        this.updateBridgeVisibility(ws, message.visible === true)
      }
    })

    ws.on('close', () => {
      this.bridgeClients.delete(ws)
      this.bridgeVisibility.delete(ws)
      this.readyBridgeClients.delete(ws)
      if (this.stopped) return
      const wasOwner = state.navigationOwner === ws
      const remaining = wasOwner
        ? [...this.bridgeClients].filter(([, owner]) => owner === clientId).map(([socket]) => socket)
        : []
      const nextOwner = remaining.at(-1)
      if (wasOwner) {
        state.navigationOwner = nextOwner
        this.clearBridgeTimer(clientId)
        if (nextOwner !== undefined) {
          if (this.readyBridgeClients.has(nextOwner)) this.setBridgeState('ready', undefined, clientId)
          else {
            this.setBridgeState('loading', undefined, clientId)
            this.armBridgeTimer(clientId)
          }
        }
      }
      this.trimClientStates(clientId)
      this.reportBridgeVisibility(clientId)
      if (!wasOwner || nextOwner !== undefined) return
      if (state.title !== undefined) {
        state.title = undefined
        this.hooks.onBridgeTitle?.(this.device.id, undefined, clientId)
      }
      this.resetBridgeSelection(clientId)
      if (state.state === 'ready' || state.state === 'loading') {
        this.setBridgeState('idle', undefined, clientId)
      }
    })
    ws.on('error', () => {
      try { ws.close() } catch { /* ignore */ }
    })
  }

  private reportBridgeVisibility(clientId: string): void {
    const state = this.clientState(clientId)
    const visible = [...this.bridgeClients].some(([ws, owner]) =>
      owner === clientId && this.bridgeVisibility.get(ws) === true)
    if (visible === state.visible) return
    state.visible = visible
    this.hooks.onBridgeVisibility?.(this.device.id, visible, clientId)
  }

  private updateBridgeVisibility(ws: WebSocket, visible: boolean): void {
    if (this.bridgeVisibility.get(ws) === visible) return
    this.bridgeVisibility.set(ws, visible)
    const clientId = this.bridgeClients.get(ws)
    if (clientId !== undefined) this.reportBridgeVisibility(clientId)
  }

  private resetBridgeSelection(clientId = LEGACY_CLIENT_ID): void {
    const state = this.clientStates.get(clientId)
    if (state?.sessionId === undefined) return
    state.sessionId = undefined
    this.hooks.onBridgeSelection?.(this.device.id, undefined, clientId)
  }

  private async ensureAuthenticated(upstreamBase: string): Promise<void> {
    const now = Date.now()
    if (now - this.lastAuthAttemptAt < 30_000) return
    this.lastAuthAttemptAt = now
    const result = await this.authManager.ensureAuthenticated(this.device, upstreamBase)
    if (this.stopped) return
    if (!result.ok) {
      this.hooks.onAuthState?.(this.device.id, 'required', result.error)
    }
  }

  private async recoverAuthentication(upstreamBase: string, status: number): Promise<boolean> {
    if (this.authRecoveryInFlight !== undefined) return this.authRecoveryInFlight
    const now = Date.now()
    if (now - this.lastAuthRecoveryAt < 5_000) return false
    this.lastAuthRecoveryAt = now
    const promise = (async () => {
      try {
        this.authManager.invalidate(this.device.id)
        const result = await this.authManager.ensureAuthenticated(this.device, upstreamBase, true)
        if (this.stopped) return false
        if (result.ok && this.authManager.getAuthHeaders(this.device)['Cookie'] !== undefined) {
          this.hooks.onAuthState?.(this.device.id, 'ok')
          return true
        }
        this.hooks.onAuthState?.(
          this.device.id,
          status === 401 ? 'required' : 'error',
          result.ok ? `Remote DSH returned HTTP ${status}` : result.error,
        )
        return false
      } finally {
        this.authRecoveryInFlight = undefined
      }
    })()
    this.authRecoveryInFlight = promise
    return promise
  }

  private respondAuthRequired(res: ServerResponse, status: number): void {
    if (this.stopped || res.destroyed || res.writableEnded) return
    if (res.headersSent) {
      res.destroy()
      return
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-dsh-md-auth-required': '1',
    })
    res.end(renderAuthRequiredHtml(this.device.name, status))
  }

  private handleUpgrade(req: IncomingMessage, clientSocket: Duplex, head: Buffer): void {
    if (this.stopped || clientSocket.destroyed) { clientSocket.destroy(); return }
    const upstreamBase = this.getUpstreamBaseUrl()
    if (upstreamBase === undefined) {
      clientSocket.destroy()
      return
    }

    const parsed = parseOriginForm(req.url)
    if (parsed === undefined) {
      clientSocket.destroy()
      return
    }

    const proxyOrigin = this.proxyOrigin()
    const cookieToken = readCookie(req.headers.cookie, this.cookieName)
    if (proxyOrigin === undefined || cookieToken !== this.token) {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    const origin = req.headers.origin
    if (!this.isAllowedCallerOrigin(origin)) {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }

    const rawTarget = stripProxyTokenFromRawTarget(req.url ?? '/')
    const upstream = splitUpstreamBase(upstreamBase)
    const upstreamPath = `${upstream.prefix}${rawTarget}`
    const isHttps = upstream.url.protocol === 'https:'
    const authority = resolveRemoteAuthority(this.device)
    const authHeaders = this.authManager.getAuthHeaders(this.device)

    const outHeaders = buildForwardHeaders(req.headers, {
      host: authority,
      origin: authHeaders['Origin'] ?? `${isHttps ? 'https' : 'http'}://${authority}`,
      cookie: authHeaders['Cookie'],
      authorization: authHeaders['Authorization'],
    })

    const reqFn = isHttps ? httpsRequest : httpRequest
    const rejectUnauthorized = this.device.transport.kind === 'direct'
      ? this.device.transport.rejectUnauthorized !== false
      : true

    let cancelled = false
    let upstreamSocket: Duplex | undefined
    let upstreamResponse: IncomingMessage | undefined
    const cancel = (): void => {
      if (cancelled) return
      cancelled = true
      this.cancelUpstreams.delete(cancel)
      clientSocket.off('close', cancel)
      clientSocket.off('end', cancel)
      upstreamSocket?.unpipe(clientSocket)
      if (upstreamSocket !== undefined) clientSocket.unpipe(upstreamSocket)
      upstreamSocket?.destroy()
      upstreamResponse?.destroy()
      proxyReq.destroy()
      clientSocket.destroy()
    }
    const proxyReq = reqFn(upstream.url, {
      method: 'GET',
      path: upstreamPath,
      headers: outHeaders,
      ...(isHttps ? { rejectUnauthorized } : {}),
    })
    this.cancelUpstreams.add(cancel)
    clientSocket.once('close', cancel)
    clientSocket.once('end', cancel)
    clientSocket.on('error', cancel)

    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      upstreamResponse = proxyRes
      upstreamSocket = proxySocket
      proxySocket.on('error', cancel)
      proxySocket.once('close', cancel)
      proxySocket.once('end', cancel)
      if (cancelled || this.stopped || clientSocket.destroyed) { cancel(); proxySocket.destroy(); return }
      let rawResponse = `HTTP/1.1 ${proxyRes.statusCode ?? 101} ${proxyRes.statusMessage ?? 'Switching Protocols'}\r\n`
      for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
        const k = proxyRes.rawHeaders[i]
        const v = proxyRes.rawHeaders[i + 1]
        if (k === undefined || v === undefined) continue
        const lower = k.toLowerCase()
        if (lower === 'set-cookie') continue
        if (lower !== 'connection' && lower !== 'upgrade' && isHopByHopHeader(lower)) continue
        rawResponse += `${k}: ${v}\r\n`
      }
      rawResponse += '\r\n'
      clientSocket.write(rawResponse)
      if (proxyHead.byteLength > 0) clientSocket.write(proxyHead)
      if (head.byteLength > 0) proxySocket.write(head)
      proxySocket.pipe(clientSocket).pipe(proxySocket)
    })

    proxyReq.on('response', (proxyRes) => {
      upstreamResponse = proxyRes
      proxyRes.on('error', cancel)
      if (cancelled || this.stopped || clientSocket.destroyed) { proxyRes.destroy(); cancel(); return }
      const status = proxyRes.statusCode ?? 403
      if (status === 401 || status === 403) {
        void this.recoverAuthentication(upstreamBase, status).catch(() => { /* recovery is best effort */ })
      }
      // Rejection bodies can be infinite too; do not leave an unread response alive.
      proxyRes.destroy()
      clientSocket.end(`HTTP/1.1 ${status} ${proxyRes.statusMessage ?? 'Rejected'}\r\nConnection: close\r\n\r\n`)
    })

    proxyReq.on('error', cancel)
    proxyReq.end()
  }
}

export class NativeProxyManager {
  private readonly proxies = new Map<DeviceId, NativeDeviceProxy>()

  constructor(
    private readonly authManager: DeviceAuthManager,
    private readonly localOrigin?: () => string | undefined,
    private readonly hooks: NativeProxyHooks = {},
  ) {}

  async ensureProxy(
    device: DeviceConfig,
    getUpstreamBaseUrl: () => string | undefined,
  ): Promise<string | undefined> {
    let proxy = this.proxies.get(device.id)
    if (proxy === undefined) {
      proxy = new NativeDeviceProxy(
        device,
        getUpstreamBaseUrl,
        this.authManager,
        this.localOrigin,
        this.hooks,
      )
      this.proxies.set(device.id, proxy)
    } else {
      proxy.updateDevice(device)
    }
    try {
      await proxy.start(device.nativeProxyPort)
    } catch {
      proxy.stop()
      if (this.proxies.get(device.id) === proxy) this.proxies.delete(device.id)
      return undefined
    }
    if (this.proxies.get(device.id) !== proxy) return undefined
    return proxy.proxyUrl()
  }

  proxyUrl(deviceId: DeviceId): string | undefined {
    return this.proxies.get(deviceId)?.proxyUrl()
  }

  /** Current injected-bridge lifecycle for one device. */
  bridgeSnapshot(deviceId: DeviceId, clientId = LEGACY_CLIENT_ID): NativeBridgeSnapshot {
    return this.proxies.get(deviceId)?.bridgeSnapshot(clientId) ?? { state: 'idle' }
  }

  /** Navigate the framed page to one raw remote Session (queued until ready). */
  openSession(deviceId: DeviceId, sessionId: string, clientId = LEGACY_CLIENT_ID, requestSeq?: number): boolean {
    const proxy = this.proxies.get(deviceId)
    if (proxy === undefined) return false
    proxy.openSession(sessionId, clientId, requestSeq)
    return true
  }

  /** Ask the framed page to refresh its own Session catalog. */
  requestRefresh(deviceId: DeviceId): boolean {
    const proxy = this.proxies.get(deviceId)
    if (proxy === undefined) return false
    proxy.requestRefresh()
    return true
  }

  /** Toggle the remote sidebar for pane vs full native rendering. */
  setEmbedded(deviceId: DeviceId, enabled: boolean, clientId = LEGACY_CLIENT_ID): void {
    this.proxies.get(deviceId)?.setEmbedded(enabled, clientId)
  }

  /** Push Host-owned fold state to the device's framed page(s). */
  setGroupState(deviceId: DeviceId, groups: Readonly<Record<string, boolean>>): void {
    this.proxies.get(deviceId)?.setGroupState(groups)
  }

  /** Push Host-owned unread Session IDs to the device's framed page(s). */
  setUnreadState(deviceId: DeviceId, unreadSessionIds: readonly string[], readCompletions?: Readonly<Record<string, string>>): void {
    this.proxies.get(deviceId)?.setUnreadState(unreadSessionIds, readCompletions)
  }

  removeProxy(deviceId: DeviceId): void {
    const proxy = this.proxies.get(deviceId)
    if (proxy !== undefined) {
      proxy.stop()
      this.proxies.delete(deviceId)
    }
  }

  dispose(): void {
    for (const proxy of this.proxies.values()) proxy.stop()
    this.proxies.clear()
  }
}

const NAVIGATION_DESTINATIONS = new Set(['document', 'iframe', 'frame', 'embed', 'object'])

/** Whether one proxied request is the framed page's HTML document. */
function isHtmlNavigation(req: IncomingMessage): boolean {
  const destination = req.headers['sec-fetch-dest']
  if (typeof destination === 'string' && NAVIGATION_DESTINATIONS.has(destination)) return true
  const accept = req.headers.accept
  return typeof accept === 'string' && accept.toLowerCase().includes('text/html')
}

/** Read one response header as a scalar; the proxy only injects documents. */
function headerValueOf(headers: IncomingMessage['headers'], name: string): string | undefined {
  const value = headers[name]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  return undefined
}

/** Delete a header regardless of the casing the upstream used. */
function removeHeader(headers: Record<string, string | string[]>, name: string): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) delete headers[key]
  }
}

const gunzipAsync = promisify(gunzip)
const inflateAsync = promisify(inflate)
const brotliDecompressAsync = promisify(brotliDecompress)

/** Decode off the event loop with a hard decompressed-output limit. */
async function decodeHtmlBody(raw: Buffer, encoding: string | undefined): Promise<Buffer | undefined> {
  const normalized = (encoding ?? '').trim().toLowerCase()
  if (normalized === '' || normalized === 'identity') return raw
  const options = { maxOutputLength: MAX_INJECTABLE_HTML_BYTES }
  if (normalized === 'gzip' || normalized === 'x-gzip') return await gunzipAsync(raw, options)
  if (normalized === 'deflate') return await inflateAsync(raw, options)
  if (normalized === 'br') return await brotliDecompressAsync(raw, options)
  return undefined
}

function parseOriginForm(raw: string | undefined): { pathname: string; search: string } | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return undefined
  if (/[\u0000-\u001f\u007f]/.test(raw)) return undefined
  try {
    const parsed = new URL(raw, 'http://native-proxy.invalid')
    if (parsed.origin !== 'http://native-proxy.invalid') return undefined
    return { pathname: parsed.pathname, search: parsed.search }
  } catch {
    return undefined
  }
}

/**
 * Strip the proxy bootstrap token from a raw origin-form target WITHOUT
 * re-encoding it. DSH/Vite batch URLs contain a literal `??` (`/plugins/??a,b`);
 * rebuilding them through `URL` turns the second `?` into `%3F` and the
 * upstream answers 404, which breaks every client module in Native Mode.
 */
function stripProxyTokenFromRawTarget(raw: string): string {
  const queryAt = raw.indexOf('?')
  if (queryAt === -1) return raw
  const pathPart = raw.slice(0, queryAt)
  const kept = raw
    .slice(queryAt + 1)
    .split('&')
    .filter((part) => part !== '' && !part.startsWith(`${PROXY_TOKEN_QUERY}=`))
  return kept.length === 0 ? pathPart : `${pathPart}?${kept.join('&')}`
}

/** Split an upstream base URL into its origin and optional path prefix. */
function splitUpstreamBase(base: string): { url: URL; prefix: string } {
  const url = new URL(base)
  const prefix = url.pathname.replace(/\/+$/u, '')
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return { url, prefix }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined
  for (const segment of header.split(';')) {
    const at = segment.indexOf('=')
    if (at === -1) continue
    if (segment.slice(0, at).trim() !== name) continue
    return segment.slice(at + 1).trim()
  }
  return undefined
}

function rewriteLocation(value: string, upstreamBase: string, proxyOrigin: string): string {
  try {
    const upstream = new URL(upstreamBase)
    const location = new URL(value, upstream)
    if (location.origin !== upstream.origin) return value
    return new URL(`${location.pathname}${location.search}${location.hash}`, proxyOrigin).href
  } catch {
    return value
  }
}

interface StatusPageOptions {
  readonly deviceName: string
  readonly badge: string
  readonly tone: 'warn' | 'error'
  readonly title: string
  readonly paragraphs: readonly string[]
  readonly retry?: boolean
}

/**
 * Shared, theme-aware status page for the framed proxy. DSH CSS variables do
 * not cross the frame boundary, so this page uses `prefers-color-scheme` and a
 * neutral palette that follows the host OS theme instead of a hardcoded dark
 * card in a light UI.
 */
function renderStatusPage(options: StatusPageOptions): string {
  const name = escapeHtml(options.deviceName)
  const title = escapeHtml(options.title)
  const badge = escapeHtml(options.badge)
  const paragraphs = options.paragraphs
    .map((text) => `    <p>${escapeHtml(text)}</p>`)
    .join('\n')
  const retry = options.retry === false
    ? ''
    : '    <button type="button" onclick="location.reload()">重试 / Retry</button>'
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="color-scheme" content="light dark" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${name} — ${title}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", Roboto, sans-serif;
    background: #f4f5f7; color: #1b1c1f;
  }
  .card {
    width: min(480px, 100%); padding: 24px; border-radius: 14px; text-align: start;
    background: #ffffff; border: 1px solid #e3e5e9; box-shadow: 0 8px 28px rgb(0 0 0 / 8%);
  }
  .badge {
    display: inline-flex; align-items: center; gap: 6px; margin-bottom: 12px;
    padding: 3px 9px; border-radius: 999px; font-size: 12px; line-height: 18px;
  }
  .badge.warn { color: #8a5a00; background: #fff4d6; border: 1px solid #f0d48a; }
  .badge.error { color: #9f2d2d; background: #fdecec; border: 1px solid #f2bdbd; }
  h1 { margin: 0 0 8px; font-size: 17px; line-height: 1.4; font-weight: 600; }
  p { margin: 0 0 10px; font-size: 13px; line-height: 1.6; color: #4b5563; overflow-wrap: anywhere; }
  button {
    margin-top: 6px; padding: 7px 16px; border-radius: 8px; border: 1px solid #3b82f6;
    background: #2563eb; color: #fff; font: inherit; font-size: 13px; cursor: pointer;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #141518; color: #e5e7eb; }
    .card { background: #1e2025; border-color: #2e323b; box-shadow: none; }
    .badge.warn { color: #f0c674; background: #3a2f12; border-color: #5a4a1f; }
    .badge.error { color: #f2a3a3; background: #3a1c1c; border-color: #5a2a2a; }
    p { color: #9ca3af; }
  }
</style>
</head>
<body>
  <main class="card">
    <div class="badge ${options.tone}">${badge}</div>
    <h1>${title}</h1>
${paragraphs}
${retry}
  </main>
</body>
</html>`
}

function renderAuthRequiredHtml(deviceName: string, status: number): string {
  return renderStatusPage({
    deviceName,
    badge: '需要登录 · Sign-in required',
    tone: 'warn',
    title: deviceName,
    paragraphs: [
      `远端 DSH 拒绝了当前凭据（HTTP ${String(status)}）。SSH 隧道已连通，但浏览器 Cookie 无效或已过期。`,
      '请在 DSH 中打开「设置 → 多设备」，选择该设备后输入 dsh web 启动链接/Token，或点击「通过 SSH 自动修复」重新签发 Cookie。',
      `The remote DSH rejected this credential (HTTP ${String(status)}). Open Settings → Multi-Device, pick this device, then paste a launch token or repair the cookie over SSH.`,
    ],
  })
}

function renderUnavailableHtml(deviceName: string, detail: string): string {
  return renderStatusPage({
    deviceName,
    badge: '暂不可达 · Unavailable',
    tone: 'error',
    title: deviceName,
    paragraphs: [
      detail,
      'SSH 隧道或远端 DSH 暂不可用。请确认远端 dsh web 正在运行，然后重试。',
      'The SSH tunnel or the remote DSH is not reachable right now. Confirm dsh web is running, then retry.',
    ],
  })
}

function renderProxyRejectedHtml(reason: string): string {
  return renderStatusPage({
    deviceName: '多设备代理',
    badge: '代理会话已失效 · Proxy session expired',
    tone: 'warn',
    title: '请重新打开该设备 / Reopen the device',
    paragraphs: [
      reason,
      '请从 DSH 的「设置 → 多设备」重新打开或刷新该设备。',
      'Reopen or reload the device from Settings → Multi-Device in DSH.',
    ],
    retry: false,
  })
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

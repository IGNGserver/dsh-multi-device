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
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib'
import { WebSocket, WebSocketServer } from 'ws'
import type { DeviceConfig, DeviceId, NativePaneState } from '../contract.ts'
import { DeviceAuthManager, resolveRemoteAuthority } from './auth.ts'
import {
  buildNativeBridgeScript,
  injectNativeBridge,
  isNativeBridgeScriptPath,
  isNativeBridgeSocketPath,
  sanitizeGroupState,
} from './native-bridge.ts'

const PROXY_TOKEN_QUERY = 'md_token'
const PROXY_COOKIE_NAME = 'dsh-md-native'

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
type NativeBridgeInbound =
  | { readonly type: 'ready'; readonly deviceId?: string }
  | { readonly type: 'failed'; readonly error?: string }
  | { readonly type: 'selection'; readonly sessionId?: string | null }
  | { readonly type: 'group-expansion'; readonly groups?: unknown }
  | { readonly type: 'read'; readonly sessionId?: string }

/** Commands the proxy sends into the framed page's bridge. */
type NativeBridgeOutbound =
  | { readonly type: 'open-session'; readonly sessionId: string }
  | { readonly type: 'refresh' }
  | { readonly type: 'set-embedded'; readonly enabled: boolean }
  | { readonly type: 'group-expansion'; readonly groups: Record<string, boolean> }
  | { readonly type: 'read-state'; readonly unreadSessionIds: readonly string[] }

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
  ) => void
  /** Report the raw remote Session the framed page currently shows. */
  readonly onBridgeSelection?: (deviceId: DeviceId, sessionId: string | undefined) => void
  /** Last Host-owned workspace fold state for the bridge's first render. */
  readonly getGroupState?: (deviceId: DeviceId) => Readonly<Record<string, boolean>> | undefined
  /** The framed page reported a fold change the Host should persist. */
  readonly onGroupState?: (deviceId: DeviceId, groups: Record<string, boolean>) => void
  /** Raw remote Session IDs whose completion is unread on the Host. */
  readonly getUnreadState?: (deviceId: DeviceId) => readonly string[] | undefined
  /** The framed page opened a Session and considers its unread marker read. */
  readonly onBridgeRead?: (deviceId: DeviceId, sessionId: string) => void
}

/** Backwards-compatible alias for callers that only cared about auth hooks. */
export type NativeProxyAuthHooks = NativeProxyHooks

/** Upper bound for an HTML document held for bridge injection. */
const MAX_INJECTABLE_HTML_BYTES = 20 * 1024 * 1024
/** How long a framed page may take to report bridge readiness. */
const BRIDGE_READY_TIMEOUT_MS = 15_000

export class NativeDeviceProxy {
  private server: Server | undefined
  private localPort: number | undefined
  private readonly sockets = new Set<Duplex>()
  private stopped = false
  private lastAuthAttemptAt = 0
  private lastAuthRecoveryAt = 0
  private authRecoveryInFlight: Promise<boolean> | undefined
  private readonly token = randomUUID().replaceAll('-', '')
  private bridgeServer: WebSocketServer | undefined
  private readonly bridgeClients = new Set<WebSocket>()
  private bridgeState: NativePaneState = 'idle'
  private bridgeError: string | undefined
  private bridgeSessionId: string | undefined
  private bridgeReadyTimer: ReturnType<typeof setTimeout> | undefined
  private pendingOpenSession: string | undefined
  /** Pane mode hides the remote sidebar; native full mode restores it. */
  private bridgeEmbedded = false
  /** Host-owned workspace fold state, applied before the remote page's first render. */
  private groupState: Record<string, boolean> = {}
  /** Host-owned raw Session IDs whose completion is unread. */
  private unreadState: readonly string[] = []

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

  async start(): Promise<void> {
    if (this.server !== undefined || this.stopped) return
    const server = createServer((req, res) => {
      void this.handleHttp(req, res)
    })
    server.on('upgrade', (req, socket, head) => {
      const parsed = parseOriginForm(req.url)
      if (parsed !== undefined && isNativeBridgeSocketPath(parsed.pathname)) {
        this.handleBridgeUpgrade(req, socket, head)
        return
      }
      this.handleUpgrade(req, socket, head)
    })
    server.on('connection', (socket) => {
      this.sockets.add(socket)
      socket.on('close', () => this.sockets.delete(socket))
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })

    const addr = server.address()
    if (addr !== null && typeof addr === 'object') {
      this.localPort = addr.port
    }
    this.bridgeServer = new WebSocketServer({ noServer: true })
    this.server = server
  }

  stop(): void {
    this.stopped = true
    this.clearBridgeTimer()
    for (const client of this.bridgeClients) {
      try { client.close() } catch { /* ignore */ }
    }
    this.bridgeClients.clear()
    this.bridgeServer?.close()
    this.bridgeServer = undefined
    for (const socket of this.sockets) {
      try { socket.destroy() } catch { /* ignore */ }
    }
    this.sockets.clear()
    this.server?.close()
    this.server = undefined
    this.localPort = undefined
    this.setBridgeState('idle')
  }

  /** Current bridge lifecycle, for the Host snapshot. */
  bridgeSnapshot(): { state: NativePaneState; error?: string; sessionId?: string } {
    return {
      state: this.bridgeState,
      ...(this.bridgeError !== undefined ? { error: this.bridgeError } : {}),
      ...(this.bridgeSessionId !== undefined ? { sessionId: this.bridgeSessionId } : {}),
    }
  }

  /**
   * Ask the framed page to open one raw remote Session. The command is held
   * until the bridge reports readiness so a not-yet-loaded frame still lands on
   * the Session the aggregated sidebar selected.
   */
  openSession(sessionId: string): void {
    this.pendingOpenSession = sessionId
    this.sendToBridge({ type: 'open-session', sessionId })
  }

  /** Ask the framed page to refresh its own Session list (after fork/create). */
  requestRefresh(): void {
    this.sendToBridge({ type: 'refresh' })
  }

  /** Switch the same framed page between embedded pane and full native mode. */
  setEmbedded(enabled: boolean): void {
    if (this.bridgeEmbedded === enabled) return
    this.bridgeEmbedded = enabled
    this.sendToBridge({ type: 'set-embedded', enabled })
  }

  /** Apply Host-owned fold state to the framed page and every open client. */
  setGroupState(groups: Readonly<Record<string, boolean>>): void {
    const next = sanitizeGroupState(groups)
    if (sameGroupState(this.groupState, next)) return
    this.groupState = next
    this.sendToBridge({ type: 'group-expansion', groups: next })
  }

  /** Apply Host-owned unread state to the framed page. */
  setUnreadState(unreadSessionIds: readonly string[]): void {
    const next = [...unreadSessionIds]
    if (
      next.length === this.unreadState.length &&
      next.every((id, index) => id === this.unreadState[index])
    ) {
      return
    }
    this.unreadState = next
    this.sendToBridge({ type: 'read-state', unreadSessionIds: next })
  }

  /** Reset the cached bridge command target (device switched away). */
  clearPendingSession(): void {
    this.pendingOpenSession = undefined
  }

  private sendToBridge(message: NativeBridgeOutbound): void {
    const data = JSON.stringify(message)
    for (const client of this.bridgeClients) {
      if (client.readyState !== WebSocket.OPEN) continue
      try { client.send(data) } catch { /* ignore */ }
    }
  }

  private setBridgeState(state: NativePaneState, error?: string): void {
    const nextError = error?.trim() === '' ? undefined : error
    if (this.bridgeState === state && this.bridgeError === nextError) return
    this.bridgeState = state
    this.bridgeError = nextError
    this.hooks.onBridgeState?.(this.device.id, state, nextError)
  }

  private clearBridgeTimer(): void {
    if (this.bridgeReadyTimer !== undefined) {
      clearTimeout(this.bridgeReadyTimer)
      this.bridgeReadyTimer = undefined
    }
  }

  private armBridgeTimer(): void {
    this.clearBridgeTimer()
    const timer = setTimeout(() => {
      this.bridgeReadyTimer = undefined
      if (this.bridgeState === 'ready') return
      this.setBridgeState('failed', 'the framed page never reported a ready bridge')
    }, BRIDGE_READY_TIMEOUT_MS)
    timer.unref?.()
    this.bridgeReadyTimer = timer
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
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

    const rawTarget = stripProxyTokenFromRawTarget(req.url ?? '/')
    const requestUrl = new URL(req.url ?? '/', proxyOrigin)
    const queryToken = requestUrl.searchParams.get(PROXY_TOKEN_QUERY)
    const cookieToken = readCookie(req.headers.cookie, PROXY_COOKIE_NAME)
    if (queryToken === this.token && cookieToken !== this.token) {
      res.writeHead(302, {
        location: rawTarget,
        'set-cookie': `${PROXY_COOKIE_NAME}=${this.token}; Path=/; HttpOnly; SameSite=Lax`,
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
      }))
      return
    }

    await this.ensureAuthenticated(upstreamBase)

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
          const status = proxyRes.statusCode ?? 502

          // A remote DSH that rejects the injected credential must never leak its
          // plain-text 401 body into the framed UI. Try one forced re-auth (the
          // stored cookie may be stale after a remote restart), then show the
          // plugin-owned authorization page instead of a blank one-liner.
          if (status === 401 || status === 403) {
            proxyRes.resume()
            if (!retried && (method === 'GET' || method === 'HEAD')) {
              void this.recoverAuthentication(upstreamBase, status)
                .then((recovered) => {
                  if (recovered) {
                    forward(true)
                    return
                  }
                  this.respondAuthRequired(res, status)
                })
                .catch((error: unknown) => {
                  this.hooks.onAuthState?.(
                    this.device.id,
                    'error',
                    error instanceof Error ? error.message : String(error),
                  )
                  this.respondAuthRequired(res, status)
                })
              return
            }
            // For non-idempotent requests (e.g. POST /api/session/list from an
            // already-loaded SPA), trigger background re-auth so the next retry
            // succeeds without destroying the Keep-Alive frame unless recovery fails.
            void this.recoverAuthentication(upstreamBase, status).then((recovered) => {
              if (!recovered) {
                this.hooks.onAuthState?.(
                  this.device.id,
                  'required',
                  `Remote DSH returned HTTP ${status}`,
                )
              }
            })
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
            this.setBridgeState('loading')
            this.armBridgeTimer()
            this.streamInjectedHtml(proxyRes, res, status, resHeaders)
            return
          }

          res.writeHead(status, resHeaders)
          proxyRes.pipe(res)
        },
      )

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
          res.end(renderUnavailableHtml(this.device.name, err.message))
        } else {
          res.destroy()
        }
      })

      if (retried || method === 'GET' || method === 'HEAD') {
        proxyReq.end()
      } else {
        req.pipe(proxyReq)
      }
    }

    forward(false)
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
  ): void {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    proxyRes.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > MAX_INJECTABLE_HTML_BYTES) {
        tooLarge = true
        return
      }
      chunks.push(chunk)
    })
    proxyRes.on('error', () => {
      if (!res.headersSent) res.destroy()
    })
    proxyRes.on('aborted', () => {
      if (!res.headersSent) res.destroy()
    })
    proxyRes.on('end', () => {
      if (res.destroyed) return
      if (tooLarge) {
        // The buffered prefix is not a valid document; never send a truncated
        // body as if it were the page. The pane falls back to the local mirror.
        this.clearBridgeTimer()
        this.resetBridgeSelection()
        this.setBridgeState('failed', 'the remote HTML document was too large to inject the native bridge')
        res.writeHead(502, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(renderUnavailableHtml(this.device.name, 'The remote page is too large to inject the native bridge.'))
        return
      }
      const raw = Buffer.concat(chunks)
      const headers = { ...baseHeaders }
      const encoding = headerValueOf(proxyRes.headers, 'content-encoding')
      let body = raw
      let injected = false
      const decoded = decodeHtmlBody(raw, encoding)
      if (decoded !== undefined) {
        body = Buffer.from(injectNativeBridge(decoded.toString('utf8'), { deviceId: this.device.id }), 'utf8')
        removeHeader(headers, 'content-encoding')
        injected = true
      }
      if (!injected) {
        this.clearBridgeTimer()
        this.resetBridgeSelection()
        this.setBridgeState(
          'failed',
          `the remote HTML document used an unsupported content-encoding (${encoding ?? 'unknown'})`,
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
    })
  }

  /** Validate one same-origin bridge upgrade and hand it to the WebSocket server. */
  private handleBridgeUpgrade(req: IncomingMessage, clientSocket: Duplex, head: Buffer): void {
    const parsed = parseOriginForm(req.url)
    const proxyOrigin = this.proxyOrigin()
    const cookieToken = readCookie(req.headers.cookie, PROXY_COOKIE_NAME)
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
      this.attachBridge(ws)
    })
  }

  /** Own one framed page's bridge socket, its readiness and its selection reports. */
  private attachBridge(ws: WebSocket): void {
    this.bridgeClients.add(ws)
    this.resetBridgeSelection()
    this.setBridgeState('loading')
    this.armBridgeTimer()

    ws.on('message', (raw) => {
      let message: NativeBridgeInbound
      try {
        const parsed: unknown = JSON.parse(raw.toString())
        if (typeof parsed !== 'object' || parsed === null) return
        message = parsed as NativeBridgeInbound
      } catch {
        return
      }
      if (message.type === 'ready') {
        this.clearBridgeTimer()
        this.setBridgeState('ready')
        this.sendToBridge({ type: 'set-embedded', enabled: this.bridgeEmbedded })
        this.sendToBridge({ type: 'group-expansion', groups: this.groupState })
        this.sendToBridge({
          type: 'read-state',
          unreadSessionIds: this.hooks.getUnreadState?.(this.device.id) ?? this.unreadState,
        })
        if (this.pendingOpenSession !== undefined) {
          this.sendToBridge({ type: 'open-session', sessionId: this.pendingOpenSession })
        }
        return
      }
      if (message.type === 'failed') {
        this.clearBridgeTimer()
        this.setBridgeState('failed', message.error ?? 'the framed page could not start the native bridge')
        return
      }
      if (message.type === 'selection') {
        const sessionId = typeof message.sessionId === 'string' && message.sessionId !== ''
          ? message.sessionId
          : undefined
        if (sessionId === this.bridgeSessionId) return
        this.bridgeSessionId = sessionId
        this.hooks.onBridgeSelection?.(this.device.id, sessionId)
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
        if (sessionId !== '') this.hooks.onBridgeRead?.(this.device.id, sessionId)
      }
    })

    ws.on('close', () => {
      this.bridgeClients.delete(ws)
      if (this.bridgeClients.size > 0) return
      this.clearBridgeTimer()
      this.resetBridgeSelection()
      if (this.bridgeState === 'ready' || this.bridgeState === 'loading') {
        this.setBridgeState('idle')
      }
    })
    ws.on('error', () => {
      try { ws.close() } catch { /* ignore */ }
    })
  }

  private resetBridgeSelection(): void {
    if (this.bridgeSessionId === undefined) return
    this.bridgeSessionId = undefined
    this.hooks.onBridgeSelection?.(this.device.id, undefined)
  }

  private async ensureAuthenticated(upstreamBase: string): Promise<void> {
    const now = Date.now()
    if (now - this.lastAuthAttemptAt < 30_000) return
    this.lastAuthAttemptAt = now
    const result = await this.authManager.ensureAuthenticated(this.device, upstreamBase)
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
    const cookieToken = readCookie(req.headers.cookie, PROXY_COOKIE_NAME)
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

    const proxyReq = reqFn(upstream.url, {
      method: 'GET',
      path: upstreamPath,
      headers: outHeaders,
      ...(isHttps ? { rejectUnauthorized } : {}),
    })

    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
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
      proxySocket.on('error', () => clientSocket.destroy())
      clientSocket.on('error', () => proxySocket.destroy())
    })

    proxyReq.on('response', (proxyRes) => {
      const status = proxyRes.statusCode ?? 403
      if (status === 401 || status === 403) {
        void this.recoverAuthentication(upstreamBase, status).then((recovered) => {
          if (!recovered) {
            this.hooks.onAuthState?.(
              this.device.id,
              'required',
              `Remote DSH WebSocket returned HTTP ${status}`,
            )
          }
        })
      }
      clientSocket.end(`HTTP/1.1 ${status} ${proxyRes.statusMessage ?? 'Rejected'}\r\nConnection: close\r\n\r\n`)
    })

    proxyReq.on('error', () => {
      clientSocket.destroy()
    })

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
      try {
        await proxy.start()
      } catch {
        this.proxies.delete(device.id)
        return undefined
      }
    } else {
      proxy.updateDevice(device)
    }
    return proxy.proxyUrl()
  }

  proxyUrl(deviceId: DeviceId): string | undefined {
    return this.proxies.get(deviceId)?.proxyUrl()
  }

  /** Current injected-bridge lifecycle for one device. */
  bridgeSnapshot(deviceId: DeviceId): { state: NativePaneState; error?: string; sessionId?: string } {
    return this.proxies.get(deviceId)?.bridgeSnapshot() ?? { state: 'idle' }
  }

  /** Navigate the framed page to one raw remote Session (queued until ready). */
  openSession(deviceId: DeviceId, sessionId: string): boolean {
    const proxy = this.proxies.get(deviceId)
    if (proxy === undefined) return false
    proxy.openSession(sessionId)
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
  setEmbedded(deviceId: DeviceId, enabled: boolean): void {
    this.proxies.get(deviceId)?.setEmbedded(enabled)
  }

  /** Push Host-owned fold state to the device's framed page(s). */
  setGroupState(deviceId: DeviceId, groups: Readonly<Record<string, boolean>>): void {
    this.proxies.get(deviceId)?.setGroupState(groups)
  }

  /** Push Host-owned unread Session IDs to the device's framed page(s). */
  setUnreadState(deviceId: DeviceId, unreadSessionIds: readonly string[]): void {
    this.proxies.get(deviceId)?.setUnreadState(unreadSessionIds)
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

/** Decode a compressed HTML body, or undefined for an encoding we do not own. */
function decodeHtmlBody(raw: Buffer, encoding: string | undefined): Buffer | undefined {
  const normalized = (encoding ?? '').trim().toLowerCase()
  if (normalized === '' || normalized === 'identity') return raw
  try {
    if (normalized === 'gzip' || normalized === 'x-gzip') return gunzipSync(raw)
    if (normalized === 'deflate') return inflateSync(raw)
    if (normalized === 'br') return brotliDecompressSync(raw)
  } catch {
    return undefined
  }
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

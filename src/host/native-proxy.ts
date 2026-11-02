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
import type { DeviceConfig, DeviceId } from '../contract.ts'
import { DeviceAuthManager, resolveRemoteAuthority } from './auth.ts'

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

export class NativeDeviceProxy {
  private server: Server | undefined
  private localPort: number | undefined
  private readonly sockets = new Set<Duplex>()
  private stopped = false
  private lastAuthAttemptAt = 0
  private readonly token = randomUUID().replaceAll('-', '')

  constructor(
    private device: DeviceConfig,
    private readonly getUpstreamBaseUrl: () => string | undefined,
    private readonly authManager: DeviceAuthManager,
    private readonly localOrigin?: () => string | undefined,
  ) {}

  updateDevice(device: DeviceConfig): void {
    this.device = device
  }

  proxyUrl(): string | undefined {
    if (this.localPort === undefined) return undefined
    return `http://127.0.0.1:${this.localPort}/?${PROXY_TOKEN_QUERY}=${this.token}`
  }

  private proxyOrigin(): string | undefined {
    return this.localPort === undefined ? undefined : `http://127.0.0.1:${this.localPort}`
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
    this.server = server
  }

  stop(): void {
    this.stopped = true
    for (const socket of this.sockets) {
      try { socket.destroy() } catch { /* ignore */ }
    }
    this.sockets.clear()
    this.server?.close()
    this.server = undefined
    this.localPort = undefined
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

    const requestUrl = new URL(req.url ?? '/', proxyOrigin)
    const queryToken = requestUrl.searchParams.get(PROXY_TOKEN_QUERY)
    const cookieToken = readCookie(req.headers.cookie, PROXY_COOKIE_NAME)
    if (queryToken === this.token && cookieToken !== this.token) {
      res.writeHead(302, {
        location: formatPath(parsed.pathname, stripProxyToken(parsed.search)),
        'set-cookie': `${PROXY_COOKIE_NAME}=${this.token}; Path=/; HttpOnly; SameSite=Lax`,
        'cache-control': 'no-store',
      })
      res.end()
      return
    }
    if (cookieToken !== this.token) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end('Native proxy authentication required')
      return
    }
    // SameSite=Lax already prevents this cookie on cross-site subresources;
    // reject an explicit cross-site fetch as a second line of defence.
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end('Cross-site native proxy request rejected')
      return
    }

    const now = Date.now()
    if (now - this.lastAuthAttemptAt > 30_000) {
      this.lastAuthAttemptAt = now
      await this.authManager.ensureAuthenticated(this.device, upstreamBase)
    }
    const upstreamUrl = buildUpstreamUrl(upstreamBase, parsed.pathname, stripProxyToken(parsed.search))
    const isHttps = upstreamUrl.protocol === 'https:'
    const authority = resolveRemoteAuthority(this.device)
    const authHeaders = this.authManager.getAuthHeaders(this.device)

    const outHeaders = buildForwardHeaders(req.headers, {
      host: authority,
      origin: req.headers['origin'] !== undefined
        ? authHeaders['Origin'] ?? `${isHttps ? 'https' : 'http'}://${authority}`
        : undefined,
      cookie: authHeaders['Cookie'],
      authorization: authHeaders['Authorization'],
    })

    const reqFn = isHttps ? httpsRequest : httpRequest
    const rejectUnauthorized = this.device.transport.kind === 'direct'
      ? this.device.transport.rejectUnauthorized !== false
      : true

    const proxyReq = reqFn(
      upstreamUrl,
      {
        method: req.method ?? 'GET',
        headers: outHeaders,
        ...(isHttps ? { rejectUnauthorized } : {}),
      },
      (proxyRes) => {
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
              .trim()
            const local = this.localOrigin?.()
            const framing = local !== undefined ? `frame-ancestors 'self' ${local}` : ''
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
        res.writeHead(proxyRes.statusCode ?? 502, resHeaders)
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

    req.pipe(proxyReq)
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
    if (origin !== undefined && origin !== proxyOrigin && origin !== this.localOrigin?.()) {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }

    const upstreamUrl = buildUpstreamUrl(upstreamBase, parsed.pathname, stripProxyToken(parsed.search))
    const isHttps = upstreamUrl.protocol === 'https:'
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

    const proxyReq = reqFn(upstreamUrl, {
      method: 'GET',
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
      clientSocket.end(`HTTP/1.1 ${proxyRes.statusCode ?? 403} ${proxyRes.statusMessage ?? 'Rejected'}\r\nConnection: close\r\n\r\n`)
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
  ) {}

  async ensureProxy(
    device: DeviceConfig,
    getUpstreamBaseUrl: () => string | undefined,
  ): Promise<string | undefined> {
    let proxy = this.proxies.get(device.id)
    if (proxy === undefined) {
      proxy = new NativeDeviceProxy(device, getUpstreamBaseUrl, this.authManager, this.localOrigin)
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

function buildUpstreamUrl(base: string, pathname: string, search: string): URL {
  const url = new URL(base)
  url.pathname = pathname
  url.search = search
  return url
}

function stripProxyToken(search: string): string {
  if (search === '') return ''
  const params = new URLSearchParams(search)
  params.delete(PROXY_TOKEN_QUERY)
  const next = params.toString()
  return next === '' ? '' : `?${next}`
}

function formatPath(pathname: string, search: string): string {
  return `${pathname}${search}`
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

function renderUnavailableHtml(deviceName: string, detail: string): string {
  const safeName = escapeHtml(deviceName)
  const safeDetail = escapeHtml(detail)
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${safeName} — DSH Native Mode</title>
<style>
  body {
    margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #141518; color: #e5e7eb;
  }
  .card {
    max-width: 440px; padding: 24px; border-radius: 12px;
    background: #1e2025; border: 1px solid #2e323b; text-align: center;
  }
  h2 { margin: 0 0 8px; font-size: 16px; font-weight: 600; }
  p { margin: 0 0 16px; font-size: 13px; color: #9ca3af; word-break: break-word; }
  button {
    padding: 7px 16px; border-radius: 8px; border: 1px solid #3b82f6;
    background: #2563eb; color: #fff; font-size: 13px; cursor: pointer;
  }
</style>
</head>
<body>
  <div class="card">
    <h2>${safeName} 暂不可达 / Unavailable</h2>
    <p>${safeDetail}</p>
    <button onclick="location.reload()">重试连接 / Retry</button>
  </div>
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

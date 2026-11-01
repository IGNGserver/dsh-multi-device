/**
 * Remote DSH authentication & persistent credential manager.
 *
 * Handles all DSH authentication mechanisms across versions:
 * 1. DSH 0.2 Signed Browser Cookie (`dsh-auth-<sha256(authority)>=v1.<payload>.<hmac>`):
 *    - Can be obtained by exchanging a launch token (`GET /?token=<launchToken>`).
 *    - Can be minted directly from the remote `$DSH_HOME/.credentials.yaml` (`client-connection/browser-session`
 *      secret) discovered over SSH (`auto` mode) without requiring the user to copy a launch token!
 *    - Can be supplied directly by the user (`mode: 'cookie'`).
 * 2. Bearer Token (`Authorization: Bearer <token>`).
 * 3. Unauthenticated loopback (DSH 0.1.x).
 *
 * Persists obtained cookies/secrets in `$DSH_HOME/plugins/dsh-multi-device-secrets.json`
 * with `0600` permissions so login survives local and remote DSH restarts.
 *
 * @module dsh-multi-device/host/auth
 */
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { DeviceAuthConfig, DeviceConfig, DeviceId } from '../contract.ts'
import { execSshCommand } from './tunnel.ts'

export interface StoredDeviceSecret {
  readonly deviceId: DeviceId
  /** Cookie name=value pair, e.g. `dsh-auth-xxx=v1.yyy.zzz` */
  readonly cookie?: string
  /** Authority the cookie was signed for, e.g. `127.0.0.1:3080` */
  readonly cookieAuthority?: string
  /** Raw 32-byte base64url HMAC secret from remote `.credentials.yaml` if bootstrapped via SSH */
  readonly signingSecret?: string
  readonly bearerToken?: string
  readonly updatedAt: number
}

interface SecretStoreDocument {
  readonly version: 1
  readonly secrets: Record<string, StoredDeviceSecret>
}

const COOKIE_PREFIX = 'dsh-auth-'
const COOKIE_PAYLOAD_VERSION = 1
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function encodeBase64Url(value: Buffer): string {
  return value.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function decodeBase64Url(value: string): Buffer | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) return undefined
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const decoded = Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/') + padding, 'base64')
  return encodeBase64Url(decoded) === value ? decoded : undefined
}

/** Compute the exact DSH 0.2 cookie name for an HTTP Host authority (`127.0.0.1:3080`). */
export function dshCookieName(authority: string): string {
  return COOKIE_PREFIX + encodeBase64Url(createHash('sha256').update(authority).digest())
}

/**
 * Mint a valid DSH 0.2 browser-session cookie for `authority` using the 32-byte base64url
 * `client-connection/browser-session` signing secret.
 */
export function mintDshBrowserCookie(
  authority: string,
  base64UrlSecret: string,
  now = Date.now(),
  ttlMs = THIRTY_DAYS_MS,
): string | undefined {
  const secretBytes = decodeBase64Url(base64UrlSecret.trim())
  if (secretBytes === undefined || secretBytes.byteLength !== 32) return undefined
  const payload = {
    version: COOKIE_PAYLOAD_VERSION,
    authority,
    issuedAt: now - 1000, // 1s clock-skew cushion
    expiresAt: now + ttlMs,
  }
  const body = encodeBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = encodeBase64Url(createHmac('sha256', secretBytes).update(body).digest())
  return `${dshCookieName(authority)}=v1.${body}.${sig}`
}

/**
 * Extract the `token` query parameter from a full launch URL (`http://127.0.0.1:3080/?token=abc`)
 * or return the trimmed string if it is already a bare token.
 */
export function extractLaunchToken(credential: string): string {
  const trimmed = credential.trim()
  if (trimmed.includes('://') || trimmed.startsWith('/?')) {
    try {
      const url = new URL(trimmed, 'http://127.0.0.1:3080')
      const token = url.searchParams.get('token')
      if (token !== null && token !== '') return token
    } catch {
      // Fall through
    }
  }
  const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(trimmed)
  if (match?.[1] !== undefined) return match[1]
  return trimmed
}

/**
 * Parse the `client-connection/browser-session` base64url secret out of `.credentials.yaml` text.
 */
export function parseSigningSecretFromCredentialsYaml(yamlText: string): string | undefined {
  // Matches:
  //   client-connection/browser-session:
  //     kind: grant
  //     payload:
  //       version: 1
  //       secret: <base64url>
  const sectionMatch = /client-connection\/browser-session:\s*\r?\n((?:[ \t]+.*\r?\n?)*)/.exec(yamlText)
  const block = sectionMatch?.[1] ?? yamlText
  const secretMatch = /^\s*secret:\s*['"]?([A-Za-z0-9_-]{40,48})['"]?\s*$/m.exec(block)
  return secretMatch?.[1]
}

/**
 * Determine the remote HTTP `Host` authority the remote DSH server expects.
 * When accessed via an SSH tunnel, the remote server sees `127.0.0.1:<remotePort>`.
 * When accessed directly, it sees the URL's `host` (`hostname:port`).
 */
export function resolveRemoteAuthority(device: DeviceConfig): string {
  if (device.transport.kind === 'ssh') {
    const host = device.transport.remoteBindHost ?? '127.0.0.1'
    const port = device.transport.remotePort ?? 3080
    return `${host}:${port}`
  }
  try {
    return new URL(device.transport.baseUrl).host
  } catch {
    return '127.0.0.1:3080'
  }
}

/**
 * Manages persisted authentication state and headers for all configured devices.
 */
export class DeviceAuthManager {
  private readonly secrets = new Map<DeviceId, StoredDeviceSecret>()

  constructor(private readonly secretsFilePath?: string) {
    this.load()
  }

  load(): void {
    if (this.secretsFilePath === undefined || !existsSync(this.secretsFilePath)) return
    try {
      const raw = JSON.parse(readFileSync(this.secretsFilePath, 'utf8')) as Partial<SecretStoreDocument>
      if (raw && typeof raw.secrets === 'object' && raw.secrets !== null) {
        for (const [id, entry] of Object.entries(raw.secrets)) {
          if (entry && typeof entry === 'object') {
            this.secrets.set(id as DeviceId, entry)
          }
        }
      }
    } catch {
      // Ignore corrupt secrets cache; will re-bootstrap
    }
  }

  private save(): void {
    if (this.secretsFilePath === undefined) return
    try {
      const dir = dirname(this.secretsFilePath)
      mkdirSync(dir, { recursive: true })
      const tmp = `${this.secretsFilePath}.${randomUUID()}.tmp`
      const doc: SecretStoreDocument = {
        version: 1,
        secrets: Object.fromEntries(this.secrets),
      }
      writeFileSync(tmp, JSON.stringify(doc, null, 2), { mode: 0o600 })
      try { chmodSync(tmp, 0o600) } catch { /* Windows fallback */ }
      renameSync(tmp, this.secretsFilePath)
    } catch {
      // Non-fatal if disk is read-only
    }
  }

  removeDevice(deviceId: DeviceId): void {
    if (this.secrets.delete(deviceId)) {
      this.save()
    }
  }

  /**
   * Build the HTTP headers (`Host`, `Origin`, `Cookie`, `Authorization`) needed to authenticate
   * against `device` over `effectiveBaseUrl`.
   */
  getAuthHeaders(device: DeviceConfig): Record<string, string> {
    const authority = resolveRemoteAuthority(device)
    const scheme = device.transport.kind === 'direct' && device.transport.baseUrl.startsWith('https:')
      ? 'https'
      : 'http'
    const headers: Record<string, string> = {
      Host: authority,
      Origin: `${scheme}://${authority}`,
    }

    const auth = device.auth
    if (auth.mode === 'none') return headers

    if (auth.mode === 'bearer' && auth.credential) {
      headers['Authorization'] = `Bearer ${auth.credential.trim()}`
      return headers
    }

    if (auth.mode === 'cookie' && auth.credential) {
      const raw = auth.credential.trim()
      headers['Cookie'] = raw.includes('=') ? raw : `${dshCookieName(authority)}=${raw}`
      return headers
    }

    const stored = this.secrets.get(device.id)
    if (stored?.signingSecret !== undefined) {
      const minted = mintDshBrowserCookie(authority, stored.signingSecret)
      if (minted !== undefined) {
        headers['Cookie'] = minted
        return headers
      }
    }

    if (stored?.cookie !== undefined && stored.cookieAuthority === authority) {
      headers['Cookie'] = stored.cookie
      return headers
    }

    if (stored?.bearerToken !== undefined) {
      headers['Authorization'] = `Bearer ${stored.bearerToken}`
    }

    return headers
  }

  /**
   * Ensure valid authentication credentials exist for `device` against `effectiveBaseUrl`.
   * Called before connecting or whenever a `401 Unauthorized` response is encountered.
   */
  async ensureAuthenticated(
    device: DeviceConfig,
    effectiveBaseUrl: string,
    forceRefresh = false,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const authority = resolveRemoteAuthority(device)
    const auth: DeviceAuthConfig = device.auth ?? { mode: 'auto' }

    if (auth.mode === 'none' || auth.mode === 'cookie' || auth.mode === 'bearer') {
      return { ok: true }
    }

    const existing = this.secrets.get(device.id)
    if (!forceRefresh && existing !== undefined) {
      if (existing.signingSecret !== undefined || (existing.cookie !== undefined && existing.cookieAuthority === authority)) {
        return { ok: true }
      }
    }

    // 1. If a launch token or URL is configured, exchange it via GET /?token=...
    if (auth.credential !== undefined && auth.credential.trim() !== '') {
      const rawCred = auth.credential.trim()
      // Check if user pasted a 43-char base64url signing secret directly
      if (decodeBase64Url(rawCred)?.byteLength === 32) {
        const exchanged = await this.exchangeLaunchToken(device.id, effectiveBaseUrl, authority, extractLaunchToken(rawCred))
        if (exchanged.ok) return exchanged
        // Or treat as signingSecret
        const minted = mintDshBrowserCookie(authority, rawCred)
        if (minted !== undefined) {
          this.secrets.set(device.id, {
            deviceId: device.id,
            signingSecret: rawCred,
            cookie: minted,
            cookieAuthority: authority,
            updatedAt: Date.now(),
          })
          this.save()
          return { ok: true }
        }
      } else {
        const token = extractLaunchToken(rawCred)
        const exchanged = await this.exchangeLaunchToken(device.id, effectiveBaseUrl, authority, token)
        if (exchanged.ok) return exchanged
        if (auth.mode === 'token') return exchanged
      }
    }

    // 2. If transport is SSH and mode is 'auto', bootstrap signing secret from remote ~/.dsh/.credentials.yaml
    if (device.transport.kind === 'ssh' && (auth.mode === 'auto' || auth.mode === 'token')) {
      const dshHome = device.transport.remoteDshHome?.trim() || '~/.dsh'
      const cmd = `cat ${dshHome}/.credentials.yaml 2>/dev/null || true`
      const sshRes = await execSshCommand(device.transport, cmd, 6_000)
      if (sshRes.ok && sshRes.stdout.trim() !== '') {
        const secret = parseSigningSecretFromCredentialsYaml(sshRes.stdout)
        if (secret !== undefined) {
          const minted = mintDshBrowserCookie(authority, secret)
          if (minted !== undefined) {
            this.secrets.set(device.id, {
              deviceId: device.id,
              signingSecret: secret,
              cookie: minted,
              cookieAuthority: authority,
              updatedAt: Date.now(),
            })
            this.save()
            return { ok: true }
          }
        }
      }
    }

    // 3. Probe whether remote server even requires authentication (e.g. DSH 0.1.x)
    return { ok: true }
  }

  /**
   * Exchange a DSH launch token (`/?token=<launchToken>`) for a persistent `dsh-auth-*` cookie.
   */
  async exchangeLaunchToken(
    deviceId: DeviceId,
    effectiveBaseUrl: string,
    authority: string,
    launchToken: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const url = new URL('/', effectiveBaseUrl)
      url.searchParams.set('token', launchToken)
      const response = await fetch(url.href, {
        method: 'GET',
        headers: { Host: authority },
        redirect: 'manual',
      })
      const setCookie = response.headers.get('set-cookie')
      if (setCookie !== null) {
        const cookiePair = setCookie.split(';')[0]?.trim()
        if (cookiePair !== undefined && cookiePair.startsWith(COOKIE_PREFIX)) {
          this.secrets.set(deviceId, {
            deviceId,
            cookie: cookiePair,
            cookieAuthority: authority,
            updatedAt: Date.now(),
          })
          this.save()
          return { ok: true }
        }
      }
      if (response.status === 200) {
        // Server does not require cookie auth (e.g. DSH 0.1.x)
        return { ok: true }
      }
      return {
        ok: false,
        error: `Token exchange rejected by remote DSH (HTTP ${String(response.status)})`,
      }
    } catch (error) {
      return {
        ok: false,
        error: `Token exchange failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
}

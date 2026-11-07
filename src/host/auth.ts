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
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { DeviceAuthConfig, DeviceConfig, DeviceId, SshTransportConfig } from '../contract.ts'
import { requestRemote } from './http-request.ts'
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
  /** Launch URL/token or explicit cookie/bearer credential entered by the user. */
  readonly authCredential?: string
  /** Monotonic version of the user-supplied credential; absent in legacy records. */
  readonly credentialVersion?: number
  /** SHA-256 binding of transport target, auth policy and credential version/value. */
  readonly cacheBinding?: string
  /** Passphrase for an encrypted local SSH private key. */
  readonly sshPassphrase?: string
  readonly updatedAt: number
}

interface SecretStoreDocument {
  readonly version: 1
  readonly secrets: Record<string, StoredDeviceSecret>
}

const COOKIE_PREFIX = 'dsh-auth-'
const COOKIE_PAYLOAD_VERSION = 1
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
/**
 * DSH rejects a cookie whose `expiresAt - issuedAt` exceeds its configured
 * max age. Keep a small safety margin so clock skew does not turn a valid
 * 30-day cookie into an invalid `30d + 1s` one.
 */
const COOKIE_MAX_AGE_SAFETY_MS = 60_000
const COOKIE_CLOCK_SKEW_MS = 1_000

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
  const issuedAt = now - COOKIE_CLOCK_SKEW_MS
  const effectiveTtl = Math.max(COOKIE_CLOCK_SKEW_MS, ttlMs - COOKIE_MAX_AGE_SAFETY_MS)
  const payload = {
    version: COOKIE_PAYLOAD_VERSION,
    authority,
    issuedAt,
    // DSH validates `expiresAt - issuedAt <= maxAgeMilliseconds`; never sign
    // a window longer than the configured 30-day default.
    expiresAt: issuedAt + effectiveTtl,
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
 * Authority used inside a DSH browser-session cookie. DSH 0.2 hashes the
 * normalized request authority into the cookie name and signs it into the
 * payload. Plain HTTP cookies use `host:port`; TLS listeners use `origin`
 * (`https://host:port`).
 */
export function resolveRemoteCookieAuthority(device: DeviceConfig): string {
  if (device.transport.kind === 'ssh') {
    return resolveRemoteAuthority(device)
  }
  try {
    const url = new URL(device.transport.baseUrl)
    return url.protocol === 'https:' ? url.origin : url.host
  } catch {
    return '127.0.0.1:3080'
  }
}

/** HTTP scheme used when constructing the remote `Origin` header. */
export function resolveRemoteScheme(device: DeviceConfig): 'http' | 'https' {
  if (device.transport.kind === 'direct') {
    return device.transport.baseUrl.startsWith('https:') ? 'https' : 'http'
  }
  return 'http'
}

/** POSIX single-quote escaping for a remote shell command. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

/** PowerShell single-quote escaping for a remote command. */
function powershellQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * Convert a remote DSH home (`~/.dsh`, `/home/x/.dsh`, `C:\Users\x\.dsh`) into a
 * PowerShell path expression. `~` becomes `$env:USERPROFILE`; absolute Windows
 * paths are embedded as a literal.
 */
export function remoteCredentialsPathForPowerShell(dshHome: string): string {
  const normalized = dshHome.trim().replaceAll('\\', '/')
  if (/^[A-Za-z]:\//.test(normalized)) {
    return powershellQuote(normalized.replaceAll('/', '\\'))
  }
  const suffix = normalized === '~' ? '' : normalized.replace(/^~\//, '')
  const relative = suffix.replaceAll('/', '\\')
  return relative === '' ? '$env:USERPROFILE\\.dsh' : `$env:USERPROFILE\\${relative}`
}

/**
 * Build the POSIX command that reads the remote credentials file.
 *
 * `~` must never be single-quoted: `cat '~/.dsh'/...` looks for a literal
 * directory named `~` and always fails. Default homes are therefore built from
 * `$HOME` inside double quotes; absolute paths keep strict single-quote
 * escaping.
 */
export function buildRemoteCredentialsCatCommand(dshHome: string): string {
  const home = dshHome.trim() || '~/.dsh'
  const tildeSuffix =
    home === '~' ? '' : home.startsWith('~/') ? home.slice(2) : undefined
  if (tildeSuffix !== undefined) {
    const safe = tildeSuffix
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"')
      .replaceAll('$', '\\$')
      .replaceAll('`', '\\`')
    const suffix = safe === '' ? '' : `/${safe}`
    return `cat "$HOME${suffix}/.credentials.yaml" 2>/dev/null || true`
  }
  return `cat ${shellQuote(`${home}/.credentials.yaml`)} 2>/dev/null || true`
}

/**
 * Read `$DSH_HOME/.credentials.yaml` over SSH from POSIX and Windows remotes.
 *
 * The POSIX command runs first. On Windows the default `cmd.exe` rejects
 * `cat`/`2>/dev/null`, so a PowerShell fallback reads the same file under
 * `%USERPROFILE%` before giving up. Failures include both attempts so the UI
 * can explain what actually went wrong.
 */
export async function readRemoteCredentials(
  transport: SshTransportConfig,
  dshHome: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const posix = await execSshCommand(
    transport,
    buildRemoteCredentialsCatCommand(dshHome),
    6_000,
  )
  const posixText = posix.ok ? posix.stdout : ''
  if (parseSigningSecretFromCredentialsYaml(posixText) !== undefined) {
    return { ok: true, text: posixText }
  }

  const pathExpr = remoteCredentialsPathForPowerShell(dshHome)
  const windowsCommand =
    'powershell -NoProfile -NonInteractive -Command "' +
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ' +
    `$p=${pathExpr}; ` +
    'if (Test-Path -LiteralPath $p) { Get-Content -LiteralPath $p -Raw }"'
  const windows = await execSshCommand(transport, windowsCommand, 8_000)
  const windowsText = windows.ok ? windows.stdout : ''
  if (parseSigningSecretFromCredentialsYaml(windowsText) !== undefined) {
    return { ok: true, text: windowsText }
  }

  const details: string[] = []
  if (!posix.ok) details.push(`POSIX: ${posix.error}`)
  if (!windows.ok) details.push(`PowerShell: ${windows.error}`)
  if (details.length === 0) {
    details.push('the file is empty or has no client-connection/browser-session secret')
  }
  return { ok: false, error: details.join('; ') }
}

/** Bind derived credentials to the configured endpoint, never the ephemeral tunnel port. */
function authenticationCacheBinding(device: DeviceConfig, stored: StoredDeviceSecret | undefined): string {
  const transport = device.transport
  const target = transport.kind === 'ssh'
    ? [
        'ssh', transport.host, transport.port ?? null, transport.username ?? null,
        transport.privateKeyPath ?? null, transport.proxyJump ?? null, transport.engine ?? 'auto',
        transport.remoteBindHost ?? '127.0.0.1', transport.remotePort ?? 3080,
        transport.remoteDshHome?.trim() || '~/.dsh', transport.bootstrapFromRemoteCredentials === true,
      ]
    : ['direct', transport.baseUrl.replace(/\/+$/u, ''), transport.rejectUnauthorized !== false]
  return createHash('sha256').update(JSON.stringify([
    1, target, device.auth.mode,
    device.auth.credential?.trim() || stored?.authCredential?.trim() || null,
    stored?.credentialVersion ?? 0,
  ])).digest('hex')
}

/** Remove only derived authentication material; preserve explicit credentials/passphrases. */
function withoutCachedAuthentication(stored: StoredDeviceSecret): StoredDeviceSecret {
  const {
    cookie: _cookie, cookieAuthority: _authority, bearerToken: _bearer,
    signingSecret: _secret, cacheBinding: _binding, ...rest
  } = stored
  return rest
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
        let stripped = false
        for (const [id, entry] of Object.entries(raw.secrets)) {
          if (entry && typeof entry === 'object') {
            // Legacy cookies cannot prove which SSH host/credential produced them.
            // Keep explicit credentials and SSH passphrases, but require re-authentication.
            const unbound = typeof entry.cacheBinding !== 'string' || !/^[a-f0-9]{64}$/u.test(entry.cacheBinding)
            if (unbound || entry.signingSecret !== undefined) {
              if (entry.cookie !== undefined || entry.cookieAuthority !== undefined ||
                  entry.bearerToken !== undefined || entry.signingSecret !== undefined ||
                  entry.cacheBinding !== undefined) stripped = true
              this.secrets.set(id as DeviceId, withoutCachedAuthentication(entry))
            } else {
              this.secrets.set(id as DeviceId, entry)
            }
          }
        }
        if (stripped) this.save()
      }
    } catch {
      // Ignore corrupt secrets cache; will re-bootstrap
    }
  }

  private save(): void {
    if (this.secretsFilePath === undefined) return
    const dir = dirname(this.secretsFilePath)
    mkdirSync(dir, { recursive: true })
    const tmp = `${this.secretsFilePath}.${randomUUID()}.tmp`
    const doc: SecretStoreDocument = {
      version: 1,
      secrets: Object.fromEntries(this.secrets),
    }
    try {
      // CIFS can drop a file when rename replaces it. Write a sibling, then
      // copy the bytes onto the destination and remove the sibling.
      writeFileSync(tmp, JSON.stringify(doc, null, 2), { mode: 0o600 })
      try { chmodSync(tmp, 0o600) } catch { /* Windows fallback */ }
      copyFileSync(tmp, this.secretsFilePath)
      try { chmodSync(this.secretsFilePath, 0o600) } catch { /* Windows fallback */ }
    } finally {
      try { unlinkSync(tmp) } catch { /* sibling may not exist if the write failed */ }
    }
  }

  removeDevice(deviceId: DeviceId): void {
    if (this.secrets.delete(deviceId)) {
      this.save()
    }
  }

  /**
   * Drop cached cookies/bearer tokens after the remote rejected them, while
   * keeping the user-supplied credential and SSH passphrase for re-authentication.
   */
  invalidate(deviceId: DeviceId): void {
    const current = this.secrets.get(deviceId)
    if (current === undefined) return
    this.secrets.set(deviceId, { ...withoutCachedAuthentication(current), updatedAt: Date.now() })
    this.save()
  }

  /** Read the persisted secret record for a device (never exposed to the Client). */
  storedSecret(deviceId: DeviceId): StoredDeviceSecret | undefined {
    return this.secrets.get(deviceId)
  }

  /** Persist or clear the explicit auth credential entered in the device form. */
  setAuthCredential(deviceId: DeviceId, credential: string | undefined): void {
    const current = this.secrets.get(deviceId)
    const normalized = credential?.trim() || undefined
    const changed = normalized !== current?.authCredential?.trim()
    const next: StoredDeviceSecret = {
      ...(current === undefined ? { deviceId, updatedAt: Date.now() } : changed ? withoutCachedAuthentication(current) : current),
      deviceId,
      updatedAt: Date.now(),
      credentialVersion: (current?.credentialVersion ?? 0) + (changed ? 1 : 0),
      ...(normalized !== undefined ? { authCredential: normalized } : {}),
    }
    if (normalized === undefined) delete (next as { authCredential?: string }).authCredential
    this.secrets.set(deviceId, next)
    this.save()
  }

  /**
   * Persist a passphrase for an encrypted local SSH key.
   * `undefined` and `''` mean "the form did not supply a new value" and keep
   * the stored passphrase. Callers that intend to clear it pass `null`.
   */
  setSshPassphrase(deviceId: DeviceId, passphrase: string | null | undefined): void {
    if (passphrase === undefined || (typeof passphrase === 'string' && passphrase.trim() === '')) return
    const current = this.secrets.get(deviceId)
    const next: StoredDeviceSecret = {
      ...(current ?? { deviceId, updatedAt: Date.now() }),
      deviceId,
      updatedAt: Date.now(),
      ...(passphrase === null ? {} : { sshPassphrase: passphrase }),
    }
    if (passphrase === null) delete (next as { sshPassphrase?: string }).sshPassphrase
    this.secrets.set(deviceId, next)
    this.save()
  }

  /**
   * Build the HTTP headers (`Host`, `Origin`, `Cookie`, `Authorization`) needed to authenticate
   * against `device` over `effectiveBaseUrl`.
   */
  getAuthHeaders(device: DeviceConfig): Record<string, string> {
    const authority = resolveRemoteAuthority(device)
    const cookieAuthority = resolveRemoteCookieAuthority(device)
    const scheme = resolveRemoteScheme(device)
    const headers: Record<string, string> = {
      Host: authority,
      Origin: `${scheme}://${authority}`,
    }

    const auth = device.auth
    if (auth.mode === 'none') return headers

    let stored = this.secrets.get(device.id)
    if (stored !== undefined && (stored.cookie !== undefined || stored.bearerToken !== undefined) &&
        stored.cacheBinding !== authenticationCacheBinding(device, stored)) {
      this.invalidate(device.id)
      stored = this.secrets.get(device.id)
    }
    const credential = auth.credential?.trim() || stored?.authCredential?.trim()

    if (auth.mode === 'bearer' && credential !== undefined && credential !== '') {
      headers['Authorization'] = `Bearer ${credential}`
      return headers
    }

    if (auth.mode === 'cookie' && credential !== undefined && credential !== '') {
      headers['Cookie'] = credential.includes('=') ? credential : `${dshCookieName(cookieAuthority)}=${credential}`
      return headers
    }
    if (stored?.cookie !== undefined && stored.cookieAuthority === cookieAuthority) {
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
    const cookieAuthority = resolveRemoteCookieAuthority(device)
    const auth: DeviceAuthConfig = device.auth ?? { mode: 'auto' }

    if (auth.mode === 'none' || auth.mode === 'cookie' || auth.mode === 'bearer') {
      return { ok: true }
    }

    let existing = this.secrets.get(device.id)
    const cacheBinding = authenticationCacheBinding(device, existing)
    if (existing !== undefined && (forceRefresh || existing.cacheBinding !== cacheBinding) &&
        (existing.cookie !== undefined || existing.bearerToken !== undefined)) {
      this.invalidate(device.id)
      existing = this.secrets.get(device.id)
    }
    if (!forceRefresh && existing?.cookie !== undefined && existing.cookieAuthority === cookieAuthority &&
        existing.cacheBinding === cacheBinding) {
      return { ok: true }
    }

    // A bare 32-byte base64url launch token is indistinguishable from a signing
    // secret by shape. User input is ALWAYS exchanged; only SSH bootstrap may mint.
    const configuredCredential = auth.credential?.trim() || existing?.authCredential?.trim()
    if (configuredCredential !== undefined && configuredCredential !== '') {
      const exchanged = await this.exchangeLaunchToken(
        device.id, effectiveBaseUrl, authority, cookieAuthority,
        extractLaunchToken(configuredCredential), cacheBinding,
      )
      if (exchanged.ok || auth.mode === 'token') return exchanged
    }

    // 2. SSH bootstrap. The device form enables this for auto mode. Mint a
    // cookie and persist only that cookie — the 32-byte HMAC secret stays on
    // the remote machine. A failed read is fatal here: continuing without a
    // cookie makes the next request look like a broken SSH key (HTTP 401).
    if (
      device.transport.kind === 'ssh' &&
      auth.mode === 'auto' &&
      device.transport.bootstrapFromRemoteCredentials === true
    ) {
      const dshHome = device.transport.remoteDshHome?.trim() || '~/.dsh'
      const read = await readRemoteCredentials(device.transport, dshHome)
      if (!read.ok) {
        return {
          ok: false,
          error: `SSH login succeeded, but reading ${dshHome}/.credentials.yaml failed: ${read.error}`,
        }
      }
      const secret = parseSigningSecretFromCredentialsYaml(read.text)
      const minted = secret === undefined ? undefined : mintDshBrowserCookie(cookieAuthority, secret)
      if (minted === undefined) {
        return {
          ok: false,
          error: `SSH login succeeded, but ${dshHome}/.credentials.yaml has no client-connection/browser-session secret. Paste the launch URL, or confirm dsh web is installed on that machine.`,
        }
      }
      const current = this.secrets.get(device.id)
      if (authenticationCacheBinding(device, current) !== cacheBinding) {
        return { ok: false, error: 'Authentication configuration changed; retry authentication' }
      }
      const next: StoredDeviceSecret = {
        ...(current ?? { deviceId: device.id, updatedAt: Date.now() }),
        deviceId: device.id,
        cookie: minted,
        cookieAuthority,
        cacheBinding,
        updatedAt: Date.now(),
      }
      delete (next as { signingSecret?: string }).signingSecret
      this.secrets.set(device.id, next)
      this.save()
      return { ok: true }
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
    cookieAuthority: string,
    launchToken: string,
    cacheBinding?: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const credentialVersion = this.secrets.get(deviceId)?.credentialVersion ?? 0
    try {
      const url = new URL('/', effectiveBaseUrl)
      url.searchParams.set('token', launchToken)
      // Deliberately no redirect following: the launch endpoint answers with
      // 303 + Set-Cookie and the caller only needs the cookie pair.
      const response = await requestRemote(url.href, {
        method: 'GET',
        headers: { Host: authority },
        timeoutMs: 15_000,
      })
      const rawSetCookie = response.headers['set-cookie']
      const setCookies = Array.isArray(rawSetCookie)
        ? rawSetCookie
        : rawSetCookie === undefined
          ? []
          : [rawSetCookie]
      for (const setCookie of setCookies) {
        const cookiePair = setCookie.split(';')[0]?.trim()
        if (cookiePair !== undefined && cookiePair.startsWith(COOKIE_PREFIX)) {
          // Keep the user-supplied launch URL / passphrase across token
          // exchanges; only the cookie part is replaced.
          const current = this.secrets.get(deviceId)
          if ((current?.credentialVersion ?? 0) !== credentialVersion) {
            return { ok: false, error: 'Authentication credential changed; retry authentication' }
          }
          this.secrets.set(deviceId, {
            ...(current === undefined ? { deviceId, updatedAt: Date.now() } : withoutCachedAuthentication(current)),
            deviceId,
            cookie: cookiePair,
            cookieAuthority,
            ...(cacheBinding !== undefined ? { cacheBinding } : {}),
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

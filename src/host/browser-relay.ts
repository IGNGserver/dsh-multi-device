/**
 * Browser native-entry capability assessment (no Node or ambient browser APIs).
 *
 * This is deliberately NOT a same-origin reverse proxy. The official remote
 * runtime currently assumes a dedicated origin: `/api`, module imports, CSS
 * URLs, workers and navigation resolve from that origin's root. A path relay
 * plus `<base>`/fetch patches does not preserve that contract. A Host-origin
 * service worker is not a safe substitute: opaque sandbox documents cannot
 * register/control one, and granting the remote Host-origin execution exposes
 * the Host's cookies, authenticated APIs and storage.
 *
 * Until a complete upstream embedded/public-base contract exists, do not serve
 * remote HTML on the Host origin, advertise a nonfunctional relay, bind a proxy
 * publicly, disable CSP, or silently fall back to a local conversation mirror.
 * A future administrator-configured dedicated HTTPS origin per device needs
 * explicit Host authentication, device/client-bound expiring capabilities,
 * server-side remote credentials, cookie isolation and real browser tests. An
 * arbitrary HTTPS URL in a snapshot is NOT proof that those guarantees exist.
 *
 * `available` means this deployment topology is supported, not that network,
 * authentication or the native navigation bridge has already succeeded.
 */

export type BrowserNativeAccessCode =
  | 'proxy-not-ready'
  | 'invalid-page-url'
  | 'invalid-proxy-url'
  | 'same-origin-unsafe'
  | 'public-proxy-not-supported'
  | 'remote-browser-loopback'
  | 'https-http-proxy'
  | 'ipv6-proxy-not-listening'
  | 'ipv6-parent-ipv4-proxy'
  | 'loopback-protocol-not-supported'
  | 'prefixed-relay-not-supported'
  | 'page-protocol-not-supported'

export interface BrowserNativeAccessInput {
  /** Actual browser location.href, not a configured Host URL or request Host header. */
  readonly pageUrl: string
  readonly proxyUrl: string | undefined
  /** True ONLY for a verified Desktop guest bridge, never inferred from URL/UA. */
  readonly desktopGuest?: boolean
}

export type BrowserNativeAccess =
  | {
    readonly status: 'available'
    readonly transport: 'desktop-guest' | 'local-browser'
    readonly url: string
  }
  | {
    readonly status: 'unavailable'
    readonly code: 'proxy-not-ready'
    readonly message: string
  }
  | {
    readonly status: 'unsupported'
    readonly code: Exclude<BrowserNativeAccessCode, 'proxy-not-ready'>
    readonly message: string
  }

function unsupported(
  code: Exclude<BrowserNativeAccessCode, 'proxy-not-ready'>,
  message: string,
): BrowserNativeAccess {
  return { status: 'unsupported', code, message }
}

function parseUrl(value: string): URL | undefined {
  // Do not accept URL's whitespace cleanup or relative/protocol-relative URLs.
  if (typeof value !== 'string' || value !== value.trim() || /[\u0000-\u0020\u007f]/u.test(value)) return undefined
  try {
    const url = new URL(value)
    if (url.username !== '' || url.password !== '') return undefined
    return url
  } catch {
    return undefined
  }
}

function isIpv4ProxyHost(host: string): boolean {
  // The actual NativeDeviceProxy listener binds 127.0.0.1, NOT 127/8 or ::1.
  return host === '127.0.0.1' || host === 'localhost'
}

function isLoopbackPage(host: string): boolean {
  return isIpv4ProxyHost(host) || host === '[::1]'
}

/**
 * Fail-closed entry decision for the existing IPv4-loopback NativeDeviceProxy.
 * Unsupported/unavailable decisions intentionally contain NO frame URL: callers
 * must render their explicit status surface instead of loading an unsafe frame.
 * The original query (including the local proxy bootstrap token) is retained
 * only in a supported entry URL and never copied into diagnostic messages.
 */
export function assessBrowserNativeAccess(input: BrowserNativeAccessInput): BrowserNativeAccess {
  if (input.proxyUrl === undefined || input.proxyUrl === '') {
    return { status: 'unavailable', code: 'proxy-not-ready', message: 'The native device proxy is not ready yet.' }
  }
  const page = parseUrl(input.pageUrl)
  if (page === undefined) return unsupported('invalid-page-url', 'The current page URL is invalid; native access cannot be assessed safely.')
  const proxy = parseUrl(input.proxyUrl)
  if (proxy === undefined || (proxy.protocol !== 'http:' && proxy.protocol !== 'https:')) {
    return unsupported('invalid-proxy-url', 'The native proxy URL must be an absolute HTTP(S) URL without embedded credentials.')
  }
  if (proxy.origin === page.origin) {
    return unsupported('same-origin-unsafe', 'Remote native HTML cannot run on the local DSH Host origin: it could access Host cookies, storage and authenticated APIs. A same-origin path relay is not supported by the current remote runtime.')
  }
  const proxyHost = proxy.hostname.toLowerCase()
  if (proxyHost === '[::1]') {
    return unsupported('ipv6-proxy-not-listening', 'The native proxy listens only on IPv4 127.0.0.1, not IPv6 ::1. No IPv6 proxy URL may be synthesized.')
  }
  if (!isIpv4ProxyHost(proxyHost)) {
    return unsupported('public-proxy-not-supported', 'A public native proxy requires an administrator-configured, independently authenticated HTTPS origin per device. This version does not implement or verify that deployment; an arbitrary public URL is not a supported native entry.')
  }
  if (proxy.protocol !== 'http:') {
    return unsupported('loopback-protocol-not-supported', 'The current loopback native proxy serves HTTP only; changing its URL to HTTPS does not create a TLS listener.')
  }
  if (proxy.pathname !== '/') {
    return unsupported('prefixed-relay-not-supported', 'The current remote runtime requires an origin root for assets, APIs, workers and navigation. A URL path prefix is not a supported native relay.')
  }
  if (input.desktopGuest === true) {
    return { status: 'available', transport: 'desktop-guest', url: proxy.href }
  }
  if (page.protocol !== 'http:' && page.protocol !== 'https:') {
    return unsupported('page-protocol-not-supported', 'Native embedding on this page protocol requires the verified DSH Desktop guest bridge.')
  }
  const pageHost = page.hostname.toLowerCase()
  if (!isLoopbackPage(pageHost)) {
    return unsupported('remote-browser-loopback', 'The native proxy is on the DSH Host loopback address, not the remote browser machine. This browser cannot use its own 127.0.0.1 to reach that proxy. Open DSH locally over HTTP or use DSH Desktop; remote-browser native relay is not supported in this version.')
  }
  if (page.protocol === 'https:') {
    // Some browsers special-case trustworthy HTTP loopback for mixed content.
    // Cookie schemeful-site and browser policy still prevent a reliable embed.
    return unsupported('https-http-proxy', 'An HTTPS page cannot reliably embed the HTTP loopback native proxy: browser mixed-content and schemeful-site cookie policies differ. Open the local HTTP DSH page or use DSH Desktop.')
  }
  if (pageHost === '[::1]') {
    return unsupported('ipv6-parent-ipv4-proxy', 'An IPv6 DSH page and the IPv4-only native proxy do not share a reliable iframe cookie site. Open DSH using 127.0.0.1 or an IPv4-resolving localhost address; the proxy does not listen on ::1.')
  }
  // Cookies are site/host based rather than port based. Keep local HTTP iframes
  // same-site while preserving the dedicated proxy port (origin isolation).
  proxy.hostname = pageHost
  if (proxy.origin === page.origin) {
    return unsupported('same-origin-unsafe', 'Normalizing the loopback hostname would put remote HTML on the local DSH Host origin. The native proxy must use its own dedicated port.')
  }
  return { status: 'available', transport: 'local-browser', url: proxy.href }
}

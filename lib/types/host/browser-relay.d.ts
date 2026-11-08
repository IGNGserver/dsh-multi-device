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
export type BrowserNativeAccessCode = 'proxy-not-ready' | 'invalid-page-url' | 'invalid-proxy-url' | 'same-origin-unsafe' | 'public-proxy-not-supported' | 'remote-browser-loopback' | 'https-http-proxy' | 'ipv6-proxy-not-listening' | 'ipv6-parent-ipv4-proxy' | 'loopback-protocol-not-supported' | 'prefixed-relay-not-supported' | 'page-protocol-not-supported';
export interface BrowserNativeAccessInput {
    /** Actual browser location.href, not a configured Host URL or request Host header. */
    readonly pageUrl: string;
    readonly proxyUrl: string | undefined;
    /** True ONLY for a verified Desktop guest bridge, never inferred from URL/UA. */
    readonly desktopGuest?: boolean;
}
export type BrowserNativeAccess = {
    readonly status: 'available';
    readonly transport: 'desktop-guest' | 'local-browser';
    readonly url: string;
} | {
    readonly status: 'unavailable';
    readonly code: 'proxy-not-ready';
    readonly message: string;
} | {
    readonly status: 'unsupported';
    readonly code: Exclude<BrowserNativeAccessCode, 'proxy-not-ready'>;
    readonly message: string;
};
/**
 * Fail-closed entry decision for the existing IPv4-loopback NativeDeviceProxy.
 * Unsupported/unavailable decisions intentionally contain NO frame URL: callers
 * must render their explicit status surface instead of loading an unsafe frame.
 * The original query (including the local proxy bootstrap token) is retained
 * only in a supported entry URL and never copied into diagnostic messages.
 */
export declare function assessBrowserNativeAccess(input: BrowserNativeAccessInput): BrowserNativeAccess;

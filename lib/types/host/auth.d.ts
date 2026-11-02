import type { DeviceConfig, DeviceId } from '../contract.ts';
export interface StoredDeviceSecret {
    readonly deviceId: DeviceId;
    /** Cookie name=value pair, e.g. `dsh-auth-xxx=v1.yyy.zzz` */
    readonly cookie?: string;
    /** Authority the cookie was signed for, e.g. `127.0.0.1:3080` */
    readonly cookieAuthority?: string;
    /** Raw 32-byte base64url HMAC secret from remote `.credentials.yaml` if bootstrapped via SSH */
    readonly signingSecret?: string;
    readonly bearerToken?: string;
    /** Launch URL/token or explicit cookie/bearer credential entered by the user. */
    readonly authCredential?: string;
    /** Passphrase for an encrypted local SSH private key. */
    readonly sshPassphrase?: string;
    readonly updatedAt: number;
}
/** Compute the exact DSH 0.2 cookie name for an HTTP Host authority (`127.0.0.1:3080`). */
export declare function dshCookieName(authority: string): string;
/**
 * Mint a valid DSH 0.2 browser-session cookie for `authority` using the 32-byte base64url
 * `client-connection/browser-session` signing secret.
 */
export declare function mintDshBrowserCookie(authority: string, base64UrlSecret: string, now?: number, ttlMs?: number): string | undefined;
/**
 * Extract the `token` query parameter from a full launch URL (`http://127.0.0.1:3080/?token=abc`)
 * or return the trimmed string if it is already a bare token.
 */
export declare function extractLaunchToken(credential: string): string;
/**
 * Parse the `client-connection/browser-session` base64url secret out of `.credentials.yaml` text.
 */
export declare function parseSigningSecretFromCredentialsYaml(yamlText: string): string | undefined;
/**
 * Determine the remote HTTP `Host` authority the remote DSH server expects.
 * When accessed via an SSH tunnel, the remote server sees `127.0.0.1:<remotePort>`.
 * When accessed directly, it sees the URL's `host` (`hostname:port`).
 */
export declare function resolveRemoteAuthority(device: DeviceConfig): string;
/**
 * Authority used inside a DSH browser-session cookie. DSH 0.2 hashes the
 * normalized request authority into the cookie name and signs it into the
 * payload. Plain HTTP cookies use `host:port`; TLS listeners use `origin`
 * (`https://host:port`).
 */
export declare function resolveRemoteCookieAuthority(device: DeviceConfig): string;
/** HTTP scheme used when constructing the remote `Origin` header. */
export declare function resolveRemoteScheme(device: DeviceConfig): 'http' | 'https';
/**
 * Manages persisted authentication state and headers for all configured devices.
 */
export declare class DeviceAuthManager {
    private readonly secretsFilePath?;
    private readonly secrets;
    constructor(secretsFilePath?: string | undefined);
    load(): void;
    private save;
    removeDevice(deviceId: DeviceId): void;
    /** Read the persisted secret record for a device (never exposed to the Client). */
    storedSecret(deviceId: DeviceId): StoredDeviceSecret | undefined;
    /** Persist or clear the explicit auth credential entered in the device form. */
    setAuthCredential(deviceId: DeviceId, credential: string | undefined): void;
    /** Persist or clear the passphrase for an encrypted local SSH key. */
    setSshPassphrase(deviceId: DeviceId, passphrase: string | undefined): void;
    /**
     * Build the HTTP headers (`Host`, `Origin`, `Cookie`, `Authorization`) needed to authenticate
     * against `device` over `effectiveBaseUrl`.
     */
    getAuthHeaders(device: DeviceConfig): Record<string, string>;
    /**
     * Ensure valid authentication credentials exist for `device` against `effectiveBaseUrl`.
     * Called before connecting or whenever a `401 Unauthorized` response is encountered.
     */
    ensureAuthenticated(device: DeviceConfig, effectiveBaseUrl: string, forceRefresh?: boolean): Promise<{
        ok: true;
    } | {
        ok: false;
        error: string;
    }>;
    /**
     * Exchange a DSH launch token (`/?token=<launchToken>`) for a persistent `dsh-auth-*` cookie.
     */
    exchangeLaunchToken(deviceId: DeviceId, effectiveBaseUrl: string, authority: string, cookieAuthority: string, launchToken: string): Promise<{
        ok: true;
    } | {
        ok: false;
        error: string;
    }>;
}

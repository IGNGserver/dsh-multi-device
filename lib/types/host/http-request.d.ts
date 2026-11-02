/**
 * Node-native HTTP(S) request helper for talking to a remote DSH server.
 *
 * The WHATWG `fetch()` implementation in Node deliberately ignores a caller
 * supplied `Host` header and always uses the URL authority. That is fatal for
 * an SSH tunnel: the URL is `http://127.0.0.1:<ephemeral-port>` while the
 * remote DSH server expects `Host` (and the matching `Origin`) to be the
 * remote authority it was launched with (`127.0.0.1:3080`).
 *
 * `node:http` / `node:https` preserve `Host`, so this module is the single
 * carrier for every authenticated remote RPC and token exchange.
 *
 * @module dsh-multi-device/host/http-request
 */
import { type IncomingHttpHeaders } from 'node:http';
export interface RemoteHttpRequestOptions {
    readonly method?: string;
    readonly headers?: Readonly<Record<string, string | readonly string[] | undefined>>;
    readonly body?: string | Buffer | Uint8Array;
    readonly signal?: AbortSignal;
    /** TLS certificate verification for `https:` URLs. Defaults to `true`. */
    readonly rejectUnauthorized?: boolean;
    /** Whole-request inactivity timeout. Defaults to 60 seconds. */
    readonly timeoutMs?: number;
    /** Hard response-size cap. Defaults to 32 MiB. */
    readonly maxResponseBytes?: number;
}
export interface RemoteHttpResponse {
    readonly status: number;
    readonly statusText: string;
    readonly headers: IncomingHttpHeaders;
    readonly body: Buffer;
}
/**
 * Perform one HTTP(S) request without following redirects and without
 * rewriting the caller's `Host` / `Origin` headers.
 */
export declare function requestRemote(requestUrl: string, options?: RemoteHttpRequestOptions): Promise<RemoteHttpResponse>;
/**
 * Convert a buffered response into a Fetch `Response` so multipart metadata
 * envelopes (attachment results) can be parsed with the standard API.
 */
export declare function responseAsFetchResponse(response: RemoteHttpResponse): Response;
/** Normalize a header value that may be a string or an array. */
export declare function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined;

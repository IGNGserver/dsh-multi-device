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
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http'
import { request as httpsRequest } from 'node:https'

export interface RemoteHttpRequestOptions {
  readonly method?: string
  readonly headers?: Readonly<Record<string, string | readonly string[] | undefined>>
  readonly body?: string | Buffer | Uint8Array
  readonly signal?: AbortSignal
  /** TLS certificate verification for `https:` URLs. Defaults to `true`. */
  readonly rejectUnauthorized?: boolean
  /** Whole-request inactivity timeout. Defaults to 60 seconds. */
  readonly timeoutMs?: number
  /** Hard response-size cap. Defaults to 32 MiB. */
  readonly maxResponseBytes?: number
}

export interface RemoteHttpResponse {
  readonly status: number
  readonly statusText: string
  readonly headers: IncomingHttpHeaders
  readonly body: Buffer
}

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_RESPONSE_BYTES = 32 * 1024 * 1024

/**
 * Perform one HTTP(S) request without following redirects and without
 * rewriting the caller's `Host` / `Origin` headers.
 */
export function requestRemote(
  requestUrl: string,
  options: RemoteHttpRequestOptions = {},
): Promise<RemoteHttpResponse> {
  const target = new URL(requestUrl)
  const isHttps = target.protocol === 'https:'
  const headers: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (value === undefined) continue
    headers[key] = Array.isArray(value) ? [...value] : String(value)
  }

  let body: Buffer | undefined
  if (options.body !== undefined) {
    body = Buffer.isBuffer(options.body)
      ? options.body
      : typeof options.body === 'string'
        ? Buffer.from(options.body, 'utf8')
        : Buffer.from(options.body)
    if (
      headers['content-length'] === undefined &&
      headers['Content-Length'] === undefined &&
      headers['transfer-encoding'] === undefined &&
      headers['Transfer-Encoding'] === undefined
    ) {
      headers['content-length'] = String(body.byteLength)
    }
  }

  const signal = options.signal
  if (signal?.aborted === true) {
    return Promise.reject(abortError())
  }

  return new Promise<RemoteHttpResponse>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (error: Error | undefined, response?: RemoteHttpResponse): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (error !== undefined) reject(error)
      else if (response !== undefined) resolve(response)
    }

    const onAbort = (): void => {
      req.destroy(abortError())
    }

    const requestFn = isHttps ? httpsRequest : httpRequest
    const req = requestFn(
      target,
      {
        method: options.method ?? 'GET',
        headers,
        ...(isHttps ? { rejectUnauthorized: options.rejectUnauthorized !== false } : {}),
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        const limit = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES

        res.on('data', (chunk: Buffer) => {
          size += chunk.byteLength
          if (size > limit) {
            res.destroy(new Error(`Remote response exceeded ${String(limit)} bytes`))
            return
          }
          chunks.push(chunk)
        })
        res.on('error', (error) => finish(error))
        res.on('end', () => {
          finish(undefined, {
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        })
      },
    )

    req.on('error', (error) => finish(error))
    req.setTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, () => {
      req.destroy(new Error('Remote request timed out'))
    })
    signal?.addEventListener('abort', onAbort, { once: true })
    if (body !== undefined) req.write(body)
    req.end()
  })
}

/**
 * Convert a buffered response into a Fetch `Response` so multipart metadata
 * envelopes (attachment results) can be parsed with the standard API.
 */
export function responseAsFetchResponse(response: RemoteHttpResponse): Response {
  const headers = new Headers()
  for (const [key, value] of Object.entries(response.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry)
    } else {
      headers.set(key, value)
    }
  }
  return new Response(new Uint8Array(response.body), { headers })
}

/** Normalize a header value that may be a string or an array. */
export function headerValue(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()]
  if (value === undefined) return undefined
  return Array.isArray(value) ? value[0] : value
}

function abortError(): Error {
  const error = new Error('Remote request aborted')
  error.name = 'AbortError'
  return error
}

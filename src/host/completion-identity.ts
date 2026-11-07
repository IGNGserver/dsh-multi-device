/**
 * Durable cross-Host completion identities from official, cold-safe unary RPCs.
 * A projection watermark is ONLY a legal page read cut, never a completion.
 * Only the raw seq and turn of a real turn/end form the shared identity.
 *
 * Official pages expose no Session header. Session IDs are immutable UUIDs and
 * already scope shared-state keys; the reader therefore uses turn:<seq>:<turn>.
 * It cannot distinguish unsupported manual reuse of the same Session UUID.
 */
import type { RemoteDeviceClient } from './remote-client.ts'

const MAX_BACKWARD_PAGES = 4
const READ_TIMEOUT_MS = 5_000
// maxMessages bounds messages, not lifecycle/tool events. Bound local parsing.
const MAX_PAGE_RECORDS = 10_000

interface RawEvent {
  readonly type: string
  readonly seq: number
  readonly data: unknown
}
interface Page {
  readonly records: readonly RawEvent[]
  readonly hasMore: boolean
}
type Scan = { readonly kind: 'found'; readonly token: string } | { readonly kind: 'none' | 'open' | 'invalid' }

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)
}

/** Validate chronological raw event envelopes, never projection lookalikes. */
function parsePage(value: unknown): Page | undefined {
  if (!isRecord(value) || !Array.isArray(value.records) || typeof value.hasMore !== 'boolean'
    || value.records.length > MAX_PAGE_RECORDS) return undefined
  const records: RawEvent[] = []
  let previous: number | undefined
  for (const entry of value.records) {
    if (!isRecord(entry) || entry.type !== 'event' || !isRecord(entry.event)) return undefined
    const event = entry.event
    if (typeof event.type !== 'string' || event.type.length === 0 || !isIndex(event.seq)
      || !isIndex(event.time) || !Object.hasOwn(event, 'data')
      || (previous !== undefined && event.seq !== previous + 1)) return undefined
    records.push({ type: event.type, seq: event.seq, data: event.data })
    previous = event.seq
  }
  if (records.length === 0) return value.hasMore ? undefined : { records, hasMore: false }
  if (value.hasMore !== (records[0]!.seq > 0)) return undefined
  return { records, hasMore: value.hasMore }
}

function scanPage(page: Page): Scan {
  // A newer unclosed start invalidates every older completion. Turn-bearing
  // activity without a closer is likewise not proof of the current completion.
  let laterTurnActivity = false
  for (let index = page.records.length - 1; index >= 0; index--) {
    const event = page.records[index]!
    if (event.type === 'turn/start') return { kind: 'open' }
    if (event.type !== 'turn/end') {
      if (isRecord(event.data) && Object.hasOwn(event.data, 'turn')) laterTurnActivity = true
      continue
    }
    if (laterTurnActivity || !isRecord(event.data) || !isIndex(event.data.turn)
      || !isRecord(event.data.reason)) return { kind: 'invalid' }
    // Cold reads can synthesize interrupted/forked closers; do not promote them.
    const reason = event.data.reason
    switch (reason.kind) {
      case 'aborted': {
        if (!isRecord(reason.reason)) return { kind: 'invalid' }
        const cause = reason.reason
        if (typeof cause.kind !== 'string' || !['user', 'parent', 'hook', 'disposed', 'legacy'].includes(cause.kind)
          || (cause.kind === 'hook' && typeof cause.reason !== 'string')) return { kind: 'invalid' }
        break
      }
      case 'error':
        if (!isRecord(reason.error) || typeof reason.error.message !== 'string'
          || typeof reason.error.code !== 'string') return { kind: 'invalid' }
        break
      case 'completed':
      case 'blocked':
      case 'max-tokens':
        break
      default:
        return { kind: 'invalid' }
    }
    return { kind: 'found', token: `turn:${event.seq}:${event.data.turn}` }
  }
  return { kind: laterTurnActivity ? 'open' : 'none' }
}

/**
 * Parse an official SessionPage (or snapshot with the same page fields).
 * An authentic optional header adds :<createdAt> to scope manually reused IDs.
 * No recursive searching, coercion, wall-clock inference, or mutation.
 */
export function parseCompletionIdentity(value: unknown): string | undefined {
  try {
    const page = parsePage(value)
    if (page === undefined) return undefined
    const result = scanPage(page)
    if (result.kind !== 'found') return undefined
    if (isRecord(value) && Object.hasOwn(value, 'header')) {
      if (!isRecord(value.header) || typeof value.header.id !== 'string' || value.header.id.length === 0
        || !isIndex(value.header.createdAt)) return undefined
      return `${result.token}:${value.header.createdAt}`
    }
    return result.token
  } catch {
    // Unknown may include throwing accessors/proxies as well as JSON.
    return undefined
  }
}

function projectionCut(value: unknown): number | undefined {
  return isRecord(value) && value.kind === 'sequenced' && isIndex(value.asOfSeq) && isRecord(value.values)
    ? value.asOfSeq : undefined
}

/**
 * Call only after confirming idle; fence the result against lifecycle changes
 * and the expected local token before promotion. Failure/unsupported API/abort
 * means KEEP that local cursor, never wall-clock fallback across completions.
 *
 * Cost: projections cut + tail page maxMessages:1, at most four older pages at
 * the SAME cut, then a second projections read confirming the cut did not move.
 * No retries, no follow stream (which can activate a cold Agent), no shared
 * transport cancellation. Total deadline is five seconds, even for mocks that
 * ignore the passed signal. Registry owns batching, cache and lifecycle fences.
 */
export async function readRemoteCompletionIdentity(
  client: Pick<RemoteDeviceClient, 'invokeUnary'>,
  rawSessionId: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (typeof rawSessionId !== 'string' || rawSessionId.length === 0 || rawSessionId.length > 512
    || signal?.aborted) return undefined
  const deadline = AbortSignal.timeout(READ_TIMEOUT_MS)
  const lifetime = signal === undefined ? deadline : AbortSignal.any([signal, deadline])
  let onAbort: (() => void) | undefined
  const cancelled = new Promise<undefined>((resolve) => {
    onAbort = () => resolve(undefined)
    lifetime.addEventListener('abort', onAbort, { once: true })
  })
  const invoke = (method: string, request: Record<string, unknown>): Promise<unknown> =>
    Promise.race([client.invokeUnary('session', method, { request }, lifetime), cancelled])
  try {
    const throughSeq = projectionCut(await invoke('projections', { sessionId: rawSessionId }))
    if (lifetime.aborted || throughSeq === undefined) return undefined
    const address = { kind: 'session', sessionId: rawSessionId }
    let beforeSeq: number | undefined
    for (let pageIndex = 0; pageIndex <= MAX_BACKWARD_PAGES; pageIndex++) {
      if (lifetime.aborted) return undefined
      const value = await invoke('page', {
        address, throughSeq, maxMessages: 1,
        ...(beforeSeq === undefined ? {} : { beforeSeq }),
      })
      if (lifetime.aborted) return undefined
      const page = parsePage(value)
      if (page === undefined || page.records.length === 0) return undefined
      // A truncated/stale response must never expose an older completion.
      const expectedLast = beforeSeq === undefined ? throughSeq : beforeSeq - 1
      if (page.records.at(-1)!.seq !== expectedLast) return undefined
      const result = scanPage(page)
      if (result.kind === 'found') {
        const confirmed = projectionCut(await invoke('projections', { sessionId: rawSessionId }))
        return !lifetime.aborted && confirmed === throughSeq ? result.token : undefined
      }
      if (result.kind !== 'none' || !page.hasMore) return undefined
      beforeSeq = page.records[0]!.seq
    }
    return undefined
  } catch {
    return undefined
  } finally {
    if (onAbort !== undefined) lifetime.removeEventListener('abort', onAbort)
  }
}

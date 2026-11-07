import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCompletionIdentity, readRemoteCompletionIdentity } from '../src/host/completion-identity.ts'
import { ReadStateTracker } from '../src/host/read-state.ts'

function event(seq: number, type = 'session/title', data: unknown = {}) {
  return { type: 'event', event: { seq, type, time: 100, data } }
}
function end(seq: number, turn = 1, reason: unknown = { kind: 'completed' }) {
  return event(seq, 'turn/end', { turn, reason })
}
function page(...records: ReturnType<typeof event>[]) {
  return { records, hasMore: (records[0]?.event.seq ?? 0) > 0 }
}
function cut(asOfSeq: number) { return { kind: 'sequenced', asOfSeq, values: {} } }
function clientWith(...values: unknown[]) {
  const invokeUnary = vi.fn(async (_namespace: string, _method: string, _args: Record<string, unknown>, _signal?: AbortSignal): Promise<unknown> => {
    const value = values.shift()
    if (value instanceof Error) throw value
    return value
  })
  return { invokeUnary }
}
function finish(tracker: ReadStateTracker, at = 100): string {
  tracker.observeRunning('s', true, at)
  tracker.observeRunning('s', false, at)
  return tracker.completionIds().s!
}

afterEach(() => vi.restoreAllMocks())

describe('parseCompletionIdentity', () => {
  it('is deterministic across Hosts and changes for each real terminal seq or turn', () => {
    const input = page(end(7, 2), event(8))
    const copy = JSON.parse(JSON.stringify(input))
    copy.records[0].event.time = 9_000_000
    expect(parseCompletionIdentity(input)).toBe('turn:7:2')
    expect(parseCompletionIdentity(copy)).toBe('turn:7:2')
    expect(parseCompletionIdentity(page(end(9, 2)))).toBe('turn:9:2')
    expect(parseCompletionIdentity(page(end(7, 3)))).toBe('turn:7:3')
    expect(parseCompletionIdentity({ ...input, updatedAt: 999, projections: { asOfSeq: 999 } })).toBe('turn:7:2')
    expect(input.records[0]!.event.time).toBe(100)
  })

  it('optionally scopes a real header createdAt without fabricating one', () => {
    const input = { ...page(end(1)), header: { id: 's', createdAt: 123 } }
    expect(parseCompletionIdentity(input)).toBe('turn:1:1:123')
    expect(parseCompletionIdentity({ ...input, header: { id: 's', createdAt: 124 } })).toBe('turn:1:1:124')
    expect(parseCompletionIdentity({ ...input, header: { id: 's' } })).toBeUndefined()
  })

  it('recognizes only real closed turns, including abort and error but not synthetic repair', () => {
    for (const reason of [
      { kind: 'completed' }, { kind: 'blocked' }, { kind: 'max-tokens' },
      { kind: 'aborted', reason: { kind: 'user' } },
      { kind: 'aborted', reason: { kind: 'hook', reason: 'stop' } },
      { kind: 'error', error: { message: 'failed', code: 'UNKNOWN' } },
    ]) expect(parseCompletionIdentity(page(end(4, 0, reason)))).toBe('turn:4:0')
    for (const reason of [null, 'completed', {}, { kind: 'interrupted' }, { kind: 'forked' },
      { kind: 'unknown' }, { kind: 'aborted' }, { kind: 'aborted', reason: { kind: 'hook' } },
      { kind: 'error' }, { kind: 'error', error: { message: 'failed' } },
    ]) expect(parseCompletionIdentity(page(end(4, 1, reason)))).toBeUndefined()
  })

  it('does not reuse an older terminal after a new unclosed turn or activity', () => {
    expect(parseCompletionIdentity(page(end(0), event(1, 'turn/start', { turn: 2 })))).toBeUndefined()
    expect(parseCompletionIdentity(page(end(0), event(1, 'step/start', { turn: 2, step: 0 })))).toBeUndefined()
    expect(parseCompletionIdentity(page(end(0), event(1, 'turn/start', { turn: 2 }), end(2, 2)))).toBe('turn:2:2')
    expect(parseCompletionIdentity(page(event(0, 'assistant/message', { turn: 1 })))).toBeUndefined()
    expect(parseCompletionIdentity(page(event(0)))).toBeUndefined()
  })

  it('rejects malformed or malicious envelopes, numeric coercions, gaps and lookalikes', () => {
    for (const value of [undefined, null, [], 'turn:1:1', {}, { updatedAt: 123 },
      { seq: 3, turn: 1 }, { type: 'turn/end', seq: 1, data: { turn: 1 } },
      { records: [end(1)] }, { records: [end(1)], hasMore: false },
      { records: [end(2), end(1)], hasMore: true },
      { records: [end(0), end(2)], hasMore: false },
      { records: [{ type: 'event', event: { ...end(1).event, seq: '1' } }], hasMore: true },
      { records: [{ type: 'event', event: { ...end(1).event, time: NaN } }], hasMore: true },
      { records: [event(1, 'projection', { type: 'turn/end', seq: 99, turn: 1 })], hasMore: true },
      ...[-1, -0, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '2', null, {}].map(turn => page(end(1, turn as number))),
      Object.create({ records: [end(0)], hasMore: false }),
      { get records() { throw new Error('hostile accessor') }, hasMore: false },
      new Proxy({}, { getPrototypeOf() { throw new Error('hostile proxy') } }),
    ]) expect(parseCompletionIdentity(value)).toBeUndefined()
  })
})

describe('readRemoteCompletionIdentity', () => {
  it('uses only cold-safe unary projections/page; cut is not the token; confirms unchanged cut', async () => {
    const client = clientWith(cut(12), page(end(11, 3), event(12)), cut(12))
    const openStream = vi.fn(() => { throw new Error('follow must never be opened') })
    const guardedClient = { ...client, openStream }
    expect(await readRemoteCompletionIdentity(guardedClient, 'raw-id')).toBe('turn:11:3')
    expect(openStream).not.toHaveBeenCalled()
    expect(client.invokeUnary.mock.calls.map(args => args.slice(0, 3))).toEqual([
      ['session', 'projections', { request: { sessionId: 'raw-id' } }],
      ['session', 'page', { request: { address: { kind: 'session', sessionId: 'raw-id' }, throughSeq: 12, maxMessages: 1 } }],
      ['session', 'projections', { request: { sessionId: 'raw-id' } }],
    ])
  })

  it('pages backward with fixed throughSeq until a real terminal, never last arbitrary seq', async () => {
    const client = clientWith(cut(8), page(event(8)), page(event(6), event(7)), page(end(5, 2)), cut(8))
    expect(await readRemoteCompletionIdentity(client, 's')).toBe('turn:5:2')
    expect(client.invokeUnary.mock.calls[2]?.[2]).toEqual({ request: {
      address: { kind: 'session', sessionId: 's' }, throughSeq: 8, beforeSeq: 8, maxMessages: 1,
    } })
    expect(client.invokeUnary.mock.calls[3]?.[2]).toEqual({ request: {
      address: { kind: 'session', sessionId: 's' }, throughSeq: 8, beforeSeq: 6, maxMessages: 1,
    } })
  })

  it('stops at an unclosed newer start, including a start discovered on an older page', async () => {
    for (const pages of [
      [page(end(1), event(2, 'turn/start', { turn: 2 }))],
      [page(event(2)), page(event(1, 'turn/start', { turn: 2 }))],
    ]) {
      const client = clientWith(cut(2), ...pages, page(end(0)))
      expect(await readRemoteCompletionIdentity(client, 's')).toBeUndefined()
      expect(client.invokeUnary).toHaveBeenCalledTimes(1 + pages.length)
    }
  })

  it('does not promote a stale cut if a new turn starts or ends while reading', async () => {
    for (const final of [cut(3), cut(0), { kind: 'cached', asOfSeq: 2, values: {} }, null, new Error('offline')]) {
      expect(await readRemoteCompletionIdentity(clientWith(cut(2), page(end(2)), final), 's')).toBeUndefined()
    }
  })

  it('bounds pagination to one tail plus four backward pages and returns no identity without a terminal', async () => {
    const client = clientWith(cut(20), ...[20, 19, 18, 17, 16, 15].map(seq => page(event(seq))))
    expect(await readRemoteCompletionIdentity(client, 's')).toBeUndefined()
    expect(client.invokeUnary).toHaveBeenCalledTimes(6)
    const exhausted = clientWith(cut(1), page(event(0), event(1)))
    expect(await readRemoteCompletionIdentity(exhausted, 's')).toBeUndefined()
    expect(exhausted.invokeUnary).toHaveBeenCalledTimes(2)
  })

  it('fails closed for unsupported projections, absent/empty pages, wrong boundary, malformed and failed RPCs', async () => {
    for (const projection of [null, {}, { kind: 'migration-required', values: {} },
      { kind: 'cached', asOfSeq: 1, values: {} }, cut(-1), cut(1.5), cut(Infinity),
      { kind: 'sequenced', asOfSeq: 1 }, new Error('unsupported'),
    ]) {
      const client = clientWith(projection)
      expect(await readRemoteCompletionIdentity(client, 's')).toBeUndefined()
      expect(client.invokeUnary).toHaveBeenCalledTimes(1)
    }
    for (const response of [undefined, { records: [], hasMore: false }, { records: [], hasMore: true },
      page(end(0)), page(end(2)), new Error('network'), page(end(1, 1, { kind: 'interrupted' })),
    ]) expect(await readRemoteCompletionIdentity(clientWith(cut(1), response), 's')).toBeUndefined()
    const repeated = clientWith(cut(2), page(event(2)), page(end(2)))
    expect(await readRemoteCompletionIdentity(repeated, 's')).toBeUndefined()
  })

  it('respects pre-cancellation without RPC and cancels in-flight non-cooperative calls', async () => {
    const controller = new AbortController()
    controller.abort()
    const untouched = clientWith()
    expect(await readRemoteCompletionIdentity(untouched, 's', controller.signal)).toBeUndefined()
    expect(untouched.invokeUnary).not.toHaveBeenCalled()
    const active = new AbortController()
    let passedSignal: AbortSignal | undefined
    const invokeUnary = vi.fn((_namespace: string, _method: string, _args: Record<string, unknown>, signal?: AbortSignal) => {
      passedSignal = signal
      return new Promise<unknown>(() => {})
    })
    const promise = readRemoteCompletionIdentity({ invokeUnary }, 's', active.signal)
    active.abort()
    expect(await promise).toBeUndefined()
    expect(passedSignal?.aborted).toBe(true)
    expect(invokeUnary).toHaveBeenCalledTimes(1)
  })

  it('has a five-second deadline and handles transport synchronous exceptions', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const controller = new AbortController()
    timeout.mockReturnValue(controller.signal)
    const promise = readRemoteCompletionIdentity({ invokeUnary: () => new Promise(() => {}) }, 's')
    expect(timeout).toHaveBeenCalledWith(5_000)
    controller.abort()
    expect(await promise).toBeUndefined()
    expect(await readRemoteCompletionIdentity({ invokeUnary() { throw new Error('sync') } }, 's')).toBeUndefined()
    for (const id of ['', 's'.repeat(513)]) {
      const client = clientWith()
      expect(await readRemoteCompletionIdentity(client, id)).toBeUndefined()
      expect(client.invokeUnary).not.toHaveBeenCalled()
    }
  })

  it('unifies two Hosts same turn, preserves reads, and never clears a different completion by wallclock', async () => {
    const a = new ReadStateTracker()
    const b = new ReadStateTracker()
    const localA = finish(a, 1_000)
    const localB = finish(b, 999_999)
    expect(localA).not.toBe(localB)
    b.readCompletion('s', localB, 9_999_999)
    a.mergeEntry('s', b.entriesSnapshot().s!)
    expect(a.isUnread('s')).toBe(true) // UUID-per-Host alone cannot converge.
    const tokenA = await readRemoteCompletionIdentity(clientWith(cut(5), page(end(5, 2)), cut(5)), 's')
    const tokenB = await readRemoteCompletionIdentity(clientWith(cut(5), page(end(5, 2)), cut(5)), 's')
    expect(tokenA).toBe(tokenB)
    expect(a.promoteCompletion('s', localA, tokenA!)).toBe(true)
    expect(b.promoteCompletion('s', localB, tokenB!)).toBe(true)
    expect(a.isUnread('s')).toBe(true)
    expect(b.isUnread('s')).toBe(false)
    a.mergeEntry('s', b.entriesSnapshot().s!)
    expect(a.isUnread('s')).toBe(false)
    const next = finish(a, 0)
    const nextShared = await readRemoteCompletionIdentity(clientWith(cut(7), page(end(7, 3)), cut(7)), 's')
    expect(nextShared).not.toBe(tokenA)
    expect(a.promoteCompletion('s', next, nextShared!)).toBe(true)
    a.mergeEntry('s', b.entriesSnapshot().s!)
    a.mergeEntry('s', { unread: false, at: Number.MAX_SAFE_INTEGER })
    expect(a.completionIds().s).toBe(nextShared)
    expect(a.isUnread('s')).toBe(true)
  })
})

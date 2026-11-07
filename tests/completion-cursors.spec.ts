import { describe, expect, it } from 'vitest'
import {
  READ_STATE_ENTRY_LIMIT,
  ReadStateTracker,
} from '../src/host/read-state.ts'
import type { SessionReadState } from '../src/host/read-state.ts'
import {
  buildSharedReadDocument,
  mergeSharedReadEntries,
  parseSharedReadDocument,
  SHARED_READ_HOST_LIMIT,
  SHARED_READ_SECTION_LIMIT,
} from '../src/host/shared-state.ts'

function finish(tracker: ReadStateTracker, id: string, at: number): string {
  tracker.observeRunning(id, true, at)
  tracker.observeRunning(id, false, at)
  return tracker.completionIds()[id]!
}

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

function replay(tracker: ReadStateTracker, sessions: Record<string, SessionReadState>): void {
  const doc = parseSharedReadDocument(JSON.stringify(buildSharedReadDocument(undefined, 'peer', sessions, 1)))!
  for (const [id, entry] of Object.entries(doc.hosts.peer!.sessions)) tracker.mergeEntry(id, entry)
}

function sizes(tracker: ReadStateTracker): { entries: number; running: number } {
  const maps = tracker as unknown as { entries: Map<string, unknown>; running: Map<string, unknown> }
  return { entries: maps.entries.size, running: maps.running.size }
}

describe('completion cursors: single Host authority', () => {
  it('mints UUIDs only for ordered true -> false, never duplicate false or time changes', () => {
    const tracker = new ReadStateTracker()
    tracker.observeRunning('s', false, 100)
    tracker.observeRunning('s', false, 9_000)
    expect(tracker.completionIds()).toEqual({})
    const first = finish(tracker, 's', 100)
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    tracker.observeRunning('s', false, 100_000)
    tracker.observeRunning('s', false, 1)
    expect(tracker.completionIds()).toEqual({ s: first })
    tracker.markRead('s', 101, first)
    tracker.observeRunning('s', false, 200_000)
    expect(tracker.isUnread('s')).toBe(false)
    expect(finish(tracker, 's', 100)).not.toBe(first)
    expect(tracker.isUnread('s')).toBe(true)
  })

  it('rejects stale token reads, accepts matching duplicate ACKs independently of changed', () => {
    const tracker = new ReadStateTracker()
    const old = finish(tracker, 's', 10)
    const current = finish(tracker, 's', 10)
    expect(tracker.markRead('s', 999_999, old)).toBe(false)
    expect(tracker.readCompletion('s', old, 999_999)).toEqual({
      accepted: false, currentCompletionId: current, unread: true,
    })
    expect(tracker.readCompletion('s', current, 1)).toEqual({
      accepted: true, currentCompletionId: current, unread: false,
    })
    expect(tracker.readCompletion('s', current, 1)).toEqual({
      accepted: true, currentCompletionId: current, unread: false,
    })
    expect(tracker.completionIds()).toEqual({ s: current })
    expect(tracker.entriesSnapshot().s!.readCompletionId).toBe(current)
    expect(tracker.readCompletion('absent', current)).toEqual({ accepted: false, unread: false })
  })

  it('retains read-through metadata across running, bulk read, and hydration with one notification', () => {
    const changes: Array<{ id: string; state: SessionReadState; changed: boolean }> = []
    const tracker = new ReadStateTracker((id, state, changed) => changes.push({ id, state, changed }))
    const a = finish(tracker, 'a', 100)
    const b = finish(tracker, 'b', 100)
    changes.length = 0
    expect(tracker.markManyRead(() => true, 101)).toEqual(['a', 'b'])
    expect(changes).toHaveLength(1)
    expect(changes[0]!.state.readCompletionId).toBe(a)
    expect(tracker.entriesSnapshot().b).toMatchObject({ completionId: b, readCompletionId: b, unread: false })
    const restored = new ReadStateTracker()
    restored.hydrate(tracker.entriesSnapshot())
    expect(restored.entriesSnapshot()).toEqual(tracker.entriesSnapshot())
    const next = finish(restored, 'a', 90)
    expect(restored.entriesSnapshot().a).toMatchObject({ completionId: next, readCompletionId: a, unread: true })
    expect(restored.markRead('a', 999, a)).toBe(false)
  })

  it('never reopens the same token after a read, even on newer shared unread or legacy writes', () => {
    const tracker = new ReadStateTracker()
    const token = finish(tracker, 's', 100)
    tracker.readCompletion('s', token, 101)
    for (const at of [0, 100, 102, 999_999_999]) {
      tracker.mergeEntry('s', { completionId: token, unread: true, at })
      tracker.mergeEntry('s', { unread: true, at })
      tracker.markUnread('s', at)
      expect(tracker.isUnread('s')).toBe(false)
      expect(tracker.entriesSnapshot().s!.readCompletionId).toBe(token)
    }
  })

  it('matching read beats older clocks, different Host tokens cannot clear or replace the local cursor', () => {
    const local = new ReadStateTracker()
    const peer = new ReadStateTracker()
    const token = finish(local, 's', 1_000)
    const peerToken = finish(peer, 's', 2_000)
    peer.readCompletion('s', peerToken, 9_999_999)
    replay(local, peer.entriesSnapshot())
    peer.remove('s', 99_999_999)
    replay(local, peer.entriesSnapshot())
    local.mergeEntry('s', { unread: false, at: 99_999_999, deleted: true })
    local.mergeEntry('s', { unread: false, at: 99_999_999 })
    expect(local.completionIds().s).toBe(token)
    expect(local.isUnread('s')).toBe(true)
    expect(local.mergeEntry('s', { completionId: token, readCompletionId: token, unread: false, at: 1 })).toBe(true)
    expect(local.isUnread('s')).toBe(false)
  })

  it('migrates hydrated legacy unread once without claiming an observed completion', () => {
    const legacy = {
      unread: { unread: true, at: 100 },
      read: { unread: false, at: 101 },
      deleted: { unread: false, at: 102, deleted: true },
    }
    const tracker = new ReadStateTracker()
    tracker.hydrate(legacy)
    const token = tracker.completionIds().unread!
    expect(token).toMatch(/^legacy:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(tracker.entriesSnapshot().unread).toEqual({ unread: true, at: 100, completionId: token })
    expect(tracker.entriesSnapshot().read).toEqual(legacy.read)
    expect(tracker.entriesSnapshot().deleted).toEqual(legacy.deleted)
    tracker.hydrate(legacy)
    tracker.observeRunning('unread', false, 200)
    expect(tracker.completionIds()).toEqual({ unread: token })

    const restored = new ReadStateTracker()
    restored.hydrate(JSON.parse(JSON.stringify(tracker.entriesSnapshot())))
    expect(restored.completionIds()).toEqual({ unread: token })
    replay(restored, { unread: { unread: false, at: 999_999 } })
    expect(restored.isUnread('unread')).toBe(true) // Legacy peers cannot clear a cursor.
    expect(restored.readCompletion('unread', token, 201)).toEqual({
      accepted: true, currentCompletionId: token, unread: false,
    })
    replay(restored, { unread: { unread: true, at: 999_999 } })
    expect(restored.isUnread('unread')).toBe(false)
    const afterReadRestart = new ReadStateTracker()
    afterReadRestart.hydrate(restored.entriesSnapshot())
    expect(afterReadRestart.entriesSnapshot().unread).toMatchObject({
      completionId: token, readCompletionId: token, unread: false,
    })
    const realCompletion = finish(afterReadRestart, 'unread', 300)
    expect(realCompletion).not.toBe(token)
    expect(realCompletion.startsWith('legacy:')).toBe(false)
    expect(afterReadRestart.readCompletion('unread', token).accepted).toBe(false)
  })

  it('keeps pre-migration legacy read LWW and never migrates terminal tombstones', () => {
    const tracker = new ReadStateTracker()
    tracker.markRead('s', 200)
    tracker.hydrate({ s: { unread: true, at: 100 } })
    expect(tracker.completionIds()).toEqual({})
    expect(tracker.isUnread('s')).toBe(false)
    tracker.hydrate({ s: { unread: true, at: 201 } })
    expect(tracker.completionIds().s).toMatch(/^legacy:/)
    tracker.remove('s', 202)
    tracker.hydrate({ s: { unread: true, at: 999 } })
    expect(tracker.entriesSnapshot().s!.deleted).toBe(true)
    expect(tracker.completionIds()).toEqual({})
  })

  it('keeps legacy LWW only before cursorization', () => {
    const tracker = new ReadStateTracker()
    tracker.markUnread('s', 100)
    expect(tracker.mergeEntry('s', { unread: false, at: 99 })).toBe(false)
    expect(tracker.mergeEntry('s', { unread: false, at: 100 })).toBe(true)
    expect(tracker.mergeEntry('s', { unread: true, at: 101 })).toBe(true)
    const token = finish(tracker, 's', 1)
    tracker.mergeEntry('s', { unread: false, at: 99_999 })
    expect(tracker.isUnread('s')).toBe(true)
    expect(tracker.completionIds().s).toBe(token)
  })

  it('persists terminal tombstones and rejects stale shared replay after deletion or pruning', () => {
    for (const remove of [
      (tracker: ReadStateTracker) => tracker.remove('s', 200),
      (tracker: ReadStateTracker) => tracker.prune(() => false),
      (tracker: ReadStateTracker) => tracker.retain(() => false),
    ]) {
      const tracker = new ReadStateTracker()
      const token = finish(tracker, 's', 100)
      const stale = tracker.entriesSnapshot()
      remove(tracker)
      expect(tracker.entriesSnapshot().s).toMatchObject({ deleted: true, completionId: token, readCompletionId: token })
      const restored = new ReadStateTracker()
      restored.hydrate(tracker.entriesSnapshot())
      replay(restored, { s: { ...stale.s!, at: Number.MAX_SAFE_INTEGER } })
      restored.mergeEntry('s', { unread: true, at: Number.MAX_SAFE_INTEGER })
      restored.observeRunning('s', true)
      restored.observeRunning('s', false)
      expect(restored.unreadIds()).toEqual([])
      expect(restored.completionIds()).toEqual({})
      expect(restored.readCompletion('s', token)).toEqual({ accepted: false, unread: false })
    }
  })

  it('promotes verified shared completion identity without changing unread, read-through, or time', () => {
    const changes: boolean[] = []
    const tracker = new ReadStateTracker((_id, _state, changed) => changes.push(changed))
    const old = finish(tracker, 's', 100)
    tracker.markRead('s', 101, old)
    changes.length = 0
    expect(tracker.promoteCompletion('s', old, 'turn:common:1')).toBe(true)
    expect(changes).toEqual([true])
    expect(tracker.entriesSnapshot().s).toEqual({
      unread: false, at: 101, completionId: 'turn:common:1', readCompletionId: 'turn:common:1',
    })
    expect(tracker.promoteCompletion('s', old, 'turn:common:2')).toBe(false)
    expect(tracker.readCompletion('s', old).accepted).toBe(false)
    const current = finish(tracker, 's', 102)
    expect(tracker.promoteCompletion('s', current, 'turn:common:2')).toBe(true)
    expect(tracker.entriesSnapshot().s).toEqual({
      unread: true, at: 102, completionId: 'turn:common:2', readCompletionId: 'turn:common:1',
    })
  })

  it('rejects promotion during running, after deletion/replacement, and for invalid or unchanged identities', () => {
    const tracker = new ReadStateTracker()
    const token = finish(tracker, 's', 100)
    tracker.observeRunning('s', true, 101)
    expect(tracker.promoteCompletion('s', token, 'turn:common:1')).toBe(false)
    tracker.observeRunning('s', false, 102)
    const current = tracker.completionIds().s!
    expect(tracker.promoteCompletion('s', token, 'turn:common:1')).toBe(false)
    expect(tracker.promoteCompletion('s', current, current)).toBe(false)
    expect(tracker.promoteCompletion('s', current, '')).toBe(false)
    expect(tracker.promoteCompletion('s', current, 'x'.repeat(513))).toBe(false)
    tracker.remove('s', 103)
    expect(tracker.promoteCompletion('s', current, 'turn:common:1')).toBe(false)
    expect(tracker.promoteCompletion('unknown', 'old', 'turn:common:1')).toBe(false)
  })

  it('shares read state only after independent Hosts verify the same terminal identity', () => {
    const first = new ReadStateTracker()
    const second = new ReadStateTracker()
    const a = finish(first, 's', 100)
    const b = finish(second, 's', 200)
    first.markRead('s', 101, a)
    replay(second, first.entriesSnapshot())
    expect(second.isUnread('s')).toBe(true)
    expect(first.promoteCompletion('s', a, 'turn:common:1')).toBe(true)
    expect(second.promoteCompletion('s', b, 'turn:common:1')).toBe(true)
    replay(second, first.entriesSnapshot())
    expect(second.isUnread('s')).toBe(false)
    expect(second.entriesSnapshot().s!.readCompletionId).toBe('turn:common:1')
    second.mergeEntry('s', { unread: true, at: 999_999, completionId: 'turn:common:1' })
    expect(second.isUnread('s')).toBe(false)
  })

  it('explicitly migrates a shared legacy batch once while preserving prior LWW merge behavior', () => {
    const changes: boolean[] = []
    const tracker = new ReadStateTracker((_id, _state, changed) => changes.push(changed))
    tracker.mergeEntry('read', { unread: true, at: 1 })
    tracker.mergeEntry('read', { unread: false, at: 2 })
    tracker.mergeEntry('a', { unread: false, at: 1 })
    tracker.mergeEntry('a', { unread: true, at: 2 })
    tracker.mergeEntry('b', { unread: true, at: 3 })
    tracker.remove('deleted', 4)
    changes.length = 0
    expect(tracker.migrateLegacyIds()).toEqual(['a', 'b'])
    expect(changes).toEqual([true])
    const token = tracker.completionIds().a!
    expect(token).toMatch(/^legacy:/)
    expect(tracker.completionIds().b).toMatch(/^legacy:/)
    expect(tracker.completionIds().read).toBeUndefined()
    expect(tracker.completionIds().deleted).toBeUndefined()
    expect(tracker.migrateLegacyIds()).toEqual([])
    expect(changes).toEqual([true])
    tracker.mergeEntry('a', { unread: false, at: 999_999 })
    expect(tracker.isUnread('a')).toBe(true)
    expect(tracker.readCompletion('a', token).accepted).toBe(true)
    const restored = new ReadStateTracker()
    restored.hydrate(tracker.entriesSnapshot())
    expect(restored.completionIds()).toEqual(tracker.completionIds())
    expect(restored.isUnread('a')).toBe(false)
  })

  it('retains a true baseline through more than 2000 cold idle catalog observations', () => {
    const tracker = new ReadStateTracker()
    tracker.observeRunning('active', true, 1)
    for (let i = 0; i < READ_STATE_ENTRY_LIMIT * 3; i += 1) tracker.observeRunning(`idle-${i}`, false, i + 2)
    expect(sizes(tracker)).toEqual({ entries: 0, running: 1 })
    expect(tracker.observeRunning('active', false, 10_000)).toBe(true)
    expect(tracker.isUnread('active')).toBe(true)
    const token = tracker.completionIds().active!
    tracker.observeRunning('active', false, 10_001)
    expect(tracker.completionIds().active).toBe(token)
    expect(sizes(tracker).running).toBe(0)
  })

  it('bounds running-only baselines as well as entries and tombstones', () => {
    const tracker = new ReadStateTracker()
    for (let i = 0; i < READ_STATE_ENTRY_LIMIT * 3; i += 1) tracker.observeRunning(`idle-${i}`, i % 2 === 0, i)
    expect(sizes(tracker)).toEqual({ entries: 0, running: READ_STATE_ENTRY_LIMIT })
    tracker.observeRunning('idle-0', false, 9_000)
    expect(tracker.completionIds()).toEqual({}) // Evicted true baseline is not reconstructed.
    for (let i = 0; i < READ_STATE_ENTRY_LIMIT + 400; i += 1) tracker.remove(`deleted-${i}`, i)
    expect(sizes(tracker).entries).toBe(READ_STATE_ENTRY_LIMIT)
    expect(sizes(tracker).running).toBeLessThanOrEqual(READ_STATE_ENTRY_LIMIT)
    tracker.trim(7)
    expect(sizes(tracker).entries).toBe(7)
    expect(sizes(tracker).running).toBeLessThanOrEqual(7)
  })
})

describe('version-1 shared documents with optional cursors', () => {
  it('round trips cursors, tombstones and unchanged legacy entries', () => {
    const sessions: Record<string, SessionReadState> = {
      legacy: { unread: true, at: 1 },
      read: { unread: false, at: 2, completionId: 'same', readCompletionId: 'same' },
      gone: { unread: false, at: 3, completionId: 'deleted', readCompletionId: 'deleted', deleted: true },
    }
    const document = buildSharedReadDocument(undefined, 'host', sessions, 4)
    expect(parseSharedReadDocument(JSON.stringify(document))!.hosts.host!.sessions).toEqual(sessions)
    expect(document.version).toBe(1)
  })

  it('merges same-token reads monotonically but never orders different UUIDs by timestamps', () => {
    const local: Record<string, SessionReadState> = {
      read: { unread: false, at: 1, completionId: 'c', readCompletionId: 'c' },
      current: { unread: true, at: 1, completionId: 'local' },
      gone: { unread: false, at: 1, deleted: true },
    }
    const doc = buildSharedReadDocument(undefined, 'peer', {
      read: { unread: true, at: 999, completionId: 'c' },
      current: { unread: false, at: 999, completionId: 'other', readCompletionId: 'other' },
      gone: { unread: true, at: 999 },
    }, 999)
    const merged = mergeSharedReadEntries(local, doc)
    expect(merged.read).toMatchObject({ unread: false, completionId: 'c', readCompletionId: 'c' })
    expect(merged.current).toEqual(local.current)
    expect(merged.gone).toEqual(local.gone)
  })

  it('preserves same-token read ACKs across duplicate Host frames with later unread clocks', () => {
    const read = buildSharedReadDocument(undefined, 'host', {
      s: { unread: false, at: 1, completionId: 'c', readCompletionId: 'c' },
    }, 1)
    const stale = buildSharedReadDocument(undefined, 'host', {
      s: { unread: true, at: 999, completionId: 'c' },
    }, 999)
    for (const documents of [[read, stale], [stale, read]]) {
      const parsed = parseSharedReadDocument(documents.map(doc => JSON.stringify(doc)).join('\u001e'))!
      expect(parsed.hosts.host!.sessions.s).toMatchObject({ unread: false, completionId: 'c', readCompletionId: 'c' })
    }
  })

  it('validates optional fields and caps Host sections and entries', () => {
    const doc = parseSharedReadDocument(JSON.stringify({ version: 1, hosts: { host: {
      updatedAt: 1,
      sessions: {
        legacy: { unread: true, at: 1, completionId: 9, readCompletionId: '' },
        normalized: { unread: true, at: 1, completionId: 'c', readCompletionId: 'c' },
      },
    } } }))!
    expect(doc.hosts.host!.sessions.legacy).toEqual({ unread: true, at: 1 })
    expect(doc.hosts.host!.sessions.normalized!.unread).toBe(false)
    const many = Object.fromEntries(Array.from({ length: SHARED_READ_SECTION_LIMIT + 10 }, (_, i) => [`s${i}`, { unread: false, at: i, completionId: `c${i}`, readCompletionId: `c${i}` }]))
    const hosts = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`h${i}`, { updatedAt: i, sessions: many }]))
    const bounded = buildSharedReadDocument({ version: 1, hosts }, 'own', many, 100)
    expect(Object.keys(bounded.hosts).length).toBeLessThanOrEqual(SHARED_READ_HOST_LIMIT)
    expect(Object.keys(bounded.hosts.own!.sessions)).toHaveLength(SHARED_READ_SECTION_LIMIT)
    expect(Object.values(bounded.hosts).reduce((sum, section) => sum + Object.keys(section.sessions).length, 0)).toBeLessThanOrEqual(600)
  })
})

describe('deterministic 24-hour completion/read/delete/shared replay simulation', () => {
  it.each([0x1234, 0xc0ffee, 0xdeadbeef])('preserves cursor monotonicity and bounds for seed %i', seed => {
    const random = seeded(seed)
    let tracker = new ReadStateTracker()
    const peer = new ReadStateTracker()
    const history: Array<Record<string, SessionReadState>> = []
    const deleted = new Set<string>()
    const readTokens = new Set<string>()
    const seen = new Set<string>()
    const dayStart = 1_800_000_000_000
    // Two cycles per minute: virtual 24h, no real-time waiting.
    for (let tick = 0; tick < 24 * 60 * 2; tick += 1) {
      const now = dayStart + tick * 30_000
      const id = `session-${Math.floor(random() * 40)}`
      const action = Math.floor(random() * 7)
      if (action === 0 && !deleted.has(id)) {
        const token = finish(tracker, id, now)
        expect(seen.has(token)).toBe(false)
        seen.add(token)
      } else if (action === 1) {
        const token = tracker.completionIds()[id]
        if (token !== undefined) {
          expect(tracker.readCompletion(id, token, now).accepted).toBe(true)
          readTokens.add(token)
        }
      } else if (action === 2) {
        const snapshot = tracker.entriesSnapshot()
        history.push(snapshot)
        if (history.length > 20) history.shift()
        replay(peer, snapshot)
      } else if (action === 3) {
        const snapshot = history[Math.floor(random() * history.length)]
        if (snapshot !== undefined) {
          // A delayed peer may report a much later wall clock for old unread.
          replay(tracker, Object.fromEntries(Object.entries(snapshot).map(([key, entry]) => [key, { ...entry, at: now + 86_400_000 }])))
        }
      } else if (action === 4 && tick > 2_000) {
        tracker.remove(id, now)
        deleted.add(id)
      } else if (action === 5) {
        const restored = new ReadStateTracker()
        restored.hydrate(tracker.entriesSnapshot())
        tracker = restored
      } else {
        const token = tracker.completionIds()[id]
        tracker.observeRunning(id, false, now)
        expect(tracker.completionIds()[id]).toBe(token)
      }
      // Private running-only churn must not become an unbounded leak.
      tracker.observeRunning(`baseline-${tick}`, true, now)
      for (const [key, state] of Object.entries(tracker.entriesSnapshot())) {
        if (state.completionId !== undefined && readTokens.has(state.completionId)) expect(state.unread).toBe(false)
        if (deleted.has(key)) expect(state.deleted).toBe(true)
      }
      expect(sizes(tracker).entries).toBeLessThanOrEqual(READ_STATE_ENTRY_LIMIT)
      expect(sizes(tracker).running).toBeLessThanOrEqual(READ_STATE_ENTRY_LIMIT)
    }
    expect(seen.size).toBeGreaterThan(200)
    expect(deleted.size).toBeGreaterThan(20)
  })
})

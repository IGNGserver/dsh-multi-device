/**
 * Host-owned read state. Only this authority's ordered true -> false observations
 * mint completion identities; wall clocks and catalog updatedAt are not cursors.
 * Hydrated legacy unread markers receive a `legacy:`-prefixed compatibility
 * cursor once, not evidence of an observed completion or terminal sequence.
 *
 * UUIDs from independent Hosts have no ordering or shared completion identity.
 * The caller may promote one to a verified common terminal turn/end identity;
 * only then can independent Hosts acknowledge that same execution. Shared
 * replay cannot clear a different token. This is not cross-Host exactly-once.
 */
import { randomUUID } from 'node:crypto'

export interface SessionReadState {
  readonly unread: boolean
  /** Legacy merge/retention timestamp, never a completion identity or ordering. */
  readonly at: number
  readonly completionId?: string
  readonly readCompletionId?: string
  readonly deleted?: true
}

export interface ReadCompletionResult {
  readonly accepted: boolean
  readonly currentCompletionId?: string
  readonly unread: boolean
}

/** The third flag requests snapshot publication (unread or completion identity changed). */
export type ReadStateChangeListener = (
  sessionId: string,
  state: SessionReadState,
  unreadChanged: boolean,
) => void

export const READ_STATE_ENTRY_LIMIT = 2_000
const READ_TOUCH_INTERVAL_MS = 2_000

function cursor(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : undefined
}

/** Validate optional cursors without rejecting legacy version-1 entries. */
export function parseSessionReadState(value: unknown): SessionReadState | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  if (typeof raw.unread !== 'boolean') return undefined
  const at = typeof raw.at === 'number' && Number.isFinite(raw.at)
    ? Math.max(0, Math.trunc(raw.at)) : 0
  const completionId = cursor(raw.completionId)
  const readCompletionId = cursor(raw.readCompletionId)
  const entry: SessionReadState = {
    unread: raw.deleted === true ? false : raw.unread,
    at,
    ...(completionId === undefined ? {} : { completionId }),
    ...(readCompletionId === undefined ? {} : { readCompletionId }),
    ...(raw.deleted === true ? { deleted: true as const } : {}),
  }
  if (completionId !== undefined && (!entry.unread || readCompletionId === completionId)) {
    return { ...entry, unread: false, readCompletionId: completionId }
  }
  return entry
}

/**
 * Local-first cursor merge, shared by the tracker and shared-file projection.
 * A retained tombstone is terminal. Different UUIDs cannot be compared by at.
 * Legacy LWW applies only until a Session acquires a completion cursor.
 */
export function mergeSessionReadState(
  current: SessionReadState | undefined,
  incoming: SessionReadState,
): SessionReadState {
  if (current?.deleted === true) return current
  if (current === undefined) return incoming
  if (current.completionId !== undefined) {
    if (incoming.completionId !== current.completionId) return current
    if (incoming.deleted === true) return incoming
    const read = !current.unread || !incoming.unread ||
      current.readCompletionId === current.completionId ||
      incoming.readCompletionId === current.completionId
    return {
      ...current,
      at: Math.max(current.at, incoming.at),
      unread: !read,
      ...(read ? { readCompletionId: current.completionId } : {}),
    }
  }
  if (incoming.deleted === true || incoming.completionId !== undefined) return incoming
  if (current.at > incoming.at ||
    (current.at === incoming.at && (!current.unread || current.unread === incoming.unread))) return current
  return incoming
}

function equalEntry(left: SessionReadState | undefined, right: SessionReadState): boolean {
  return left !== undefined && left.unread === right.unread && left.at === right.at &&
    left.completionId === right.completionId && left.readCompletionId === right.readCompletionId &&
    left.deleted === right.deleted
}

/**
 * Every retained map is bounded, including running-only baselines and tombstones.
 * Eviction necessarily ends deduplication for that Session; callers must also
 * filter shared replay against an authoritative catalog when one is available.
 */
export class ReadStateTracker {
  private readonly entries = new Map<string, SessionReadState>()
  /** Only true baselines need retention; absent and false are equivalent. */
  private readonly running = new Map<string, true>()

  constructor(private readonly onChange?: ReadStateChangeListener) {}

  /** First false and duplicate false observations never mint a completion. */
  observeRunning(sessionId: string, running: boolean, now = Date.now()): boolean {
    if (sessionId === '' || this.entries.get(sessionId)?.deleted === true) return false
    const previous = this.running.get(sessionId)
    this.running.delete(sessionId)
    if (running) this.running.set(sessionId, true)
    this.trim()
    if (running) return this.isUnread(sessionId) ? this.markRead(sessionId, now) : false
    if (previous !== true) return false
    const old = this.entries.get(sessionId)
    this.setEntry(sessionId, {
      unread: true,
      at: now,
      completionId: randomUUID(),
      ...(old?.readCompletionId === undefined ? {} : { readCompletionId: old.readCompletionId }),
    }, true)
    return true
  }

  /** Optional expected token prevents an old page read from clearing a new run. */
  markRead(sessionId: string, now = Date.now(), expectedCompletionId?: string): boolean {
    if (sessionId === '') return false
    const previous = this.entries.get(sessionId)
    if (previous?.deleted === true) return false
    if (expectedCompletionId !== undefined && previous?.completionId !== expectedCompletionId) return false
    const unreadChanged = previous?.unread === true
    if (previous !== undefined && !previous.unread && now - previous.at < READ_TOUCH_INTERVAL_MS) return false
    this.setEntry(sessionId, {
      ...previous,
      unread: false,
      at: Math.max(previous?.at ?? 0, now),
      ...(previous?.completionId === undefined ? {} : { readCompletionId: previous.completionId }),
    }, unreadChanged)
    return unreadChanged
  }

  /** ACK acceptance is independent of whether an idempotent read changed a dot. */
  readCompletion(sessionId: string, expectedCompletionId: string, now = Date.now()): ReadCompletionResult {
    const state = this.entries.get(sessionId)
    if (state === undefined || state.deleted === true) return { accepted: false, unread: false }
    const accepted = state.completionId !== undefined && state.completionId === expectedCompletionId
    if (accepted) this.markRead(sessionId, now, expectedCompletionId)
    return {
      accepted,
      ...(state.completionId === undefined ? {} : { currentCompletionId: state.completionId }),
      unread: this.isUnread(sessionId),
    }
  }

  /**
   * Rebind this exact finished completion to a caller-verified shared identity.
   * The registry must derive the identity from the same real terminal turn/end,
   * never from updatedAt. A racing run, deletion, or replacement rejects it.
   */
  promoteCompletion(sessionId: string, expectedCompletionId: string, sharedCompletionId: string): boolean {
    const previous = this.entries.get(sessionId)
    if (previous === undefined || previous.deleted === true || this.running.has(sessionId) ||
      previous.completionId === undefined || previous.completionId !== expectedCompletionId ||
      sharedCompletionId === expectedCompletionId || cursor(sharedCompletionId) === undefined) return false
    this.setEntry(sessionId, {
      ...previous,
      completionId: sharedCompletionId,
      ...(previous.readCompletionId === expectedCompletionId ? { readCompletionId: sharedCompletionId } : {}),
    }, true)
    return true
  }

  /**
   * Finish a legacy shared merge batch before publishing to token-aware clients.
   * Keeps low-level legacy LWW until explicitly called; emits one publication
   * for all migrations. Persist the returned ids' new metadata before restart.
   */
  migrateLegacyIds(): string[] {
    const changed: string[] = []
    for (const [sessionId, state] of this.entries) {
      if (!state.unread || state.deleted === true || state.completionId !== undefined) continue
      this.entries.set(sessionId, { ...state, completionId: `legacy:${randomUUID()}` })
      changed.push(sessionId)
    }
    const first = changed[0]
    if (first !== undefined) this.onChange?.(first, this.entries.get(first)!, true)
    return changed
  }

  /** One unread notification/revision, while preserving every per-Session cursor. */
  markManyRead(predicate: (sessionId: string) => boolean, now = Date.now()): string[] {
    const changed: string[] = []
    for (const [sessionId, state] of this.entries) {
      if (!state.unread || !predicate(sessionId)) continue
      this.entries.set(sessionId, {
        ...state,
        unread: false,
        at: Math.max(state.at, now),
        ...(state.completionId === undefined ? {} : { readCompletionId: state.completionId }),
      })
      changed.push(sessionId)
    }
    const first = changed[0]
    if (first !== undefined) this.onChange?.(first, this.entries.get(first)!, true)
    return changed
  }

  mergeEntry(sessionId: string, entry: SessionReadState): boolean {
    if (sessionId === '') return false
    const incoming = parseSessionReadState(entry)
    if (incoming === undefined) return false
    const previous = this.entries.get(sessionId)
    const next = mergeSessionReadState(previous, incoming)
    if (equalEntry(previous, next)) return false
    const unreadChanged = (previous?.unread === true) !== next.unread
    if (next.deleted === true) this.running.delete(sessionId)
    this.setEntry(sessionId, next, unreadChanged)
    return unreadChanged
  }

  /** Legacy/manual API: it cannot reopen an already cursorized completion. */
  markUnread(sessionId: string, now = Date.now()): boolean {
    if (sessionId === '' || this.isUnread(sessionId)) return false
    const previous = this.entries.get(sessionId)
    if (previous?.deleted === true || previous?.completionId !== undefined) return false
    this.setEntry(sessionId, { unread: true, at: now }, true)
    return true
  }

  isUnread(sessionId: string): boolean {
    return this.entries.get(sessionId)?.unread === true
  }

  unreadIds(): string[] {
    return [...this.entries].filter(([, state]) => state.unread).map(([id]) => id).sort()
  }

  /** Includes already-read completions; clients need the identity for read ACKs. */
  completionIds(): Record<string, string> {
    return Object.fromEntries([...this.entries]
      .filter(([, state]) => state.deleted !== true && state.completionId !== undefined)
      .map(([id, state]) => [id, state.completionId!]))
  }

  /** Tombstones and both cursor fields survive persistence and shared replay. */
  entriesSnapshot(): Record<string, SessionReadState> {
    return Object.fromEntries([...this.entries].map(([id, state]) => [id, { ...state }]))
  }

  /**
   * Upgrade legacy unread once so token-aware native pages can acknowledge it.
   * The caller must persist entriesSnapshot after hydration: the `legacy:` UUID
   * is a compatibility read cursor, not a newly observed completion. Already-read
   * legacy entries stay legacy and keep their original LWW behavior.
   */
  hydrate(value: unknown): void {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return
    for (const [sessionId, raw] of Object.entries(value as Record<string, unknown>)) {
      if (sessionId === '') continue
      const entry = parseSessionReadState(raw)
      if (entry !== undefined) {
        const merged = mergeSessionReadState(this.entries.get(sessionId), entry)
        const needsMigration = merged.unread && merged.deleted !== true && merged.completionId === undefined
        const next = needsMigration ? { ...merged, completionId: `legacy:${randomUUID()}` } : merged
        this.entries.set(sessionId, next)
        if (next.deleted === true) this.running.delete(sessionId)
      }
    }
    this.trim()
  }

  /** Keep a terminal tombstone so old shared unread cannot revive this id. */
  remove(sessionId: string, now = Date.now()): void {
    if (sessionId === '') return
    const previous = this.entries.get(sessionId)
    this.running.delete(sessionId)
    if (previous?.deleted === true) return
    const next: SessionReadState = {
      ...previous, unread: false, at: Math.max(previous?.at ?? 0, now), deleted: true,
      ...(previous?.completionId === undefined ? {} : { readCompletionId: previous.completionId }),
    }
    this.entries.set(sessionId, next)
    this.trim()
    // Preserve legacy prune semantics: read-only deletion has no visible change.
    if (previous?.unread === true) this.onChange?.(sessionId, next, true)
  }

  /**
   * Only call with authoritative existence information. Offline/unknown/empty
   * catalogs are NOT evidence of deletion; the registry must guard that boundary.
   */
  prune(predicate: (sessionId: string, state: SessionReadState) => boolean): number {
    let removedUnread = 0
    for (const [sessionId, state] of [...this.entries]) {
      if (state.deleted === true || predicate(sessionId, state)) continue
      if (state.unread) removedUnread += 1
      this.remove(sessionId)
    }
    for (const sessionId of [...this.running.keys()]) {
      if (!predicate(sessionId, this.entries.get(sessionId) ?? { unread: false, at: 0 })) this.remove(sessionId)
    }
    return removedUnread
  }

  /** Config removal is deletion, not permission for stale shared replay. */
  retain(predicate: (sessionId: string) => boolean): void {
    for (const sessionId of new Set([...this.entries.keys(), ...this.running.keys()])) {
      if (!predicate(sessionId)) this.remove(sessionId)
    }
  }

  trim(limit = READ_STATE_ENTRY_LIMIT): void {
    const cap = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : READ_STATE_ENTRY_LIMIT
    if (this.entries.size > cap) {
      const ordered = [...this.entries].sort((left, right) => left[1].at - right[1].at)
      for (const [sessionId] of ordered.slice(0, this.entries.size - cap)) {
        this.entries.delete(sessionId)
        this.running.delete(sessionId)
      }
    }
    while (this.running.size > cap) this.running.delete(this.running.keys().next().value!)
  }

  private setEntry(sessionId: string, state: SessionReadState, unreadChanged: boolean): void {
    this.entries.set(sessionId, state)
    this.trim()
    this.onChange?.(sessionId, state, unreadChanged)
  }
}

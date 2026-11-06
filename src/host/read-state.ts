/**
 * Host-owned remote Session read/unread state.
 *
 * DSH's own `completionUnread` set lives in each browser page's memory, so it
 * cannot answer "was this completion already read on another device?" The
 * registry keeps the authoritative copy here and publishes it in the snapshot;
 * native pages and the aggregated local page then overlay the same set.
 *
 * The tracker is deliberately transport- and UI-agnostic: it only understands
 * Session IDs and running transitions. The registry maps those to namespaced
 * remote IDs, persists them, and forwards changes to the native bridge.
 *
 * @module dsh-multi-device/host/read-state
 */

/** One Session's last read/unread transition. */
export interface SessionReadState {
  readonly unread: boolean
  /** Epoch ms of the last transition; used to merge Hosts deterministically. */
  readonly at: number
}

/** Called after a state transition; `unreadChanged` is false for a plain read touch. */
export type ReadStateChangeListener = (
  sessionId: string,
  state: SessionReadState,
  unreadChanged: boolean,
) => void

/** Upper bound for remembered Session entries in one Host. */
export const READ_STATE_ENTRY_LIMIT = 2_000

/** Minimum interval between redundant "already read" timestamp touches. */
const READ_TOUCH_INTERVAL_MS = 2_000

/**
 * Tracks running transitions and read marks for namespaced remote Sessions.
 *
 * The tracker intentionally does not decide whether a Session is currently
 * visible; the registry and clients clear the set when a Session becomes the
 * main view. A completion that is already being watched is therefore cleared
 * on the next client snapshot, matching DSH's "main Session is read" rule.
 */
export class ReadStateTracker {
  private readonly entries = new Map<string, SessionReadState>()
  private readonly running = new Map<string, boolean>()

  constructor(private readonly onChange?: ReadStateChangeListener) {}

  /**
   * Observe one authoritative running-status transition.
   *
   * Only a real `true -> false` transition creates unread state. A first
   * `false` (for example a catalog row that was already finished at startup)
   * must not manufacture an unread reminder.
   */
  observeRunning(sessionId: string, running: boolean, now = Date.now()): boolean {
    if (sessionId === '') return false
    const previous = this.running.get(sessionId)
    this.running.set(sessionId, running)
    if (running) {
      if (this.isUnread(sessionId)) {
        this.markRead(sessionId, now)
        return true
      }
      return false
    }
    if (previous === true && !this.isUnread(sessionId)) {
      this.setEntry(sessionId, { unread: true, at: now }, true)
      return true
    }
    return false
  }

  /** Mark a Session read; returns true when an unread marker was removed. */
  markRead(sessionId: string, now = Date.now()): boolean {
    if (sessionId === '') return false
    const previous = this.entries.get(sessionId)
    const unreadChanged = previous?.unread === true
    if (
      previous !== undefined &&
      previous.unread === false &&
      now - previous.at < READ_TOUCH_INTERVAL_MS
    ) {
      return false
    }
    this.setEntry(sessionId, { unread: false, at: now }, unreadChanged)
    return unreadChanged
  }

  /**
   * Merge one entry from another Host's shared file. The newest timestamp wins;
   * a read at the same instant wins over unread so a cleared dot cannot come
   * back merely because two Hosts replayed the same completion.
   */
  mergeEntry(sessionId: string, entry: SessionReadState): boolean {
    if (sessionId === '') return false
    const previous = this.entries.get(sessionId)
    if (
      previous !== undefined &&
      (previous.at > entry.at ||
        (previous.at === entry.at && (previous.unread === entry.unread || !previous.unread)))
    ) {
      return false
    }
    const next: SessionReadState = {
      unread: entry.unread,
      at: Math.max(0, Math.trunc(entry.at)),
    }
    const unreadChanged = (previous?.unread === true) !== next.unread
    this.entries.set(sessionId, next)
    this.trim()
    this.onChange?.(sessionId, next, unreadChanged)
    return unreadChanged
  }

  /** Mark a Session unread; returns true when it was not already unread. */
  markUnread(sessionId: string, now = Date.now()): boolean {
    if (sessionId === '') return false
    if (this.isUnread(sessionId)) return false
    this.setEntry(sessionId, { unread: true, at: now }, true)
    return true
  }

  isUnread(sessionId: string): boolean {
    return this.entries.get(sessionId)?.unread === true
  }

  /** Sorted read state for the snapshot; deterministic for clients and tests. */
  unreadIds(): string[] {
    const ids: string[] = []
    for (const [sessionId, state] of this.entries) {
      if (state.unread) ids.push(sessionId)
    }
    return ids.sort()
  }

  /** Serializable durable representation. */
  entriesSnapshot(): Record<string, SessionReadState> {
    const out: Record<string, SessionReadState> = {}
    for (const [sessionId, state] of this.entries) {
      out[sessionId] = { unread: state.unread, at: state.at }
    }
    return out
  }

  /**
   * Restore durable state. Invalid entries are ignored instead of crashing a
   * Host restart, and the result is capped like a live set.
   */
  hydrate(value: unknown): void {
    if (typeof value !== 'object' || value === null) return
    for (const [sessionId, raw] of Object.entries(value as Record<string, unknown>)) {
      if (sessionId === '' || typeof raw !== 'object' || raw === null) continue
      const entry = raw as { unread?: unknown; at?: unknown }
      if (typeof entry.unread !== 'boolean') continue
      const at = typeof entry.at === 'number' && Number.isFinite(entry.at)
        ? Math.max(0, Math.trunc(entry.at))
        : 0
      this.entries.set(sessionId, { unread: entry.unread, at })
    }
    this.trim()
  }

  remove(sessionId: string): void {
    const existed = this.entries.delete(sessionId)
    this.running.delete(sessionId)
    if (existed) this.onChange?.(sessionId, { unread: false, at: Date.now() }, true)
  }

  /** Drop entries whose Session no longer belongs to a configured device. */
  retain(predicate: (sessionId: string) => boolean): void {
    for (const sessionId of [...this.entries.keys()]) {
      if (!predicate(sessionId)) {
        this.entries.delete(sessionId)
        this.running.delete(sessionId)
      }
    }
  }

  /** Keep the most recently touched entries bounded. */
  trim(limit = READ_STATE_ENTRY_LIMIT): void {
    if (this.entries.size <= limit) return
    const ordered = [...this.entries.entries()].sort((left, right) => left[1].at - right[1].at)
    const drop = this.entries.size - Math.max(0, limit)
    for (let index = 0; index < drop; index += 1) {
      const entry = ordered[index]
      if (entry !== undefined) {
        this.entries.delete(entry[0])
        this.running.delete(entry[0])
      }
    }
  }

  private setEntry(sessionId: string, state: SessionReadState, unreadChanged: boolean): void {
    this.entries.set(sessionId, state)
    this.trim()
    this.onChange?.(sessionId, state, unreadChanged)
  }
}

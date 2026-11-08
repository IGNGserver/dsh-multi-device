/**
 * Host-owned unread overlay for the local DSH shell.
 *
 * DSH's `uiSession.sessionStatus` is the single hook the workspace browser,
 * search results and hover cards read. The overlay wraps that source in place
 * and replaces `completionUnread` for Session IDs with the Host-owned set
 * (local and remote alike; the Host tracks both). Patching the methods on the
 * existing source object (instead of replacing the service field) matters:
 * `uiSession` registers the source in the slot root once, and every consumer
 * already holds that object reference. DSH 0.2.x has no public root-source
 * replacement API: provideRoot rejects duplicate names. The isolated adapter
 * below bridges pre-existing subscriptions via the real UiSession listener set;
 * it is deliberately private-version compatibility, not a fake source API.
 *
 * @module dsh-multi-device/client/readState
 */

export interface SessionStatusValue {
  readonly running?: boolean
  readonly pendingInteraction?: unknown
  readonly completionUnread?: boolean
}

export type SessionStatusMap = ReadonlyMap<string, SessionStatusValue>

export interface SessionStatusSource {
  getSnapshot(): SessionStatusMap
  subscribe(listener: () => void): () => void
}

export interface ReadStateOverlayOptions {
  /** The local `uiSession.sessionStatus` source, when the shell provides it. */
  readonly source: SessionStatusSource | undefined
  /** Current unread Session IDs, or undefined before the first Host snapshot. */
  readonly getUnread: () => ReadonlySet<string> | undefined
  /** Subscribe to Host snapshot changes so the overlay invalidates its cache. */
  readonly subscribeReadState: (listener: () => void) => () => void
  /** Whether the Host owns this Session's read state (local and remote). */
  readonly shouldOverride: (sessionId: string) => boolean
  /** DSH 0.2.x compatibility bridge; receives new listeners to dedupe delivery. */
  readonly notifyExistingSubscribers?: (alreadyNotified: ReadonlySet<() => void>) => void
}

/**
 * Verified against DSH 0.2.x UiSession lib/types: no public notify/replaceRoot
 * operation exists. Do not synthesize pending interactions or poll to wake UI.
 * This adapter alone touches the JS-public / TS-private statusListeners field.
 * Unsupported versions keep cold-start/new subscriptions working and explicitly
 * warn that hot activation requires a page reload rather than pretending success.
 */
export function existingSessionStatusNotifier(service: unknown): ReadStateOverlayOptions['notifyExistingSubscribers'] {
  const listeners = (service as { statusListeners?: unknown } | undefined)?.statusListeners
  if (!(listeners instanceof Set) || [...listeners].some(listener => typeof listener !== 'function')) {
    console.warn('[dsh-multi-device] DSH session-status notification bridge unavailable; reload the page to enable the unread overlay for existing views.')
    return undefined
  }
  return alreadyNotified => {
    for (const listener of [...listeners]) {
      if (typeof listener !== 'function' || alreadyNotified.has(listener)) continue
      try { listener() } catch { /* isolate subscribers, like the official publisher */ }
    }
  }
}

/**
 * Merge the Host unread set into a DSH status snapshot.
 *
 * Entries whose `completionUnread` already matches keep their original object
 * identity, which keeps row memoization cheap. Local Sessions are copied
 * through untouched.
 */
export function mergeSessionStatus(
  base: SessionStatusMap | undefined,
  unread: ReadonlySet<string> | undefined,
  shouldOverride: (sessionId: string) => boolean,
): Map<string, SessionStatusValue> {
  const next = new Map<string, SessionStatusValue>()
  if (base === undefined) return next
  if (unread === undefined) {
    for (const [sessionId, value] of base) next.set(sessionId, value)
    return next
  }
  for (const [sessionId, value] of base) {
    if (!shouldOverride(sessionId)) {
      next.set(sessionId, value)
      continue
    }
    const shouldBeUnread = unread.has(sessionId)
    if (value.completionUnread === shouldBeUnread) {
      next.set(sessionId, value)
    } else {
      next.set(sessionId, { ...value, completionUnread: shouldBeUnread })
    }
  }
  return next
}

function sameStatusMap(left: SessionStatusMap, right: SessionStatusMap): boolean {
  if (left === right) return true
  if (left.size !== right.size) return false
  for (const [sessionId, value] of left) {
    const candidate = right.get(sessionId)
    if (
      candidate === undefined ||
      candidate.running !== value.running ||
      candidate.pendingInteraction !== value.pendingInteraction ||
      candidate.completionUnread !== value.completionUnread
    ) {
      return false
    }
  }
  return true
}

/**
 * Install the overlay. Returns an idempotent disposer that restores the
 * original source methods, so plugin reload/HMR never stacks wrappers.
 */
export function installReadStateOverlay(options: ReadStateOverlayOptions): () => void {
  const source = options.source
  if (source === undefined) return () => {}

  const originalGet = source.getSnapshot
  const originalSubscribe = source.subscribe
  if (typeof originalGet !== 'function' || typeof originalSubscribe !== 'function') {
    return () => {}
  }

  const listeners = new Set<() => void>()
  let cache: Map<string, SessionStatusValue> | undefined
  let disposed = false

  const invalidate = (): void => {
    cache = undefined
    const notified = new Set(listeners)
    for (const listener of notified) {
      try { listener() } catch { /* a subscriber must not break the overlay */ }
    }
    options.notifyExistingSubscribers?.(notified)
  }

  source.getSnapshot = (): SessionStatusMap => {
    const next = mergeSessionStatus(
      originalGet.call(source),
      options.getUnread(),
      options.shouldOverride,
    )
    if (cache !== undefined && sameStatusMap(cache, next)) return cache
    cache = next
    return cache
  }

  source.subscribe = (listener: () => void): (() => void) => {
    const offBase = originalSubscribe.call(source, listener)
    listeners.add(listener)
    return () => {
      try { offBase() } catch { /* base source teardown is best-effort */ }
      listeners.delete(listener)
    }
  }

  const offReadState = options.subscribeReadState(invalidate)
  invalidate()

  return () => {
    if (disposed) return
    disposed = true
    try { offReadState() } catch { /* ignore */ }
    source.getSnapshot = originalGet
    source.subscribe = originalSubscribe
    invalidate()
    listeners.clear()
  }
}

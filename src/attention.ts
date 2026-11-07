/** Pure, shared attention projection. No runtime or Node dependencies. */
export interface SessionAttentionFact {
  readonly sessionId: string
  readonly deviceId: string
  readonly running: boolean
  readonly blank?: boolean
  readonly origin?: string
  readonly archived?: boolean
  readonly pendingInteractionKind?: string
  readonly pendingRequestCount?: number
  readonly runningSubagentCount?: number
}

export interface DeviceAttentionView {
  readonly eligibleSessionIds: string[]
  readonly runningSessionIds: string[]
  readonly pendingSessionIds: string[]
  readonly unreadSessionIds: string[]
  readonly pendingRequestCount: number
  /** False means retained/partial data, not an authoritative zero. */
  readonly fresh: boolean
}

export interface AttentionPolicy {
  readonly currentSessionId?: string
  readonly fresh?: boolean
}

export function emptyDeviceAttention(fresh = true): DeviceAttentionView {
  return {
    eligibleSessionIds: [], runningSessionIds: [], pendingSessionIds: [],
    unreadSessionIds: [], pendingRequestCount: 0, fresh,
  }
}

function count(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

/**
 * Merge duplicate catalog facts before classifying. Never truncate to a visible
 * sidebar page. `parentSessionId` deliberately plays no role: forks are roots
 * for attention purposes; only explicit subagent origin excludes a row.
 * Pending > running (including running children) > unread, exclusively.
 */
export function selectDeviceAttention(
  facts: readonly SessionAttentionFact[],
  unread: ReadonlySet<string>,
  policy: AttentionPolicy = {},
): Record<string, DeviceAttentionView> {
  const devices = new Map<string, Map<string, {
    hidden: boolean; blank: boolean; running: boolean; pending: number
  }>>()
  for (const fact of facts) {
    let sessions = devices.get(fact.deviceId)
    if (sessions === undefined) devices.set(fact.deviceId, sessions = new Map())
    const previous = sessions.get(fact.sessionId)
    const pending = Math.max(count(fact.pendingRequestCount), fact.pendingInteractionKind ? 1 : 0)
    sessions.set(fact.sessionId, {
      hidden: previous?.hidden === true || fact.archived === true || fact.origin === 'subagent',
      blank: (previous?.blank ?? true) && fact.blank === true,
      running: previous?.running === true || fact.running || count(fact.runningSubagentCount) > 0,
      pending: Math.max(previous?.pending ?? 0, pending),
    })
  }
  return Object.fromEntries([...devices.keys()].sort().map(deviceId => {
    const eligibleSessionIds: string[] = []
    const runningSessionIds: string[] = []
    const pendingSessionIds: string[] = []
    const unreadSessionIds: string[] = []
    let pendingRequestCount = 0
    for (const [sessionId, fact] of [...devices.get(deviceId)!].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      if (fact.hidden || (fact.blank && sessionId !== policy.currentSessionId)) continue
      eligibleSessionIds.push(sessionId)
      if (fact.pending > 0) {
        pendingSessionIds.push(sessionId)
        pendingRequestCount += fact.pending
      } else if (fact.running) runningSessionIds.push(sessionId)
      else if (unread.has(sessionId)) unreadSessionIds.push(sessionId)
    }
    return [deviceId, {
      eligibleSessionIds, runningSessionIds, pendingSessionIds, unreadSessionIds,
      pendingRequestCount, fresh: policy.fresh !== false,
    }]
  }))
}

/** All UI unread surfaces consume this exact union when the Host supplies it. */
export function attentionUnreadIds(byDevice: Readonly<Record<string, DeviceAttentionView>>): Set<string> {
  return new Set(Object.values(byDevice).flatMap(view => view.unreadSessionIds))
}

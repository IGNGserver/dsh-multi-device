/**
 * Unread counters for the device tab strip and the Settings device list.
 *
 * The Host publishes the raw read model in `unreadSessionIds`; it also names
 * the two Session classes DSH never renders as standalone sidebar rows
 * (archived and subagent-origin). Every counter therefore starts from
 * {@link countableUnreadIds} and never from the raw list, so a badge cannot
 * claim a reminder the sidebar is unable to show.
 *
 * Counts are pure projections: the Host owns read state and re-publishes the
 * snapshot on every change, so the UI recomputes instead of caching.
 *
 * @module dsh-multi-device/client/unreadCounts
 */
import { decodeSessionId, type DeviceId } from '../contract.ts'

/**
 * Drop unread Sessions DSH hides: archived rows (default collapsed) and
 * subagent children (nested under their parent's catalog).
 *
 * Missing Host fields (an older Host) mean "none hidden", which keeps the
 * counters working while the plugin is upgraded on only one side.
 *
 * @param existsRemoteSession - optional catalog membership check for remote
 *   IDs. A deleted Session that still sits in a persisted read set can never be
 *   opened again, so counting it would pin the badge; local IDs are owned by
 *   the Host's own DSH instance and are not checked here.
 */
export function countableUnreadIds(
  unreadSessionIds: readonly string[],
  archivedSessionIds?: readonly string[],
  subagentSessionIds?: readonly string[],
  existsRemoteSession?: (sessionId: string) => boolean,
): Set<string> {
  const hidden = new Set<string>()
  for (const sessionId of archivedSessionIds ?? []) hidden.add(sessionId)
  for (const sessionId of subagentSessionIds ?? []) hidden.add(sessionId)
  const unread = new Set<string>()
  for (const sessionId of unreadSessionIds) {
    if (hidden.has(sessionId)) continue
    if (existsRemoteSession !== undefined && decodeSessionId(sessionId).isRemote) {
      if (!existsRemoteSession(sessionId)) continue
    }
    unread.add(sessionId)
  }
  return unread
}

export const EMPTY_UNREAD_SESSION_IDS: readonly string[] = []

/** Decode every unread ID once per snapshot instead of once per rendered device tab. */
export function groupUnreadSessionIds(unread: ReadonlySet<string>): ReadonlyMap<DeviceId, readonly string[]> {
  const grouped = new Map<DeviceId, string[]>()
  for (const sessionId of unread) {
    const deviceId = decodeSessionId(sessionId).deviceId
    const ids = grouped.get(deviceId) ?? []
    ids.push(sessionId)
    grouped.set(deviceId, ids)
  }
  return grouped
}

/**
 * Count unread Sessions owned by one device.
 *
 * Local Sessions decode to `LOCAL_DEVICE_ID`, so the same helper serves the
 * leftmost 本机 tab and every remote tab. Unread snapshots are small and the
 * tab strip renders once per change; a linear scan keeps this dependency-free.
 */
export function unreadCountForDevice(unread: ReadonlySet<string>, deviceId: DeviceId): number {
  if (unread.size === 0) return 0
  let count = 0
  for (const sessionId of unread) {
    if (decodeSessionId(sessionId).deviceId === deviceId) count += 1
  }
  return count
}

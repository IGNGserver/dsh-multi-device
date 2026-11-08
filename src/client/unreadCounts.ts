/**
 * Unread counters for Native Mode tabs, Aggregated Mode workspace rows, and
 * the Settings device list.
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
import {
  decodeSessionId,
  type DeviceId,
  type LogicalWorkspaceView,
} from '../contract.ts'

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

/** Count unread Sessions among one logical workspace's merged Session IDs. */
export function unreadCountInSessions(
  unread: ReadonlySet<string>,
  sessionIds: readonly string[],
): number {
  if (unread.size === 0) return 0
  let count = 0
  for (const sessionId of sessionIds) {
    if (unread.has(sessionId)) count += 1
  }
  return count
}

/**
 * Normalize a Workspace directory the way DSH's sidebar does: Windows drive
 * and UNC paths compare with forward slashes, and trailing separators never
 * decide nesting. Matching stays case-sensitive, mirroring Workspace identity.
 */
function folderPath(path: string): string {
  const slashed = /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\')
    ? path.replaceAll('\\', '/')
    : path
  return slashed.replace(/\/+$/, '')
}

/**
 * Nearest registered Workspace directory strictly containing `path`.
 *
 * Mirrors DSH's `owningParentFolder`, which drives the sidebar's
 * `workspace-tree` grouping: the longest matching registered ancestor wins, so
 * intermediate directories that are not Workspaces never become parents.
 */
function owningParentFolder(path: string, parents: ReadonlyMap<string, string>): string | undefined {
  const child = folderPath(path)
  let owner: string | undefined
  // Every strict directory ancestor ends immediately before a slash. Looking
  // up those prefixes avoids comparing every Workspace with every other one.
  for (let index = child.indexOf('/'); index >= 0; index = child.indexOf('/', index + 1)) {
    const parent = parents.get(child.slice(0, index))
    if (parent !== undefined) owner = parent
  }
  return owner
}

/**
 * Per-logical-workspace unread counts, rolled up through nested Workspaces.
 *
 * A row shows its own unread Sessions plus every descendant Workspace's, so a
 * parent row stays truthful when the sidebar nests children under it. The
 * ancestor chain uses the same path semantics as DSH (nearest registered
 * parent, Windows separators normalized), and the merged row's effective
 * target path is the one DSH projects into the sidebar.
 *
 * @param workspaces - every logical workspace in the current snapshot.
 * @param unread - already filtered unread Session IDs (see {@link countableUnreadIds}).
 * @returns unread total keyed by logical workspace ID; absent means zero.
 */
export function workspaceUnreadCounts(
  workspaces: readonly LogicalWorkspaceView[],
  unread: ReadonlySet<string>,
): Map<string, number> {
  const counts = new Map<string, number>()
  if (workspaces.length === 0 || unread.size === 0) return counts

  const pathOf = (workspace: LogicalWorkspaceView): string =>
    workspace.effectiveTargetPath ?? workspace.targetPath

  const own = new Map<string, number>()
  const idByPath = new Map<string, string>()
  const parentByFolder = new Map<string, string>()
  for (const workspace of workspaces) {
    const path = pathOf(workspace)
    parentByFolder.set(folderPath(path), path)
    // DSH builds its own path map with `Map`, so a duplicate path resolves to
    // the last Workspace; mirroring that keeps ancestor chains identical.
    idByPath.set(path, workspace.logicalWorkspaceId)
    const count = unreadCountInSessions(unread, workspace.sessionIds)
    if (count > 0) own.set(workspace.logicalWorkspaceId, count)
  }
  if (own.size === 0) return counts

  const parentOf = new Map<string, string>()
  for (const workspace of workspaces) {
    const parentPath = owningParentFolder(pathOf(workspace), parentByFolder)
    const parentId = parentPath === undefined ? undefined : idByPath.get(parentPath)
    if (parentId !== undefined) parentOf.set(workspace.logicalWorkspaceId, parentId)
  }

  for (const [workspaceId, count] of own) {
    let current: string | undefined = workspaceId
    const seen = new Set<string>()
    while (current !== undefined && !seen.has(current)) {
      seen.add(current)
      counts.set(current, (counts.get(current) ?? 0) + count)
      current = parentOf.get(current)
    }
  }
  return counts
}

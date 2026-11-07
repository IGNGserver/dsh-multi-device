import {
  decodeSessionId,
  LOCAL_DEVICE_ID,
  type AggregatedSessionRow,
  type DeviceId,
  type LogicalWorkspaceView,
  type MultiDeviceSnapshot,
} from '../contract.ts'
import type { SessionsListSnapshotLike, SessionSummaryLike } from './clientServices.ts'

/** Only this adapter knows the extra public fields on official DSH summaries. */
export interface SidebarLocalSummary extends SessionSummaryLike {
  readonly title?: string
  readonly updatedAt?: number
  readonly running?: boolean
  readonly parentSessionId?: string
  readonly origin?: 'subagent'
}
export type ArchiveFilter = 'active' | 'archived' | 'all'
export interface SidebarSessionNode {
  readonly row: AggregatedSessionRow
  readonly children: readonly SidebarSessionNode[]
}
export interface SidebarWorkspaceGroup {
  readonly id: string
  readonly title: string
  readonly workspace?: LogicalWorkspaceView
  readonly sessions: readonly SidebarSessionNode[]
  readonly matchingCount: number
}
export interface AggregatedSidebarModel {
  readonly rows: Readonly<Record<string, AggregatedSessionRow>>
  readonly groups: readonly SidebarWorkspaceGroup[]
  readonly pinned: readonly AggregatedSessionRow[]
  readonly visibleCount: number
}
export interface SidebarModelOptions {
  readonly query?: string
  readonly archive?: ArchiveFilter
  /** Explicit remote-content search results, unioned with title matches. */
  readonly contentSessionIds?: readonly string[]
  readonly local?: SessionsListSnapshotLike
}

function localTitle(summary: SidebarLocalSummary, fallback: string): string {
  if (typeof summary.title === 'string' && summary.title.trim()) return summary.title.trim()
  const values = summary.projectionValues
  for (const key of ['title', 'sessionTitle']) {
    const value = values?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (value && typeof value === 'object' && 'title' in value) {
      const title = (value as { title?: unknown }).title
      if (typeof title === 'string' && title.trim()) return title.trim()
    }
  }
  return fallback
}

function missingRow(id: string): AggregatedSessionRow {
  const owner = decodeSessionId(id)
  return { id, rawSessionId: owner.rawSessionId, deviceId: owner.deviceId, title: owner.rawSessionId,
    updatedAt: 0, running: false, blank: false, stale: true, missing: true }
}

/** Navigation-only directory: remote rows never depend on the local Controller. */
export function buildAggregatedSidebarModel(
  snapshot: Pick<MultiDeviceSnapshot, 'catalog' | 'logicalWorkspaces' | 'archivedSessionIds'>,
  options: SidebarModelOptions = {},
): AggregatedSidebarModel {
  const rows: Record<string, AggregatedSessionRow> = { ...snapshot.catalog?.sessions }
  for (const id of options.local?.ids ?? []) {
    // A legacy merged store may contain remote mirrors. They are NOT input.
    if (decodeSessionId(id).isRemote) continue
    const summary = options.local?.byId[id] as SidebarLocalSummary | undefined
    if (summary === undefined) continue
    const previous = rows[id]
    const base = previous ?? missingRow(id)
    rows[id] = { ...base, deviceId: LOCAL_DEVICE_ID, rawSessionId: id,
      title: localTitle(summary, previous?.title ?? id),
      updatedAt: summary.updatedAt ?? base.updatedAt,
      running: summary.running ?? base.running, blank: summary.blank ?? base.blank,
      cwd: summary.cwd ?? base.cwd, parentSessionId: summary.parentSessionId ?? base.parentSessionId,
      origin: summary.origin ?? base.origin, stale: false, missing: false }
  }
  const pinnedIds = [...new Set(snapshot.catalog?.pinnedSessionIds ?? [])]
  for (const workspace of snapshot.logicalWorkspaces) {
    for (const id of workspace.sessionIds) rows[id] ??= missingRow(id)
  }
  for (const id of pinnedIds) rows[id] ??= missingRow(id)

  const archived = new Set(snapshot.archivedSessionIds ?? [])
  const archive = options.archive ?? 'active'
  const query = (options.query ?? '').trim().toLocaleLowerCase()
  const contentIds = new Set(options.contentSessionIds ?? [])
  const matches = (row: AggregatedSessionRow): boolean =>
    (archive === 'all' || archived.has(row.id) === (archive === 'archived')) &&
    (query === '' || row.title.toLocaleLowerCase().includes(query) || contentIds.has(row.id))
  const sorted = (ids: readonly string[]): string[] => [...new Set(ids)].sort((a, b) =>
    (rows[b]?.updatedAt ?? 0) - (rows[a]?.updatedAt ?? 0) || a.localeCompare(b))

  const claimed = new Set<string>()
  const buckets: { id: string; title: string; workspace?: LogicalWorkspaceView; ids: string[] }[] = []
  for (const workspace of snapshot.logicalWorkspaces) {
    const ids = [...workspace.sessionIds]
    // A local summary may precede the next Host directory snapshot.
    for (const localId of options.local?.ids ?? []) {
      const row = rows[localId]
      if (row?.deviceId === LOCAL_DEVICE_ID && row.cwd !== undefined && workspace.members.some(member =>
        member.deviceId === LOCAL_DEVICE_ID && member.path === row.cwd)) ids.push(row.id)
    }
    const unique = ids.filter(id => !claimed.has(id) && (claimed.add(id), true))
    buckets.push({ id: workspace.logicalWorkspaceId, title: workspace.title, workspace, ids: unique })
  }
  const otherIds = Object.keys(rows).filter(id => !claimed.has(id))
  if (otherIds.length) buckets.push({ id: 'unassigned', title: '', ids: otherIds })

  const groups: SidebarWorkspaceGroup[] = []
  let visibleCount = 0
  for (const bucket of buckets) {
    const ids = sorted(bucket.ids)
    const idSet = new Set(ids)
    const parentById = new Map<string, string>()
    for (const id of ids) {
      const row = rows[id]!
      let parent = row.parentSessionId
      // Resolve raw parent ids only within the same owning device.
      if (parent && !idSet.has(parent)) parent = ids.find(candidate =>
        rows[candidate]?.deviceId === row.deviceId && rows[candidate]?.rawSessionId === parent)
      if (!parent || parent === id || !idSet.has(parent) || rows[parent]?.deviceId !== row.deviceId) continue
      let ancestor: string | undefined = parent
      const visited = new Set([id])
      while (ancestor && !visited.has(ancestor)) { visited.add(ancestor); ancestor = parentById.get(ancestor) }
      if (ancestor === undefined) parentById.set(id, parent)
    }
    const children = new Map<string, string[]>()
    for (const [id, parent] of parentById) children.set(parent, [...children.get(parent) ?? [], id])
    let matchingCount = 0
    const node = (id: string): SidebarSessionNode | undefined => {
      const nested = (children.get(id) ?? []).map(node).filter((value): value is SidebarSessionNode => value !== undefined)
      const row = rows[id]!
      const match = matches(row)
      if (match) matchingCount++
      return match || nested.length > 0 ? { row, children: nested } : undefined
    }
    const roots = ids.filter(id => !parentById.has(id)).map(node).filter((value): value is SidebarSessionNode => value !== undefined)
    // Keep matching children without leaking archived parents into active view.
    const promote = (nodes: readonly SidebarSessionNode[]): SidebarSessionNode[] => nodes.flatMap(item =>
      archive !== 'all' && archived.has(item.row.id) !== (archive === 'archived')
        ? promote(item.children) : [{ ...item, children: promote(item.children) }])
    visibleCount += matchingCount
    if (query === '' || matchingCount > 0) groups.push({ id: bucket.id, title: bucket.title, workspace: bucket.workspace,
      sessions: promote(roots), matchingCount })
  }
  return { rows, groups, pinned: pinnedIds.map(id => rows[id]!).filter(matches), visibleCount }
}

export interface SidebarDeviceChoice { readonly id: DeviceId; readonly name: string; readonly online: boolean }
export function sidebarDeviceChoices(snapshot: Pick<MultiDeviceSnapshot, 'devices'>, localName: string): SidebarDeviceChoice[] {
  return [{ id: LOCAL_DEVICE_ID, name: localName, online: true }, ...snapshot.devices.map(device => ({
    id: device.id, name: device.name, online: device.enabled && device.state === 'connected',
  }))]
}

/** Deterministic tree movement, shared with keyboard tests (does not wrap). */
export function sidebarFocusKey(keys: readonly string[], current: string | undefined, key: string): string | undefined {
  if (keys.length === 0) return undefined
  if (key === 'Home') return keys[0]
  if (key === 'End') return keys.at(-1)
  const index = current === undefined ? -1 : keys.indexOf(current)
  if (key === 'ArrowDown') return keys[Math.min(index + 1, keys.length - 1)]
  if (key === 'ArrowUp') return keys[Math.max(index - 1, 0)]
  return current
}

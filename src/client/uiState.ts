/**
 * Same-Host sidebar view-state sync.
 *
 * DSH persists `groupExpansion`/`groupBy`/`orderBy`/`archivedFilter` in
 * localStorage, so two browsers attached to one Host diverge even though the
 * Host owns everything else. This entry wraps the public `uiWorkspace.view`
 * actions, reports every user change to the Host, and applies the Host's
 * snapshot back through the same actions. Remote device pages use the injected
 * bridge for the same fields, so a remote tree is not treated as a local one.
 *
 * No DOM mutation and no private store handle: only actions DSH already
 * exposes. A missing `view` (older DSH) makes the whole entry inert.
 *
 * @module dsh-multi-device/client/uiState
 */
import {
  sanitizeWorkspaceViewState,
  type WorkspaceViewState,
} from '../contract.ts'
import type { UiWorkspaceServiceLike, WorkspaceViewActionsLike } from './clientServices.ts'

const PERSIST_PREFIX = 'dsh.workspace.view.'

function readPersistedView(): WorkspaceViewState | undefined {
  if (typeof localStorage === 'undefined') return undefined
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key !== null && key.startsWith(PERSIST_PREFIX)) keys.push(key)
    }
    keys.sort().reverse()
    for (const key of keys) {
      const raw = localStorage.getItem(key)
      if (raw === null) continue
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue
      const record = parsed as Record<string, unknown>
      const groups: Record<string, boolean> = {}
      if (typeof record.groupExpansion === 'object' && record.groupExpansion !== null && !Array.isArray(record.groupExpansion)) {
        for (const [groupKey, expanded] of Object.entries(record.groupExpansion as Record<string, unknown>)) {
          if (typeof expanded === 'boolean') groups[groupKey] = expanded
        }
      }
      const state = sanitizeWorkspaceViewState({
        groups,
        groupBy: record.groupBy,
        orderBy: record.orderBy,
        archivedFilter: record.archivedFilter,
      })
      return state
    }
  } catch {
    // Private mode / corrupt value: the Host snapshot still wins.
  }
  return undefined
}

function currentOrders(): Record<string, readonly string[]> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem('dsh.workspace.view.v5')
    if (raw === null) return {}
    const parsed = JSON.parse(raw) as { sessionOrderByAccount?: unknown }
    const orders = parsed.sessionOrderByAccount
    if (typeof orders !== 'object' || orders === null || Array.isArray(orders)) return {}
    const out: Record<string, readonly string[]> = {}
    for (const [key, value] of Object.entries(orders as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
        out[key] = value.slice(0, 5_000)
      }
    }
    return out
  } catch {
    return {}
  }
}

export interface LocalUiStateSyncOptions {
  readonly uiWorkspace?: UiWorkspaceServiceLike
  /** Current Host-owned state; undefined before the first Host snapshot. */
  readonly getHostState: () => WorkspaceViewState | undefined
  /** Subscribe to Host snapshots. */
  readonly subscribeHostState: (listener: () => void) => () => void
  /** Publish one browser report to the Host. */
  readonly report: (state: WorkspaceViewState) => void
}

/** Install the local view-state bridge; idempotent per page. */
export function installLocalUiStateSync(options: LocalUiStateSyncOptions): () => void {
  const view = options.uiWorkspace?.view
  if (view === undefined || typeof view.setGroupExpanded !== 'function') return () => {}
  const marker = '__dshMdLocalUiStateSync'
  const marked = view as WorkspaceViewActionsLike & { [marker]?: boolean }
  if (marked[marker] === true) return () => {}
  marked[marker] = true

  const originals = {
    setGroupExpanded: view.setGroupExpanded,
    retainAccountKeys: view.retainAccountKeys,
    setGroupBy: view.setGroupBy,
    setOrderBy: view.setOrderBy,
    setArchivedFilter: view.setArchivedFilter,
  }
  let state = readPersistedView() ?? { groups: {} }
  let applying = false
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const publish = (): void => {
    if (disposed || applying) return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      if (!disposed && !applying) options.report(state)
    }, 180)
  }

  const setGroup = (key: string, expanded: boolean): void => {
    if (state.groups[key] === expanded) return
    state = { ...state, groups: { ...state.groups, [key]: expanded } }
    publish()
  }

  const apply = (remote: WorkspaceViewState | undefined): void => {
    if (remote === undefined || disposed) return
    const remoteKeys = new Set(Object.keys(remote.groups))
    const localOnly = Object.keys(state.groups).some(key => !remoteKeys.has(key))
    applying = true
    try {
      for (const [key, expanded] of Object.entries(remote.groups)) {
        if (state.groups[key] === expanded) continue
        try { originals.setGroupExpanded?.call(view, key, expanded) } catch { /* incompatible action */ }
      }
      if (remote.groupBy !== undefined && remote.groupBy !== state.groupBy) {
        try { originals.setGroupBy?.call(view, remote.groupBy) } catch { /* incompatible action */ }
      }
      if (remote.orderBy !== undefined && remote.orderBy !== state.orderBy) {
        try { originals.setOrderBy?.call(view, remote.orderBy, currentOrders()) } catch { /* incompatible action */ }
      }
      if (remote.archivedFilter !== undefined && remote.archivedFilter !== state.archivedFilter) {
        try { originals.setArchivedFilter?.call(view, remote.archivedFilter) } catch { /* incompatible action */ }
      }
      state = {
        groups: { ...state.groups, ...remote.groups },
        ...(remote.groupBy === undefined ? (state.groupBy === undefined ? {} : { groupBy: state.groupBy }) : { groupBy: remote.groupBy }),
        ...(remote.orderBy === undefined ? (state.orderBy === undefined ? {} : { orderBy: state.orderBy }) : { orderBy: remote.orderBy }),
        ...(remote.archivedFilter === undefined ? (state.archivedFilter === undefined ? {} : { archivedFilter: state.archivedFilter }) : { archivedFilter: remote.archivedFilter }),
      }
    } finally {
      applying = false
    }
    // A first-run page may hold local folds the Host has never seen. Report
    // only those keys once; the next snapshot already contains them.
    if (localOnly) publish()
  }

  // Wrap the public actions. Apply paths call the saved originals, so applying
  // a Host snapshot never echoes back as a new local edit.
  if (typeof originals.setGroupExpanded === 'function') {
    view.setGroupExpanded = (key: string, expanded: boolean): void => {
      originals.setGroupExpanded!.call(view, key, expanded)
      if (!applying) setGroup(key, expanded === true)
    }
  }
  if (typeof originals.retainAccountKeys === 'function') {
    view.retainAccountKeys = (keys: readonly string[]): void => {
      originals.retainAccountKeys!.call(view, keys)
      if (applying) return
      const retained = new Set(keys)
      const groups: Record<string, boolean> = {}
      for (const [key, expanded] of Object.entries(state.groups)) if (retained.has(key)) groups[key] = expanded
      state = { ...state, groups }
      publish()
    }
  }
  if (typeof originals.setGroupBy === 'function') {
    view.setGroupBy = (mode: string): void => {
      originals.setGroupBy!.call(view, mode)
      if (applying) return
      const groupBy = sanitizeWorkspaceViewState({ groups: {}, groupBy: mode }).groupBy
      if (groupBy !== undefined) { state = { ...state, groupBy }; publish() }
    }
  }
  if (typeof originals.setOrderBy === 'function') {
    view.setOrderBy = (mode: string, orders?: Readonly<Record<string, readonly string[]>>): void => {
      originals.setOrderBy!.call(view, mode, orders)
      if (applying) return
      const orderBy = sanitizeWorkspaceViewState({ groups: {}, orderBy: mode }).orderBy
      if (orderBy !== undefined) { state = { ...state, orderBy }; publish() }
    }
  }
  if (typeof originals.setArchivedFilter === 'function') {
    view.setArchivedFilter = (filter: string): void => {
      originals.setArchivedFilter!.call(view, filter)
      if (applying) return
      const archivedFilter = sanitizeWorkspaceViewState({ groups: {}, archivedFilter: filter }).archivedFilter
      if (archivedFilter !== undefined) { state = { ...state, archivedFilter }; publish() }
    }
  }

  const initial = options.getHostState()
  if (initial !== undefined) apply(initial)
  else publish()

  const unsubscribe = options.subscribeHostState(() => {
    apply(options.getHostState())
  })

  return () => {
    disposed = true
    if (timer !== undefined) clearTimeout(timer)
    unsubscribe()
    if (typeof originals.setGroupExpanded === 'function') view.setGroupExpanded = originals.setGroupExpanded
    if (typeof originals.retainAccountKeys === 'function') view.retainAccountKeys = originals.retainAccountKeys
    if (typeof originals.setGroupBy === 'function') view.setGroupBy = originals.setGroupBy
    if (typeof originals.setOrderBy === 'function') view.setOrderBy = originals.setOrderBy
    if (typeof originals.setArchivedFilter === 'function') view.setArchivedFilter = originals.setArchivedFilter
    delete marked[marker]
  }
}

/** Exported for tests: the persisted read without touching DSH. */
export const __test = { readPersistedView, currentOrders }

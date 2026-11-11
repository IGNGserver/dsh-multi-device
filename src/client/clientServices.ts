/**
 * Browser-side handles for the DSH services the device UI needs but the plugin
 * does not own: the Session catalog (cwd / blank flags) and `uiWorkspace`
 * (open or start a Session through DSH's own navigation).
 *
 * `apply()` binds them inside `ctx.inject`, so a slot component rendered by the
 * shell can read them without threading services through props.
 *
 * @module dsh-multi-device/client/clientServices
 */
import { useSyncExternalStore } from 'react'

/** Minimal Session-list summary the device UI reads. */
export interface SessionSummaryLike {
  readonly cwd?: string
  readonly blank?: boolean
  /** Durable log-backed title, absent until the host projects one. */
  readonly title?: string
  /** Human-facing label: durable title, project basename, then the id. */
  readonly displayTitle?: string
  readonly projectionValues?: Readonly<Record<string, unknown>>
  /** Local ownership counts; the main view is the Session on screen. */
  readonly retainedBy?: { readonly mainView?: number }
}

export interface SessionsListSnapshotLike {
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, SessionSummaryLike | undefined>>
}

export interface SessionsServiceLike {
  readonly list: {
    getSnapshot(): SessionsListSnapshotLike
    subscribe?(listener: () => void): () => void
  }
  refresh?(): Promise<void>
}

/** The workspace view actions DSH 0.2.x exposes on `uiWorkspace.view`. */
export interface WorkspaceViewActionsLike {
  setGroupExpanded?(key: string, expanded: boolean): void
  retainAccountKeys?(keys: readonly string[]): void
  setGroupBy?(mode: string): void
  setOrderBy?(mode: string, initialOrders?: Readonly<Record<string, readonly string[]>>): void
  setArchivedFilter?(filter: string): void
}

/** The `uiWorkspace` operations used by the device picker and view-state sync. */
export interface UiWorkspaceServiceLike {
  openSession(sessionId: string): void
  startSession?(workspaceId?: string): void
  /** DSH's sidebar viewing store; absent on incompatible versions. */
  readonly view?: WorkspaceViewActionsLike
}

export interface BoundClientServices {
  readonly sessions?: SessionsServiceLike
  readonly uiWorkspace?: UiWorkspaceServiceLike
  readonly revealMain?: () => void
}

let services: BoundClientServices = {}
const sessionListeners = new Set<() => void>()
let unsubscribeSessions: (() => void) | undefined

function attachSessionList(): void {
  unsubscribeSessions?.()
  unsubscribeSessions = sessionListeners.size > 0
    ? services.sessions?.list.subscribe?.(notifySessionListeners)
    : undefined
}

function notifySessionListeners(): void {
  for (const listener of [...sessionListeners]) {
    try { listener() } catch { /* isolate service consumers */ }
  }
}

function subscribeSessionSummary(listener: () => void): () => void {
  sessionListeners.add(listener)
  if (sessionListeners.size === 1) attachSessionList()
  return () => {
    sessionListeners.delete(listener)
    if (sessionListeners.size === 0) attachSessionList()
  }
}

/** Publish the injected services; returns a disposer that clears them. */
export function bindClientServices(next: BoundClientServices): () => void {
  services = next
  attachSessionList()
  // Mounted hooks must move from A to B (and back to the empty service) without
  // waiting for an unrelated React render or a future list event.
  notifySessionListeners()
  return () => {
    if (services !== next) return
    services = {}
    attachSessionList()
    notifySessionListeners()
  }
}

export function getClientServices(): BoundClientServices {
  return services
}

/** Read the current Session's catalog summary, re-rendering on list updates. */
export function useSessionSummary(sessionId: string | undefined): SessionSummaryLike | undefined {
  return useSyncExternalStore(
    subscribeSessionSummary,
    () => {
      if (sessionId === undefined || services.sessions === undefined) return undefined
      return services.sessions.list.getSnapshot().byId[sessionId]
    },
    () => undefined,
  )
}

/**
 * Subscribe to the whole Session-list snapshot.
 *
 * Attention menus resolve a title for every row at once, so they need the map
 * rather than one row. Hooks cannot be called per row, so the component holds
 * this one subscription and passes a plain lookup into the join.
 */
export function useSessionListSnapshot(): SessionsListSnapshotLike | undefined {
  return useSyncExternalStore(
    subscribeSessionSummary,
    () => services.sessions?.list.getSnapshot(),
    () => undefined,
  )
}

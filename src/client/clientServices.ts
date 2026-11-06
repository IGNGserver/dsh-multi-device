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
  readonly projectionValues?: Readonly<Record<string, unknown>>
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

/** The `uiWorkspace` operations used by the device picker. */
export interface UiWorkspaceServiceLike {
  openSession(sessionId: string): void
  startSession?(workspaceId?: string): void
}

export interface BoundClientServices {
  readonly sessions?: SessionsServiceLike
  readonly uiWorkspace?: UiWorkspaceServiceLike
}

let services: BoundClientServices = {}
let sessionSubscribe: ((listener: () => void) => () => void) | undefined

/** Publish the injected services; returns a disposer that clears them. */
export function bindClientServices(next: BoundClientServices): () => void {
  services = next
  sessionSubscribe = typeof next.sessions?.list.subscribe === 'function'
    ? next.sessions.list.subscribe.bind(next.sessions.list)
    : undefined
  return () => {
    services = {}
    sessionSubscribe = undefined
  }
}

export function getClientServices(): BoundClientServices {
  return services
}

/** Read the current Session's catalog summary, re-rendering on list updates. */
export function useSessionSummary(sessionId: string | undefined): SessionSummaryLike | undefined {
  return useSyncExternalStore(
    sessionSubscribe ?? noSubscribe,
    () => {
      if (sessionId === undefined || services.sessions === undefined) return undefined
      return services.sessions.list.getSnapshot().byId[sessionId]
    },
    () => undefined,
  )
}

function noSubscribe(): () => void {
  return () => {}
}

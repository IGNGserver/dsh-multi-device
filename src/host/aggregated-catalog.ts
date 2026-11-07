import { decodeSessionId, type AggregatedCatalogView, type AggregatedSessionRow, type DeviceId, type LogicalWorkspaceView } from '../contract.ts'

export interface CatalogSummaryInput {
  readonly sessionId: string
  readonly updatedAt?: number
  readonly running?: boolean
  readonly blank?: boolean
  readonly cwd?: string
  readonly parentSessionId?: string
  readonly origin?: 'subagent'
  readonly projections?: { readonly values?: Record<string, unknown> }
}

/** List projections are hints. Keep unknown shapes out of the sidebar, not out of other devices. */
export function catalogTitle(summary: CatalogSummaryInput): string {
  const values = summary.projections?.values
  for (const key of ['title', 'sessionTitle']) {
    const value = values?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (value && typeof value === 'object') {
      const text = (value as Record<string, unknown>).title
      if (typeof text === 'string' && text.trim()) return text.trim()
    }
  }
  const metadata = values?.sessionListMetadata as Record<string, unknown> | undefined
  for (const value of [metadata?.title, metadata?.firstUserMessage, metadata?.firstPrompt]) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 180)
  }
  return summary.blank ? 'New Session' : summary.sessionId
}

export function catalogRow(id: string, deviceId: DeviceId, summary: CatalogSummaryInput, stale: boolean): AggregatedSessionRow {
  return {
    id, rawSessionId: summary.sessionId, deviceId, title: catalogTitle(summary),
    updatedAt: Number.isFinite(summary.updatedAt) ? summary.updatedAt! : 0,
    running: !stale && summary.running === true, blank: summary.blank === true, stale,
    ...(summary.cwd === undefined ? {} : { cwd: summary.cwd }),
    ...(summary.parentSessionId === undefined ? {} : { parentSessionId: summary.parentSessionId }),
    ...(summary.origin === undefined ? {} : { origin: summary.origin }),
  }
}

/** Enforce referential closure in one snapshot, including incomplete/offline caches. */
export function buildAggregatedCatalog(
  revision: number,
  sessions: Record<string, AggregatedSessionRow>,
  workspaces: readonly LogicalWorkspaceView[],
  pinnedSessionIds: readonly string[],
  inputIssues: Readonly<Record<string, string>> = {},
): AggregatedCatalogView {
  const rows = { ...sessions }
  const issues = { ...inputIssues }
  for (const workspace of workspaces) {
    for (const id of workspace.sessionIds) {
      if (rows[id] !== undefined) continue
      const owner = decodeSessionId(id)
      rows[id] = { id, deviceId: owner.deviceId, rawSessionId: owner.rawSessionId,
        title: owner.rawSessionId, updatedAt: 0, running: false, blank: false, stale: true, missing: true }
      issues[String(owner.deviceId)] ??= 'Some referenced sessions have no summary; reconnect to reconcile this directory.'
    }
  }
  return { schema: 1, revision, sessions: rows, pinnedSessionIds: [...new Set(pinnedSessionIds)], issues }
}

/**
 * Turn the Host's attention projection (bare Session IDs) into rows a person
 * can actually read: real conversation title, owning workspace, owning device
 * and last activity.
 *
 * The projection itself stays ID-only on purpose (`src/attention.ts` never
 * carries titles or message text), so this module joins the IDs against data
 * the Client already holds:
 *
 * 1. `snapshot.catalog.sessions[id]` — the Host's own row (title, cwd, time),
 *    present for both modes and for devices that are currently offline.
 * 2. `snapshot.sessionOrigins[id]` — owning device and path. Local Sessions
 *    have no origin entry, so the caller passes the localized local name.
 * 3. `snapshot.logicalWorkspaces` — the aggregated workspace the row belongs
 *    to, whose title is what the sidebar shows.
 * 4. An optional title resolver for the live DSH Session store, which knows a
 *    Session the Host catalog has not published yet.
 *
 * Pure and synchronous: the component owns rendering, this owns the join.
 *
 * @module dsh-multi-device/client/attentionSessions
 */

import {
  decodeSessionId,
  LOCAL_DEVICE_ID,
  type AggregatedSessionRow,
  type MultiDeviceSnapshot,
} from '../contract.ts'

/** One readable attention row. */
export interface AttentionSessionRow {
  readonly sessionId: string
  readonly rawSessionId: string
  readonly deviceId: string
  readonly deviceName: string
  /** Real conversation title; `''` when neither source knows one yet. */
  readonly title: string
  /** Workspace title, falling back to the last path segment of `cwd`. */
  readonly workspace?: string
  readonly cwd?: string
  readonly updatedAt?: number
}

export interface AttentionJoinOptions {
  /** Localized label for this machine (本机 / This Device). */
  readonly localDeviceName: string
  /** Live DSH Session store lookup, used when the Host catalog has no row. */
  readonly title?: (sessionId: string) => string | undefined
  /** Relative time reference; injectable for tests. */
  readonly now?: number
}

function cleanTitle(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

/** Last non-empty path segment, tolerating both separators. */
export function pathBasename(path: string | undefined): string | undefined {
  if (path === undefined) return undefined
  const trimmed = path.replace(/[/\\]+$/, '')
  if (trimmed === '') return undefined
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return trimmed.slice(index + 1) === '' ? undefined : trimmed.slice(index + 1)
}

function catalogRow(snapshot: MultiDeviceSnapshot, sessionId: string): AggregatedSessionRow | undefined {
  return snapshot.catalog?.sessions[sessionId]
}

function workspaceTitleOf(snapshot: MultiDeviceSnapshot, sessionId: string): string | undefined {
  for (const workspace of snapshot.logicalWorkspaces) {
    if (workspace.sessionIds.includes(sessionId)) return cleanTitle(workspace.title)
  }
  return undefined
}

/**
 * Join one ID to everything the UI shows for it.
 *
 * Every lookup degrades independently: a Session whose catalog row has not
 * arrived still renders its workspace and device, and a Session whose device
 * was just removed still renders its raw ID — the popover never blanks out.
 */
export function resolveAttentionSession(
  sessionId: string,
  snapshot: MultiDeviceSnapshot,
  options: AttentionJoinOptions,
): AttentionSessionRow {
  const origin = snapshot.sessionOrigins?.[sessionId]
  const row = catalogRow(snapshot, sessionId)
  const decoded = decodeSessionId(sessionId)
  const cwd = row?.cwd ?? origin?.cwd
  const title =
    cleanTitle(row?.title)
    ?? cleanTitle(options.title?.(sessionId))
    ?? ''
  const workspace =
    workspaceTitleOf(snapshot, sessionId)
    ?? cleanTitle(origin?.gitRemote)
    ?? pathBasename(cwd)
  return {
    sessionId,
    rawSessionId: origin?.rawSessionId ?? (decoded.isRemote ? decoded.rawSessionId : sessionId),
    deviceId: origin?.deviceId ?? LOCAL_DEVICE_ID,
    deviceName: cleanTitle(origin?.deviceName) ?? options.localDeviceName,
    title,
    ...(workspace !== undefined ? { workspace } : {}),
    ...(cwd !== undefined ? { cwd } : {}),
    ...(row?.updatedAt !== undefined ? { updatedAt: row.updatedAt } : {}),
  }
}

/** Join a whole category, preserving the Host's order. */
export function resolveAttentionSessions(
  sessionIds: readonly string[],
  snapshot: MultiDeviceSnapshot,
  options: AttentionJoinOptions,
): AttentionSessionRow[] {
  return sessionIds.map(sessionId => resolveAttentionSession(sessionId, snapshot, options))
}

/** Coarse relative age; the caller supplies the localized unit. */
export type RelativeAge = { readonly unit: 'now' } | { readonly unit: 'minutes' | 'hours' | 'days'; readonly n: number }

/** Age of `updatedAt` relative to `now`, in the coarsest useful unit. */
export function relativeAge(updatedAt: number | undefined, now: number): RelativeAge | undefined {
  if (updatedAt === undefined || !Number.isFinite(updatedAt)) return undefined
  const delta = Math.max(0, now - updatedAt)
  if (delta < 60_000) return { unit: 'now' }
  if (delta < 3_600_000) return { unit: 'minutes', n: Math.max(1, Math.floor(delta / 60_000)) }
  if (delta < 86_400_000) return { unit: 'hours', n: Math.floor(delta / 3_600_000) }
  return { unit: 'days', n: Math.floor(delta / 86_400_000) }
}

/**
 * Window/taskbar aggregate of every device's Session status.
 *
 * Counts are the tab capsule's own three categories and nothing else — needs
 * reply, running, finished-unread — because the title and the strip must never
 * disagree:
 *
 * - The Host's `attentionByDevice` projection already excludes archived rows,
 *   subagent children and blank Sessions, and makes the three categories
 *   mutually exclusive (pending > running > unread). Summing its arrays is
 *   therefore the same number the device pill shows, added up across devices.
 * - "Finished" means finished-and-unread, exactly like the green pill: reading
 *   a conversation clears it. A poll of "everything that ever finished" would
 *   grow without bound and has no bounded source in DSH.
 * - No "failed" category. DSH exposes no per-Session failure to a plugin
 *   (`sessionListMetadata` carries `blank`/`lastPromptAt`, `uiSession.status`
 *   carries running/pendingInteraction/completionUnread), so a failure count
 *   would have to be invented. The strip has no such segment either.
 *
 * Every function here is pure: the title controller owns the DOM, the Host
 * owns the counts.
 *
 * @module dsh-multi-device/client/taskbarSummary
 */
import type { DeviceAttentionView } from '../attention.ts'
import { decodeSessionId, type DeviceView } from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { countableUnreadIds } from './unreadCounts.ts'

/** The three categories the device capsule shows, in title order. */
export const TASKBAR_SEGMENT_ORDER = ['running', 'pending', 'unread'] as const

export type TaskbarSegmentCategory = (typeof TASKBAR_SEGMENT_ORDER)[number]

/** One counted category; absent categories are omitted rather than shown as 0. */
export interface TaskbarSegment {
  readonly category: TaskbarSegmentCategory
  readonly count: number
}

/** Per-category totals across every device. */
export interface TaskbarTally {
  readonly running: number
  readonly pending: number
  readonly unread: number
}

export const EMPTY_TALLY: TaskbarTally = { running: 0, pending: 0, unread: 0 }

/**
 * Fields the tally reads. Narrower than {@link MultiDeviceSnapshot} on purpose:
 * a snapshot structurally satisfies it, and a test can pass only what it means
 * to exercise.
 */
export interface TaskbarTallyInput {
  readonly devices: readonly DeviceView[]
  readonly attentionByDevice?: Readonly<Record<string, DeviceAttentionView>> | undefined
  readonly unreadSessionIds: readonly string[]
  readonly archivedSessionIds?: readonly string[] | undefined
  readonly subagentSessionIds?: readonly string[] | undefined
}

/**
 * Optional scope for one tally. `deviceIds` undefined keeps the historical
 * fleet-wide behaviour; a set restricts both the projection branch and the
 * per-device fallback to exactly those devices.
 */
export interface TaskbarTallyOptions {
  readonly deviceIds?: ReadonlySet<string> | undefined
  /**
   * Extra intersection applied inside each category. Workspace scope passes
   * the Session IDs whose `cwd` matches the active conversation; `undefined`
   * keeps every Session on the selected devices.
   */
  readonly sessionIds?: ReadonlySet<string> | undefined
}

function finiteCount(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

/**
 * Count every device's Sessions by category.
 *
 * Session IDs are collected into sets before counting so the result cannot
 * double-count a row that a Host bug binds to two device views; remote IDs are
 * namespaced (`md~<device>~<id>`), so distinct rows never collide.
 *
 * A Host older than this plugin publishes no `attentionByDevice`. The tally
 * then falls back to the per-device counters on `DeviceView` plus DSH's raw
 * unread set instead of reporting an authoritative-looking zero.
 */
export function tallyTaskbarSessions(
  input: TaskbarTallyInput,
  options: TaskbarTallyOptions = {},
): TaskbarTally {
  const inScope = (deviceId: string): boolean =>
    options.deviceIds === undefined || options.deviceIds.has(deviceId)
  const includeSession = (sessionId: string): boolean =>
    options.sessionIds === undefined || options.sessionIds.has(sessionId)
  const disabledDeviceIds = new Set(
    input.devices.filter(device => device.enabled === false).map(device => device.id),
  )
  const attention = input.attentionByDevice
  if (attention !== undefined && Object.keys(attention).length > 0) {
    const running = new Set<string>()
    const pending = new Set<string>()
    const unread = new Set<string>()
    for (const [deviceId, view] of Object.entries(attention)) {
      if (view === undefined || disabledDeviceIds.has(deviceId) || !inScope(deviceId)) continue
      for (const sessionId of view.runningSessionIds) if (includeSession(sessionId)) running.add(sessionId)
      for (const sessionId of view.pendingSessionIds) if (includeSession(sessionId)) pending.add(sessionId)
      for (const sessionId of view.unreadSessionIds) if (includeSession(sessionId)) unread.add(sessionId)
    }
    return { running: running.size, pending: pending.size, unread: unread.size }
  }
  const enabledDevices = input.devices.filter(device => device.enabled !== false && inScope(device.id))
  const running = enabledDevices.reduce((sum, device) => sum + finiteCount(device.runningSessionCount), 0)
  const pending = enabledDevices.reduce((sum, device) => sum + finiteCount(device.pendingApprovalCount), 0)
  const visibleUnread = input.unreadSessionIds.filter(sessionId => {
    const decoded = decodeSessionId(sessionId)
    if (!inScope(decoded.deviceId) || !includeSession(sessionId)) return false
    return !decoded.isRemote || !disabledDeviceIds.has(decoded.deviceId)
  })
  const unread = countableUnreadIds(
    visibleUnread,
    input.archivedSessionIds,
    input.subagentSessionIds,
  ).size
  return { running, pending, unread }
}

/** True when nothing is running, waiting or unread. */
export function tallyIsEmpty(tally: TaskbarTally): boolean {
  return tally.running === 0 && tally.pending === 0 && tally.unread === 0
}

/** Non-zero categories in title order; a quiet strip produces an empty list. */
export function taskbarSegments(tally: TaskbarTally): TaskbarSegment[] {
  return TASKBAR_SEGMENT_ORDER.flatMap(category => (
    tally[category] > 0 ? [{ category, count: tally[category] }] : []
  ))
}

const SEGMENT_KEY: Record<TaskbarSegmentCategory, MultiDeviceLocaleKey> = {
  running: 'taskbarRunningSegment',
  pending: 'taskbarPendingSegment',
  unread: 'taskbarUnreadSegment',
}

export type TaskbarTranslate = (key: MultiDeviceLocaleKey) => string

/**
 * Render `1跑 2结`, or `undefined` when there is nothing to report.
 *
 * `undefined` is load-bearing: the caller must then leave the title to DSH (or
 * to the active device's own page title) rather than paint an empty aggregate.
 * `scopeLabel` names the scope the counts cover (`本机`, a device name, `全部`),
 * so a device-filtered title can never be mistaken for a fleet-wide total.
 */
export function formatTaskbarSummary(
  tally: TaskbarTally,
  t: TaskbarTranslate,
  scopeLabel?: string,
): string | undefined {
  const segments = taskbarSegments(tally)
  if (segments.length === 0) return undefined
  const counts = segments
    .map(({ category, count }) => t(SEGMENT_KEY[category]).replace('{count}', String(count)))
    .join(' ')
  const label = scopeLabel?.trim()
  return label === undefined || label === '' ? counts : `${label} ${counts}`
}

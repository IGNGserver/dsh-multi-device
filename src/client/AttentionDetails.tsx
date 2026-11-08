/**
 * Attention status for one device: one capsule of colour-coded counts, and the
 * Sessions behind each count in the official DSH menu.
 *
 * Design notes (why this is not a `<details>` any more):
 * - The surface is the Host's own `Menu`/`MenuGroup`/`MenuItemButton` pair, so
 *   elevation, radius, translucent material, hover row, focus ring, arrow-key
 *   navigation and outside-pointer dismissal are the ones DSH uses everywhere
 *   else. The hand-rolled popover it replaces painted with `var(--surface,
 *   Canvas)` — variables DSH does not define — so it fell back to browser
 *   default colours and read as a foreign widget.
 * - One capsule per device, numbers only: the colour is the category (amber
 *   needs-reply, blue running, green finished-unread) and the words live in
 *   `title`, `aria-label` and the menu heading. A category with no members
 *   renders no segment at all, so a quiet device carries no reservation — the
 *   three fixed 30px slots plus a separate freshness marker this replaces are
 *   what made the strip read as a row of scattered dots.
 * - A row names the conversation (`title`), then `workspace · device · age`.
 *   Titles come from the browser's own Session store for local sessions and
 *   from the Host's `sessionTitles` projection for remote ones; the raw Session
 *   ID stays available as the row's tooltip and is the visible text only when
 *   neither source knows a title.
 * - Every count keeps its urgency position (needs-reply → running →
 *   finished-unread) and a two-digit cell, so colour is never the only channel
 *   and a count going 9 → 10 cannot nudge the tab beside it. Only a category
 *   appearing or disappearing moves anything, which is a real change.
 * - Cached or partial data is stated by the capsule itself: it dims and turns
 *   dashed, and with nothing to count it collapses to an empty dashed ring. The
 *   amber dot this replaces used the very same colour as "needs reply", so a
 *   stale device read as a second pending reminder.
 * - Clicking a row opens that conversation: a local Session through DSH's own
 *   `uiWorkspace.openSession`, a remote one by selecting its device tab and
 *   publishing the selection so the Host tells that framed page to open it.
 *
 * @module dsh-multi-device/client/AttentionDetails
 */
import {
  IconGlobeOutlineRegular,
  Menu,
  MenuGroup,
  MenuItemButton,
  StateDot,
  Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useState } from 'react'
import type { DeviceAttentionView } from '../attention.ts'
import {
  decodeSessionId,
  LOCAL_DEVICE_ID,
  type DeviceConnectionState,
  type MultiDeviceSnapshot,
} from '../contract.ts'
import {
  resolveAttentionSessions,
  resolveAttentionTitle,
  type AttentionSessionRow,
} from './attentionSessions.ts'
import { getClientServices, useSessionListSnapshot } from './clientServices.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { clientStore, deviceStateToDotState, useMultiDeviceState } from './state.ts'

export type AttentionCategory = 'pending' | 'running' | 'unread'

export interface AttentionDetailsProps {
  readonly view?: DeviceAttentionView
  readonly deviceName: string
  readonly t: (key: MultiDeviceLocaleKey) => string
  /** Dense rows for the Native Mode tab bar (same surface, tighter list). */
  readonly nativeBar?: boolean
  /** Compatibility with Hosts predating the shared projection. */
  readonly fallback?: {
    readonly runningCount?: number
    readonly pendingCount?: number
    readonly unreadSessionIds: readonly string[]
    readonly fresh: boolean
  }
}

/** Exported for category/label tests without loading any native primitives. */
export function attentionGroups(view: DeviceAttentionView): {
  category: AttentionCategory; ids: readonly string[]; count: number
}[] {
  return [
    { category: 'pending', ids: view.pendingSessionIds, count: view.pendingSessionIds.length },
    { category: 'running', ids: view.runningSessionIds, count: view.runningSessionIds.length },
    { category: 'unread', ids: view.unreadSessionIds, count: view.unreadSessionIds.length },
  ]
}

/**
 * Category words shared with the DOM-injected project badges (`projectBadges`
 * cannot render React). Every word comes from the locale namespace, so the two
 * surfaces cannot drift apart, and neither repeats the old hard-coded pair of
 * dictionaries keyed off the Chinese label for This Device.
 */
export function attentionLabels(t: (key: MultiDeviceLocaleKey) => string) {
  return {
    pending: t('attentionPending'),
    running: t('attentionRunning'),
    unread: t('attentionUnread'),
    stale: t('attentionStale'),
    last: t('attentionLastKnown'),
    members: t('attentionMembers'),
    unavailable: t('attentionUnavailable'),
    copy: t('attentionCopy'),
    copied: t('attentionCopied'),
    failed: t('attentionCopyFailed'),
    requests: t('attentionRequests'),
  }
}

const CATEGORY_COUNT_KEY: Record<AttentionCategory, MultiDeviceLocaleKey> = {
  pending: 'pendingCount',
  running: 'runningCount',
  unread: 'unreadCount',
}

function deviceStateOf(snapshot: MultiDeviceSnapshot, deviceId: string): DeviceConnectionState {
  if (deviceId === LOCAL_DEVICE_ID) return 'connected'
  return snapshot.devices.find(device => device.id === deviceId)?.state ?? 'error'
}

/** Colour alone carries the category, so the tone name is the styling hook. */
export type AttentionTone = 'pending' | 'running' | 'done'

const CATEGORY_TONE: Record<AttentionCategory, AttentionTone> = {
  pending: 'pending',
  running: 'running',
  unread: 'done',
}

export interface AttentionSegment {
  readonly category: AttentionCategory
  readonly tone: AttentionTone
  readonly ids: readonly string[]
  readonly count: number
}

/**
 * The capsule's segments, most urgent first, with empty categories dropped.
 *
 * Dropping empties is deliberate: the strip then shows only counts that exist,
 * so a device with nothing to report occupies no space at all. The order is the
 * one {@link attentionGroups} and the Host projection already use
 * (needs-reply → running → finished-unread), which is what keeps a colour-only
 * capsule readable for someone who cannot tell amber from green.
 */
export function attentionSegments(
  view: DeviceAttentionView | undefined,
  fallback?: AttentionDetailsProps['fallback'],
): AttentionSegment[] {
  const groups = view !== undefined
    ? attentionGroups(view)
    : [
        { category: 'pending' as const, ids: [] as readonly string[], count: fallback?.pendingCount ?? 0 },
        { category: 'running' as const, ids: [] as readonly string[], count: fallback?.runningCount ?? 0 },
        { category: 'unread' as const, ids: fallback?.unreadSessionIds ?? [], count: fallback?.unreadSessionIds.length ?? 0 },
      ]
  return groups.flatMap(group => (
    group.count > 0 ? [{ ...group, tone: CATEGORY_TONE[group.category] }] : []
  ))
}

export function AttentionDetails({
  view,
  deviceName,
  t,
  nativeBar = false,
  fallback,
}: AttentionDetailsProps): React.ReactElement {
  const state = useMultiDeviceState()
  const snapshot = state.snapshot
  const words = attentionLabels(t)
  // One subscription for the whole menu: hooks cannot run per row, and the tab
  // strip would otherwise re-subscribe for every device it renders.
  const sessionList = useSessionListSnapshot()
  const [openCategory, setOpenCategory] = useState<AttentionCategory | null>(null)
  const [failure, setFailure] = useState<{ seq: number; message: string } | null>(null)

  const fresh = view?.fresh ?? fallback?.fresh ?? false
  const segments = attentionSegments(view, fallback)
  const stale = !fresh

  /** Local store first, then the Host's projection for remote conversations. */
  const titleFor = (sessionId: string): string | undefined =>
    resolveAttentionTitle(sessionId, sessionList?.byId[sessionId], snapshot.sessionTitles)

  /** Never wrap the strip: past two digits the count collapses to `99+`. */
  const chipCount = (count: number): string => (count > 99 ? '99+' : String(count))

  const fail = (detail: string | undefined): void => {
    setFailure({
      seq: Date.now(),
      message: detail === undefined || detail === ''
        ? t('attentionOpenFailed')
        : `${t('attentionOpenFailed')}: ${detail}`,
    })
  }

  /**
   * Open one row. The owning tab has to be visible first: the Host publishes
   * the navigation to that device's framed page, and a frame the user cannot
   * see would swallow the result.
   */
  const openRow = async (row: AttentionSessionRow): Promise<void> => {
    setOpenCategory(null)
    const decoded = decodeSessionId(row.sessionId)
    try {
      if (!decoded.isRemote) {
        clientStore.selectLocalNativeTab()
        const workspace = getClientServices().uiWorkspace
        if (workspace === undefined || typeof workspace.openSession !== 'function') {
          fail(undefined)
          return
        }
        workspace.openSession(row.sessionId)
        await clientStore.setActiveSession(row.sessionId)
        return
      }
      const switched = await clientStore.selectNativeDevice(decoded.deviceId)
      if (!switched.ok) {
        fail(switched.error)
        return
      }
      // Publishing the selection is what makes the Host tell that device's
      // framed page to open the conversation.
      await clientStore.setActiveSession(row.sessionId)
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error))
    }
  }

  const renderRows = (ids: readonly string[]): React.ReactNode => {
    if (ids.length === 0) {
      // Legacy Host: the projection knew a count but never sent member IDs.
      return <div className="dsh-md-attention-note">{words.unavailable}</div>
    }
    const rows = resolveAttentionSessions(ids, snapshot, {
      localDeviceName: t('nativeLocalTab'),
      owningDeviceName: deviceName,
      title: titleFor,
    })
    return rows.map(row => {
      const meta = [row.cwd, row.deviceName]
        .filter((part): part is string => part !== undefined && part !== '')
      const minimal = row.title === ''
      return (
        <MenuItemButton
          key={row.sessionId}
          icon={row.deviceId === LOCAL_DEVICE_ID
            ? <IconGlobeOutlineRegular size={12} />
            : <StateDot state={deviceStateToDotState(deviceStateOf(snapshot, row.deviceId))} size={8} />}
          onSelect={() => { void openRow(row) }}
        >
          <span className="dsh-md-attention-row" title={`${row.sessionId}\n${t('attentionOpenHint')}`}>
            <span className={`dsh-md-attention-row-title${minimal ? ' isId' : ''}`}>
              {minimal ? row.rawSessionId : row.title}
            </span>
            {meta.length > 0 && <span className="dsh-md-attention-row-meta">{meta.join(' · ')}</span>}
          </span>
        </MenuItemButton>
      )
    })
  }

  const capsuleLabel = stale
    ? `${deviceName} ${t('attentionStatus')} · ${words.stale}`
    : `${deviceName} ${t('attentionStatus')}`

  return (
    <span className="dsh-md-attention">
      {/* One capsule per device, numbers only. A device with nothing to report
          and live data renders no capsule at all; a device with cached data and
          nothing to count collapses to an empty dashed ring, so "no members"
          never reads as an authoritative zero. Either way the three 30px
          placeholder slots this replaces are gone from the strip. */}
      {(segments.length > 0 || stale) && (
        <span
          className="dsh-md-tab-status"
          role={segments.length > 0 ? 'group' : 'status'}
          aria-label={capsuleLabel}
          title={stale ? words.stale : undefined}
          data-stale={stale ? 'true' : undefined}
          data-empty={segments.length === 0 ? 'true' : undefined}
        >
          {segments.map(segment => {
            const label = t(CATEGORY_COUNT_KEY[segment.category])
              .replace('{count}', String(segment.count))
            const open = openCategory === segment.category
            const chip = (
              <button
                type="button"
                className="dsh-md-tab-status-seg"
                data-tone={segment.tone}
                data-attention-category={segment.category}
                data-open={open ? 'true' : 'false'}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`${deviceName}: ${label}; ${words.members}`}
                title={label}
                onClick={() => {
                  if (open) {
                    setOpenCategory(null)
                    return
                  }
                  setOpenCategory(segment.category)
                }}
              >
                {chipCount(segment.count)}
              </button>
            )
            return (
              <Menu
                key={segment.category}
                open={open}
                anchor={chip}
                onClose={() => setOpenCategory(current => (current === segment.category ? null : current))}
                portal
                side="bottom"
                align="start"
                dense={nativeBar}
                listClassName="dsh-md-attention-menu"
              >
                <MenuGroup label={label}>{renderRows(segment.ids)}</MenuGroup>
              </Menu>
            )
          })}
        </span>
      )}
      {failure !== null && (
        <Toast key={failure.seq} text={failure.message} tone="error" onDone={() => setFailure(null)} />
      )}
    </span>
  )
}

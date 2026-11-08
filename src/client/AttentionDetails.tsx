/**
 * Attention chips for one device: a compact count per category, and the
 * Sessions behind it in the official DSH menu.
 *
 * Design notes (why this is not a `<details>` any more):
 * - The surface is the Host's own `Menu`/`MenuGroup`/`MenuItemButton` pair, so
 *   elevation, radius, translucent material, hover row, focus ring, arrow-key
 *   navigation and outside-pointer dismissal are the ones DSH uses everywhere
 *   else. The hand-rolled popover it replaces painted with `var(--surface,
 *   Canvas)` — variables DSH does not define — so it fell back to browser
 *   default colours and read as a foreign widget.
 * - The chip prints a number, not a sentence: `●23` instead of `23 未读`. The
 *   category is carried by the icon, the tooltip and the group heading, which
 *   keeps three device tabs on one row instead of pushing the Aggregated switch
 *   into the scrolled-away part of the strip.
 * - A row names the conversation (`title`), then `workspace · device · age`.
 *   The raw Session ID stays available as the row's tooltip and is the visible
 *   text only when neither the Host catalog nor the live store knows a title.
 * - Clicking a row opens that conversation through the Host
 *   (`openCatalogSession` handles local and remote owners); in Native Mode the
 *   owning device tab is selected first, so the frame that receives the
 *   navigation is the one the user ends up looking at.
 *
 * @module dsh-multi-device/client/AttentionDetails
 */
import {
  IconGlobeOutlineRegular,
  IconWarningOutlineRegular,
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
  relativeAge,
  resolveAttentionSessions,
  type AttentionSessionRow,
} from './attentionSessions.ts'
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

const AGE_KEY: Record<'minutes' | 'hours' | 'days', MultiDeviceLocaleKey> = {
  minutes: 'attentionAgeMinutes',
  hours: 'attentionAgeHours',
  days: 'attentionAgeDays',
}

function ageLabel(row: AttentionSessionRow, now: number, t: (key: MultiDeviceLocaleKey) => string): string | undefined {
  const age = relativeAge(row.updatedAt, now)
  if (age === undefined) return undefined
  if (age.unit === 'now') return t('attentionAgeNow')
  return t(AGE_KEY[age.unit]).replace('{count}', String(age.n))
}

function deviceStateOf(snapshot: MultiDeviceSnapshot, deviceId: string): DeviceConnectionState {
  if (deviceId === LOCAL_DEVICE_ID) return 'connected'
  return snapshot.devices.find(device => device.id === deviceId)?.state ?? 'error'
}

function categoryIcon(category: AttentionCategory): React.ReactElement {
  if (category === 'pending') return <IconWarningOutlineRegular size={12} />
  return <StateDot state={category === 'running' ? 'ongoing' : 'done'} size={8} />
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
  const [openCategory, setOpenCategory] = useState<AttentionCategory | null>(null)
  const [openedAt, setOpenedAt] = useState(0)
  const [failure, setFailure] = useState<{ seq: number; message: string } | null>(null)

  const fresh = view?.fresh ?? fallback?.fresh ?? false
  const groups = view !== undefined
    ? attentionGroups(view)
    : [
        { category: 'pending' as const, ids: [] as readonly string[], count: fallback?.pendingCount ?? 0 },
        { category: 'running' as const, ids: [] as readonly string[], count: fallback?.runningCount ?? 0 },
        { category: 'unread' as const, ids: fallback?.unreadSessionIds ?? [], count: fallback?.unreadSessionIds.length ?? 0 },
      ]
  const visible = groups.filter(group => group.count > 0)

  const fail = (detail: string | undefined): void => {
    setFailure({
      seq: Date.now(),
      message: detail === undefined || detail === ''
        ? t('attentionOpenFailed')
        : `${t('attentionOpenFailed')}: ${detail}`,
    })
  }

  /**
   * Open one row. In Native Mode the owning tab has to be visible first: the
   * Host publishes the navigation to that device's framed page, and a frame the
   * user cannot see would swallow the result.
   */
  const openRow = async (row: AttentionSessionRow): Promise<void> => {
    setOpenCategory(null)
    const decoded = decodeSessionId(row.sessionId)
    if (clientStore.getSnapshot().displayMode === 'native') {
      try {
        if (decoded.isRemote) {
          const switched = await clientStore.selectNativeDevice(decoded.deviceId)
          if (!switched.ok) {
            fail(switched.error)
            return
          }
        } else {
          clientStore.selectLocalNativeTab()
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
        return
      }
    }
    try {
      const result = await clientStore.openCatalogSession(row.sessionId)
      if (!result.ok) fail(result.error)
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
      now: openedAt,
    })
    return rows.map(row => {
      const age = ageLabel(row, openedAt, t)
      const meta = [row.workspace ?? row.cwd, row.deviceName, age]
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

  return (
    <span className="dsh-md-attention" role="group" aria-label={`${deviceName} ${words.members}`}>
      {!fresh && (
        <span role="status" className="dsh-md-attention-stale" data-attention-stale="true">{words.stale}</span>
      )}
      {visible.map(group => {
        const label = t(CATEGORY_COUNT_KEY[group.category]).replace('{count}', String(group.count))
        const chip = (
          <button
            type="button"
            className="dsh-md-attention-chip"
            data-category={group.category}
            data-open={openCategory === group.category ? 'true' : 'false'}
            data-attention-category={group.category}
            aria-haspopup="menu"
            aria-expanded={openCategory === group.category}
            aria-label={`${deviceName}: ${label}; ${words.members}`}
            title={label}
            onClick={() => {
              if (openCategory === group.category) {
                setOpenCategory(null)
                return
              }
              setOpenedAt(Date.now())
              setOpenCategory(group.category)
            }}
          >
            {categoryIcon(group.category)}
            <span className="dsh-md-attention-count">{group.count}</span>
          </button>
        )
        return (
          <Menu
            key={group.category}
            open={openCategory === group.category}
            anchor={chip}
            onClose={() => setOpenCategory(current => (current === group.category ? null : current))}
            portal
            side="bottom"
            align="start"
            dense={nativeBar}
            listClassName="dsh-md-attention-menu"
          >
            <MenuGroup label={label}>{renderRows(group.ids)}</MenuGroup>
          </Menu>
        )
      })}
      {failure !== null && (
        <Toast key={failure.seq} text={failure.message} tone="error" onDone={() => setFailure(null)} />
      )}
    </span>
  )
}

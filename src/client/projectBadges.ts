/**
 * Device badge for sidebar project rows.
 *
 * DSH's sidebar exposes session-row slots only; the project (workspace) row has
 * no extension point, and its title is the single visible label. To show a
 * Codex-style connection dot plus a device label we decorate the row in the
 * DOM: a dot (green / amber / grey) followed by the device name when the
 * project lives on exactly one device, or `N个设备` when it spans several.
 *
 * The decoration is additive and reversible: rows are matched by their stable
 * `data-row-key="workspace:<id>"` attribute, the badge is a marker-tagged span,
 * and the observer re-applies it after React re-renders. If DSH changes its row
 * markup the function simply finds nothing and leaves the sidebar untouched.
 *
 * @module dsh-multi-device/client/projectBadges
 */
import {
  LOCAL_DEVICE_ID,
  type DisplayMode,
  type LogicalWorkspaceView,
  type MultiDeviceSnapshot,
} from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { clientStore, deviceStateToDotState } from './state.ts'

const BADGE_ATTR = 'data-dsh-md-device-badge'
const DOT_ATTR = 'data-dsh-md-device-dot'
const LABEL_ATTR = 'data-dsh-md-device-label'

type DotTone = 'ok' | 'pending' | 'offline'

/** Translate function shape the host passes into the client plugin. */
type Translate = (key: MultiDeviceLocaleKey) => string

/**
 * Device labels belong to the aggregated sidebar only. Native Mode's 本机 tab is
 * the unmodified local DSH surface, so a row decorated there would be an
 * aggregation artifact leaking into a supposedly local page.
 */
export function shouldDecorateProjectRows(mode: DisplayMode | undefined): boolean {
  return mode === 'aggregated'
}

function dotTone(snapshot: MultiDeviceSnapshot, workspace: LogicalWorkspaceView): DotTone {
  let hasOnline = false
  let hasOffline = false
  let hasPending = false
  for (const member of workspace.members) {
    if (member.deviceId === LOCAL_DEVICE_ID) {
      hasOnline = true
      continue
    }
    const device = snapshot.devices.find(candidate => candidate.id === member.deviceId)
    const state = deviceStateToDotState(device?.state ?? 'disabled')
    if (state === 'done') hasOnline = true
    else if (state === 'ongoing') hasPending = true
    else hasOffline = true
  }
  if (hasOffline && !hasOnline && !hasPending) return 'offline'
  if (hasOffline || hasPending) return 'pending'
  return 'ok'
}

function labelFor(
  workspace: LogicalWorkspaceView,
  t: Translate,
): { text: string; tooltip: string } {
  const names = workspace.members.map(member =>
    member.deviceId === LOCAL_DEVICE_ID ? t('projectDeviceNone') : member.deviceName,
  )
  const tooltip = names.join(' · ')
  if (workspace.members.length <= 1) {
    return { text: names[0] ?? '', tooltip }
  }
  return {
    text: t('projectDeviceCount').replace('{count}', String(workspace.members.length)),
    tooltip,
  }
}

function createBadge(): HTMLSpanElement {
  const badge = document.createElement('span')
  badge.className = 'dsh-md-project-device'
  badge.setAttribute(BADGE_ATTR, '')

  const dot = document.createElement('span')
  dot.className = 'dsh-md-project-dot'
  dot.setAttribute(DOT_ATTR, '')

  const label = document.createElement('span')
  label.className = 'dsh-md-project-device-label'
  label.setAttribute(LABEL_ATTR, '')

  badge.append(dot, label)
  return badge
}

/** Insert the badge just before the row's trailing action group. */
function mountBadge(row: Element): HTMLSpanElement {
  const existing = row.querySelector<HTMLSpanElement>(`:scope > [${BADGE_ATTR}]`)
  if (existing !== null) return existing
  const badge = createBadge()
  const last = row.lastElementChild
  if (last !== null && last !== row.firstElementChild) row.insertBefore(badge, last)
  else row.appendChild(badge)
  return badge
}

/** Reconcile every project row against the current snapshot. */
function syncRows(t: Translate): void {
  const state = clientStore.getSnapshot()
  if (!shouldDecorateProjectRows(state.displayMode)) {
    // The Host filters Native Mode data, but an aggressive DOM reconciler must
    // also erase badges when the snapshot flips to `native` while rows stay
    // mounted (mode switching keeps the local page alive).
    for (const badge of document.querySelectorAll(`[${BADGE_ATTR}]`)) badge.remove()
    return
  }
  const snapshot = state.snapshot
  const byId = new Map(snapshot.logicalWorkspaces.map(workspace => [workspace.logicalWorkspaceId, workspace]))

  for (const row of document.querySelectorAll('[data-row-key^="workspace:"]')) {
    const key = row.getAttribute('data-row-key') ?? ''
    const workspaceId = key.slice('workspace:'.length)
    const workspace = byId.get(workspaceId)
    const badge = row.querySelector<HTMLSpanElement>(`:scope > [${BADGE_ATTR}]`)

    if (workspace === undefined || workspace.members.length === 0) {
      badge?.remove()
      continue
    }

    const target = mountBadge(row)
    const dot = target.querySelector<HTMLSpanElement>(`[${DOT_ATTR}]`)
    const label = target.querySelector<HTMLSpanElement>(`[${LABEL_ATTR}]`)
    if (dot !== null) dot.dataset.state = dotTone(snapshot, workspace)
    if (label !== null) {
      const { text, tooltip } = labelFor(workspace, t)
      if (label.textContent !== text) label.textContent = text
      if (target.title !== tooltip) target.title = tooltip
    }
  }
}

/**
 * Start decorating project rows. Returns a disposer that disconnects the
 * observer, unsubscribes from the store, and removes every badge it inserted.
 */
export function installProjectDeviceBadges(t: Translate): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {}
  }

  let frame = 0
  const schedule = (): void => {
    if (frame !== 0) return
    frame = requestAnimationFrame(() => {
      frame = 0
      try {
        syncRows(t)
      } catch {
        // A sidebar structure we do not recognize must never break the app.
      }
    })
  }

  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  const unsubscribe = clientStore.subscribe(schedule)
  schedule()

  return () => {
    observer.disconnect()
    unsubscribe()
    if (frame !== 0) cancelAnimationFrame(frame)
    for (const badge of document.querySelectorAll(`[${BADGE_ATTR}]`)) badge.remove()
  }
}

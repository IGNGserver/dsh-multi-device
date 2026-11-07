/**
 * Device badge and unread counter for sidebar project rows.
 *
 * DSH's sidebar exposes session-row slots only; the project (workspace) row has
 * no extension point, and its title is the single visible label. To show a
 * Codex-style connection dot plus a device label we decorate the row in the
 * DOM: a dot (green / amber / grey) followed by the device name when the
 * project lives on exactly one device, or `N个设备` when it spans several. The
 * same decoration carries the workspace's unread count, rolled up through
 * nested workspaces, because a collapsed parent row would otherwise hide its
 * children's unread completions.
 *
 * The decoration is additive and reversible: rows are matched by their stable
 * `data-row-key="workspace:<id>"` attribute, both badges are marker-tagged
 * spans, and the observer re-applies them after React re-renders. If DSH
 * changes its row markup the function simply finds nothing and leaves the
 * sidebar untouched.
 *
 * @module dsh-multi-device/client/projectBadges
 */
import { attentionUnreadIds } from '../attention.ts'
import {
  LOCAL_DEVICE_ID,
  type DisplayMode,
  type LogicalWorkspaceView,
  type MultiDeviceSnapshot,
} from '../contract.ts'
import { attentionLabels } from './AttentionDetails.tsx'
import { copyText } from './clipboard.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { clientStore, deviceStateToDotState } from './state.ts'
import { countableUnreadIds, workspaceUnreadCounts } from './unreadCounts.ts'

const BADGE_ATTR = 'data-dsh-md-device-badge'
const DOT_ATTR = 'data-dsh-md-device-dot'
const LABEL_ATTR = 'data-dsh-md-device-label'
const UNREAD_ATTR = 'data-dsh-md-project-unread'

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

/** Workspace unread badge has the same inspectable ID-only explanation. */
function mountUnreadBadge(row: Element, badge: HTMLSpanElement): HTMLDetailsElement {
  const existing = row.querySelector<HTMLDetailsElement>(`:scope > [${UNREAD_ATTR}]`)
  if (existing !== null) return existing
  const unread = document.createElement('details')
  unread.className = 'dsh-md-unread-count'
  unread.setAttribute(UNREAD_ATTR, '')
  unread.addEventListener('click', event => event.stopPropagation())
  unread.addEventListener('keydown', event => event.stopPropagation())
  const summary = document.createElement('summary')
  summary.style.cursor = 'pointer'
  const members = document.createElement('div')
  members.style.cssText = 'position:fixed;left:12px;top:80px;z-index:1000;max-height:60vh;max-width:min(520px,90vw);overflow:auto;padding:12px;background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:8px;white-space:normal'
  members.setAttribute('role', 'region')
  unread.append(summary, members)
  row.insertBefore(unread, badge)
  return unread
}

function workspaceUnreadMembers(workspaces: readonly LogicalWorkspaceView[], workspace: LogicalWorkspaceView, unread: ReadonlySet<string>): string[] {
  const normalize = (path: string): string => (/^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\') ? path.replaceAll('\\', '/') : path).replace(/\/+$/, '')
  const root = normalize(workspace.effectiveTargetPath ?? workspace.targetPath)
  const ids = new Set<string>()
  for (const candidate of workspaces) {
    const path = normalize(candidate.effectiveTargetPath ?? candidate.targetPath)
    if (candidate !== workspace && !path.startsWith(`${root}/`)) continue
    for (const id of candidate.sessionIds) if (unread.has(id)) ids.add(id)
  }
  return [...ids].sort()
}

function updateUnreadBadge(counter: HTMLDetailsElement, ids: readonly string[], label: string, stale: boolean, words: ReturnType<typeof attentionLabels>): void {
  const key = JSON.stringify([ids, label, stale, words])
  if (counter.dataset.attentionKey === key) return
  counter.dataset.attentionKey = key
  const summary = counter.firstElementChild!
  summary.textContent = label
  summary.setAttribute('aria-label', label)
  const members = counter.lastElementChild!
  members.setAttribute('aria-label', label)
  members.replaceChildren()
  if (stale) {
    const status = document.createElement('p')
    status.setAttribute('role', 'status')
    status.textContent = `${words.stale} (${words.last})`
    members.append(status)
  }
  const list = document.createElement('ul')
  for (const id of ids) {
    const item = document.createElement('li')
    item.setAttribute('data-attention-member', id)
    const code = document.createElement('code')
    code.textContent = id
    code.style.overflowWrap = 'anywhere'
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.textContent = words.copy
    copy.setAttribute('aria-label', `${copy.textContent}: ${id}`)
    copy.addEventListener('click', () => {
      void copyText(id).then(ok => { copy.textContent = ok ? words.copied : words.failed })
    })
    item.append(document.createTextNode(`${words.unread}: `), code, document.createTextNode(' '), copy)
    list.append(item)
  }
  members.append(list)
}

/** Reconcile every project row against the current snapshot. */
function syncRows(t: Translate): void {
  const state = clientStore.getSnapshot()
  if (!shouldDecorateProjectRows(state.displayMode)) {
    // The Host filters Native Mode data, but an aggressive DOM reconciler must
    // also erase badges when the snapshot flips to `native` while rows stay
    // mounted (mode switching keeps the local page alive).
    for (const badge of document.querySelectorAll(`[${BADGE_ATTR}]`)) badge.remove()
    for (const unread of document.querySelectorAll(`[${UNREAD_ATTR}]`)) unread.remove()
    return
  }
  const snapshot = state.snapshot
  const byId = new Map(snapshot.logicalWorkspaces.map(workspace => [workspace.logicalWorkspaceId, workspace]))
  // DSH renders archived rows only in the archived view and nests subagent
  // children under their parent, so both stay out of a row's visible count;
  // a remote ID missing from every catalog is a deleted Session.
  const unread = snapshot.attentionByDevice !== undefined ? attentionUnreadIds(snapshot.attentionByDevice) : countableUnreadIds(
    snapshot.unreadSessionIds,
    snapshot.archivedSessionIds,
    snapshot.subagentSessionIds,
    sessionId => snapshot.sessionOrigins[sessionId] !== undefined,
  )
  const unreadByWorkspace = workspaceUnreadCounts(snapshot.logicalWorkspaces, unread)

  for (const row of document.querySelectorAll('[data-row-key^="workspace:"]')) {
    const key = row.getAttribute('data-row-key') ?? ''
    const workspaceId = key.slice('workspace:'.length)
    const workspace = byId.get(workspaceId)
    const badge = row.querySelector<HTMLSpanElement>(`:scope > [${BADGE_ATTR}]`)
    const unreadBadge = row.querySelector<HTMLSpanElement>(`:scope > [${UNREAD_ATTR}]`)

    if (workspace === undefined || workspace.members.length === 0) {
      badge?.remove()
      unreadBadge?.remove()
      continue
    }

    const members = workspaceUnreadMembers(snapshot.logicalWorkspaces, workspace, unread)
    const count = snapshot.attentionByDevice !== undefined ? members.length : unreadByWorkspace.get(workspaceId) ?? 0
    const stale = snapshot.attentionByDevice !== undefined && workspace.members.some(member => snapshot.attentionByDevice?.[member.deviceId]?.fresh !== true)
    const words = attentionLabels(t)
    const target = mountBadge(row)
    if (count > 0 || stale) {
      const counter = mountUnreadBadge(row, target)
      const text = count > 0
        ? `${stale ? `${words.last}: ` : ''}${t('unreadCount').replace('{count}', String(count))}`
        : words.stale
      updateUnreadBadge(counter, members, text, stale, words)
      const tooltip = stale ? `${words.stale}; ${text}` : t('unreadTooltip').replace('{count}', String(count))
      if (counter.title !== tooltip) counter.title = tooltip
    } else {
      unreadBadge?.remove()
    }

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
    for (const unread of document.querySelectorAll(`[${UNREAD_ATTR}]`)) unread.remove()
  }
}

/**
 * Window/taskbar title for the local shell window.
 *
 * Three owners, in priority order:
 *
 * 1. The opt-in taskbar summary (`ui.taskbarSummary`): the Session status of
 *    the active device by default (`ui.taskbarSummaryScope === 'active'`), or
 *    every enabled device when explicitly set to `all`. The result is prefixed
 *    with the scope (`本机 1跑 2结`, `ubuntu-dev 1跑`, `全部 3跑 2结`) so a
 *    device-filtered number can never be mistaken for a fleet-wide total.
 * 2. A remote device tab: that device's own page title, reported by the bridge.
 * 3. Nothing: DSH keeps `document.title` naming the local conversation.
 *
 * DSH's layout owns `document.title` and derives it from the *local* Session
 * list. A remote page lives in a cross-origin frame, so its title never reaches
 * the parent document. The bridge reports that title through the Host snapshot;
 * this module applies it while a remote device tab is visible and restores
 * DSH's own title when the 本机 tab is active again.
 *
 * @module dsh-multi-device/client/windowTitle
 */
import {
  LOCAL_DEVICE_ID,
  type DeviceId,
  type DeviceView,
  type MultiDeviceSnapshot,
} from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { clientStore, type MultiDeviceClientState } from './state.ts'
import { formatTaskbarSummary, tallyTaskbarSessions, type TaskbarTranslate } from './taskbarSummary.ts'

/** Shortest useful title; longer values are bounded to keep taskbars sane. */
const MAX_TITLE_LENGTH = 300

function cleanTitle(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_LENGTH)
  return text === '' ? undefined : text
}

/** Inputs the title depends on; kept as a narrow shape so it is easy to test. */
export interface WindowTitleInput {
  readonly activeNativeDeviceId?: DeviceId
  readonly devices: readonly DeviceView[]
  /**
   * Aggregate task line when the taskbar-summary preference is on. `undefined`
   * means the preference is off, or nothing is running/waiting/unread.
   */
  readonly summary?: string
}

/**
 * Pick the title the local window should show, or `undefined` to leave DSH in
 * charge. The aggregate wins over the remote page title: it already covers
 * every device, including the one on screen.
 */
export function resolveWindowTitle(input: WindowTitleInput): string | undefined {
  const summary = cleanTitle(input.summary)
  if (summary !== undefined) return summary
  if (input.activeNativeDeviceId === undefined) return undefined
  const device = input.devices.find(
    candidate => candidate.id === input.activeNativeDeviceId && candidate.enabled !== false,
  )
  if (device === undefined) return undefined
  const remoteTitle = device.state === 'connected' ? cleanTitle(device.nativePaneTitle) : undefined
  return remoteTitle ?? cleanTitle(device.name)
}

/**
 * The aggregate line for one snapshot, or `undefined` to leave the title alone.
 *
 * Reads only the Host-published projection, so a toggle flip or a device count
 * change repaints the title without any extra request. The default `active`
 * scope follows the visible tab and labels the result with that device's name:
 * a window title next to the 本机 sidebar must not silently include a remote
 * device, which is exactly how a correct `2跑 2结` used to read as `4跑`.
 */
export function resolveTaskbarSummary(
  snapshot: MultiDeviceSnapshot,
  t: TaskbarTranslate,
  activeDeviceId?: DeviceId,
): string | undefined {
  if (snapshot.ui?.taskbarSummary !== true) return undefined
  if (snapshot.ui.taskbarSummaryScope === 'all') {
    return formatTaskbarSummary(tallyTaskbarSessions(snapshot), t, t('taskbarScopeAllTitle'))
  }
  const active = activeDeviceId === undefined
    ? undefined
    : snapshot.devices.find(device => device.id === activeDeviceId && device.enabled !== false)
  const deviceId = active?.id ?? LOCAL_DEVICE_ID
  const label = active?.name ?? t('nativeLocalTab')
  return formatTaskbarSummary(
    tallyTaskbarSessions(snapshot, { deviceIds: new Set([deviceId]) }),
    t,
    label,
  )
}

/**
 * Override `document.title` without losing DSH's own value.
 *
 * DSH's `DocumentTitle` component writes `document.title` from a React effect
 * whenever the local Session changes. A plain assignment from this plugin would
 * be silently overwritten. Shadowing the property lets us record DSH's writes
 * as `baseTitle` while the remote surface owns the visible window chrome.
 */
export class DocumentTitleController {
  private titleDescriptor: PropertyDescriptor | undefined
  private ownPropertyInstalled = false
  private baseTitle = ''
  private override: string | undefined
  private observer: MutationObserver | undefined
  private installed = false

  install(): boolean {
    if (this.installed) return true
    if (typeof document === 'undefined') return false
    this.installed = true

    let cursor: object | null = document
    let descriptor: PropertyDescriptor | undefined
    while (cursor !== null) {
      descriptor = Object.getOwnPropertyDescriptor(cursor, 'title')
      if (descriptor?.get !== undefined && descriptor.set !== undefined) break
      cursor = Object.getPrototypeOf(cursor) as object | null
    }

    if (descriptor?.get !== undefined && descriptor.set !== undefined) {
      this.titleDescriptor = descriptor
      try {
        this.baseTitle = String(descriptor.get.call(document))
        const self = this
        Object.defineProperty(document, 'title', {
          configurable: true,
          enumerable: descriptor.enumerable === true,
          get() {
            return self.titleDescriptor?.get?.call(document) ?? document.title
          },
          set(value: string) {
            const text = String(value)
            if (self.override === undefined || text !== self.override) self.baseTitle = text
            if (self.override === undefined) self.titleDescriptor?.set?.call(document, text)
          },
        })
        this.ownPropertyInstalled = true
        return true
      } catch {
        this.titleDescriptor = undefined
      }
    }

    // Fallback for shells where the instance property cannot be shadowed.
    // DSH writes are observed and re-corrected; the value DSH wrote while we
    // were overriding is lost, which is still better than a stale title.
    this.baseTitle = document.title
    if (typeof MutationObserver === 'undefined') return false
    try {
      let observedTitle = typeof document.querySelector === 'function'
        ? document.querySelector('head > title')
        : null
      const bindTarget = (obs: MutationObserver): void => {
        const currentTitle = typeof document.querySelector === 'function'
          ? document.querySelector('head > title')
          : null
        obs.disconnect()
        observedTitle = currentTitle
        if (currentTitle !== null) {
          obs.observe(currentTitle, { childList: true, characterData: true, subtree: true })
        } else {
          obs.observe(document.head ?? document.documentElement, {
            subtree: true,
            childList: true,
            characterData: true,
          })
        }
      }
      this.observer = new MutationObserver(() => {
        if ((observedTitle === null || !observedTitle.isConnected) && this.observer !== undefined) {
          bindTarget(this.observer)
        }
        if (this.override !== undefined && document.title !== this.override) {
          document.title = this.override
        }
      })
      bindTarget(this.observer)
      return true
    } catch {
      return false
    }
  }

  apply(next: string | undefined): void {
    if (!this.installed) return
    const normalized = next === undefined ? undefined : cleanTitle(next)
    if (normalized === this.override) return
    this.override = normalized
    const value = normalized ?? this.baseTitle
    try {
      this.titleDescriptor?.set?.call(document, value)
    } catch {
      try { document.title = value } catch { /* ignore */ }
    }
  }

  dispose(): void {
    this.observer?.disconnect()
    this.observer = undefined
    if (this.ownPropertyInstalled) {
      try { Reflect.deleteProperty(document, 'title') } catch { /* ignore */ }
      this.ownPropertyInstalled = false
    }
    this.override = undefined
    try { document.title = this.baseTitle } catch { /* ignore */ }
    this.installed = false
  }
}

/**
 * Install the Host/bridge-aware window title and return its cleanup.
 *
 * `t` is needed for the opt-in aggregate: the title is localized copy, not a
 * fixed string, and the same dictionary the tab strip uses.
 */
export function installWindowTitle(t: (key: MultiDeviceLocaleKey) => string): () => void {
  const controller = new DocumentTitleController()
  if (!controller.install()) return () => {}
  const sync = (): void => {
    const state: MultiDeviceClientState = clientStore.getSnapshot()
    try {
      const summary = resolveTaskbarSummary(state.snapshot, t, state.activeNativeDeviceId)
      controller.apply(resolveWindowTitle({
        ...(state.activeNativeDeviceId !== undefined
          ? { activeNativeDeviceId: state.activeNativeDeviceId }
          : {}),
        devices: state.snapshot.devices,
        ...(summary !== undefined ? { summary } : {}),
      }))
    } catch {
      // A title must never break the rest of the plugin.
    }
  }
  const unsubscribe = clientStore.subscribe(sync)
  sync()
  return () => {
    unsubscribe()
    controller.dispose()
  }
}

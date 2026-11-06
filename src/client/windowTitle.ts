/**
 * Window/taskbar title for the aggregated and native surfaces.
 *
 * DSH's layout owns `document.title` and derives it from the *local* Session
 * list. A remote page lives in a cross-origin iframe, so its title never reaches
 * the parent document. The bridge reports that title through the Host snapshot;
 * this module applies it while a remote device is the visible conversation and
 * restores DSH's own title when the 本机 surface is active again.
 *
 * @module dsh-multi-device/client/windowTitle
 */
import type { DeviceId, DeviceView, DisplayMode } from '../contract.ts'
import { nativePaneTarget } from './nativePane.ts'
import { clientStore, type MultiDeviceClientState } from './state.ts'

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
  readonly displayMode: DisplayMode
  readonly activeNativeDeviceId?: DeviceId
  readonly activeSessionId?: string
  readonly devices: readonly DeviceView[]
  readonly nativePaneEnabled: boolean
}

/**
 * Pick the title the local window should show, or `undefined` to leave DSH in
 * charge. In Native Mode a missing bridge title falls back to the device name;
 * in the aggregated pane a missing title is left to the local aggregated
 * Session row so no stale remote title can appear.
 */
export function resolveWindowTitle(input: WindowTitleInput): string | undefined {
  if (input.displayMode === 'native') {
    if (input.activeNativeDeviceId === undefined) return undefined
    const device = input.devices.find(candidate => candidate.id === input.activeNativeDeviceId)
    if (device === undefined) return undefined
    const remoteTitle = device.state === 'connected'
      ? cleanTitle(device.nativePaneTitle)
      : undefined
    return remoteTitle ?? cleanTitle(device.name)
  }

  if (!input.nativePaneEnabled) return undefined
  const target = nativePaneTarget('aggregated', input.activeSessionId)
  if (target === undefined) return undefined
  const device = input.devices.find(candidate => candidate.id === target.deviceId)
  if (device === undefined || device.state !== 'connected') return undefined
  if (device.nativePaneState !== 'ready') return undefined
  if (device.nativePaneSessionId !== target.rawSessionId) return undefined
  return cleanTitle(device.nativePaneTitle)
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
      this.observer = new MutationObserver(() => {
        if (this.override !== undefined && document.title !== this.override) {
          document.title = this.override
        }
      })
      this.observer.observe(document.head ?? document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
      })
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

/** Install the Host/bridge-aware window title and return its cleanup. */
export function installWindowTitle(): () => void {
  const controller = new DocumentTitleController()
  if (!controller.install()) return () => {}
  const sync = (): void => {
    const state: MultiDeviceClientState = clientStore.getSnapshot()
    try {
      controller.apply(resolveWindowTitle({
        displayMode: state.displayMode,
        ...(state.activeNativeDeviceId !== undefined
          ? { activeNativeDeviceId: state.activeNativeDeviceId }
          : {}),
        ...(state.activeSessionId !== undefined
          ? { activeSessionId: state.activeSessionId }
          : {}),
        devices: state.snapshot.devices,
        nativePaneEnabled: state.snapshot.ui?.nativePane !== false &&
          state.snapshot.hostStatus.nativeProxyActive,
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

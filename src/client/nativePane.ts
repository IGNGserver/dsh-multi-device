/**
 * Pure decision helpers for the aggregated Native Pane.
 *
 * The pane is intentionally conservative: it appears only when the framed
 * page's bridge is ready *and* the page already shows the selected raw
 * Session. Otherwise the local mirror stays visible, so a slow bridge, a
 * version mismatch or an unpainted layout never produces a blank or wrong
 * conversation.
 *
 * @module dsh-multi-device/client/nativePane
 */
import {
  decodeSessionId,
  type DeviceId,
  type DeviceView,
  type DisplayMode,
} from '../contract.ts'

/** The remote device + raw Session an aggregated conversation belongs to. */
export interface NativePaneTarget {
  readonly deviceId: DeviceId
  readonly rawSessionId: string
}

/** Decode the active Session into a pane target, or undefined for local/empty. */
export function nativePaneTarget(
  displayMode: DisplayMode,
  sessionId: string | undefined,
): NativePaneTarget | undefined {
  if (displayMode !== 'aggregated') return undefined
  if (sessionId === undefined || sessionId === '') return undefined
  const decoded = decodeSessionId(sessionId)
  if (!decoded.isRemote) return undefined
  return { deviceId: decoded.deviceId, rawSessionId: decoded.rawSessionId }
}

/** Inputs that decide whether the pane may cover the local conversation. */
export interface NativePaneVisibilityInput {
  readonly enabled: boolean
  readonly target: NativePaneTarget | undefined
  readonly device: DeviceView | undefined
  /** The pane's center-column geometry was measured successfully. */
  readonly geometryReady: boolean
}

/**
 * Whether the framed page is the visible conversation surface.
 *
 * - Bridge ready and already on the selected Session: show.
 * - Auth required/error: show the plugin's own auth panel inside the pane.
 * - Device offline/reconnecting: show the proxy's status page instead of a
 *   local mirror that would only produce a transport error.
 * - Bridge failed while the device is connected: hide (version/CSP mismatch)
 *   and leave the local mirror in place.
 */
export function shouldShowNativePane(input: NativePaneVisibilityInput): boolean {
  const { enabled, target, device, geometryReady } = input
  if (!enabled || target === undefined || device === undefined || !geometryReady) return false
  if (device.id !== target.deviceId) return false
  if (device.keepNativeAlive === false) return false
  if (device.authState === 'required' || device.authState === 'error') return true
  const paneState = device.nativePaneState ?? 'idle'
  if (device.state !== 'connected') {
    // The proxy serves its own "unavailable / retry" page; showing it is more
    // honest than a local mirror that can only wait for the same reconnect.
    return paneState === 'failed' || paneState === 'idle' || paneState === 'loading'
  }
  if (paneState !== 'ready') return false
  // Wait for the framed page to acknowledge the selection. A mismatch means
  // the command is still in flight (or the bridge ignored it); the local
  // mirror remains visible rather than flashing the wrong conversation.
  return device.nativePaneSessionId === target.rawSessionId
}

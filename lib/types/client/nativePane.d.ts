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
import { type DeviceId, type DeviceView, type DisplayMode } from '../contract.ts';
/** The remote device + raw Session an aggregated conversation belongs to. */
export interface NativePaneTarget {
    readonly deviceId: DeviceId;
    readonly rawSessionId: string;
}
/** Decode the active Session into a pane target, or undefined for local/empty. */
export declare function nativePaneTarget(displayMode: DisplayMode, sessionId: string | undefined): NativePaneTarget | undefined;
/** Inputs that decide whether the pane may cover the local conversation. */
export interface NativePaneVisibilityInput {
    readonly enabled: boolean;
    readonly target: NativePaneTarget | undefined;
    readonly device: DeviceView | undefined;
    /** The pane's center-column geometry was measured successfully. */
    readonly geometryReady: boolean;
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
export declare function shouldShowNativePane(input: NativePaneVisibilityInput): boolean;

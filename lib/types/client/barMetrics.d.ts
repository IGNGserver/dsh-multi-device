/**
 * Viewport geometry for the Native Mode tab bar.
 *
 * The tab strip is absolutely positioned against the Host frame. That frame is
 * normally the browser viewport, but an embedded remote page (Electron
 * `<webview>` or a wide iframe) can widen the layout, so `left: 0; right: 0`
 * resolves to a box wider than what the user can see. Right-aligned controls
 * (the Settings gear) then render
 * off-screen — the exact failure a Windows Desktop user reported: device tabs
 * visible, Settings missing, no way to open device settings.
 *
 * This module keeps the measurement pure and testable: {@link measureNativeBar}
 * decides the clamped width and the compact layout, while the live bar records
 * the last measurement so Diagnostics can report the real geometry.
 *
 * @module dsh-multi-device/client/barMetrics
 */
/** Width (CSS px) below which trailing controls move into the leading cluster. */
export declare const COMPACT_BAR_WIDTH = 720;
/** One measurement of the Native Mode tab bar against the visible viewport. */
export interface NativeBarMetrics {
    /** `window.innerWidth`; 0 when unknown (for example a headless render). */
    readonly innerWidth: number;
    /** `window.innerHeight`; 0 when unknown. */
    readonly innerHeight: number;
    readonly devicePixelRatio?: number;
    /** Frame-relative left edge of the bar. */
    readonly barLeft: number;
    /** Frame-relative width the bar would take before clamping. */
    readonly barWidth: number;
    /** Frame-relative right edge before clamping (`barLeft + barWidth`). */
    readonly barRight: number;
    /** Width the bar is allowed to occupy inside the visible viewport. */
    readonly clampedWidth: number;
    /** True when the clamped width is too narrow for a right-aligned switch. */
    readonly compact: boolean;
    readonly updatedAt: number;
}
export interface NativeBarBoxInput {
    readonly innerWidth: number;
    readonly innerHeight: number;
    readonly devicePixelRatio?: number;
    readonly left: number;
    readonly width: number;
    readonly now?: number;
}
/**
 * Decide the clamped width and layout for one bar measurement.
 *
 * `clampedWidth` never exceeds the visible viewport remainder
 * (`innerWidth - left`), so a right-aligned control can never be pushed
 * off-screen. A zero viewport (server-side or headless render) keeps the frame
 * width untouched.
 */
export declare function measureNativeBar(input: NativeBarBoxInput): NativeBarMetrics;
/** Whether the clipped frame actually hides part of the bar. */
export declare function barIsClipped(metrics: NativeBarMetrics): boolean;
/** Record the last live measurement, consumed by the Diagnostics report. */
export declare function recordNativeBarMetrics(metrics: NativeBarMetrics | undefined): void;
/** Read the last live measurement (undefined before the first render). */
export declare function readNativeBarMetrics(): NativeBarMetrics | undefined;

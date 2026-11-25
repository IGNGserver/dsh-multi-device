/**
 * Viewport geometry for the device tab bar.
 *
 * The tab strip spans the Host frame. That frame is normally the browser
 * viewport, but an embedded remote page (Electron `<webview>` or a wide iframe)
 * can widen the layout, so a box sized from the frame alone can be wider than
 * what the user can see. Right-aligned controls (the Settings gear) would then
 * render off-screen — the exact failure a Windows Desktop user reported:
 * device tabs visible, settings unreachable.
 *
 * **The frame is the only measurement source.** An earlier version fed the
 * bar's own `getBoundingClientRect()` back into this module and pinned the
 * result as `max-width`; the bar could shrink but never grow back, so after any
 * narrow window the trailing controls stayed parked mid-window with a dead band on
 * its right (the background colours are identical, so the boundary is
 * invisible and the band reads as "something invisible eats my clicks").
 * {@link resolveBarLayout} therefore takes the *frame* box, never the bar box.
 *
 * This module keeps the geometry pure and testable: {@link resolveBarLayout}
 * decides the box and the compact layout, {@link measureNativeBar} keeps the
 * Diagnostics numbers, and the live bar records the last measurement.
 *
 * @module dsh-multi-device/client/barMetrics
 */
/** Width (CSS px) below which trailing controls tighten their spacing. */
export declare const COMPACT_BAR_WIDTH = 720;
/** Fixed height (CSS px) of the persistent device tab bar across all platforms. */
export declare const NATIVE_BAR_HEIGHT = 42;
/**
 * Leading inset (CSS px) on windowed macOS Desktop so the first tab pill clears
 * Electron `hiddenInset` traffic lights (`x: ~16..68px`) with 12px of breathing room.
 */
export declare const DARWIN_TRAFFIC_LIGHT_INSET_START = 80;
/** Default leading/trailing inline padding (CSS px) on the device tab bar. */
export declare const DEFAULT_BAR_INSET_START = 12;
/** Safe air (CSS px) between the bottom of the device tab bar and DSH overlays. */
export declare const OVERLAY_SAFE_GAP = 12;
export type HostPlatformChromeKind = 'darwin-windowed' | 'darwin-fullscreen' | 'windows-titlebar' | 'windows-fullscreen' | 'standard';
export interface PlatformChromeInput {
    /** Value of `document.documentElement.dataset.platform` (set only by Desktop preload). */
    readonly platform?: string;
    /** True when `document.documentElement.hasAttribute('data-windows-titlebar')`. */
    readonly hasWindowsTitlebar: boolean;
    /** True when `document.documentElement.hasAttribute('data-fullscreen')`. */
    readonly fullscreen: boolean;
    /** Host-published `--dsh-frame-chrome-top` (or `--dsh-windows-titlebar-height`), in CSS px. */
    readonly chromeTop: number;
    /** Bar height override (defaults to {@link NATIVE_BAR_HEIGHT}). */
    readonly barHeight?: number;
}
export interface PlatformBarChrome {
    readonly kind: HostPlatformChromeKind;
    /** Offset from viewport/frame top where the device tab bar begins. */
    readonly barTop: number;
    /** Leading inline padding so tabs clear macOS traffic lights when present. */
    readonly insetStart: number;
    /** Total top padding reserved inside the Host frame (`barTop + barHeight`). */
    readonly frameReserveTop: number;
    /** Safe top inset (`frameReserveTop + 12`) published for DSH overlays/menus. */
    readonly overlayTop: number;
    /** Whether empty space on the tab bar acts as a macOS window-drag region. */
    readonly barDraggable: boolean;
}
/**
 * Single source of truth for cross-platform device tab bar placement.
 *
 * - **macOS Desktop (windowed)**: the 42px tab bar sits directly at `y = 0` as
 *   the unified title/drag bar, reserving `80px` on the leading edge for the
 *   `hiddenInset` traffic lights (`x: ~16..68px`). No extra 48px vibrancy gap.
 * - **macOS Desktop (fullscreen)**: traffic lights are hidden by macOS, so the
 *   leading inset shrinks back to `12px` while keeping `barTop = 0`.
 * - **Windows Desktop (windowed)**: the OS caption bar owns `0..chromeTop`, so
 *   the tab bar sits immediately below at `barTop = chromeTop`.
 * - **Windows Desktop (fullscreen) / Linux Desktop / Web**: `barTop = 0`,
 *   `insetStart = 12`.
 */
export declare function resolvePlatformBarChrome(input: PlatformChromeInput): PlatformBarChrome;
/** Host frame box, in viewport pixels, as read from `getBoundingClientRect()`. */
export interface BarLayoutInput {
    /** Frame left edge in viewport coordinates. */
    readonly frameLeft: number;
    /** Frame top edge in viewport coordinates. */
    readonly frameTop: number;
    /** Frame width; 0 when the frame is not laid out yet. */
    readonly frameWidth: number;
    readonly viewportWidth: number;
    /** Host chrome height above the frame content (Windows/macOS title bar). */
    readonly chromeTop: number;
}
/** Where the device tab bar sits, and how dense it has to be. */
export interface BarLayout {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly compact: boolean;
    /** The viewport cuts the frame's right edge, so the bar stops early. */
    readonly clipped: boolean;
}
/**
 * Resolve the bar box from the Host frame.
 *
 * Idempotent by construction: the result depends only on the frame and the
 * viewport, so a window that grows back after shrinking gets its full width
 * back on the very next measurement.
 */
export declare function resolveBarLayout(input: BarLayoutInput): BarLayout;
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
/**
 * What sits on top of the trailing controls, if anything.
 *
 * The bar can only be occluded by something the Host owns: its own overlay
 * children live in one stacking context, so a sibling seat with a higher
 * `z-index` (or a native window-controls strip) wins the hit test. Guessing
 * which one is hopeless from a screenshot, so the live bar probes the trailing
 * control centre with `document.elementFromPoint()` and records the answer here
 * for the Diagnostics report.
 */
export interface NativeBarObstruction {
    /** Short, copy-pasteable identity: tag, id, first classes, computed z-index. */
    readonly detail: string;
    readonly updatedAt: number;
}
/** Record (or clear) the last occlusion probe result. */
export declare function recordNativeBarObstruction(next: NativeBarObstruction | undefined): void;
/** Read the last occlusion probe result (undefined while nothing covers the switch). */
export declare function readNativeBarObstruction(): NativeBarObstruction | undefined;
/** Describe the element that swallowed a click, without leaking page text. */
export declare function describeObstruction(element: Element | null | undefined): string | undefined;

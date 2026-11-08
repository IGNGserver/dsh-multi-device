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

/** Width (CSS px) below which trailing controls move into the leading cluster. */
export const COMPACT_BAR_WIDTH = 720

/** Host frame box, in viewport pixels, as read from `getBoundingClientRect()`. */
export interface BarLayoutInput {
  /** Frame left edge in viewport coordinates. */
  readonly frameLeft: number
  /** Frame top edge in viewport coordinates. */
  readonly frameTop: number
  /** Frame width; 0 when the frame is not laid out yet. */
  readonly frameWidth: number
  readonly viewportWidth: number
  /** Host chrome height above the frame content (Windows/macOS title bar). */
  readonly chromeTop: number
}

/** Where the device tab bar sits, and how dense it has to be. */
export interface BarLayout {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly compact: boolean
  /** The viewport cuts the frame's right edge, so the bar stops early. */
  readonly clipped: boolean
}

/**
 * Resolve the bar box from the Host frame.
 *
 * Idempotent by construction: the result depends only on the frame and the
 * viewport, so a window that grows back after shrinking gets its full width
 * back on the very next measurement.
 */
export function resolveBarLayout(input: BarLayoutInput): BarLayout {
  const frameLeft = finiteNonNegative(input.frameLeft)
  const frameWidth = finiteNonNegative(input.frameWidth)
  const viewportWidth = finiteNonNegative(input.viewportWidth)
  const chromeTop = finiteNonNegative(input.chromeTop)
  // A frame wider than the viewport (embedded remote page) must not push the
  // right-aligned switch off-screen; a zero viewport (headless render) keeps
  // the frame width untouched.
  const visible = viewportWidth > 0 ? Math.max(0, viewportWidth - frameLeft) : frameWidth
  const width = frameWidth > 0 ? (visible > 0 ? Math.min(frameWidth, visible) : frameWidth) : visible
  return {
    left: frameLeft,
    top: finiteNonNegative(input.frameTop) + chromeTop,
    width,
    compact: width > 0 && width < COMPACT_BAR_WIDTH,
    clipped: frameWidth > 0 && visible > 0 && frameWidth > visible + 1,
  }
}

/** One measurement of the Native Mode tab bar against the visible viewport. */
export interface NativeBarMetrics {
  /** `window.innerWidth`; 0 when unknown (for example a headless render). */
  readonly innerWidth: number
  /** `window.innerHeight`; 0 when unknown. */
  readonly innerHeight: number
  readonly devicePixelRatio?: number
  /** Frame-relative left edge of the bar. */
  readonly barLeft: number
  /** Frame-relative width the bar would take before clamping. */
  readonly barWidth: number
  /** Frame-relative right edge before clamping (`barLeft + barWidth`). */
  readonly barRight: number
  /** Width the bar is allowed to occupy inside the visible viewport. */
  readonly clampedWidth: number
  /** True when the clamped width is too narrow for a right-aligned switch. */
  readonly compact: boolean
  readonly updatedAt: number
}

export interface NativeBarBoxInput {
  readonly innerWidth: number
  readonly innerHeight: number
  readonly devicePixelRatio?: number
  readonly left: number
  readonly width: number
  readonly now?: number
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

/**
 * Decide the clamped width and layout for one bar measurement.
 *
 * `clampedWidth` never exceeds the visible viewport remainder
 * (`innerWidth - left`), so a right-aligned control can never be pushed
 * off-screen. A zero viewport (server-side or headless render) keeps the frame
 * width untouched.
 */
export function measureNativeBar(input: NativeBarBoxInput): NativeBarMetrics {
  const innerWidth = finiteNonNegative(input.innerWidth)
  const left = finiteNonNegative(input.left)
  const width = finiteNonNegative(input.width)
  const visible = innerWidth > 0 ? Math.max(0, innerWidth - left) : width
  const clampedWidth = visible > 0 ? Math.min(width === 0 ? visible : width, visible) : width
  return {
    innerWidth,
    innerHeight: finiteNonNegative(input.innerHeight),
    ...(input.devicePixelRatio !== undefined ? { devicePixelRatio: input.devicePixelRatio } : {}),
    barLeft: left,
    barWidth: width,
    barRight: left + width,
    clampedWidth,
    compact: clampedWidth > 0 && clampedWidth < COMPACT_BAR_WIDTH,
    updatedAt: input.now ?? Date.now(),
  }
}

/** Whether the clipped frame actually hides part of the bar. */
export function barIsClipped(metrics: NativeBarMetrics): boolean {
  return metrics.barWidth > 0 && metrics.barRight > metrics.barLeft + metrics.clampedWidth + 1
}

let current: NativeBarMetrics | undefined

/** Record the last live measurement, consumed by the Diagnostics report. */
export function recordNativeBarMetrics(metrics: NativeBarMetrics | undefined): void {
  current = metrics
}

/** Read the last live measurement (undefined before the first render). */
export function readNativeBarMetrics(): NativeBarMetrics | undefined {
  return current
}

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
  readonly detail: string
  readonly updatedAt: number
}

let obstruction: NativeBarObstruction | undefined

/** Record (or clear) the last occlusion probe result. */
export function recordNativeBarObstruction(next: NativeBarObstruction | undefined): void {
  obstruction = next
}

/** Read the last occlusion probe result (undefined while nothing covers the switch). */
export function readNativeBarObstruction(): NativeBarObstruction | undefined {
  return obstruction
}

/** Describe the element that swallowed a click, without leaking page text. */
export function describeObstruction(element: Element | null | undefined): string | undefined {
  if (element === null || element === undefined) return undefined
  const tag = element.tagName.toLowerCase()
  const id = element.id === '' ? '' : `#${element.id}`
  const classes = Array.from(element.classList)
    .filter(name => !name.startsWith('dsh-md-'))
    .slice(0, 2)
    .map(name => `.${name}`)
    .join('')
  let zIndex = ''
  try {
    const style = globalThis.getComputedStyle?.(element)
    if (style !== undefined && style.zIndex !== 'auto' && style.zIndex !== '') zIndex = ` z=${style.zIndex}`
  } catch {
    // Cross-origin or detached node: the tag/class identity is still useful.
  }
  return `${tag}${id}${classes}${zIndex}`
}

/**
 * Geometry for the device tab strip's overlay scrollbar.
 *
 * The strip is a horizontal scroller whose native scrollbar is hidden
 * (`scrollbar-width: none`): a real one would eat 8–12px of the bar's fixed
 * 42px height and push the pills around. This module owns the two decisions
 * that can be made without a DOM, so both are unit-testable and the component
 * only wires events:
 *
 * - how big the thumb is and where it sits, from the scroller's own metrics;
 * - whether a wheel gesture belongs to the strip or to the page.
 *
 * The thumb is deliberately never smaller than {@link TAB_SCROLL_MIN_THUMB_WIDTH}
 * (a proportional thumb on a long strip becomes a 6px sliver that nothing can
 * hit), and a scroller within {@link TAB_SCROLL_EPSILON} of its content width
 * is treated as not scrollable, which is what a sub-pixel layout difference
 * looks like.
 *
 * @module dsh-multi-device/client/tabScroll
 */
/** Visible thumb height, in CSS px. The bar is 42px tall; this stays a hint. */
export declare const TAB_SCROLL_THUMB_HEIGHT = 3;
/** Smallest draggable thumb, in CSS px. */
export declare const TAB_SCROLL_MIN_THUMB_WIDTH = 24;
/** Content/box difference below this is layout noise, not scrollable content. */
export declare const TAB_SCROLL_EPSILON = 1;
export interface TabScrollMetricsInput {
    /** Visible width of the scroller (`clientWidth`). */
    readonly clientWidth: number;
    /** Full content width of the scroller (`scrollWidth`). */
    readonly scrollWidth: number;
    /** Current horizontal offset (`scrollLeft`). */
    readonly scrollLeft: number;
    readonly minThumbWidth?: number;
}
export interface TabScrollMetrics {
    /** False means "render no scrollbar at all", not "render a full-width thumb". */
    readonly scrollable: boolean;
    /** Thumb width in px; 0 when not scrollable. */
    readonly thumbWidth: number;
    /** Thumb offset from the track's left edge, in px; 0 when not scrollable. */
    readonly thumbLeft: number;
    /** Largest valid `scrollLeft`. */
    readonly maxScrollLeft: number;
}
/** Not scrollable: one shared object so callers can compare by identity. */
export declare const EMPTY_TAB_SCROLL_METRICS: TabScrollMetrics;
/**
 * Resolve the thumb box for one scroller measurement.
 *
 * `thumbLeft` is expressed against the *track* (the scroller's visible width),
 * so the caller can apply it as a `translateX` on a thumb that is already
 * positioned at the track's left edge.
 */
export declare function resolveTabScrollMetrics(input: TabScrollMetricsInput): TabScrollMetrics;
export interface TabScrollWheelInput {
    readonly deltaX: number;
    readonly deltaY: number;
    /** Current `scrollLeft`, used to clamp the converted delta. */
    readonly scrollLeft: number;
    readonly maxScrollLeft: number;
}
export interface TabScrollWheelResult {
    /** Horizontal px to add to `scrollLeft`; 0 when the gesture is not ours. */
    readonly delta: number;
    /** True when the caller must `preventDefault()` — the strip can consume it. */
    readonly consume: boolean;
}
/**
 * Convert a wheel gesture over the strip into horizontal scrolling.
 *
 * A horizontal delta (trackpad two-finger pan) is left to the browser, which
 * already scrolls the strip natively. A vertical wheel is converted only when
 * the strip can actually move in that direction, so the last pixel of travel
 * does not swallow the event.
 */
export declare function resolveTabScrollWheel(input: TabScrollWheelInput): TabScrollWheelResult;

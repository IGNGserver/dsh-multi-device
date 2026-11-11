/**
 * The device tab strip's overlay scrollbar.
 *
 * Why an overlay instead of the scroller's own scrollbar: the strip lives in a
 * fixed 42px bar, so a real horizontal scrollbar would take 8–12px of height
 * and squeeze every pill. The native one is already hidden
 * (`scrollbar-width: none`). This element is absolutely positioned inside the
 * **bar** — not inside the scroller, where it would scroll away with the tabs,
 * and not in flow, where its width or height would change the row. The strip's
 * layout is therefore byte-for-byte what it was before this existed; only a
 * paint layer is added.
 *
 * Visibility is CSS: hidden until the bar is hovered or focused, held open
 * while dragging, and briefly shown after a scroll on touch devices (where
 * there is no hover and the gesture is native panning, not a thumb drag).
 *
 * @module dsh-multi-device/client/TabScrollbar
 */
import React from 'react';
export interface TabScrollIndicatorProps {
    readonly scrollable: boolean;
    /** Track box, relative to the bar. */
    readonly left: number;
    readonly width: number;
    readonly thumbWidth: number;
    readonly thumbLeft: number;
    readonly dragging: boolean;
    /** A scroll happened moments ago; only used by the no-hover styling. */
    readonly active: boolean;
    readonly onThumbPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    readonly onThumbPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
    readonly onThumbPointerUp?: (event: React.PointerEvent<HTMLDivElement>) => void;
    readonly onThumbPointerCancel?: (event: React.PointerEvent<HTMLDivElement>) => void;
}
/**
 * Presentational thumb. Split from the measuring container so it can be
 * rendered without a DOM: tests assert the geometry it is handed, and that a
 * non-scrollable strip renders nothing at all rather than an empty track.
 */
export declare function TabScrollIndicator({ scrollable, left, width, thumbWidth, thumbLeft, dragging, active, onThumbPointerDown, onThumbPointerMove, onThumbPointerUp, onThumbPointerCancel, }: TabScrollIndicatorProps): React.ReactElement | null;
export interface TabScrollbarProps {
    /** The horizontal scroller (`.dsh-md-native-tabs`). */
    readonly scrollerRef: React.RefObject<HTMLDivElement | null>;
    /** The bar the overlay is positioned against. */
    readonly barRef: React.RefObject<HTMLDivElement | null>;
}
/**
 * Measure the strip and render its thumb.
 *
 * The measurement runs in a layout effect on every render (a tab appearing,
 * disappearing or being renamed all change `scrollWidth` without changing the
 * scroller's box), and is cheap: two `getBoundingClientRect` calls plus the
 * pure projection above. State is only written when a number actually changed,
 * so this cannot loop.
 */
export declare function TabScrollbar({ scrollerRef, barRef }: TabScrollbarProps): React.ReactElement | null;

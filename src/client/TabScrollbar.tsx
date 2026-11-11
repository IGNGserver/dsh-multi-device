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
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  EMPTY_TAB_SCROLL_METRICS,
  resolveTabScrollMetrics,
  resolveTabScrollWheel,
  type TabScrollMetrics,
} from './tabScroll.ts'

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** How long the thumb stays visible after a touch scroll. */
const SCROLL_HINT_MS = 700

export interface TabScrollIndicatorProps {
  readonly scrollable: boolean
  /** Track box, relative to the bar. */
  readonly left: number
  readonly width: number
  readonly thumbWidth: number
  readonly thumbLeft: number
  readonly dragging: boolean
  /** A scroll happened moments ago; only used by the no-hover styling. */
  readonly active: boolean
  readonly onThumbPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void
  readonly onThumbPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void
  readonly onThumbPointerUp?: (event: React.PointerEvent<HTMLDivElement>) => void
  readonly onThumbPointerCancel?: (event: React.PointerEvent<HTMLDivElement>) => void
}

/**
 * Presentational thumb. Split from the measuring container so it can be
 * rendered without a DOM: tests assert the geometry it is handed, and that a
 * non-scrollable strip renders nothing at all rather than an empty track.
 */
export function TabScrollIndicator({
  scrollable,
  left,
  width,
  thumbWidth,
  thumbLeft,
  dragging,
  active,
  onThumbPointerDown,
  onThumbPointerMove,
  onThumbPointerUp,
  onThumbPointerCancel,
}: TabScrollIndicatorProps): React.ReactElement | null {
  if (!scrollable || width <= 0 || thumbWidth <= 0) return null
  return (
    <div
      className="dsh-md-native-tab-scroll"
      data-scrollable="true"
      data-dragging={dragging ? 'true' : 'false'}
      data-active={active ? 'true' : 'false'}
      style={{ left: `${left}px`, width: `${width}px` }}
      aria-hidden="true"
    >
      <div
        className="dsh-md-native-tab-scroll-thumb"
        style={{ width: `${thumbWidth}px`, transform: `translateX(${thumbLeft}px)` }}
        {...(onThumbPointerDown === undefined ? {} : { onPointerDown: onThumbPointerDown })}
        {...(onThumbPointerMove === undefined ? {} : { onPointerMove: onThumbPointerMove })}
        {...(onThumbPointerUp === undefined ? {} : { onPointerUp: onThumbPointerUp })}
        {...(onThumbPointerCancel === undefined ? {} : { onPointerCancel: onThumbPointerCancel })}
      />
    </div>
  )
}

interface TabScrollGeometry {
  readonly left: number
  readonly width: number
  readonly metrics: TabScrollMetrics
}

function sameGeometry(left: TabScrollGeometry, right: TabScrollGeometry): boolean {
  return left.left === right.left
    && left.width === right.width
    && left.metrics.scrollable === right.metrics.scrollable
    && left.metrics.thumbWidth === right.metrics.thumbWidth
    && left.metrics.thumbLeft === right.metrics.thumbLeft
    && left.metrics.maxScrollLeft === right.metrics.maxScrollLeft
}

export interface TabScrollbarProps {
  /** The horizontal scroller (`.dsh-md-native-tabs`). */
  readonly scrollerRef: React.RefObject<HTMLDivElement | null>
  /** The bar the overlay is positioned against. */
  readonly barRef: React.RefObject<HTMLDivElement | null>
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
export function TabScrollbar({ scrollerRef, barRef }: TabScrollbarProps): React.ReactElement | null {
  const [geometry, setGeometry] = useState<TabScrollGeometry | undefined>(undefined)
  const [dragging, setDragging] = useState(false)
  const [active, setActive] = useState(false)
  const hintTimer = useRef<number | undefined>(undefined)
  const frame = useRef<number | undefined>(undefined)
  const drag = useRef<{
    readonly pointerId: number
    readonly startX: number
    readonly startScrollLeft: number
    /** Content px per thumb px, so dragging end-to-end covers the whole strip. */
    readonly ratio: number
  } | undefined>(undefined)

  const measure = useCallback((): void => {
    const scroller = scrollerRef.current
    const bar = barRef.current
    if (scroller === null || bar === null) return
    const scrollerRect = scroller.getBoundingClientRect()
    const barRect = bar.getBoundingClientRect()
    const next: TabScrollGeometry = {
      // clientLeft keeps the track aligned if the bar ever gains a border;
      // absolute positioning is relative to the padding box, not the border box.
      left: Math.round(scrollerRect.left - barRect.left - bar.clientLeft),
      width: Math.round(scrollerRect.width),
      metrics: resolveTabScrollMetrics({
        clientWidth: scroller.clientWidth,
        scrollWidth: scroller.scrollWidth,
        scrollLeft: scroller.scrollLeft,
      }),
    }
    setGeometry(previous => (
      previous !== undefined && sameGeometry(previous, next) ? previous : next
    ))
  }, [scrollerRef, barRef])

  const revealHint = useCallback((): void => {
    setActive(true)
    if (hintTimer.current !== undefined) window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => {
      hintTimer.current = undefined
      setActive(false)
    }, SCROLL_HINT_MS)
  }, [])

  useBrowserLayoutEffect(measure)

  useEffect(() => {
    const scroller = scrollerRef.current
    if (scroller === null) return
    const onScroll = (): void => {
      if (frame.current !== undefined) return
      frame.current = window.requestAnimationFrame(() => {
        frame.current = undefined
        measure()
        revealHint()
      })
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => { measure() })
    observer?.observe(scroller)
    window.addEventListener('resize', measure)
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      if (frame.current !== undefined) window.cancelAnimationFrame(frame.current)
      frame.current = undefined
      if (hintTimer.current !== undefined) window.clearTimeout(hintTimer.current)
      hintTimer.current = undefined
    }
  }, [scrollerRef, measure, revealHint])

  // Vertical wheel over the strip becomes horizontal travel. Registered
  // non-passively because React's onWheel is passive at the root; the strip is
  // a 42px fixed bar, so this steals nothing from the conversation scroll.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (scroller === null) return
    const onWheel = (event: WheelEvent): void => {
      // deltaMode 1 is lines and 2 is pages (Firefox wheels); normalize to px so
      // one notch does not move the strip by three pixels.
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1
      const result = resolveTabScrollWheel({
        deltaX: event.deltaX * scale,
        deltaY: event.deltaY * scale,
        scrollLeft: scroller.scrollLeft,
        maxScrollLeft: scroller.scrollWidth - scroller.clientWidth,
      })
      if (!result.consume) return
      event.preventDefault()
      scroller.scrollLeft += result.delta
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [scrollerRef])

  const onThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const scroller = scrollerRef.current
    const metrics = geometry?.metrics
    if (scroller === null || geometry === undefined || metrics === undefined || !metrics.scrollable) return
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
      ratio: metrics.maxScrollLeft / Math.max(1, geometry.width - metrics.thumbWidth),
    }
    setDragging(true)
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* older engines */ }
    // Stop the press from selecting the tab labels under the pointer.
    event.preventDefault()
  }

  const onThumbPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const current = drag.current
    const scroller = scrollerRef.current
    if (current === undefined || scroller === null || current.pointerId !== event.pointerId) return
    scroller.scrollLeft = current.startScrollLeft + (event.clientX - current.startX) * current.ratio
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = undefined
    setDragging(false)
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* already released */ }
  }

  const metrics = geometry?.metrics ?? EMPTY_TAB_SCROLL_METRICS
  return (
    <TabScrollIndicator
      scrollable={metrics.scrollable}
      left={geometry?.left ?? 0}
      width={geometry?.width ?? 0}
      thumbWidth={metrics.thumbWidth}
      thumbLeft={metrics.thumbLeft}
      dragging={dragging}
      active={active}
      onThumbPointerDown={onThumbPointerDown}
      onThumbPointerMove={onThumbPointerMove}
      onThumbPointerUp={endDrag}
      onThumbPointerCancel={endDrag}
    />
  )
}

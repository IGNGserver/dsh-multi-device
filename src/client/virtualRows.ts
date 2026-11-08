export interface VirtualWindow {
  readonly offsets: readonly number[]
  readonly start: number
  readonly end: number
  readonly top: number
  readonly bottom: number
  readonly total: number
}
function lowerBound(values: readonly number[], target: number): number {
  let low = 0, high = values.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (values[middle]! < target) low = middle + 1
    else high = middle
  }
  return low
}
/** Fixed-height rows with prefix offsets; end is exclusive and includes overscan. */
export function virtualWindow(heights: readonly number[], scrollTop: number, viewportHeight: number, overscan = 8): VirtualWindow {
  const offsets = new Array<number>(heights.length + 1)
  offsets[0] = 0
  for (let index = 0; index < heights.length; index += 1) offsets[index + 1] = offsets[index]! + Math.max(0, heights[index]!)
  const total = offsets[heights.length]!
  if (heights.length === 0 || viewportHeight <= 0) return { offsets, start: 0, end: 0, top: 0, bottom: total, total }
  const topOffset = Math.max(0, Math.min(scrollTop, total))
  const first = Math.min(heights.length - 1, Math.max(0, lowerBound(offsets, topOffset + 1) - 1))
  const visibleEnd = Math.min(heights.length, Math.max(first + 1, lowerBound(offsets, topOffset + viewportHeight)))
  const start = Math.max(0, first - overscan)
  const end = Math.min(heights.length, visibleEnd + overscan)
  return { offsets, start, end, top: offsets[start]!, bottom: total - offsets[end]!, total }
}

/**
 * Bounded frame queue shared by host-side multiplexed streams.
 *
 * A client that stops consuming `session.control`, `workspace.follow` or
 * `$events` must not make the host buffer frames without limit. Once the
 * backlog reaches the cap the producer stops appending and the consumer
 * throws, which tears the stream down so the next connection can start from
 * a fresh baseline instead of replaying an unbounded backlog.
 *
 * @module dsh-multi-device/host/stream-queue
 */

/** Maximum frames buffered for one consumer before the stream is failed. */
export const DEFAULT_STREAM_BACKLOG = 2048

export class BoundedStreamQueue<T> {
  private items: Array<T | undefined> = []
  private head = 0
  private size = 0
  private overflowed = false
  private wake: (() => void) | undefined

  constructor(private readonly limit: number = DEFAULT_STREAM_BACKLOG) {}

  /** Append a frame. Frames after the cap are dropped; the consumer will fail. */
  push(item: T): void {
    if (this.overflowed) return
    if (this.size >= this.limit) {
      this.overflowed = true
    } else {
      this.items.push(item)
      this.size += 1
    }
    this.notify()
  }

  shift(): T | undefined {
    if (this.size === 0) return undefined
    const item = this.items[this.head]
    this.items[this.head] = undefined
    this.head += 1
    this.size -= 1
    if (this.size === 0) {
      this.items = []
      this.head = 0
    } else if (this.head >= 1024 && this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head)
      this.head = 0
    }
    return item
  }

  get overflow(): boolean {
    return this.overflowed
  }

  /** Resolve when a frame arrives or the stream is aborted. */
  wait(): Promise<void> {
    return new Promise((resolve) => {
      this.wake = resolve
    })
  }

  /** Wake the consumer without adding a frame (abort or overflow). */
  notify(): void {
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }
}

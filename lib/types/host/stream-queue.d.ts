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
export declare const DEFAULT_STREAM_BACKLOG = 2048;
export declare class BoundedStreamQueue<T> {
    private readonly limit;
    private readonly items;
    private overflowed;
    private wake;
    constructor(limit?: number);
    /** Append a frame. Frames after the cap are dropped; the consumer will fail. */
    push(item: T): void;
    shift(): T | undefined;
    get overflow(): boolean;
    /** Resolve when a frame arrives or the stream is aborted. */
    wait(): Promise<void>;
    /** Wake the consumer without adding a frame (abort or overflow). */
    notify(): void;
}

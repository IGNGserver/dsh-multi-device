/**
 * Durable cross-Host completion identities from official, cold-safe unary RPCs.
 * A projection watermark is ONLY a legal page read cut, never a completion.
 * Only the raw seq and turn of a real turn/end form the shared identity.
 *
 * Official pages expose no Session header. Session IDs are immutable UUIDs and
 * already scope shared-state keys; the reader therefore uses turn:<seq>:<turn>.
 * It cannot distinguish unsupported manual reuse of the same Session UUID.
 */
import type { RemoteDeviceClient } from './remote-client.ts';
/**
 * Parse an official SessionPage (or snapshot with the same page fields).
 * An authentic optional header adds :<createdAt> to scope manually reused IDs.
 * No recursive searching, coercion, wall-clock inference, or mutation.
 */
export declare function parseCompletionIdentity(value: unknown): string | undefined;
/**
 * Call only after confirming idle; fence the result against lifecycle changes
 * and the expected local token before promotion. Failure/unsupported API/abort
 * means KEEP that local cursor, never wall-clock fallback across completions.
 *
 * Cost: projections cut + tail page maxMessages:1, at most four older pages at
 * the SAME cut, then a second projections read confirming the cut did not move.
 * No retries, no follow stream (which can activate a cold Agent), no shared
 * transport cancellation. Total deadline is five seconds, even for mocks that
 * ignore the passed signal. Registry owns batching, cache and lifecycle fences.
 */
export declare function readRemoteCompletionIdentity(client: Pick<RemoteDeviceClient, 'invokeUnary'>, rawSessionId: string, signal?: AbortSignal): Promise<string | undefined>;

/**
 * Unread counters for the device tab strip and the Settings device list.
 *
 * The Host publishes the raw read model in `unreadSessionIds`; it also names
 * the two Session classes DSH never renders as standalone sidebar rows
 * (archived and subagent-origin). Every counter therefore starts from
 * {@link countableUnreadIds} and never from the raw list, so a badge cannot
 * claim a reminder the sidebar is unable to show.
 *
 * Counts are pure projections: the Host owns read state and re-publishes the
 * snapshot on every change, so the UI recomputes instead of caching.
 *
 * @module dsh-multi-device/client/unreadCounts
 */
import { type DeviceId } from '../contract.ts';
/**
 * Drop unread Sessions DSH hides: archived rows (default collapsed) and
 * subagent children (nested under their parent's catalog).
 *
 * Missing Host fields (an older Host) mean "none hidden", which keeps the
 * counters working while the plugin is upgraded on only one side.
 *
 * @param existsRemoteSession - optional catalog membership check for remote
 *   IDs. A deleted Session that still sits in a persisted read set can never be
 *   opened again, so counting it would pin the badge; local IDs are owned by
 *   the Host's own DSH instance and are not checked here.
 */
export declare function countableUnreadIds(unreadSessionIds: readonly string[], archivedSessionIds?: readonly string[], subagentSessionIds?: readonly string[], existsRemoteSession?: (sessionId: string) => boolean): Set<string>;
export declare const EMPTY_UNREAD_SESSION_IDS: readonly string[];
/** Decode every unread ID once per snapshot instead of once per rendered device tab. */
export declare function groupUnreadSessionIds(unread: ReadonlySet<string>): ReadonlyMap<DeviceId, readonly string[]>;
/**
 * Count unread Sessions owned by one device.
 *
 * Local Sessions decode to `LOCAL_DEVICE_ID`, so the same helper serves the
 * leftmost 本机 tab and every remote tab. Unread snapshots are small and the
 * tab strip renders once per change; a linear scan keeps this dependency-free.
 */
export declare function unreadCountForDevice(unread: ReadonlySet<string>, deviceId: DeviceId): number;

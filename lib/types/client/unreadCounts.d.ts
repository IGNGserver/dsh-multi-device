/**
 * Unread counters for Native Mode tabs, Aggregated Mode workspace rows, and
 * the Settings device list.
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
import { type DeviceId, type LogicalWorkspaceView } from '../contract.ts';
/**
 * Drop unread Sessions DSH hides: archived rows (default collapsed) and
 * subagent children (nested under their parent's catalog).
 *
 * Missing Host fields (an older Host) mean "none hidden", which keeps the
 * counters working while the plugin is upgraded on only one side.
 */
export declare function countableUnreadIds(unreadSessionIds: readonly string[], archivedSessionIds?: readonly string[], subagentSessionIds?: readonly string[]): Set<string>;
/**
 * Count unread Sessions owned by one device.
 *
 * Local Sessions decode to `LOCAL_DEVICE_ID`, so the same helper serves the
 * leftmost 本机 tab and every remote tab. Unread snapshots are small and the
 * tab strip renders once per change; a linear scan keeps this dependency-free.
 */
export declare function unreadCountForDevice(unread: ReadonlySet<string>, deviceId: DeviceId): number;
/** Count unread Sessions among one logical workspace's merged Session IDs. */
export declare function unreadCountInSessions(unread: ReadonlySet<string>, sessionIds: readonly string[]): number;
/**
 * Per-logical-workspace unread counts, rolled up through nested Workspaces.
 *
 * A row shows its own unread Sessions plus every descendant Workspace's, so a
 * parent row stays truthful when the sidebar nests children under it. The
 * ancestor chain uses the same path semantics as DSH (nearest registered
 * parent, Windows separators normalized), and the merged row's effective
 * target path is the one DSH projects into the sidebar.
 *
 * @param workspaces - every logical workspace in the current snapshot.
 * @param unread - already filtered unread Session IDs (see {@link countableUnreadIds}).
 * @returns unread total keyed by logical workspace ID; absent means zero.
 */
export declare function workspaceUnreadCounts(workspaces: readonly LogicalWorkspaceView[], unread: ReadonlySet<string>): Map<string, number>;

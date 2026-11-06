/**
 * Pure Session-ownership resolvers shared by the conversation-page device chip,
 * the New Session device picker, and the sidebar row annotation.
 *
 * Everything here is React-free and side-effect-free so it can be unit tested
 * without a browser: the Host already namespaces Session ids and publishes
 * `sessionOrigins` plus the aggregated workspace tree, and these helpers answer
 * "which device owns this conversation" and "which devices could own it".
 *
 * @module dsh-multi-device/client/sessionDevice
 */
import { type DeviceConnectionState, type DeviceId, type LogicalWorkspaceView, type MultiDeviceSnapshot, type SessionOriginMetadata } from '../contract.ts';
/** Resolved ownership of one conversation. */
export interface SessionDeviceView {
    readonly deviceId: DeviceId;
    readonly name: string;
    readonly state: DeviceConnectionState;
    /** True for the local machine (rendered as 本机 instead of a remote name). */
    readonly isLocal: boolean;
    /** Present for remote Sessions that the Host has seen in a device catalog. */
    readonly origin?: SessionOriginMetadata;
    /** Epoch ms of the device's last successful catalog sync (cached rows included). */
    readonly lastSyncedAt?: number;
    /** Current reconnect attempt, for an actionable offline hint. */
    readonly reconnectAttempt?: number;
}
/** One device that could host a new Session in a logical workspace. */
export interface DeviceTargetOption {
    readonly deviceId: DeviceId;
    readonly name: string;
    readonly path: string;
    readonly state: DeviceConnectionState;
    readonly isLocal: boolean;
    readonly online: boolean;
    /** True when this device is the workspace's preferred target. */
    readonly preferred: boolean;
}
/**
 * Resolve which device owns a Session id.
 *
 * Local Sessions resolve to the synthetic `local` device even before the Host
 * has ever listed them, so the conversation-page chip never flickers.
 */
export declare function resolveSessionDevice(snapshot: MultiDeviceSnapshot, sessionId: string, localName: string): SessionDeviceView;
/**
 * Resolve the logical workspace a Session belongs to.
 *
 * Order matters: the Host's backfilled origin is authoritative, the merged
 * `sessionIds` list covers local Sessions, and the `cwd` fallback covers the
 * short window after `session/create` before any list frame arrives.
 */
export declare function resolveSessionLogicalWorkspace(snapshot: MultiDeviceSnapshot, sessionId: string, cwd?: string): LogicalWorkspaceView | undefined;
/**
 * Devices that already own this workspace.
 *
 * Settings uses this for the preferred-device picker: a preference is only
 * meaningful for a member, because the Host creates the next Session on the
 * member path without registering anything. The local machine is always
 * online; a remote device's state follows the latest Host snapshot.
 */
export declare function memberTargetsForWorkspace(snapshot: MultiDeviceSnapshot, workspace: LogicalWorkspaceView, localName: string): DeviceTargetOption[];
/**
 * List the devices that can host a new Session in one logical workspace.
 *
 * Every enabled device is a choice, not only devices that already registered
 * this repository: picking one that has no member registers the workspace path
 * there before the blank Session is created. The path shown for a non-member
 * is the workspace's own path (nothing is copied). The local machine is always
 * online; a remote device's state follows the latest Host snapshot.
 */
export declare function deviceTargetsForWorkspace(snapshot: MultiDeviceSnapshot, workspace: LogicalWorkspaceView, localName: string): DeviceTargetOption[];
/** Effective device for "+ New Session" (falls back while the preferred one is offline). */
export declare function effectiveTargetOf(snapshot: MultiDeviceSnapshot, workspace: LogicalWorkspaceView): DeviceTargetOption | undefined;
/** Whether a device is currently reachable in the aggregated surface. */
export declare function isDeviceOnline(state: DeviceConnectionState | undefined): boolean;

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
import {
  decodeSessionId,
  type DeviceConnectionState,
  type DeviceId,
  LOCAL_DEVICE_ID,
  type LogicalWorkspaceView,
  type MultiDeviceSnapshot,
  normalizeWorkspacePath,
  type SessionOriginMetadata,
} from '../contract.ts'

/** Resolved ownership of one conversation. */
export interface SessionDeviceView {
  readonly deviceId: DeviceId
  readonly name: string
  readonly state: DeviceConnectionState
  /** True for the local machine (rendered as 本机 instead of a remote name). */
  readonly isLocal: boolean
  /** Present for remote Sessions that the Host has seen in a device catalog. */
  readonly origin?: SessionOriginMetadata
  /** Epoch ms of the device's last successful catalog sync (cached rows included). */
  readonly lastSyncedAt?: number
  /** Current reconnect attempt, for an actionable offline hint. */
  readonly reconnectAttempt?: number
}

/** One device that could host a new Session in a logical workspace. */
export interface DeviceTargetOption {
  readonly deviceId: DeviceId
  readonly name: string
  readonly path: string
  readonly state: DeviceConnectionState
  readonly isLocal: boolean
  readonly online: boolean
  /** True when this device is the workspace's preferred target. */
  readonly preferred: boolean
}

/**
 * Resolve which device owns a Session id.
 *
 * Local Sessions resolve to the synthetic `local` device even before the Host
 * has ever listed them, so the conversation-page chip never flickers.
 */
export function resolveSessionDevice(
  snapshot: MultiDeviceSnapshot,
  sessionId: string,
  localName: string,
): SessionDeviceView {
  const decoded = decodeSessionId(sessionId)
  if (!decoded.isRemote) {
    return {
      deviceId: LOCAL_DEVICE_ID,
      name: localName,
      state: 'connected',
      isLocal: true,
    }
  }
  const origin = snapshot.sessionOrigins[sessionId]
  const device = snapshot.devices.find(candidate => candidate.id === decoded.deviceId)
  return {
    deviceId: decoded.deviceId,
    name: origin?.deviceName ?? device?.name ?? String(decoded.deviceId),
    state: origin?.deviceState ?? device?.state ?? 'disabled',
    isLocal: false,
    ...(origin !== undefined ? { origin } : {}),
    ...(device?.lastSyncedAt !== undefined ? { lastSyncedAt: device.lastSyncedAt } : {}),
    ...(device?.reconnectAttempt !== undefined ? { reconnectAttempt: device.reconnectAttempt } : {}),
  }
}

/**
 * Resolve the logical workspace a Session belongs to.
 *
 * Order matters: the Host's backfilled origin is authoritative, the merged
 * `sessionIds` list covers local Sessions, and the `cwd` fallback covers the
 * short window after `session/create` before any list frame arrives.
 */
export function resolveSessionLogicalWorkspace(
  snapshot: MultiDeviceSnapshot,
  sessionId: string,
  cwd?: string,
): LogicalWorkspaceView | undefined {
  const origin = snapshot.sessionOrigins[sessionId]
  if (origin?.logicalWorkspaceId !== undefined) {
    const byOrigin = snapshot.logicalWorkspaces.find(
      workspace => workspace.logicalWorkspaceId === origin.logicalWorkspaceId,
    )
    if (byOrigin !== undefined) return byOrigin
  }

  const listed = snapshot.logicalWorkspaces.find(workspace =>
    workspace.sessionIds.includes(sessionId),
  )
  if (listed !== undefined) return listed

  const key = cwd === undefined ? '' : normalizeWorkspacePath(cwd)
  if (key === '') return undefined
  const member = snapshot.allPhysicalWorkspaces.find(
    workspace => normalizeWorkspacePath(workspace.path) === key,
  )
  if (member === undefined) return undefined
  return snapshot.logicalWorkspaces.find(workspace =>
    workspace.members.some(
      candidate =>
        candidate.deviceId === member.deviceId &&
        normalizeWorkspacePath(candidate.path) === normalizeWorkspacePath(member.path),
    ),
  )
}

/**
 * Devices that already own this workspace.
 *
 * Settings uses this for the preferred-device picker: a preference is only
 * meaningful for a member, because the Host creates the next Session on the
 * member path without registering anything. The local machine is always
 * online; a remote device's state follows the latest Host snapshot.
 */
export function memberTargetsForWorkspace(
  snapshot: MultiDeviceSnapshot,
  workspace: LogicalWorkspaceView,
  localName: string,
): DeviceTargetOption[] {
  return workspace.members.map((member) => {
    const isLocal = member.deviceId === LOCAL_DEVICE_ID
    const device = snapshot.devices.find(candidate => candidate.id === member.deviceId)
    const state: DeviceConnectionState = isLocal ? 'connected' : device?.state ?? 'disabled'
    return {
      deviceId: member.deviceId,
      name: isLocal ? localName : device?.name ?? member.deviceName,
      path: member.path,
      state,
      isLocal,
      online: state === 'connected',
      preferred: member.deviceId === workspace.targetDeviceId,
    }
  })
}

/**
 * List the devices that can host a new Session in one logical workspace.
 *
 * Every enabled device is a choice, not only devices that already registered
 * this repository: picking one that has no member registers the workspace path
 * there before the blank Session is created. The path shown for a non-member
 * is the workspace's own path (nothing is copied). The local machine is always
 * online; a remote device's state follows the latest Host snapshot.
 */
export function deviceTargetsForWorkspace(
  snapshot: MultiDeviceSnapshot,
  workspace: LogicalWorkspaceView,
  localName: string,
): DeviceTargetOption[] {
  const memberByDevice = new Map(workspace.members.map(member => [member.deviceId, member]))
  const targets: DeviceTargetOption[] = []
  const seen = new Set<DeviceId>()

  const push = (
    deviceId: DeviceId,
    name: string,
    state: DeviceConnectionState,
    isLocal: boolean,
  ): void => {
    if (seen.has(deviceId)) return
    seen.add(deviceId)
    const member = memberByDevice.get(deviceId)
    targets.push({
      deviceId,
      name,
      path: member?.path ?? workspace.targetPath,
      state,
      isLocal,
      online: state === 'connected',
      preferred: deviceId === workspace.targetDeviceId,
    })
  }

  push(LOCAL_DEVICE_ID, localName, 'connected', true)
  for (const device of snapshot.devices) {
    if (!device.enabled) continue
    push(device.id, device.name, device.state, false)
  }
  // A member whose device row is gone (removed mid-session) still belongs in
  // the list: its workspace already exists, even though it cannot be reached.
  for (const member of workspace.members) {
    if (seen.has(member.deviceId)) continue
    const isLocal = member.deviceId === LOCAL_DEVICE_ID
    push(
      member.deviceId,
      isLocal ? localName : member.deviceName,
      isLocal ? 'connected' : 'disabled',
      isLocal,
    )
  }
  return targets
}

/** Effective device for "+ New Session" (falls back while the preferred one is offline). */
export function effectiveTargetOf(
  snapshot: MultiDeviceSnapshot,
  workspace: LogicalWorkspaceView,
): DeviceTargetOption | undefined {
  const options = memberTargetsForWorkspace(snapshot, workspace, '')
  return options.find(option => option.deviceId === workspace.effectiveTargetDeviceId) ?? options[0]
}

/** Whether a device is currently reachable in the aggregated surface. */
export function isDeviceOnline(state: DeviceConnectionState | undefined): boolean {
  return state === 'connected'
}

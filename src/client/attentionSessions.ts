/**
 * Turn the Host's attention projection (bare Session IDs) into rows a person
 * can read: owning device, category and — when the browser already knows the
 * Session — the conversation title from DSH's own Session store.
 *
 * The projection itself is ID-only on purpose (`src/attention.ts` never carries
 * titles or message text), and in Native Mode the Host does not project remote
 * Session rows into the local snapshot any more: each device's conversations
 * live inside that device's own page. So this join deliberately has no
 * cross-device catalog to read. It supplies the identity and lets the caller
 * pass a live title resolver for Sessions the local store does know.
 *
 * Pure and synchronous: the component owns rendering, this owns the join.
 *
 * @module dsh-multi-device/client/attentionSessions
 */

import { decodeSessionId, LOCAL_DEVICE_ID, type MultiDeviceSnapshot } from '../contract.ts'

/** One readable attention row. */
export interface AttentionSessionRow {
  readonly sessionId: string
  readonly rawSessionId: string
  readonly deviceId: string
  readonly deviceName: string
  /** Real conversation title; `''` when nothing knows one yet. */
  readonly title: string
  readonly cwd?: string
}

export interface AttentionJoinOptions {
  /** Localized label for this machine (本机 / This Device). */
  readonly localDeviceName: string
  /** Live DSH Session store lookup, used when the browser already has a row. */
  readonly title?: (sessionId: string) => string | undefined
  /**
   * The device this attention view belongs to. The tab strip renders one view
   * per device, so the caller already knows it and the snapshot does not have
   * to carry a cross-device origin map.
   */
  readonly owningDeviceId?: string
  readonly owningDeviceName?: string
}

function cleanTitle(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

/** Last non-empty path segment, tolerating both separators. */
export function pathBasename(path: string | undefined): string | undefined {
  if (path === undefined) return undefined
  const trimmed = path.replace(/[/\\]+$/, '')
  if (trimmed === '') return undefined
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return trimmed.slice(index + 1) === '' ? undefined : trimmed.slice(index + 1)
}

/**
 * Join one ID to what the device UI can show for it.
 *
 * Every lookup degrades independently: a Session whose device was just removed
 * still renders its raw ID instead of blanking the popover out.
 */
export function resolveAttentionSession(
  sessionId: string,
  snapshot: MultiDeviceSnapshot,
  options: AttentionJoinOptions,
): AttentionSessionRow {
  const decoded = decodeSessionId(sessionId)
  const deviceId = decoded.isRemote
    ? String(decoded.deviceId)
    : options.owningDeviceId ?? String(LOCAL_DEVICE_ID)
  const device = snapshot.devices.find(candidate => String(candidate.id) === deviceId)
  const deviceName = decoded.isRemote
    ? cleanTitle(options.owningDeviceName) ?? cleanTitle(device?.name) ?? String(decoded.deviceId)
    : options.localDeviceName
  return {
    sessionId,
    rawSessionId: decoded.isRemote ? decoded.rawSessionId : sessionId,
    deviceId,
    deviceName,
    title: cleanTitle(options.title?.(sessionId)) ?? '',
  }
}

/** Join a whole category, preserving the Host's order. */
export function resolveAttentionSessions(
  sessionIds: readonly string[],
  snapshot: MultiDeviceSnapshot,
  options: AttentionJoinOptions,
): AttentionSessionRow[] {
  return sessionIds.map(sessionId => resolveAttentionSession(sessionId, snapshot, options))
}

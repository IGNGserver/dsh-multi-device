/** Versioned durable codec for raw remote Session/Workspace catalogs. */
import { DeviceId, LOCAL_DEVICE_ID, type DeviceCatalogCache } from '../contract.ts'
import { catalogSessionIds, isCatalogRecord, parseSessionSummary, parseWorkspace } from './device-catalog.ts'

export interface CatalogDocumentV2 { readonly version: 2; readonly catalogs: Readonly<Record<string, DeviceCatalogCache>> }
function invalid(message: string): never { throw new SyntaxError(`Invalid catalog document: ${message}`) }
function ids(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array`)
  const parsed = catalogSessionIds(value)
  if (parsed.length !== value.length) invalid(`${label} contains an invalid or duplicate raw Session ID`)
  return parsed
}
function catalog(deviceId: DeviceId, value: unknown): DeviceCatalogCache {
  if (!isCatalogRecord(value) || value.deviceId !== deviceId || !Number.isFinite(value.syncedAt) ||
    !['0.2', '0.1', 'unknown'].includes(value.protocolVersion as string) ||
    (value.catalogTruncated !== undefined && typeof value.catalogTruncated !== 'boolean') ||
    !Array.isArray(value.sessions) || !Array.isArray(value.workspaces)) invalid(`device ${deviceId} has an invalid header`)
  const sessions = value.sessions.map((item, index) => {
    const summary = parseSessionSummary(item, true)
    if (summary === undefined) invalid(`device ${deviceId} Session ${index} is invalid`)
    if (isCatalogRecord(item) && item.title !== undefined && typeof item.title !== 'string') invalid(`device ${deviceId} Session ${index} title is invalid`)
    return {
      ...(isCatalogRecord(item) && typeof item.title === 'string' ? { title: item.title } : {}),
      sessionId: summary.sessionId, updatedAt: summary.updatedAt, agentAvailable: summary.agentAvailable,
      running: summary.running, blank: summary.blank,
      ...(summary.parentSessionId !== undefined ? { parentSessionId: summary.parentSessionId } : {}),
      ...(summary.origin !== undefined ? { origin: summary.origin } : {}),
      ...(summary.cwd !== undefined ? { cwd: summary.cwd } : {}),
    }
  })
  if (new Set(sessions.map(item => item.sessionId)).size !== sessions.length) invalid(`device ${deviceId} contains duplicate Session IDs`)
  const workspaces = value.workspaces.map((item, index) => {
    if (isCatalogRecord(item)) ids(item.sessionIds, `device ${deviceId} Workspace ${index} sessions`)
    const workspace = parseWorkspace(item, true)
    if (workspace === undefined) invalid(`device ${deviceId} Workspace ${index} is invalid`)
    return { ...workspace }
  })
  if (new Set(workspaces.map(item => item.workspaceId)).size !== workspaces.length) invalid(`device ${deviceId} contains duplicate Workspace IDs`)
  return {
    deviceId, syncedAt: value.syncedAt as number, protocolVersion: value.protocolVersion as DeviceCatalogCache['protocolVersion'],
    sessions, workspaces,
    archivedSessionIds: ids(value.archivedSessionIds, `device ${deviceId} archived IDs`),
    pinnedSessionIds: ids(value.pinnedSessionIds, `device ${deviceId} pinned IDs`),
    ...(value.catalogTruncated !== undefined ? { catalogTruncated: value.catalogTruncated === true } : {}),
  }
}
function catalogs(value: unknown): Map<DeviceId, DeviceCatalogCache> {
  if (!isCatalogRecord(value)) invalid('catalogs must be an object')
  const result = new Map<DeviceId, DeviceCatalogCache>()
  for (const [key, item] of Object.entries(value)) {
    if (key === '' || key === LOCAL_DEVICE_ID || key.length > 160) invalid('device key is invalid')
    const deviceId = DeviceId(key)
    result.set(deviceId, catalog(deviceId, item))
  }
  return result
}
export function decodeCatalogDocument(value: unknown): Map<DeviceId, DeviceCatalogCache> {
  if (!isCatalogRecord(value) || value.version !== 2) invalid('expected version 2')
  return catalogs(value.catalogs)
}
/** Legacy v1 embedded catalogs have no wrapper version; device ownership remains explicit. */
export function decodeLegacyCatalogs(value: unknown): Map<DeviceId, DeviceCatalogCache> { return catalogs(value) }
export function encodeCatalogDocument(values: ReadonlyMap<DeviceId, DeviceCatalogCache>): CatalogDocumentV2 {
  const result: Record<string, DeviceCatalogCache> = {}
  for (const [deviceId, cache] of values) {
    // Reuse the decoder as a write-side schema check, including raw-ID validation.
    result[deviceId] = catalog(deviceId, cache)
  }
  return { version: 2, catalogs: result }
}

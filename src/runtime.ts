/**
 * Host Control-Plane HTTP & RPC Endpoints (`MultiDeviceControlPlane`).
 *
 * Exposes all device management, SSH config discovery, connection testing,
 * and Git workspace aggregation operations over:
 * 1. Direct authenticated HTTP JSON route `/multi-device/api` (plus SSE `/multi-device/events`),
 *    which has zero dependency on Typert reflection or Aggregated Gateway state — ensuring
 *    that Native Mode and Device Management ALWAYS work even if Aggregated Mode fails!
 * 2. Optional Typert Remote registration (`multiDevice/*`) when `ctx.typert` is present.
 *
 * @module dsh-multi-device/runtime
 */
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {
  DeviceId,
  DeviceView,
  ManualWorkspaceRule,
  MultiDeviceSnapshot,
  RemoteSessionCreateInput,
  RemoteWorkspaceCreateInput,
  UpsertDeviceInput,
  WorkspaceAggregationConfig,
} from './contract.ts'
import type { DeviceRegistry } from './host/registry.ts'

export const MULTI_DEVICE_API_PATH = '/multi-device/api'
export const MULTI_DEVICE_EVENTS_PATH = '/multi-device/events'

const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_ACTIVE_CONTROL_REQUESTS = 64
const CONTROL_REQUEST_DEADLINE_MS = 60_000
const BODY_READ_DEADLINE_MS = 15_000
const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** True when the Host header is this machine's loopback, including `[::1]`. */
export function isLoopbackHostHeader(hostHeader: string | undefined): boolean {
  const host = (hostHeader ?? '').trim().toLowerCase()
  if (LOOPBACK_NAMES.has(host)) return true
  return host.startsWith('127.0.0.1:') || host.startsWith('localhost:') || host.startsWith('[::1]:')
}

/**
 * Admit a control-plane request only from loopback, and only when Origin
 * matches that host. `extraRejection` may add a rejection; a missing hook
 * does not admit a non-loopback caller.
 */
export function admitControlPlaneRequest(
  headers: IncomingHttpHeaders,
  extraRejection?: (headers: IncomingHttpHeaders) => number | undefined,
): boolean {
  const host = headers.host ?? ''
  if (!isLoopbackHostHeader(host)) return false
  if (headers['sec-fetch-site'] === 'cross-site') return false
  const origin = headers.origin
  if (typeof origin === 'string' && origin !== '') {
    try {
      const parsed = new URL(origin)
      if (!LOOPBACK_NAMES.has(parsed.hostname.toLowerCase())) return false
      if (parsed.host.toLowerCase() !== host.toLowerCase()) return false
    } catch {
      return false
    }
  }
  if (extraRejection?.(headers) !== undefined) return false
  return true
}

/**
 * Host connection fence consulted on every control-plane request.
 *
 * The method must be invoked on the object returned by `get('connection')`.
 * Cordis wraps that service in a traceable proxy whose methods are not safe
 * to detach: a bare `reject(req)` runs with `this === undefined` and throws
 * inside `requestRejection` (`Cannot read properties of undefined (reading 'admit')`),
 * which DSH treats as a fatal load failure.
 */
export interface ConnectionRejectionService {
  requestRejection?: (request: { headers: IncomingHttpHeaders }) => number | undefined
}

/** Read `connection` from the plugin context. A missing service is not an error. */
export function readConnectionService(ctx: Context): ConnectionRejectionService | undefined {
  try {
    return (ctx as unknown as { get?: (key: string) => unknown }).get?.('connection') as
      | ConnectionRejectionService
      | undefined
  } catch {
    return undefined
  }
}

/**
 * Ask the Host connection service whether this request is rejected.
 *
 * Re-reads the service on every call and invokes `requestRejection` as a
 * method, matching `dsh-host-open-in-app`. A missing hook admits nothing
 * extra (returns `undefined`). A throwing hook fails closed (`403`) so the
 * exception never leaves the HTTP handler.
 */
export function connectionRequestRejection(
  ctx: Context,
  headers: IncomingHttpHeaders,
): number | undefined {
  const connection = readConnectionService(ctx)
  if (connection === undefined || typeof connection.requestRejection !== 'function') return undefined
  try {
    return connection.requestRejection({ headers })
  } catch {
    return 403
  }
}

/**
 * Admit one control-plane request: loopback fence first, then the Host
 * connection service. Setup failures and a throwing connection hook both
 * fail closed instead of crashing the host.
 */
export function admitMultiDeviceRequest(ctx: Context, req: IncomingMessage): boolean {
  try {
    return admitControlPlaneRequest(req.headers, (headers) => connectionRequestRejection(ctx, headers))
  } catch {
    return false
  }
}

export interface ControlPlaneRequest {
  readonly action:
    | 'snapshot'
    | 'catalogSessionAction'
    | 'searchCatalogSessions'
    | 'modelCatalog'
    | 'diagnostics'
    | 'setDisplayMode'
    | 'upsertDevice'
    | 'removeDevice'
    | 'reconnectDevice'
    | 'authenticateDevice'
    | 'testDevice'
    | 'listSshKeys'
    | 'startSessionOnDevice'
    | 'createSession'
    | 'createRemoteWorkspace'
    | 'updateAggregationConfig'
    | 'upsertManualRule'
    | 'removeManualRule'
    | 'setMemberExcluded'
    | 'setPreferredDevice'
    | 'setCustomTitle'
    | 'startGitMatch'
    | 'cancelGitMatch'
    | 'setActiveSession'
    | 'markSessionRead'
    | 'markDeviceRead'
    | 'setUiPreferences'
  readonly payload?: Record<string, unknown>
}

const CONTROL_ACTIONS: ReadonlySet<string> = new Set<ControlPlaneRequest['action']>([
  'snapshot', 'catalogSessionAction', 'searchCatalogSessions', 'modelCatalog', 'diagnostics',
  'setDisplayMode', 'upsertDevice', 'removeDevice', 'reconnectDevice', 'authenticateDevice',
  'testDevice', 'listSshKeys', 'startSessionOnDevice', 'createSession', 'createRemoteWorkspace',
  'updateAggregationConfig', 'upsertManualRule', 'removeManualRule', 'setMemberExcluded',
  'setPreferredDevice', 'setCustomTitle', 'startGitMatch', 'cancelGitMatch', 'setActiveSession',
  'markSessionRead', 'markDeviceRead', 'setUiPreferences',
])

/** Validate the transport envelope before TypeScript erases its runtime types. */
export function parseControlPlaneRequest(value: unknown): ControlPlaneRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a request object')
  const candidate = value as { action?: unknown; payload?: unknown }
  if (typeof candidate.action !== 'string' || !CONTROL_ACTIONS.has(candidate.action)) throw new Error('Unknown action')
  if (candidate.payload !== undefined && (candidate.payload === null || typeof candidate.payload !== 'object' || Array.isArray(candidate.payload))) {
    throw new Error('Payload must be an object')
  }
  const request = candidate as ControlPlaneRequest
  validateControlPlanePayload(request)
  return request
}

type Payload = Record<string, unknown>
function payloadString(payload: Payload, key: string, required = true, max = 4096, allowEmpty = false): void {
  const value = payload[key]
  if (value === undefined && !required) return
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.trim() === '')) {
    throw new Error(`${key} must be ${required ? 'a' : 'an optional'} ${allowEmpty ? '' : 'non-empty '}string of at most ${max} characters`)
  }
}
function payloadBoolean(payload: Payload, key: string, required = false): void {
  const value = payload[key]
  if (value === undefined && !required) return
  if (typeof value !== 'boolean') throw new Error(`${key} must be ${required ? 'a' : 'an optional'} boolean`)
}
function payloadPort(payload: Payload, key: string): void {
  const value = payload[key]
  if (value === undefined) return
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 65_535) throw new Error(`${key} must be an integer from 1 to 65535`)
}
function payloadObject(value: unknown, key: string): Payload {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${key} must be an object`)
  return value as Payload
}
function payloadStringArray(payload: Payload, key: string, maxItems = 512): void {
  const value = payload[key]
  if (value === undefined) return
  if (!Array.isArray(value) || value.length > maxItems || value.some(item => typeof item !== 'string' || item.length > 16_384)) {
    throw new Error(`${key} must be an array of at most ${maxItems} bounded strings`)
  }
}
function payloadStringMap(payload: Payload, key: string): void {
  const value = payload[key]
  if (value === undefined) return
  const record = payloadObject(value, key)
  const entries = Object.entries(record)
  if (entries.length > 512 || entries.some(([id, item]) => id.length > 4096 || typeof item !== 'string' || item.length > 4096)) {
    throw new Error(`${key} must be a bounded string map`)
  }
}
function validateDeviceInput(payload: Payload): void {
  payloadString(payload, 'id', false, 512)
  payloadString(payload, 'name', true, 256)
  payloadString(payload, 'label', false, 256, true)
  payloadBoolean(payload, 'enabled')
  payloadBoolean(payload, 'keepNativeAlive')
  const transport = payloadObject(payload.transport, 'transport')
  if (transport.kind === 'ssh') {
    payloadString(transport, 'host')
    for (const key of ['username', 'privateKeyPath', 'proxyJump', 'remoteBindHost', 'remoteDshHome']) payloadString(transport, key, false, 16_384)
    payloadString(transport, 'passphrase', false, 1024 * 1024, true)
    payloadPort(transport, 'port'); payloadPort(transport, 'remotePort')
    payloadBoolean(transport, 'bootstrapFromRemoteCredentials')
    if (transport.engine !== undefined && !['auto', 'system-ssh', 'ssh2'].includes(String(transport.engine))) throw new Error('Invalid SSH engine')
  } else if (transport.kind === 'direct') {
    payloadString(transport, 'baseUrl', true, 16_384)
    payloadBoolean(transport, 'rejectUnauthorized')
  } else throw new Error('transport.kind must be "ssh" or "direct"')
  if (payload.auth !== undefined) {
    const auth = payloadObject(payload.auth, 'auth')
    if (!['auto', 'token', 'cookie', 'bearer', 'none'].includes(String(auth.mode))) throw new Error('Invalid auth mode')
    payloadString(auth, 'credential', false, 1024 * 1024, true)
  }
}
function validateManualRule(value: unknown, key = 'rule'): void {
  const rule = payloadObject(value, key)
  payloadString(rule, 'id', true, 4096)
  payloadString(rule, 'title', true, 4096, true)
  payloadStringArray(rule, 'memberKeys')
  if (!Array.isArray(rule.memberKeys)) throw new Error(`${key}.memberKeys is required`)
  payloadString(rule, 'gitRemote', false, 16_384)
  payloadString(rule, 'preferredDeviceId', false, 512)
}
/** Field-level runtime schemas shared by HTTP parsing and direct dispatch. */
export function validateControlPlanePayload(request: ControlPlaneRequest): void {
  const payload = request.payload ?? {}
  payloadString(payload, 'clientId', false, 128)
  switch (request.action) {
    case 'catalogSessionAction':
      payloadString(payload, 'sessionId', true, 4096)
      if (!['rename', 'archive', 'unarchive', 'pin', 'unpin', 'fork'].includes(String(payload.operation))) throw new Error('Invalid session operation')
      payloadString(payload, 'title', false, 4096, true); payloadBoolean(payload, 'stopActivity')
      break
    case 'searchCatalogSessions': payloadString(payload, 'query', true, 1000); break
    case 'modelCatalog': payloadString(payload, 'sessionId', false, 4096); break
    case 'diagnostics': if (payload.client !== undefined) payloadObject(payload.client, 'client'); break
    case 'setActiveSession':
      payloadString(payload, 'sessionId', false, 4096, true)
      if (payload.requestSeq !== undefined && (!Number.isSafeInteger(payload.requestSeq) || (payload.requestSeq as number) < 0)) throw new Error('requestSeq must be a non-negative safe integer')
      break
    case 'markSessionRead': payloadString(payload, 'sessionId'); payloadString(payload, 'expectedCompletionId', false, 1024); break
    case 'markDeviceRead': case 'removeDevice': case 'reconnectDevice': payloadString(payload, 'deviceId', true, 512); break
    case 'authenticateDevice': payloadString(payload, 'deviceId', true, 512); payloadString(payload, 'credential', false, 1024 * 1024, true); break
    case 'setDisplayMode': if (payload.displayMode !== 'aggregated' && payload.displayMode !== 'native') throw new Error('Invalid displayMode'); break
    case 'upsertDevice': case 'testDevice': validateDeviceInput(payload); break
    case 'startSessionOnDevice': payloadString(payload, 'logicalWorkspaceId'); payloadString(payload, 'deviceId', true, 512); break
    case 'createSession':
      payloadString(payload, 'deviceId', true, 512); payloadString(payload, 'workspaceId', false); payloadString(payload, 'cwd', false, 16_384); payloadString(payload, 'agentPreset', false, 1024)
      break
    case 'createRemoteWorkspace': payloadString(payload, 'deviceId', true, 512); payloadString(payload, 'path', true, 16_384); break
    case 'updateAggregationConfig':
      payloadBoolean(payload, 'autoGitAggregate'); payloadBoolean(payload, 'prefixUnmatchedWithDevice')
      payloadStringArray(payload, 'excludedMemberKeys'); payloadStringMap(payload, 'preferredDeviceByLogicalId'); payloadStringMap(payload, 'customTitleByLogicalId'); payloadStringArray(payload, 'workspaceOrder')
      if (payload.manualRules !== undefined) {
        if (!Array.isArray(payload.manualRules) || payload.manualRules.length > 512) throw new Error('manualRules must be a bounded array')
        payload.manualRules.forEach(rule => validateManualRule(rule, 'manualRules[]'))
      }
      break
    case 'upsertManualRule': validateManualRule(payload); break
    case 'removeManualRule': payloadString(payload, 'ruleId'); break
    case 'setMemberExcluded': payloadString(payload, 'memberKey', true, 16_384); payloadBoolean(payload, 'excluded', true); break
    case 'setPreferredDevice': payloadString(payload, 'logicalWorkspaceId'); payloadString(payload, 'deviceId', true, 512); break
    case 'setCustomTitle': payloadString(payload, 'logicalWorkspaceId'); payloadString(payload, 'title', true, 4096, true); break
    case 'setUiPreferences': payloadBoolean(payload, 'sessionRowDeviceDot'); payloadBoolean(payload, 'nativePane'); payloadBoolean(payload, 'crossHostReadState'); break
    default: break
  }
}

/**
 * Browser geometry the Client volunteers with a Diagnostics request. The Host
 * cannot read the viewport, but a clipped Native Mode bar is a layout fact on
 * the client side, so the report travels with the request and is echoed back.
 */
export interface DiagnosticsClientReport {
  readonly innerWidth?: number
  readonly innerHeight?: number
  readonly devicePixelRatio?: number
  /** Frame-relative left edge of the Native Mode tab bar. */
  readonly barLeft?: number
  /** Frame-relative width before clamping. */
  readonly barWidth?: number
  /** Width the bar actually occupies inside the viewport. */
  readonly barClampedWidth?: number
  readonly compact?: boolean
  readonly userAgent?: string
  /**
   * Whether the cached Workspace projection resolves inside the browser's
   * Session store. `missing > 0` is the mechanical cause of a "Workspace
   * expands but shows no conversations" report.
   */
  readonly sessionLink?: DiagnosticsSessionLink
}

/** Session-store link evidence volunteered by the browser. */
export interface DiagnosticsSessionLink {
  readonly referenced: number
  readonly missing: number
  readonly byDevice: Readonly<Record<string, number>>
  readonly sample: readonly string[]
  readonly connectedDevices: number
  readonly attempts: number
  readonly resolved: boolean
  readonly refreshedAt?: number
  /** Last `sessions.refresh()` failure, when the Host could not answer. */
  readonly lastError?: string
}

/** One device row of the Diagnostics report. */
export interface DiagnosticsDevice {
  readonly id: string
  readonly name: string
  readonly enabled: boolean
  readonly state: DeviceView['state']
  readonly transportKind: DeviceView['transportKind']
  readonly protocolVersion: DeviceView['protocolVersion']
  readonly realtime: boolean
  readonly remoteDshVersion?: string
  readonly authState?: DeviceView['authState']
  readonly sessionCount: number
  readonly runningSessionCount: number
  /** Raw catalog totals, including archived and subagent Sessions. */
  readonly allSessionCount: number
  readonly allRunningSessionCount: number
  readonly workspaceCount: number
  readonly pendingApprovalCount: number
  readonly catalogStale: boolean
  readonly lastSyncedAt?: number
  readonly lastError?: string
  /** Why this device was dropped from the merged `session.list`, if it was. */
  readonly sessionListError?: string
}

/** Aggregated snapshot of everything a support report needs to explain a UI state. */
export interface MultiDeviceDiagnostics {
  readonly kind: 'dsh-multi-device/diagnostics'
  readonly generatedAt: number
  readonly hostId: string
  readonly displayMode: MultiDeviceSnapshot['displayMode']
  readonly hostStatus: MultiDeviceSnapshot['hostStatus']
  readonly counts: {
    readonly devices: number
    readonly connectedDevices: number
    readonly staleDevices: number
    readonly logicalWorkspaces: number
    readonly physicalWorkspaces: number
    readonly runningSessions: number
    /** Raw catalog total, including archived and subagent Sessions. */
    readonly allRunningSessions: number
  }
  readonly devices: readonly DiagnosticsDevice[]
  /** Session identities and categories only; no conversation content or credentials. */
  readonly attentionByDevice?: MultiDeviceSnapshot['attentionByDevice']
  readonly client?: DiagnosticsClientReport
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Parse the Client's Diagnostics payload; unknown fields are dropped. */
export function readDiagnosticsClientReport(raw: unknown): DiagnosticsClientReport | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const report: DiagnosticsClientReport = {
    ...(optionalNumber(record.innerWidth) !== undefined ? { innerWidth: optionalNumber(record.innerWidth) } : {}),
    ...(optionalNumber(record.innerHeight) !== undefined ? { innerHeight: optionalNumber(record.innerHeight) } : {}),
    ...(optionalNumber(record.devicePixelRatio) !== undefined
      ? { devicePixelRatio: optionalNumber(record.devicePixelRatio) }
      : {}),
    ...(optionalNumber(record.barLeft) !== undefined ? { barLeft: optionalNumber(record.barLeft) } : {}),
    ...(optionalNumber(record.barWidth) !== undefined ? { barWidth: optionalNumber(record.barWidth) } : {}),
    ...(optionalNumber(record.barClampedWidth) !== undefined
      ? { barClampedWidth: optionalNumber(record.barClampedWidth) }
      : {}),
    ...(typeof record.compact === 'boolean' ? { compact: record.compact } : {}),
    ...(optionalString(record.userAgent) !== undefined ? { userAgent: optionalString(record.userAgent) } : {}),
    ...(readDiagnosticsSessionLink(record.sessionLink) !== undefined
      ? { sessionLink: readDiagnosticsSessionLink(record.sessionLink) }
      : {}),
  }
  return Object.keys(report).length === 0 ? undefined : report
}

/** Parse the browser's Session-store link evidence; unknown fields are dropped. */
export function readDiagnosticsSessionLink(raw: unknown): DiagnosticsSessionLink | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const byDevice: Record<string, number> = {}
  if (typeof record.byDevice === 'object' && record.byDevice !== null) {
    for (const [deviceId, count] of Object.entries(record.byDevice as Record<string, unknown>)) {
      if (typeof count === 'number' && Number.isFinite(count)) byDevice[deviceId] = count
    }
  }
  const sample = Array.isArray(record.sample)
    ? record.sample.filter((id): id is string => typeof id === 'string').slice(0, 16)
    : []
  return {
    referenced: optionalNumber(record.referenced) ?? 0,
    missing: optionalNumber(record.missing) ?? 0,
    byDevice,
    sample,
    connectedDevices: optionalNumber(record.connectedDevices) ?? 0,
    attempts: optionalNumber(record.attempts) ?? 0,
    resolved: record.resolved === true,
    ...(optionalNumber(record.refreshedAt) !== undefined ? { refreshedAt: optionalNumber(record.refreshedAt) } : {}),
    ...(optionalString(record.lastError) !== undefined ? { lastError: optionalString(record.lastError) } : {}),
  }
}

/**
 * Build the Diagnostics report from one Host snapshot.
 *
 * The mode is the first field on purpose: a "missing conversations" report is
 * almost always the Native/Aggregated distinction, and the per-device staging
 * (`state`, `catalogStale`, counts) explains the rest.
 */
export function buildDiagnostics(
  snapshot: MultiDeviceSnapshot,
  client?: DiagnosticsClientReport,
  now = Date.now(),
): MultiDeviceDiagnostics {
  const devices: DiagnosticsDevice[] = snapshot.devices.map(device => ({
    id: String(device.id),
    name: device.name,
    enabled: device.enabled,
    state: device.state,
    transportKind: device.transportKind,
    protocolVersion: device.protocolVersion,
    realtime: device.realtime,
    ...(device.remoteDshVersion !== undefined ? { remoteDshVersion: device.remoteDshVersion } : {}),
    ...(device.authState !== undefined ? { authState: device.authState } : {}),
    sessionCount: device.sessionCount,
    runningSessionCount: device.runningSessionCount,
    allSessionCount: device.allSessionCount ?? device.sessionCount,
    allRunningSessionCount: device.allRunningSessionCount ?? device.runningSessionCount,
    workspaceCount: device.workspaceCount,
    pendingApprovalCount: device.pendingApprovalCount,
    catalogStale: device.catalogStale === true,
    ...(device.lastSyncedAt !== undefined ? { lastSyncedAt: device.lastSyncedAt } : {}),
    ...(device.lastError !== undefined ? { lastError: device.lastError } : {}),
    ...(device.sessionListError !== undefined ? { sessionListError: device.sessionListError } : {}),
  }))
  return {
    kind: 'dsh-multi-device/diagnostics',
    generatedAt: now,
    hostId: snapshot.hostId ?? 'unknown',
    displayMode: snapshot.displayMode,
    hostStatus: snapshot.hostStatus,
    counts: {
      devices: devices.length,
      connectedDevices: devices.filter(device => device.state === 'connected').length,
      staleDevices: devices.filter(device => device.catalogStale).length,
      logicalWorkspaces: snapshot.logicalWorkspaces.length,
      physicalWorkspaces: snapshot.allPhysicalWorkspaces.length,
      runningSessions: devices.reduce((total, device) => total + device.runningSessionCount, 0),
      allRunningSessions: devices.reduce((total, device) => total + device.allRunningSessionCount, 0),
    },
    devices,
    ...(snapshot.attentionByDevice !== undefined ? { attentionByDevice: snapshot.attentionByDevice } : {}),
    ...(client !== undefined ? { client } : {}),
  }
}

export class MultiDeviceControlPlane {
  private activeControlRequests = 0

  constructor(
    private readonly registry: DeviceRegistry,
    private readonly admitRequest?: (req: IncomingMessage) => boolean,
  ) {}

  /** Execute one control-plane action and return a JSON-serializable result envelope. */
  async dispatch(
    request: ControlPlaneRequest,
    signal?: AbortSignal,
  ): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
    const payload = request.payload ?? {}
    const clientId = typeof payload.clientId === 'string' ? payload.clientId.slice(0, 128) : 'legacy'
    try {
      validateControlPlanePayload(request)
      switch (request.action) {
        case 'snapshot':
          return { ok: true, value: this.registry.snapshot(clientId) }

        case 'catalogSessionAction': {
          const operations = ['rename', 'archive', 'unarchive', 'pin', 'unpin', 'fork'] as const
          const operation = payload.operation as typeof operations[number]
          if (!operations.includes(operation) || typeof payload.sessionId !== 'string' || !payload.sessionId) return { ok: false, error: 'Invalid session operation' }
          const result = await this.registry.catalogSessionAction(payload.sessionId, operation, typeof payload.title === 'string' ? payload.title : undefined, payload.stopActivity === true)
          return { ok: true, value: { ...result, snapshot: this.registry.snapshot(clientId) } }
        }

        case 'searchCatalogSessions': {
          if (typeof payload.query !== 'string' || !payload.query.trim() || payload.query.length > 1000) return { ok: false, error: 'A search query of 1–1000 characters is required' }
          return { ok: true, value: await this.registry.searchCatalogSessions(payload.query.trim(), signal) }
        }

        case 'modelCatalog': {
          const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined
          const scope = this.registry.sessionScope(sessionId)
          if (!this.registry.isAggregatedMode() || scope.kind !== 'remote') {
            return { ok: false, error: 'A remote Session is required for this catalog' }
          }
          if (scope.client === undefined || !scope.client.isConnected()) {
            return { ok: false, error: `Device ${scope.deviceName} is not connected` }
          }
          const catalog = await scope.client.invokeUnary('session', 'modelCatalog', {}, signal)
          return { ok: true, value: catalog }
        }

        case 'diagnostics':
          return {
            ok: true,
            value: buildDiagnostics(
              this.registry.snapshot(clientId),
              readDiagnosticsClientReport(payload.client),
            ),
          }

        case 'setActiveSession': {
          const raw = payload.sessionId
          const sessionId = typeof raw === 'string' && raw !== '' ? raw : undefined
          const requestSeq = typeof payload.requestSeq === 'number' && Number.isFinite(payload.requestSeq)
            ? payload.requestSeq
            : 0
          this.registry.setActiveSession(sessionId, requestSeq, clientId)
          return { ok: true, value: { accepted: true as const } }
        }

        case 'markSessionRead': {
          const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
          if (sessionId === '') {
            return { ok: false, error: 'sessionId is required' }
          }
          const expectedCompletionId = typeof payload.expectedCompletionId === 'string'
            ? payload.expectedCompletionId : undefined
          const changed = this.registry.markSessionRead(sessionId, expectedCompletionId)
          return {
            ok: true,
            value: { changed, snapshot: this.registry.snapshot(clientId) },
          }
        }

        case 'markDeviceRead': {
          const deviceId = typeof payload.deviceId === 'string' ? payload.deviceId.trim() : ''
          if (deviceId === '') {
            return { ok: false, error: 'deviceId is required' }
          }
          const changed = this.registry.markDeviceRead(String(deviceId) as DeviceId)
          return {
            ok: true,
            value: { changed, snapshot: this.registry.snapshot(clientId) },
          }
        }

        case 'setDisplayMode': {
          const mode = payload.displayMode
          if (mode !== 'aggregated' && mode !== 'native') {
            return { ok: false, error: 'displayMode must be "aggregated" or "native"' }
          }
          if (mode === 'aggregated') {
            const health = this.registry.aggregatedGatewayHealth()
            if (!health.ok) {
              return {
                ok: false,
                error: `Aggregated Mode is unavailable: ${health.error ?? 'the aggregated gateway is not active'}`,
              }
            }
          }
          this.registry.setDisplayMode(mode)
          return { ok: true, value: { snapshot: this.registry.snapshot(clientId) } }
        }

        case 'upsertDevice': {
          const input = payload as unknown as UpsertDeviceInput
          const res = await this.registry.upsertDevice(input)
          if (!res.ok) return res
          return { ok: true, value: { device: res.device, snapshot: this.registry.snapshot(clientId) } }
        }

        case 'removeDevice': {
          const deviceId = String(payload.deviceId ?? '') as DeviceId
          if (deviceId === '') return { ok: false, error: 'Device id is required' }
          const removed = this.registry.removeDevice(deviceId)
          if (!removed) return { ok: false, error: 'Device is not configured' }
          return { ok: true, value: { removed, snapshot: this.registry.snapshot(clientId) } }
        }

        case 'reconnectDevice': {
          const deviceId = String(payload.deviceId ?? '') as DeviceId
          if (deviceId === '') return { ok: false, error: 'Device id is required' }
          const triggered = this.registry.reconnectDevice(deviceId)
          if (!triggered) return { ok: false, error: 'Device is not configured' }
          return { ok: true, value: { triggered, snapshot: this.registry.snapshot(clientId) } }
        }

        case 'authenticateDevice': {
          const deviceId = String(payload.deviceId ?? '') as DeviceId
          if (deviceId === '') return { ok: false, error: 'Device id is required' }
          const credential = typeof payload.credential === 'string' ? payload.credential : undefined
          const res = await this.registry.authenticateDevice(deviceId, credential)
          if (!res.ok) return res
          return { ok: true, value: { ...res, snapshot: this.registry.snapshot(clientId) } }
        }

        case 'testDevice': {
          const input = payload as unknown as UpsertDeviceInput
          const res = await this.registry.testDeviceConnection(input)
          if (!res.ok) return res
          return { ok: true, value: res }
        }

        case 'listSshKeys':
          return { ok: true, value: { keys: this.registry.listSshKeys() } }

        case 'startSessionOnDevice': {
          const logicalWorkspaceId = String(payload.logicalWorkspaceId ?? '')
          const deviceId = String(payload.deviceId ?? '') as DeviceId
          if (logicalWorkspaceId === '' || deviceId === '') {
            return { ok: false, error: 'Workspace and device are required' }
          }
          const res = await this.registry.startSessionOnDevice(logicalWorkspaceId, deviceId)
          if (!res.ok) return res
          return { ok: true, value: { ...res, snapshot: this.registry.snapshot(clientId) } }
        }

        case 'createSession': {
          const input = payload as unknown as RemoteSessionCreateInput
          const res = await this.registry.createRemoteSession(input)
          if (!res.ok) return res
          return { ok: true, value: { ...res, snapshot: this.registry.snapshot(clientId) } }
        }

        case 'createRemoteWorkspace': {
          const input = payload as unknown as RemoteWorkspaceCreateInput
          const res = await this.registry.createRemoteWorkspace(input)
          if (!res.ok) return res
          return { ok: true, value: { ...res, snapshot: this.registry.snapshot(clientId) } }
        }

        case 'updateAggregationConfig': {
          const patch = payload as Partial<WorkspaceAggregationConfig>
          try {
            this.registry.updateAggregationConfig(patch)
          } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) }
          }
          return { ok: true, value: this.registry.snapshot(clientId) }
        }

        case 'upsertManualRule': {
          const rule = payload as unknown as ManualWorkspaceRule
          this.registry.mutateAggregation(() => this.registry.aggregator.upsertManualRule(rule))
          return { ok: true, value: this.registry.snapshot(clientId) }
        }

        case 'removeManualRule': {
          const ruleId = String(payload.ruleId ?? '')
          this.registry.mutateAggregation(() => this.registry.aggregator.removeManualRule(ruleId))
          return { ok: true, value: this.registry.snapshot(clientId) }
        }

        case 'setMemberExcluded': {
          const memberKey = String(payload.memberKey ?? '')
          if (memberKey === '') return { ok: false, error: 'Member key is required' }
          const excluded = Boolean(payload.excluded)
          try {
            this.registry.mutateAggregation(() => this.registry.aggregator.setMemberExcluded(memberKey, excluded))
          } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) }
          }
          return { ok: true, value: this.registry.snapshot(clientId) }
        }

        case 'setUiPreferences': {
          this.registry.updateUiPreferences({
            ...(typeof payload.sessionRowDeviceDot === 'boolean'
              ? { sessionRowDeviceDot: payload.sessionRowDeviceDot }
              : {}),
            ...(typeof payload.nativePane === 'boolean'
              ? { nativePane: payload.nativePane }
              : {}),
            ...(typeof payload.crossHostReadState === 'boolean'
              ? { crossHostReadState: payload.crossHostReadState }
              : {}),
          })
          return { ok: true, value: this.registry.snapshot(clientId) }
        }

        case 'setPreferredDevice': {
          const logicalWorkspaceId = String(payload.logicalWorkspaceId ?? '')
          const deviceId = String(payload.deviceId ?? '') as DeviceId
          this.registry.mutateAggregation(() => this.registry.aggregator.setPreferredDevice(logicalWorkspaceId, deviceId))
          return { ok: true, value: this.registry.snapshot(clientId) }
        }

        case 'startGitMatch': {
          const res = this.registry.startGitMatch()
          if (!res.ok) return res
          return { ok: true, value: { gitMatch: this.registry.gitMatch(), snapshot: this.registry.snapshot(clientId) } }
        }

        case 'cancelGitMatch': {
          const cancelled = this.registry.cancelGitMatch()
          return { ok: true, value: { cancelled, gitMatch: this.registry.gitMatch() } }
        }

        case 'setCustomTitle': {
          const logicalWorkspaceId = String(payload.logicalWorkspaceId ?? '')
          const title = String(payload.title ?? '')
          this.registry.mutateAggregation(() => this.registry.aggregator.setCustomTitle(logicalWorkspaceId, title))
          return { ok: true, value: this.registry.snapshot(clientId) }
        }

        default:
          return { ok: false, error: `Unknown control-plane action: ${String(request.action)}` }
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /** HTTP route handler for `POST /multi-device/api`. */
  async handleApiHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.isAuthorized(req)) {
      res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: 'Forbidden' }))
      return
    }

    if (req.method === 'GET') {
      const clientId = readClientId(req)
      const snapshot: MultiDeviceSnapshot = this.registry.snapshot(clientId)
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(JSON.stringify({ ok: true, value: snapshot }))
      return
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }))
      return
    }
    if (this.activeControlRequests >= MAX_ACTIVE_CONTROL_REQUESTS) {
      res.writeHead(429, { 'content-type': 'application/json; charset=utf-8', 'retry-after': '1' })
      res.end(JSON.stringify({ ok: false, error: 'Control plane is busy; retry after the current operations finish' }))
      return
    }

    this.activeControlRequests += 1
    let dispatchStarted = false
    try {
      const bodyBuf = await readBody(req)
      if (bodyBuf === null) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: 'Invalid request body' }))
        return
      }

      let parsed: ControlPlaneRequest
      try {
        parsed = parseControlPlaneRequest(JSON.parse(bodyBuf.toString('utf8')))
      } catch {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: 'Malformed control-plane request' }))
        return
      }

      const operationAbort = new AbortController()
      const abortOperation = (): void => { operationAbort.abort() }
      req.once('aborted', abortOperation)
      res.once('close', abortOperation)
      const work = this.dispatch(parsed, operationAbort.signal)
      dispatchStarted = true
      // The admission slot follows the real operation even after its HTTP
      // deadline. A caller cannot create unbounded background work by timing
      // out and retrying a non-idempotent action.
      const release = (): void => {
        this.activeControlRequests = Math.max(0, this.activeControlRequests - 1)
        req.off('aborted', abortOperation)
        res.off('close', abortOperation)
      }
      void work.then(release, release)
      const deadlineMarker = Symbol('control-plane-deadline')
      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<typeof deadlineMarker>(resolve => {
        timer = setTimeout(() => resolve(deadlineMarker), CONTROL_REQUEST_DEADLINE_MS)
        timer.unref?.()
      })
      const outcome = await Promise.race([work, deadline])
      if (timer !== undefined) clearTimeout(timer)
      if (outcome === deadlineMarker) {
        if (!res.destroyed) {
          res.writeHead(504, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ ok: false, error: 'Operation deadline exceeded; its result is unknown and non-idempotent retries may be unsafe' }))
        }
        return
      }
      if (res.destroyed) return
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(JSON.stringify(outcome))
    } finally {
      if (!dispatchStarted) this.activeControlRequests = Math.max(0, this.activeControlRequests - 1)
    }
  }

  /** SSE route handler for `GET /multi-device/events` (real-time snapshot push to Client UI). */
  handleEventsSse(req: IncomingMessage, res: ServerResponse): void {
    if (!this.isAuthorized(req)) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
    })

    const clientId = readClientId(req)
    let closed = false
    let queued = false
    let flushing = false
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let unsubscribe: (() => void) | undefined
    const cleanup = (): void => {
      if (closed) return
      closed = true
      queued = false
      if (heartbeat !== undefined) clearInterval(heartbeat)
      unsubscribe?.()
    }
    const waitForDrain = (): Promise<void> => new Promise(resolve => {
      const done = (): void => {
        res.off('drain', done)
        res.off('close', done)
        res.off('error', done)
        resolve()
      }
      res.once('drain', done)
      res.once('close', done)
      res.once('error', done)
    })
    const flush = async (): Promise<void> => {
      if (flushing || closed) return
      flushing = true
      try {
        while (queued && !closed) {
          queued = false
          const snap = this.registry.snapshot(clientId)
          if (!res.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`) && !closed) {
            await waitForDrain()
          }
        }
      } catch {
        if (!closed) res.destroy()
      } finally {
        flushing = false
        if (queued && !closed) void flush()
      }
    }
    const sendSnapshot = (): void => {
      // One pending snapshot per socket: a slow consumer cannot build an
      // unbounded event queue, and changes during a blocked write coalesce.
      queued = true
      void flush()
    }

    req.once('close', cleanup)
    res.once('close', cleanup)
    res.on('error', cleanup)
    unsubscribe = this.registry.onSnapshotChanged(sendSnapshot)
    sendSnapshot()
    heartbeat = setInterval(() => {
      if (!closed && !res.writableNeedDrain) res.write(': ping\n\n')
    }, 15_000)
  }

  private isAuthorized(req: IncomingMessage): boolean {
    if (this.admitRequest !== undefined) {
      return this.admitRequest(req)
    }
    return isLoopbackHostHeader(req.headers.host)
  }
}

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const finish = (value: Buffer | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      finish(null)
      req.destroy()
    }, BODY_READ_DEADLINE_MS)
    timer.unref?.()
    req.on('data', (chunk: Buffer) => {
      if (settled) return
      size += chunk.byteLength
      if (size > MAX_BODY_BYTES) {
        finish(null)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => finish(Buffer.concat(chunks)))
    req.on('aborted', () => finish(null))
    req.on('error', () => finish(null))
  })
}

/** Client ids select navigation state, never authentication/authorization. */
function readClientId(req: IncomingMessage): string {
  try { return new URL(req.url ?? '/', 'http://localhost').searchParams.get('clientId')?.slice(0, 128) || 'legacy' }
  catch { return 'legacy' }
}

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
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  DeviceId,
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

export interface ControlPlaneRequest {
  readonly action:
    | 'snapshot'
    | 'upsertDevice'
    | 'removeDevice'
    | 'reconnectDevice'
    | 'testDevice'
    | 'listSshKeys'
    | 'createSession'
    | 'createRemoteWorkspace'
    | 'updateAggregationConfig'
    | 'upsertManualRule'
    | 'removeManualRule'
    | 'setMemberExcluded'
    | 'setPreferredDevice'
    | 'setCustomTitle'
  readonly payload?: Record<string, unknown>
}

export class MultiDeviceControlPlane {
  constructor(
    private readonly registry: DeviceRegistry,
    private readonly admitRequest?: (req: IncomingMessage) => boolean,
  ) {}

  /** Execute one control-plane action and return a JSON-serializable result envelope. */
  async dispatch(
    request: ControlPlaneRequest,
  ): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
    const payload = request.payload ?? {}
    try {
      switch (request.action) {
        case 'snapshot':
          return { ok: true, value: this.registry.snapshot() }

        case 'upsertDevice': {
          const input = payload as unknown as UpsertDeviceInput
          const res = await this.registry.upsertDevice(input)
          if (!res.ok) return res
          return { ok: true, value: { device: res.device, snapshot: this.registry.snapshot() } }
        }

        case 'removeDevice': {
          const deviceId = String(payload.deviceId ?? '') as DeviceId
          const removed = this.registry.removeDevice(deviceId)
          return { ok: true, value: { removed, snapshot: this.registry.snapshot() } }
        }

        case 'reconnectDevice': {
          const deviceId = String(payload.deviceId ?? '') as DeviceId
          const triggered = this.registry.reconnectDevice(deviceId)
          return { ok: true, value: { triggered, snapshot: this.registry.snapshot() } }
        }

        case 'testDevice': {
          const input = payload as unknown as UpsertDeviceInput
          const res = await this.registry.testDeviceConnection(input)
          if (!res.ok) return res
          return { ok: true, value: res }
        }

        case 'listSshKeys':
          return { ok: true, value: { keys: this.registry.listSshKeys() } }

        case 'createSession': {
          const input = payload as unknown as RemoteSessionCreateInput
          const res = await this.registry.createRemoteSession(input)
          if (!res.ok) return res
          return { ok: true, value: { ...res, snapshot: this.registry.snapshot() } }
        }

        case 'createRemoteWorkspace': {
          const input = payload as unknown as RemoteWorkspaceCreateInput
          const res = await this.registry.createRemoteWorkspace(input)
          if (!res.ok) return res
          return { ok: true, value: { ...res, snapshot: this.registry.snapshot() } }
        }

        case 'updateAggregationConfig': {
          const patch = payload as Partial<WorkspaceAggregationConfig>
          this.registry.updateAggregationConfig(patch)
          return { ok: true, value: this.registry.snapshot() }
        }

        case 'upsertManualRule': {
          const rule = payload as unknown as ManualWorkspaceRule
          this.registry.aggregator.upsertManualRule(rule)
          this.registry.saveToDisk()
          return { ok: true, value: this.registry.snapshot() }
        }

        case 'removeManualRule': {
          const ruleId = String(payload.ruleId ?? '')
          this.registry.aggregator.removeManualRule(ruleId)
          this.registry.saveToDisk()
          return { ok: true, value: this.registry.snapshot() }
        }

        case 'setMemberExcluded': {
          const memberKey = String(payload.memberKey ?? '')
          const excluded = Boolean(payload.excluded)
          this.registry.aggregator.setMemberExcluded(memberKey, excluded)
          this.registry.saveToDisk()
          return { ok: true, value: this.registry.snapshot() }
        }

        case 'setPreferredDevice': {
          const logicalWorkspaceId = String(payload.logicalWorkspaceId ?? '')
          const deviceId = String(payload.deviceId ?? '') as DeviceId
          this.registry.aggregator.setPreferredDevice(logicalWorkspaceId, deviceId)
          this.registry.saveToDisk()
          return { ok: true, value: this.registry.snapshot() }
        }

        case 'setCustomTitle': {
          const logicalWorkspaceId = String(payload.logicalWorkspaceId ?? '')
          const title = String(payload.title ?? '')
          this.registry.aggregator.setCustomTitle(logicalWorkspaceId, title)
          this.registry.saveToDisk()
          return { ok: true, value: this.registry.snapshot() }
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
      const snapshot: MultiDeviceSnapshot = this.registry.snapshot()
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

    const bodyBuf = await readBody(req)
    if (bodyBuf === null) {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: 'Invalid request body' }))
      return
    }

    let parsed: ControlPlaneRequest
    try {
      parsed = JSON.parse(bodyBuf.toString('utf8')) as ControlPlaneRequest
      if (!parsed || typeof parsed.action !== 'string') {
        throw new Error('Missing action')
      }
    } catch {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: 'Malformed JSON body' }))
      return
    }

    const outcome = await this.dispatch(parsed)
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(outcome))
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

    const sendSnapshot = (): void => {
      try {
        const snap = this.registry.snapshot()
        res.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`)
      } catch {
        // Ignore serialization failure
      }
    }

    sendSnapshot()
    const unsubscribe = this.registry.onSnapshotChanged(() => {
      sendSnapshot()
    })
    const heartbeat = setInterval(() => {
      res.write(': ping\n\n')
    }, 15_000)

    req.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  }

  private isAuthorized(req: IncomingMessage): boolean {
    if (this.admitRequest !== undefined) {
      return this.admitRequest(req)
    }
    const host = req.headers.host ?? ''
    return (
      host.startsWith('127.0.0.1:') ||
      host.startsWith('localhost:') ||
      host === '127.0.0.1' ||
      host === 'localhost'
    )
  }
}

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > MAX_BODY_BYTES) {
        resolve(null)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', () => resolve(null))
  })
}

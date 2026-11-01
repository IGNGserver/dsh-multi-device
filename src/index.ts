/**
 * `dsh-multi-device` Host Plugin Entry.
 *
 * Mounts:
 * 1. `DeviceRegistry`: persistent device & Git workspace aggregation registry,
 *    SSH tunnel supervisor, and independent Native Mode reverse-proxy manager.
 * 2. `MultiDeviceControlPlane`: `/multi-device/api` and `/multi-device/events` SSE routes
 *    so the Client UI can manage devices, import `~/.ssh/config`, configure Git aggregation,
 *    and use Native Mode independently of Aggregated Mode.
 * 3. `AggregatedGateway`: attaches reversibly to `sessionController`, `workspaceController`,
 *    and `typertGateway` (with isolated failure containment so any incompatibility never
 *    impairs Native Mode or the host DSH instance).
 *
 * @module dsh-multi-device
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  installAggregatedGateway02,
  readLocalPhysicalWorkspaces,
  type SessionControllerLike,
  type TypertGatewayLike,
  type WorkspaceControllerLike,
  type WorkspaceRegistryLike,
} from './host/gateway.ts'
import { DeviceRegistry } from './host/registry.ts'
import {
  MULTI_DEVICE_API_PATH,
  MULTI_DEVICE_EVENTS_PATH,
  MultiDeviceControlPlane,
} from './runtime.ts'

export const name = 'dsh-multi-device'

/**
 * Only require `webServer` as a hard Cordis injection so the plugin still loads
 * and provides Native Mode even if higher-level controller services change in
 * future DSH releases.
 */
export const inject = ['webServer']

export interface Config {
  /** Custom path to persist device & aggregation config; defaults to `$DSH_HOME/plugins/dsh-multi-device.json`. */
  readonly dataFile?: string
  /** Custom path to persist device auth secrets; defaults to `$DSH_HOME/plugins/dsh-multi-device-secrets.json`. */
  readonly secretsFile?: string
  readonly features?: {
    /** Enable Aggregated Mode (unified sidebar workspaces & sessions). Default: true. */
    readonly aggregatedMode?: boolean
    /** Enable Native Mode local reverse-proxy & keep-alive viewport. Default: true. */
    readonly nativeMode?: boolean
    /** Enable automatic SSH tunnel management. Default: true. */
    readonly sshTunnel?: boolean
    /** Enable automatic Git remote workspace aggregation by default. Default: true. */
    readonly autoGitAggregate?: boolean
  }
}

export const Config = z.object({
  dataFile: z.string(),
  secretsFile: z.string(),
  features: z
    .object({
      aggregatedMode: z.boolean().default(true),
      nativeMode: z.boolean().default(true),
      sshTunnel: z.boolean().default(true),
      autoGitAggregate: z.boolean().default(true),
    })
    .default({}),
})

export function apply(ctx: Context, config?: Config): void {
  const resolved = Config(config ?? {})
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const dataFile = resolved.dataFile ?? join(dshHome, 'plugins', 'dsh-multi-device.json')
  const secretsFile = resolved.secretsFile ?? join(dshHome, 'plugins', 'dsh-multi-device-secrets.json')

  const features = resolved.features ?? {}
  const enableAggregated = features.aggregatedMode !== false
  const enableNative = features.nativeMode !== false
  const enableTunnels = features.sshTunnel !== false

  const webServer = (ctx as unknown as {
    webServer: {
      port?: number
      register: (route: {
        kind: 'exact' | 'prefix'
        path: string
        handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void
      }) => () => void
    }
  }).webServer

  const getWorkspaceRegistry = (): WorkspaceRegistryLike | undefined => {
    try {
      return (ctx as unknown as { get?: (k: string) => unknown }).get?.('workspaceRegistry') as WorkspaceRegistryLike | undefined
    } catch {
      return undefined
    }
  }

  const getLocalAgents = (): { list?: () => readonly { id: string; status?: string }[] } | undefined => {
    try {
      return (ctx as unknown as { get?: (k: string) => unknown }).get?.('agents') as { list?: () => readonly { id: string; status?: string }[] } | undefined
    } catch {
      return undefined
    }
  }

  const getLocalSessions = (): { list?: () => readonly { id: string; header?: { createdAt?: number } }[] } | undefined => {
    try {
      return (ctx as unknown as { get?: (k: string) => unknown }).get?.('sessions') as { list?: () => readonly { id: string; header?: { createdAt?: number } }[] } | undefined
    } catch {
      return undefined
    }
  }

  const registry = new DeviceRegistry(
    dataFile,
    secretsFile,
    {
      localPort: () => webServer?.port,
      localWorkspaces: () => {
        const runningIds = new Set<string>()
        try {
          for (const agent of getLocalAgents()?.list?.() ?? []) {
            if (agent.status === 'running') runningIds.add(String(agent.id))
          }
        } catch {
          // Ignore
        }
        return readLocalPhysicalWorkspaces(getWorkspaceRegistry(), runningIds)
      },
      localSessionUpdatedAt: () => {
        const map = new Map<string, number>()
        try {
          for (const s of getLocalSessions()?.list?.() ?? []) {
            map.set(String(s.id), s.header?.createdAt ?? 0)
          }
        } catch {
          // Ignore
        }
        return map
      },
    },
    {
      enableTunnels,
      enableNativeProxy: enableNative,
    },
  )

  if (features.autoGitAggregate === false) {
    registry.aggregator.setConfig({ autoGitAggregate: false })
  }

  // 1. Mount Control Plane HTTP + SSE routes (independent of Aggregated Mode!)
  const admitRequest = (req: import('node:http').IncomingMessage): boolean => {
    try {
      const connection = (ctx as unknown as { get?: (k: string) => unknown }).get?.('connection') as
        | { requestRejection?: (r: { headers: import('node:http').IncomingHttpHeaders }) => number | undefined }
        | undefined
      if (connection?.requestRejection !== undefined) {
        return connection.requestRejection({ headers: req.headers }) === undefined
      }
    } catch {
      // Fallback to loopback check
    }
    const host = req.headers.host ?? ''
    return (
      host.startsWith('127.0.0.1:') ||
      host.startsWith('localhost:') ||
      host === '127.0.0.1' ||
      host === 'localhost'
    )
  }

  const controlPlane = new MultiDeviceControlPlane(registry, admitRequest)

  ctx.effect(() => {
    const disposers: Array<() => void> = []
    try {
      disposers.push(
        webServer.register({
          kind: 'exact',
          path: MULTI_DEVICE_API_PATH,
          handler: (req, res) => {
            void controlPlane.handleApiHttp(req, res)
          },
        }),
      )
      disposers.push(
        webServer.register({
          kind: 'exact',
          path: MULTI_DEVICE_EVENTS_PATH,
          handler: (req, res) => {
            controlPlane.handleEventsSse(req, res)
          },
        }),
      )
    } catch (error) {
      console.error('[dsh-multi-device] Failed to register control-plane routes:', error)
    }
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-multi-device: control-plane routes')

  // 2. Start configured device connections & Native Mode proxies
  ctx.effect(() => {
    registry.startAll()
    return () => {
      registry.dispose()
    }
  }, 'dsh-multi-device: device registry')

  // 3. Attach Aggregated Mode Gateway when enabled and Host services become available
  if (enableAggregated) {
    ctx.inject(
      ['sessionController', 'workspaceController', 'typertGateway'],
      (gatewayCtx) => {
        gatewayCtx.effect(() => {
          try {
            const sessionController = (gatewayCtx as unknown as { sessionController: SessionControllerLike }).sessionController
            const workspaceController = (gatewayCtx as unknown as { workspaceController: WorkspaceControllerLike }).workspaceController
            const typertGateway = (gatewayCtx as unknown as { typertGateway: TypertGatewayLike }).typertGateway

            const disposeGateway = installAggregatedGateway02(
              registry,
              sessionController,
              workspaceController,
              typertGateway,
              getWorkspaceRegistry(),
            )
            registry.setGatewayStatus(true)
            return () => {
              disposeGateway()
              registry.setGatewayStatus(false)
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            console.error(
              `[dsh-multi-device] Aggregated Mode Gateway degraded (${msg}); Native Mode remains fully operational.`,
            )
            registry.setGatewayStatus(false, msg)
            return () => {}
          }
        }, 'dsh-multi-device: aggregated-gateway-02')
      },
    )
  } else {
    registry.setGatewayStatus(false, 'Disabled by configuration')
  }
}

export * from './contract.ts'

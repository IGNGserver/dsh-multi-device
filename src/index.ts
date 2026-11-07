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
import { appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  installAggregatedGateway02,
  readLocalPhysicalWorkspaces,
  supportsWorkspaceReplaceFrames,
  type SessionControllerLike,
  type TypertGatewayLike,
  type WorkspaceControllerLike,
  type WorkspaceRegistryLike,
} from './host/gateway.ts'
import { readLocalAttentionCatalog } from './host/local-attention.ts'
import { DeviceRegistry } from './host/registry.ts'
import { resolvePluginStorage } from './host/storage.ts'
import {
  admitMultiDeviceRequest,
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
  /** Custom path to persist device & aggregation config; defaults to the current Profile plugin storage. */
  readonly dataFile?: string
  /** Custom path to persist device auth secrets; defaults to the current Profile plugin storage. */
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
    /**
     * Expose the legacy HTTP(S) direct transport. SSH is the supported user
     * flow; direct exists only for advanced compatibility and tests.
     * Default: false.
     */
    readonly directTransport?: boolean
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
      directTransport: z.boolean().default(false),
    })
    .default({}),
})

/**
 * Append one activation record to `$DSH_HOME/dsh-multi-device-boot.log`.
 *
 * DSH's desktop host reports a failed plugin entry as the bare state word
 * (`dsh-multi-device: failed`) and drops the underlying error, which makes a
 * boot regression impossible to diagnose from the crash log. The host owns the
 * real exception, so it records it here before rethrowing.
 */
function appendBootLog(dshHome: string, line: string): void {
  try {
    appendFileSync(join(dshHome, 'dsh-multi-device-boot.log'), `${new Date().toISOString()} ${line}\n`)
  } catch {
    // Boot logging must never change the outcome of activation.
  }
}

export function apply(ctx: Context, config?: Config): void {
  const resolved = Config(config ?? {})
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const defaults = resolved.dataFile !== undefined && resolved.secretsFile !== undefined
    ? { dataFile: resolved.dataFile, secretsFile: resolved.secretsFile }
    : resolvePluginStorage(dshHome, process.env.DSH_PROFILE_DIR, process.env.DSH_PROFILE)
  const dataFile = resolved.dataFile ?? defaults.dataFile
  const secretsFile = resolved.secretsFile ?? defaults.secretsFile

  appendBootLog(dshHome, 'apply:enter')
  try {
    applyHost(ctx, resolved, dshHome, dataFile, secretsFile)
    appendBootLog(dshHome, 'apply:ok')
  } catch (error) {
    appendBootLog(
      dshHome,
      `apply:failed ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    )
    throw error
  }
}

function applyHost(
  ctx: Context,
  resolved: Config,
  dshHome: string,
  dataFile: string,
  secretsFile: string,
): void {
  const features = resolved.features ?? {}
  const enableAggregated = features.aggregatedMode !== false
  const enableNative = features.nativeMode !== false
  const enableTunnels = features.sshTunnel !== false

  const webServer = (ctx as unknown as {
    webServer: {
      port?: number
      protocol?: 'http:' | 'https:'
      getOrigin?: () => string
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

  /**
   * The Client WorkspaceModel ships with the same release as the Host. Its
   * `clientModules` service publishes that release version; DSH 0.2.0 does
   * not understand an incremental workspace `replace`, so the aggregated
   * stream only uses it on newer clients.
   */
  const getClientReleaseVersion = (): string | undefined => {
    try {
      const service = (ctx as unknown as { get?: (k: string) => unknown }).get?.('clientModules') as
        | { release?: { version?: unknown } }
        | undefined
      return typeof service?.release?.version === 'string' ? service.release.version : undefined
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

  const getLocalSessions = (): {
    list?: () => readonly {
      id: string
      header?: { createdAt?: number; origin?: 'subagent' }
    }[]
  } | undefined => {
    try {
      return (ctx as unknown as { get?: (k: string) => unknown }).get?.('sessions') as {
        list?: () => readonly {
          id: string
          header?: { createdAt?: number; origin?: 'subagent' }
        }[]
      } | undefined
    } catch {
      return undefined
    }
  }

  // Local Session activity arrives as `api-session/activity`; keeping the
  // latest timestamp avoids sorting local Sessions by creation time.
  const localSessionActivity = new Map<string, number>()
  ctx.effect(() => {
    const on = (ctx as unknown as {
      on?: (event: string, listener: (sessionId: string, updatedAt: number) => void) => (() => void) | void
    }).on
    if (typeof on !== 'function') return () => {}
    const dispose = on.call(ctx, 'api-session/activity', (sessionId, updatedAt) => {
      if (typeof sessionId === 'string' && typeof updatedAt === 'number') {
        localSessionActivity.set(sessionId, updatedAt)
      }
    })
    return typeof dispose === 'function' ? dispose : () => {}
  }, 'dsh-multi-device: local session activity')

  const registry = new DeviceRegistry(
    dataFile,
    secretsFile,
    {
      localPort: () => webServer?.port,
      localSessionCatalog: signal => readLocalAttentionCatalog(
        key => (ctx as unknown as { get?: (key: string) => unknown }).get?.(key), signal,
      ),
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
        const map = new Map<string, number>(localSessionActivity)
        try {
          const live = new Set<string>()
          for (const s of getLocalSessions()?.list?.() ?? []) {
            const id = String(s.id)
            live.add(id)
            if (!map.has(id)) map.set(id, s.header?.createdAt ?? 0)
          }
          // The activity map only ever grows; a deleted Session would
          // otherwise keep contributing a stale recency forever.
          for (const id of localSessionActivity.keys()) {
            if (!live.has(id)) localSessionActivity.delete(id)
          }
        } catch {
          // Ignore
        }
        return map
      },
      // Archived Sessions have no default sidebar row, so the unread counters
      // must know about them to avoid reporting reminders that cannot be seen.
      localArchivedSessionIds: () => {
        try {
          return (getWorkspaceRegistry()?.archivedSessionIds ?? []).map(String)
        } catch {
          return []
        }
      },
      // Subagent children render under their parent Session, never as rows.
      localSubagentSessionIds: () => {
        try {
          return (getLocalSessions()?.list?.() ?? [])
            .filter(s => s.header?.origin === 'subagent')
            .map(s => String(s.id))
        } catch {
          return []
        }
      },
    },
    {
      enableTunnels,
      enableNativeProxy: enableNative,
      localOrigin: () => {
        try {
          if (typeof webServer?.getOrigin === 'function') return webServer.getOrigin()
        } catch {
          // Fall back to the loopback origin below.
        }
        if (webServer?.port === undefined) return undefined
        const protocol = webServer.protocol === 'https:' ? 'https' : 'http'
        return `${protocol}://127.0.0.1:${String(webServer.port)}`
      },
      allowDirectTransport: features.directTransport === true,
    },
  )

  // Seed local running baselines so a completion observed after a reload is
  // still a real transition rather than a first `false`.
  try {
    for (const agent of getLocalAgents()?.list?.() ?? []) {
      if (agent.status === 'running') registry.observeLocalSessionStatus(String(agent.id), true)
    }
  } catch {
    // Best-effort: the status event path still covers later transitions.
  }

  // Local Sessions share the same Host-owned unread set as remote Sessions, so
  // several browsers attached to this Host agree on local reminders too.
  ctx.effect(() => {
    const on = (ctx as unknown as {
      on?: (event: string, listener: (sessionId: string, running: boolean) => void) => (() => void) | void
    }).on
    if (typeof on !== 'function') return () => {}
    const dispose = on.call(ctx, 'api-session/status', (sessionId, running) => {
      if (typeof sessionId === 'string' && typeof running === 'boolean') {
        registry.observeLocalSessionStatus(sessionId, running)
        void registry.refreshLocalCatalog()
      }
    })
    return typeof dispose === 'function' ? dispose : () => {}
  }, 'dsh-multi-device: local session status')

  // A deleted local Session must not leave an unread marker behind: the badge
  // would keep counting a conversation the sidebar can no longer open.
  ctx.effect(() => {
    const on = (ctx as unknown as {
      on?: (event: string, listener: (sessionId: string) => void) => (() => void) | void
    }).on
    if (typeof on !== 'function') return () => {}
    const dispose = on.call(ctx, 'api-session/removed', (sessionId) => {
      if (typeof sessionId === 'string' && sessionId !== '') {
        registry.forgetLocalSession(sessionId)
      }
    })
    return typeof dispose === 'function' ? dispose : () => {}
  }, 'dsh-multi-device: local session removal')

  ctx.effect(() => {
    const on = (ctx as unknown as { on?: (event: string, listener: (...args: any[]) => void) => (() => void) | void }).on
    if (typeof on !== 'function') return () => {}
    const disposers = [
      on.call(ctx, 'api-session/added', (summary: { sessionId?: string; running?: boolean; blank?: boolean; origin?: string }) => {
        if (typeof summary?.sessionId === 'string') registry.observeLocalSessionAdded({
          sessionId: summary.sessionId, deviceId: 'local', running: summary.running === true,
          blank: summary.blank, origin: summary.origin,
        })
      }),
      on.call(ctx, 'api-session/activity', () => { void registry.refreshLocalCatalog() }),
      on.call(ctx, 'workspace/changed', () => { void registry.refreshLocalCatalog() }),
    ]
    return () => { for (const off of disposers) if (typeof off === 'function') off() }
  }, 'dsh-multi-device: local catalog updates')

  // This isolated compatibility adapter reads only correlation ids and kinds,
  // never request bodies. If DSH changes the private map shape we publish no
  // invented requests; remote devices use their supported $events protocol.
  ctx.effect(() => {
    const sample = (): void => {
      let gateway: { pendingRemoteEvents?: unknown } | undefined
      try { gateway = (ctx as unknown as { get?: (key: string) => unknown }).get?.('typertGateway') as typeof gateway } catch { return }
      const pending = gateway?.pendingRemoteEvents
      if (!(pending instanceof Map)) return
      const requests: Array<{ eventId: string; sessionId: string; kind: 'approval' | 'question' | 'plan-review' }> = []
      for (const [id, value] of pending) {
        const frame = (value as { frame?: { event?: string; agentId?: string; request?: { questions?: Array<{ intent?: { kind?: string } }> } } })?.frame
        if (typeof id !== 'string' || typeof frame?.agentId !== 'string') continue
        const kind = frame.event === 'approval/request' ? 'approval'
          : frame.event === 'plan-review/request' || (frame.event === 'user-questions/request' && frame.request?.questions?.length === 1 && frame.request.questions[0]?.intent?.kind === 'plan-review') ? 'plan-review'
          : frame.event === 'user-questions/request' ? 'question' : undefined
        if (kind !== undefined) requests.push({ eventId: id, sessionId: frame.agentId, kind })
      }
      registry.observeLocalPending(requests)
    }
    sample()
    const timer = setInterval(sample, 1_000)
    timer.unref?.()
    return () => clearInterval(timer)
  }, 'dsh-multi-device: local pending compatibility')

  if (features.autoGitAggregate === false) {
    registry.aggregator.setConfig({ autoGitAggregate: false })
  }

  // The browser model picker caches one catalog per Host generation. Re-emit
  // DSH's own model-change event whenever the active Session changes device or
  // a remote device's catalog changes, so that picker refetches instead of
  // offering stale/foreign groups.
  registry.onModelCatalogChanged(() => {
    try {
      const emit = (ctx as unknown as { emit?: (event: string) => void }).emit
      emit?.call(ctx, 'llm/adapters-updated')
    } catch {
      // The picker still refetches on the next connection reset.
    }
  })

  // 1. Mount Control Plane HTTP + SSE routes (independent of Aggregated Mode!)
  // Re-read `connection` per request and call `requestRejection` as a method.
  // Detaching it (`const reject = connection.requestRejection; reject(...)`)
  // drops Cordis's traceable receiver and crashes the desktop host.
  const admitRequest = (req: import('node:http').IncomingMessage): boolean =>
    admitMultiDeviceRequest(ctx, req)

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

            registry.setLocalWorkspaceCreator(async (path) => {
              await workspaceController.create({ path })
            })
            registry.setLocalSessionCreator(async (cwd) => {
              const created = await sessionController.create({ cwd })
              return created.sessionId
            })

            const disposeGateway = installAggregatedGateway02(
              registry,
              sessionController,
              workspaceController,
              typertGateway,
              getWorkspaceRegistry(),
              {
                workspaceReplaceFrames: () =>
                  supportsWorkspaceReplaceFrames(getClientReleaseVersion()),
              },
            )
            registry.setGatewayStatus(true)
            return () => {
              disposeGateway()
              registry.setLocalWorkspaceCreator(async () => {
                throw new Error('Local workspace creation is unavailable')
              })
              registry.setLocalSessionCreator(async () => {
                throw new Error('Local workspace creation is unavailable')
              })
              registry.setGatewayStatus(false)
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            console.error(
              `[dsh-multi-device] Aggregated Mode Gateway degraded (${msg}); Native Mode remains fully operational.`,
            )
            registry.setGatewayStatus(false, msg)
            // Staying in Aggregated Mode without a gateway is a broken
            // pseudo-aggregate: remote Sessions vanish and the repair loop
            // can never heal them. Fall back to Native Mode so the UI never
            // sits in a state that silently drops remote data.
            if (registry.isAggregatedMode()) {
              console.error('[dsh-multi-device] Reverting to Native Mode: the aggregated gateway is unavailable.')
              registry.setDisplayMode('native')
            }
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

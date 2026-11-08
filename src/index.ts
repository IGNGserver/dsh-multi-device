/**
 * `dsh-multi-device` Host Plugin Entry.
 *
 * Mounts:
 * 1. `DeviceRegistry`: persistent device registry, SSH tunnel supervisor, and
 *    the independent Native Mode reverse-proxy manager.
 * 2. `MultiDeviceControlPlane`: `/multi-device/api` and `/multi-device/events` SSE routes
 *    so the Client UI can manage devices, import `~/.ssh/config`, and drive the
 *    device tab strip. Nothing is injected into the local Session Controller:
 *    remote Sessions are only ever rendered by their own device's DSH page.
 *
 * @module dsh-multi-device
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
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
 * and provides the device tab strip even if higher-level controller services
 * change in future DSH releases.
 */
export const inject = ['webServer']

export interface Config {
  /** Custom path to persist device config; defaults to the current Profile plugin storage. */
  readonly dataFile?: string
  /** Custom path to persist device auth secrets; defaults to the current Profile plugin storage. */
  readonly secretsFile?: string
  readonly features?: {
    /** Enable automatic SSH tunnel management. Default: true. */
    readonly sshTunnel?: boolean
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
      sshTunnel: z.boolean().default(true),
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

/** The slice of DSH's `workspaceRegistry` this plugin reads. */
interface WorkspaceRegistryLike {
  readonly archivedSessionIds: readonly string[]
}

function applyHost(
  ctx: Context,
  resolved: Config,
  dshHome: string,
  dataFile: string,
  secretsFile: string,
): void {
  const features = resolved.features ?? {}
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

  const registry = new DeviceRegistry(
    dataFile,
    secretsFile,
    {
      localPort: () => webServer?.port,
      localSessionCatalog: signal => readLocalAttentionCatalog(
        key => (ctx as unknown as { get?: (key: string) => unknown }).get?.(key), signal,
      ),
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

  // 1. Mount Control Plane HTTP + SSE routes.
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
      void registry.flushPersistence().catch(error => {
        console.error('[dsh-multi-device] Failed to flush catalog persistence:', error)
      })
    }
  }, 'dsh-multi-device: device registry')

}

export * from './contract.ts'

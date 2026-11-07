/**
 * Host Aggregated Mode Gateway (`AggregatedGateway`).
 *
 * Attaches reversibly via `ctx.effect()` to DSH 0.2's `sessionController`,
 * `workspaceController`, and `typertGateway` (with a DSH 0.1 `apiProxy` fallback).
 *
 * Guarantees:
 * - Zero core file modifications: all hooks are runtime service method wrappers that
 *   cleanly restore original methods when the plugin unloads or reloads (HMR).
 * - Mode Independence: if attaching to the Host controllers fails for any reason,
 *   the error is caught and reported in `registry.setGatewayStatus(false, err)` while
 *   Native Mode and the Multi-Device Hub continue operating normally.
 * - Full Session, Workspace, Projection, Approval & Question Waterfall routing across
 *   local and remote devices.
 *
 * @module dsh-multi-device/host/gateway
 */
import {
  decodeLogicalWorkspaceId,
  decodeRemoteEventId,
  decodeRemoteWorkspaceId,
  decodeSessionId,
  type DeviceId,
  encodeRemoteSessionId,
  encodeRemoteWorkspaceId,
  LOCAL_DEVICE_ID,
  workspaceMemberKey,
} from '../contract.ts'
import type { PhysicalWorkspaceInput } from './git-aggregator.ts'
import type { DeviceRegistry } from './registry.ts'
import { BoundedStreamQueue } from './stream-queue.ts'

export interface SessionControllerLike {
  list(_request: { cursor?: string }, signal: AbortSignal): Promise<{ items: readonly Record<string, unknown>[] }>
  search(request: { query: string }, signal: AbortSignal): Promise<{ items: readonly { sessionId: string; snippet: string }[]; hasMore: boolean }>
  create(request: { workspaceId?: string; cwd?: string; sessionId?: string; agentPreset?: string }): Promise<{ sessionId: string; agentPreset?: string }>
  selectModel(request: { sessionId: string; provider: string; model: string; reasoningEffort?: string }): Promise<{ selected: Record<string, unknown> }>
  modelCatalog(): Promise<Record<string, unknown>>
  rename(request: { sessionId: string; title: string }): Promise<{ title: string; seq: number }>
  fork(request: { sessionId: string; atSeq?: number; allowMigration?: boolean }): Promise<{ sessionId: string }>
  prompt(request: { requestId: string; sessionId: string; mode: 'queue' | 'steer'; content: readonly unknown[]; clientTimeZone?: string }, signal: AbortSignal): Promise<{ accepted: true }>
  attachment(request: { sessionId: string; attachmentId: string }): Promise<Record<string, unknown>>
  updateQueue(request: { sessionId: string; itemId: string; action: Record<string, unknown> }): Promise<{ accepted: true }>
  cancel(request: { sessionId: string }): { accepted: true } | Promise<{ accepted: true }>
  page(request: Record<string, unknown>, signal: AbortSignal): Promise<{ records: readonly unknown[]; hasMore: boolean }>
  follow(request: Record<string, unknown>, signal: AbortSignal): AsyncIterable<Record<string, unknown>>
  projections(request: { sessionId: string }, signal: AbortSignal): Promise<{ asOfSeq: number; values: Record<string, unknown> } | null>
  control(signal: AbortSignal): AsyncIterable<Record<string, unknown>>
  openWorkspacePath?(
    request: { path: string; action?: 'reveal'; application?: string },
    signal: AbortSignal,
  ): Promise<{ opened: true }>
}

export interface WorkspaceControllerLike {
  create(request: { path: string }): Promise<{ workspace: Record<string, unknown>; created: boolean }>
  rename(request: { workspaceId: string; title: string }): Promise<{ workspace: Record<string, unknown> }>
  delete(request: { workspaceId: string }): Promise<{ deleted: true }>
  insertBefore(request: { workspaceId: string; beforeWorkspaceId?: string }): Promise<{ workspaceIds: readonly string[] }>
  insertSessionBefore(request: { workspaceId: string; sessionId: string; beforeSessionId?: string }): Promise<{ workspace: Record<string, unknown> }>
  archiveSession(request: { sessionId: string; stopActivity?: boolean }): Promise<{ archivedSessionIds: readonly string[] }>
  unarchiveSession(request: { sessionId: string }): Promise<{ archivedSessionIds: readonly string[] }>
  pinSession(request: { sessionId: string }): Promise<{ pinnedSessionIds: readonly string[] }>
  unpinSession(request: { sessionId: string }): Promise<{ pinnedSessionIds: readonly string[] }>
  follow(signal: AbortSignal): AsyncIterable<Record<string, unknown>>
}

export interface WorkspaceRegistryLike {
  list(): readonly {
    readonly id: string
    readonly path: string
    readonly title: string
    readonly sessionIds: readonly string[]
    readonly createdAt: string
    readonly updatedAt: string
  }[]
  readonly archivedSessionIds: readonly string[]
  readonly pinnedSessionIds: readonly string[]
}

export interface ModelCatalogLike {
  readonly default: Record<string, unknown>
  readonly routableProviders: readonly string[]
  readonly groups: {
    readonly id: string
    readonly name: string
    readonly models: {
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly reasoning?: unknown
    }[]
  }[]
  readonly failures: {
    readonly id: string
    readonly name: string
    readonly message: string
  }[]
}

/**
 * A remote catalog can be temporarily unavailable (SSH reconnect, remote DSH
 * restart). Return a valid empty catalog with a visible failure instead of
 * falling back to local models: a remote Agent cannot run a local-only model.
 */
export function unavailableRemoteCatalog(deviceName: string, message: string): ModelCatalogLike {
  return {
    default: { provider: '', model: '' },
    routableProviders: [],
    groups: [],
    failures: [{ id: `remote:${deviceName}`, name: deviceName, message }],
  }
}

export interface TypertGatewayLike {
  wireStream: {
    open(
      endpoint: string,
      payload: unknown,
      uplink: AsyncIterable<unknown>,
      peer: unknown,
      signal: AbortSignal,
    ): Promise<AsyncIterable<unknown>>
    failure(error: unknown): { code: string; message: string; details: object }
  }
  dispatchRpc?(
    endpoint: string,
    payload: unknown,
    signal: AbortSignal,
    peer: unknown,
  ): Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string; details: object } }>
}

/**
 * Extract local workspaces from `ctx.workspaceRegistry` for `DeviceRegistry`.
 */
export function readLocalPhysicalWorkspaces(
  workspaceRegistry: WorkspaceRegistryLike | undefined,
  localRunningSessionIds: ReadonlySet<string>,
): PhysicalWorkspaceInput[] {
  if (workspaceRegistry === undefined) return []
  try {
    return workspaceRegistry.list().map(ws => ({
      deviceId: LOCAL_DEVICE_ID,
      deviceName: 'Local',
      workspaceId: String(ws.id),
      path: ws.path,
      title: ws.title,
      sessionIds: [...ws.sessionIds].map(String),
      runningSessionCount: ws.sessionIds.filter(id => localRunningSessionIds.has(String(id))).length,
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt,
    }))
  } catch {
    return []
  }
}

/** Options for the aggregated workspace stream. */
export interface AggregatedGatewayOptions {
  /**
   * Emit the DSH 0.2.1+ `replace` frame for workspace-set changes instead of
   * `remove`. The Client WorkspaceModel tombstones every removed id for the
   * lifetime of the page, so a later `upsert` of a workspace that merely
   * became invisible (Native Mode) or temporarily disappeared can never
   * resurrect it. `replace` swaps the whole projection without tombstones.
   */
  readonly workspaceReplaceFrames?: boolean | (() => boolean)
  /**
   * How long `session.page` / `session.follow` wait for a reconnecting device
   * before surfacing an offline error. Opening a conversation on a device that
   * is still coming back up should show the session, not a red transport error.
   * Defaults to 60s; `0` fails immediately.
   */
  readonly offlineWaitMs?: number
}

/** One workspace row carried by the aggregated follow stream. */
interface WorkspaceFollowView {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly sessionIds: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly [key: string]: unknown
}

/** Complete aggregated workspace projection carried by a baseline/replace. */
interface WorkspaceFollowState {
  readonly items: readonly WorkspaceFollowView[]
  readonly archivedSessionIds: readonly string[]
  readonly pinnedSessionIds: readonly string[]
}

/**
 * Whether the bundled Client WorkspaceModel understands an incremental
 * `replace` frame. DSH 0.2.0 only accepts it as the opening snapshot; the
 * client gained the incremental case in 0.2.1-rc.1.
 *
 * @param version - Host/client release version, e.g. `0.2.2-rc.1`.
 * @returns true when emitting `replace` after `baseline` is safe.
 */
export function supportsWorkspaceReplaceFrames(version: string | undefined): boolean {
  if (version === undefined) return false
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(version.trim())
  if (match === null) return false
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  if (major !== 0 || minor !== 2) return major > 0 || minor > 2
  if (patch !== 1) return patch > 1
  const pre = match[4]
  if (pre === undefined) return true
  const rc = /^rc\.(\d+)$/.exec(pre)
  return rc !== null && Number(rc[1]) >= 1
}

/**
 * Build a wire-compatible remote failure for an unreachable device.
 *
 * `isDSHRemoteError`/`code`/`details` are exactly what the Host RPC serializer
 * reads, so the browser receives this code and message instead of
 * `gateway/internal`, and the conversation's error line stays actionable.
 */
export function deviceOfflineError(deviceName: string, detail?: string): Error {
  const error = new Error(
    `Device "${deviceName}" is offline${detail === undefined || detail === '' ? '' : ` (${detail})`}. Reconnect it and retry.`,
  ) as Error & {
    code: string
    details: Record<string, unknown>
    isDSHRemoteError: boolean
  }
  error.name = 'RemoteError'
  error.code = 'dsh-md/device-offline'
  error.details = { deviceName }
  error.isDSHRemoteError = true
  return error
}

/**
 * Install the DSH 0.2 Aggregated Mode service wrappers and return a disposer
 * that restores all original methods.
 */
export function installAggregatedGateway02(
  registry: DeviceRegistry,
  sessionController: SessionControllerLike,
  workspaceController: WorkspaceControllerLike,
  typertGateway: TypertGatewayLike,
  workspaceRegistry?: WorkspaceRegistryLike,
  options: AggregatedGatewayOptions = {},
): () => void {
  const disposers: Array<() => void> = []
  const supportsReplaceFrames = (): boolean =>
    typeof options.workspaceReplaceFrames === 'function'
      ? options.workspaceReplaceFrames()
      : options.workspaceReplaceFrames === true

  const offlineWaitMs = options.offlineWaitMs ?? 60_000
  /** Fail fast with the shared offline code when the device has no live baseline. */
  const requireConnected = (client: { isConnected(): boolean; deviceConfig: { name: string } }): void => {
    if (!client.isConnected()) throw deviceOfflineError(client.deviceConfig.name)
  }
  /**
   * Hold a Session open across a reconnect: the browser shows the normal
   * skeleton plus the localized offline banner instead of a red error line.
   */
  const waitForClient = async (
    client: { id: DeviceId; isConnected(): boolean; deviceConfig: { name: string }; toView(): { reconnectAttempt: number } },
    signal: AbortSignal,
  ): Promise<void> => {
    if (client.isConnected()) return
    const reachable = await registry.waitForDeviceConnected(client.id, signal, offlineWaitMs)
    if (!reachable) {
      throw deviceOfflineError(client.deviceConfig.name, `reconnect attempt ${String(client.toView().reconnectAttempt)}`)
    }
  }

  const patchMethod = <T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]): void => {
    // Skip methods a newer/older shell does not implement instead of creating
    // them as plain own properties: synthesizing `openWorkspacePath` (or any
    // future method) on a controller object that never had it would look
    // "supported" to feature probes while breaking the real call path.
    const original = target[key]
    if (typeof original !== 'function') return
    target[key] = replacement
    disposers.push(() => {
      target[key] = original
    })
  }

  // Bind original methods
  const origSessionList = sessionController.list.bind(sessionController)
  const origSessionSearch = sessionController.search.bind(sessionController)
  const origSessionCreate = sessionController.create.bind(sessionController)
  const origSessionSelectModel = sessionController.selectModel.bind(sessionController)
  const origSessionRename = sessionController.rename.bind(sessionController)
  const origSessionFork = sessionController.fork.bind(sessionController)
  const origSessionPrompt = sessionController.prompt.bind(sessionController)
  const origSessionAttachment = sessionController.attachment.bind(sessionController)
  const origSessionUpdateQueue = sessionController.updateQueue.bind(sessionController)
  const origSessionCancel = sessionController.cancel.bind(sessionController)
  const origSessionPage = sessionController.page.bind(sessionController)
  const origSessionFollow = sessionController.follow.bind(sessionController)
  const origSessionProjections = sessionController.projections.bind(sessionController)
  const origSessionControl = sessionController.control.bind(sessionController)
  const origSessionOpenWorkspacePath =
    typeof sessionController.openWorkspacePath === 'function'
      ? sessionController.openWorkspacePath.bind(sessionController)
      : undefined

  const origWorkspaceRename = workspaceController.rename.bind(workspaceController)
  const origWorkspaceDelete = workspaceController.delete.bind(workspaceController)
  const origWorkspaceInsertBefore = workspaceController.insertBefore.bind(workspaceController)
  const origWorkspaceInsertSessionBefore = workspaceController.insertSessionBefore.bind(workspaceController)
  const origWorkspaceArchive = workspaceController.archiveSession.bind(workspaceController)
  const origWorkspaceUnarchive = workspaceController.unarchiveSession.bind(workspaceController)
  const origWorkspacePin = workspaceController.pinSession.bind(workspaceController)
  const origWorkspaceUnpin = workspaceController.unpinSession.bind(workspaceController)
  const origWorkspaceFollow = workspaceController.follow.bind(workspaceController)

  // 1. session.list
  patchMethod(sessionController, 'list', async (_request, signal) => {
    const local = await origSessionList(_request, signal)
    // Native Mode's local tab must be strictly local. The Host, not the
    // browser, owns this answer so a stale or second client cannot leak
    // remote sessions into it.
    if (!registry.isAggregatedMode()) return local
    const seen = new Set<string>()
    const merged: Record<string, unknown>[] = []

    for (const item of local.items) {
      const sid = typeof item.sessionId === 'string' ? item.sessionId : undefined
      if (sid !== undefined) {
        if (seen.has(sid)) continue
        seen.add(sid)
      }
      merged.push(item)
    }

    for (const client of registry.clientList()) {
      // One device must never fail the whole merged list: `session.list` is a
      // single RPC, and a browser that receives an error keeps its old
      // (local-only) store, which blanks every remote Workspace row. Project
      // each device on its own and report the offender instead.
      const projected: Record<string, unknown>[] = []
      let projectedOk = false
      try {
        for (const rawSummary of client.sessionSummaries()) {
          const nsSummary = client.namespaceSummary(rawSummary)
          if (seen.has(nsSummary.sessionId)) continue
          seen.add(nsSummary.sessionId)
          projected.push(nsSummary as unknown as Record<string, unknown>)
        }
        projectedOk = true
      } catch (error) {
        // Roll back this device's claims so a retry can add them again. Use
        // the id list captured *before* the projection, not a fresh
        // `sessionSummaries()` call: the same failure that broke the first
        // pass would rethrow here and take the whole merged RPC down.
        for (const nsId of projected.map(p => p.sessionId)) seen.delete(String(nsId))
        registry.noteSessionListError(
          client.id,
          error instanceof Error ? error.message : String(error),
        )
      }
      if (projectedOk) {
        merged.push(...projected)
        registry.clearSessionListError(client.id)
      }
    }

    merged.sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))
    return { items: merged }
  })

  // 2. session.search
  patchMethod(sessionController, 'search', async (request, signal) => {
    if (!registry.isAggregatedMode()) return origSessionSearch(request, signal)
    const localPromise = origSessionSearch(request, signal).catch(() => ({ items: [], hasMore: false }))
    const remotePromises = registry.clientList().map(async (client) => {
      try {
        const val = (await client.invokeUnary('session', 'search', { request }, signal)) as {
          items?: { sessionId: string; snippet: string }[]
          hasMore?: boolean
        }
        return {
          items: (val.items ?? []).map(item => ({
            sessionId: encodeRemoteSessionId(client.id, item.sessionId),
            snippet: item.snippet,
          })),
          hasMore: Boolean(val.hasMore),
        }
      } catch {
        return { items: [], hasMore: false }
      }
    })

    const [localRes, ...remoteResults] = await Promise.all([localPromise, ...remotePromises])
    const seen = new Set<string>()
    const items: { sessionId: string; snippet: string }[] = []
    let hasMore = localRes.hasMore

    for (const group of [localRes, ...remoteResults]) {
      if (group.hasMore) hasMore = true
      for (const item of group.items) {
        if (seen.has(item.sessionId)) continue
        seen.add(item.sessionId)
        items.push(item)
      }
    }

    return {
      items: items.slice(0, 20),
      hasMore: hasMore || items.length > 20,
    }
  })

  // 3. session.create
  patchMethod(sessionController, 'create', async (request) => {
    if (!registry.isAggregatedMode()) return origSessionCreate(request)
    // Case A: Reusing an existing remote blank sessionId. In a logical
    // workspace the reusable blank may live on a device that is no longer the
    // effective target (device switch, offline preference); reusing it would
    // silently ignore the user's choice, so fall through to Case B instead.
    if (request.sessionId !== undefined) {
      const owner = registry.resolveSessionOwner(request.sessionId)
      if (owner !== undefined) {
        const requestedLws = request.workspaceId !== undefined && decodeLogicalWorkspaceId(request.workspaceId) !== undefined
          ? registry.snapshot().logicalWorkspaces.find(w => w.logicalWorkspaceId === request.workspaceId)
          : undefined
        const targetDeviceId = requestedLws?.effectiveTargetDeviceId ?? requestedLws?.targetDeviceId
        if (requestedLws === undefined || targetDeviceId === owner.client.id) {
          requireConnected(owner.client)
          const rawWorkspaceId = request.workspaceId ? resolveRemoteWorkspaceIdForDevice(registry, request.workspaceId, owner.client.id) : undefined
          const created = (await owner.client.invokeUnary('session', 'create', {
            request: {
              sessionId: owner.rawSessionId,
              ...(rawWorkspaceId !== undefined ? { workspaceId: rawWorkspaceId } : {}),
              ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
              ...(request.agentPreset !== undefined ? { agentPreset: request.agentPreset } : {}),
            },
          })) as { sessionId: string; agentPreset?: string }
          registry.nativeProxyManager.requestRefresh(owner.client.id)
          // A new remote Session enters the local store only via an
          // `api-session/added` replay; if that event is lost the Workspace
          // row shows an invisible child. Reconcile the catalog now so the
          // summary reaches every live `$events` generation immediately.
          void owner.client.refreshSessionCatalog().catch(() => {})
          return {
            sessionId: encodeRemoteSessionId(owner.client.id, created.sessionId),
            ...(created.agentPreset !== undefined ? { agentPreset: created.agentPreset } : {}),
          }
        }
      }
    }

    // Case B: Creating in a Logical Workspace (`md-lws~...`). The effective
    // target keeps "+ New Session" working while the preferred device is
    // offline; the fallback member's path is the only valid `cwd`.
    if (request.workspaceId !== undefined && decodeLogicalWorkspaceId(request.workspaceId) !== undefined) {
      const snap = registry.snapshot()
      const lws = snap.logicalWorkspaces.find(w => w.logicalWorkspaceId === request.workspaceId)
      if (lws !== undefined) {
        const targetDeviceId = lws.effectiveTargetDeviceId ?? lws.targetDeviceId
        const targetPath = lws.effectiveTargetPath ?? lws.targetPath
        if (targetDeviceId === LOCAL_DEVICE_ID) {
          const localMember = lws.members.find(m => m.deviceId === LOCAL_DEVICE_ID)
          const reusable = reusableSessionIdFor(request.sessionId, LOCAL_DEVICE_ID)
          return origSessionCreate({
            ...(localMember !== undefined
              ? { workspaceId: localMember.remoteWorkspaceId }
              : { cwd: targetPath }),
            ...(reusable !== undefined ? { sessionId: reusable } : {}),
            ...(request.agentPreset !== undefined ? { agentPreset: request.agentPreset } : {}),
          })
        }
        const remoteClient = registry.client(targetDeviceId)
        const remoteMember = lws.members.find(m => m.deviceId === targetDeviceId)
        if (remoteClient !== undefined) {
          requireConnected(remoteClient)
          const reusable = reusableSessionIdFor(request.sessionId, remoteClient.id)
          const created = (await remoteClient.invokeUnary('session', 'create', {
            request: {
              ...(remoteMember !== undefined
                ? { workspaceId: remoteMember.remoteWorkspaceId }
                : { cwd: targetPath }),
              ...(reusable !== undefined ? { sessionId: reusable } : {}),
              ...(request.agentPreset !== undefined ? { agentPreset: request.agentPreset } : {}),
            },
          })) as { sessionId: string; agentPreset?: string }
          registry.nativeProxyManager.requestRefresh(remoteClient.id)
          void remoteClient.refreshSessionCatalog().catch(() => {})
          return {
            sessionId: encodeRemoteSessionId(remoteClient.id, created.sessionId),
            ...(created.agentPreset !== undefined ? { agentPreset: created.agentPreset } : {}),
          }
        }
      }
    }

    // Case C: Creating in a single remote workspace (`md-ws~...`)
    if (request.workspaceId !== undefined) {
      const decodedWs = decodeRemoteWorkspaceId(request.workspaceId)
      if (decodedWs.isRemote) {
        const remoteClient = registry.client(decodedWs.deviceId)
        if (remoteClient !== undefined) {
          requireConnected(remoteClient)
          const reusable = reusableSessionIdFor(request.sessionId, remoteClient.id)
          const created = (await remoteClient.invokeUnary('session', 'create', {
            request: {
              workspaceId: decodedWs.rawWorkspaceId,
              ...(reusable !== undefined ? { sessionId: reusable } : {}),
              ...(request.agentPreset !== undefined ? { agentPreset: request.agentPreset } : {}),
            },
          })) as { sessionId: string; agentPreset?: string }
          registry.nativeProxyManager.requestRefresh(remoteClient.id)
          void remoteClient.refreshSessionCatalog().catch(() => {})
          return {
            sessionId: encodeRemoteSessionId(remoteClient.id, created.sessionId),
            ...(created.agentPreset !== undefined ? { agentPreset: created.agentPreset } : {}),
          }
        }
      }
    }

    return origSessionCreate(request)
  })

  // 4. Session-addressed unary commands
  patchMethod(sessionController, 'selectModel', async (request) => {
    if (!registry.isAggregatedMode()) return origSessionSelectModel(request)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionSelectModel(request)
    requireConnected(owner.client)
    return (await owner.client.invokeUnary('session', 'selectModel', {
      request: {
        ...request,
        sessionId: owner.rawSessionId,
      },
    })) as { selected: Record<string, unknown> }
  })

  // The official endpoint has no Session argument and browser Peers are shared.
  // Keep it local; the plugin's Client adapter uses an explicit scoped endpoint.
  patchMethod(sessionController, 'rename', async (request) => {
    if (!registry.isAggregatedMode()) return origSessionRename(request)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionRename(request)
    requireConnected(owner.client)
    return (await owner.client.invokeUnary('session', 'rename', {
      request: { sessionId: owner.rawSessionId, title: request.title },
    })) as { title: string; seq: number }
  })

  patchMethod(sessionController, 'fork', async (request) => {
    if (!registry.isAggregatedMode()) return origSessionFork(request)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionFork(request)
    requireConnected(owner.client)
    const res = (await owner.client.invokeUnary('session', 'fork', {
      request: {
        sessionId: owner.rawSessionId,
        ...(request.atSeq !== undefined ? { atSeq: request.atSeq } : {}),
        ...(request.allowMigration !== undefined ? { allowMigration: request.allowMigration } : {}),
      },
    })) as { sessionId: string }
    await owner.client.refreshSessionCatalog().catch(() => {})
    registry.nativeProxyManager.requestRefresh(owner.client.id)
    return { sessionId: encodeRemoteSessionId(owner.client.id, res.sessionId) }
  })

  patchMethod(sessionController, 'prompt', async (request, signal) => {
    if (!registry.isAggregatedMode()) return origSessionPrompt(request, signal)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionPrompt(request, signal)
    requireConnected(owner.client)
    return (await owner.client.invokeUnary(
      'session',
      'prompt',
      { request: { ...request, sessionId: owner.rawSessionId } },
      signal,
    )) as { accepted: true }
  })

  patchMethod(sessionController, 'attachment', async (request) => {
    if (!registry.isAggregatedMode()) return origSessionAttachment(request)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionAttachment(request)
    requireConnected(owner.client)
    return (await owner.client.invokeUnary('session', 'attachment', {
      request: { ...request, sessionId: owner.rawSessionId },
    })) as Record<string, unknown>
  })

  patchMethod(sessionController, 'updateQueue', async (request) => {
    if (!registry.isAggregatedMode()) return origSessionUpdateQueue(request)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionUpdateQueue(request)
    requireConnected(owner.client)
    return (await owner.client.invokeUnary('session', 'updateQueue', {
      request: { ...request, sessionId: owner.rawSessionId },
    })) as { accepted: true }
  })

  patchMethod(sessionController, 'cancel', (request) => {
    if (!registry.isAggregatedMode()) return origSessionCancel(request)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionCancel(request)
    // This one is synchronous by contract: reject instead of throwing so the
    // RPC layer reports the failure exactly like an async method would.
    if (!owner.client.isConnected()) return Promise.reject(deviceOfflineError(owner.client.deviceConfig.name))
    return owner.client.invokeUnary('session', 'cancel', {
      request: { sessionId: owner.rawSessionId },
    }) as Promise<{ accepted: true }>
  })

  patchMethod(sessionController, 'projections', async (request, signal) => {
    if (!registry.isAggregatedMode()) return origSessionProjections(request, signal)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionProjections(request, signal)
    requireConnected(owner.client)
    const res = (await owner.client.invokeUnary(
      'session',
      'projections',
      { request: { sessionId: owner.rawSessionId } },
      signal,
    )) as { kind?: string; asOfSeq: number; values: Record<string, unknown> } | null
    if (res === null || !isRecord(res) || !isRecord(res.values)) return res
    return {
      ...res,
      values: owner.client.namespaceProjectionValues(res.values),
    }
  })

  if (origSessionOpenWorkspacePath !== undefined) {
    patchMethod(sessionController, 'openWorkspacePath', async (request, signal) => {
      const path = request.path
      const remote = registry.snapshot().allPhysicalWorkspaces.find(workspace => {
        if (workspace.deviceId === LOCAL_DEVICE_ID) return false
        const root = workspace.path.replace(/[\\/]+$/, '')
        return path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}\\`)
      })
      if (remote !== undefined) {
        throw new Error(
          'Remote workspace paths can only be opened inside Native Mode; the aggregated mode will not open them on the local machine',
        )
      }
      return origSessionOpenWorkspacePath(request, signal)
    })
  }

  // 5. session.page & session.follow (address-routed)
  patchMethod(sessionController, 'page', async (request, signal) => {
    if (!registry.isAggregatedMode()) return origSessionPage(request, signal)
    const routed = routeSessionAddress(registry, request.address as Record<string, unknown> | undefined)
    if (routed === undefined) return origSessionPage(request, signal)
    await waitForClient(routed.client, signal)
    return (await routed.client.invokeUnary(
      'session',
      'page',
      { request: { ...request, address: routed.rawAddress } },
      signal,
    )) as { records: readonly unknown[]; hasMore: boolean }
  })

  patchMethod(sessionController, 'follow', (request, signal) => {
    if (!registry.isAggregatedMode()) return origSessionFollow(request, signal)
    const routed = routeSessionAddress(registry, request.address as Record<string, unknown> | undefined)
    if (routed === undefined) return origSessionFollow(request, signal)
    return (async function* () {
      await waitForClient(routed.client, signal)
      let yielded = false
      try {
        const stream = routed.client.openStream(
          'session/follow',
          { request: { ...request, address: routed.rawAddress } },
          signal,
        )
        for await (const rawFrame of stream) {
          yielded = true
          if (isRecord(rawFrame) && rawFrame.type === 'snapshot' && isRecord(rawFrame.header)) {
            const header = {
              ...rawFrame.header,
              id: encodeRemoteSessionId(routed.client.id, String(rawFrame.header.id ?? '')),
              ...(typeof rawFrame.header.parentSession === 'string'
                ? { parentSession: encodeRemoteSessionId(routed.client.id, rawFrame.header.parentSession) }
                : {}),
            }
            const projections = isRecord(rawFrame.projections) && isRecord(rawFrame.projections.values)
              ? {
                  ...rawFrame.projections,
                  values: routed.client.namespaceProjectionValues(rawFrame.projections.values),
                }
              : rawFrame.projections
            yield {
              ...rawFrame,
              header,
              ...(projections !== undefined ? { projections } : {}),
            }
          } else {
            yield rawFrame as Record<string, unknown>
          }
        }
      } catch (error) {
        // The framed remote page is the default source of truth, but the local
        // mirror still must survive a tunnel blip. Ending this Host stream
        // normally makes the DSH client classify it as a carrier failure and
        // reopen the follow (a new remote snapshot replaces the window). A
        // domain error before the opening frame stays an error.
        if (shouldEndFollowStream(error, yielded, routed.client.isConnected())) return
        throw error
      }
    })()
  })

  // 6. session.control (multiplex local + remote projection updates)
  patchMethod(sessionController, 'control', (signal) => {
    return multiplexControlStream(registry, origSessionControl(signal), signal)
  })

  // 7. Workspace commands & workspace.follow
  patchMethod(workspaceController, 'rename', async (request) => {
    if (!registry.isAggregatedMode()) return origWorkspaceRename(request)
    if (decodeLogicalWorkspaceId(request.workspaceId) !== undefined) {
      registry.updateAggregationConfig({
        customTitleByLogicalId: {
          ...registry.aggregator.getConfig().customTitleByLogicalId,
          [request.workspaceId]: request.title.trim(),
        },
      })
      const lws = registry.snapshot().logicalWorkspaces.find(w => w.logicalWorkspaceId === request.workspaceId)
      if (lws !== undefined) {
        return { workspace: logicalToWorkspaceView(lws) }
      }
    }
    const decodedRemote = decodeRemoteWorkspaceId(request.workspaceId)
    if (decodedRemote.isRemote) {
      const client = registry.client(decodedRemote.deviceId)
      if (client !== undefined) {
        const res = (await client.invokeUnary('workspace', 'rename', {
          request: { workspaceId: decodedRemote.rawWorkspaceId, title: request.title },
        })) as { workspace: Record<string, unknown> }
        return {
          workspace: {
            ...res.workspace,
            workspaceId: request.workspaceId,
          },
        }
      }
    }
    return origWorkspaceRename(request)
  })

  patchMethod(workspaceController, 'delete', async (request) => {
    if (!registry.isAggregatedMode()) return origWorkspaceDelete(request)
    const logical = decodeLogicalWorkspaceId(request.workspaceId)
    if (logical !== undefined) {
      if (logical.kind === 'manual') {
        registry.aggregator.removeManualRule(logical.key)
        registry.saveToDisk()
      } else {
        // Splitting a Git-aggregated logical workspace excludes its members from auto-aggregation
        const lws = registry.snapshot().logicalWorkspaces.find(w => w.logicalWorkspaceId === request.workspaceId)
        if (lws !== undefined) {
          for (const m of lws.members) {
            registry.aggregator.setMemberExcluded(workspaceMemberKey(m.deviceId, m.path), true)
          }
          registry.saveToDisk()
        }
      }
      // The unary reply only tells the Client to drop the old row. Publish the
      // split single-workspace rows immediately; otherwise every Session that
      // belonged to the removed logical Workspace falls into Ungrouped until
      // an unrelated workspace change happens to wake the follow stream.
      registry.refreshWorkspaceView()
      return { deleted: true as const }
    }
    const decodedRemote = decodeRemoteWorkspaceId(request.workspaceId)
    if (decodedRemote.isRemote) {
      const client = registry.client(decodedRemote.deviceId)
      if (client !== undefined) {
        await client.invokeUnary('workspace', 'delete', {
          request: { workspaceId: decodedRemote.rawWorkspaceId },
        })
        return { deleted: true as const }
      }
    }
    return origWorkspaceDelete(request)
  })

  patchMethod(workspaceController, 'insertBefore', async (request) => {
    if (!registry.isAggregatedMode()) return origWorkspaceInsertBefore(request)
    if (decodeLogicalWorkspaceId(request.workspaceId) !== undefined) {
      const snapshot = registry.snapshot()
      const ids = snapshot.logicalWorkspaces.map(workspace => workspace.logicalWorkspaceId)
      const from = ids.indexOf(request.workspaceId)
      if (from !== -1) ids.splice(from, 1)
      const before = request.beforeWorkspaceId === undefined
        ? -1
        : ids.indexOf(request.beforeWorkspaceId)
      if (before === -1) ids.push(request.workspaceId)
      else ids.splice(before, 0, request.workspaceId)
      registry.updateAggregationConfig({ workspaceOrder: ids })
      return { workspaceIds: ids }
    }
    const decodedRemote = decodeRemoteWorkspaceId(request.workspaceId)
    if (decodedRemote.isRemote) {
      const client = registry.client(decodedRemote.deviceId)
      if (client !== undefined) {
        const res = (await client.invokeUnary('workspace', 'insertBefore', {
          request: {
            workspaceId: decodedRemote.rawWorkspaceId,
            ...(request.beforeWorkspaceId !== undefined
              ? { beforeWorkspaceId: decodeRemoteWorkspaceId(request.beforeWorkspaceId).rawWorkspaceId }
              : {}),
          },
        })) as { workspaceIds: readonly string[] }
        return {
          workspaceIds: res.workspaceIds.map(id =>
            encodeRemoteWorkspaceId(decodedRemote.deviceId, id),
          ),
        }
      }
    }
    return origWorkspaceInsertBefore(request)
  })

  patchMethod(workspaceController, 'insertSessionBefore', async (request) => {
    if (!registry.isAggregatedMode()) return origWorkspaceInsertSessionBefore(request)
    // A Session cannot be moved between physical machines. For a logical
    // Workspace the visual grouping stays as-is; the UI must not send the
    // synthetic id to the local Workspace controller.
    if (decodeLogicalWorkspaceId(request.workspaceId) !== undefined) {
      const snapshot = registry.snapshot()
      const lws = snapshot.logicalWorkspaces.find(w => w.logicalWorkspaceId === request.workspaceId)
      return { workspace: lws !== undefined ? logicalToWorkspaceView(lws) : {} }
    }
    const decodedRemote = decodeRemoteWorkspaceId(request.workspaceId)
    if (decodedRemote.isRemote) {
      const client = registry.client(decodedRemote.deviceId)
      const owner = registry.resolveSessionOwner(request.sessionId)
      if (client !== undefined && owner !== undefined) {
        requireConnected(client)
        const res = (await client.invokeUnary('workspace', 'insertSessionBefore', {
          request: {
            workspaceId: decodedRemote.rawWorkspaceId,
            sessionId: owner.rawSessionId,
            ...(request.beforeSessionId !== undefined
              ? { beforeSessionId: decodeSessionId(request.beforeSessionId).rawSessionId }
              : {}),
          },
        })) as { workspace: Record<string, unknown> }
        return {
          workspace: {
            ...res.workspace,
            workspaceId: request.workspaceId,
          },
        }
      }
    }
    return origWorkspaceInsertSessionBefore(request)
  })

  patchMethod(workspaceController, 'archiveSession', async (request) => {
    if (!registry.isAggregatedMode()) {
      const localRes = await origWorkspaceArchive(request)
      // Wake the unread counters: an archived Session keeps no default row.
      registry.refreshWorkspaceView()
      return { archivedSessionIds: localRes.archivedSessionIds }
    }
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner !== undefined) {
      requireConnected(owner.client)
      const remoteRes = (await owner.client.invokeUnary('workspace', 'archiveSession', {
        request: {
          sessionId: owner.rawSessionId,
          ...(request.stopActivity === true ? { stopActivity: true } : {}),
        },
      })) as { archivedSessionIds?: readonly string[] } | undefined
      if (Array.isArray(remoteRes?.archivedSessionIds)) {
        owner.client.setArchivedIds(remoteRes.archivedSessionIds)
        registry.refreshWorkspaceView()
      }
      return { archivedSessionIds: collectMergedArchivedIds(registry, workspaceRegistry) }
    }
    const localRes = await origWorkspaceArchive(request)
    registry.refreshWorkspaceView()
    return {
      archivedSessionIds: collectMergedArchivedIds(registry, workspaceRegistry, localRes.archivedSessionIds),
    }
  })

  patchMethod(workspaceController, 'unarchiveSession', async (request) => {
    if (!registry.isAggregatedMode()) {
      const localRes = await origWorkspaceUnarchive(request)
      registry.refreshWorkspaceView()
      return { archivedSessionIds: localRes.archivedSessionIds }
    }
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner !== undefined) {
      requireConnected(owner.client)
      const remoteRes = (await owner.client.invokeUnary('workspace', 'unarchiveSession', {
        request: { sessionId: owner.rawSessionId },
      })) as { archivedSessionIds?: readonly string[] } | undefined
      if (Array.isArray(remoteRes?.archivedSessionIds)) {
        owner.client.setArchivedIds(remoteRes.archivedSessionIds)
        registry.refreshWorkspaceView()
      }
      return { archivedSessionIds: collectMergedArchivedIds(registry, workspaceRegistry) }
    }
    const localRes = await origWorkspaceUnarchive(request)
    registry.refreshWorkspaceView()
    return {
      archivedSessionIds: collectMergedArchivedIds(registry, workspaceRegistry, localRes.archivedSessionIds),
    }
  })

  patchMethod(workspaceController, 'pinSession', async (request) => {
    if (!registry.isAggregatedMode()) {
      const localRes = await origWorkspacePin(request)
      return { pinnedSessionIds: localRes.pinnedSessionIds }
    }
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner !== undefined) {
      requireConnected(owner.client)
      const remoteRes = (await owner.client.invokeUnary('workspace', 'pinSession', {
        request: { sessionId: owner.rawSessionId },
      })) as { pinnedSessionIds?: readonly string[] } | undefined
      if (Array.isArray(remoteRes?.pinnedSessionIds)) {
        owner.client.setPinnedIds(remoteRes.pinnedSessionIds)
        registry.refreshWorkspaceView()
      }
      return { pinnedSessionIds: collectMergedPinnedIds(registry, workspaceRegistry) }
    }
    const localRes = await origWorkspacePin(request)
    return {
      pinnedSessionIds: collectMergedPinnedIds(registry, workspaceRegistry, localRes.pinnedSessionIds),
    }
  })

  patchMethod(workspaceController, 'unpinSession', async (request) => {
    if (!registry.isAggregatedMode()) {
      const localRes = await origWorkspaceUnpin(request)
      return { pinnedSessionIds: localRes.pinnedSessionIds }
    }
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner !== undefined) {
      requireConnected(owner.client)
      const remoteRes = (await owner.client.invokeUnary('workspace', 'unpinSession', {
        request: { sessionId: owner.rawSessionId },
      })) as { pinnedSessionIds?: readonly string[] } | undefined
      if (Array.isArray(remoteRes?.pinnedSessionIds)) {
        owner.client.setPinnedIds(remoteRes.pinnedSessionIds)
        registry.refreshWorkspaceView()
      }
      return { pinnedSessionIds: collectMergedPinnedIds(registry, workspaceRegistry) }
    }
    const localRes = await origWorkspaceUnpin(request)
    return {
      pinnedSessionIds: collectMergedPinnedIds(registry, workspaceRegistry, localRes.pinnedSessionIds),
    }
  })

  patchMethod(workspaceController, 'follow', (signal) => {
    return multiplexWorkspaceFollow(
      registry,
      workspaceRegistry,
      origWorkspaceFollow(signal),
      signal,
      supportsReplaceFrames,
    )
  })

  // 8. TypertGateway `$events` stream, `userQuestions/attachWait`, `userQuestions/answer`, & `$events/result` routing
  const origWireOpen = typertGateway.wireStream.open.bind(typertGateway.wireStream)
  typertGateway.wireStream.open = async (endpoint, payload, uplink, peer, signal) => {
    if (
      registry.isAggregatedMode() &&
      endpoint === 'userQuestions/attachWait' &&
      isRecord(payload) &&
      isRecord(payload.args) &&
      typeof payload.args.agent === 'string'
    ) {
      const owner = registry.resolveSessionOwner(payload.args.agent)
      if (owner !== undefined) {
        return owner.client.openStream(
          'userQuestions/attachWait',
          { ...payload.args, agent: owner.rawSessionId },
          signal,
        )
      }
    }
    const inner = await origWireOpen(endpoint, payload, uplink, peer, signal)
    if (endpoint !== '$events') return inner
    return multiplexRemoteEventsStream(registry, inner, signal)
  }
  disposers.push(() => {
    typertGateway.wireStream.open = origWireOpen
  })

  if (typeof typertGateway.dispatchRpc === 'function') {
    const origDispatchRpc = typertGateway.dispatchRpc.bind(typertGateway)
    typertGateway.dispatchRpc = async (endpoint, payload, signal, peer) => {
      if (
        registry.isAggregatedMode() &&
        endpoint === 'userQuestions/answer' &&
        isRecord(payload) &&
        isRecord(payload.args) &&
        typeof payload.args.agent === 'string'
      ) {
        const owner = registry.resolveSessionOwner(payload.args.agent)
        if (owner !== undefined) {
          if (!owner.client.isConnected()) {
            return {
              ok: false,
              error: {
                code: 'dsh-md/device-offline',
                message: `Device "${owner.client.deviceConfig.name}" is offline`,
                details: {},
              },
            }
          }
          try {
            const value = await owner.client.invokeUnary(
              'userQuestions',
              'answer',
              { ...payload.args, agent: owner.rawSessionId },
              signal,
            )
            return { ok: true, value }
          } catch (error) {
            const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'gateway/internal'
            const details = isRecord(error) && isRecord(error.details) ? error.details : {}
            return {
              ok: false,
              error: {
                code,
                message: error instanceof Error ? error.message : String(error),
                details,
              },
            }
          }
        }
      }
      if (
        registry.isAggregatedMode() &&
        endpoint === '$events/result' &&
        isRecord(payload) &&
        isRecord(payload.args)
      ) {
        const eventId = payload.args.eventId
        const outcome = payload.args.outcome
        if (typeof eventId === 'string' && isRecord(outcome)) {
          const decoded = decodeRemoteEventId(eventId)
          if (decoded !== undefined) {
            const client = registry.client(decoded.deviceId)
            if (client === undefined) {
              return {
                ok: false,
                error: { code: 'gateway/service-unavailable', message: 'Owning remote device is disconnected', details: {} },
              }
            }
            let forwardedOutcome = outcome as Parameters<typeof client.respondWaterfall>[1]
            // Never let a local lookup failure (`session/not-found` from the
            // hidden mirror) cancel a live remote waterfall on the remote Host.
            if (
              forwardedOutcome.kind === 'rejected' &&
              isRecord(forwardedOutcome.error) &&
              forwardedOutcome.error.code === 'session/not-found'
            ) {
              forwardedOutcome = { kind: 'next' }
            }
            const res = await client.respondWaterfall(
              decoded.remoteEventId,
              forwardedOutcome,
              signal,
            )
            if (!res.ok) {
              return {
                ok: false,
                error: { code: 'gateway/internal', message: res.error ?? 'Remote waterfall response failed', details: {} },
              }
            }
            return { ok: true, value: undefined }
          }
        }
      }
      return origDispatchRpc(endpoint, payload, signal, peer)
    }
    disposers.push(() => {
      typertGateway.dispatchRpc = origDispatchRpc
    })
  }

  return () => {
    for (const dispose of disposers.reverse()) {
      try { dispose() } catch { /* ignore */ }
    }
  }
}

// ============================================================================
// Multiplexing & Routing Helpers
// ============================================================================

/**
 * A subagent address may only be routed to the device that owns the parent
 * when the child is namespaced to that same device. A local or foreign child
 * id must fall back instead of being sent to the parent's remote host.
 */
export function isSameDeviceChildSession(parentDeviceId: DeviceId, childSessionId: string): boolean {
  const child = decodeSessionId(childSessionId)
  return child.isRemote && child.deviceId === parentDeviceId
}

/**
 * Whether a failed remote `session/follow` should end the Host stream normally
 * (so the DSH client retries the carrier) instead of surfacing a terminal
 * error. Never recover before the opening snapshot: the client would then see
 * an "ended before opening" protocol failure.
 */
export function shouldEndFollowStream(
  error: unknown,
  yielded: boolean,
  connected: boolean,
): boolean {
  if (!yielded) return false
  if (!connected) return true
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  return code === 'gateway/cancelled' || code === 'transport' || code === 'dsh-md/device-offline'
}

/**
 * The raw blank Session to reuse only when it belongs to the device the new
 * conversation is actually being created on. A namespaced blank from another
 * device must be dropped, not forwarded across machines.
 */
export function reusableSessionIdFor(
  sessionId: string | undefined,
  deviceId: DeviceId,
): string | undefined {
  if (sessionId === undefined || sessionId === '') return undefined
  const decoded = decodeSessionId(sessionId)
  return decoded.deviceId === deviceId ? decoded.rawSessionId : undefined
}

function routeSessionAddress(
  registry: DeviceRegistry,
  address: Record<string, unknown> | undefined,
): { client: NonNullable<ReturnType<DeviceRegistry['client']>>; rawAddress: Record<string, unknown> } | undefined {
  if (!isRecord(address)) return undefined
  if (address.kind === 'session' && typeof address.sessionId === 'string') {
    const owner = registry.resolveSessionOwner(address.sessionId)
    if (owner === undefined) return undefined
    return {
      client: owner.client,
      rawAddress: { kind: 'session', sessionId: owner.rawSessionId },
    }
  }
  if (
    address.kind === 'subagent' &&
    typeof address.parentSessionId === 'string' &&
    typeof address.childSessionId === 'string'
  ) {
    const parentOwner = registry.resolveSessionOwner(address.parentSessionId)
    if (parentOwner === undefined) return undefined
    if (!isSameDeviceChildSession(parentOwner.client.id, address.childSessionId)) {
      return undefined
    }
    const childDecoded = decodeSessionId(address.childSessionId)
    return {
      client: parentOwner.client,
      rawAddress: {
        ...address,
        parentSessionId: parentOwner.rawSessionId,
        childSessionId: childDecoded.rawSessionId,
      },
    }
  }
  return undefined
}

function resolveRemoteWorkspaceIdForDevice(
  registry: DeviceRegistry,
  workspaceId: string,
  deviceId: DeviceId,
): string | undefined {
  const decodedRemote = decodeRemoteWorkspaceId(workspaceId)
  if (decodedRemote.isRemote && decodedRemote.deviceId === deviceId) {
    return decodedRemote.rawWorkspaceId
  }
  const lws = registry.snapshot().logicalWorkspaces.find(w => w.logicalWorkspaceId === workspaceId)
  const member = lws?.members.find(m => m.deviceId === deviceId)
  return member?.remoteWorkspaceId
}

function logicalToWorkspaceView(lws: {
  readonly logicalWorkspaceId: string
  readonly targetPath: string
  readonly effectiveTargetPath?: string
  readonly title: string
  readonly sessionIds: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}): WorkspaceFollowView {
  return {
    workspaceId: lws.logicalWorkspaceId,
    // The merged row's path is where a new Session will run, so blank-session
    // reuse and the "+ New Session" hint point at the effective device.
    path: lws.effectiveTargetPath ?? lws.targetPath,
    title: lws.title,
    sessionIds: [...lws.sessionIds],
    createdAt: lws.createdAt,
    updatedAt: lws.updatedAt,
  }
}

function collectMergedArchivedIds(
  registry: DeviceRegistry,
  workspaceRegistry?: WorkspaceRegistryLike,
  localOverride?: readonly string[],
): string[] {
  const localIds = localOverride ?? workspaceRegistry?.archivedSessionIds.map(String) ?? []
  const remoteIds = registry.clientList().flatMap(c =>
    c.archivedIds().map(id => encodeRemoteSessionId(c.id, id)),
  )
  return [...new Set([...localIds, ...remoteIds])]
}

function collectMergedPinnedIds(
  registry: DeviceRegistry,
  workspaceRegistry?: WorkspaceRegistryLike,
  localOverride?: readonly string[],
): string[] {
  const localIds = localOverride ?? workspaceRegistry?.pinnedSessionIds.map(String) ?? []
  const remoteIds = registry.clientList().flatMap(c =>
    c.pinnedIds().map(id => encodeRemoteSessionId(c.id, id)),
  )
  return [...new Set([...localIds, ...remoteIds])]
}

async function* multiplexControlStream(
  registry: DeviceRegistry,
  localStream: AsyncIterable<Record<string, unknown>>,
  signal: AbortSignal,
): AsyncIterable<Record<string, unknown>> {
  const queue = new BoundedStreamQueue<Record<string, unknown>>()
  const push = (item: Record<string, unknown>): void => {
    queue.push(item)
  }

  const offRemote = registry.onControlProjection((_deviceId, frame) => {
    if (!registry.isAggregatedMode()) return
    push({
      type: 'projection',
      sessionId: frame.sessionId,
      key: frame.key,
      value: frame.value,
      seq: frame.seq,
    })
  })

  let localDone = false
  let localError: unknown
  const pumpLocal = (async () => {
    try {
      for await (const frame of localStream) {
        if (signal.aborted) return
        if (frame.type === 'baseline' && isRecord(frame.value) && isRecord(frame.value.projections)) {
          const projections: Record<string, unknown> = { ...frame.value.projections }
          if (registry.isAggregatedMode()) {
            for (const client of registry.clientList()) {
              for (const [rawSid, block] of client.controlProjections().entries()) {
                projections[encodeRemoteSessionId(client.id, rawSid)] = block
              }
            }
          }
          push({
            type: 'baseline',
            value: { projections },
          })
        } else {
          push(frame)
        }
      }
    } catch (error) {
      localError = error
    } finally {
      localDone = true
      queue.notify()
    }
  })()

  const onAbort = (): void => {
    queue.notify()
  }
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    while (!signal.aborted) {
      if (queue.overflow) {
        throw new Error('Aggregated control stream consumer fell behind; reconnect for a fresh baseline')
      }
      const next = queue.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      if (localError !== undefined) throw localError
      if (localDone) return
      await queue.wait()
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    offRemote()
    await pumpLocal.catch(() => {})
  }
}

async function* multiplexWorkspaceFollow(
  registry: DeviceRegistry,
  workspaceRegistry: WorkspaceRegistryLike | undefined,
  localStream: AsyncIterable<Record<string, unknown>>,
  signal: AbortSignal,
  workspaceReplaceFrames: () => boolean = () => false,
): AsyncIterable<Record<string, unknown>> {
  const queue = new BoundedStreamQueue<Record<string, unknown>>()
  let baselineSent = false
  let prevById = new Map<string, string>()
  let prevOrder = ''
  let prevArchived = ''
  let prevPinned = ''

  const push = (item: Record<string, unknown>): void => {
    publishFrameSessions(item)
    queue.push(item)
  }

  /**
   * The sidebar skips Workspace children that have no summary in the Session
   * store, so every frame carrying `sessionIds` must be preceded by an
   * `api-session/added` for those ids on the multiplexed `$events` stream.
   * The events generation dedupes; cross-stream order is best-effort but the
   * store update re-renders the row either way.
   */
  const publishFrameSessions = (frame: Record<string, unknown>): void => {
    if (!registry.isAggregatedMode()) return
    const collect = (items: unknown): void => {
      if (!Array.isArray(items)) return
      for (const item of items) {
        if (!isRecord(item) || !Array.isArray(item.sessionIds)) continue
        registry.requestSessionPublish(item.sessionIds.filter((id): id is string => typeof id === 'string'))
      }
    }
    if (frame.type === 'baseline' || frame.type === 'replace') {
      collect(isRecord(frame.value) ? frame.value.items : undefined)
    } else if (frame.type === 'upsert') {
      collect([frame.workspace])
    }
  }

  const computeCurrentState = (): WorkspaceFollowState => {
    // Native Mode's local tab is the normal local DSH surface. Keep the
    // Host's own workspace registry and archive/pin sets untouched; remote
    // logical workspaces must disappear (and reappear on the way back).
    if (!registry.isAggregatedMode()) {
      const localItems: WorkspaceFollowView[] = (workspaceRegistry?.list() ?? []).map(workspace => ({
        workspaceId: workspace.id,
        path: workspace.path,
        title: workspace.title,
        sessionIds: [...workspace.sessionIds],
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      }))
      return {
        items: localItems,
        archivedSessionIds: workspaceRegistry?.archivedSessionIds.map(String) ?? [],
        pinnedSessionIds: workspaceRegistry?.pinnedSessionIds.map(String) ?? [],
      }
    }
    const snap = registry.snapshot()
    const items = snap.logicalWorkspaces.map(logicalToWorkspaceView)
    const archivedSessionIds = collectMergedArchivedIds(registry, workspaceRegistry)
    const pinnedSessionIds = collectMergedPinnedIds(registry, workspaceRegistry)
    return { items, archivedSessionIds, pinnedSessionIds }
  }

  const fingerprintOf = (item: WorkspaceFollowView): string => JSON.stringify({
    title: item.title,
    path: item.path,
    sessionIds: item.sessionIds,
  })

  let prevUpdatedAtById = new Map<string, string>()

  const installPrevState = (state: WorkspaceFollowState): void => {
    prevById = new Map(state.items.map(item => [item.workspaceId, fingerprintOf(item)]))
    prevUpdatedAtById = new Map(state.items.map(item => [item.workspaceId, item.updatedAt]))
    prevOrder = state.items.map(item => item.workspaceId).join('\0')
    prevArchived = state.archivedSessionIds.join('\0')
    prevPinned = state.pinnedSessionIds.join('\0')
  }

  const syncIncrementalDiff = (): void => {
    if (!baselineSent) return
    const state = computeCurrentState()
    const replaceFrames = workspaceReplaceFrames()
    const nextIds = new Set(state.items.map(item => item.workspaceId))
    const setChanged = nextIds.size !== prevById.size
      || [...nextIds].some(id => !prevById.has(id))
    const orderStr = state.items.map(item => item.workspaceId).join('\0')
    const archivedStr = state.archivedSessionIds.join('\0')
    const pinnedStr = state.pinnedSessionIds.join('\0')

    // A `remove` is a tombstone in ClientWorkspaceModel: that id can never be
    // upserted again for the rest of the page generation. Mode filtering and
    // external workspace organizers legitimately remove and later restore
    // rows, so use the full projection swap (`replace`) when the id set
    // changes. DSH 0.2.0 clients do not understand an incremental `replace`,
    // hence the version-gated fallback.
    if (replaceFrames && setChanged) {
      push({
        type: 'replace',
        value: {
          items: state.items,
          archivedSessionIds: state.archivedSessionIds,
          pinnedSessionIds: state.pinnedSessionIds,
        },
      })
      installPrevState(state)
      return
    }

    const nextById = new Map<string, string>()
    for (const item of state.items) {
      // Bump updatedAt to now when membership or title changes so ClientWorkspaceModel.upsert accepts it
      const fingerprint = fingerprintOf(item)
      nextById.set(item.workspaceId, fingerprint)
      if (prevById.get(item.workspaceId) !== fingerprint) {
        // Keep the aggregator's own recency (latest member Session touch).
        // Bumping `updatedAt` to "now" on every fingerprint change used to
        // re-sort the sidebar on stale arrivals — a reconnect adopting an old
        // Session jumped its Workspace to the top. Bump only when recency did
        // not advance (e.g. a pure title rename), which ClientWorkspaceModel
        // would otherwise ignore for a stale timestamp.
        const prevUpdatedAt = prevUpdatedAtById.get(item.workspaceId)
        const updatedAt = prevUpdatedAt !== undefined && item.updatedAt <= prevUpdatedAt
          ? new Date().toISOString()
          : item.updatedAt
        prevUpdatedAtById.set(item.workspaceId, updatedAt)
        push({
          type: 'upsert',
          workspace: { ...item, updatedAt },
        })
      } else {
        prevUpdatedAtById.set(item.workspaceId, item.updatedAt)
      }
    }

    if (!replaceFrames) {
      for (const oldId of prevById.keys()) {
        if (!nextById.has(oldId)) {
          push({ type: 'remove', workspaceId: oldId })
        }
      }
    }
    prevById = nextById

    if (orderStr !== prevOrder) {
      prevOrder = orderStr
      push({ type: 'order', workspaceIds: state.items.map(item => item.workspaceId) })
    }

    if (archivedStr !== prevArchived) {
      prevArchived = archivedStr
      push({ type: 'archived', archivedSessionIds: state.archivedSessionIds })
    }

    if (pinnedStr !== prevPinned) {
      prevPinned = pinnedStr
      push({ type: 'pinned', pinnedSessionIds: state.pinnedSessionIds })
    }
  }

  const offWorkspaces = registry.onWorkspacesChanged(() => {
    syncIncrementalDiff()
  })

  let localDone = false
  let localError: unknown
  const pumpLocal = (async () => {
    try {
      for await (const frame of localStream) {
        if (signal.aborted) return
        if (frame.type === 'baseline') {
          const state = computeCurrentState()
          installPrevState(state)
          baselineSent = true
          push({
            type: 'baseline',
            value: state,
          })
        } else {
          syncIncrementalDiff()
        }
      }
    } catch (error) {
      localError = error
    } finally {
      localDone = true
      queue.notify()
    }
  })()

  const onAbort = (): void => {
    queue.notify()
  }
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    while (!signal.aborted) {
      if (queue.overflow) {
        throw new Error('Aggregated workspace stream consumer fell behind; reconnect for a fresh baseline')
      }
      const next = queue.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      if (localError !== undefined) throw localError
      if (localDone) return
      await queue.wait()
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    offWorkspaces()
    await pumpLocal.catch(() => {})
  }
}

async function* multiplexRemoteEventsStream(
  registry: DeviceRegistry,
  localEvents: AsyncIterable<unknown>,
  signal: AbortSignal,
): AsyncIterable<unknown> {
  const queue = new BoundedStreamQueue<unknown>()
  let readySent = false
  const deliveredWaterfalls = new Set<string>()
  /** Devices already replayed into this generation's Session store. */
  let replayedDevices = new Set<string>()

  const push = (item: unknown): void => {
    queue.push(item)
  }

  /**
   * Namespaced Session ids this generation already pushed an `api-session/added`
   * for. Workspace frames request publication through
   * `registry.requestSessionPublish`; without this ledger every frame would
   * replay the whole catalog.
   */
  const publishedSessionIds = new Set<string>()

  const connectedDeviceIds = (): Set<string> =>
    new Set(
      registry
        .clientList()
        .filter(client => client.isConnected())
        .map(client => String(client.id)),
    )

  /**
   * Replay remote Session summaries as `api-session/added`, optionally only for
   * the given devices. Returns the devices that actually had something to
   * replay: a device that is connected but whose catalog has not synced yet
   * must stay pending so the next revision retries instead of silently
   * skipping the replay forever.
   */
  const pushRemoteSessionSummaries = (onlyDeviceIds?: ReadonlySet<string>): Set<string> => {
    const replayed = new Set<string>()
    if (!registry.isAggregatedMode()) return replayed
    for (const client of registry.clientList()) {
      if (onlyDeviceIds !== undefined && !onlyDeviceIds.has(String(client.id))) continue
      const summaries = client.sessionSummaries()
      if (summaries.length === 0) continue
      // Same isolation as `session.list`: one device whose projection throws
      // must not stop the replay for the others.
      try {
        const frames: unknown[] = []
        for (const summary of summaries) {
          const namespaced = client.namespaceSummary(summary)
          publishedSessionIds.add(namespaced.sessionId)
          frames.push({
            type: 'emit',
            event: 'api-session/added',
            args: [namespaced],
          })
        }
        for (const frame of frames) push(frame)
        replayed.add(String(client.id))
        registry.clearSessionListError(client.id)
      } catch (error) {
        registry.noteSessionListError(
          client.id,
          error instanceof Error ? error.message : String(error),
        )
      }
    }
    return replayed
  }

  /**
   * Publish `api-session/added` for requested ids this generation has not
   * pushed yet. Called by the aggregated Workspace stream before a frame
   * carrying `sessionIds` reaches the client, so the sidebar never renders an
   * expanded-but-empty Workspace because the summary replay was lost.
   */
  const publishRequestedSummaries = (sessionIds: readonly string[]): void => {
    if (!readySent || !registry.isAggregatedMode()) return
    const missing = sessionIds.filter(id => !publishedSessionIds.has(id))
    if (missing.length === 0) return
    const byDevice = new Map<DeviceId, string[]>()
    for (const id of missing) {
      const decoded = decodeSessionId(id)
      if (!decoded.isRemote) continue
      const list = byDevice.get(decoded.deviceId) ?? []
      list.push(decoded.rawSessionId)
      byDevice.set(decoded.deviceId, list)
    }
    for (const [deviceId, rawIds] of byDevice) {
      const client = registry.client(deviceId)
      if (client === undefined) continue
      const wanted = new Set(rawIds)
      try {
        for (const summary of client.sessionSummaries()) {
          if (!wanted.has(summary.sessionId)) continue
          const namespaced = client.namespaceSummary(summary)
          if (publishedSessionIds.has(namespaced.sessionId)) continue
          publishedSessionIds.add(namespaced.sessionId)
          push({ type: 'emit', event: 'api-session/added', args: [namespaced] })
        }
        registry.clearSessionListError(deviceId)
      } catch (error) {
        registry.noteSessionListError(
          deviceId,
          error instanceof Error ? error.message : String(error),
        )
      }
    }
  }

  const pushPendingRemoteWaterfalls = (): void => {
    if (!registry.isAggregatedMode()) return
    // Deliver remote approval/question waterfalls to the local UI. Called on
    // the first ready frame and again when the operator returns from Native
    // Mode, because the existing event stream is not reconnected by a mode
    // switch. `deliveredWaterfalls` keeps a still-pending event from being
    // shown twice when it was already delivered before the mode switch.
    for (const client of registry.clientList()) {
      for (const pending of client.pendingInteractionList()) {
        if (deliveredWaterfalls.has(pending.namespacedEventId)) continue
        deliveredWaterfalls.add(pending.namespacedEventId)
        push({
          type: 'waterfall',
          event: pending.eventName,
          eventId: pending.namespacedEventId,
          agentId: pending.namespacedSessionId,
          request: pending.request,
        })
      }
    }
  }

  const offRemote = registry.onRemoteEvent((_deviceId, frame) => {
    if (!readySent || !registry.isAggregatedMode()) return
    if (isRecord(frame) && frame.type === 'waterfall' && typeof frame.eventId === 'string') {
      deliveredWaterfalls.add(frame.eventId)
    }
    if (isRecord(frame) && frame.type === 'emit') {
      if (frame.event === 'api-session/added' && Array.isArray(frame.args)) {
        const summary = frame.args[0]
        if (isRecord(summary) && typeof summary.sessionId === 'string') {
          publishedSessionIds.add(summary.sessionId)
        }
      } else if (frame.event === 'api-session/removed' && Array.isArray(frame.args)) {
        // A removed Session may be re-added later; allow the next publish.
        if (typeof frame.args[0] === 'string') publishedSessionIds.delete(frame.args[0])
      }
    }
    push(frame)
  })
  const offPublishRequest = registry.onSessionPublishRequest(publishRequestedSummaries)
  const offMode = registry.onDisplayModeChanged((mode) => {
    if (!readySent || mode !== 'aggregated') return
    // Returning from Native Mode does not reconnect `$events`, and the sidebar
    // hides every workspace session id that has no summary. Replay the catalogs
    // the same way the opening `ready` frame does.
    replayedDevices = pushRemoteSessionSummaries()
    pushPendingRemoteWaterfalls()
  })

  /**
   * A device that finishes its SSH handshake *after* this generation was
   * opened has no summary in DSH's Session store yet, so its Workspaces render
   * expanded-but-empty until something else refreshes the list. Replay exactly
   * that device once it turns connected; the set keeps `onSnapshotChanged`
   * (which also fires for unrelated revisions) from replaying in a loop, and a
   * device whose catalog has not synced stays pending for the next revision.
   */
  const offSnapshot = registry.onSnapshotChanged(() => {
    if (!readySent || !registry.isAggregatedMode()) return
    const connected = connectedDeviceIds()
    const fresh = new Set<string>()
    for (const deviceId of connected) {
      if (!replayedDevices.has(deviceId)) fresh.add(deviceId)
    }
    if (fresh.size === 0) return
    for (const deviceId of pushRemoteSessionSummaries(fresh)) replayedDevices.add(deviceId)
    // Forget devices that dropped out so a reconnect replays again.
    for (const deviceId of [...replayedDevices]) {
      if (!connected.has(deviceId)) replayedDevices.delete(deviceId)
    }
  })

  let localDone = false
  let localError: unknown
  const pumpLocal = (async () => {
    try {
      for await (const frame of localEvents) {
        if (signal.aborted) return
        push(frame)
        if (!readySent && isRecord(frame) && frame.type === 'ready') {
          readySent = true
          pushPendingRemoteWaterfalls()
          if (registry.isAggregatedMode()) {
            // DSH's Session store fetched `session.list` once before SSH devices
            // finished connecting. Replay every known remote summary into this
            // generation; without it, workspace rows point at Session ids the
            // sidebar has no summary for and silently hides those rows.
            replayedDevices = pushRemoteSessionSummaries()

          }
        }
      }
    } catch (error) {
      localError = error
    } finally {
      localDone = true
      queue.notify()
    }
  })()

  const onAbort = (): void => {
    queue.notify()
  }
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    while (!signal.aborted) {
      if (queue.overflow) {
        throw new Error('Aggregated event stream consumer fell behind; reconnect for a fresh baseline')
      }
      const next = queue.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      if (localError !== undefined) throw localError
      if (localDone) return
      await queue.wait()
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    offRemote()
    offMode()
    offSnapshot()
    offPublishRequest()
    await pumpLocal.catch(() => {})
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

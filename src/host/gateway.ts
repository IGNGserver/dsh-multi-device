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
  fork(request: { sessionId: string; atSeq?: number }): Promise<{ sessionId: string }>
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

  const patchMethod = <T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]): void => {
    const original = target[key]
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
  const origSessionModelCatalog = sessionController.modelCatalog.bind(sessionController)
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
      for (const rawSummary of client.sessionSummaries()) {
        const nsSummary = client.namespaceSummary(rawSummary)
        if (seen.has(nsSummary.sessionId)) continue
        seen.add(nsSummary.sessionId)
        merged.push(nsSummary as unknown as Record<string, unknown>)
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
    // Case A: Reusing an existing remote blank sessionId
    if (request.sessionId !== undefined) {
      const owner = registry.resolveSessionOwner(request.sessionId)
      if (owner !== undefined) {
        const rawWorkspaceId = request.workspaceId ? resolveRemoteWorkspaceIdForDevice(registry, request.workspaceId, owner.client.id) : undefined
        const created = (await owner.client.invokeUnary('session', 'create', {
          request: {
            sessionId: owner.rawSessionId,
            ...(rawWorkspaceId !== undefined ? { workspaceId: rawWorkspaceId } : {}),
            ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
            ...(request.agentPreset !== undefined ? { agentPreset: request.agentPreset } : {}),
          },
        })) as { sessionId: string; agentPreset?: string }
        return {
          sessionId: encodeRemoteSessionId(owner.client.id, created.sessionId),
          ...(created.agentPreset !== undefined ? { agentPreset: created.agentPreset } : {}),
        }
      }
    }

    // Case B: Creating in a Logical Workspace (`md-lws~...`)
    if (request.workspaceId !== undefined && decodeLogicalWorkspaceId(request.workspaceId) !== undefined) {
      const snap = registry.snapshot()
      const lws = snap.logicalWorkspaces.find(w => w.logicalWorkspaceId === request.workspaceId)
      if (lws !== undefined) {
        if (lws.targetDeviceId === LOCAL_DEVICE_ID) {
          const localMember = lws.members.find(m => m.deviceId === LOCAL_DEVICE_ID)
          return origSessionCreate({
            ...(localMember !== undefined
              ? { workspaceId: localMember.remoteWorkspaceId }
              : { cwd: lws.targetPath }),
            ...(request.agentPreset !== undefined ? { agentPreset: request.agentPreset } : {}),
          })
        }
        const remoteClient = registry.client(lws.targetDeviceId)
        const remoteMember = lws.members.find(m => m.deviceId === lws.targetDeviceId)
        if (remoteClient !== undefined) {
          const created = (await remoteClient.invokeUnary('session', 'create', {
            request: {
              ...(remoteMember !== undefined
                ? { workspaceId: remoteMember.remoteWorkspaceId }
                : { cwd: lws.targetPath }),
              ...(request.agentPreset !== undefined ? { agentPreset: request.agentPreset } : {}),
            },
          })) as { sessionId: string; agentPreset?: string }
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
          const created = (await remoteClient.invokeUnary('session', 'create', {
            request: {
              workspaceId: decodedWs.rawWorkspaceId,
              ...(request.agentPreset !== undefined ? { agentPreset: request.agentPreset } : {}),
            },
          })) as { sessionId: string; agentPreset?: string }
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
    return (await owner.client.invokeUnary('session', 'selectModel', {
      request: {
        ...request,
        sessionId: owner.rawSessionId,
      },
    })) as { selected: Record<string, unknown> }
  })

  // The DSH model picker asks the process-level catalog, so use the active
  // Session's owner as the scope. A remote conversation must see exactly that
  // remote DSH's models; merging local groups makes local-only models look
  // selectable and hides the remote's real provider ids.
  patchMethod(sessionController, 'modelCatalog', async () => {
    if (!registry.isAggregatedMode()) {
      // Native Mode's local tab is strictly local; never expose a remote
      // Session's catalog (or a merged one) here.
      return origSessionModelCatalog() as Promise<Record<string, unknown>>
    }
    const scope = registry.activeSessionScope()
    if (scope.kind === 'local') {
      return origSessionModelCatalog() as Promise<Record<string, unknown>>
    }
    if (scope.client === undefined || scope.client.toView().state !== 'connected') {
      return unavailableRemoteCatalog(scope.deviceName, 'remote device is not connected') as unknown as Record<string, unknown>
    }
    try {
      return (await scope.client.invokeUnary(
        'session',
        'modelCatalog',
        {},
      )) as Record<string, unknown>
    } catch (error) {
      return unavailableRemoteCatalog(
        scope.deviceName,
        error instanceof Error ? error.message : String(error),
      ) as unknown as Record<string, unknown>
    }
  })

  patchMethod(sessionController, 'rename', async (request) => {
    if (!registry.isAggregatedMode()) return origSessionRename(request)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionRename(request)
    return (await owner.client.invokeUnary('session', 'rename', {
      request: { sessionId: owner.rawSessionId, title: request.title },
    })) as { title: string; seq: number }
  })

  patchMethod(sessionController, 'fork', async (request) => {
    if (!registry.isAggregatedMode()) return origSessionFork(request)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionFork(request)
    const res = (await owner.client.invokeUnary('session', 'fork', {
      request: {
        sessionId: owner.rawSessionId,
        ...(request.atSeq !== undefined ? { atSeq: request.atSeq } : {}),
      },
    })) as { sessionId: string }
    return { sessionId: encodeRemoteSessionId(owner.client.id, res.sessionId) }
  })

  patchMethod(sessionController, 'prompt', async (request, signal) => {
    if (!registry.isAggregatedMode()) return origSessionPrompt(request, signal)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionPrompt(request, signal)
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
    return (await owner.client.invokeUnary('session', 'attachment', {
      request: { ...request, sessionId: owner.rawSessionId },
    })) as Record<string, unknown>
  })

  patchMethod(sessionController, 'updateQueue', async (request) => {
    if (!registry.isAggregatedMode()) return origSessionUpdateQueue(request)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionUpdateQueue(request)
    return (await owner.client.invokeUnary('session', 'updateQueue', {
      request: { ...request, sessionId: owner.rawSessionId },
    })) as { accepted: true }
  })

  patchMethod(sessionController, 'cancel', (request) => {
    if (!registry.isAggregatedMode()) return origSessionCancel(request)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionCancel(request)
    return owner.client.invokeUnary('session', 'cancel', {
      request: { sessionId: owner.rawSessionId },
    }) as Promise<{ accepted: true }>
  })

  patchMethod(sessionController, 'projections', async (request, signal) => {
    if (!registry.isAggregatedMode()) return origSessionProjections(request, signal)
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionProjections(request, signal)
    return (await owner.client.invokeUnary(
      'session',
      'projections',
      { request: { sessionId: owner.rawSessionId } },
      signal,
    )) as { asOfSeq: number; values: Record<string, unknown> } | null
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
      const stream = routed.client.openStream(
        'session/follow',
        { request: { ...request, address: routed.rawAddress } },
        signal,
      )
      for await (const rawFrame of stream) {
        if (isRecord(rawFrame) && rawFrame.type === 'snapshot' && isRecord(rawFrame.header)) {
          const header = {
            ...rawFrame.header,
            id: encodeRemoteSessionId(routed.client.id, String(rawFrame.header.id ?? '')),
            ...(typeof rawFrame.header.parentSession === 'string'
              ? { parentSession: encodeRemoteSessionId(routed.client.id, rawFrame.header.parentSession) }
              : {}),
          }
          yield { ...rawFrame, header }
        } else {
          yield rawFrame as Record<string, unknown>
        }
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
      return { archivedSessionIds: localRes.archivedSessionIds }
    }
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner !== undefined) {
      await owner.client.invokeUnary('workspace', 'archiveSession', {
        request: {
          sessionId: owner.rawSessionId,
          ...(request.stopActivity === true ? { stopActivity: true } : {}),
        },
      })
      return { archivedSessionIds: collectMergedArchivedIds(registry, workspaceRegistry) }
    }
    const localRes = await origWorkspaceArchive(request)
    return {
      archivedSessionIds: collectMergedArchivedIds(registry, workspaceRegistry, localRes.archivedSessionIds),
    }
  })

  patchMethod(workspaceController, 'unarchiveSession', async (request) => {
    if (!registry.isAggregatedMode()) {
      const localRes = await origWorkspaceUnarchive(request)
      return { archivedSessionIds: localRes.archivedSessionIds }
    }
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner !== undefined) {
      await owner.client.invokeUnary('workspace', 'unarchiveSession', {
        request: { sessionId: owner.rawSessionId },
      })
      return { archivedSessionIds: collectMergedArchivedIds(registry, workspaceRegistry) }
    }
    const localRes = await origWorkspaceUnarchive(request)
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
      await owner.client.invokeUnary('workspace', 'pinSession', {
        request: { sessionId: owner.rawSessionId },
      })
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
      await owner.client.invokeUnary('workspace', 'unpinSession', {
        request: { sessionId: owner.rawSessionId },
      })
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

  // 8. TypertGateway `$events` stream & `$events/result` waterfall response routing
  const origWireOpen = typertGateway.wireStream.open.bind(typertGateway.wireStream)
  typertGateway.wireStream.open = async (endpoint, payload, uplink, peer, signal) => {
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
            const res = await client.respondWaterfall(
              decoded.remoteEventId,
              outcome as Parameters<typeof client.respondWaterfall>[1],
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
  readonly title: string
  readonly sessionIds: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}): WorkspaceFollowView {
  return {
    workspaceId: lws.logicalWorkspaceId,
    path: lws.targetPath,
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

  const pumpLocal = (async () => {
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
    queue.push(item)
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

  const installPrevState = (state: WorkspaceFollowState): void => {
    prevById = new Map(state.items.map(item => [item.workspaceId, fingerprintOf(item)]))
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
        push({
          type: 'upsert',
          workspace: {
            ...item,
            updatedAt: new Date().toISOString(),
          },
        })
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

  const pumpLocal = (async () => {
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

  const push = (item: unknown): void => {
    queue.push(item)
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
    push(frame)
  })
  const offMode = registry.onDisplayModeChanged((mode) => {
    if (!readySent || mode !== 'aggregated') return
    pushPendingRemoteWaterfalls()
  })

  const pumpLocal = (async () => {
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
          for (const client of registry.clientList()) {
            for (const summary of client.sessionSummaries()) {
              push({
                type: 'emit',
                event: 'api-session/added',
                args: [client.namespaceSummary(summary)],
              })
            }
          }
          // A fresh browser generation starts with the local model catalog
          // cached; make it refetch the active remote Session's catalog.
          if (registry.activeSessionScope().kind === 'remote') {
            push({ type: 'emit', event: 'llm/adapters-updated', args: [] })
          }
        }
      }
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
      await queue.wait()
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    offRemote()
    offMode()
    await pumpLocal.catch(() => {})
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

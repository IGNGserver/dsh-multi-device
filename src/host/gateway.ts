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

interface ModelCatalogLike {
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
): () => void {
  const disposers: Array<() => void> = []

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
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionSelectModel(request)
    return (await owner.client.invokeUnary('session', 'selectModel', {
      request: { ...request, sessionId: owner.rawSessionId },
    })) as { selected: Record<string, unknown> }
  })

  // The DSH model picker asks the process-level catalog. Merge every connected
  // device's catalog so a remote-only provider/model remains selectable; the
  // click itself is routed by `selectModel` above.
  patchMethod(sessionController, 'modelCatalog', async () => {
    const local = (await origSessionModelCatalog()) as unknown as ModelCatalogLike
    const groups = (local.groups ?? []).map(group => ({
      ...group,
      models: [...group.models],
    }))
    const byId = new Map(groups.map(group => [group.id, group]))
    const routableProviders = new Set(local.routableProviders ?? [])
    const failures = [...(local.failures ?? [])]

    await Promise.all(
      registry.clientList().map(async (client) => {
        if (client.toView().state !== 'connected') return
        try {
          const remote = (await client.invokeUnary('session', 'modelCatalog', {})) as unknown as ModelCatalogLike
          for (const group of remote.groups ?? []) {
            const existing = byId.get(group.id)
            if (existing === undefined) {
              const copy = {
                ...group,
                name: `${client.toView().name} — ${group.name}`,
                models: [...group.models],
              }
              groups.push(copy)
              byId.set(group.id, copy)
            } else {
              const known = new Set(existing.models.map(model => model.id))
              for (const model of group.models) {
                if (!known.has(model.id)) existing.models.push(model)
              }
            }
            routableProviders.add(group.id)
          }
          for (const failure of remote.failures ?? []) {
            failures.push({ ...failure, id: `${String(client.id)}:${failure.id}` })
          }
        } catch {
          // A disconnected/incompatible device must not break the local picker.
        }
      }),
    )

    return {
      ...local,
      groups,
      routableProviders: [...routableProviders],
      failures,
    }
  })

  patchMethod(sessionController, 'rename', async (request) => {
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionRename(request)
    return (await owner.client.invokeUnary('session', 'rename', {
      request: { sessionId: owner.rawSessionId, title: request.title },
    })) as { title: string; seq: number }
  })

  patchMethod(sessionController, 'fork', async (request) => {
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
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionAttachment(request)
    return (await owner.client.invokeUnary('session', 'attachment', {
      request: { ...request, sessionId: owner.rawSessionId },
    })) as Record<string, unknown>
  })

  patchMethod(sessionController, 'updateQueue', async (request) => {
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionUpdateQueue(request)
    return (await owner.client.invokeUnary('session', 'updateQueue', {
      request: { ...request, sessionId: owner.rawSessionId },
    })) as { accepted: true }
  })

  patchMethod(sessionController, 'cancel', (request) => {
    const owner = registry.resolveSessionOwner(request.sessionId)
    if (owner === undefined) return origSessionCancel(request)
    return owner.client.invokeUnary('session', 'cancel', {
      request: { sessionId: owner.rawSessionId },
    }) as Promise<{ accepted: true }>
  })

  patchMethod(sessionController, 'projections', async (request, signal) => {
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
    return multiplexWorkspaceFollow(registry, workspaceRegistry, origWorkspaceFollow(signal), signal)
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
      if (endpoint === '$events/result' && isRecord(payload) && isRecord(payload.args)) {
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
}): Record<string, unknown> {
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
  const queue: Record<string, unknown>[] = []
  let wake: (() => void) | undefined
  const push = (item: Record<string, unknown>): void => {
    queue.push(item)
    const w = wake
    wake = undefined
    w?.()
  }

  const offRemote = registry.onControlProjection((_deviceId, frame) => {
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
        const mergedProjections: Record<string, unknown> = { ...frame.value.projections }
        for (const client of registry.clientList()) {
          for (const [rawSid, block] of client.controlProjections().entries()) {
            mergedProjections[encodeRemoteSessionId(client.id, rawSid)] = block
          }
        }
        push({
          type: 'baseline',
          value: { projections: mergedProjections },
        })
      } else {
        push(frame)
      }
    }
  })()

  const onAbort = (): void => {
    const w = wake
    wake = undefined
    w?.()
  }
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    while (!signal.aborted) {
      const next = queue.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      await new Promise<void>((r) => { wake = r })
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
): AsyncIterable<Record<string, unknown>> {
  const queue: Record<string, unknown>[] = []
  let wake: (() => void) | undefined
  let baselineSent = false
  let prevById = new Map<string, string>()
  let prevOrder = ''
  let prevArchived = ''
  let prevPinned = ''

  const push = (item: Record<string, unknown>): void => {
    queue.push(item)
    const w = wake
    wake = undefined
    w?.()
  }

  const computeCurrentState = () => {
    const snap = registry.snapshot()
    const items = snap.logicalWorkspaces.map(logicalToWorkspaceView)
    const archivedSessionIds = collectMergedArchivedIds(registry, workspaceRegistry)
    const pinnedSessionIds = collectMergedPinnedIds(registry, workspaceRegistry)
    return { items, archivedSessionIds, pinnedSessionIds }
  }

  const syncIncrementalDiff = (): void => {
    if (!baselineSent) return
    const { items, archivedSessionIds, pinnedSessionIds } = computeCurrentState()
    const nextById = new Map<string, string>()

    for (const item of items) {
      const id = String(item.workspaceId)
      // Bump updatedAt to now when membership or title changes so ClientWorkspaceModel.upsert accepts it
      const fingerprint = JSON.stringify({
        title: item.title,
        path: item.path,
        sessionIds: item.sessionIds,
      })
      nextById.set(id, fingerprint)
      if (prevById.get(id) !== fingerprint) {
        push({
          type: 'upsert',
          workspace: {
            ...item,
            updatedAt: new Date().toISOString(),
          },
        })
      }
    }

    for (const oldId of prevById.keys()) {
      if (!nextById.has(oldId)) {
        push({ type: 'remove', workspaceId: oldId })
      }
    }
    prevById = nextById

    const orderIds = items.map(i => String(i.workspaceId))
    const orderStr = orderIds.join('\0')
    if (orderStr !== prevOrder) {
      prevOrder = orderStr
      push({ type: 'order', workspaceIds: orderIds })
    }

    const archivedStr = archivedSessionIds.join('\0')
    if (archivedStr !== prevArchived) {
      prevArchived = archivedStr
      push({ type: 'archived', archivedSessionIds })
    }

    const pinnedStr = pinnedSessionIds.join('\0')
    if (pinnedStr !== prevPinned) {
      prevPinned = pinnedStr
      push({ type: 'pinned', pinnedSessionIds })
    }
  }

  const offWorkspaces = registry.onWorkspacesChanged(() => {
    syncIncrementalDiff()
  })

  const pumpLocal = (async () => {
    for await (const frame of localStream) {
      if (signal.aborted) return
      if (frame.type === 'baseline') {
        const { items, archivedSessionIds, pinnedSessionIds } = computeCurrentState()
        prevById = new Map(
          items.map(item => [
            String(item.workspaceId),
            JSON.stringify({ title: item.title, path: item.path, sessionIds: item.sessionIds }),
          ]),
        )
        prevOrder = items.map(i => String(i.workspaceId)).join('\0')
        prevArchived = archivedSessionIds.join('\0')
        prevPinned = pinnedSessionIds.join('\0')
        baselineSent = true
        push({
          type: 'baseline',
          value: { items, archivedSessionIds, pinnedSessionIds },
        })
      } else {
        syncIncrementalDiff()
      }
    }
  })()

  const onAbort = (): void => {
    const w = wake
    wake = undefined
    w?.()
  }
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    while (!signal.aborted) {
      const next = queue.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      await new Promise<void>((r) => { wake = r })
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
  const queue: unknown[] = []
  let wake: (() => void) | undefined
  let readySent = false

  const push = (item: unknown): void => {
    queue.push(item)
    const w = wake
    wake = undefined
    w?.()
  }

  const offRemote = registry.onRemoteEvent((_deviceId, frame) => {
    if (!readySent) return
    push(frame)
  })

  const pumpLocal = (async () => {
    for await (const frame of localEvents) {
      if (signal.aborted) return
      push(frame)
      if (!readySent && isRecord(frame) && frame.type === 'ready') {
        readySent = true
        // Deliver any already-pending remote approval/question waterfalls to this new client generation
        for (const client of registry.clientList()) {
          for (const pending of client.pendingInteractionList()) {
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
    }
  })()

  const onAbort = (): void => {
    const w = wake
    wake = undefined
    w?.()
  }
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    while (!signal.aborted) {
      const next = queue.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      await new Promise<void>((r) => { wake = r })
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    offRemote()
    await pumpLocal.catch(() => {})
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

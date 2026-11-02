// src/index.ts
import z from "@deepseek-ai/schemastery";
import { homedir as homedir3 } from "node:os";
import { join as join4 } from "node:path";

// src/contract.ts
function DeviceId(id) {
  return id;
}
var LOCAL_DEVICE_ID = "local";
var REMOTE_SESSION_PREFIX = "md~";
var REMOTE_WORKSPACE_PREFIX = "md-ws~";
var LOGICAL_WORKSPACE_PREFIX = "md-lws~";
var REMOTE_EVENT_PREFIX = "md-ev~";
var SEPARATOR = "~";
function encodeRemoteSessionId(deviceId, remoteSessionId) {
  if (deviceId === LOCAL_DEVICE_ID) return remoteSessionId;
  return `${REMOTE_SESSION_PREFIX}${escapeSegment(deviceId)}${SEPARATOR}${remoteSessionId}`;
}
function decodeSessionId(sessionId) {
  if (!sessionId.startsWith(REMOTE_SESSION_PREFIX)) {
    return { deviceId: LOCAL_DEVICE_ID, rawSessionId: sessionId, isRemote: false };
  }
  const rest = sessionId.slice(REMOTE_SESSION_PREFIX.length);
  const sepIndex = rest.indexOf(SEPARATOR);
  if (sepIndex <= 0 || sepIndex === rest.length - 1) {
    return { deviceId: LOCAL_DEVICE_ID, rawSessionId: sessionId, isRemote: false };
  }
  const deviceId = unescapeSegment(rest.slice(0, sepIndex));
  const rawSessionId = rest.slice(sepIndex + 1);
  return { deviceId, rawSessionId, isRemote: true };
}
function encodeRemoteWorkspaceId(deviceId, remoteWorkspaceId) {
  if (deviceId === LOCAL_DEVICE_ID) return remoteWorkspaceId;
  return `${REMOTE_WORKSPACE_PREFIX}${escapeSegment(deviceId)}${SEPARATOR}${remoteWorkspaceId}`;
}
function decodeRemoteWorkspaceId(workspaceId) {
  if (!workspaceId.startsWith(REMOTE_WORKSPACE_PREFIX)) {
    return { deviceId: LOCAL_DEVICE_ID, rawWorkspaceId: workspaceId, isRemote: false };
  }
  const rest = workspaceId.slice(REMOTE_WORKSPACE_PREFIX.length);
  const sepIndex = rest.indexOf(SEPARATOR);
  if (sepIndex <= 0 || sepIndex === rest.length - 1) {
    return { deviceId: LOCAL_DEVICE_ID, rawWorkspaceId: workspaceId, isRemote: false };
  }
  return {
    deviceId: unescapeSegment(rest.slice(0, sepIndex)),
    rawWorkspaceId: rest.slice(sepIndex + 1),
    isRemote: true
  };
}
function encodeLogicalWorkspaceId(kind, key) {
  return `${LOGICAL_WORKSPACE_PREFIX}${kind}${SEPARATOR}${escapeSegment(key)}`;
}
function decodeLogicalWorkspaceId(workspaceId) {
  if (!workspaceId.startsWith(LOGICAL_WORKSPACE_PREFIX)) return void 0;
  const rest = workspaceId.slice(LOGICAL_WORKSPACE_PREFIX.length);
  const sepIndex = rest.indexOf(SEPARATOR);
  if (sepIndex <= 0) return void 0;
  const kind = rest.slice(0, sepIndex);
  if (kind !== "git" && kind !== "manual") return void 0;
  return {
    kind,
    key: unescapeSegment(rest.slice(sepIndex + 1))
  };
}
function encodeRemoteEventId(deviceId, remoteEventId) {
  return `${REMOTE_EVENT_PREFIX}${escapeSegment(deviceId)}${SEPARATOR}${remoteEventId}`;
}
function decodeRemoteEventId(eventId) {
  if (!eventId.startsWith(REMOTE_EVENT_PREFIX)) return void 0;
  const rest = eventId.slice(REMOTE_EVENT_PREFIX.length);
  const sepIndex = rest.indexOf(SEPARATOR);
  if (sepIndex <= 0 || sepIndex === rest.length - 1) return void 0;
  return {
    deviceId: unescapeSegment(rest.slice(0, sepIndex)),
    remoteEventId: rest.slice(sepIndex + 1)
  };
}
function workspaceMemberKey(deviceId, path) {
  return `${deviceId}:${normalizeWorkspacePath(path)}`;
}
function normalizeWorkspacePath(rawPath) {
  const trimmed = rawPath.trim();
  if (trimmed === "") return "";
  const isWin = /^[A-Za-z]:[/\\]/.test(trimmed) || trimmed.startsWith("\\\\");
  const unified = isWin ? trimmed.replaceAll("\\", "/") : trimmed;
  const stripped = unified.replace(/\/+$/, "");
  if (stripped === "") return "/";
  if (/^[A-Za-z]:$/.test(stripped)) return `${stripped.toLowerCase()}/`;
  return isWin ? stripped.toLowerCase() : stripped;
}
function normalizeGitRemote(rawUrl) {
  if (typeof rawUrl !== "string") return void 0;
  const trimmed = rawUrl.trim();
  if (trimmed === "") return void 0;
  let host = "";
  let pathPart = "";
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "file:") return void 0;
      host = parsed.hostname.toLowerCase();
      pathPart = parsed.pathname;
    } catch {
      return void 0;
    }
  } else {
    const scpMatch = /^(?:[^@/\s]+@)?([A-Za-z0-9.-]+|\[[0-9a-fA-F:]+\]):(.+)$/.exec(trimmed);
    if (!scpMatch || scpMatch[1] === void 0 || scpMatch[2] === void 0) {
      return void 0;
    }
    if (scpMatch[1].length === 1 && /^[A-Za-z]$/.test(scpMatch[1])) {
      return void 0;
    }
    host = scpMatch[1].toLowerCase();
    pathPart = scpMatch[2];
  }
  const cleanPath = pathPart.replaceAll("\\", "/").replace(/^\/+/, "").replace(/^~\//, "").replace(/\/+$/, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  if (host === "" || cleanPath === "") return void 0;
  return `${host}/${cleanPath.toLowerCase()}`;
}
function escapeSegment(value) {
  return value.replaceAll("%", "%25").replaceAll("~", "%7E");
}
function unescapeSegment(value) {
  return value.replaceAll("%7E", "~").replaceAll("%25", "%");
}

// src/host/gateway.ts
function readLocalPhysicalWorkspaces(workspaceRegistry, localRunningSessionIds) {
  if (workspaceRegistry === void 0) return [];
  try {
    return workspaceRegistry.list().map((ws) => ({
      deviceId: LOCAL_DEVICE_ID,
      deviceName: "Local",
      workspaceId: String(ws.id),
      path: ws.path,
      title: ws.title,
      sessionIds: [...ws.sessionIds].map(String),
      runningSessionCount: ws.sessionIds.filter((id) => localRunningSessionIds.has(String(id))).length,
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt
    }));
  } catch {
    return [];
  }
}
function installAggregatedGateway02(registry, sessionController, workspaceController, typertGateway, workspaceRegistry) {
  const disposers = [];
  const patchMethod = (target, key, replacement) => {
    const original = target[key];
    target[key] = replacement;
    disposers.push(() => {
      target[key] = original;
    });
  };
  const origSessionList = sessionController.list.bind(sessionController);
  const origSessionSearch = sessionController.search.bind(sessionController);
  const origSessionCreate = sessionController.create.bind(sessionController);
  const origSessionSelectModel = sessionController.selectModel.bind(sessionController);
  const origSessionModelCatalog = sessionController.modelCatalog.bind(sessionController);
  const origSessionRename = sessionController.rename.bind(sessionController);
  const origSessionFork = sessionController.fork.bind(sessionController);
  const origSessionPrompt = sessionController.prompt.bind(sessionController);
  const origSessionAttachment = sessionController.attachment.bind(sessionController);
  const origSessionUpdateQueue = sessionController.updateQueue.bind(sessionController);
  const origSessionCancel = sessionController.cancel.bind(sessionController);
  const origSessionPage = sessionController.page.bind(sessionController);
  const origSessionFollow = sessionController.follow.bind(sessionController);
  const origSessionProjections = sessionController.projections.bind(sessionController);
  const origSessionControl = sessionController.control.bind(sessionController);
  const origSessionOpenWorkspacePath = typeof sessionController.openWorkspacePath === "function" ? sessionController.openWorkspacePath.bind(sessionController) : void 0;
  const origWorkspaceRename = workspaceController.rename.bind(workspaceController);
  const origWorkspaceDelete = workspaceController.delete.bind(workspaceController);
  const origWorkspaceInsertBefore = workspaceController.insertBefore.bind(workspaceController);
  const origWorkspaceInsertSessionBefore = workspaceController.insertSessionBefore.bind(workspaceController);
  const origWorkspaceArchive = workspaceController.archiveSession.bind(workspaceController);
  const origWorkspaceUnarchive = workspaceController.unarchiveSession.bind(workspaceController);
  const origWorkspacePin = workspaceController.pinSession.bind(workspaceController);
  const origWorkspaceUnpin = workspaceController.unpinSession.bind(workspaceController);
  const origWorkspaceFollow = workspaceController.follow.bind(workspaceController);
  patchMethod(sessionController, "list", async (_request, signal) => {
    const local = await origSessionList(_request, signal);
    const seen = /* @__PURE__ */ new Set();
    const merged = [];
    for (const item of local.items) {
      const sid = typeof item.sessionId === "string" ? item.sessionId : void 0;
      if (sid !== void 0) {
        if (seen.has(sid)) continue;
        seen.add(sid);
      }
      merged.push(item);
    }
    for (const client of registry.clientList()) {
      for (const rawSummary of client.sessionSummaries()) {
        const nsSummary = client.namespaceSummary(rawSummary);
        if (seen.has(nsSummary.sessionId)) continue;
        seen.add(nsSummary.sessionId);
        merged.push(nsSummary);
      }
    }
    merged.sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
    return { items: merged };
  });
  patchMethod(sessionController, "search", async (request, signal) => {
    const localPromise = origSessionSearch(request, signal).catch(() => ({ items: [], hasMore: false }));
    const remotePromises = registry.clientList().map(async (client) => {
      try {
        const val = await client.invokeUnary("session", "search", { request }, signal);
        return {
          items: (val.items ?? []).map((item) => ({
            sessionId: encodeRemoteSessionId(client.id, item.sessionId),
            snippet: item.snippet
          })),
          hasMore: Boolean(val.hasMore)
        };
      } catch {
        return { items: [], hasMore: false };
      }
    });
    const [localRes, ...remoteResults] = await Promise.all([localPromise, ...remotePromises]);
    const seen = /* @__PURE__ */ new Set();
    const items = [];
    let hasMore = localRes.hasMore;
    for (const group of [localRes, ...remoteResults]) {
      if (group.hasMore) hasMore = true;
      for (const item of group.items) {
        if (seen.has(item.sessionId)) continue;
        seen.add(item.sessionId);
        items.push(item);
      }
    }
    return {
      items: items.slice(0, 20),
      hasMore: hasMore || items.length > 20
    };
  });
  patchMethod(sessionController, "create", async (request) => {
    if (request.sessionId !== void 0) {
      const owner = registry.resolveSessionOwner(request.sessionId);
      if (owner !== void 0) {
        const rawWorkspaceId = request.workspaceId ? resolveRemoteWorkspaceIdForDevice(registry, request.workspaceId, owner.client.id) : void 0;
        const created = await owner.client.invokeUnary("session", "create", {
          request: {
            sessionId: owner.rawSessionId,
            ...rawWorkspaceId !== void 0 ? { workspaceId: rawWorkspaceId } : {},
            ...request.cwd !== void 0 ? { cwd: request.cwd } : {},
            ...request.agentPreset !== void 0 ? { agentPreset: request.agentPreset } : {}
          }
        });
        return {
          sessionId: encodeRemoteSessionId(owner.client.id, created.sessionId),
          ...created.agentPreset !== void 0 ? { agentPreset: created.agentPreset } : {}
        };
      }
    }
    if (request.workspaceId !== void 0 && decodeLogicalWorkspaceId(request.workspaceId) !== void 0) {
      const snap = registry.snapshot();
      const lws = snap.logicalWorkspaces.find((w) => w.logicalWorkspaceId === request.workspaceId);
      if (lws !== void 0) {
        if (lws.targetDeviceId === LOCAL_DEVICE_ID) {
          const localMember = lws.members.find((m) => m.deviceId === LOCAL_DEVICE_ID);
          return origSessionCreate({
            ...localMember !== void 0 ? { workspaceId: localMember.remoteWorkspaceId } : { cwd: lws.targetPath },
            ...request.agentPreset !== void 0 ? { agentPreset: request.agentPreset } : {}
          });
        }
        const remoteClient = registry.client(lws.targetDeviceId);
        const remoteMember = lws.members.find((m) => m.deviceId === lws.targetDeviceId);
        if (remoteClient !== void 0) {
          const created = await remoteClient.invokeUnary("session", "create", {
            request: {
              ...remoteMember !== void 0 ? { workspaceId: remoteMember.remoteWorkspaceId } : { cwd: lws.targetPath },
              ...request.agentPreset !== void 0 ? { agentPreset: request.agentPreset } : {}
            }
          });
          return {
            sessionId: encodeRemoteSessionId(remoteClient.id, created.sessionId),
            ...created.agentPreset !== void 0 ? { agentPreset: created.agentPreset } : {}
          };
        }
      }
    }
    if (request.workspaceId !== void 0) {
      const decodedWs = decodeRemoteWorkspaceId(request.workspaceId);
      if (decodedWs.isRemote) {
        const remoteClient = registry.client(decodedWs.deviceId);
        if (remoteClient !== void 0) {
          const created = await remoteClient.invokeUnary("session", "create", {
            request: {
              workspaceId: decodedWs.rawWorkspaceId,
              ...request.agentPreset !== void 0 ? { agentPreset: request.agentPreset } : {}
            }
          });
          return {
            sessionId: encodeRemoteSessionId(remoteClient.id, created.sessionId),
            ...created.agentPreset !== void 0 ? { agentPreset: created.agentPreset } : {}
          };
        }
      }
    }
    return origSessionCreate(request);
  });
  patchMethod(sessionController, "selectModel", async (request) => {
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionSelectModel(request);
    return await owner.client.invokeUnary("session", "selectModel", {
      request: { ...request, sessionId: owner.rawSessionId }
    });
  });
  patchMethod(sessionController, "modelCatalog", async () => {
    const local = await origSessionModelCatalog();
    const groups = (local.groups ?? []).map((group) => ({
      ...group,
      models: [...group.models]
    }));
    const byId = new Map(groups.map((group) => [group.id, group]));
    const routableProviders = new Set(local.routableProviders ?? []);
    const failures = [...local.failures ?? []];
    await Promise.all(
      registry.clientList().map(async (client) => {
        if (client.toView().state !== "connected") return;
        try {
          const remote = await client.invokeUnary("session", "modelCatalog", {});
          for (const group of remote.groups ?? []) {
            const existing = byId.get(group.id);
            if (existing === void 0) {
              const copy = {
                ...group,
                name: `${client.toView().name} \u2014 ${group.name}`,
                models: [...group.models]
              };
              groups.push(copy);
              byId.set(group.id, copy);
            } else {
              const known = new Set(existing.models.map((model) => model.id));
              for (const model of group.models) {
                if (!known.has(model.id)) existing.models.push(model);
              }
            }
            routableProviders.add(group.id);
          }
          for (const failure of remote.failures ?? []) {
            failures.push({ ...failure, id: `${String(client.id)}:${failure.id}` });
          }
        } catch {
        }
      })
    );
    return {
      ...local,
      groups,
      routableProviders: [...routableProviders],
      failures
    };
  });
  patchMethod(sessionController, "rename", async (request) => {
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionRename(request);
    return await owner.client.invokeUnary("session", "rename", {
      request: { sessionId: owner.rawSessionId, title: request.title }
    });
  });
  patchMethod(sessionController, "fork", async (request) => {
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionFork(request);
    const res = await owner.client.invokeUnary("session", "fork", {
      request: {
        sessionId: owner.rawSessionId,
        ...request.atSeq !== void 0 ? { atSeq: request.atSeq } : {}
      }
    });
    return { sessionId: encodeRemoteSessionId(owner.client.id, res.sessionId) };
  });
  patchMethod(sessionController, "prompt", async (request, signal) => {
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionPrompt(request, signal);
    return await owner.client.invokeUnary(
      "session",
      "prompt",
      { request: { ...request, sessionId: owner.rawSessionId } },
      signal
    );
  });
  patchMethod(sessionController, "attachment", async (request) => {
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionAttachment(request);
    return await owner.client.invokeUnary("session", "attachment", {
      request: { ...request, sessionId: owner.rawSessionId }
    });
  });
  patchMethod(sessionController, "updateQueue", async (request) => {
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionUpdateQueue(request);
    return await owner.client.invokeUnary("session", "updateQueue", {
      request: { ...request, sessionId: owner.rawSessionId }
    });
  });
  patchMethod(sessionController, "cancel", (request) => {
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionCancel(request);
    return owner.client.invokeUnary("session", "cancel", {
      request: { sessionId: owner.rawSessionId }
    });
  });
  patchMethod(sessionController, "projections", async (request, signal) => {
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionProjections(request, signal);
    return await owner.client.invokeUnary(
      "session",
      "projections",
      { request: { sessionId: owner.rawSessionId } },
      signal
    );
  });
  if (origSessionOpenWorkspacePath !== void 0) {
    patchMethod(sessionController, "openWorkspacePath", async (request, signal) => {
      const path = request.path;
      const remote = registry.snapshot().allPhysicalWorkspaces.find((workspace) => {
        if (workspace.deviceId === LOCAL_DEVICE_ID) return false;
        const root = workspace.path.replace(/[\\/]+$/, "");
        return path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}\\`);
      });
      if (remote !== void 0) {
        throw new Error(
          "Remote workspace paths can only be opened inside Native Mode; the aggregated mode will not open them on the local machine"
        );
      }
      return origSessionOpenWorkspacePath(request, signal);
    });
  }
  patchMethod(sessionController, "page", async (request, signal) => {
    const routed = routeSessionAddress(registry, request.address);
    if (routed === void 0) return origSessionPage(request, signal);
    return await routed.client.invokeUnary(
      "session",
      "page",
      { request: { ...request, address: routed.rawAddress } },
      signal
    );
  });
  patchMethod(sessionController, "follow", (request, signal) => {
    const routed = routeSessionAddress(registry, request.address);
    if (routed === void 0) return origSessionFollow(request, signal);
    return (async function* () {
      const stream = routed.client.openStream(
        "session/follow",
        { request: { ...request, address: routed.rawAddress } },
        signal
      );
      for await (const rawFrame of stream) {
        if (isRecord(rawFrame) && rawFrame.type === "snapshot" && isRecord(rawFrame.header)) {
          const header = {
            ...rawFrame.header,
            id: encodeRemoteSessionId(routed.client.id, String(rawFrame.header.id ?? "")),
            ...typeof rawFrame.header.parentSession === "string" ? { parentSession: encodeRemoteSessionId(routed.client.id, rawFrame.header.parentSession) } : {}
          };
          yield { ...rawFrame, header };
        } else {
          yield rawFrame;
        }
      }
    })();
  });
  patchMethod(sessionController, "control", (signal) => {
    return multiplexControlStream(registry, origSessionControl(signal), signal);
  });
  patchMethod(workspaceController, "rename", async (request) => {
    if (decodeLogicalWorkspaceId(request.workspaceId) !== void 0) {
      registry.updateAggregationConfig({
        customTitleByLogicalId: {
          ...registry.aggregator.getConfig().customTitleByLogicalId,
          [request.workspaceId]: request.title.trim()
        }
      });
      const lws = registry.snapshot().logicalWorkspaces.find((w) => w.logicalWorkspaceId === request.workspaceId);
      if (lws !== void 0) {
        return { workspace: logicalToWorkspaceView(lws) };
      }
    }
    const decodedRemote = decodeRemoteWorkspaceId(request.workspaceId);
    if (decodedRemote.isRemote) {
      const client = registry.client(decodedRemote.deviceId);
      if (client !== void 0) {
        const res = await client.invokeUnary("workspace", "rename", {
          request: { workspaceId: decodedRemote.rawWorkspaceId, title: request.title }
        });
        return {
          workspace: {
            ...res.workspace,
            workspaceId: request.workspaceId
          }
        };
      }
    }
    return origWorkspaceRename(request);
  });
  patchMethod(workspaceController, "delete", async (request) => {
    const logical = decodeLogicalWorkspaceId(request.workspaceId);
    if (logical !== void 0) {
      if (logical.kind === "manual") {
        registry.aggregator.removeManualRule(logical.key);
        registry.saveToDisk();
      } else {
        const lws = registry.snapshot().logicalWorkspaces.find((w) => w.logicalWorkspaceId === request.workspaceId);
        if (lws !== void 0) {
          for (const m of lws.members) {
            registry.aggregator.setMemberExcluded(`${m.deviceId}:${m.path}`, true);
          }
          registry.saveToDisk();
        }
      }
      return { deleted: true };
    }
    const decodedRemote = decodeRemoteWorkspaceId(request.workspaceId);
    if (decodedRemote.isRemote) {
      const client = registry.client(decodedRemote.deviceId);
      if (client !== void 0) {
        await client.invokeUnary("workspace", "delete", {
          request: { workspaceId: decodedRemote.rawWorkspaceId }
        });
        return { deleted: true };
      }
    }
    return origWorkspaceDelete(request);
  });
  patchMethod(workspaceController, "insertBefore", async (request) => {
    if (decodeLogicalWorkspaceId(request.workspaceId) !== void 0) {
      const snapshot = registry.snapshot();
      const ids = snapshot.logicalWorkspaces.map((workspace) => workspace.logicalWorkspaceId);
      const from = ids.indexOf(request.workspaceId);
      if (from !== -1) ids.splice(from, 1);
      const before = request.beforeWorkspaceId === void 0 ? -1 : ids.indexOf(request.beforeWorkspaceId);
      if (before === -1) ids.push(request.workspaceId);
      else ids.splice(before, 0, request.workspaceId);
      registry.updateAggregationConfig({ workspaceOrder: ids });
      return { workspaceIds: ids };
    }
    const decodedRemote = decodeRemoteWorkspaceId(request.workspaceId);
    if (decodedRemote.isRemote) {
      const client = registry.client(decodedRemote.deviceId);
      if (client !== void 0) {
        const res = await client.invokeUnary("workspace", "insertBefore", {
          request: {
            workspaceId: decodedRemote.rawWorkspaceId,
            ...request.beforeWorkspaceId !== void 0 ? { beforeWorkspaceId: decodeRemoteWorkspaceId(request.beforeWorkspaceId).rawWorkspaceId } : {}
          }
        });
        return {
          workspaceIds: res.workspaceIds.map(
            (id) => encodeRemoteWorkspaceId(decodedRemote.deviceId, id)
          )
        };
      }
    }
    return origWorkspaceInsertBefore(request);
  });
  patchMethod(workspaceController, "insertSessionBefore", async (request) => {
    if (decodeLogicalWorkspaceId(request.workspaceId) !== void 0) {
      const snapshot = registry.snapshot();
      const lws = snapshot.logicalWorkspaces.find((w) => w.logicalWorkspaceId === request.workspaceId);
      return { workspace: lws !== void 0 ? logicalToWorkspaceView(lws) : {} };
    }
    const decodedRemote = decodeRemoteWorkspaceId(request.workspaceId);
    if (decodedRemote.isRemote) {
      const client = registry.client(decodedRemote.deviceId);
      const owner = registry.resolveSessionOwner(request.sessionId);
      if (client !== void 0 && owner !== void 0) {
        const res = await client.invokeUnary("workspace", "insertSessionBefore", {
          request: {
            workspaceId: decodedRemote.rawWorkspaceId,
            sessionId: owner.rawSessionId,
            ...request.beforeSessionId !== void 0 ? { beforeSessionId: decodeSessionId(request.beforeSessionId).rawSessionId } : {}
          }
        });
        return {
          workspace: {
            ...res.workspace,
            workspaceId: request.workspaceId
          }
        };
      }
    }
    return origWorkspaceInsertSessionBefore(request);
  });
  patchMethod(workspaceController, "archiveSession", async (request) => {
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner !== void 0) {
      await owner.client.invokeUnary("workspace", "archiveSession", {
        request: {
          sessionId: owner.rawSessionId,
          ...request.stopActivity === true ? { stopActivity: true } : {}
        }
      });
      return { archivedSessionIds: collectMergedArchivedIds(registry, workspaceRegistry) };
    }
    const localRes = await origWorkspaceArchive(request);
    return {
      archivedSessionIds: collectMergedArchivedIds(registry, workspaceRegistry, localRes.archivedSessionIds)
    };
  });
  patchMethod(workspaceController, "unarchiveSession", async (request) => {
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner !== void 0) {
      await owner.client.invokeUnary("workspace", "unarchiveSession", {
        request: { sessionId: owner.rawSessionId }
      });
      return { archivedSessionIds: collectMergedArchivedIds(registry, workspaceRegistry) };
    }
    const localRes = await origWorkspaceUnarchive(request);
    return {
      archivedSessionIds: collectMergedArchivedIds(registry, workspaceRegistry, localRes.archivedSessionIds)
    };
  });
  patchMethod(workspaceController, "pinSession", async (request) => {
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner !== void 0) {
      await owner.client.invokeUnary("workspace", "pinSession", {
        request: { sessionId: owner.rawSessionId }
      });
      return { pinnedSessionIds: collectMergedPinnedIds(registry, workspaceRegistry) };
    }
    const localRes = await origWorkspacePin(request);
    return {
      pinnedSessionIds: collectMergedPinnedIds(registry, workspaceRegistry, localRes.pinnedSessionIds)
    };
  });
  patchMethod(workspaceController, "unpinSession", async (request) => {
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner !== void 0) {
      await owner.client.invokeUnary("workspace", "unpinSession", {
        request: { sessionId: owner.rawSessionId }
      });
      return { pinnedSessionIds: collectMergedPinnedIds(registry, workspaceRegistry) };
    }
    const localRes = await origWorkspaceUnpin(request);
    return {
      pinnedSessionIds: collectMergedPinnedIds(registry, workspaceRegistry, localRes.pinnedSessionIds)
    };
  });
  patchMethod(workspaceController, "follow", (signal) => {
    return multiplexWorkspaceFollow(registry, workspaceRegistry, origWorkspaceFollow(signal), signal);
  });
  const origWireOpen = typertGateway.wireStream.open.bind(typertGateway.wireStream);
  typertGateway.wireStream.open = async (endpoint, payload, uplink, peer, signal) => {
    const inner = await origWireOpen(endpoint, payload, uplink, peer, signal);
    if (endpoint !== "$events") return inner;
    return multiplexRemoteEventsStream(registry, inner, signal);
  };
  disposers.push(() => {
    typertGateway.wireStream.open = origWireOpen;
  });
  if (typeof typertGateway.dispatchRpc === "function") {
    const origDispatchRpc = typertGateway.dispatchRpc.bind(typertGateway);
    typertGateway.dispatchRpc = async (endpoint, payload, signal, peer) => {
      if (endpoint === "$events/result" && isRecord(payload) && isRecord(payload.args)) {
        const eventId = payload.args.eventId;
        const outcome = payload.args.outcome;
        if (typeof eventId === "string" && isRecord(outcome)) {
          const decoded = decodeRemoteEventId(eventId);
          if (decoded !== void 0) {
            const client = registry.client(decoded.deviceId);
            if (client === void 0) {
              return {
                ok: false,
                error: { code: "gateway/service-unavailable", message: "Owning remote device is disconnected", details: {} }
              };
            }
            const res = await client.respondWaterfall(
              decoded.remoteEventId,
              outcome,
              signal
            );
            if (!res.ok) {
              return {
                ok: false,
                error: { code: "gateway/internal", message: res.error ?? "Remote waterfall response failed", details: {} }
              };
            }
            return { ok: true, value: void 0 };
          }
        }
      }
      return origDispatchRpc(endpoint, payload, signal, peer);
    };
    disposers.push(() => {
      typertGateway.dispatchRpc = origDispatchRpc;
    });
  }
  return () => {
    for (const dispose of disposers.reverse()) {
      try {
        dispose();
      } catch {
      }
    }
  };
}
function routeSessionAddress(registry, address) {
  if (!isRecord(address)) return void 0;
  if (address.kind === "session" && typeof address.sessionId === "string") {
    const owner = registry.resolveSessionOwner(address.sessionId);
    if (owner === void 0) return void 0;
    return {
      client: owner.client,
      rawAddress: { kind: "session", sessionId: owner.rawSessionId }
    };
  }
  if (address.kind === "subagent" && typeof address.parentSessionId === "string" && typeof address.childSessionId === "string") {
    const parentOwner = registry.resolveSessionOwner(address.parentSessionId);
    if (parentOwner === void 0) return void 0;
    const childDecoded = decodeSessionId(address.childSessionId);
    return {
      client: parentOwner.client,
      rawAddress: {
        ...address,
        parentSessionId: parentOwner.rawSessionId,
        childSessionId: childDecoded.rawSessionId
      }
    };
  }
  return void 0;
}
function resolveRemoteWorkspaceIdForDevice(registry, workspaceId, deviceId) {
  const decodedRemote = decodeRemoteWorkspaceId(workspaceId);
  if (decodedRemote.isRemote && decodedRemote.deviceId === deviceId) {
    return decodedRemote.rawWorkspaceId;
  }
  const lws = registry.snapshot().logicalWorkspaces.find((w) => w.logicalWorkspaceId === workspaceId);
  const member = lws?.members.find((m) => m.deviceId === deviceId);
  return member?.remoteWorkspaceId;
}
function logicalToWorkspaceView(lws) {
  return {
    workspaceId: lws.logicalWorkspaceId,
    path: lws.targetPath,
    title: lws.title,
    sessionIds: [...lws.sessionIds],
    createdAt: lws.createdAt,
    updatedAt: lws.updatedAt
  };
}
function collectMergedArchivedIds(registry, workspaceRegistry, localOverride) {
  const localIds = localOverride ?? workspaceRegistry?.archivedSessionIds.map(String) ?? [];
  const remoteIds = registry.clientList().flatMap(
    (c) => c.archivedIds().map((id) => encodeRemoteSessionId(c.id, id))
  );
  return [.../* @__PURE__ */ new Set([...localIds, ...remoteIds])];
}
function collectMergedPinnedIds(registry, workspaceRegistry, localOverride) {
  const localIds = localOverride ?? workspaceRegistry?.pinnedSessionIds.map(String) ?? [];
  const remoteIds = registry.clientList().flatMap(
    (c) => c.pinnedIds().map((id) => encodeRemoteSessionId(c.id, id))
  );
  return [.../* @__PURE__ */ new Set([...localIds, ...remoteIds])];
}
async function* multiplexControlStream(registry, localStream, signal) {
  const queue = [];
  let wake;
  const push = (item) => {
    queue.push(item);
    const w = wake;
    wake = void 0;
    w?.();
  };
  const offRemote = registry.onControlProjection((_deviceId, frame) => {
    push({
      type: "projection",
      sessionId: frame.sessionId,
      key: frame.key,
      value: frame.value,
      seq: frame.seq
    });
  });
  const pumpLocal = (async () => {
    for await (const frame of localStream) {
      if (signal.aborted) return;
      if (frame.type === "baseline" && isRecord(frame.value) && isRecord(frame.value.projections)) {
        const mergedProjections = { ...frame.value.projections };
        for (const client of registry.clientList()) {
          for (const [rawSid, block] of client.controlProjections().entries()) {
            mergedProjections[encodeRemoteSessionId(client.id, rawSid)] = block;
          }
        }
        push({
          type: "baseline",
          value: { projections: mergedProjections }
        });
      } else {
        push(frame);
      }
    }
  })();
  const onAbort = () => {
    const w = wake;
    wake = void 0;
    w?.();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (!signal.aborted) {
      const next = queue.shift();
      if (next !== void 0) {
        yield next;
        continue;
      }
      await new Promise((r) => {
        wake = r;
      });
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    offRemote();
    await pumpLocal.catch(() => {
    });
  }
}
async function* multiplexWorkspaceFollow(registry, workspaceRegistry, localStream, signal) {
  const queue = [];
  let wake;
  let baselineSent = false;
  let prevById = /* @__PURE__ */ new Map();
  let prevOrder = "";
  let prevArchived = "";
  let prevPinned = "";
  const push = (item) => {
    queue.push(item);
    const w = wake;
    wake = void 0;
    w?.();
  };
  const computeCurrentState = () => {
    const snap = registry.snapshot();
    const items = snap.logicalWorkspaces.map(logicalToWorkspaceView);
    const archivedSessionIds = collectMergedArchivedIds(registry, workspaceRegistry);
    const pinnedSessionIds = collectMergedPinnedIds(registry, workspaceRegistry);
    return { items, archivedSessionIds, pinnedSessionIds };
  };
  const syncIncrementalDiff = () => {
    if (!baselineSent) return;
    const { items, archivedSessionIds, pinnedSessionIds } = computeCurrentState();
    const nextById = /* @__PURE__ */ new Map();
    for (const item of items) {
      const id = String(item.workspaceId);
      const fingerprint = JSON.stringify({
        title: item.title,
        path: item.path,
        sessionIds: item.sessionIds
      });
      nextById.set(id, fingerprint);
      if (prevById.get(id) !== fingerprint) {
        push({
          type: "upsert",
          workspace: {
            ...item,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        });
      }
    }
    for (const oldId of prevById.keys()) {
      if (!nextById.has(oldId)) {
        push({ type: "remove", workspaceId: oldId });
      }
    }
    prevById = nextById;
    const orderIds = items.map((i) => String(i.workspaceId));
    const orderStr = orderIds.join("\0");
    if (orderStr !== prevOrder) {
      prevOrder = orderStr;
      push({ type: "order", workspaceIds: orderIds });
    }
    const archivedStr = archivedSessionIds.join("\0");
    if (archivedStr !== prevArchived) {
      prevArchived = archivedStr;
      push({ type: "archived", archivedSessionIds });
    }
    const pinnedStr = pinnedSessionIds.join("\0");
    if (pinnedStr !== prevPinned) {
      prevPinned = pinnedStr;
      push({ type: "pinned", pinnedSessionIds });
    }
  };
  const offWorkspaces = registry.onWorkspacesChanged(() => {
    syncIncrementalDiff();
  });
  const pumpLocal = (async () => {
    for await (const frame of localStream) {
      if (signal.aborted) return;
      if (frame.type === "baseline") {
        const { items, archivedSessionIds, pinnedSessionIds } = computeCurrentState();
        prevById = new Map(
          items.map((item) => [
            String(item.workspaceId),
            JSON.stringify({ title: item.title, path: item.path, sessionIds: item.sessionIds })
          ])
        );
        prevOrder = items.map((i) => String(i.workspaceId)).join("\0");
        prevArchived = archivedSessionIds.join("\0");
        prevPinned = pinnedSessionIds.join("\0");
        baselineSent = true;
        push({
          type: "baseline",
          value: { items, archivedSessionIds, pinnedSessionIds }
        });
      } else {
        syncIncrementalDiff();
      }
    }
  })();
  const onAbort = () => {
    const w = wake;
    wake = void 0;
    w?.();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (!signal.aborted) {
      const next = queue.shift();
      if (next !== void 0) {
        yield next;
        continue;
      }
      await new Promise((r) => {
        wake = r;
      });
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    offWorkspaces();
    await pumpLocal.catch(() => {
    });
  }
}
async function* multiplexRemoteEventsStream(registry, localEvents, signal) {
  const queue = [];
  let wake;
  let readySent = false;
  const push = (item) => {
    queue.push(item);
    const w = wake;
    wake = void 0;
    w?.();
  };
  const offRemote = registry.onRemoteEvent((_deviceId, frame) => {
    if (!readySent) return;
    push(frame);
  });
  const pumpLocal = (async () => {
    for await (const frame of localEvents) {
      if (signal.aborted) return;
      push(frame);
      if (!readySent && isRecord(frame) && frame.type === "ready") {
        readySent = true;
        for (const client of registry.clientList()) {
          for (const pending of client.pendingInteractionList()) {
            push({
              type: "waterfall",
              event: pending.eventName,
              eventId: pending.namespacedEventId,
              agentId: pending.namespacedSessionId,
              request: pending.request
            });
          }
        }
      }
    }
  })();
  const onAbort = () => {
    const w = wake;
    wake = void 0;
    w?.();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (!signal.aborted) {
      const next = queue.shift();
      if (next !== void 0) {
        yield next;
        continue;
      }
      await new Promise((r) => {
        wake = r;
      });
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    offRemote();
    await pumpLocal.catch(() => {
    });
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/host/registry.ts
import { randomUUID as randomUUID4 } from "node:crypto";
import { chmodSync as chmodSync2, existsSync as existsSync5, mkdirSync as mkdirSync2, readFileSync as readFileSync5, renameSync as renameSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname4 } from "node:path";

// src/host/auth.ts
import { createHash, createHmac, randomUUID } from "node:crypto";
import { chmodSync, existsSync as existsSync3, mkdirSync, readFileSync as readFileSync3, renameSync, writeFileSync } from "node:fs";
import { dirname as dirname2 } from "node:path";

// src/host/http-request.ts
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
var DEFAULT_TIMEOUT_MS = 6e4;
var DEFAULT_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
function requestRemote(requestUrl, options = {}) {
  const target = new URL(requestUrl);
  const isHttps = target.protocol === "https:";
  const headers = {};
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (value === void 0) continue;
    headers[key] = Array.isArray(value) ? [...value] : String(value);
  }
  let body;
  if (options.body !== void 0) {
    body = Buffer.isBuffer(options.body) ? options.body : typeof options.body === "string" ? Buffer.from(options.body, "utf8") : Buffer.from(options.body);
    if (headers["content-length"] === void 0 && headers["Content-Length"] === void 0 && headers["transfer-encoding"] === void 0 && headers["Transfer-Encoding"] === void 0) {
      headers["content-length"] = String(body.byteLength);
    }
  }
  const signal = options.signal;
  if (signal?.aborted === true) {
    return Promise.reject(abortError());
  }
  return new Promise((resolve3, reject) => {
    let settled = false;
    let timer;
    const finish = (error, response) => {
      if (settled) return;
      settled = true;
      if (timer !== void 0) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error !== void 0) reject(error);
      else if (response !== void 0) resolve3(response);
    };
    const onAbort = () => {
      req.destroy(abortError());
    };
    const requestFn = isHttps ? httpsRequest : httpRequest;
    const req = requestFn(
      target,
      {
        method: options.method ?? "GET",
        headers,
        ...isHttps ? { rejectUnauthorized: options.rejectUnauthorized !== false } : {}
      },
      (res) => {
        const chunks = [];
        let size = 0;
        const limit = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
        res.on("data", (chunk) => {
          size += chunk.byteLength;
          if (size > limit) {
            res.destroy(new Error(`Remote response exceeded ${String(limit)} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", (error) => finish(error));
        res.on("end", () => {
          finish(void 0, {
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? "",
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      }
    );
    req.on("error", (error) => finish(error));
    req.setTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, () => {
      req.destroy(new Error("Remote request timed out"));
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (body !== void 0) req.write(body);
    req.end();
  });
}
function responseAsFetchResponse(response) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (value === void 0) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else {
      headers.set(key, value);
    }
  }
  return new Response(new Uint8Array(response.body), { headers });
}
function headerValue(headers, name2) {
  const value = headers[name2.toLowerCase()];
  if (value === void 0) return void 0;
  return Array.isArray(value) ? value[0] : value;
}
function abortError() {
  const error = new Error("Remote request aborted");
  error.name = "AbortError";
  return error;
}

// src/host/tunnel.ts
import { execFileSync, spawn } from "node:child_process";
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { createConnection, createServer } from "node:net";
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";

// src/host/ssh-config.ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
var DEFAULT_KEY_NAMES = ["id_ed25519", "id_ecdsa", "id_rsa", "id_dsa"];
function expandHomePath(inputPath, home = homedir()) {
  const trimmed = inputPath.trim();
  if (trimmed === "~") return home;
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return resolve(home, trimmed.slice(2));
  }
  return trimmed;
}
function discoverDefaultPrivateKeys(home = homedir()) {
  const sshDir = join(home, ".ssh");
  const found = [];
  for (const name2 of DEFAULT_KEY_NAMES) {
    const candidate = join(sshDir, name2);
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        found.push(candidate);
      }
    } catch {
    }
  }
  return found;
}
function listLocalSshKeys(home = homedir()) {
  const sshDir = join(home, ".ssh");
  if (!existsSync(sshDir)) return [];
  const entries = [];
  let names;
  try {
    names = readdirSync(sshDir);
  } catch {
    return [];
  }
  for (const name2 of names.sort()) {
    if (name2.endsWith(".pub")) continue;
    if (name2 === "config" || name2 === "known_hosts" || name2 === "authorized_keys") continue;
    if (name2.startsWith(".")) continue;
    const path = join(sshDir, name2);
    let mode;
    let text;
    try {
      const stat = statSync(path);
      if (!stat.isFile()) continue;
      mode = stat.mode;
      text = readFileSync(path, "utf8").slice(0, 4096);
    } catch {
      continue;
    }
    if (!/-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(text)) continue;
    const publicKeyPath = existsSync(`${path}.pub`) ? `${path}.pub` : void 0;
    entries.push({
      path,
      name: name2,
      ...publicKeyPath !== void 0 ? { publicKeyPath } : {},
      encrypted: /-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(text) || /^Proc-Type:\s*4,ENCRYPTED/im.test(text) || /ENCRYPTED/.test(text),
      permissionsTooOpen: (mode & 63) !== 0
    });
  }
  return entries;
}
function parseSshTargetSpec(spec) {
  const trimmed = spec.trim();
  if (trimmed.startsWith("ssh://")) {
    try {
      const url = new URL(trimmed);
      return {
        host: url.hostname,
        ...url.username !== "" ? { username: decodeURIComponent(url.username) } : {},
        ...url.port !== "" ? { port: Number(url.port) } : {}
      };
    } catch {
    }
  }
  let remainder = trimmed;
  let username;
  const atIndex = remainder.lastIndexOf("@");
  if (atIndex > 0) {
    username = remainder.slice(0, atIndex);
    remainder = remainder.slice(atIndex + 1);
  }
  let host = remainder;
  let port;
  const colonIndex = remainder.lastIndexOf(":");
  if (colonIndex > 0 && !remainder.includes("[")) {
    const maybePort = Number(remainder.slice(colonIndex + 1));
    if (Number.isInteger(maybePort) && maybePort > 0 && maybePort <= 65535) {
      host = remainder.slice(0, colonIndex);
      port = maybePort;
    }
  }
  return {
    host,
    ...username !== void 0 && username !== "" ? { username } : {},
    ...port !== void 0 ? { port } : {}
  };
}
function parseSshConfigText(content, sourceFile = "~/.ssh/config", resolveInclude, visited = /* @__PURE__ */ new Set()) {
  const blocks = [];
  let currentPatterns = ["*"];
  let currentOptions = /* @__PURE__ */ Object.create(null);
  const flushBlock = () => {
    if (Object.keys(currentOptions).length > 0) {
      blocks.push({
        patterns: [...currentPatterns],
        options: currentOptions,
        sourceFile
      });
    }
  };
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = stripSshComment(rawLine).trim();
    if (line === "") continue;
    const parsed = splitDirective(line);
    if (parsed === void 0) continue;
    const key = parsed.key.toLowerCase();
    const rawValue = parsed.value;
    if (key === "host") {
      flushBlock();
      currentPatterns = tokenizeArgs(rawValue);
      currentOptions = /* @__PURE__ */ Object.create(null);
      continue;
    }
    if (key === "match") {
      flushBlock();
      const tokens = tokenizeArgs(rawValue);
      currentPatterns = tokens.length === 1 && tokens[0]?.toLowerCase() === "all" ? ["*"] : [];
      currentOptions = /* @__PURE__ */ Object.create(null);
      continue;
    }
    if (key === "include" && resolveInclude !== void 0) {
      for (const pattern of tokenizeArgs(rawValue)) {
        for (const inc of resolveInclude(pattern, sourceFile)) {
          if (visited.has(inc.path)) continue;
          visited.add(inc.path);
          blocks.push(...parseSshConfigText(inc.content, inc.path, resolveInclude, visited));
        }
      }
      continue;
    }
    if (currentPatterns.length === 0) continue;
    const existing = currentOptions[key] ?? [];
    existing.push(unquoteValue(rawValue));
    currentOptions[key] = existing;
  }
  flushBlock();
  return blocks;
}
function loadSystemSshConfigBlocks(configFile = join(homedir(), ".ssh", "config")) {
  const expanded = expandHomePath(configFile);
  if (!existsSync(expanded)) return [];
  let content;
  try {
    content = readFileSync(expanded, "utf8");
  } catch {
    return [];
  }
  const visited = /* @__PURE__ */ new Set([expanded]);
  return parseSshConfigText(
    content,
    expanded,
    (pattern, fromFile) => expandIncludeFiles(pattern, fromFile),
    visited
  );
}
function listSshConfigHosts(configFile = join(homedir(), ".ssh", "config"), home = homedir()) {
  const blocks = loadSystemSshConfigBlocks(configFile);
  return extractConcreteHostsFromBlocks(blocks, home);
}
function extractConcreteHostsFromBlocks(blocks, home = homedir()) {
  const seenAliases = /* @__PURE__ */ new Set();
  const entries = [];
  for (const block of blocks) {
    for (const pattern of block.patterns) {
      if (pattern.startsWith("!") || pattern.includes("*") || pattern.includes("?")) continue;
      if (seenAliases.has(pattern)) continue;
      seenAliases.add(pattern);
      const resolved = resolveSshParametersFromBlocks(pattern, blocks, home);
      entries.push({
        alias: pattern,
        hostName: resolved.hostName,
        ...resolved.user !== "" ? { user: resolved.user } : {},
        ...resolved.port !== 22 ? { port: resolved.port } : { port: 22 },
        ...resolved.identityFiles[0] !== void 0 ? { identityFile: resolved.identityFiles[0] } : {},
        ...resolved.proxyJump !== void 0 ? { proxyJump: resolved.proxyJump } : {},
        ...resolved.proxyCommand !== void 0 ? { proxyCommand: resolved.proxyCommand } : {},
        ...resolved.forwardAgent !== void 0 ? { forwardAgent: resolved.forwardAgent } : {},
        sourceFile: block.sourceFile
      });
    }
  }
  return entries;
}
function resolveSshConfigForTransport(transport, blocks = loadSystemSshConfigBlocks(), home = homedir()) {
  const parsedSpec = parseSshTargetSpec(transport.host);
  const targetHost = parsedSpec.host;
  const base = resolveSshParametersFromBlocks(targetHost, blocks, home);
  const explicitUser = transport.username?.trim() || parsedSpec.username;
  const explicitPort = transport.port ?? parsedSpec.port;
  const explicitKey = transport.privateKeyPath?.trim();
  const explicitJump = transport.proxyJump?.trim();
  const identityFiles = [];
  if (explicitKey !== void 0 && explicitKey !== "") {
    identityFiles.push(expandHomePath(explicitKey, home));
  }
  for (const file of base.identityFiles) {
    if (!identityFiles.includes(file)) identityFiles.push(file);
  }
  if (identityFiles.length === 0) {
    for (const defKey of discoverDefaultPrivateKeys(home)) {
      if (!identityFiles.includes(defKey)) identityFiles.push(defKey);
    }
  }
  return {
    aliasOrHost: targetHost,
    hostName: base.hostName,
    port: explicitPort ?? base.port,
    user: explicitUser !== void 0 && explicitUser !== "" ? explicitUser : base.user,
    identityFiles,
    ...explicitJump !== void 0 && explicitJump !== "" ? { proxyJump: explicitJump } : base.proxyJump !== void 0 ? { proxyJump: base.proxyJump } : {},
    ...base.proxyCommand !== void 0 ? { proxyCommand: base.proxyCommand } : {},
    ...base.forwardAgent !== void 0 ? { forwardAgent: base.forwardAgent } : {},
    ...base.serverAliveInterval !== void 0 ? { serverAliveInterval: base.serverAliveInterval } : {},
    ...base.strictHostKeyChecking !== void 0 ? { strictHostKeyChecking: base.strictHostKeyChecking } : {}
  };
}
function resolveSshParametersFromBlocks(targetHost, blocks, home = homedir()) {
  let hostName;
  let user;
  let port;
  const identityFiles = [];
  let proxyJump;
  let proxyCommand;
  let forwardAgent;
  let serverAliveInterval;
  let strictHostKeyChecking;
  for (const block of blocks) {
    if (!matchesHostPatterns(targetHost, block.patterns)) continue;
    const opts = block.options;
    if (hostName === void 0 && opts["hostname"]?.[0] !== void 0) {
      hostName = opts["hostname"][0];
    }
    if (user === void 0 && opts["user"]?.[0] !== void 0) {
      user = opts["user"][0];
    }
    if (port === void 0 && opts["port"]?.[0] !== void 0) {
      const p = Number(opts["port"][0]);
      if (Number.isInteger(p) && p > 0 && p <= 65535) port = p;
    }
    if (opts["identityfile"] !== void 0) {
      for (const rawKey of opts["identityfile"]) {
        const expanded = expandHomePath(rawKey, home);
        if (!identityFiles.includes(expanded)) identityFiles.push(expanded);
      }
    }
    if (proxyJump === void 0 && opts["proxyjump"]?.[0] !== void 0) {
      const pj = opts["proxyjump"][0];
      if (pj.toLowerCase() !== "none") proxyJump = pj;
    }
    if (proxyCommand === void 0 && opts["proxycommand"]?.[0] !== void 0) {
      const pc = opts["proxycommand"][0];
      if (pc.toLowerCase() !== "none") proxyCommand = pc;
    }
    if (forwardAgent === void 0 && opts["forwardagent"]?.[0] !== void 0) {
      forwardAgent = opts["forwardagent"][0].toLowerCase() === "yes";
    }
    if (serverAliveInterval === void 0 && opts["serveraliveinterval"]?.[0] !== void 0) {
      const interval = Number(opts["serveraliveinterval"][0]);
      if (Number.isInteger(interval) && interval > 0) serverAliveInterval = interval;
    }
    if (strictHostKeyChecking === void 0 && opts["stricthostkeychecking"]?.[0] !== void 0) {
      strictHostKeyChecking = opts["stricthostkeychecking"][0];
    }
  }
  const localUser = safeLocalUsername();
  const finalUser = user ?? localUser;
  const finalPort = port ?? 22;
  const finalHostName = expandSshTokens(hostName ?? targetHost, {
    h: targetHost,
    u: localUser,
    r: finalUser,
    p: String(finalPort)
  });
  const expandedIdentityFiles = identityFiles.map(
    (file) => expandSshTokens(file, {
      h: finalHostName,
      u: localUser,
      r: finalUser,
      p: String(finalPort)
    })
  );
  return {
    aliasOrHost: targetHost,
    hostName: finalHostName,
    port: finalPort,
    user: finalUser,
    identityFiles: expandedIdentityFiles,
    ...proxyJump !== void 0 ? { proxyJump } : {},
    ...proxyCommand !== void 0 ? { proxyCommand } : {},
    ...forwardAgent !== void 0 ? { forwardAgent } : {},
    ...serverAliveInterval !== void 0 ? { serverAliveInterval } : {},
    ...strictHostKeyChecking !== void 0 ? { strictHostKeyChecking } : {}
  };
}
function safeLocalUsername() {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER ?? process.env.USERNAME ?? "root";
  }
}
function expandSshTokens(input, tokens) {
  return input.replace(/%([%hurp])/g, (_match, token) => {
    if (token === "%") return "%";
    if (token === "h") return tokens.h;
    if (token === "u") return tokens.u;
    if (token === "r") return tokens.r;
    if (token === "p") return tokens.p;
    return token;
  });
}
function matchesHostPatterns(host, patterns) {
  let matchedPositive = false;
  for (const rawPattern of patterns) {
    if (rawPattern.startsWith("!")) {
      const negated = rawPattern.slice(1);
      if (globToRegExp(negated).test(host)) return false;
    } else if (globToRegExp(rawPattern).test(host)) {
      matchedPositive = true;
    }
  }
  return matchedPositive;
}
function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}
function stripSshComment(line) {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === "#" && !inQuotes) return line.slice(0, i);
  }
  return line;
}
function splitDirective(line) {
  const match = /^([A-Za-z0-9]+)(?:\s*=\s*|\s+)(.+)$/.exec(line);
  if (!match || match[1] === void 0 || match[2] === void 0) return void 0;
  return { key: match[1], value: match[2].trim() };
}
function tokenizeArgs(value) {
  const result = [];
  const regex = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = regex.exec(value)) !== null) {
    result.push(match[1] ?? match[2] ?? "");
  }
  return result.filter(Boolean);
}
function unquoteValue(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}
function expandIncludeFiles(pattern, fromFile) {
  const sshRoot = join(homedir(), ".ssh");
  const baseDir = isAbsolute(fromFile) ? dirname(fromFile) : sshRoot;
  const expandedPattern = isAbsolute(expandHomePath(pattern)) ? expandHomePath(pattern) : resolve(sshRoot, pattern);
  const dir = dirname(expandedPattern);
  const filePattern = expandedPattern.slice(dir.length + 1);
  if (!existsSync(dir)) {
    const alt = resolve(baseDir, pattern);
    if (existsSync(alt) && !alt.includes("*")) {
      try {
        return [{ path: alt, content: readFileSync(alt, "utf8") }];
      } catch {
        return [];
      }
    }
    return [];
  }
  try {
    if (!filePattern.includes("*") && !filePattern.includes("?")) {
      if (existsSync(expandedPattern) && statSync(expandedPattern).isFile()) {
        return [{ path: expandedPattern, content: readFileSync(expandedPattern, "utf8") }];
      }
      return [];
    }
    const regex = globToRegExp(filePattern);
    const entries = readdirSync(dir).sort();
    const results = [];
    for (const entry of entries) {
      if (!regex.test(entry)) continue;
      const fullPath = join(dir, entry);
      try {
        if (statSync(fullPath).isFile()) {
          results.push({ path: fullPath, content: readFileSync(fullPath, "utf8") });
        }
      } catch {
      }
    }
    return results;
  } catch {
    return [];
  }
}

// src/host/tunnel.ts
var BACKOFF_BASE_MS = 600;
var BACKOFF_MAX_MS = 15e3;
var READY_TIMEOUT_MS = 15e3;
var KEEPALIVE_INTERVAL_SEC = 15;
async function allocateLoopbackPort() {
  return new Promise((resolve3, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") {
        server.close();
        reject(new Error("failed to allocate loopback port"));
        return;
      }
      const port = addr.port;
      server.close((err) => {
        if (err) reject(err);
        else resolve3(port);
      });
    });
  });
}
function buildSystemSshArgs(transport, resolved, localPort) {
  const remoteBindHost = transport.remoteBindHost ?? "127.0.0.1";
  const remotePort = transport.remotePort ?? 3080;
  const parsedSpec = parseSshTargetSpec(transport.host);
  const args = [
    "-N",
    "-T",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "BatchMode=yes",
    "-o",
    `ServerAliveInterval=${resolved.serverAliveInterval ?? KEEPALIVE_INTERVAL_SEC}`,
    "-o",
    "ServerAliveCountMax=3",
    "-o",
    "ConnectTimeout=10",
    "-o",
    `StrictHostKeyChecking=${resolved.strictHostKeyChecking ?? "accept-new"}`,
    "-L",
    `127.0.0.1:${localPort}:${remoteBindHost}:${remotePort}`
  ];
  const explicitPort = transport.port ?? parsedSpec.port;
  if (explicitPort !== void 0) {
    args.push("-p", String(explicitPort));
  }
  const explicitUser = transport.username?.trim() || parsedSpec.username;
  if (explicitUser !== void 0 && explicitUser !== "") {
    args.push("-l", explicitUser);
  }
  if (transport.privateKeyPath !== void 0 && transport.privateKeyPath.trim() !== "") {
    args.push("-i", expandHomePath(transport.privateKeyPath.trim()));
  }
  if (transport.proxyJump !== void 0 && transport.proxyJump.trim() !== "") {
    args.push("-J", transport.proxyJump.trim());
  }
  args.push(parsedSpec.host);
  return args;
}
async function execSshCommand(transport, command, timeoutMs = 8e3) {
  const resolved = resolveSshConfigForTransport(transport);
  const useSsh2 = transport.engine === "ssh2" || transport.passphrase !== void 0 && transport.passphrase !== "";
  if (useSsh2) {
    if (resolved.proxyJump !== void 0 || resolved.proxyCommand !== void 0) {
      return {
        ok: false,
        error: "ssh2 engine cannot honor ProxyJump/ProxyCommand; use system-ssh with an SSH agent"
      };
    }
    return execViaSsh2(transport, resolved, command, timeoutMs);
  }
  const parsedSpec = parseSshTargetSpec(transport.host);
  const args = [
    "-T",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=6",
    "-o",
    `StrictHostKeyChecking=${resolved.strictHostKeyChecking ?? "accept-new"}`
  ];
  const explicitPort = transport.port ?? parsedSpec.port;
  if (explicitPort !== void 0) args.push("-p", String(explicitPort));
  const explicitUser = transport.username?.trim() || parsedSpec.username;
  if (explicitUser !== void 0 && explicitUser !== "") args.push("-l", explicitUser);
  if (transport.privateKeyPath !== void 0 && transport.privateKeyPath.trim() !== "") {
    args.push("-i", expandHomePath(transport.privateKeyPath.trim()));
  }
  if (transport.proxyJump !== void 0 && transport.proxyJump.trim() !== "") {
    args.push("-J", transport.proxyJump.trim());
  }
  args.push(parsedSpec.host, command);
  return new Promise((resolve3) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const proc = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGTERM");
      resolve3({ ok: false, error: "ssh command timed out" });
    }, timeoutMs);
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve3({ ok: false, error: err.message });
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve3({ ok: true, stdout });
      } else {
        resolve3({ ok: false, error: stderr.trim() || `ssh exited with code ${String(code)}` });
      }
    });
  });
}
async function execViaSsh2(transport, resolved, command, timeoutMs) {
  let ClientCtor;
  try {
    const mod = await import("ssh2");
    ClientCtor = mod.Client;
  } catch {
    return { ok: false, error: "ssh2 package is not available" };
  }
  let privateKey;
  for (const keyPath of resolved.identityFiles) {
    if (existsSync2(keyPath)) {
      try {
        privateKey = readFileSync2(keyPath);
        break;
      } catch {
      }
    }
  }
  return new Promise((resolve3) => {
    const conn = new ClientCtor();
    let settled = false;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        conn.end();
      } catch {
      }
      resolve3(res);
    };
    const timer = setTimeout(() => finish({ ok: false, error: "ssh2 exec timed out" }), timeoutMs);
    conn.on("ready", () => {
      conn.exec?.(command, (err, stream) => {
        if (err || !stream) {
          finish({ ok: false, error: err?.message ?? "ssh2 exec failed" });
          return;
        }
        let stdout = "";
        let stderr = "";
        stream.on("data", (data) => {
          stdout += data.toString("utf8");
        });
        stream.stderr?.on("data", (data) => {
          stderr += data.toString("utf8");
        });
        stream.on("close", (code) => {
          if (code === 0) finish({ ok: true, stdout });
          else finish({ ok: false, error: stderr.trim() || `ssh2 command exited ${String(code)}` });
        });
      });
    });
    conn.on("error", (err) => finish({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    conn.connect({
      host: resolved.hostName,
      port: resolved.port,
      username: resolved.user,
      ...privateKey !== void 0 ? { privateKey } : {},
      ...transport.passphrase !== void 0 ? { passphrase: transport.passphrase } : {},
      ...process.env.SSH_AUTH_SOCK !== void 0 ? { agent: process.env.SSH_AUTH_SOCK } : {},
      hostVerifier: (key) => verifySsh2HostKey(resolved.hostName, resolved.port, key),
      readyTimeout: timeoutMs
    });
  });
}
var SshTunnel = class {
  constructor(transport, notify) {
    this.transport = transport;
    this.notify = notify;
  }
  state = "connecting";
  localPort;
  activeEngine;
  lastError;
  stopped = false;
  attempt = 0;
  retryTimer;
  sshProc;
  ssh2Conn;
  ssh2Server;
  sockets = /* @__PURE__ */ new Set();
  baseUrl() {
    return this.localPort === void 0 || this.state !== "up" ? void 0 : `http://127.0.0.1:${this.localPort}`;
  }
  status() {
    return {
      state: this.state,
      ...this.localPort !== void 0 ? { localPort: this.localPort } : {},
      ...this.baseUrl() !== void 0 ? { baseUrl: this.baseUrl() } : {},
      ...this.activeEngine !== void 0 ? { engine: this.activeEngine } : {},
      ...this.lastError !== void 0 ? { error: this.lastError } : {},
      attempt: this.attempt
    };
  }
  async start() {
    this.stopped = false;
    await this.open();
  }
  stop() {
    this.stopped = true;
    if (this.retryTimer !== void 0) {
      clearTimeout(this.retryTimer);
      this.retryTimer = void 0;
    }
    this.teardown();
    this.state = "stopped";
    this.notify();
  }
  teardown() {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    if (this.sshProc !== void 0) {
      const proc = this.sshProc;
      this.sshProc = void 0;
      proc.removeAllListeners();
      try {
        proc.kill("SIGTERM");
      } catch {
      }
    }
    if (this.ssh2Server !== void 0) {
      try {
        this.ssh2Server.close();
      } catch {
      }
      this.ssh2Server = void 0;
    }
    if (this.ssh2Conn !== void 0) {
      const conn = this.ssh2Conn;
      this.ssh2Conn = void 0;
      try {
        conn.end();
      } catch {
        conn.destroy?.();
      }
    }
    this.localPort = void 0;
  }
  scheduleRetry() {
    if (this.stopped || this.retryTimer !== void 0) return;
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** this.attempt, BACKOFF_MAX_MS);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = void 0;
      void this.open();
    }, delay + Math.floor(Math.random() * 250));
  }
  fail(message, retryable = true) {
    this.lastError = message;
    this.state = "error";
    this.teardown();
    this.notify();
    if (retryable) this.scheduleRetry();
  }
  async open() {
    if (this.stopped) return;
    this.state = "connecting";
    this.notify();
    const resolved = resolveSshConfigForTransport(this.transport);
    const preferSsh2 = this.transport.engine === "ssh2" || this.transport.passphrase !== void 0 && this.transport.passphrase !== "" && this.transport.engine !== "system-ssh";
    if (!preferSsh2) {
      const ok = await this.openWithSystemSsh(resolved);
      if (ok || this.stopped || this.transport.engine === "system-ssh") return;
    }
    if (resolved.proxyJump !== void 0 || resolved.proxyCommand !== void 0) {
      this.fail(
        "ssh2 engine cannot honor ProxyJump/ProxyCommand; use system-ssh with an SSH agent",
        false
      );
      return;
    }
    await this.openWithSsh2(resolved);
  }
  async openWithSystemSsh(resolved) {
    if (this.transport.privateKeyPath !== void 0 && this.transport.privateKeyPath.trim() !== "" && !existsSync2(expandHomePath(this.transport.privateKeyPath.trim()))) {
      this.fail(`SSH private key not found: ${this.transport.privateKeyPath}`, false);
      return false;
    }
    let port;
    try {
      port = await allocateLoopbackPort();
    } catch (error) {
      this.fail(`Failed to allocate local port: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
    const args = buildSystemSshArgs(this.transport, resolved, port);
    let stderr = "";
    let proc;
    try {
      proc = spawn("ssh", args, { stdio: ["ignore", "ignore", "pipe"] });
    } catch (error) {
      if (this.transport.engine === "system-ssh") {
        this.fail(`Failed to spawn ssh: ${error instanceof Error ? error.message : String(error)}`);
      }
      return false;
    }
    this.sshProc = proc;
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 4096) stderr = stderr.slice(-4096);
    });
    const readyResult = await waitForLocalForwardReady(proc, port, READY_TIMEOUT_MS);
    if (!readyResult.ok) {
      const detail = stderr.trim() || readyResult.error;
      if (this.transport.engine === "system-ssh" || !detail.includes("ENOENT")) {
        this.fail(`SSH tunnel failed (${resolved.hostName}): ${detail}`);
        return true;
      }
      this.teardown();
      return false;
    }
    if (this.stopped) {
      this.teardown();
      return true;
    }
    this.localPort = port;
    this.activeEngine = "system-ssh";
    this.state = "up";
    this.lastError = void 0;
    this.attempt = 0;
    this.notify();
    proc.on("close", (code) => {
      if (this.stopped || this.sshProc !== proc) return;
      const msg = stderr.trim() || `ssh tunnel exited (code ${String(code)})`;
      this.fail(msg, true);
    });
    proc.on("error", (err) => {
      if (this.stopped || this.sshProc !== proc) return;
      this.fail(err.message, true);
    });
    return true;
  }
  async openWithSsh2(resolved) {
    let ClientCtor;
    try {
      const mod = await import("ssh2");
      ClientCtor = mod.Client;
    } catch {
      this.fail("Neither system ssh nor ssh2 succeeded; check SSH configuration", true);
      return;
    }
    let privateKey;
    if (this.transport.privateKeyPath !== void 0 && this.transport.privateKeyPath.trim() !== "") {
      const keyFile = expandHomePath(this.transport.privateKeyPath.trim());
      try {
        privateKey = readFileSync2(keyFile);
      } catch (error) {
        this.fail(
          `Cannot read private key ${keyFile}: ${error instanceof Error ? error.message : String(error)}`,
          false
        );
        return;
      }
    } else {
      for (const candidate of resolved.identityFiles) {
        if (existsSync2(candidate)) {
          try {
            privateKey = readFileSync2(candidate);
            break;
          } catch {
          }
        }
      }
    }
    const conn = new ClientCtor();
    this.ssh2Conn = conn;
    const remoteBindHost = this.transport.remoteBindHost ?? "127.0.0.1";
    const remotePort = this.transport.remotePort ?? 3080;
    const connected = new Promise((res, rej) => {
      conn.on("ready", () => res());
      conn.on("error", (err) => rej(err instanceof Error ? err : new Error(String(err))));
      conn.on("close", () => {
        if (!this.stopped && this.state === "up" && this.ssh2Conn === conn) {
          this.fail("SSH connection closed", true);
        }
      });
      conn.connect({
        host: resolved.hostName,
        port: resolved.port,
        username: resolved.user,
        ...privateKey !== void 0 ? { privateKey } : {},
        ...this.transport.passphrase !== void 0 ? { passphrase: this.transport.passphrase } : {},
        ...process.env.SSH_AUTH_SOCK !== void 0 ? { agent: process.env.SSH_AUTH_SOCK } : {},
        hostVerifier: (key) => verifySsh2HostKey(resolved.hostName, resolved.port, key),
        readyTimeout: READY_TIMEOUT_MS,
        keepaliveInterval: KEEPALIVE_INTERVAL_SEC * 1e3
      });
    });
    try {
      await connected;
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error), true);
      return;
    }
    if (this.stopped) {
      this.teardown();
      return;
    }
    const server = createServer((socket) => {
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
      socket.on("error", () => socket.destroy());
      conn.forwardOut("127.0.0.1", 0, remoteBindHost, remotePort, (err, stream) => {
        if (err || !stream) {
          socket.destroy();
          return;
        }
        socket.pipe(stream).pipe(socket);
        stream.on("error", () => socket.destroy());
      });
    });
    this.ssh2Server = server;
    try {
      await new Promise((res, rej) => {
        server.once("error", rej);
        server.listen(0, "127.0.0.1", () => res());
      });
    } catch (error) {
      this.fail(`Cannot bind local forward port: ${error instanceof Error ? error.message : String(error)}`, true);
      return;
    }
    const address = server.address();
    if (address === null || typeof address === "string") {
      this.fail("Local forward server did not report a port", true);
      return;
    }
    this.localPort = address.port;
    this.activeEngine = "ssh2";
    this.state = "up";
    this.lastError = void 0;
    this.attempt = 0;
    this.notify();
  }
};
async function waitForLocalForwardReady(proc, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let exited;
  const onExit = (code) => {
    exited = { code };
  };
  const onError = (error) => {
    exited = { code: null, error };
  };
  proc.once("exit", onExit);
  proc.once("error", onError);
  try {
    while (Date.now() < deadline) {
      if (exited !== void 0) {
        return {
          ok: false,
          error: exited.error?.message ?? `ssh exited early with code ${String(exited.code)}`
        };
      }
      const reachable = await tryTcpConnect(port, 350);
      if (reachable) return { ok: true };
      await new Promise((r) => setTimeout(r, 120));
    }
    return { ok: false, error: "timed out waiting for SSH local port forward" };
  } finally {
    proc.removeListener("exit", onExit);
    proc.removeListener("error", onError);
  }
}
function tryTcpConnect(port, timeoutMs) {
  return new Promise((resolve3) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve3(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      done(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      done(false);
    });
  });
}
function verifySsh2HostKey(host, port, key) {
  const knownHosts = join2(homedir2(), ".ssh", "known_hosts");
  if (!existsSync2(knownHosts)) return false;
  const target = port === 22 ? host : `[${host}]:${String(port)}`;
  try {
    const output = execFileSync("ssh-keygen", ["-F", target, "-f", knownHosts], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    for (const line of output.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3 || parts[2] === void 0) continue;
      const knownKey = Buffer.from(parts[2], "base64");
      if (knownKey.equals(key)) return true;
    }
  } catch {
  }
  return false;
}
async function probeSshTunnel(transport) {
  const tunnel = new SshTunnel(transport, () => {
  });
  await tunnel.start();
  const status = tunnel.status();
  const baseUrl = tunnel.baseUrl();
  if (status.state !== "up" || baseUrl === void 0) {
    tunnel.stop();
    return { ok: false, error: status.error ?? "SSH tunnel failed to establish" };
  }
  return {
    ok: true,
    baseUrl,
    engine: status.engine ?? "system-ssh",
    close: () => tunnel.stop()
  };
}

// src/host/auth.ts
var COOKIE_PREFIX = "dsh-auth-";
var COOKIE_PAYLOAD_VERSION = 1;
var THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1e3;
var COOKIE_MAX_AGE_SAFETY_MS = 6e4;
var COOKIE_CLOCK_SKEW_MS = 1e3;
function encodeBase64Url(value) {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) return void 0;
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const decoded = Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/") + padding, "base64");
  return encodeBase64Url(decoded) === value ? decoded : void 0;
}
function dshCookieName(authority) {
  return COOKIE_PREFIX + encodeBase64Url(createHash("sha256").update(authority).digest());
}
function mintDshBrowserCookie(authority, base64UrlSecret, now = Date.now(), ttlMs = THIRTY_DAYS_MS) {
  const secretBytes = decodeBase64Url(base64UrlSecret.trim());
  if (secretBytes === void 0 || secretBytes.byteLength !== 32) return void 0;
  const issuedAt = now - COOKIE_CLOCK_SKEW_MS;
  const effectiveTtl = Math.max(COOKIE_CLOCK_SKEW_MS, ttlMs - COOKIE_MAX_AGE_SAFETY_MS);
  const payload = {
    version: COOKIE_PAYLOAD_VERSION,
    authority,
    issuedAt,
    // DSH validates `expiresAt - issuedAt <= maxAgeMilliseconds`; never sign
    // a window longer than the configured 30-day default.
    expiresAt: issuedAt + effectiveTtl
  };
  const body = encodeBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = encodeBase64Url(createHmac("sha256", secretBytes).update(body).digest());
  return `${dshCookieName(authority)}=v1.${body}.${sig}`;
}
function extractLaunchToken(credential) {
  const trimmed = credential.trim();
  if (trimmed.includes("://") || trimmed.startsWith("/?")) {
    try {
      const url = new URL(trimmed, "http://127.0.0.1:3080");
      const token = url.searchParams.get("token");
      if (token !== null && token !== "") return token;
    } catch {
    }
  }
  const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(trimmed);
  if (match?.[1] !== void 0) return match[1];
  return trimmed;
}
function parseSigningSecretFromCredentialsYaml(yamlText) {
  const sectionMatch = /client-connection\/browser-session:\s*\r?\n((?:[ \t]+.*\r?\n?)*)/.exec(yamlText);
  const block = sectionMatch?.[1] ?? yamlText;
  const secretMatch = /^\s*secret:\s*['"]?([A-Za-z0-9_-]{40,48})['"]?\s*$/m.exec(block);
  return secretMatch?.[1];
}
function resolveRemoteAuthority(device) {
  if (device.transport.kind === "ssh") {
    const host = device.transport.remoteBindHost ?? "127.0.0.1";
    const port = device.transport.remotePort ?? 3080;
    return `${host}:${port}`;
  }
  try {
    return new URL(device.transport.baseUrl).host;
  } catch {
    return "127.0.0.1:3080";
  }
}
function resolveRemoteCookieAuthority(device) {
  if (device.transport.kind === "ssh") {
    return resolveRemoteAuthority(device);
  }
  try {
    const url = new URL(device.transport.baseUrl);
    return url.protocol === "https:" ? url.origin : url.host;
  } catch {
    return "127.0.0.1:3080";
  }
}
function resolveRemoteScheme(device) {
  if (device.transport.kind === "direct") {
    return device.transport.baseUrl.startsWith("https:") ? "https" : "http";
  }
  return "http";
}
var DeviceAuthManager = class {
  constructor(secretsFilePath) {
    this.secretsFilePath = secretsFilePath;
    this.load();
  }
  secrets = /* @__PURE__ */ new Map();
  load() {
    if (this.secretsFilePath === void 0 || !existsSync3(this.secretsFilePath)) return;
    try {
      const raw = JSON.parse(readFileSync3(this.secretsFilePath, "utf8"));
      if (raw && typeof raw.secrets === "object" && raw.secrets !== null) {
        for (const [id, entry] of Object.entries(raw.secrets)) {
          if (entry && typeof entry === "object") {
            this.secrets.set(id, entry);
          }
        }
      }
    } catch {
    }
  }
  save() {
    if (this.secretsFilePath === void 0) return;
    try {
      const dir = dirname2(this.secretsFilePath);
      mkdirSync(dir, { recursive: true });
      const tmp = `${this.secretsFilePath}.${randomUUID()}.tmp`;
      const doc = {
        version: 1,
        secrets: Object.fromEntries(this.secrets)
      };
      writeFileSync(tmp, JSON.stringify(doc, null, 2), { mode: 384 });
      try {
        chmodSync(tmp, 384);
      } catch {
      }
      renameSync(tmp, this.secretsFilePath);
    } catch {
    }
  }
  removeDevice(deviceId) {
    if (this.secrets.delete(deviceId)) {
      this.save();
    }
  }
  /** Read the persisted secret record for a device (never exposed to the Client). */
  storedSecret(deviceId) {
    return this.secrets.get(deviceId);
  }
  /** Persist or clear the explicit auth credential entered in the device form. */
  setAuthCredential(deviceId, credential) {
    const current = this.secrets.get(deviceId);
    const next = {
      ...current ?? { deviceId, updatedAt: Date.now() },
      deviceId,
      updatedAt: Date.now(),
      ...credential !== void 0 && credential.trim() !== "" ? { authCredential: credential.trim() } : {}
    };
    if (credential === void 0 || credential.trim() === "") delete next.authCredential;
    this.secrets.set(deviceId, next);
    this.save();
  }
  /** Persist or clear the passphrase for an encrypted local SSH key. */
  setSshPassphrase(deviceId, passphrase) {
    const current = this.secrets.get(deviceId);
    const next = {
      ...current ?? { deviceId, updatedAt: Date.now() },
      deviceId,
      updatedAt: Date.now(),
      ...passphrase !== void 0 && passphrase.trim() !== "" ? { sshPassphrase: passphrase } : {}
    };
    if (passphrase === void 0 || passphrase.trim() === "") delete next.sshPassphrase;
    this.secrets.set(deviceId, next);
    this.save();
  }
  /**
   * Build the HTTP headers (`Host`, `Origin`, `Cookie`, `Authorization`) needed to authenticate
   * against `device` over `effectiveBaseUrl`.
   */
  getAuthHeaders(device) {
    const authority = resolveRemoteAuthority(device);
    const cookieAuthority = resolveRemoteCookieAuthority(device);
    const scheme = resolveRemoteScheme(device);
    const headers = {
      Host: authority,
      Origin: `${scheme}://${authority}`
    };
    const auth = device.auth;
    if (auth.mode === "none") return headers;
    const stored = this.secrets.get(device.id);
    const credential = auth.credential?.trim() || stored?.authCredential?.trim();
    if (auth.mode === "bearer" && credential !== void 0 && credential !== "") {
      headers["Authorization"] = `Bearer ${credential}`;
      return headers;
    }
    if (auth.mode === "cookie" && credential !== void 0 && credential !== "") {
      headers["Cookie"] = credential.includes("=") ? credential : `${dshCookieName(cookieAuthority)}=${credential}`;
      return headers;
    }
    if (stored?.signingSecret !== void 0) {
      const minted = mintDshBrowserCookie(cookieAuthority, stored.signingSecret);
      if (minted !== void 0) {
        headers["Cookie"] = minted;
        return headers;
      }
    }
    if (stored?.cookie !== void 0 && stored.cookieAuthority === cookieAuthority) {
      headers["Cookie"] = stored.cookie;
      return headers;
    }
    if (stored?.bearerToken !== void 0) {
      headers["Authorization"] = `Bearer ${stored.bearerToken}`;
    }
    return headers;
  }
  /**
   * Ensure valid authentication credentials exist for `device` against `effectiveBaseUrl`.
   * Called before connecting or whenever a `401 Unauthorized` response is encountered.
   */
  async ensureAuthenticated(device, effectiveBaseUrl, forceRefresh = false) {
    const authority = resolveRemoteAuthority(device);
    const cookieAuthority = resolveRemoteCookieAuthority(device);
    const auth = device.auth ?? { mode: "auto" };
    if (auth.mode === "none" || auth.mode === "cookie" || auth.mode === "bearer") {
      return { ok: true };
    }
    const existing = this.secrets.get(device.id);
    if (!forceRefresh && existing !== void 0) {
      if (existing.signingSecret !== void 0 || existing.cookie !== void 0 && existing.cookieAuthority === cookieAuthority) {
        return { ok: true };
      }
    }
    const configuredCredential = auth.credential?.trim() || existing?.authCredential?.trim();
    if (configuredCredential !== void 0 && configuredCredential !== "") {
      const rawCred = configuredCredential;
      if (decodeBase64Url(rawCred)?.byteLength === 32) {
        const exchanged = await this.exchangeLaunchToken(
          device.id,
          effectiveBaseUrl,
          authority,
          cookieAuthority,
          extractLaunchToken(rawCred)
        );
        if (exchanged.ok) return exchanged;
        const minted = mintDshBrowserCookie(cookieAuthority, rawCred);
        if (minted !== void 0) {
          this.secrets.set(device.id, {
            deviceId: device.id,
            signingSecret: rawCred,
            cookie: minted,
            cookieAuthority,
            updatedAt: Date.now()
          });
          this.save();
          return { ok: true };
        }
      } else {
        const token = extractLaunchToken(rawCred);
        const exchanged = await this.exchangeLaunchToken(
          device.id,
          effectiveBaseUrl,
          authority,
          cookieAuthority,
          token
        );
        if (exchanged.ok) return exchanged;
        if (auth.mode === "token") return exchanged;
      }
    }
    if (device.transport.kind === "ssh" && (auth.mode === "auto" || auth.mode === "token")) {
      const dshHome = device.transport.remoteDshHome?.trim() || "~/.dsh";
      const escapedHome = `'${dshHome.replaceAll("'", "'\\''")}'`;
      const cmd = `cat ${escapedHome}/.credentials.yaml 2>/dev/null || true`;
      const sshRes = await execSshCommand(device.transport, cmd, 6e3);
      if (sshRes.ok && sshRes.stdout.trim() !== "") {
        const secret = parseSigningSecretFromCredentialsYaml(sshRes.stdout);
        if (secret !== void 0) {
          const minted = mintDshBrowserCookie(cookieAuthority, secret);
          if (minted !== void 0) {
            this.secrets.set(device.id, {
              deviceId: device.id,
              signingSecret: secret,
              cookie: minted,
              cookieAuthority,
              updatedAt: Date.now()
            });
            this.save();
            return { ok: true };
          }
        }
      }
    }
    return { ok: true };
  }
  /**
   * Exchange a DSH launch token (`/?token=<launchToken>`) for a persistent `dsh-auth-*` cookie.
   */
  async exchangeLaunchToken(deviceId, effectiveBaseUrl, authority, cookieAuthority, launchToken) {
    try {
      const url = new URL("/", effectiveBaseUrl);
      url.searchParams.set("token", launchToken);
      const response = await requestRemote(url.href, {
        method: "GET",
        headers: { Host: authority },
        timeoutMs: 15e3
      });
      const rawSetCookie = response.headers["set-cookie"];
      const setCookies = Array.isArray(rawSetCookie) ? rawSetCookie : rawSetCookie === void 0 ? [] : [rawSetCookie];
      for (const setCookie of setCookies) {
        const cookiePair = setCookie.split(";")[0]?.trim();
        if (cookiePair !== void 0 && cookiePair.startsWith(COOKIE_PREFIX)) {
          this.secrets.set(deviceId, {
            deviceId,
            cookie: cookiePair,
            cookieAuthority,
            updatedAt: Date.now()
          });
          this.save();
          return { ok: true };
        }
      }
      if (response.status === 200) {
        return { ok: true };
      }
      return {
        ok: false,
        error: `Token exchange rejected by remote DSH (HTTP ${String(response.status)})`
      };
    } catch (error) {
      return {
        ok: false,
        error: `Token exchange failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
};

// src/host/git-aggregator.ts
import { existsSync as existsSync4, readFileSync as readFileSync4, statSync as statSync2 } from "node:fs";
import { dirname as dirname3, isAbsolute as isAbsolute2, join as join3, resolve as resolve2 } from "node:path";
function parseGitConfigRemoteUrl(configText) {
  let currentRemote;
  let originUrl;
  let fallbackUrl;
  for (const rawLine of configText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch?.[1] !== void 0) {
      const header = sectionMatch[1].trim();
      const remoteMatch = /^remote\s+"([^"]+)"$/i.exec(header);
      currentRemote = remoteMatch?.[1];
      continue;
    }
    if (currentRemote !== void 0) {
      const kv = /^url\s*=\s*(.+)$/i.exec(line);
      if (kv?.[1] !== void 0) {
        const url = kv[1].trim().replace(/^["']|["']$/g, "");
        if (url !== "") {
          if (currentRemote === "origin" && originUrl === void 0) {
            originUrl = url;
          } else if (fallbackUrl === void 0) {
            fallbackUrl = url;
          }
        }
      }
    }
  }
  return originUrl ?? fallbackUrl;
}
function discoverLocalGitRemote(directoryPath) {
  if (!directoryPath || !isAbsolute2(directoryPath)) return void 0;
  let current = directoryPath;
  for (let depth = 0; depth < 6; depth++) {
    const dotGit = join3(current, ".git");
    try {
      if (existsSync4(dotGit)) {
        const st = statSync2(dotGit);
        if (st.isDirectory()) {
          const configFile = join3(dotGit, "config");
          if (existsSync4(configFile)) {
            return parseGitConfigRemoteUrl(readFileSync4(configFile, "utf8"));
          }
        } else if (st.isFile()) {
          const pointer = readFileSync4(dotGit, "utf8").trim();
          const match = /^gitdir:\s*(.+)$/i.exec(pointer);
          if (match?.[1] !== void 0) {
            const gitDir = isAbsolute2(match[1]) ? match[1] : resolve2(current, match[1]);
            const commonDirFile = join3(gitDir, "commondir");
            if (existsSync4(commonDirFile)) {
              const commonRel = readFileSync4(commonDirFile, "utf8").trim();
              const commonDir = isAbsolute2(commonRel) ? commonRel : resolve2(gitDir, commonRel);
              const commonConfig = join3(commonDir, "config");
              if (existsSync4(commonConfig)) {
                return parseGitConfigRemoteUrl(readFileSync4(commonConfig, "utf8"));
              }
            }
            const directConfig = join3(gitDir, "config");
            if (existsSync4(directConfig)) {
              return parseGitConfigRemoteUrl(readFileSync4(directConfig, "utf8"));
            }
            const parentConfig = resolve2(gitDir, "..", "..", "config");
            if (existsSync4(parentConfig)) {
              return parseGitConfigRemoteUrl(readFileSync4(parentConfig, "utf8"));
            }
          }
        }
      }
    } catch {
    }
    const parent = dirname3(current);
    if (parent === current) break;
    current = parent;
  }
  return void 0;
}
async function discoverRemoteGitRemotesViaSsh(transport, paths) {
  const result = /* @__PURE__ */ new Map();
  const uniquePaths = [...new Set(paths.filter((p) => p.trim() !== ""))];
  if (uniquePaths.length === 0) return result;
  const commands = uniquePaths.map((p, idx) => {
    const escaped = `'${p.replaceAll("'", "'\\''")}'`;
    return [
      `u=$(git -C ${escaped} config --get remote.origin.url 2>/dev/null || true)`,
      `if [ -z "$u" ]; then u=$(git -C ${escaped} config --get-regexp '^remote\\..*\\.url$' 2>/dev/null | head -n 1 | awk '{print $2}'); fi`,
      `printf "__DSH_GIT_%d__\\t%s\\n" ${idx} "$u"`
    ].join("; ");
  });
  const fullCommand = commands.join("; ");
  const res = await execSshCommand(transport, fullCommand, 8e3);
  if (!res.ok) return result;
  for (const line of res.stdout.split(/\r?\n/)) {
    const match = /^__DSH_GIT_(\d+)__\t(.+)$/.exec(line.trim());
    if (!match || match[1] === void 0 || match[2] === void 0) continue;
    const idx = Number(match[1]);
    const url = match[2].trim();
    const path = uniquePaths[idx];
    if (path !== void 0 && url !== "") {
      result.set(path, url);
    }
  }
  return result;
}
var DEFAULT_AGGREGATION_CONFIG = {
  autoGitAggregate: true,
  prefixUnmatchedWithDevice: true,
  excludedMemberKeys: [],
  preferredDeviceByLogicalId: {},
  customTitleByLogicalId: {},
  workspaceOrder: [],
  manualRules: []
};
var WorkspaceAggregator = class {
  config;
  gitRemoteCache = /* @__PURE__ */ new Map();
  constructor(initialConfig = {}) {
    this.config = {
      ...DEFAULT_AGGREGATION_CONFIG,
      ...initialConfig,
      excludedMemberKeys: [...initialConfig.excludedMemberKeys ?? []],
      preferredDeviceByLogicalId: { ...initialConfig.preferredDeviceByLogicalId ?? {} },
      customTitleByLogicalId: { ...initialConfig.customTitleByLogicalId ?? {} },
      workspaceOrder: [...initialConfig.workspaceOrder ?? []],
      manualRules: [...initialConfig.manualRules ?? []]
    };
  }
  getConfig() {
    return this.config;
  }
  setConfig(next) {
    this.config = {
      autoGitAggregate: next.autoGitAggregate ?? this.config.autoGitAggregate,
      prefixUnmatchedWithDevice: next.prefixUnmatchedWithDevice ?? this.config.prefixUnmatchedWithDevice,
      excludedMemberKeys: next.excludedMemberKeys ? [...next.excludedMemberKeys] : this.config.excludedMemberKeys,
      preferredDeviceByLogicalId: next.preferredDeviceByLogicalId ? { ...next.preferredDeviceByLogicalId } : this.config.preferredDeviceByLogicalId,
      customTitleByLogicalId: next.customTitleByLogicalId ? { ...next.customTitleByLogicalId } : this.config.customTitleByLogicalId,
      workspaceOrder: next.workspaceOrder ? [...next.workspaceOrder] : this.config.workspaceOrder,
      manualRules: next.manualRules ? [...next.manualRules] : this.config.manualRules
    };
    return this.config;
  }
  upsertManualRule(rule) {
    const filtered = this.config.manualRules.filter((r) => r.id !== rule.id);
    this.config = {
      ...this.config,
      manualRules: [...filtered, rule]
    };
    return this.config;
  }
  removeManualRule(ruleId) {
    this.config = {
      ...this.config,
      manualRules: this.config.manualRules.filter((r) => r.id !== ruleId)
    };
    return this.config;
  }
  setMemberExcluded(memberKey, excluded) {
    const set = new Set(this.config.excludedMemberKeys);
    if (excluded) set.add(memberKey);
    else set.delete(memberKey);
    this.config = {
      ...this.config,
      excludedMemberKeys: [...set]
    };
    return this.config;
  }
  setPreferredDevice(logicalWorkspaceId, deviceId) {
    this.config = {
      ...this.config,
      preferredDeviceByLogicalId: {
        ...this.config.preferredDeviceByLogicalId,
        [logicalWorkspaceId]: deviceId
      }
    };
    return this.config;
  }
  setCustomTitle(logicalWorkspaceId, title) {
    const trimmed = title.trim();
    const nextTitles = { ...this.config.customTitleByLogicalId };
    if (trimmed === "") delete nextTitles[logicalWorkspaceId];
    else nextTitles[logicalWorkspaceId] = trimmed;
    this.config = {
      ...this.config,
      customTitleByLogicalId: nextTitles
    };
    return this.config;
  }
  /** Record a discovered raw Git remote URL for `<deviceId>:<normalizedPath>`. */
  noteGitRemote(deviceId, path, rawGitRemote) {
    const key = workspaceMemberKey(deviceId, path);
    this.gitRemoteCache.set(key, rawGitRemote);
  }
  getCachedGitRemote(deviceId, path) {
    const key = workspaceMemberKey(deviceId, path);
    const cached = this.gitRemoteCache.get(key);
    if (cached !== void 0) return cached;
    if (deviceId === LOCAL_DEVICE_ID) {
      const discovered = discoverLocalGitRemote(path);
      if (discovered !== void 0) {
        this.gitRemoteCache.set(key, discovered);
        return discovered;
      }
    }
    return void 0;
  }
  /**
   * Compute both the `LogicalWorkspaceView[]` and `WorkspaceMemberRef[]` from all physical
   * workspaces across local and remote devices.
   */
  aggregate(physicalList, sessionUpdatedAtMap = /* @__PURE__ */ new Map()) {
    const excludedSet = new Set(this.config.excludedMemberKeys);
    const enriched = physicalList.map((item) => {
      const memberKey = workspaceMemberKey(item.deviceId, item.path);
      const rawGit = item.rawGitRemote ?? this.getCachedGitRemote(item.deviceId, item.path);
      const gitRemote = normalizeGitRemote(rawGit);
      const namespacedSessionIds = item.sessionIds.map(
        (sid) => encodeRemoteSessionId(item.deviceId, sid)
      );
      const memberRef = {
        deviceId: item.deviceId,
        deviceName: item.deviceName,
        remoteWorkspaceId: item.workspaceId,
        path: item.path,
        title: item.title,
        ...gitRemote !== void 0 ? { gitRemote } : {},
        ...rawGit !== void 0 ? { rawGitRemote: rawGit } : {},
        sessionCount: item.sessionIds.length,
        runningSessionCount: item.runningSessionCount
      };
      return {
        input: item,
        memberKey,
        gitRemote,
        namespacedSessionIds,
        memberRef
      };
    });
    const allPhysicalWorkspaces = enriched.map((e) => e.memberRef);
    const consumedIndices = /* @__PURE__ */ new Set();
    const logicalWorkspaces = [];
    for (const rule of this.config.manualRules) {
      const ruleMemberKeys = new Set(rule.memberKeys);
      const ruleGit = normalizeGitRemote(rule.gitRemote);
      const matched = enriched.filter((entry, idx) => {
        if (consumedIndices.has(idx)) return false;
        if (ruleMemberKeys.has(entry.memberKey)) return true;
        if (ruleGit !== void 0 && entry.gitRemote === ruleGit && !excludedSet.has(entry.memberKey)) {
          return true;
        }
        return false;
      });
      if (matched.length === 0) continue;
      for (const m of matched) {
        consumedIndices.add(enriched.indexOf(m));
      }
      const logicalId = encodeLogicalWorkspaceId("manual", rule.id);
      logicalWorkspaces.push(
        this.buildLogicalView(
          logicalId,
          "manual",
          rule.title,
          ruleGit ?? matched.find((m) => m.gitRemote !== void 0)?.gitRemote,
          matched,
          sessionUpdatedAtMap,
          rule.preferredDeviceId
        )
      );
    }
    if (this.config.autoGitAggregate) {
      const byGitRemote = /* @__PURE__ */ new Map();
      for (const [idx, entry] of enriched.entries()) {
        if (consumedIndices.has(idx)) continue;
        if (excludedSet.has(entry.memberKey)) continue;
        if (entry.gitRemote === void 0) continue;
        const group = byGitRemote.get(entry.gitRemote) ?? [];
        group.push(entry);
        byGitRemote.set(entry.gitRemote, group);
      }
      for (const [gitRemote, group] of byGitRemote.entries()) {
        const distinctDevices = new Set(group.map((g) => g.input.deviceId));
        if (group.length >= 2 || distinctDevices.size >= 2) {
          for (const m of group) {
            consumedIndices.add(enriched.indexOf(m));
          }
          const logicalId = encodeLogicalWorkspaceId("git", gitRemote);
          const repoName = gitRemote.split("/").pop() ?? group[0]?.input.title ?? gitRemote;
          const defaultTitle = group.find((g) => g.input.deviceId === LOCAL_DEVICE_ID)?.input.title ?? repoName;
          logicalWorkspaces.push(
            this.buildLogicalView(
              logicalId,
              "git",
              defaultTitle,
              gitRemote,
              group,
              sessionUpdatedAtMap
            )
          );
        }
      }
    }
    for (const [idx, entry] of enriched.entries()) {
      if (consumedIndices.has(idx)) continue;
      const isLocal = entry.input.deviceId === LOCAL_DEVICE_ID;
      const workspaceId = isLocal ? entry.input.workspaceId : encodeRemoteWorkspaceId(entry.input.deviceId, entry.input.workspaceId);
      const customTitle = this.config.customTitleByLogicalId[workspaceId];
      const baseTitle = entry.input.title;
      const title = customTitle ?? (!isLocal && this.config.prefixUnmatchedWithDevice ? `[${entry.input.deviceName}] ${baseTitle}` : baseTitle);
      logicalWorkspaces.push({
        logicalWorkspaceId: workspaceId,
        title,
        kind: "single",
        ...entry.gitRemote !== void 0 ? { gitRemote: entry.gitRemote } : {},
        targetDeviceId: entry.input.deviceId,
        targetPath: entry.input.path,
        members: [entry.memberRef],
        sessionIds: entry.namespacedSessionIds,
        createdAt: entry.input.createdAt,
        updatedAt: entry.input.updatedAt
      });
    }
    if (this.config.workspaceOrder.length > 0) {
      const rank = new Map(this.config.workspaceOrder.map((id, index) => [id, index]));
      logicalWorkspaces.sort(
        (a, b) => (rank.get(a.logicalWorkspaceId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.logicalWorkspaceId) ?? Number.MAX_SAFE_INTEGER)
      );
    }
    return { logicalWorkspaces, allPhysicalWorkspaces };
  }
  buildLogicalView(logicalId, kind, defaultTitle, gitRemote, members, sessionUpdatedAtMap, rulePreferredDevice) {
    const customTitle = this.config.customTitleByLogicalId[logicalId];
    const configuredPreferred = this.config.preferredDeviceByLogicalId[logicalId] ?? rulePreferredDevice;
    const targetMember = (configuredPreferred !== void 0 ? members.find((m) => m.input.deviceId === configuredPreferred) : void 0) ?? members.find((m) => m.input.deviceId === LOCAL_DEVICE_ID) ?? members[0];
    const seenSessions = /* @__PURE__ */ new Set();
    const mergedSessionIds = [];
    for (const m of members) {
      for (const sid of m.namespacedSessionIds) {
        if (!seenSessions.has(sid)) {
          seenSessions.add(sid);
          mergedSessionIds.push(sid);
        }
      }
    }
    mergedSessionIds.sort((a, b) => {
      const ta = sessionUpdatedAtMap.get(a) ?? 0;
      const tb = sessionUpdatedAtMap.get(b) ?? 0;
      return tb - ta;
    });
    let earliestCreated = members[0]?.input.createdAt ?? (/* @__PURE__ */ new Date(0)).toISOString();
    let latestUpdated = members[0]?.input.updatedAt ?? (/* @__PURE__ */ new Date(0)).toISOString();
    for (const m of members) {
      if (Date.parse(m.input.createdAt) < Date.parse(earliestCreated)) {
        earliestCreated = m.input.createdAt;
      }
      if (Date.parse(m.input.updatedAt) > Date.parse(latestUpdated)) {
        latestUpdated = m.input.updatedAt;
      }
    }
    return {
      logicalWorkspaceId: logicalId,
      title: customTitle ?? defaultTitle,
      kind,
      ...gitRemote !== void 0 ? { gitRemote } : {},
      targetDeviceId: targetMember.input.deviceId,
      targetPath: targetMember.input.path,
      members: members.map((m) => m.memberRef),
      sessionIds: mergedSessionIds,
      createdAt: earliestCreated,
      updatedAt: latestUpdated
    };
  }
};

// src/host/native-proxy.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import {
  createServer as createServer2,
  request as httpRequest2
} from "node:http";
import { request as httpsRequest2 } from "node:https";
var PROXY_TOKEN_QUERY = "md_token";
var PROXY_COOKIE_NAME = "dsh-md-native";
var NativeDeviceProxy = class {
  constructor(device, getUpstreamBaseUrl, authManager, localOrigin) {
    this.device = device;
    this.getUpstreamBaseUrl = getUpstreamBaseUrl;
    this.authManager = authManager;
    this.localOrigin = localOrigin;
  }
  server;
  localPort;
  sockets = /* @__PURE__ */ new Set();
  stopped = false;
  lastAuthAttemptAt = 0;
  token = randomUUID2().replaceAll("-", "");
  updateDevice(device) {
    this.device = device;
  }
  proxyUrl() {
    if (this.localPort === void 0) return void 0;
    return `http://127.0.0.1:${this.localPort}/?${PROXY_TOKEN_QUERY}=${this.token}`;
  }
  proxyOrigin() {
    return this.localPort === void 0 ? void 0 : `http://127.0.0.1:${this.localPort}`;
  }
  port() {
    return this.localPort;
  }
  async start() {
    if (this.server !== void 0 || this.stopped) return;
    const server = createServer2((req, res) => {
      void this.handleHttp(req, res);
    });
    server.on("upgrade", (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });
    server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
    });
    await new Promise((resolve3, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve3());
    });
    const addr = server.address();
    if (addr !== null && typeof addr === "object") {
      this.localPort = addr.port;
    }
    this.server = server;
  }
  stop() {
    this.stopped = true;
    for (const socket of this.sockets) {
      try {
        socket.destroy();
      } catch {
      }
    }
    this.sockets.clear();
    this.server?.close();
    this.server = void 0;
    this.localPort = void 0;
  }
  async handleHttp(req, res) {
    const upstreamBase = this.getUpstreamBaseUrl();
    if (upstreamBase === void 0) {
      res.writeHead(503, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(renderUnavailableHtml(this.device.name, "Device tunnel or connection is not ready yet."));
      return;
    }
    const parsed = parseOriginForm(req.url);
    if (parsed === void 0) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("Invalid native proxy request target");
      return;
    }
    const proxyOrigin = this.proxyOrigin();
    if (proxyOrigin === void 0) {
      res.writeHead(503, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("Native proxy is not listening");
      return;
    }
    const requestUrl = new URL(req.url ?? "/", proxyOrigin);
    const queryToken = requestUrl.searchParams.get(PROXY_TOKEN_QUERY);
    const cookieToken = readCookie(req.headers.cookie, PROXY_COOKIE_NAME);
    if (queryToken === this.token && cookieToken !== this.token) {
      res.writeHead(302, {
        location: formatPath(parsed.pathname, stripProxyToken(parsed.search)),
        "set-cookie": `${PROXY_COOKIE_NAME}=${this.token}; Path=/; HttpOnly; SameSite=Lax`,
        "cache-control": "no-store"
      });
      res.end();
      return;
    }
    if (cookieToken !== this.token) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("Native proxy authentication required");
      return;
    }
    if (req.headers["sec-fetch-site"] === "cross-site") {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("Cross-site native proxy request rejected");
      return;
    }
    const now = Date.now();
    if (now - this.lastAuthAttemptAt > 3e4) {
      this.lastAuthAttemptAt = now;
      await this.authManager.ensureAuthenticated(this.device, upstreamBase);
    }
    const upstreamUrl = buildUpstreamUrl(upstreamBase, parsed.pathname, stripProxyToken(parsed.search));
    const isHttps = upstreamUrl.protocol === "https:";
    const authority = resolveRemoteAuthority(this.device);
    const authHeaders = this.authManager.getAuthHeaders(this.device);
    const outHeaders = {};
    for (const [key, val] of Object.entries(req.headers)) {
      if (val === void 0) continue;
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "origin" || lower === "referer") continue;
      outHeaders[key] = val;
    }
    outHeaders["host"] = authority;
    if (req.headers["origin"] !== void 0) {
      outHeaders["origin"] = authHeaders["Origin"] ?? `${isHttps ? "https" : "http"}://${authority}`;
    }
    if (authHeaders["Cookie"] !== void 0) {
      const existingCookie = typeof outHeaders["cookie"] === "string" ? outHeaders["cookie"] : void 0;
      outHeaders["cookie"] = existingCookie ? `${existingCookie}; ${authHeaders["Cookie"]}` : authHeaders["Cookie"];
    }
    if (authHeaders["Authorization"] !== void 0) {
      outHeaders["authorization"] = authHeaders["Authorization"];
    }
    const reqFn = isHttps ? httpsRequest2 : httpRequest2;
    const rejectUnauthorized = this.device.transport.kind === "direct" ? this.device.transport.rejectUnauthorized !== false : false;
    const proxyReq = reqFn(
      upstreamUrl,
      {
        method: req.method ?? "GET",
        headers: outHeaders,
        ...isHttps ? { rejectUnauthorized } : {}
      },
      (proxyRes) => {
        const resHeaders = {};
        for (const [key, val] of Object.entries(proxyRes.headers)) {
          if (val === void 0) continue;
          const lower = key.toLowerCase();
          if (lower === "x-frame-options") continue;
          if (lower === "content-security-policy") {
            const cleaned = (Array.isArray(val) ? val.join("; ") : val).replace(/frame-ancestors[^;]*;?/gi, "").trim();
            const local = this.localOrigin?.();
            const framing = local !== void 0 ? `frame-ancestors 'self' ${local}` : "";
            const next = [cleaned, framing].filter((part) => part !== "").join("; ");
            if (next !== "") resHeaders[key] = next;
            continue;
          }
          if (lower === "set-cookie") {
            const cookies = Array.isArray(val) ? val : [val];
            resHeaders[key] = cookies.map(
              (c) => c.replace(/;\s*SameSite=Strict/gi, "; SameSite=Lax").replace(/;\s*Secure/gi, "").replace(/;\s*Domain=[^;]*/gi, "")
            );
            continue;
          }
          if (lower === "location" && typeof val === "string") {
            resHeaders[key] = rewriteLocation(val, upstreamBase, proxyOrigin);
            continue;
          }
          resHeaders[key] = val;
        }
        res.writeHead(proxyRes.statusCode ?? 502, resHeaders);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(renderUnavailableHtml(this.device.name, err.message));
      } else {
        res.destroy();
      }
    });
    req.pipe(proxyReq);
  }
  handleUpgrade(req, clientSocket, head) {
    const upstreamBase = this.getUpstreamBaseUrl();
    if (upstreamBase === void 0) {
      clientSocket.destroy();
      return;
    }
    const parsed = parseOriginForm(req.url);
    if (parsed === void 0) {
      clientSocket.destroy();
      return;
    }
    const proxyOrigin = this.proxyOrigin();
    const cookieToken = readCookie(req.headers.cookie, PROXY_COOKIE_NAME);
    if (proxyOrigin === void 0 || cookieToken !== this.token) {
      clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    if (req.headers["sec-fetch-site"] === "cross-site") {
      clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const origin = req.headers.origin;
    if (origin !== void 0 && origin !== proxyOrigin && origin !== this.localOrigin?.()) {
      clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const upstreamUrl = buildUpstreamUrl(upstreamBase, parsed.pathname, stripProxyToken(parsed.search));
    const isHttps = upstreamUrl.protocol === "https:";
    const authority = resolveRemoteAuthority(this.device);
    const authHeaders = this.authManager.getAuthHeaders(this.device);
    const outHeaders = {};
    for (const [key, val] of Object.entries(req.headers)) {
      if (val === void 0) continue;
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "origin") continue;
      outHeaders[key] = val;
    }
    outHeaders["host"] = authority;
    outHeaders["origin"] = authHeaders["Origin"] ?? `${isHttps ? "https" : "http"}://${authority}`;
    if (authHeaders["Cookie"] !== void 0) {
      const existingCookie = typeof outHeaders["cookie"] === "string" ? outHeaders["cookie"] : void 0;
      outHeaders["cookie"] = existingCookie ? `${existingCookie}; ${authHeaders["Cookie"]}` : authHeaders["Cookie"];
    }
    if (authHeaders["Authorization"] !== void 0) {
      outHeaders["authorization"] = authHeaders["Authorization"];
    }
    const reqFn = isHttps ? httpsRequest2 : httpRequest2;
    const rejectUnauthorized = this.device.transport.kind === "direct" ? this.device.transport.rejectUnauthorized !== false : false;
    const proxyReq = reqFn(upstreamUrl, {
      method: "GET",
      headers: outHeaders,
      ...isHttps ? { rejectUnauthorized } : {}
    });
    proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
      let rawResponse = `HTTP/1.1 ${proxyRes.statusCode ?? 101} ${proxyRes.statusMessage ?? "Switching Protocols"}\r
`;
      for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
        const k = proxyRes.rawHeaders[i];
        const v = proxyRes.rawHeaders[i + 1];
        if (k !== void 0 && v !== void 0) {
          rawResponse += `${k}: ${v}\r
`;
        }
      }
      rawResponse += "\r\n";
      clientSocket.write(rawResponse);
      if (proxyHead.byteLength > 0) clientSocket.write(proxyHead);
      if (head.byteLength > 0) proxySocket.write(head);
      proxySocket.pipe(clientSocket).pipe(proxySocket);
      proxySocket.on("error", () => clientSocket.destroy());
      clientSocket.on("error", () => proxySocket.destroy());
    });
    proxyReq.on("response", (proxyRes) => {
      clientSocket.end(`HTTP/1.1 ${proxyRes.statusCode ?? 403} ${proxyRes.statusMessage ?? "Rejected"}\r
Connection: close\r
\r
`);
    });
    proxyReq.on("error", () => {
      clientSocket.destroy();
    });
    proxyReq.end();
  }
};
var NativeProxyManager = class {
  constructor(authManager, localOrigin) {
    this.authManager = authManager;
    this.localOrigin = localOrigin;
  }
  proxies = /* @__PURE__ */ new Map();
  async ensureProxy(device, getUpstreamBaseUrl) {
    let proxy = this.proxies.get(device.id);
    if (proxy === void 0) {
      proxy = new NativeDeviceProxy(device, getUpstreamBaseUrl, this.authManager, this.localOrigin);
      this.proxies.set(device.id, proxy);
      try {
        await proxy.start();
      } catch {
        this.proxies.delete(device.id);
        return void 0;
      }
    } else {
      proxy.updateDevice(device);
    }
    return proxy.proxyUrl();
  }
  proxyUrl(deviceId) {
    return this.proxies.get(deviceId)?.proxyUrl();
  }
  removeProxy(deviceId) {
    const proxy = this.proxies.get(deviceId);
    if (proxy !== void 0) {
      proxy.stop();
      this.proxies.delete(deviceId);
    }
  }
  dispose() {
    for (const proxy of this.proxies.values()) proxy.stop();
    this.proxies.clear();
  }
};
function parseOriginForm(raw) {
  if (typeof raw !== "string" || raw === "") return void 0;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return void 0;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return void 0;
  try {
    const parsed = new URL(raw, "http://native-proxy.invalid");
    if (parsed.origin !== "http://native-proxy.invalid") return void 0;
    return { pathname: parsed.pathname, search: parsed.search };
  } catch {
    return void 0;
  }
}
function buildUpstreamUrl(base, pathname, search) {
  const url = new URL(base);
  url.pathname = pathname;
  url.search = search;
  return url;
}
function stripProxyToken(search) {
  if (search === "") return "";
  const params = new URLSearchParams(search);
  params.delete(PROXY_TOKEN_QUERY);
  const next = params.toString();
  return next === "" ? "" : `?${next}`;
}
function formatPath(pathname, search) {
  return `${pathname}${search}`;
}
function readCookie(header, name2) {
  if (header === void 0) return void 0;
  for (const segment of header.split(";")) {
    const at = segment.indexOf("=");
    if (at === -1) continue;
    if (segment.slice(0, at).trim() !== name2) continue;
    return segment.slice(at + 1).trim();
  }
  return void 0;
}
function rewriteLocation(value, upstreamBase, proxyOrigin) {
  try {
    const upstream = new URL(upstreamBase);
    const location = new URL(value, upstream);
    if (location.origin !== upstream.origin) return value;
    return new URL(`${location.pathname}${location.search}${location.hash}`, proxyOrigin).href;
  } catch {
    return value;
  }
}
function renderUnavailableHtml(deviceName, detail) {
  const safeName = escapeHtml(deviceName);
  const safeDetail = escapeHtml(detail);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${safeName} \u2014 DSH Native Mode</title>
<style>
  body {
    margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #141518; color: #e5e7eb;
  }
  .card {
    max-width: 440px; padding: 24px; border-radius: 12px;
    background: #1e2025; border: 1px solid #2e323b; text-align: center;
  }
  h2 { margin: 0 0 8px; font-size: 16px; font-weight: 600; }
  p { margin: 0 0 16px; font-size: 13px; color: #9ca3af; word-break: break-word; }
  button {
    padding: 7px 16px; border-radius: 8px; border: 1px solid #3b82f6;
    background: #2563eb; color: #fff; font-size: 13px; cursor: pointer;
  }
</style>
</head>
<body>
  <div class="card">
    <h2>${safeName} \u6682\u4E0D\u53EF\u8FBE / Unavailable</h2>
    <p>${safeDetail}</p>
    <button onclick="location.reload()">\u91CD\u8BD5\u8FDE\u63A5 / Retry</button>
  </div>
</body>
</html>`;
}
function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// src/host/remote-client.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import WebSocket from "ws";
var BACKOFF_BASE_MS2 = 600;
var BACKOFF_MAX_MS2 = 12e3;
var RemoteDeviceClient = class {
  constructor(config, authManager, callbacks) {
    this.authManager = authManager;
    this.callbacks = callbacks;
    this.config = config;
    if (!config.enabled) {
      this.state = "disabled";
    }
  }
  config;
  tunnel;
  state = "connecting";
  protocolVersion = "unknown";
  remoteDshVersion;
  remoteHome;
  latencyMs;
  connectedAt;
  lastError;
  reconnectAttempt = 0;
  nativeProxyUrl;
  summaries = [];
  workspaces = [];
  archivedSessionIds = [];
  pinnedSessionIds = [];
  projectionsBySession = /* @__PURE__ */ new Map();
  pendingInteractions = /* @__PURE__ */ new Map();
  discoveredGitPaths = /* @__PURE__ */ new Set();
  gitProbeAttemptedAt = /* @__PURE__ */ new Map();
  remoteEventsClientId;
  muxSocket;
  muxStreams = /* @__PURE__ */ new Map();
  running = false;
  loopAbort;
  get id() {
    return this.config.id;
  }
  get deviceConfig() {
    return this.config;
  }
  setNativeProxyUrl(url) {
    this.nativeProxyUrl = url;
  }
  effectiveBaseUrl() {
    if (this.config.transport.kind === "ssh") {
      return this.tunnel?.baseUrl();
    }
    return this.config.transport.baseUrl.replace(/\/+$/, "");
  }
  targetSummary() {
    const t = this.config.transport;
    if (t.kind === "ssh") {
      const userPrefix = t.username ? `${t.username}@` : "";
      const portSuffix = t.port && t.port !== 22 ? `:${t.port}` : "";
      const remotePort = t.remotePort ?? 3080;
      return `ssh://${userPrefix}${t.host}${portSuffix} \u2192 127.0.0.1:${remotePort}`;
    }
    return t.baseUrl;
  }
  toView() {
    const runningCount = this.summaries.filter((s) => s.running).length;
    return {
      id: this.config.id,
      name: this.config.name,
      ...this.config.label !== void 0 ? { label: this.config.label } : {},
      enabled: this.config.enabled,
      state: this.state,
      transportKind: this.config.transport.kind,
      ...this.config.transport.kind === "ssh" ? {
        ssh: {
          host: this.config.transport.host,
          ...this.config.transport.port !== void 0 ? { port: this.config.transport.port } : {},
          ...this.config.transport.username !== void 0 ? { username: this.config.transport.username } : {},
          ...this.config.transport.privateKeyPath !== void 0 ? { privateKeyPath: this.config.transport.privateKeyPath } : {},
          ...this.config.transport.proxyJump !== void 0 ? { proxyJump: this.config.transport.proxyJump } : {},
          ...this.config.transport.remotePort !== void 0 ? { remotePort: this.config.transport.remotePort } : {},
          ...this.config.transport.engine !== void 0 ? { engine: this.config.transport.engine } : {}
        }
      } : {},
      targetSummary: this.targetSummary(),
      ...this.effectiveBaseUrl() !== void 0 ? { effectiveBaseUrl: this.effectiveBaseUrl() } : {},
      ...this.nativeProxyUrl !== void 0 ? { nativeProxyUrl: this.nativeProxyUrl } : {},
      keepNativeAlive: this.config.keepNativeAlive !== false,
      protocolVersion: this.protocolVersion,
      ...this.remoteDshVersion !== void 0 ? { remoteDshVersion: this.remoteDshVersion } : {},
      ...this.remoteHome !== void 0 ? { remoteHome: this.remoteHome } : {},
      ...this.latencyMs !== void 0 ? { latencyMs: this.latencyMs } : {},
      ...this.connectedAt !== void 0 ? { connectedAt: this.connectedAt } : {},
      ...this.lastError !== void 0 ? { lastError: this.lastError } : {},
      reconnectAttempt: this.reconnectAttempt,
      sessionCount: this.summaries.length,
      runningSessionCount: runningCount,
      pendingApprovalCount: this.pendingInteractions.size,
      workspaceCount: this.workspaces.length
    };
  }
  sessionSummaries() {
    return this.summaries;
  }
  workspaceItems() {
    return this.workspaces;
  }
  archivedIds() {
    return this.archivedSessionIds;
  }
  pinnedIds() {
    return this.pinnedSessionIds;
  }
  controlProjections() {
    return this.projectionsBySession;
  }
  pendingInteractionList() {
    return [...this.pendingInteractions.values()];
  }
  start() {
    if (!this.config.enabled) {
      this.state = "disabled";
      this.callbacks.onStateChanged(this.id);
      return;
    }
    if (this.running) return;
    this.running = true;
    this.loopAbort = new AbortController();
    void this.superviseLoop(this.loopAbort.signal);
  }
  stop() {
    this.running = false;
    this.loopAbort?.abort();
    this.loopAbort = void 0;
    this.closeMuxSocket();
    this.tunnel?.stop();
    this.tunnel = void 0;
    this.state = this.config.enabled ? "error" : "disabled";
    this.callbacks.onStateChanged(this.id);
  }
  updateConfig(next) {
    const wasRunning = this.running;
    if (wasRunning) this.stop();
    this.config = next;
    if (next.enabled) {
      this.start();
    } else {
      this.state = "disabled";
      this.callbacks.onStateChanged(this.id);
    }
  }
  reconnectNow() {
    if (!this.config.enabled) return;
    this.stop();
    this.reconnectAttempt = 0;
    this.start();
  }
  // ==========================================================================
  // Public Remote RPC & Stream Operations (called by AggregatedGateway)
  // ==========================================================================
  /**
   * Invoke a DSH 0.2 unary endpoint (`<namespace>/<method>`) on the remote device,
   * automatically adapting to DSH 0.1 if the remote runs 0.1.x.
   */
  async invokeUnary(namespace, method, args, signal) {
    if (this.protocolVersion === "0.1") {
      return this.invokeLegacy01(namespace, method, args, signal);
    }
    const endpoint = `${namespace}/${method}`;
    const response = await this.rawRpcPost(endpoint, { args }, signal);
    if (!response.ok) {
      const err = new Error(response.error.message);
      err.name = "RemoteError";
      err.code = response.error.code;
      err.details = response.error.details ?? {};
      err.isDSHRemoteError = true;
      throw err;
    }
    return response.value;
  }
  /**
   * Open a logical stream (`session/follow`, etc.) over the remote device's `/api/remote.mux`.
   */
  async *openStream(endpoint, args, signal) {
    if (this.protocolVersion === "0.1" && endpoint === "session/follow") {
      yield* this.openLegacy01SessionFollow(args, signal);
      return;
    }
    const socket = this.muxSocket;
    if (socket === void 0 || socket.readyState !== WebSocket.OPEN) {
      throw new Error(`Device "${this.config.name}" stream socket is not connected`);
    }
    const streamId = randomUUID3();
    const queue = [];
    let wake;
    this.muxStreams.set(streamId, {
      push: (frame) => {
        queue.push(frame);
        const w = wake;
        wake = void 0;
        w?.();
      }
    });
    const onAbort = () => {
      const w = wake;
      wake = void 0;
      w?.();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      socket.send(
        JSON.stringify({
          type: "open",
          streamId,
          endpoint,
          payload: { args }
        })
      );
      while (!signal.aborted) {
        const frame = queue.shift();
        if (frame === void 0) {
          await new Promise((r) => {
            wake = r;
          });
          continue;
        }
        if (frame.type === "item") {
          yield frame.value;
          continue;
        }
        if (frame.type === "error") {
          const err = new Error(frame.error.message);
          err.name = "RemoteError";
          err.code = frame.error.code;
          err.details = frame.error.details ?? {};
          err.isDSHRemoteError = true;
          throw err;
        }
        return;
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
      this.muxStreams.delete(streamId);
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: "cancel", streamId }));
        } catch {
        }
      }
    }
  }
  /**
   * Deliver the user's answer for a remote `$events` waterfall (`approval/request` or `user-questions/request`).
   */
  async respondWaterfall(remoteEventId, outcome, signal) {
    this.pendingInteractions.delete(remoteEventId);
    this.callbacks.onStateChanged(this.id);
    if (this.protocolVersion === "0.1") {
      const value = outcome.kind === "result" ? outcome.value : void 0;
      const res2 = await this.rawRpcPost(
        "respond",
        {
          type: "client-response",
          rpcId: remoteEventId,
          result: { ok: outcome.kind === "result", value }
        },
        signal,
        "respond"
      );
      return { ok: res2.ok, ...res2.ok ? {} : { error: res2.error.message } };
    }
    if (this.remoteEventsClientId === void 0) {
      return { ok: false, error: "Remote $events stream is not active" };
    }
    const res = await this.rawRpcPost(
      "$events/result",
      {
        args: {
          clientId: this.remoteEventsClientId,
          eventId: remoteEventId,
          outcome
        }
      },
      signal
    );
    return { ok: res.ok, ...res.ok ? {} : { error: res.error.message } };
  }
  // ==========================================================================
  // Internal Connection & Stream Supervision Loop
  // ==========================================================================
  async superviseLoop(outerSignal) {
    while (this.running && !outerSignal.aborted) {
      const iterAbort = new AbortController();
      const signal = AbortSignal.any([outerSignal, iterAbort.signal]);
      try {
        this.state = this.reconnectAttempt === 0 ? "connecting" : "reconnecting";
        this.callbacks.onStateChanged(this.id);
        const baseUrl = await this.ensureTransportUp(signal);
        if (baseUrl === void 0) {
          throw new Error(this.tunnel?.status().error ?? "Transport endpoint unavailable");
        }
        const authRes = await this.authManager.ensureAuthenticated(this.config, baseUrl);
        if (!authRes.ok) {
          throw new Error(authRes.error);
        }
        const t0 = Date.now();
        const probed = await this.handshakeAndLoadInitial(baseUrl, signal);
        this.latencyMs = Date.now() - t0;
        this.protocolVersion = probed.protocolVersion;
        if (probed.remoteDshVersion !== void 0) {
          this.remoteDshVersion = probed.remoteDshVersion;
        }
        this.state = "connected";
        this.connectedAt = Date.now();
        this.lastError = void 0;
        this.reconnectAttempt = 0;
        this.callbacks.onStateChanged(this.id);
        if (this.protocolVersion === "0.2") {
          await this.runProtocol02Streams(baseUrl, signal);
        } else {
          await this.runProtocol01Polling(baseUrl, signal);
        }
      } catch (error) {
        if (outerSignal.aborted || !this.running) return;
        this.lastError = error instanceof Error ? error.message : String(error);
        this.state = "error";
        this.closeMuxSocket();
        this.callbacks.onStateChanged(this.id);
      } finally {
        iterAbort.abort();
        this.closeMuxSocket();
      }
      if (!this.running || outerSignal.aborted) return;
      const delay = Math.min(BACKOFF_MAX_MS2, BACKOFF_BASE_MS2 * 2 ** this.reconnectAttempt);
      this.reconnectAttempt += 1;
      await sleepWithSignal(delay + Math.floor(Math.random() * 250), outerSignal);
    }
  }
  async ensureTransportUp(signal) {
    if (this.config.transport.kind === "direct") {
      return this.config.transport.baseUrl.replace(/\/+$/, "");
    }
    if (this.tunnel === void 0) {
      this.tunnel = new SshTunnel(this.config.transport, () => {
        this.callbacks.onStateChanged(this.id);
      });
      await this.tunnel.start();
    }
    const base = this.tunnel.baseUrl();
    if (base !== void 0) return base;
    for (let i = 0; i < 20 && !signal.aborted; i++) {
      const current = this.tunnel.baseUrl();
      if (current !== void 0) return current;
      if (this.tunnel.status().state === "error") break;
      await sleepWithSignal(250, signal);
    }
    return this.tunnel.baseUrl();
  }
  async handshakeAndLoadInitial(baseUrl, signal) {
    let res02 = await this.rawRpcPost("session/list", { args: { _request: {} } }, signal);
    if (!res02.ok && res02.httpStatus === 401) {
      await this.authManager.ensureAuthenticated(this.config, baseUrl, true);
      res02 = await this.rawRpcPost("session/list", { args: { _request: {} } }, signal);
    }
    if (res02.ok && isRecord2(res02.value) && Array.isArray(res02.value.items)) {
      this.summaries = res02.value.items;
      return { protocolVersion: "0.2", remoteDshVersion: "0.2.x" };
    }
    const res01 = await this.rawRpcPost("host.describe", {}, signal, "host.describe");
    if (res01.ok && isRecord2(res01.value)) {
      const version = typeof res01.value.version === "string" ? res01.value.version : "0.1.x";
      if (typeof res01.value.cwd === "string") {
        this.remoteHome = res01.value.cwd;
      }
      await this.refreshLegacy01Lists(signal);
      return { protocolVersion: "0.1", remoteDshVersion: version };
    }
    throw new Error(res02.ok ? "Unrecognized DSH /api response" : res02.error.message);
  }
  async runProtocol02Streams(baseUrl, signal) {
    const wsUrl = new URL("/api/remote.mux", baseUrl);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    const headers = this.authManager.getAuthHeaders(this.config);
    const socket = new WebSocket(wsUrl.href, {
      headers,
      rejectUnauthorized: this.config.transport.kind === "direct" ? this.config.transport.rejectUnauthorized !== false : false
    });
    this.muxSocket = socket;
    await new Promise((resolve3, reject) => {
      const onOpen = () => {
        cleanup();
        resolve3();
      };
      const onErr = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        socket.off("open", onOpen);
        socket.off("error", onErr);
      };
      socket.once("open", onOpen);
      socket.once("error", onErr);
    });
    socket.on("message", (data) => {
      try {
        const frame = JSON.parse(data.toString("utf8"));
        const handler = this.muxStreams.get(frame.streamId);
        if (handler === void 0) return;
        if (frame.type === "item") handler.push({ type: "item", value: frame.value });
        else if (frame.type === "end") handler.push({ type: "end" });
        else if (frame.type === "error" && frame.error) handler.push({ type: "error", error: frame.error });
      } catch {
      }
    });
    const closed = new Promise((_, reject) => {
      socket.once("close", (code, reason) => {
        reject(new Error(`Remote stream WebSocket closed (${String(code)} ${reason.toString()})`));
      });
      socket.once("error", (err) => reject(err));
    });
    await Promise.race([
      closed,
      Promise.all([
        this.pump02RemoteEvents(signal),
        this.pump02WorkspaceFollow(signal),
        this.pump02SessionControl(signal)
      ])
    ]);
  }
  async pump02RemoteEvents(signal) {
    for await (const item of this.openStream("$events", {}, signal)) {
      if (!isRecord2(item) || typeof item.type !== "string") continue;
      if (item.type === "ready") {
        if (typeof item.clientId === "string") {
          this.remoteEventsClientId = item.clientId;
        }
        if (isRecord2(item.host) && typeof item.host.home === "string") {
          this.remoteHome = item.host.home;
          this.callbacks.onStateChanged(this.id);
        }
        continue;
      }
      if (item.type === "emit" && typeof item.event === "string" && Array.isArray(item.args)) {
        this.handle02EmitEvent(item.event, item.args);
        continue;
      }
      if (item.type === "waterfall" && typeof item.event === "string" && typeof item.eventId === "string" && typeof item.agentId === "string" && isRecord2(item.request)) {
        const namespacedSessionId = encodeRemoteSessionId(this.id, item.agentId);
        const namespacedEventId = encodeRemoteEventId(this.id, item.eventId);
        if (item.event === "approval/request" || item.event === "user-questions/request") {
          this.pendingInteractions.set(item.eventId, {
            eventId: item.eventId,
            namespacedEventId,
            deviceId: this.id,
            rawSessionId: item.agentId,
            namespacedSessionId,
            kind: item.event === "approval/request" ? "approval" : "question",
            eventName: item.event,
            request: item.request
          });
          this.callbacks.onStateChanged(this.id);
        }
        this.callbacks.onRemoteEventFrame(this.id, {
          type: "waterfall",
          event: item.event,
          eventId: namespacedEventId,
          agentId: namespacedSessionId,
          request: item.request
        });
        continue;
      }
      if (item.type === "cancel" && typeof item.eventId === "string") {
        this.pendingInteractions.delete(item.eventId);
        this.callbacks.onStateChanged(this.id);
        this.callbacks.onRemoteEventFrame(this.id, {
          type: "cancel",
          eventId: encodeRemoteEventId(this.id, item.eventId)
        });
      }
    }
  }
  handle02EmitEvent(event, args) {
    switch (event) {
      case "api-session/added": {
        const raw = args[0];
        if (isRecord2(raw) && typeof raw.sessionId === "string") {
          const summary = raw;
          const idx = this.summaries.findIndex((s) => s.sessionId === summary.sessionId);
          if (idx === -1) this.summaries = [summary, ...this.summaries];
          else this.summaries = this.summaries.map((s, i) => i === idx ? summary : s);
          this.callbacks.onStateChanged(this.id);
          this.callbacks.onWorkspacesChanged(this.id);
          this.callbacks.onRemoteEventFrame(this.id, {
            type: "emit",
            event,
            args: [this.namespaceSummary(summary)]
          });
        }
        break;
      }
      case "api-session/removed": {
        const sessionId = args[0];
        if (typeof sessionId === "string") {
          this.summaries = this.summaries.filter((s) => s.sessionId !== sessionId);
          this.projectionsBySession.delete(sessionId);
          this.callbacks.onStateChanged(this.id);
          this.callbacks.onWorkspacesChanged(this.id);
          this.callbacks.onRemoteEventFrame(this.id, {
            type: "emit",
            event,
            args: [encodeRemoteSessionId(this.id, sessionId)]
          });
        }
        break;
      }
      case "api-session/status": {
        const [sessionId, running] = args;
        if (typeof sessionId === "string" && typeof running === "boolean") {
          this.summaries = this.summaries.map(
            (s) => s.sessionId === sessionId ? { ...s, running, agentAvailable: true } : s
          );
          this.callbacks.onStateChanged(this.id);
          this.callbacks.onRemoteEventFrame(this.id, {
            type: "emit",
            event,
            args: [encodeRemoteSessionId(this.id, sessionId), running]
          });
        }
        break;
      }
      case "api-session/activity": {
        const [sessionId, updatedAt] = args;
        if (typeof sessionId === "string" && typeof updatedAt === "number") {
          this.summaries = this.summaries.map(
            (s) => s.sessionId === sessionId && updatedAt > s.updatedAt ? { ...s, updatedAt } : s
          );
          this.callbacks.onWorkspacesChanged(this.id);
          this.callbacks.onRemoteEventFrame(this.id, {
            type: "emit",
            event,
            args: [encodeRemoteSessionId(this.id, sessionId), updatedAt]
          });
        }
        break;
      }
      case "api-session/error": {
        const [sessionId, message] = args;
        if (typeof sessionId === "string" && typeof message === "string") {
          this.callbacks.onRemoteEventFrame(this.id, {
            type: "emit",
            event,
            args: [encodeRemoteSessionId(this.id, sessionId), message]
          });
        }
        break;
      }
      default:
        break;
    }
  }
  async pump02WorkspaceFollow(signal) {
    for await (const frame of this.openStream("workspace/follow", {}, signal)) {
      if (!isRecord2(frame) || typeof frame.type !== "string") continue;
      if (frame.type === "baseline" && isRecord2(frame.value)) {
        const val = frame.value;
        this.workspaces = Array.isArray(val.items) ? val.items : [];
        this.archivedSessionIds = Array.isArray(val.archivedSessionIds) ? val.archivedSessionIds : [];
        this.pinnedSessionIds = Array.isArray(val.pinnedSessionIds) ? val.pinnedSessionIds : [];
        this.callbacks.onStateChanged(this.id);
        this.callbacks.onWorkspacesChanged(this.id);
        void this.probeNewWorkspaceGitRemotes();
        continue;
      }
      if (frame.type === "upsert" && isRecord2(frame.workspace)) {
        const ws = frame.workspace;
        const idx = this.workspaces.findIndex((w) => w.workspaceId === ws.workspaceId);
        if (idx === -1) this.workspaces = [ws, ...this.workspaces];
        else this.workspaces = this.workspaces.map((w, i) => i === idx ? ws : w);
        this.callbacks.onWorkspacesChanged(this.id);
        void this.probeNewWorkspaceGitRemotes();
      } else if (frame.type === "remove" && typeof frame.workspaceId === "string") {
        this.workspaces = this.workspaces.filter((w) => w.workspaceId !== frame.workspaceId);
        this.callbacks.onWorkspacesChanged(this.id);
      } else if (frame.type === "order" && Array.isArray(frame.workspaceIds)) {
        const rank = new Map(frame.workspaceIds.map((id, i) => [id, i]));
        this.workspaces = [...this.workspaces].sort(
          (a, b) => (rank.get(a.workspaceId) ?? 9999) - (rank.get(b.workspaceId) ?? 9999)
        );
        this.callbacks.onWorkspacesChanged(this.id);
      } else if (frame.type === "archived" && Array.isArray(frame.archivedSessionIds)) {
        this.archivedSessionIds = frame.archivedSessionIds;
        this.callbacks.onWorkspacesChanged(this.id);
      } else if (frame.type === "pinned" && Array.isArray(frame.pinnedSessionIds)) {
        this.pinnedSessionIds = frame.pinnedSessionIds;
        this.callbacks.onWorkspacesChanged(this.id);
      }
    }
  }
  async pump02SessionControl(signal) {
    for await (const frame of this.openStream("session/control", {}, signal)) {
      if (!isRecord2(frame) || typeof frame.type !== "string") continue;
      if (frame.type === "baseline" && isRecord2(frame.value) && isRecord2(frame.value.projections)) {
        this.projectionsBySession.clear();
        for (const [sid, block] of Object.entries(frame.value.projections)) {
          if (isRecord2(block) && typeof block.asOfSeq === "number" && isRecord2(block.values)) {
            this.projectionsBySession.set(sid, {
              asOfSeq: block.asOfSeq,
              values: block.values
            });
            for (const [key, value] of Object.entries(block.values)) {
              this.callbacks.onControlProjectionFrame(this.id, {
                sessionId: encodeRemoteSessionId(this.id, sid),
                key,
                value,
                seq: Math.max(0, block.asOfSeq)
              });
            }
          }
        }
        continue;
      }
      if (frame.type === "projection" && typeof frame.sessionId === "string" && typeof frame.key === "string" && typeof frame.seq === "number") {
        const existing = this.projectionsBySession.get(frame.sessionId) ?? { asOfSeq: frame.seq, values: {} };
        existing.values[frame.key] = frame.value;
        existing.asOfSeq = Math.max(existing.asOfSeq, frame.seq);
        this.projectionsBySession.set(frame.sessionId, existing);
        this.callbacks.onControlProjectionFrame(this.id, {
          sessionId: encodeRemoteSessionId(this.id, frame.sessionId),
          key: frame.key,
          value: frame.value,
          seq: frame.seq
        });
      }
    }
  }
  async probeNewWorkspaceGitRemotes() {
    if (this.config.transport.kind !== "ssh") return;
    const now = Date.now();
    const pendingPaths = this.workspaces.map((w) => w.path).filter((p) => p && !this.discoveredGitPaths.has(p)).filter((p) => now - (this.gitProbeAttemptedAt.get(p) ?? 0) >= 6e4);
    if (pendingPaths.length === 0) return;
    for (const p of pendingPaths) this.gitProbeAttemptedAt.set(p, now);
    const discovered = await discoverRemoteGitRemotesViaSsh(this.config.transport, pendingPaths);
    for (const path of discovered.keys()) this.discoveredGitPaths.add(path);
    if (discovered.size > 0) {
      this.callbacks.onGitRemotesDiscovered(this.id, discovered);
      this.callbacks.onWorkspacesChanged(this.id);
    }
  }
  // ==========================================================================
  // DSH 0.1.x Compatibility Layer
  // ==========================================================================
  async refreshLegacy01Lists(signal) {
    const sRes = await this.rawRpcPost("session.list", {}, signal, "session.list");
    if (sRes.ok && isRecord2(sRes.value) && Array.isArray(sRes.value.items)) {
      this.summaries = sRes.value.items.map((item) => ({
        sessionId: String(item.sessionId ?? ""),
        updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
        agentAvailable: true,
        running: Boolean(item.running),
        blank: Boolean(item.blank),
        ...typeof item.parentSessionId === "string" ? { parentSessionId: item.parentSessionId } : {},
        ...typeof item.cwd === "string" ? { cwd: item.cwd } : {},
        ...isRecord2(item.projections) ? {
          projections: {
            kind: "cached",
            asOfSeq: typeof item.projections.asOfSeq === "number" ? item.projections.asOfSeq : 0,
            values: isRecord2(item.projections.values) ? item.projections.values : {}
          }
        } : {}
      }));
    }
    const wRes = await this.rawRpcPost("workspace.list", {}, signal, "workspace.list");
    if (wRes.ok && isRecord2(wRes.value) && Array.isArray(wRes.value.items)) {
      this.workspaces = wRes.value.items;
      if (Array.isArray(wRes.value.archivedSessionIds)) {
        this.archivedSessionIds = wRes.value.archivedSessionIds;
      }
      this.callbacks.onWorkspacesChanged(this.id);
      void this.probeNewWorkspaceGitRemotes();
    }
  }
  async runProtocol01Polling(baseUrl, signal) {
    while (!signal.aborted && this.running) {
      await sleepWithSignal(3e3, signal);
      if (signal.aborted) return;
      const probe = await this.rawRpcPost("host.describe", {}, signal, "host.describe");
      if (!probe.ok) throw new Error(probe.error.message);
      await this.refreshLegacy01Lists(signal);
    }
  }
  async invokeLegacy01(namespace, method, args, signal) {
    const req = args.request ?? args._request ?? args;
    const wireMethod = `${namespace}.${method}`;
    const res = await this.rawRpcPost(wireMethod, req, signal, wireMethod);
    if (!res.ok) {
      throw new Error(res.error.message);
    }
    return res.value;
  }
  async *openLegacy01SessionFollow(args, signal) {
    const req = args.request ?? {};
    const sessionId = req.address?.sessionId ?? "";
    const res = await this.rawRpcPost(
      "session.history",
      { sessionId, ...req.maxMessages !== void 0 ? { maxMessages: req.maxMessages } : {} },
      signal,
      "session.history"
    );
    const records = res.ok && isRecord2(res.value) && Array.isArray(res.value.events) ? res.value.events : [];
    const lastSeq = records.length > 0 && isRecord2(records.at(-1)) && isRecord2(records.at(-1).event) ? Number(records.at(-1).event.seq ?? -1) : -1;
    yield {
      type: "snapshot",
      header: { version: 2, id: sessionId, createdAt: Date.now(), isSeeded: false },
      cursor: lastSeq,
      records,
      hasMore: false,
      projections: { asOfSeq: lastSeq, values: {} },
      assistantStream: { revision: 0 }
    };
    await new Promise((resolve3) => {
      signal.addEventListener("abort", () => resolve3(), { once: true });
    });
  }
  // ==========================================================================
  // Helpers
  // ==========================================================================
  namespaceSummary(summary) {
    return {
      ...summary,
      sessionId: encodeRemoteSessionId(this.id, summary.sessionId),
      ...summary.parentSessionId !== void 0 ? { parentSessionId: encodeRemoteSessionId(this.id, summary.parentSessionId) } : {}
    };
  }
  closeMuxSocket() {
    const socket = this.muxSocket;
    this.muxSocket = void 0;
    this.remoteEventsClientId = void 0;
    for (const stream of this.muxStreams.values()) {
      stream.push({
        type: "error",
        error: { code: "gateway/cancelled", message: "Remote connection closed", details: {} }
      });
    }
    this.muxStreams.clear();
    if (socket !== void 0) {
      socket.removeAllListeners();
      try {
        socket.close();
      } catch {
      }
    }
  }
  async rawRpcPost(endpointPath, payload, signal, methodField = endpointPath) {
    const baseUrl = this.effectiveBaseUrl();
    if (baseUrl === void 0) {
      return {
        ok: false,
        httpStatus: 503,
        error: { code: "gateway/service-unavailable", message: `Device "${this.config.name}" is not connected` }
      };
    }
    const rpcId = randomUUID3();
    const url = new URL(`/api/${endpointPath}`, baseUrl);
    const headers = {
      ...this.authManager.getAuthHeaders(this.config),
      "content-type": "application/json"
    };
    try {
      const response = await requestRemote(url.href, {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "client-request",
          rpcId,
          method: methodField,
          payload
        }),
        ...signal !== void 0 ? { signal } : {},
        rejectUnauthorized: this.config.transport.kind === "direct" ? this.config.transport.rejectUnauthorized !== false : true
      });
      if (response.status < 200 || response.status >= 300) {
        const text = response.body.toString("utf8").slice(0, 200);
        return {
          ok: false,
          httpStatus: response.status,
          error: {
            code: response.status === 401 ? "unauthorized" : "transport",
            message: `HTTP ${String(response.status)}: ${text || response.statusText}`
          }
        };
      }
      const contentType = headerValue(response.headers, "content-type") ?? "";
      if (contentType.includes("multipart/form-data")) {
        const formData = await responseAsFetchResponse(response).formData();
        const metaRaw = formData.get("metadata");
        if (typeof metaRaw === "string") {
          const parsed = JSON.parse(metaRaw);
          if (parsed.result.ok) {
            return { ok: true, value: parsed.result.value, httpStatus: 200 };
          }
        }
      }
      const body = JSON.parse(response.body.toString("utf8"));
      if (body?.result?.ok === true) {
        return { ok: true, value: body.result.value, httpStatus: 200 };
      }
      if (body?.result?.ok === false && body.result.error) {
        return { ok: false, httpStatus: 200, error: body.result.error };
      }
      return {
        ok: false,
        httpStatus: 502,
        error: { code: "gateway/protocol", message: "Invalid RPC envelope from remote DSH" }
      };
    } catch (error) {
      return {
        ok: false,
        httpStatus: 0,
        error: {
          code: "transport",
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
};
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function sleepWithSignal(ms, signal) {
  return new Promise((resolve3) => {
    if (signal.aborted) {
      resolve3();
      return;
    }
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve3();
    }
  });
}

// src/host/registry.ts
function sanitizeDeviceConfig(config) {
  return {
    ...config,
    auth: {
      mode: config.auth?.mode ?? "auto"
    },
    transport: config.transport.kind === "ssh" ? {
      ...config.transport,
      passphrase: void 0
    } : config.transport
  };
}
var DeviceRegistry = class {
  constructor(dataFilePath, secretsFilePath, localHost, options = {}) {
    this.dataFilePath = dataFilePath;
    this.localHost = localHost;
    this.options = options;
    this.authManager = new DeviceAuthManager(secretsFilePath);
    this.nativeProxyManager = new NativeProxyManager(this.authManager, options.localOrigin);
    this.aggregator = new WorkspaceAggregator();
    this.nativeProxyActive = options.enableNativeProxy !== false;
    this.loadFromDisk();
  }
  authManager;
  nativeProxyManager;
  aggregator;
  configs = /* @__PURE__ */ new Map();
  clients = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  eventListeners = /* @__PURE__ */ new Set();
  projectionListeners = /* @__PURE__ */ new Set();
  workspaceListeners = /* @__PURE__ */ new Set();
  revision = 1;
  aggregatedGatewayActive = false;
  aggregatedGatewayError;
  nativeProxyActive = true;
  setGatewayStatus(active, error) {
    this.aggregatedGatewayActive = active;
    this.aggregatedGatewayError = error;
    this.bumpRevision();
  }
  onSnapshotChanged(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onRemoteEvent(listener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
  onControlProjection(listener) {
    this.projectionListeners.add(listener);
    return () => this.projectionListeners.delete(listener);
  }
  onWorkspacesChanged(listener) {
    this.workspaceListeners.add(listener);
    return () => this.workspaceListeners.delete(listener);
  }
  startAll() {
    for (const config of this.configs.values()) {
      void this.mountClient(config);
    }
  }
  dispose() {
    for (const client of this.clients.values()) {
      client.stop();
    }
    this.clients.clear();
    this.nativeProxyManager.dispose();
  }
  client(deviceId) {
    return this.clients.get(deviceId);
  }
  clientList() {
    return [...this.clients.values()];
  }
  deviceConfig(deviceId) {
    return this.configs.get(deviceId);
  }
  /** Add or update a device configuration, preventing self-loops. */
  async upsertDevice(input) {
    const name2 = input.name.trim();
    if (name2 === "") return { ok: false, error: "Device name must not be empty" };
    if (this.isSelfLoop(input.transport)) {
      return {
        ok: false,
        error: "Self-loop rejected: the target points to this local DSH host itself"
      };
    }
    if (input.transport.kind === "ssh" && this.options.enableTunnels === false) {
      return { ok: false, error: "SSH tunnels are disabled in plugin configuration" };
    }
    if (input.transport.kind === "direct" && this.options.allowDirectTransport !== true) {
      return {
        ok: false,
        error: "HTTP(S) direct transport is disabled; add the device over SSH"
      };
    }
    const id = input.id ? DeviceId(input.id.trim()) : DeviceId(`dev-${randomUUID4().slice(0, 8)}`);
    if (id === LOCAL_DEVICE_ID) {
      return { ok: false, error: '"local" is a reserved device ID' };
    }
    const config = {
      id,
      name: name2,
      ...input.label !== void 0 && input.label.trim() !== "" ? { label: input.label.trim() } : {},
      enabled: input.enabled !== false,
      transport: input.transport,
      auth: input.auth ?? { mode: "auto" },
      keepNativeAlive: input.keepNativeAlive !== false
    };
    if (input.auth?.credential !== void 0) {
      this.authManager.setAuthCredential(id, input.auth.credential);
    }
    if (input.transport.kind === "ssh" && input.transport.passphrase !== void 0) {
      this.authManager.setSshPassphrase(id, input.transport.passphrase);
    }
    const sanitized = sanitizeDeviceConfig(config);
    this.configs.set(id, sanitized);
    this.saveToDisk();
    const client = await this.mountClient(sanitized);
    this.bumpRevision();
    this.notifyWorkspacesChanged();
    return { ok: true, device: client.toView() };
  }
  removeDevice(deviceId) {
    const existing = this.configs.get(deviceId);
    if (existing === void 0) return false;
    this.configs.delete(deviceId);
    const client = this.clients.get(deviceId);
    if (client !== void 0) {
      client.stop();
      this.clients.delete(deviceId);
    }
    this.nativeProxyManager.removeProxy(deviceId);
    this.authManager.removeDevice(deviceId);
    this.saveToDisk();
    this.bumpRevision();
    this.notifyWorkspacesChanged();
    return true;
  }
  reconnectDevice(deviceId) {
    const client = this.clients.get(deviceId);
    if (client === void 0) return false;
    client.reconnectNow();
    return true;
  }
  /** List local private-key candidates for the add/edit device form. */
  listSshKeys() {
    return listLocalSshKeys();
  }
  /**
   * Create a Session directly on an explicitly chosen remote device. The
   * returned ID is namespaced exactly like a Session discovered by polling, so
   * the official Session view can open it immediately.
   */
  async createRemoteSession(input) {
    const client = this.clients.get(input.deviceId);
    if (client === void 0) return { ok: false, error: "Device is not configured" };
    try {
      const created = await client.invokeUnary("session", "create", {
        request: {
          ...input.workspaceId !== void 0 ? { workspaceId: input.workspaceId } : {},
          ...input.cwd !== void 0 ? { cwd: input.cwd } : {},
          ...input.agentPreset !== void 0 ? { agentPreset: input.agentPreset } : {}
        }
      });
      this.bumpRevision();
      this.notifyWorkspacesChanged();
      return {
        ok: true,
        sessionId: encodeRemoteSessionId(input.deviceId, created.sessionId),
        ...created.agentPreset !== void 0 ? { agentPreset: created.agentPreset } : {}
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /** Register one folder as a Workspace on a remote device. */
  async createRemoteWorkspace(input) {
    const client = this.clients.get(input.deviceId);
    if (client === void 0) return { ok: false, error: "Device is not configured" };
    try {
      const created = await client.invokeUnary("workspace", "create", {
        request: { path: input.path }
      });
      this.bumpRevision();
      this.notifyWorkspacesChanged();
      return { ok: true, workspace: created };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  /** Test reachability & authentication of a candidate device without saving it. */
  async testDeviceConnection(input) {
    if (this.isSelfLoop(input.transport)) {
      return { ok: false, error: "Self-loop rejected: target points to this local DSH host" };
    }
    if (input.transport.kind === "direct" && this.options.allowDirectTransport !== true) {
      return {
        ok: false,
        error: "HTTP(S) direct transport is disabled; add the device over SSH"
      };
    }
    let baseUrl;
    let cleanup;
    if (input.transport.kind === "ssh") {
      const probed = await probeSshTunnel(input.transport);
      if (!probed.ok) return probed;
      baseUrl = probed.baseUrl;
      cleanup = probed.close;
    } else {
      baseUrl = input.transport.baseUrl.replace(/\/+$/, "");
    }
    const tempConfig = {
      id: DeviceId("probe-temp"),
      name: input.name || "probe",
      enabled: true,
      transport: input.transport,
      auth: input.auth ?? { mode: "auto" }
    };
    try {
      const t0 = Date.now();
      const authRes = await this.authManager.ensureAuthenticated(tempConfig, baseUrl, true);
      if (!authRes.ok) return authRes;
      const headers = {
        ...this.authManager.getAuthHeaders(tempConfig),
        "content-type": "application/json"
      };
      const res02 = await requestRemote(new URL("/api/session/list", baseUrl).href, {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "client-request",
          rpcId: randomUUID4(),
          method: "session/list",
          payload: { args: { _request: {} } }
        }),
        timeoutMs: 15e3
      }).catch(() => void 0);
      if (res02 !== void 0 && res02.status >= 200 && res02.status < 300) {
        return {
          ok: true,
          protocolVersion: "0.2",
          remoteDshVersion: "0.2.x",
          latencyMs: Date.now() - t0
        };
      }
      const res01 = await requestRemote(new URL("/api/host.describe", baseUrl).href, {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "client-request",
          rpcId: randomUUID4(),
          method: "host.describe",
          payload: {}
        }),
        timeoutMs: 15e3
      }).catch(() => void 0);
      if (res01 !== void 0 && res01.status >= 200 && res01.status < 300) {
        let body = {};
        try {
          body = JSON.parse(res01.body.toString("utf8"));
        } catch {
        }
        return {
          ok: true,
          protocolVersion: "0.1",
          remoteDshVersion: body.result?.value?.version ?? "0.1.x",
          latencyMs: Date.now() - t0
        };
      }
      return {
        ok: false,
        error: res02 ? `Remote DSH answered HTTP ${String(res02.status)} (check authentication token or DSH port)` : "Could not reach remote DSH HTTP endpoint over the connection"
      };
    } finally {
      this.authManager.removeDevice(tempConfig.id);
      cleanup?.();
    }
  }
  updateAggregationConfig(patch) {
    const updated = this.aggregator.setConfig(patch);
    this.saveToDisk();
    this.bumpRevision();
    this.notifyWorkspacesChanged();
    return updated;
  }
  /** Build the complete snapshot for the Client UI and Aggregated Gateway. */
  snapshot() {
    const physicalInputs = [...this.localHost.localWorkspaces()];
    const updatedAtMap = this.localHost.localSessionUpdatedAt();
    const sessionOrigins = /* @__PURE__ */ Object.create(null);
    for (const client of this.clients.values()) {
      const view = client.toView();
      const summaries = client.sessionSummaries();
      const runningBySession = /* @__PURE__ */ new Map();
      for (const s of summaries) {
        const namespacedId = client.namespaceSummary(s).sessionId;
        updatedAtMap.set(namespacedId, s.updatedAt);
        runningBySession.set(s.sessionId, s.running);
        const pending = client.pendingInteractionList().find((p) => p.rawSessionId === s.sessionId);
        sessionOrigins[namespacedId] = {
          namespacedSessionId: namespacedId,
          rawSessionId: s.sessionId,
          deviceId: client.id,
          deviceName: view.name,
          deviceState: view.state,
          ...s.cwd !== void 0 ? { cwd: s.cwd } : {},
          ...s.cwd !== void 0 ? { gitRemote: this.aggregator.getCachedGitRemote(client.id, s.cwd) } : {},
          running: s.running,
          ...pending !== void 0 ? { pendingInteractionKind: pending.kind } : {},
          ...view.nativeProxyUrl !== void 0 ? { nativeUrl: view.nativeProxyUrl } : {}
        };
      }
      for (const ws of client.workspaceItems()) {
        const runningCount = ws.sessionIds.filter((id) => runningBySession.get(id) === true).length;
        physicalInputs.push({
          deviceId: client.id,
          deviceName: view.name,
          workspaceId: ws.workspaceId,
          path: ws.path,
          title: ws.title,
          sessionIds: ws.sessionIds,
          runningSessionCount: runningCount,
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt
        });
      }
    }
    const { logicalWorkspaces, allPhysicalWorkspaces } = this.aggregator.aggregate(
      physicalInputs,
      updatedAtMap
    );
    for (const lws of logicalWorkspaces) {
      for (const sid of lws.sessionIds) {
        const origin = sessionOrigins[sid];
        if (origin !== void 0) {
          sessionOrigins[sid] = {
            ...origin,
            logicalWorkspaceId: lws.logicalWorkspaceId,
            ...lws.gitRemote !== void 0 ? { gitRemote: lws.gitRemote } : {}
          };
        }
      }
    }
    return {
      revision: this.revision,
      hostStatus: {
        aggregatedGatewayActive: this.aggregatedGatewayActive,
        ...this.aggregatedGatewayError !== void 0 ? { aggregatedGatewayError: this.aggregatedGatewayError } : {},
        nativeProxyActive: this.nativeProxyActive
      },
      devices: [...this.clients.values()].map((c) => c.toView()),
      sshConfigHosts: listSshConfigHosts(),
      aggregationConfig: this.aggregator.getConfig(),
      logicalWorkspaces,
      allPhysicalWorkspaces,
      sessionOrigins
    };
  }
  /** Resolve which remote client owns a given namespaced session ID. */
  resolveSessionOwner(sessionId) {
    const decoded = decodeSessionId(sessionId);
    if (!decoded.isRemote) return void 0;
    const client = this.clients.get(decoded.deviceId);
    if (client === void 0) return void 0;
    return { client, rawSessionId: decoded.rawSessionId };
  }
  hydrateConfig(config) {
    const secret = this.authManager.storedSecret(config.id);
    const credential = secret?.authCredential;
    const passphrase = secret?.sshPassphrase;
    return {
      ...config,
      auth: {
        ...config.auth,
        ...credential !== void 0 && credential !== "" ? { credential } : {}
      },
      transport: config.transport.kind === "ssh" && passphrase !== void 0 && passphrase !== "" ? { ...config.transport, passphrase } : config.transport
    };
  }
  async mountClient(storedConfig) {
    const config = this.hydrateConfig(storedConfig);
    let client = this.clients.get(config.id);
    const callbacks = {
      onStateChanged: () => {
        this.bumpRevision();
      },
      onRemoteEventFrame: (deviceId, frame) => {
        for (const listener of this.eventListeners) listener(deviceId, frame);
      },
      onControlProjectionFrame: (deviceId, frame) => {
        for (const listener of this.projectionListeners) listener(deviceId, frame);
      },
      onWorkspacesChanged: () => {
        this.bumpRevision();
        this.notifyWorkspacesChanged();
      },
      onGitRemotesDiscovered: (deviceId, remotesByPath) => {
        for (const [path, rawUrl] of remotesByPath.entries()) {
          this.aggregator.noteGitRemote(deviceId, path, rawUrl);
        }
        this.bumpRevision();
      }
    };
    if (client === void 0) {
      client = new RemoteDeviceClient(config, this.authManager, callbacks);
      this.clients.set(config.id, client);
    } else {
      client.updateConfig(config);
    }
    if (this.nativeProxyActive) {
      const proxyUrl = await this.nativeProxyManager.ensureProxy(config, () => client.effectiveBaseUrl());
      client.setNativeProxyUrl(proxyUrl);
    }
    if (config.enabled) {
      client.start();
    }
    return client;
  }
  isSelfLoop(transport) {
    const localPort = this.localHost.localPort();
    if (localPort === void 0) return false;
    if (transport.kind === "direct") {
      try {
        const url = new URL(transport.baseUrl);
        const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
        const isLoopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname.toLowerCase());
        return isLoopback && port === localPort;
      } catch {
        return false;
      }
    }
    const hostPart = transport.host.trim().replace(/^.*@/, "").replace(/:\d+$/, "");
    const remotePort = transport.remotePort ?? 3080;
    return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostPart.toLowerCase()) && remotePort === localPort;
  }
  bumpRevision() {
    this.revision += 1;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
      }
    }
  }
  notifyWorkspacesChanged() {
    for (const listener of this.workspaceListeners) {
      try {
        listener();
      } catch {
      }
    }
  }
  loadFromDisk() {
    if (!existsSync5(this.dataFilePath)) return;
    let migratedSecrets = false;
    try {
      const raw = JSON.parse(readFileSync5(this.dataFilePath, "utf8"));
      if (Array.isArray(raw.devices)) {
        for (const dev of raw.devices) {
          if (dev && typeof dev.id === "string" && typeof dev.name === "string" && dev.transport) {
            const id = DeviceId(dev.id);
            const legacyCredential = dev.auth?.credential;
            const legacyPassphrase = dev.transport.kind === "ssh" ? dev.transport.passphrase : void 0;
            if (legacyCredential !== void 0 && legacyCredential.trim() !== "") {
              this.authManager.setAuthCredential(id, legacyCredential);
              migratedSecrets = true;
            }
            if (legacyPassphrase !== void 0 && legacyPassphrase.trim() !== "") {
              this.authManager.setSshPassphrase(id, legacyPassphrase);
              migratedSecrets = true;
            }
            this.configs.set(id, sanitizeDeviceConfig(dev));
          }
        }
      }
      if (raw.aggregation && typeof raw.aggregation === "object") {
        this.aggregator.setConfig({ ...DEFAULT_AGGREGATION_CONFIG, ...raw.aggregation });
      }
      if (migratedSecrets) this.saveToDisk();
    } catch {
    }
  }
  saveToDisk() {
    try {
      const dir = dirname4(this.dataFilePath);
      mkdirSync2(dir, { recursive: true });
      const tmp = `${this.dataFilePath}.${randomUUID4()}.tmp`;
      const doc = {
        version: 1,
        devices: [...this.configs.values()],
        aggregation: this.aggregator.getConfig()
      };
      writeFileSync2(tmp, JSON.stringify(doc, null, 2), { mode: 384 });
      try {
        chmodSync2(tmp, 384);
      } catch {
      }
      renameSync2(tmp, this.dataFilePath);
    } catch {
    }
  }
};

// src/runtime.ts
var MULTI_DEVICE_API_PATH = "/multi-device/api";
var MULTI_DEVICE_EVENTS_PATH = "/multi-device/events";
var MAX_BODY_BYTES = 2 * 1024 * 1024;
var MultiDeviceControlPlane = class {
  constructor(registry, admitRequest) {
    this.registry = registry;
    this.admitRequest = admitRequest;
  }
  /** Execute one control-plane action and return a JSON-serializable result envelope. */
  async dispatch(request) {
    const payload = request.payload ?? {};
    try {
      switch (request.action) {
        case "snapshot":
          return { ok: true, value: this.registry.snapshot() };
        case "upsertDevice": {
          const input = payload;
          const res = await this.registry.upsertDevice(input);
          if (!res.ok) return res;
          return { ok: true, value: { device: res.device, snapshot: this.registry.snapshot() } };
        }
        case "removeDevice": {
          const deviceId = String(payload.deviceId ?? "");
          const removed = this.registry.removeDevice(deviceId);
          return { ok: true, value: { removed, snapshot: this.registry.snapshot() } };
        }
        case "reconnectDevice": {
          const deviceId = String(payload.deviceId ?? "");
          const triggered = this.registry.reconnectDevice(deviceId);
          return { ok: true, value: { triggered, snapshot: this.registry.snapshot() } };
        }
        case "testDevice": {
          const input = payload;
          const res = await this.registry.testDeviceConnection(input);
          if (!res.ok) return res;
          return { ok: true, value: res };
        }
        case "listSshKeys":
          return { ok: true, value: { keys: this.registry.listSshKeys() } };
        case "createSession": {
          const input = payload;
          const res = await this.registry.createRemoteSession(input);
          if (!res.ok) return res;
          return { ok: true, value: { ...res, snapshot: this.registry.snapshot() } };
        }
        case "createRemoteWorkspace": {
          const input = payload;
          const res = await this.registry.createRemoteWorkspace(input);
          if (!res.ok) return res;
          return { ok: true, value: { ...res, snapshot: this.registry.snapshot() } };
        }
        case "updateAggregationConfig": {
          const patch = payload;
          this.registry.updateAggregationConfig(patch);
          return { ok: true, value: this.registry.snapshot() };
        }
        case "upsertManualRule": {
          const rule = payload;
          this.registry.aggregator.upsertManualRule(rule);
          this.registry.saveToDisk();
          return { ok: true, value: this.registry.snapshot() };
        }
        case "removeManualRule": {
          const ruleId = String(payload.ruleId ?? "");
          this.registry.aggregator.removeManualRule(ruleId);
          this.registry.saveToDisk();
          return { ok: true, value: this.registry.snapshot() };
        }
        case "setMemberExcluded": {
          const memberKey = String(payload.memberKey ?? "");
          const excluded = Boolean(payload.excluded);
          this.registry.aggregator.setMemberExcluded(memberKey, excluded);
          this.registry.saveToDisk();
          return { ok: true, value: this.registry.snapshot() };
        }
        case "setPreferredDevice": {
          const logicalWorkspaceId = String(payload.logicalWorkspaceId ?? "");
          const deviceId = String(payload.deviceId ?? "");
          this.registry.aggregator.setPreferredDevice(logicalWorkspaceId, deviceId);
          this.registry.saveToDisk();
          return { ok: true, value: this.registry.snapshot() };
        }
        case "setCustomTitle": {
          const logicalWorkspaceId = String(payload.logicalWorkspaceId ?? "");
          const title = String(payload.title ?? "");
          this.registry.aggregator.setCustomTitle(logicalWorkspaceId, title);
          this.registry.saveToDisk();
          return { ok: true, value: this.registry.snapshot() };
        }
        default:
          return { ok: false, error: `Unknown control-plane action: ${String(request.action)}` };
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /** HTTP route handler for `POST /multi-device/api`. */
  async handleApiHttp(req, res) {
    if (!this.isAuthorized(req)) {
      res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Forbidden" }));
      return;
    }
    if (req.method === "GET") {
      const snapshot = this.registry.snapshot();
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      res.end(JSON.stringify({ ok: true, value: snapshot }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
      return;
    }
    const bodyBuf = await readBody(req);
    if (bodyBuf === null) {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Invalid request body" }));
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(bodyBuf.toString("utf8"));
      if (!parsed || typeof parsed.action !== "string") {
        throw new Error("Missing action");
      }
    } catch {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Malformed JSON body" }));
      return;
    }
    const outcome = await this.dispatch(parsed);
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify(outcome));
  }
  /** SSE route handler for `GET /multi-device/events` (real-time snapshot push to Client UI). */
  handleEventsSse(req, res) {
    if (!this.isAuthorized(req)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive"
    });
    const sendSnapshot = () => {
      try {
        const snap = this.registry.snapshot();
        res.write(`event: snapshot
data: ${JSON.stringify(snap)}

`);
      } catch {
      }
    };
    sendSnapshot();
    const unsubscribe = this.registry.onSnapshotChanged(() => {
      sendSnapshot();
    });
    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
    }, 15e3);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
  isAuthorized(req) {
    if (this.admitRequest !== void 0) {
      return this.admitRequest(req);
    }
    const host = req.headers.host ?? "";
    return host.startsWith("127.0.0.1:") || host.startsWith("localhost:") || host === "127.0.0.1" || host === "localhost";
  }
};
function readBody(req) {
  return new Promise((resolve3) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        resolve3(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve3(Buffer.concat(chunks)));
    req.on("error", () => resolve3(null));
  });
}

// src/index.ts
var name = "dsh-multi-device";
var inject = ["webServer"];
var Config = z.object({
  dataFile: z.string(),
  secretsFile: z.string(),
  features: z.object({
    aggregatedMode: z.boolean().default(true),
    nativeMode: z.boolean().default(true),
    sshTunnel: z.boolean().default(true),
    autoGitAggregate: z.boolean().default(true),
    directTransport: z.boolean().default(false)
  }).default({})
});
function apply(ctx, config) {
  const resolved = Config(config ?? {});
  const dshHome = process.env.DSH_HOME ?? join4(homedir3(), ".dsh");
  const dataFile = resolved.dataFile ?? join4(dshHome, "plugins", "dsh-multi-device.json");
  const secretsFile = resolved.secretsFile ?? join4(dshHome, "plugins", "dsh-multi-device-secrets.json");
  const features = resolved.features ?? {};
  const enableAggregated = features.aggregatedMode !== false;
  const enableNative = features.nativeMode !== false;
  const enableTunnels = features.sshTunnel !== false;
  const webServer = ctx.webServer;
  const getWorkspaceRegistry = () => {
    try {
      return ctx.get?.("workspaceRegistry");
    } catch {
      return void 0;
    }
  };
  const getLocalAgents = () => {
    try {
      return ctx.get?.("agents");
    } catch {
      return void 0;
    }
  };
  const getLocalSessions = () => {
    try {
      return ctx.get?.("sessions");
    } catch {
      return void 0;
    }
  };
  const localSessionActivity = /* @__PURE__ */ new Map();
  ctx.effect(() => {
    const on = ctx.on;
    if (typeof on !== "function") return () => {
    };
    const dispose = on.call(ctx, "api-session/activity", (sessionId, updatedAt) => {
      if (typeof sessionId === "string" && typeof updatedAt === "number") {
        localSessionActivity.set(sessionId, updatedAt);
      }
    });
    return typeof dispose === "function" ? dispose : () => {
    };
  }, "dsh-multi-device: local session activity");
  const registry = new DeviceRegistry(
    dataFile,
    secretsFile,
    {
      localPort: () => webServer?.port,
      localWorkspaces: () => {
        const runningIds = /* @__PURE__ */ new Set();
        try {
          for (const agent of getLocalAgents()?.list?.() ?? []) {
            if (agent.status === "running") runningIds.add(String(agent.id));
          }
        } catch {
        }
        return readLocalPhysicalWorkspaces(getWorkspaceRegistry(), runningIds);
      },
      localSessionUpdatedAt: () => {
        const map = new Map(localSessionActivity);
        try {
          for (const s of getLocalSessions()?.list?.() ?? []) {
            const id = String(s.id);
            if (!map.has(id)) map.set(id, s.header?.createdAt ?? 0);
          }
        } catch {
        }
        return map;
      }
    },
    {
      enableTunnels,
      enableNativeProxy: enableNative,
      localOrigin: () => {
        try {
          if (typeof webServer?.getOrigin === "function") return webServer.getOrigin();
        } catch {
        }
        if (webServer?.port === void 0) return void 0;
        const protocol = webServer.protocol === "https:" ? "https" : "http";
        return `${protocol}://127.0.0.1:${String(webServer.port)}`;
      },
      allowDirectTransport: features.directTransport === true
    }
  );
  if (features.autoGitAggregate === false) {
    registry.aggregator.setConfig({ autoGitAggregate: false });
  }
  const admitRequest = (req) => {
    try {
      const connection = ctx.get?.("connection");
      if (connection?.requestRejection !== void 0) {
        return connection.requestRejection({ headers: req.headers }) === void 0;
      }
    } catch {
    }
    const host = req.headers.host ?? "";
    const isLoopbackHost = host.startsWith("127.0.0.1:") || host.startsWith("localhost:") || host === "127.0.0.1" || host === "localhost";
    if (!isLoopbackHost) return false;
    if (req.headers["sec-fetch-site"] === "cross-site") return false;
    const origin = req.headers.origin;
    if (origin !== void 0) {
      try {
        const parsed = new URL(origin);
        const originLoopback = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname.toLowerCase());
        return originLoopback && parsed.host === host;
      } catch {
        return false;
      }
    }
    return true;
  };
  const controlPlane = new MultiDeviceControlPlane(registry, admitRequest);
  ctx.effect(() => {
    const disposers = [];
    try {
      disposers.push(
        webServer.register({
          kind: "exact",
          path: MULTI_DEVICE_API_PATH,
          handler: (req, res) => {
            void controlPlane.handleApiHttp(req, res);
          }
        })
      );
      disposers.push(
        webServer.register({
          kind: "exact",
          path: MULTI_DEVICE_EVENTS_PATH,
          handler: (req, res) => {
            controlPlane.handleEventsSse(req, res);
          }
        })
      );
    } catch (error) {
      console.error("[dsh-multi-device] Failed to register control-plane routes:", error);
    }
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, "dsh-multi-device: control-plane routes");
  ctx.effect(() => {
    registry.startAll();
    return () => {
      registry.dispose();
    };
  }, "dsh-multi-device: device registry");
  if (enableAggregated) {
    ctx.inject(
      ["sessionController", "workspaceController", "typertGateway"],
      (gatewayCtx) => {
        gatewayCtx.effect(() => {
          try {
            const sessionController = gatewayCtx.sessionController;
            const workspaceController = gatewayCtx.workspaceController;
            const typertGateway = gatewayCtx.typertGateway;
            const disposeGateway = installAggregatedGateway02(
              registry,
              sessionController,
              workspaceController,
              typertGateway,
              getWorkspaceRegistry()
            );
            registry.setGatewayStatus(true);
            return () => {
              disposeGateway();
              registry.setGatewayStatus(false);
            };
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(
              `[dsh-multi-device] Aggregated Mode Gateway degraded (${msg}); Native Mode remains fully operational.`
            );
            registry.setGatewayStatus(false, msg);
            return () => {
            };
          }
        }, "dsh-multi-device: aggregated-gateway-02");
      }
    );
  } else {
    registry.setGatewayStatus(false, "Disabled by configuration");
  }
}
export {
  Config,
  DeviceId,
  LOCAL_DEVICE_ID,
  apply,
  decodeLogicalWorkspaceId,
  decodeRemoteEventId,
  decodeRemoteWorkspaceId,
  decodeSessionId,
  encodeLogicalWorkspaceId,
  encodeRemoteEventId,
  encodeRemoteSessionId,
  encodeRemoteWorkspaceId,
  inject,
  name,
  normalizeGitRemote,
  normalizeWorkspacePath,
  workspaceMemberKey
};
//# sourceMappingURL=index.js.map

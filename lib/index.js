// src/index.ts
import z from "@deepseek-ai/schemastery";
import { homedir as homedir4 } from "node:os";
import { join as join5 } from "node:path";

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
  const remoteEventId = rest.slice(sepIndex + 1);
  if (remoteEventId.startsWith(REMOTE_EVENT_PREFIX)) return void 0;
  return {
    deviceId: unescapeSegment(rest.slice(0, sepIndex)),
    remoteEventId
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
      const port = parsed.port;
      const defaultPort = parsed.protocol === "ssh:" || parsed.protocol === "git+ssh:" ? "22" : "";
      if (port !== "" && port !== defaultPort && port !== "443" && port !== "80") {
        host = `${host}:${port}`;
      }
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

// src/host/stream-queue.ts
var DEFAULT_STREAM_BACKLOG = 2048;
var BoundedStreamQueue = class {
  constructor(limit = DEFAULT_STREAM_BACKLOG) {
    this.limit = limit;
  }
  items = [];
  overflowed = false;
  wake;
  /** Append a frame. Frames after the cap are dropped; the consumer will fail. */
  push(item) {
    if (this.overflowed) return;
    if (this.items.length >= this.limit) {
      this.overflowed = true;
    } else {
      this.items.push(item);
    }
    this.notify();
  }
  shift() {
    return this.items.shift();
  }
  get overflow() {
    return this.overflowed;
  }
  /** Resolve when a frame arrives or the stream is aborted. */
  wait() {
    return new Promise((resolve4) => {
      this.wake = resolve4;
    });
  }
  /** Wake the consumer without adding a frame (abort or overflow). */
  notify() {
    const wake = this.wake;
    this.wake = void 0;
    wake?.();
  }
};

// src/host/gateway.ts
function unavailableRemoteCatalog(deviceName, message) {
  return {
    default: { provider: "", model: "" },
    routableProviders: [],
    groups: [],
    failures: [{ id: `remote:${deviceName}`, name: deviceName, message }]
  };
}
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
function supportsWorkspaceReplaceFrames(version) {
  if (version === void 0) return false;
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(version.trim());
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (major !== 0 || minor !== 2) return major > 0 || minor > 2;
  if (patch !== 1) return patch > 1;
  const pre = match[4];
  if (pre === void 0) return true;
  const rc = /^rc\.(\d+)$/.exec(pre);
  return rc !== null && Number(rc[1]) >= 1;
}
function deviceOfflineError(deviceName, detail) {
  const error = new Error(
    `Device "${deviceName}" is offline${detail === void 0 || detail === "" ? "" : ` (${detail})`}. Reconnect it and retry.`
  );
  error.name = "RemoteError";
  error.code = "dsh-md/device-offline";
  error.details = { deviceName };
  error.isDSHRemoteError = true;
  return error;
}
function installAggregatedGateway02(registry, sessionController, workspaceController, typertGateway, workspaceRegistry, options = {}) {
  const disposers = [];
  const supportsReplaceFrames = () => typeof options.workspaceReplaceFrames === "function" ? options.workspaceReplaceFrames() : options.workspaceReplaceFrames === true;
  const offlineWaitMs = options.offlineWaitMs ?? 6e4;
  const requireConnected = (client) => {
    if (!client.isConnected()) throw deviceOfflineError(client.deviceConfig.name);
  };
  const waitForClient = async (client, signal) => {
    if (client.isConnected()) return;
    const reachable = await registry.waitForDeviceConnected(client.id, signal, offlineWaitMs);
    if (!reachable) {
      throw deviceOfflineError(client.deviceConfig.name, `reconnect attempt ${String(client.toView().reconnectAttempt)}`);
    }
  };
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
    if (!registry.isAggregatedMode()) return local;
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
    if (!registry.isAggregatedMode()) return origSessionSearch(request, signal);
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
    if (!registry.isAggregatedMode()) return origSessionCreate(request);
    if (request.sessionId !== void 0) {
      const owner = registry.resolveSessionOwner(request.sessionId);
      if (owner !== void 0) {
        const requestedLws = request.workspaceId !== void 0 && decodeLogicalWorkspaceId(request.workspaceId) !== void 0 ? registry.snapshot().logicalWorkspaces.find((w) => w.logicalWorkspaceId === request.workspaceId) : void 0;
        const targetDeviceId = requestedLws?.effectiveTargetDeviceId ?? requestedLws?.targetDeviceId;
        if (requestedLws === void 0 || targetDeviceId === owner.client.id) {
          requireConnected(owner.client);
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
    }
    if (request.workspaceId !== void 0 && decodeLogicalWorkspaceId(request.workspaceId) !== void 0) {
      const snap = registry.snapshot();
      const lws = snap.logicalWorkspaces.find((w) => w.logicalWorkspaceId === request.workspaceId);
      if (lws !== void 0) {
        const targetDeviceId = lws.effectiveTargetDeviceId ?? lws.targetDeviceId;
        const targetPath = lws.effectiveTargetPath ?? lws.targetPath;
        if (targetDeviceId === LOCAL_DEVICE_ID) {
          const localMember = lws.members.find((m) => m.deviceId === LOCAL_DEVICE_ID);
          const reusable = reusableSessionIdFor(request.sessionId, LOCAL_DEVICE_ID);
          return origSessionCreate({
            ...localMember !== void 0 ? { workspaceId: localMember.remoteWorkspaceId } : { cwd: targetPath },
            ...reusable !== void 0 ? { sessionId: reusable } : {},
            ...request.agentPreset !== void 0 ? { agentPreset: request.agentPreset } : {}
          });
        }
        const remoteClient = registry.client(targetDeviceId);
        const remoteMember = lws.members.find((m) => m.deviceId === targetDeviceId);
        if (remoteClient !== void 0) {
          requireConnected(remoteClient);
          const reusable = reusableSessionIdFor(request.sessionId, remoteClient.id);
          const created = await remoteClient.invokeUnary("session", "create", {
            request: {
              ...remoteMember !== void 0 ? { workspaceId: remoteMember.remoteWorkspaceId } : { cwd: targetPath },
              ...reusable !== void 0 ? { sessionId: reusable } : {},
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
          requireConnected(remoteClient);
          const reusable = reusableSessionIdFor(request.sessionId, remoteClient.id);
          const created = await remoteClient.invokeUnary("session", "create", {
            request: {
              workspaceId: decodedWs.rawWorkspaceId,
              ...reusable !== void 0 ? { sessionId: reusable } : {},
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
    if (!registry.isAggregatedMode()) return origSessionSelectModel(request);
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionSelectModel(request);
    requireConnected(owner.client);
    return await owner.client.invokeUnary("session", "selectModel", {
      request: {
        ...request,
        sessionId: owner.rawSessionId
      }
    });
  });
  patchMethod(sessionController, "modelCatalog", async () => {
    if (!registry.isAggregatedMode()) {
      return origSessionModelCatalog();
    }
    const scope = registry.activeSessionScope();
    if (scope.kind === "local") {
      return origSessionModelCatalog();
    }
    if (scope.client === void 0 || scope.client.toView().state !== "connected") {
      return unavailableRemoteCatalog(scope.deviceName, "remote device is not connected");
    }
    try {
      return await scope.client.invokeUnary(
        "session",
        "modelCatalog",
        {}
      );
    } catch (error) {
      return unavailableRemoteCatalog(
        scope.deviceName,
        error instanceof Error ? error.message : String(error)
      );
    }
  });
  patchMethod(sessionController, "rename", async (request) => {
    if (!registry.isAggregatedMode()) return origSessionRename(request);
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionRename(request);
    requireConnected(owner.client);
    return await owner.client.invokeUnary("session", "rename", {
      request: { sessionId: owner.rawSessionId, title: request.title }
    });
  });
  patchMethod(sessionController, "fork", async (request) => {
    if (!registry.isAggregatedMode()) return origSessionFork(request);
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionFork(request);
    requireConnected(owner.client);
    const res = await owner.client.invokeUnary("session", "fork", {
      request: {
        sessionId: owner.rawSessionId,
        ...request.atSeq !== void 0 ? { atSeq: request.atSeq } : {}
      }
    });
    return { sessionId: encodeRemoteSessionId(owner.client.id, res.sessionId) };
  });
  patchMethod(sessionController, "prompt", async (request, signal) => {
    if (!registry.isAggregatedMode()) return origSessionPrompt(request, signal);
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionPrompt(request, signal);
    requireConnected(owner.client);
    return await owner.client.invokeUnary(
      "session",
      "prompt",
      { request: { ...request, sessionId: owner.rawSessionId } },
      signal
    );
  });
  patchMethod(sessionController, "attachment", async (request) => {
    if (!registry.isAggregatedMode()) return origSessionAttachment(request);
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionAttachment(request);
    requireConnected(owner.client);
    return await owner.client.invokeUnary("session", "attachment", {
      request: { ...request, sessionId: owner.rawSessionId }
    });
  });
  patchMethod(sessionController, "updateQueue", async (request) => {
    if (!registry.isAggregatedMode()) return origSessionUpdateQueue(request);
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionUpdateQueue(request);
    requireConnected(owner.client);
    return await owner.client.invokeUnary("session", "updateQueue", {
      request: { ...request, sessionId: owner.rawSessionId }
    });
  });
  patchMethod(sessionController, "cancel", (request) => {
    if (!registry.isAggregatedMode()) return origSessionCancel(request);
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionCancel(request);
    if (!owner.client.isConnected()) return Promise.reject(deviceOfflineError(owner.client.deviceConfig.name));
    return owner.client.invokeUnary("session", "cancel", {
      request: { sessionId: owner.rawSessionId }
    });
  });
  patchMethod(sessionController, "projections", async (request, signal) => {
    if (!registry.isAggregatedMode()) return origSessionProjections(request, signal);
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner === void 0) return origSessionProjections(request, signal);
    requireConnected(owner.client);
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
    if (!registry.isAggregatedMode()) return origSessionPage(request, signal);
    const routed = routeSessionAddress(registry, request.address);
    if (routed === void 0) return origSessionPage(request, signal);
    await waitForClient(routed.client, signal);
    return await routed.client.invokeUnary(
      "session",
      "page",
      { request: { ...request, address: routed.rawAddress } },
      signal
    );
  });
  patchMethod(sessionController, "follow", (request, signal) => {
    if (!registry.isAggregatedMode()) return origSessionFollow(request, signal);
    const routed = routeSessionAddress(registry, request.address);
    if (routed === void 0) return origSessionFollow(request, signal);
    return (async function* () {
      await waitForClient(routed.client, signal);
      let yielded = false;
      try {
        const stream = routed.client.openStream(
          "session/follow",
          { request: { ...request, address: routed.rawAddress } },
          signal
        );
        for await (const rawFrame of stream) {
          yielded = true;
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
      } catch (error) {
        if (shouldEndFollowStream(error, yielded, routed.client.isConnected())) return;
        throw error;
      }
    })();
  });
  patchMethod(sessionController, "control", (signal) => {
    return multiplexControlStream(registry, origSessionControl(signal), signal);
  });
  patchMethod(workspaceController, "rename", async (request) => {
    if (!registry.isAggregatedMode()) return origWorkspaceRename(request);
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
    if (!registry.isAggregatedMode()) return origWorkspaceDelete(request);
    const logical = decodeLogicalWorkspaceId(request.workspaceId);
    if (logical !== void 0) {
      if (logical.kind === "manual") {
        registry.aggregator.removeManualRule(logical.key);
        registry.saveToDisk();
      } else {
        const lws = registry.snapshot().logicalWorkspaces.find((w) => w.logicalWorkspaceId === request.workspaceId);
        if (lws !== void 0) {
          for (const m of lws.members) {
            registry.aggregator.setMemberExcluded(workspaceMemberKey(m.deviceId, m.path), true);
          }
          registry.saveToDisk();
        }
      }
      registry.refreshWorkspaceView();
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
    if (!registry.isAggregatedMode()) return origWorkspaceInsertBefore(request);
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
    if (!registry.isAggregatedMode()) return origWorkspaceInsertSessionBefore(request);
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
        requireConnected(client);
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
    if (!registry.isAggregatedMode()) {
      const localRes2 = await origWorkspaceArchive(request);
      return { archivedSessionIds: localRes2.archivedSessionIds };
    }
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner !== void 0) {
      requireConnected(owner.client);
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
    if (!registry.isAggregatedMode()) {
      const localRes2 = await origWorkspaceUnarchive(request);
      return { archivedSessionIds: localRes2.archivedSessionIds };
    }
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner !== void 0) {
      requireConnected(owner.client);
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
    if (!registry.isAggregatedMode()) {
      const localRes2 = await origWorkspacePin(request);
      return { pinnedSessionIds: localRes2.pinnedSessionIds };
    }
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner !== void 0) {
      requireConnected(owner.client);
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
    if (!registry.isAggregatedMode()) {
      const localRes2 = await origWorkspaceUnpin(request);
      return { pinnedSessionIds: localRes2.pinnedSessionIds };
    }
    const owner = registry.resolveSessionOwner(request.sessionId);
    if (owner !== void 0) {
      requireConnected(owner.client);
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
    return multiplexWorkspaceFollow(
      registry,
      workspaceRegistry,
      origWorkspaceFollow(signal),
      signal,
      supportsReplaceFrames
    );
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
      if (registry.isAggregatedMode() && endpoint === "$events/result" && isRecord(payload) && isRecord(payload.args)) {
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
function isSameDeviceChildSession(parentDeviceId, childSessionId) {
  const child = decodeSessionId(childSessionId);
  return child.isRemote && child.deviceId === parentDeviceId;
}
function shouldEndFollowStream(error, yielded, connected) {
  if (!yielded) return false;
  if (!connected) return true;
  if (typeof error !== "object" || error === null) return false;
  const code = error.code;
  return code === "gateway/cancelled" || code === "transport" || code === "dsh-md/device-offline";
}
function reusableSessionIdFor(sessionId, deviceId) {
  if (sessionId === void 0 || sessionId === "") return void 0;
  const decoded = decodeSessionId(sessionId);
  return decoded.deviceId === deviceId ? decoded.rawSessionId : void 0;
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
    if (!isSameDeviceChildSession(parentOwner.client.id, address.childSessionId)) {
      return void 0;
    }
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
    // The merged row's path is where a new Session will run, so blank-session
    // reuse and the "+ New Session" hint point at the effective device.
    path: lws.effectiveTargetPath ?? lws.targetPath,
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
  const queue = new BoundedStreamQueue();
  const push = (item) => {
    queue.push(item);
  };
  const offRemote = registry.onControlProjection((_deviceId, frame) => {
    if (!registry.isAggregatedMode()) return;
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
        const projections = { ...frame.value.projections };
        if (registry.isAggregatedMode()) {
          for (const client of registry.clientList()) {
            for (const [rawSid, block] of client.controlProjections().entries()) {
              projections[encodeRemoteSessionId(client.id, rawSid)] = block;
            }
          }
        }
        push({
          type: "baseline",
          value: { projections }
        });
      } else {
        push(frame);
      }
    }
  })();
  const onAbort = () => {
    queue.notify();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (!signal.aborted) {
      if (queue.overflow) {
        throw new Error("Aggregated control stream consumer fell behind; reconnect for a fresh baseline");
      }
      const next = queue.shift();
      if (next !== void 0) {
        yield next;
        continue;
      }
      await queue.wait();
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    offRemote();
    await pumpLocal.catch(() => {
    });
  }
}
async function* multiplexWorkspaceFollow(registry, workspaceRegistry, localStream, signal, workspaceReplaceFrames = () => false) {
  const queue = new BoundedStreamQueue();
  let baselineSent = false;
  let prevById = /* @__PURE__ */ new Map();
  let prevOrder = "";
  let prevArchived = "";
  let prevPinned = "";
  const push = (item) => {
    queue.push(item);
  };
  const computeCurrentState = () => {
    if (!registry.isAggregatedMode()) {
      const localItems = (workspaceRegistry?.list() ?? []).map((workspace) => ({
        workspaceId: workspace.id,
        path: workspace.path,
        title: workspace.title,
        sessionIds: [...workspace.sessionIds],
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt
      }));
      return {
        items: localItems,
        archivedSessionIds: workspaceRegistry?.archivedSessionIds.map(String) ?? [],
        pinnedSessionIds: workspaceRegistry?.pinnedSessionIds.map(String) ?? []
      };
    }
    const snap = registry.snapshot();
    const items = snap.logicalWorkspaces.map(logicalToWorkspaceView);
    const archivedSessionIds = collectMergedArchivedIds(registry, workspaceRegistry);
    const pinnedSessionIds = collectMergedPinnedIds(registry, workspaceRegistry);
    return { items, archivedSessionIds, pinnedSessionIds };
  };
  const fingerprintOf = (item) => JSON.stringify({
    title: item.title,
    path: item.path,
    sessionIds: item.sessionIds
  });
  const installPrevState = (state) => {
    prevById = new Map(state.items.map((item) => [item.workspaceId, fingerprintOf(item)]));
    prevOrder = state.items.map((item) => item.workspaceId).join("\0");
    prevArchived = state.archivedSessionIds.join("\0");
    prevPinned = state.pinnedSessionIds.join("\0");
  };
  const syncIncrementalDiff = () => {
    if (!baselineSent) return;
    const state = computeCurrentState();
    const replaceFrames = workspaceReplaceFrames();
    const nextIds = new Set(state.items.map((item) => item.workspaceId));
    const setChanged = nextIds.size !== prevById.size || [...nextIds].some((id) => !prevById.has(id));
    const orderStr = state.items.map((item) => item.workspaceId).join("\0");
    const archivedStr = state.archivedSessionIds.join("\0");
    const pinnedStr = state.pinnedSessionIds.join("\0");
    if (replaceFrames && setChanged) {
      push({
        type: "replace",
        value: {
          items: state.items,
          archivedSessionIds: state.archivedSessionIds,
          pinnedSessionIds: state.pinnedSessionIds
        }
      });
      installPrevState(state);
      return;
    }
    const nextById = /* @__PURE__ */ new Map();
    for (const item of state.items) {
      const fingerprint = fingerprintOf(item);
      nextById.set(item.workspaceId, fingerprint);
      if (prevById.get(item.workspaceId) !== fingerprint) {
        push({
          type: "upsert",
          workspace: {
            ...item,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        });
      }
    }
    if (!replaceFrames) {
      for (const oldId of prevById.keys()) {
        if (!nextById.has(oldId)) {
          push({ type: "remove", workspaceId: oldId });
        }
      }
    }
    prevById = nextById;
    if (orderStr !== prevOrder) {
      prevOrder = orderStr;
      push({ type: "order", workspaceIds: state.items.map((item) => item.workspaceId) });
    }
    if (archivedStr !== prevArchived) {
      prevArchived = archivedStr;
      push({ type: "archived", archivedSessionIds: state.archivedSessionIds });
    }
    if (pinnedStr !== prevPinned) {
      prevPinned = pinnedStr;
      push({ type: "pinned", pinnedSessionIds: state.pinnedSessionIds });
    }
  };
  const offWorkspaces = registry.onWorkspacesChanged(() => {
    syncIncrementalDiff();
  });
  const pumpLocal = (async () => {
    for await (const frame of localStream) {
      if (signal.aborted) return;
      if (frame.type === "baseline") {
        const state = computeCurrentState();
        installPrevState(state);
        baselineSent = true;
        push({
          type: "baseline",
          value: state
        });
      } else {
        syncIncrementalDiff();
      }
    }
  })();
  const onAbort = () => {
    queue.notify();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (!signal.aborted) {
      if (queue.overflow) {
        throw new Error("Aggregated workspace stream consumer fell behind; reconnect for a fresh baseline");
      }
      const next = queue.shift();
      if (next !== void 0) {
        yield next;
        continue;
      }
      await queue.wait();
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    offWorkspaces();
    await pumpLocal.catch(() => {
    });
  }
}
async function* multiplexRemoteEventsStream(registry, localEvents, signal) {
  const queue = new BoundedStreamQueue();
  let readySent = false;
  const deliveredWaterfalls = /* @__PURE__ */ new Set();
  const push = (item) => {
    queue.push(item);
  };
  const pushPendingRemoteWaterfalls = () => {
    if (!registry.isAggregatedMode()) return;
    for (const client of registry.clientList()) {
      for (const pending of client.pendingInteractionList()) {
        if (deliveredWaterfalls.has(pending.namespacedEventId)) continue;
        deliveredWaterfalls.add(pending.namespacedEventId);
        push({
          type: "waterfall",
          event: pending.eventName,
          eventId: pending.namespacedEventId,
          agentId: pending.namespacedSessionId,
          request: pending.request
        });
      }
    }
  };
  const offRemote = registry.onRemoteEvent((_deviceId, frame) => {
    if (!readySent || !registry.isAggregatedMode()) return;
    if (isRecord(frame) && frame.type === "waterfall" && typeof frame.eventId === "string") {
      deliveredWaterfalls.add(frame.eventId);
    }
    push(frame);
  });
  const offMode = registry.onDisplayModeChanged((mode) => {
    if (!readySent || mode !== "aggregated") return;
    pushPendingRemoteWaterfalls();
  });
  const pumpLocal = (async () => {
    for await (const frame of localEvents) {
      if (signal.aborted) return;
      push(frame);
      if (!readySent && isRecord(frame) && frame.type === "ready") {
        readySent = true;
        pushPendingRemoteWaterfalls();
        if (registry.isAggregatedMode()) {
          for (const client of registry.clientList()) {
            for (const summary of client.sessionSummaries()) {
              push({
                type: "emit",
                event: "api-session/added",
                args: [client.namespaceSummary(summary)]
              });
            }
          }
          if (registry.activeSessionScope().kind === "remote") {
            push({ type: "emit", event: "llm/adapters-updated", args: [] });
          }
        }
      }
    }
  })();
  const onAbort = () => {
    queue.notify();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (!signal.aborted) {
      if (queue.overflow) {
        throw new Error("Aggregated event stream consumer fell behind; reconnect for a fresh baseline");
      }
      const next = queue.shift();
      if (next !== void 0) {
        yield next;
        continue;
      }
      await queue.wait();
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    offRemote();
    offMode();
    await pumpLocal.catch(() => {
    });
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/host/registry.ts
import { randomUUID as randomUUID4 } from "node:crypto";
import { chmodSync as chmodSync2, copyFileSync as copyFileSync2, existsSync as existsSync5, mkdirSync as mkdirSync2, readFileSync as readFileSync5, unlinkSync as unlinkSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { dirname as dirname4 } from "node:path";

// src/host/auth.ts
import { createHash, createHmac, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync as existsSync3, mkdirSync, readFileSync as readFileSync3, unlinkSync, writeFileSync } from "node:fs";
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
  return new Promise((resolve4, reject) => {
    let settled = false;
    let timer;
    const finish = (error, response) => {
      if (settled) return;
      settled = true;
      if (timer !== void 0) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error !== void 0) reject(error);
      else if (response !== void 0) resolve4(response);
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
import { execFileSync, spawn as nodeSpawn } from "node:child_process";
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
    (pattern) => expandIncludeFiles(pattern),
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
function resolveUserIncludePattern(pattern) {
  const expanded = expandHomePath(pattern);
  return isAbsolute(expanded) ? expanded : resolve(join(homedir(), ".ssh"), expanded);
}
function expandIncludeFiles(pattern) {
  const expandedPattern = resolveUserIncludePattern(pattern);
  const dir = dirname(expandedPattern);
  const filePattern = expandedPattern.slice(dir.length + 1);
  if (!existsSync(dir)) return [];
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
var spawnImpl = nodeSpawn;
function spawn(command, args, options) {
  return spawnImpl(command, args, options);
}
var BACKOFF_BASE_MS = 600;
var BACKOFF_MAX_MS = 15e3;
var READY_TIMEOUT_MS = 15e3;
var KEEPALIVE_INTERVAL_SEC = 15;
async function allocateLoopbackPort() {
  return new Promise((resolve4, reject) => {
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
        else resolve4(port);
      });
    });
  });
}
var LOOPBACK_REMOTE_HOSTS = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
function assertLoopbackForward(transport) {
  const host = (transport.remoteBindHost ?? "127.0.0.1").trim();
  const port = transport.remotePort ?? 3080;
  if (!LOOPBACK_REMOTE_HOSTS.has(host.toLowerCase())) {
    throw new Error(`SSH remote bind host must be loopback (127.0.0.1, localhost, or ::1), got ${host}`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`SSH remote DSH port must be an integer between 1 and 65535, got ${String(port)}`);
  }
  return { host: host.toLowerCase() === "[::1]" ? "::1" : host, port };
}
function strictHostKeyCheckingArg() {
  return "StrictHostKeyChecking=yes";
}
function buildSystemSshArgs(transport, resolved, localPort) {
  const forward = assertLoopbackForward(transport);
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
    strictHostKeyCheckingArg(),
    "-L",
    `127.0.0.1:${localPort}:${forward.host}:${forward.port}`
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
    strictHostKeyCheckingArg()
  ];
  const explicitPort = transport.port ?? parsedSpec.port;
  if (explicitPort !== void 0) args.push("-p", String(explicitPort));
  const explicitUser = transport.username?.trim() || parsedSpec.username;
  if (explicitUser !== void 0 && explicitUser !== "") args.push("-l", explicitUser);
  const identity = transport.privateKeyPath?.trim() || resolved.identityFiles[0];
  if (identity !== void 0 && identity !== "") {
    args.push("-i", expandHomePath(identity));
    args.push("-o", "IdentitiesOnly=yes");
  }
  if (transport.proxyJump !== void 0 && transport.proxyJump.trim() !== "") {
    args.push("-J", transport.proxyJump.trim());
  } else if (resolved.proxyJump !== void 0 && resolved.proxyJump !== "") {
    args.push("-J", resolved.proxyJump);
  }
  args.push(parsedSpec.host, command);
  return new Promise((resolve4) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const proc = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] });
    const finish = (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      resolve4(res);
    };
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGTERM");
      } catch {
      }
    }, timeoutMs);
    const killTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
      }
      finish({ ok: false, error: "ssh command timed out" });
    }, timeoutMs + 500);
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", (err) => {
      finish({ ok: false, error: err.message });
    });
    proc.on("close", (code) => {
      if (code === 0) finish({ ok: true, stdout });
      else finish({ ok: false, error: stderr.trim() || `ssh exited with code ${String(code)}` });
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
  return new Promise((resolve4) => {
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
      resolve4(res);
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
  /** Monotonic generation so a late `close`/`fail` cannot tear down a newer tunnel. */
  generation = 0;
  openInFlight = false;
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
    this.generation += 1;
    if (this.retryTimer !== void 0) {
      clearTimeout(this.retryTimer);
      this.retryTimer = void 0;
    }
    this.teardown();
    this.state = "stopped";
    this.notify();
  }
  /** Kill a child and wait until it exits, escalating to SIGKILL. */
  killChild(proc) {
    proc.removeAllListeners();
    try {
      proc.kill("SIGTERM");
    } catch {
    }
    const killTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
      }
    }, 400);
    proc.once("close", () => clearTimeout(killTimer));
    if (killTimer.unref) killTimer.unref();
  }
  teardown() {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    if (this.sshProc !== void 0) {
      const proc = this.sshProc;
      this.sshProc = void 0;
      this.killChild(proc);
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
  scheduleRetry(generation) {
    if (this.stopped || generation !== this.generation || this.retryTimer !== void 0) return;
    const exponent = Math.min(this.attempt, 8);
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_MAX_MS);
    this.attempt += 1;
    const jitter = Math.floor(Math.random() * Math.min(delay, 1e3));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = void 0;
      if (generation !== this.generation || this.stopped) return;
      void this.open();
    }, delay + jitter);
  }
  fail(message, generation, retryable = true) {
    if (generation !== this.generation || this.stopped) return;
    this.lastError = message;
    this.state = "error";
    this.generation += 1;
    this.teardown();
    this.notify();
    if (retryable) this.scheduleRetry(this.generation);
  }
  async open() {
    if (this.stopped || this.openInFlight || this.state === "up") return;
    const generation = this.generation;
    this.openInFlight = true;
    this.state = "connecting";
    this.notify();
    try {
      await this.openOnce(generation);
    } finally {
      this.openInFlight = false;
    }
  }
  async openOnce(generation) {
    if (this.stopped || generation !== this.generation) return;
    let resolved;
    let forward;
    try {
      forward = assertLoopbackForward(this.transport);
      resolved = resolveSshConfigForTransport(this.transport);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error), generation, false);
      return;
    }
    const preferSsh2 = this.transport.engine === "ssh2" || this.transport.passphrase !== void 0 && this.transport.passphrase !== "" && this.transport.engine !== "system-ssh";
    if (!preferSsh2) {
      const ok = await this.openWithSystemSsh(resolved, generation);
      if (ok || this.stopped || generation !== this.generation || this.transport.engine === "system-ssh") return;
    }
    if (resolved.proxyJump !== void 0 || resolved.proxyCommand !== void 0) {
      this.fail(
        "ssh2 engine cannot honor ProxyJump/ProxyCommand; use system-ssh with an SSH agent",
        generation,
        false
      );
      return;
    }
    await this.openWithSsh2(resolved, forward, generation);
  }
  async openWithSystemSsh(resolved, generation) {
    if (generation !== this.generation) return true;
    if (this.transport.privateKeyPath !== void 0 && this.transport.privateKeyPath.trim() !== "" && !existsSync2(expandHomePath(this.transport.privateKeyPath.trim()))) {
      this.fail(`SSH private key not found: ${this.transport.privateKeyPath}`, generation, false);
      return false;
    }
    let port;
    try {
      port = await allocateLoopbackPort();
    } catch (error) {
      this.fail(`Failed to allocate local port: ${error instanceof Error ? error.message : String(error)}`, generation);
      return false;
    }
    if (generation !== this.generation || this.stopped) return true;
    const args = buildSystemSshArgs(this.transport, resolved, port);
    let stderr = "";
    let proc;
    try {
      proc = spawn("ssh", args, { stdio: ["ignore", "ignore", "pipe"] });
    } catch (error) {
      if (this.transport.engine === "system-ssh") {
        this.fail(`Failed to spawn ssh: ${error instanceof Error ? error.message : String(error)}`, generation);
      }
      return false;
    }
    if (generation !== this.generation || this.stopped) {
      this.killChild(proc);
      return true;
    }
    this.sshProc = proc;
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 4096) stderr = stderr.slice(-4096);
    });
    const readyResult = await waitForLocalForwardReady(proc, port, READY_TIMEOUT_MS);
    if (generation !== this.generation) {
      this.killChild(proc);
      return true;
    }
    if (!readyResult.ok) {
      const detail = stderr.trim() || readyResult.error;
      if (this.transport.engine === "system-ssh" || !detail.includes("ENOENT")) {
        this.fail(`SSH tunnel failed (${resolved.hostName}): ${detail}`, generation);
        return true;
      }
      this.killChild(proc);
      if (this.sshProc === proc) this.sshProc = void 0;
      return false;
    }
    if (this.stopped || generation !== this.generation) {
      this.killChild(proc);
      if (this.sshProc === proc) this.sshProc = void 0;
      return true;
    }
    this.localPort = port;
    this.activeEngine = "system-ssh";
    this.state = "up";
    this.lastError = void 0;
    this.attempt = 0;
    this.notify();
    proc.on("close", (code) => {
      if (this.stopped || this.sshProc !== proc || generation !== this.generation) return;
      const msg = stderr.trim() || `ssh tunnel exited (code ${String(code)})`;
      this.fail(msg, generation, true);
    });
    proc.on("error", (err) => {
      if (this.stopped || this.sshProc !== proc || generation !== this.generation) return;
      this.fail(err.message, generation, true);
    });
    return true;
  }
  async openWithSsh2(resolved, forward, generation) {
    if (generation !== this.generation || this.stopped) return;
    let ClientCtor;
    try {
      const mod = await import("ssh2");
      ClientCtor = mod.Client;
    } catch {
      this.fail("Neither system ssh nor ssh2 succeeded; check SSH configuration", generation, true);
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
          generation,
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
    if (generation !== this.generation || this.stopped) return;
    const conn = new ClientCtor();
    this.ssh2Conn = conn;
    const connected = new Promise((res, rej) => {
      conn.on("ready", () => res());
      conn.on("error", (err) => rej(err instanceof Error ? err : new Error(String(err))));
      conn.on("close", () => {
        if (!this.stopped && generation === this.generation && this.state === "up" && this.ssh2Conn === conn) {
          this.fail("SSH connection closed", generation, true);
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
      this.fail(error instanceof Error ? error.message : String(error), generation, true);
      return;
    }
    if (this.stopped || generation !== this.generation) {
      this.teardown();
      return;
    }
    const server = createServer((socket) => {
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
      socket.on("error", () => socket.destroy());
      conn.forwardOut("127.0.0.1", 0, forward.host, forward.port, (err, stream) => {
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
      this.fail(`Cannot bind local forward port: ${error instanceof Error ? error.message : String(error)}`, generation, true);
      return;
    }
    if (generation !== this.generation || this.stopped) {
      this.teardown();
      return;
    }
    const address = server.address();
    if (address === null || typeof address === "string") {
      this.fail("Local forward server did not report a port", generation, true);
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
  return new Promise((resolve4) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve4(ok);
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
function hostKeyMatchesKnownHostsLine(line, key) {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("@")) return false;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 3) return false;
  const typeIndex = parts.findIndex((part) => /^(?:ssh|ecdsa|sk-ssh|sk-ecdsa)-/.test(part));
  if (typeIndex < 1 || parts[typeIndex + 1] === void 0) return false;
  const knownKey = Buffer.from(parts[typeIndex + 1], "base64");
  if (knownKey.byteLength === 0 || knownKey.byteLength !== key.byteLength) return false;
  return knownKey.equals(key);
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
      if (hostKeyMatchesKnownHostsLine(line, key)) return true;
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
function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function powershellQuote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
function remoteCredentialsPathForPowerShell(dshHome) {
  const normalized = dshHome.trim().replaceAll("\\", "/");
  if (/^[A-Za-z]:\//.test(normalized)) {
    return powershellQuote(normalized.replaceAll("/", "\\"));
  }
  const suffix = normalized === "~" ? "" : normalized.replace(/^~\//, "");
  const relative = suffix.replaceAll("/", "\\");
  return relative === "" ? "$env:USERPROFILE\\.dsh" : `$env:USERPROFILE\\${relative}`;
}
function buildRemoteCredentialsCatCommand(dshHome) {
  const home = dshHome.trim() || "~/.dsh";
  const tildeSuffix = home === "~" ? "" : home.startsWith("~/") ? home.slice(2) : void 0;
  if (tildeSuffix !== void 0) {
    const safe = tildeSuffix.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("$", "\\$").replaceAll("`", "\\`");
    const suffix = safe === "" ? "" : `/${safe}`;
    return `cat "$HOME${suffix}/.credentials.yaml" 2>/dev/null || true`;
  }
  return `cat ${shellQuote(`${home}/.credentials.yaml`)} 2>/dev/null || true`;
}
async function readRemoteCredentials(transport, dshHome) {
  const posix = await execSshCommand(
    transport,
    buildRemoteCredentialsCatCommand(dshHome),
    6e3
  );
  const posixText = posix.ok ? posix.stdout : "";
  if (parseSigningSecretFromCredentialsYaml(posixText) !== void 0) {
    return { ok: true, text: posixText };
  }
  const pathExpr = remoteCredentialsPathForPowerShell(dshHome);
  const windowsCommand = `powershell -NoProfile -NonInteractive -Command "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $p=${pathExpr}; if (Test-Path -LiteralPath $p) { Get-Content -LiteralPath $p -Raw }"`;
  const windows = await execSshCommand(transport, windowsCommand, 8e3);
  const windowsText = windows.ok ? windows.stdout : "";
  if (parseSigningSecretFromCredentialsYaml(windowsText) !== void 0) {
    return { ok: true, text: windowsText };
  }
  const details = [];
  if (!posix.ok) details.push(`POSIX: ${posix.error}`);
  if (!windows.ok) details.push(`PowerShell: ${windows.error}`);
  if (details.length === 0) {
    details.push("the file is empty or has no client-connection/browser-session secret");
  }
  return { ok: false, error: details.join("; ") };
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
        let stripped = false;
        for (const [id, entry] of Object.entries(raw.secrets)) {
          if (entry && typeof entry === "object") {
            if (entry.signingSecret !== void 0) stripped = true;
            const { signingSecret: _dropped, ...rest } = entry;
            this.secrets.set(id, rest);
          }
        }
        if (stripped) this.save();
      }
    } catch {
    }
  }
  save() {
    if (this.secretsFilePath === void 0) return;
    const dir = dirname2(this.secretsFilePath);
    mkdirSync(dir, { recursive: true });
    const tmp = `${this.secretsFilePath}.${randomUUID()}.tmp`;
    const doc = {
      version: 1,
      secrets: Object.fromEntries(this.secrets)
    };
    try {
      writeFileSync(tmp, JSON.stringify(doc, null, 2), { mode: 384 });
      try {
        chmodSync(tmp, 384);
      } catch {
      }
      copyFileSync(tmp, this.secretsFilePath);
      try {
        chmodSync(this.secretsFilePath, 384);
      } catch {
      }
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
      }
    }
  }
  removeDevice(deviceId) {
    if (this.secrets.delete(deviceId)) {
      this.save();
    }
  }
  /**
   * Drop cached cookies/bearer tokens after the remote rejected them, while
   * keeping the user-supplied credential and SSH passphrase for re-authentication.
   */
  invalidate(deviceId) {
    const current = this.secrets.get(deviceId);
    if (current === void 0) return;
    const next = { ...current, updatedAt: Date.now() };
    delete next.cookie;
    delete next.cookieAuthority;
    delete next.bearerToken;
    delete next.signingSecret;
    this.secrets.set(deviceId, next);
    this.save();
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
  /**
   * Persist a passphrase for an encrypted local SSH key.
   * `undefined` and `''` mean "the form did not supply a new value" and keep
   * the stored passphrase. Callers that intend to clear it pass `null`.
   */
  setSshPassphrase(deviceId, passphrase) {
    if (passphrase === void 0 || typeof passphrase === "string" && passphrase.trim() === "") return;
    const current = this.secrets.get(deviceId);
    const next = {
      ...current ?? { deviceId, updatedAt: Date.now() },
      deviceId,
      updatedAt: Date.now(),
      ...passphrase === null ? {} : { sshPassphrase: passphrase }
    };
    if (passphrase === null) delete next.sshPassphrase;
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
    if (!forceRefresh && existing?.cookie !== void 0 && existing.cookieAuthority === cookieAuthority) {
      return { ok: true };
    }
    const configuredCredential = auth.credential?.trim() || existing?.authCredential?.trim();
    if (configuredCredential !== void 0 && configuredCredential !== "") {
      const rawCred = configuredCredential;
      if (decodeBase64Url(rawCred)?.byteLength === 32) {
        const minted = mintDshBrowserCookie(cookieAuthority, rawCred);
        if (minted !== void 0) {
          const next = {
            ...existing ?? { deviceId: device.id, updatedAt: Date.now() },
            deviceId: device.id,
            cookie: minted,
            cookieAuthority,
            updatedAt: Date.now()
          };
          delete next.signingSecret;
          this.secrets.set(device.id, next);
          this.save();
          return { ok: true };
        }
        const exchanged = await this.exchangeLaunchToken(
          device.id,
          effectiveBaseUrl,
          authority,
          cookieAuthority,
          extractLaunchToken(rawCred)
        );
        if (exchanged.ok) return exchanged;
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
    if (device.transport.kind === "ssh" && auth.mode === "auto" && device.transport.bootstrapFromRemoteCredentials === true) {
      const dshHome = device.transport.remoteDshHome?.trim() || "~/.dsh";
      const read = await readRemoteCredentials(device.transport, dshHome);
      if (!read.ok) {
        return {
          ok: false,
          error: `SSH login succeeded, but reading ${dshHome}/.credentials.yaml failed: ${read.error}`
        };
      }
      const secret = parseSigningSecretFromCredentialsYaml(read.text);
      const minted = secret === void 0 ? void 0 : mintDshBrowserCookie(cookieAuthority, secret);
      if (minted === void 0) {
        return {
          ok: false,
          error: `SSH login succeeded, but ${dshHome}/.credentials.yaml has no client-connection/browser-session secret. Paste the launch URL, or confirm dsh web is installed on that machine.`
        };
      }
      const next = {
        ...existing ?? { deviceId: device.id, updatedAt: Date.now() },
        deviceId: device.id,
        cookie: minted,
        cookieAuthority,
        updatedAt: Date.now()
      };
      delete next.signingSecret;
      this.secrets.set(device.id, next);
      this.save();
      return { ok: true };
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
          const current = this.secrets.get(deviceId);
          this.secrets.set(deviceId, {
            ...current ?? { deviceId, updatedAt: Date.now() },
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
function parseGitConfigRemoteUrl(configText, options = {}) {
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
  return originUrl ?? (options.originOnly === true ? void 0 : fallbackUrl);
}
function discoverLocalGitRemote(directoryPath, options = {}) {
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
            return parseGitConfigRemoteUrl(readFileSync4(configFile, "utf8"), options);
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
                return parseGitConfigRemoteUrl(readFileSync4(commonConfig, "utf8"), options);
              }
            }
            const directConfig = join3(gitDir, "config");
            if (existsSync4(directConfig)) {
              return parseGitConfigRemoteUrl(readFileSync4(directConfig, "utf8"), options);
            }
            const parentConfig = resolve2(gitDir, "..", "..", "config");
            if (existsSync4(parentConfig)) {
              return parseGitConfigRemoteUrl(readFileSync4(parentConfig, "utf8"), options);
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
  prefixUnmatchedWithDevice: false,
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
   *
   * @param physicalList - every workspace known on the local and remote devices.
   * @param sessionUpdatedAtMap - activity timestamps used to order merged sessions.
   * @param deviceStates - live connection state per device. A device missing from
   *   the map is treated as connected so pure aggregation (tests, offline
   *   catalogs) keeps its historical behavior; the Host always passes real states.
   */
  aggregate(physicalList, sessionUpdatedAtMap = /* @__PURE__ */ new Map(), deviceStates = /* @__PURE__ */ new Map()) {
    const isOnline = (deviceId) => deviceId === LOCAL_DEVICE_ID || (deviceStates.get(deviceId) ?? "connected") === "connected";
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
          isOnline,
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
              sessionUpdatedAtMap,
              isOnline
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
      const title = customTitle ?? baseTitle;
      logicalWorkspaces.push({
        logicalWorkspaceId: workspaceId,
        title,
        kind: "single",
        ...entry.gitRemote !== void 0 ? { gitRemote: entry.gitRemote } : {},
        targetDeviceId: entry.input.deviceId,
        targetPath: entry.input.path,
        effectiveTargetDeviceId: entry.input.deviceId,
        effectiveTargetPath: entry.input.path,
        effectiveTargetOnline: isOnline(entry.input.deviceId),
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
  buildLogicalView(logicalId, kind, defaultTitle, gitRemote, members, sessionUpdatedAtMap, isOnline, rulePreferredDevice) {
    const customTitle = this.config.customTitleByLogicalId[logicalId];
    const configuredPreferred = this.config.preferredDeviceByLogicalId[logicalId] ?? rulePreferredDevice;
    const targetMember = (configuredPreferred !== void 0 ? members.find((m) => m.input.deviceId === configuredPreferred) : void 0) ?? members.find((m) => m.input.deviceId === LOCAL_DEVICE_ID) ?? members[0];
    const effectiveTargetMember = isOnline(targetMember.input.deviceId) ? targetMember : members.find((m) => m.input.deviceId === LOCAL_DEVICE_ID) ?? members.find((m) => isOnline(m.input.deviceId)) ?? targetMember;
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
      effectiveTargetDeviceId: effectiveTargetMember.input.deviceId,
      effectiveTargetPath: effectiveTargetMember.input.path,
      effectiveTargetOnline: isOnline(effectiveTargetMember.input.deviceId),
      members: members.map((m) => m.memberRef),
      sessionIds: mergedSessionIds,
      createdAt: earliestCreated,
      updatedAt: latestUpdated
    };
  }
};

// src/host/git-scan.ts
import { readdirSync as readdirSync2, statSync as statSync3 } from "node:fs";
import { join as join4, resolve as resolve3 } from "node:path";
var PRUNED_NAMES = /* @__PURE__ */ new Set([
  "node_modules",
  ".pnpm",
  "dist",
  "coverage",
  "target",
  "vendor",
  "Library",
  "Applications",
  "AppData"
]);
var DEFAULT_SCAN_DEPTH = 4;
var SCAN_MARKER = "__DSH_REPO__";
function deriveScanRoots(home, workspacePaths, extraRoots = []) {
  const roots = /* @__PURE__ */ new Set();
  const push = (candidate) => {
    if (candidate === void 0) return;
    const trimmed = candidate.trim();
    if (trimmed === "") return;
    roots.add(resolve3(trimmed));
  };
  for (const extra of extraRoots) push(extra);
  for (const path of workspacePaths) {
    const normalized = path.trim();
    if (normalized === "") continue;
    push(resolve3(normalized, ".."));
  }
  push(home);
  return [...roots].sort();
}
function shellQuote2(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function buildGitScanScript(roots, maxDepth = DEFAULT_SCAN_DEPTH) {
  const depth = Math.max(1, Math.trunc(maxDepth)) + 1;
  const rootList = roots.map(shellQuote2).join(" ");
  const prune = [...PRUNED_NAMES].map((name2) => `-name ${shellQuote2(name2)}`).join(" -o ");
  return [
    `for root in ${rootList}; do`,
    `  [ -d "$root" ] || continue`,
    `  find "$root" -mindepth 1 -maxdepth ${String(depth)}`,
    `    \\( ${prune} \\) -prune -o`,
    `    -name '.*' ! -name '.git' -prune -o`,
    `    -type d -name '.git' -print 2>/dev/null`,
    `done | while IFS= read -r g; do`,
    `  d=\${g%/.git}`,
    `  u=$(git -C "$d" config --get remote.origin.url 2>/dev/null || true)`,
    `  [ -n "$u" ] && printf '${SCAN_MARKER}\\t%s\\t%s\\n' "$d" "$u"`,
    `done`
  ].join("\n");
}
function parseGitScanOutput(stdout) {
  const byPath = /* @__PURE__ */ new Map();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(`${SCAN_MARKER}	`)) continue;
    const rest = line.slice(SCAN_MARKER.length + 1);
    const tab = rest.indexOf("	");
    if (tab <= 0) continue;
    const path = rest.slice(0, tab).trim();
    const rawOrigin = rest.slice(tab + 1).trim();
    if (path === "" || rawOrigin === "") continue;
    const gitRemote = normalizeGitRemote(rawOrigin);
    if (gitRemote === void 0) continue;
    if (!byPath.has(path)) byPath.set(path, { path, rawOrigin, gitRemote });
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
async function scanRemoteGitRepos(transport, roots, options = {}) {
  if (roots.length === 0) return { ok: true, repos: [] };
  const script = buildGitScanScript(roots, options.maxDepth ?? DEFAULT_SCAN_DEPTH);
  const res = await execSshCommand(transport, script, options.timeoutMs ?? 25e3);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, repos: parseGitScanOutput(res.stdout) };
}
function scanLocalGitRepos(roots, options = {}) {
  const maxDepth = options.maxDepth ?? DEFAULT_SCAN_DEPTH;
  const byPath = /* @__PURE__ */ new Map();
  const visited = /* @__PURE__ */ new Set();
  const walk = (directory, depth) => {
    if (visited.has(directory)) return;
    visited.add(directory);
    let entries;
    try {
      entries = readdirSync2(directory, { withFileTypes: true });
    } catch {
      return;
    }
    const hasDotGit = entries.some((entry) => entry.name === ".git" && entry.isDirectory());
    if (hasDotGit) {
      const rawOrigin = discoverLocalGitRemote(directory, { originOnly: true });
      if (rawOrigin !== void 0) {
        const gitRemote = normalizeGitRemote(rawOrigin);
        if (gitRemote !== void 0 && !byPath.has(directory)) {
          byPath.set(directory, { path: directory, rawOrigin, gitRemote });
        }
      }
      return;
    }
    if (depth >= maxDepth) return;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (PRUNED_NAMES.has(entry.name)) continue;
      walk(join4(directory, entry.name), depth + 1);
    }
  };
  for (const root of [...new Set(roots.map((r) => resolve3(r)))].sort()) {
    try {
      if (!statSync3(root).isDirectory()) continue;
    } catch {
      continue;
    }
    walk(root, 0);
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
function primaryRepoByOrigin(repos) {
  const chosen = /* @__PURE__ */ new Map();
  for (const repo of repos) {
    const existing = chosen.get(repo.gitRemote);
    if (existing === void 0 || repo.path.length < existing.path.length) {
      chosen.set(repo.gitRemote, repo);
    }
  }
  return chosen;
}

// src/host/git-match.ts
function createIdleGitMatch() {
  return {
    status: "idle",
    totalDevices: 0,
    processedDevices: 0,
    totalProjects: 0,
    processedProjects: 0,
    createdCount: 0,
    alreadyTrackedCount: 0,
    notFoundCount: 0,
    reports: []
  };
}
var GitMatchRunner = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  current = createIdleGitMatch();
  cancelled = false;
  active = false;
  get state() {
    return this.current;
  }
  get running() {
    return this.active;
  }
  /** Ask a running task to stop at the next safe point. */
  cancel() {
    if (!this.active) return false;
    this.cancelled = true;
    return true;
  }
  now() {
    return this.ctx.now?.() ?? Date.now();
  }
  emit(patch) {
    this.current = { ...this.current, ...patch };
    this.ctx.onProgress(this.current);
  }
  /** Execute the run. Resolves with the final state; never throws. */
  async execute() {
    if (this.active) return this.current;
    this.active = true;
    this.cancelled = false;
    const devices = [...this.ctx.devices()].sort((a, b) => {
      if (a.local !== b.local) return a.local ? -1 : 1;
      return a.deviceName.localeCompare(b.deviceName);
    });
    const reports = devices.map((device) => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      state: device.state,
      scanned: 0,
      created: [],
      alreadyTracked: 0,
      notFound: 0,
      errors: []
    }));
    const reportOf = new Map(reports.map((r) => [r.deviceId, r]));
    const startedAt = this.now();
    this.current = {
      ...createIdleGitMatch(),
      status: "running",
      startedAt,
      phase: "discovering",
      totalDevices: devices.length
    };
    this.ctx.onProgress(this.current);
    try {
      const seeds = await this.collectSeeds(devices, reportOf);
      if (this.cancelled) return this.finish("cancelled", reports);
      this.emit({
        phase: "scanning",
        totalProjects: seeds.length,
        processedProjects: 0
      });
      const scannedByDevice = /* @__PURE__ */ new Map();
      let processedDevices = 0;
      for (const device of devices) {
        if (this.cancelled) return this.finish("cancelled", reports);
        this.emit({
          phase: "scanning",
          currentDeviceId: device.deviceId,
          currentDeviceName: device.deviceName,
          currentProject: void 0
        });
        if (!this.isReachable(device)) {
          processedDevices += 1;
          this.emit({ processedDevices });
          continue;
        }
        const roots = deriveScanRoots(device.home, device.workspacePaths);
        const scan = device.local ? { ok: true, repos: this.ctx.scanLocalRepos(roots) } : await this.ctx.scanRemoteRepos(device.deviceId, roots);
        if (!scan.ok) {
          reportOf.get(device.deviceId)?.errors.push(scan.error);
        } else {
          const report = reportOf.get(device.deviceId);
          if (report !== void 0) report.scanned = scan.repos.length;
          scannedByDevice.set(device.deviceId, primaryRepoByOrigin(scan.repos));
        }
        processedDevices += 1;
        this.emit({ processedDevices });
      }
      this.emit({ phase: "creating" });
      const orderedSeeds = [...seeds].sort((a, b) => a.gitRemote.localeCompare(b.gitRemote));
      let processedProjects = 0;
      for (const seed of orderedSeeds) {
        if (this.cancelled) return this.finish("cancelled", reports);
        this.emit({ currentProject: seed.gitRemote });
        for (const device of devices) {
          const report = reportOf.get(device.deviceId);
          if (report === void 0) continue;
          if (seed.presentDeviceIds.has(device.deviceId)) {
            report.alreadyTracked += 1;
            continue;
          }
          if (!this.isReachable(device)) {
            continue;
          }
          const scanned = scannedByDevice.get(device.deviceId);
          const repo = scanned?.get(seed.gitRemote);
          if (repo === void 0) {
            report.notFound += 1;
            continue;
          }
          const created = device.local ? await this.ctx.createLocalWorkspace(repo.path) : await this.ctx.createRemoteWorkspace(device.deviceId, repo.path);
          if (!created.ok) {
            report.errors.push(`${repo.path}: ${created.error}`);
            continue;
          }
          this.ctx.noteOrigin(device.deviceId, repo.path, repo.rawOrigin);
          report.created.push({
            path: repo.path,
            gitRemote: seed.gitRemote,
            title: seed.sourceTitle,
            sourceDeviceName: seed.sourceDeviceName
          });
        }
        processedProjects += 1;
        this.emit({ processedProjects });
      }
      return this.finish(this.cancelled ? "cancelled" : "completed", reports);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.finish("failed", reports, message);
    }
  }
  /** Devices that are usable right now. Local always is; remotes need a live client. */
  isReachable(device) {
    if (device.local) return true;
    return device.state === "connected";
  }
  /**
   * Read every registered workspace origin, then keep the repositories that at
   * least one device is missing.
   */
  async collectSeeds(devices, reportOf) {
    const seeds = /* @__PURE__ */ new Map();
    for (const device of devices) {
      if (this.cancelled) break;
      this.emit({
        phase: "discovering",
        currentDeviceId: device.deviceId,
        currentDeviceName: device.deviceName
      });
      if (!this.isReachable(device)) {
        reportOf.get(device.deviceId)?.errors.push(
          device.state === "disabled" ? "Device is disabled" : "Device is not connected"
        );
        continue;
      }
      const origins = device.local ? await this.discoverLocalOrigins(device.workspacePaths) : await this.ctx.discoverRemoteOrigins(device.deviceId, device.workspacePaths);
      for (const [path, rawOrigin] of origins) {
        const gitRemote = normalizeGitRemote(rawOrigin);
        if (gitRemote === void 0) continue;
        const seed = seeds.get(gitRemote);
        if (seed === void 0) {
          seeds.set(gitRemote, {
            gitRemote,
            sourceDeviceName: device.deviceName,
            sourceTitle: titleFromPath(path),
            presentDeviceIds: /* @__PURE__ */ new Set([device.deviceId])
          });
          continue;
        }
        seed.presentDeviceIds.add(device.deviceId);
      }
    }
    return [...seeds.values()].filter((seed) => seed.presentDeviceIds.size < devices.length);
  }
  async discoverLocalOrigins(paths) {
    const found = /* @__PURE__ */ new Map();
    for (const path of paths) {
      const raw = discoverLocalGitRemote(path, { originOnly: true });
      if (raw !== void 0 && raw.trim() !== "") found.set(path, raw);
    }
    return found;
  }
  finish(status, reports, error) {
    const finished = reports.map((report) => ({
      deviceId: report.deviceId,
      deviceName: report.deviceName,
      state: report.state,
      scanned: report.scanned,
      created: [...report.created],
      alreadyTracked: report.alreadyTracked,
      notFound: report.notFound,
      ...report.errors.length > 0 ? { error: report.errors.join("; ") } : {}
    }));
    const createdCount = finished.reduce((sum, report) => sum + report.created.length, 0);
    const alreadyTrackedCount = finished.reduce((sum, report) => sum + report.alreadyTracked, 0);
    const notFoundCount = finished.reduce((sum, report) => sum + report.notFound, 0);
    this.current = {
      ...this.current,
      status,
      phase: "finished",
      finishedAt: this.now(),
      createdCount,
      alreadyTrackedCount,
      notFoundCount,
      reports: finished,
      ...error !== void 0 ? { error } : {},
      currentDeviceId: void 0,
      currentDeviceName: void 0,
      currentProject: void 0,
      processedProjects: this.current.totalProjects,
      processedDevices: this.current.totalDevices
    };
    this.active = false;
    this.ctx.onProgress(this.current);
    return this.current;
  }
};
function titleFromPath(path) {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? path;
}

// src/host/native-bridge.ts
var NATIVE_BRIDGE_SCRIPT_PATH = "/__md/bridge.js";
var NATIVE_BRIDGE_SOCKET_PATH = "/__md/bridge";
var NATIVE_BRIDGE_SCRIPT = String.raw`(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;
  var params;
  try { params = new URL(script.src).searchParams; } catch (error) { return; }
  var deviceId = params.get('device') || '';

  var initialGroups = {};
  var initialUnread = [];
  try {
    if (window.__DSH_MD_GROUPS__ && typeof window.__DSH_MD_GROUPS__ === 'object' && !Array.isArray(window.__DSH_MD_GROUPS__)) {
      initialGroups = window.__DSH_MD_GROUPS__;
    }
    if (Array.isArray(window.__DSH_MD_UNREAD__)) initialUnread = window.__DSH_MD_UNREAD__;
  } catch (error) {}

  var socket = null;
  var retryTimer = null;
  var readySent = false;
  var failedReason = null;
  var captured = null;
  var lastSelection = null;

  // Workspace fold state is owned by the local Host. The injected prefix is
  // applied before the workspace browser first renders, so there is no
  // collapsed-then-expanded flash.
  var groups = normalizeGroups(initialGroups);
  var groupSyncInstalled = false;
  var groupSendTimer = null;
  var groupEchoGuard = false;

  // Session completion reminders are owned by the local Host too. Native and
  // aggregated surfaces both overlay this set instead of DSH's in-memory one.
  var unread = {};
  for (var initialUnreadIndex = 0; initialUnreadIndex < initialUnread.length; initialUnreadIndex += 1) {
    if (typeof initialUnread[initialUnreadIndex] === 'string' && initialUnread[initialUnreadIndex] !== '') {
      unread[initialUnread[initialUnreadIndex]] = true;
    }
  }
  var readOverlayInstalled = false;
  var readOverlayTries = 0;
  var readListeners = [];
  var mergedStatusCache = null;

  function send(message) {
    if (!socket || socket.readyState !== 1) return false;
    try { socket.send(JSON.stringify(message)); return true; } catch (error) { return false; }
  }

  function currentSelection() {
    if (!captured) return null;
    try {
      var selection = captured.uiWorkspace && captured.uiWorkspace.selection;
      if (selection && typeof selection.getSnapshot === 'function') {
        var value = selection.getSnapshot();
        if (value && typeof value.sessionId === 'string') return value.sessionId;
      }
    } catch (error) {}
    try {
      var list = captured.sessions && captured.sessions.list && captured.sessions.list.getSnapshot();
      if (list && list.byId) {
        var keys = Object.keys(list.byId);
        for (var i = 0; i < keys.length; i += 1) {
          var row = list.byId[keys[i]];
          if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) {
            return row.id || keys[i];
          }
        }
      }
    } catch (error) {}
    return null;
  }

  function report() {
    if (!readySent) return;
    var sessionId = currentSelection();
    if (sessionId !== lastSelection) {
      lastSelection = sessionId;
      send({ type: 'selection', sessionId: sessionId });
    }
    // A completion that arrives while its conversation is already on screen
    // must not leave a reminder behind. Clearing here also covers the Host
    // snapshot that marks the Session unread a moment before this report.
    if (sessionId && unread[sessionId] === true) {
      delete unread[sessionId];
      notifyRead();
      send({ type: 'read', sessionId: sessionId });
    }
  }

  function refreshSessions() {
    if (!captured || !captured.sessions || typeof captured.sessions.refresh !== 'function') return;
    try {
      var pending = captured.sessions.refresh();
      if (pending && typeof pending.catch === 'function') pending.catch(function () {});
    } catch (error) {}
  }

  function openSession(sessionId) {
    if (!captured || typeof sessionId !== 'string' || sessionId === '') return;
    var workspace = captured.uiWorkspace;
    if (!workspace || typeof workspace.openSession !== 'function') return;
    var run = function () {
      try { workspace.openSession(sessionId); } catch (error) {}
      report();
    };
    if (captured.sessions && typeof captured.sessions.refresh === 'function') {
      try {
        var pending = captured.sessions.refresh();
        if (pending && typeof pending.then === 'function') pending.then(run, run);
        else run();
      } catch (error) { run(); }
      return;
    }
    run();
  }

  function normalizeGroups(value) {
    var out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length && i < 1000; i += 1) {
      var key = keys[i];
      if (typeof key !== 'string' || key === '' || key.length > 256) continue;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (typeof value[key] === 'boolean') out[key] = value[key];
    }
    return out;
  }

  function sameGroups(left, right) {
    var leftKeys = Object.keys(left);
    var rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (var i = 0; i < leftKeys.length; i += 1) {
      if (left[leftKeys[i]] !== right[leftKeys[i]]) return false;
    }
    return true;
  }

  function sendGroups() {
    if (groupSendTimer !== null) return;
    groupSendTimer = setTimeout(function () {
      groupSendTimer = null;
      send({ type: 'group-expansion', groups: groups });
    }, 120);
  }

  function applyGroupState(next) {
    var incoming = normalizeGroups(next);
    // Keep locally observed keys the Host has not reported yet: a fold click
    // may be mid-debounce when another client broadcasts its map. DSH's own
    // retainAccountKeys prunes deleted workspaces on both sides.
    var merged = {};
    var existing = Object.keys(groups);
    for (var existingIndex = 0; existingIndex < existing.length; existingIndex += 1) {
      merged[existing[existingIndex]] = groups[existing[existingIndex]];
    }
    var incomingKeys = Object.keys(incoming);
    for (var incomingIndex = 0; incomingIndex < incomingKeys.length; incomingIndex += 1) {
      merged[incomingKeys[incomingIndex]] = incoming[incomingKeys[incomingIndex]];
    }
    groups = merged;
    if (!captured) return;
    var workspace = captured.uiWorkspace;
    var view = workspace && workspace.view;
    if (!view || typeof view.setGroupExpanded !== 'function') return;
    groupEchoGuard = true;
    try {
      for (var i = 0; i < incomingKeys.length; i += 1) {
        try { view.setGroupExpanded(incomingKeys[i], merged[incomingKeys[i]]); } catch (error) {}
      }
    } finally {
      groupEchoGuard = false;
    }
  }

  function installGroupSync(context) {
    if (groupSyncInstalled) return true;
    var workspace = context && context.uiWorkspace;
    var view = workspace && workspace.view;
    if (!view || typeof view.setGroupExpanded !== 'function') return false;
    groupSyncInstalled = true;
    var originalSet = view.setGroupExpanded;
    view.setGroupExpanded = function (key, expanded) {
      var result = originalSet.call(this, key, expanded);
      if (!groupEchoGuard) {
        try {
          groups[String(key)] = expanded === true;
          sendGroups();
        } catch (error) {}
      }
      return result;
    };
    var originalRetain = view.retainAccountKeys;
    if (typeof originalRetain === 'function') {
      view.retainAccountKeys = function (keys) {
        var result = originalRetain.call(this, keys);
        if (!groupEchoGuard) {
          try {
            var retained = {};
            for (var i = 0; i < keys.length; i += 1) {
              var key = keys[i];
              if (Object.prototype.hasOwnProperty.call(groups, key)) retained[key] = groups[key];
            }
            groups = retained;
            sendGroups();
          } catch (error) {}
        }
        return result;
      };
    }
    applyGroupState(groups);
    return true;
  }

  // Storage-level fallback: even when a future workspace build stops going
  // through the view.setGroupExpanded action we can still observe the
  // persisted state and report it. The Host remains authoritative.
  function installStorageGroupFallback() {
    try {
      var proto = window.Storage && window.Storage.prototype;
      if (!proto || typeof proto.setItem !== 'function' || proto.setItem.__dshMdWrapped) return;
      var originalSetItem = proto.setItem;
      var wrapped = function (key, value) {
        // Capture even when the underlying write throws: some browsers block
        // third-party localStorage, and the Host mirror is still authoritative.
        try {
          if (!groupEchoGuard && typeof key === 'string' && key.indexOf('dsh.workspace.view.') === 0) {
            var parsed = JSON.parse(String(value));
            if (parsed && parsed.groupExpansion && typeof parsed.groupExpansion === 'object') {
              var next = normalizeGroups(parsed.groupExpansion);
              if (!sameGroups(groups, next)) {
                groups = next;
                sendGroups();
              }
            }
          }
        } catch (error) {}
        return originalSetItem.apply(this, arguments);
      };
      wrapped.__dshMdWrapped = true;
      proto.setItem = wrapped;
    } catch (error) {}
  }

  function sameStatusMap(left, right) {
    if (left === right) return true;
    if (!left || !right || left.size !== right.size) return false;
    var same = true;
    left.forEach(function (value, key) {
      var candidate = right.get(key);
      if (
        candidate === undefined ||
        candidate.running !== value.running ||
        candidate.pendingInteraction !== value.pendingInteraction ||
        candidate.completionUnread !== value.completionUnread
      ) {
        same = false;
      }
    });
    return same;
  }

  function mergeStatus(base) {
    if (!base || typeof base.forEach !== 'function') return new Map();
    var next = new Map();
    base.forEach(function (value, key) {
      var unreadNow = unread[key] === true;
      if (value && value.completionUnread === unreadNow) {
        next.set(key, value);
        return;
      }
      var copy = {};
      for (var field in value) copy[field] = value[field];
      copy.completionUnread = unreadNow;
      next.set(key, copy);
    });
    return next;
  }

  function notifyRead() {
    mergedStatusCache = null;
    for (var i = 0; i < readListeners.length; i += 1) {
      try { readListeners[i](); } catch (error) {}
    }
  }

  function installReadOverlay(context) {
    if (readOverlayInstalled) return true;
    var service = null;
    try { service = context && context.uiSession; } catch (error) {}
    if (!service) {
      try { service = context && typeof context.get === 'function' ? context.get('uiSession') : null; } catch (error) {}
    }
    var source = service && service.sessionStatus;
    if (!source || typeof source.getSnapshot !== 'function' || typeof source.subscribe !== 'function') return false;
    readOverlayInstalled = true;
    var originalGet = source.getSnapshot;
    var originalSubscribe = source.subscribe;
    mergedStatusCache = null;
    source.getSnapshot = function () {
      var next = mergeStatus(originalGet.call(source));
      if (mergedStatusCache !== null && sameStatusMap(mergedStatusCache, next)) return mergedStatusCache;
      mergedStatusCache = next;
      return mergedStatusCache;
    };
    source.subscribe = function (listener) {
      var off = originalSubscribe.call(source, listener);
      readListeners.push(listener);
      return function () {
        try { off(); } catch (error) {}
        var index = readListeners.indexOf(listener);
        if (index !== -1) readListeners.splice(index, 1);
      };
    };
    return true;
  }

  function retryReadOverlay() {
    if (readOverlayInstalled || !captured) return;
    readOverlayTries += 1;
    if (readOverlayTries > 100) return;
    try {
      if (!installReadOverlay(captured)) setTimeout(retryReadOverlay, 100);
    } catch (error) {}
  }

  function clearUnreadForSelection() {
    var current = lastSelection;
    if (current === null) current = currentSelection();
    if (current && unread[current] === true) {
      delete unread[current];
      notifyRead();
      send({ type: 'read', sessionId: current });
    }
  }

  function setUnreadState(ids) {
    var next = {};
    if (Array.isArray(ids)) {
      for (var i = 0; i < ids.length && i < 2000; i += 1) {
        if (typeof ids[i] === 'string' && ids[i] !== '') next[ids[i]] = true;
      }
    }
    unread = next;
    notifyRead();
    clearUnreadForSelection();
  }

  // Pane embedding hides the remote left sidebar. Native/full mode must get it
  // back: the Host sends set-embedded whenever the same framed page changes
  // between the aggregated pane and the full native tab.
  var embedded = false;
  var originalColumns = null;
  var originalSidebarVisibility = null;
  var originalSidebarPointerEvents = null;
  var embedTimer = null;
  var sidebarObserver = null;
  var sidebarScheduled = false;

  function findSidebar() {
    // Prefer the direct child of the app frame; fall back to the first match
    // for shells whose CSS-module prefix changed.
    return document.querySelector('[class*="_frame"] > [class*="_sidebarCol"]')
      || document.querySelector('[class*="_sidebarCol"]');
  }

  function applyEmbedded() {
    var sidebar = findSidebar();
    if (!sidebar) return false;
    var frame = sidebar.parentElement;
    if (!embedded) {
      if (frame && originalColumns !== null) {
        try { frame.style.gridTemplateColumns = originalColumns; } catch (error) {}
      }
      if (originalSidebarVisibility !== null) {
        try { sidebar.style.visibility = originalSidebarVisibility; } catch (error) {}
      }
      if (originalSidebarPointerEvents !== null) {
        try { sidebar.style.pointerEvents = originalSidebarPointerEvents; } catch (error) {}
      }
      if (frame) {
        try { frame.removeAttribute('data-dsh-md-native-pane'); } catch (error) {}
      }
      originalColumns = null;
      originalSidebarVisibility = null;
      originalSidebarPointerEvents = null;
      return true;
    }

    // The sidebar is a grid item, not a floating overlay. Hiding it with
    // display:none removes that grid item, so the centre column shifts into
    // the first (collapsed 0px) track and the framed conversation becomes an
    // empty page. Keep the item in the grid and only make it invisible.
    var sidebarDisplay = 'block';
    try {
      var sidebarStyle = window.getComputedStyle(sidebar);
      if (sidebarStyle && sidebarStyle.display) sidebarDisplay = sidebarStyle.display;
    } catch (error) {}

    if (frame) {
      if (sidebarDisplay !== 'none') {
        try {
          var inline = frame.style.gridTemplateColumns || '';
          var current = inline;
          if (!current) {
            try { current = window.getComputedStyle(frame).gridTemplateColumns || ''; } catch (error) {}
          }
          var parts = current.split(/\s+/).filter(function (part) { return part !== ''; });
          if (parts.length >= 2) {
            if (parts[0] !== '0px') {
              // Remember the shell's own value (or an empty inline style, which
              // lets React/CSS resize freely after leaving the pane).
              originalColumns = inline;
              parts[0] = '0px';
              frame.style.gridTemplateColumns = parts.join(' ');
            }
          }
        } catch (error) {}
      }
      try {
        if (frame.getAttribute('data-dsh-md-native-pane') !== '1') {
          frame.setAttribute('data-dsh-md-native-pane', '1');
        }
      } catch (error) {}
    }
    if (sidebarDisplay !== 'none') {
      if (originalSidebarVisibility === null) originalSidebarVisibility = sidebar.style.visibility || '';
      if (originalSidebarPointerEvents === null) originalSidebarPointerEvents = sidebar.style.pointerEvents || '';
      try {
        sidebar.style.visibility = 'hidden';
        sidebar.style.pointerEvents = 'none';
      } catch (error) {}
    }
    return true;
  }

  function startSidebarObserver() {
    if (sidebarObserver || typeof MutationObserver === 'undefined') return;
    // React can rewrite the inline grid template on resize/theme changes.
    // Reapply on an animation frame (never synchronously in the observer,
    // which would loop on our own style writes). The observer only exists
    // while the pane is embedded; native mode pays nothing.
    var scheduleHide = function () {
      if (!embedded || sidebarScheduled) return;
      sidebarScheduled = true;
      var run = function () {
        sidebarScheduled = false;
        try { applyEmbedded(); } catch (error) {}
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else setTimeout(run, 16);
    };
    try {
      sidebarObserver = new MutationObserver(scheduleHide);
      sidebarObserver.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    } catch (error) {
      sidebarObserver = null;
    }
  }

  function stopSidebarObserver() {
    if (!sidebarObserver) return;
    try { sidebarObserver.disconnect(); } catch (error) {}
    sidebarObserver = null;
  }

  function setEmbedded(enabled) {
    embedded = enabled === true;
    if (embedTimer !== null) {
      clearInterval(embedTimer);
      embedTimer = null;
    }
    applyEmbedded();
    if (!embedded) {
      stopSidebarObserver();
      return;
    }
    startSidebarObserver();
    var tries = 0;
    embedTimer = setInterval(function () {
      tries += 1;
      if (applyEmbedded() || tries > 80) {
        clearInterval(embedTimer);
        embedTimer = null;
      }
    }, 250);
  }

  function capture(context) {
    if (!context || captured === context) return;
    captured = context;
    try { installGroupSync(context); } catch (error) {}
    try { installReadOverlay(context); } catch (error) {}
    var tries = 0;
    var finish = function () {
      tries += 1;
      var workspace = captured && captured.uiWorkspace;
      var selection = workspace && workspace.selection;
      var sessions = captured && captured.sessions;
      if (!workspace || !selection || !sessions || !sessions.list) {
        if (tries < 80) { setTimeout(finish, 50); return; }
        fail('the DSH workspace/session services were not captured');
        return;
      }
      try { selection.subscribe(report); } catch (error) {}
      try { sessions.list.subscribe(report); } catch (error) {}
      readySent = true;
      send({ type: 'ready', deviceId: deviceId });
      report();
      if (!readOverlayInstalled) retryReadOverlay();
    };
    finish();
  }

  function fail(reason) {
    if (readySent) return;
    failedReason = reason;
    send({ type: 'failed', error: reason });
  }

  function connect() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      socket = new WebSocket(protocol + '//' + location.host + '/__md/bridge?device=' + encodeURIComponent(deviceId));
    } catch (error) {
      socket = null;
      schedule();
      return;
    }
    socket.addEventListener('open', function () {
      if (readySent) send({ type: 'ready', deviceId: deviceId });
      else if (failedReason) send({ type: 'failed', error: failedReason });
      report();
      if (groupSyncInstalled) sendGroups();
    });
    socket.addEventListener('message', function (event) {
      var data;
      try { data = JSON.parse(event.data); } catch (error) { return; }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'open-session' && typeof data.sessionId === 'string') openSession(data.sessionId);
      else if (data.type === 'refresh') refreshSessions();
      else if (data.type === 'set-embedded') setEmbedded(data.enabled === true);
      else if (data.type === 'group-expansion') applyGroupState(data.groups);
      else if (data.type === 'read-state') setUnreadState(data.unreadSessionIds);
    });
    socket.addEventListener('close', function () {
      socket = null;
      schedule();
    });
    socket.addEventListener('error', function () {
      try { if (socket) socket.close(); } catch (error) {}
    });
  }

  function schedule() {
    if (retryTimer !== null) return;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      connect();
    }, 1200);
  }

  // DSH's head injection defines window.__ModuleLoader__ immediately after
  // this classic script. A plain read here would be undefined, so install an
  // accessor first: the queue assignment is captured before any module script
  // runs, and the workspace registration is rewritten before it is queued.
  var loaderValue = null;

  function rewriteRegistration(record) {
    if (record && record.id === '@deepseek-ai/dsh-client-ui-workspace' && typeof record.factory === 'function') {
      var originalFactory = record.factory;
      var copy = {};
      for (var key in record) copy[key] = record[key];
      copy.factory = function (require) {
        var exports = originalFactory(require);
        // Never let instrumentation break the remote page: a frozen export or
        // a changed shape simply leaves the bridge un-ready and the local
        // mirror in charge.
        try {
          if (exports && typeof exports.apply === 'function' && !exports.__dshMdNativeBridge) {
            var originalApply = exports.apply;
            exports.apply = function (context) {
              var result = originalApply(context);
              try { capture(context); } catch (error) {}
              return result;
            };
            exports.__dshMdNativeBridge = true;
          }
        } catch (error) {}
        return exports;
      };
      return copy;
    }
    return record;
  }

  function wrapLoadSink(loader) {
    if (!loader) return;
    var current = loader.load;
    if (typeof current !== 'function' || current.__dshMdWrapped) return;
    var wrapped = function (record) {
      try { record = rewriteRegistration(record); } catch (error) {}
      return current.call(loader, record);
    };
    wrapped.__dshMdWrapped = true;
    loader.load = wrapped;
  }

  function wrapCreate(loader) {
    if (!loader || typeof loader.create !== 'function' || loader.create.__dshMdWrapped) return;
    var originalCreate = loader.create;
    var wrapped = function () {
      var result = originalCreate.apply(this, arguments);
      // create() assigns the live registration sink over loader.load; wrap the
      // new sink so application bundles loaded afterwards are intercepted.
      try { wrapLoadSink(this && typeof this.load === 'function' ? this : loader); } catch (error) {}
      return result;
    };
    wrapped.__dshMdWrapped = true;
    loader.create = wrapped;
  }

  function wrapLoader(loader) {
    if (!loader) return;
    wrapLoadSink(loader);
    wrapCreate(loader);
  }

  function installLoaderHook() {
    var existing = null;
    try { existing = window.__ModuleLoader__; } catch (error) {}
    loaderValue = existing || null;
    try {
      Object.defineProperty(window, '__ModuleLoader__', {
        configurable: true,
        enumerable: true,
        get: function () { return loaderValue; },
        set: function (value) {
          loaderValue = value;
          try { wrapLoader(value); } catch (error) {}
        }
      });
    } catch (error) {
      // A non-configurable loader means the shell ran first; wrap what exists.
    }
    if (loaderValue) {
      try { wrapLoader(loaderValue); } catch (error) {}
    }
  }

  try {
    installStorageGroupFallback();
  } catch (error) {}

  try {
    installLoaderHook();
  } catch (error) {
    fail('the DSH client module loader could not be wrapped');
  }

  setTimeout(function () {
    if (!readySent) fail('the DSH workspace service was not available within 10s');
  }, 10000);

  connect();
})();`;
function sanitizeGroupState(value) {
  const out = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  let index = 0;
  for (const [key, expanded] of Object.entries(value)) {
    if (index >= 1e3) break;
    if (typeof key !== "string" || key === "" || key.length > 256) continue;
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (typeof expanded !== "boolean") continue;
    out[key] = expanded;
    index += 1;
  }
  return out;
}
function jsonForInlineScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}
function buildNativeBridgeScript(state = {}) {
  const groups = sanitizeGroupState(state.groups);
  const unread = Array.isArray(state.unread) ? state.unread.filter((id) => typeof id === "string" && id !== "" && id.length <= 512).slice(0, 2e3) : [];
  return [
    `window.__DSH_MD_GROUPS__ = ${jsonForInlineScript(groups)};`,
    `window.__DSH_MD_UNREAD__ = ${jsonForInlineScript(unread)};`,
    NATIVE_BRIDGE_SCRIPT
  ].join("\n");
}
function injectNativeBridge(html, options) {
  if (html.includes("data-dsh-md-native-bridge")) return html;
  const query = `device=${encodeURIComponent(options.deviceId)}`;
  const tag = `<script data-dsh-md-native-bridge="1" src="${NATIVE_BRIDGE_SCRIPT_PATH}?${query}"></script>`;
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (head !== null) {
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}${tag}${html.slice(at)}`;
  }
  const htmlTag = /<html(?:\s[^>]*)?>/i.exec(html);
  if (htmlTag !== null) {
    const at = htmlTag.index + htmlTag[0].length;
    return `${html.slice(0, at)}<head>${tag}</head>${html.slice(at)}`;
  }
  return `${tag}${html}`;
}
function isNativeBridgeScriptPath(pathname) {
  return pathname === NATIVE_BRIDGE_SCRIPT_PATH;
}
function isNativeBridgeSocketPath(pathname) {
  return pathname === NATIVE_BRIDGE_SOCKET_PATH;
}

// src/host/native-proxy.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import {
  createServer as createServer2,
  request as httpRequest2
} from "node:http";
import { request as httpsRequest2 } from "node:https";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { WebSocket, WebSocketServer } from "ws";
var PROXY_TOKEN_QUERY = "md_token";
var PROXY_COOKIE_NAME = "dsh-md-native";
var HOP_BY_HOP_HEADERS = /* @__PURE__ */ new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);
var CLIENT_AUTH_HEADERS = /* @__PURE__ */ new Set(["cookie", "authorization", "proxy-authorization"]);
function isHopByHopHeader(name2) {
  return HOP_BY_HOP_HEADERS.has(name2.toLowerCase());
}
function buildForwardHeaders(incoming, injected) {
  const out = {};
  for (const [key, val] of Object.entries(incoming)) {
    if (val === void 0) continue;
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "origin" || lower === "referer") continue;
    if (lower !== "connection" && lower !== "upgrade" && isHopByHopHeader(lower)) continue;
    if (CLIENT_AUTH_HEADERS.has(lower)) continue;
    if (lower.startsWith("proxy-") || lower.startsWith("x-forwarded-")) continue;
    out[key] = val;
  }
  out["host"] = injected.host;
  if (injected.origin !== void 0) out["origin"] = injected.origin;
  if (injected.cookie !== void 0) out["cookie"] = injected.cookie;
  if (injected.authorization !== void 0) out["authorization"] = injected.authorization;
  return out;
}
function sameGroupState(left, right) {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}
var MAX_INJECTABLE_HTML_BYTES = 20 * 1024 * 1024;
var BRIDGE_READY_TIMEOUT_MS = 15e3;
var NativeDeviceProxy = class {
  constructor(device, getUpstreamBaseUrl, authManager, localOrigin, hooks = {}) {
    this.device = device;
    this.getUpstreamBaseUrl = getUpstreamBaseUrl;
    this.authManager = authManager;
    this.localOrigin = localOrigin;
    this.hooks = hooks;
    this.refreshHostState(device);
  }
  server;
  localPort;
  sockets = /* @__PURE__ */ new Set();
  stopped = false;
  lastAuthAttemptAt = 0;
  lastAuthRecoveryAt = 0;
  token = randomUUID2().replaceAll("-", "");
  bridgeServer;
  bridgeClients = /* @__PURE__ */ new Set();
  bridgeState = "idle";
  bridgeError;
  bridgeSessionId;
  bridgeReadyTimer;
  pendingOpenSession;
  /** Pane mode hides the remote sidebar; native full mode restores it. */
  bridgeEmbedded = false;
  /** Host-owned workspace fold state, applied before the remote page's first render. */
  groupState = {};
  /** Host-owned raw Session IDs whose completion is unread. */
  unreadState = [];
  updateDevice(device) {
    this.device = device;
    this.refreshHostState(device);
  }
  refreshHostState(device) {
    this.groupState = sanitizeGroupState(this.hooks.getGroupState?.(device.id));
    this.unreadState = this.hooks.getUnreadState?.(device.id) ?? [];
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
      const parsed = parseOriginForm(req.url);
      if (parsed !== void 0 && isNativeBridgeSocketPath(parsed.pathname)) {
        this.handleBridgeUpgrade(req, socket, head);
        return;
      }
      this.handleUpgrade(req, socket, head);
    });
    server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
    });
    await new Promise((resolve4, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve4());
    });
    const addr = server.address();
    if (addr !== null && typeof addr === "object") {
      this.localPort = addr.port;
    }
    this.bridgeServer = new WebSocketServer({ noServer: true });
    this.server = server;
  }
  stop() {
    this.stopped = true;
    this.clearBridgeTimer();
    for (const client of this.bridgeClients) {
      try {
        client.close();
      } catch {
      }
    }
    this.bridgeClients.clear();
    this.bridgeServer?.close();
    this.bridgeServer = void 0;
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
    this.setBridgeState("idle");
  }
  /** Current bridge lifecycle, for the Host snapshot. */
  bridgeSnapshot() {
    return {
      state: this.bridgeState,
      ...this.bridgeError !== void 0 ? { error: this.bridgeError } : {},
      ...this.bridgeSessionId !== void 0 ? { sessionId: this.bridgeSessionId } : {}
    };
  }
  /**
   * Ask the framed page to open one raw remote Session. The command is held
   * until the bridge reports readiness so a not-yet-loaded frame still lands on
   * the Session the aggregated sidebar selected.
   */
  openSession(sessionId) {
    this.pendingOpenSession = sessionId;
    this.sendToBridge({ type: "open-session", sessionId });
  }
  /** Ask the framed page to refresh its own Session list (after fork/create). */
  requestRefresh() {
    this.sendToBridge({ type: "refresh" });
  }
  /** Switch the same framed page between embedded pane and full native mode. */
  setEmbedded(enabled) {
    if (this.bridgeEmbedded === enabled) return;
    this.bridgeEmbedded = enabled;
    this.sendToBridge({ type: "set-embedded", enabled });
  }
  /** Apply Host-owned fold state to the framed page and every open client. */
  setGroupState(groups) {
    const next = sanitizeGroupState(groups);
    if (sameGroupState(this.groupState, next)) return;
    this.groupState = next;
    this.sendToBridge({ type: "group-expansion", groups: next });
  }
  /** Apply Host-owned unread state to the framed page. */
  setUnreadState(unreadSessionIds) {
    const next = [...unreadSessionIds];
    if (next.length === this.unreadState.length && next.every((id, index) => id === this.unreadState[index])) {
      return;
    }
    this.unreadState = next;
    this.sendToBridge({ type: "read-state", unreadSessionIds: next });
  }
  /** Reset the cached bridge command target (device switched away). */
  clearPendingSession() {
    this.pendingOpenSession = void 0;
  }
  sendToBridge(message) {
    const data = JSON.stringify(message);
    for (const client of this.bridgeClients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      try {
        client.send(data);
      } catch {
      }
    }
  }
  setBridgeState(state, error) {
    const nextError = error?.trim() === "" ? void 0 : error;
    if (this.bridgeState === state && this.bridgeError === nextError) return;
    this.bridgeState = state;
    this.bridgeError = nextError;
    this.hooks.onBridgeState?.(this.device.id, state, nextError);
  }
  clearBridgeTimer() {
    if (this.bridgeReadyTimer !== void 0) {
      clearTimeout(this.bridgeReadyTimer);
      this.bridgeReadyTimer = void 0;
    }
  }
  armBridgeTimer() {
    this.clearBridgeTimer();
    const timer = setTimeout(() => {
      this.bridgeReadyTimer = void 0;
      if (this.bridgeState === "ready") return;
      this.setBridgeState("failed", "the framed page never reported a ready bridge");
    }, BRIDGE_READY_TIMEOUT_MS);
    timer.unref?.();
    this.bridgeReadyTimer = timer;
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
    const rawTarget = stripProxyTokenFromRawTarget(req.url ?? "/");
    const requestUrl = new URL(req.url ?? "/", proxyOrigin);
    const queryToken = requestUrl.searchParams.get(PROXY_TOKEN_QUERY);
    const cookieToken = readCookie(req.headers.cookie, PROXY_COOKIE_NAME);
    if (queryToken === this.token && cookieToken !== this.token) {
      res.writeHead(302, {
        location: rawTarget,
        "set-cookie": `${PROXY_COOKIE_NAME}=${this.token}; Path=/; HttpOnly; SameSite=Lax`,
        "cache-control": "no-store"
      });
      res.end();
      return;
    }
    if (cookieToken !== this.token) {
      res.writeHead(403, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(renderProxyRejectedHtml("\u4EE3\u7406\u8BBF\u95EE\u4EE4\u724C\u7F3A\u5931\u6216\u4E0E\u5F53\u524D\u9875\u9762\u4E0D\u5339\u914D\u3002"));
      return;
    }
    if (req.headers["sec-fetch-site"] === "cross-site") {
      res.writeHead(403, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(renderProxyRejectedHtml("\u8BE5\u8BF7\u6C42\u6765\u81EA\u8DE8\u7AD9\u4E0A\u4E0B\u6587\uFF0C\u5DF2\u88AB\u4EE3\u7406\u62D2\u7EDD\u3002"));
      return;
    }
    if (isNativeBridgeScriptPath(requestUrl.pathname) && (req.method ?? "GET") === "GET") {
      res.writeHead(200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      });
      res.end(buildNativeBridgeScript({
        groups: this.groupState,
        unread: this.unreadState
      }));
      return;
    }
    void this.ensureAuthenticated(upstreamBase);
    const upstream = splitUpstreamBase(upstreamBase);
    const upstreamPath = `${upstream.prefix}${rawTarget}`;
    const isHttps = upstream.url.protocol === "https:";
    const authority = resolveRemoteAuthority(this.device);
    const reqFn = isHttps ? httpsRequest2 : httpRequest2;
    const rejectUnauthorized = this.device.transport.kind === "direct" ? this.device.transport.rejectUnauthorized !== false : true;
    const method = req.method ?? "GET";
    const injectHtml = isHtmlNavigation(req);
    const forward = (retried) => {
      const authHeaders = this.authManager.getAuthHeaders(this.device);
      const outHeaders = buildForwardHeaders(req.headers, {
        host: authority,
        origin: req.headers["origin"] !== void 0 ? authHeaders["Origin"] ?? `${isHttps ? "https" : "http"}://${authority}` : void 0,
        cookie: authHeaders["Cookie"],
        authorization: authHeaders["Authorization"]
      });
      if (injectHtml) {
        for (const key of Object.keys(outHeaders)) {
          if (key.toLowerCase() === "accept-encoding") delete outHeaders[key];
        }
      }
      const proxyReq = reqFn(
        upstream.url,
        {
          method,
          path: upstreamPath,
          headers: outHeaders,
          ...isHttps ? { rejectUnauthorized } : {}
        },
        (proxyRes) => {
          const status = proxyRes.statusCode ?? 502;
          if (status === 401 || status === 403) {
            proxyRes.resume();
            if (!retried && (method === "GET" || method === "HEAD")) {
              void this.recoverAuthentication(upstreamBase, status).then((recovered) => {
                if (recovered) {
                  forward(true);
                  return;
                }
                this.respondAuthRequired(res, status);
              }).catch((error) => {
                this.hooks.onAuthState?.(
                  this.device.id,
                  "error",
                  error instanceof Error ? error.message : String(error)
                );
                this.respondAuthRequired(res, status);
              });
              return;
            }
            this.hooks.onAuthState?.(
              this.device.id,
              "required",
              `Remote DSH returned HTTP ${status}`
            );
            this.respondAuthRequired(res, status);
            return;
          }
          if (status >= 200 && status < 400) {
            this.hooks.onAuthState?.(this.device.id, "ok");
          }
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
          const contentType = proxyRes.headers["content-type"];
          const shouldInject = injectHtml && status === 200 && typeof contentType === "string" && contentType.toLowerCase().includes("text/html");
          if (shouldInject) {
            this.setBridgeState("loading");
            this.armBridgeTimer();
            this.streamInjectedHtml(proxyRes, res, status, resHeaders);
            return;
          }
          res.writeHead(status, resHeaders);
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
      if (retried || method === "GET" || method === "HEAD") {
        proxyReq.end();
      } else {
        req.pipe(proxyReq);
      }
    };
    forward(false);
  }
  /**
   * Buffer one HTML document, inject the bridge script and forward it.
   *
   * The response is held only for documents (the SPA shell); assets keep the
   * streaming path. Compression is normally already removed by
   * `accept-encoding: identity`, but a proxy in front of DSH may still compress,
   * so gzip/deflate/br are decoded before injection.
   */
  streamInjectedHtml(proxyRes, res, status, baseHeaders) {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    proxyRes.on("data", (chunk) => {
      size += chunk.byteLength;
      if (size > MAX_INJECTABLE_HTML_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    proxyRes.on("error", () => {
      if (!res.headersSent) res.destroy();
    });
    proxyRes.on("aborted", () => {
      if (!res.headersSent) res.destroy();
    });
    proxyRes.on("end", () => {
      if (res.destroyed) return;
      if (tooLarge) {
        this.clearBridgeTimer();
        this.resetBridgeSelection();
        this.setBridgeState("failed", "the remote HTML document was too large to inject the native bridge");
        res.writeHead(502, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(renderUnavailableHtml(this.device.name, "The remote page is too large to inject the native bridge."));
        return;
      }
      const raw = Buffer.concat(chunks);
      const headers = { ...baseHeaders };
      const encoding = headerValueOf(proxyRes.headers, "content-encoding");
      let body = raw;
      let injected = false;
      const decoded = decodeHtmlBody(raw, encoding);
      if (decoded !== void 0) {
        body = Buffer.from(injectNativeBridge(decoded.toString("utf8"), { deviceId: this.device.id }), "utf8");
        removeHeader(headers, "content-encoding");
        injected = true;
      }
      if (!injected) {
        this.clearBridgeTimer();
        this.resetBridgeSelection();
        this.setBridgeState(
          "failed",
          `the remote HTML document used an unsupported content-encoding (${encoding ?? "unknown"})`
        );
      }
      removeHeader(headers, "content-length");
      removeHeader(headers, "transfer-encoding");
      removeHeader(headers, "connection");
      removeHeader(headers, "keep-alive");
      removeHeader(headers, "etag");
      removeHeader(headers, "last-modified");
      headers["cache-control"] = "no-store";
      headers["content-length"] = String(body.byteLength);
      res.writeHead(status, headers);
      res.end(body);
    });
  }
  /** Validate one same-origin bridge upgrade and hand it to the WebSocket server. */
  handleBridgeUpgrade(req, clientSocket, head) {
    const parsed = parseOriginForm(req.url);
    const proxyOrigin = this.proxyOrigin();
    const cookieToken = readCookie(req.headers.cookie, PROXY_COOKIE_NAME);
    if (parsed === void 0 || proxyOrigin === void 0 || cookieToken !== this.token) {
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
    const bridgeServer = this.bridgeServer;
    if (bridgeServer === void 0) {
      clientSocket.destroy();
      return;
    }
    bridgeServer.handleUpgrade(req, clientSocket, head, (ws) => {
      this.attachBridge(ws);
    });
  }
  /** Own one framed page's bridge socket, its readiness and its selection reports. */
  attachBridge(ws) {
    this.bridgeClients.add(ws);
    this.resetBridgeSelection();
    this.setBridgeState("loading");
    this.armBridgeTimer();
    ws.on("message", (raw) => {
      let message;
      try {
        const parsed = JSON.parse(raw.toString());
        if (typeof parsed !== "object" || parsed === null) return;
        message = parsed;
      } catch {
        return;
      }
      if (message.type === "ready") {
        this.clearBridgeTimer();
        this.setBridgeState("ready");
        this.sendToBridge({ type: "set-embedded", enabled: this.bridgeEmbedded });
        this.sendToBridge({ type: "group-expansion", groups: this.groupState });
        this.sendToBridge({
          type: "read-state",
          unreadSessionIds: this.hooks.getUnreadState?.(this.device.id) ?? this.unreadState
        });
        if (this.pendingOpenSession !== void 0) {
          this.sendToBridge({ type: "open-session", sessionId: this.pendingOpenSession });
        }
        return;
      }
      if (message.type === "failed") {
        this.clearBridgeTimer();
        this.setBridgeState("failed", message.error ?? "the framed page could not start the native bridge");
        return;
      }
      if (message.type === "selection") {
        const sessionId = typeof message.sessionId === "string" && message.sessionId !== "" ? message.sessionId : void 0;
        if (sessionId === this.bridgeSessionId) return;
        this.bridgeSessionId = sessionId;
        this.hooks.onBridgeSelection?.(this.device.id, sessionId);
        return;
      }
      if (message.type === "group-expansion") {
        const groups = sanitizeGroupState(message.groups);
        if (this.hooks.onGroupState !== void 0) {
          this.hooks.onGroupState(this.device.id, groups);
        } else {
          this.setGroupState(groups);
        }
        return;
      }
      if (message.type === "read") {
        const sessionId = typeof message.sessionId === "string" ? message.sessionId : "";
        if (sessionId !== "") this.hooks.onBridgeRead?.(this.device.id, sessionId);
      }
    });
    ws.on("close", () => {
      this.bridgeClients.delete(ws);
      if (this.bridgeClients.size > 0) return;
      this.clearBridgeTimer();
      this.resetBridgeSelection();
      if (this.bridgeState === "ready" || this.bridgeState === "loading") {
        this.setBridgeState("idle");
      }
    });
    ws.on("error", () => {
      try {
        ws.close();
      } catch {
      }
    });
  }
  resetBridgeSelection() {
    if (this.bridgeSessionId === void 0) return;
    this.bridgeSessionId = void 0;
    this.hooks.onBridgeSelection?.(this.device.id, void 0);
  }
  async ensureAuthenticated(upstreamBase) {
    const now = Date.now();
    if (now - this.lastAuthAttemptAt < 3e4) return;
    this.lastAuthAttemptAt = now;
    const result = await this.authManager.ensureAuthenticated(this.device, upstreamBase);
    if (!result.ok) {
      this.hooks.onAuthState?.(this.device.id, "required", result.error);
    }
  }
  async recoverAuthentication(upstreamBase, status) {
    const now = Date.now();
    if (now - this.lastAuthRecoveryAt < 5e3) return false;
    this.lastAuthRecoveryAt = now;
    const result = await this.authManager.ensureAuthenticated(this.device, upstreamBase, true);
    if (result.ok) return true;
    this.hooks.onAuthState?.(
      this.device.id,
      status === 401 ? "required" : "error",
      result.error
    );
    return false;
  }
  respondAuthRequired(res, status) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-dsh-md-auth-required": "1"
    });
    res.end(renderAuthRequiredHtml(this.device.name, status));
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
    const rawTarget = stripProxyTokenFromRawTarget(req.url ?? "/");
    const upstream = splitUpstreamBase(upstreamBase);
    const upstreamPath = `${upstream.prefix}${rawTarget}`;
    const isHttps = upstream.url.protocol === "https:";
    const authority = resolveRemoteAuthority(this.device);
    const authHeaders = this.authManager.getAuthHeaders(this.device);
    const outHeaders = buildForwardHeaders(req.headers, {
      host: authority,
      origin: authHeaders["Origin"] ?? `${isHttps ? "https" : "http"}://${authority}`,
      cookie: authHeaders["Cookie"],
      authorization: authHeaders["Authorization"]
    });
    const reqFn = isHttps ? httpsRequest2 : httpRequest2;
    const rejectUnauthorized = this.device.transport.kind === "direct" ? this.device.transport.rejectUnauthorized !== false : true;
    const proxyReq = reqFn(upstream.url, {
      method: "GET",
      path: upstreamPath,
      headers: outHeaders,
      ...isHttps ? { rejectUnauthorized } : {}
    });
    proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
      let rawResponse = `HTTP/1.1 ${proxyRes.statusCode ?? 101} ${proxyRes.statusMessage ?? "Switching Protocols"}\r
`;
      for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
        const k = proxyRes.rawHeaders[i];
        const v = proxyRes.rawHeaders[i + 1];
        if (k === void 0 || v === void 0) continue;
        const lower = k.toLowerCase();
        if (lower === "set-cookie") continue;
        if (lower !== "connection" && lower !== "upgrade" && isHopByHopHeader(lower)) continue;
        rawResponse += `${k}: ${v}\r
`;
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
      const status = proxyRes.statusCode ?? 403;
      if (status === 401 || status === 403) {
        this.hooks.onAuthState?.(
          this.device.id,
          "required",
          `Remote DSH WebSocket returned HTTP ${status}`
        );
      }
      clientSocket.end(`HTTP/1.1 ${status} ${proxyRes.statusMessage ?? "Rejected"}\r
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
  constructor(authManager, localOrigin, hooks = {}) {
    this.authManager = authManager;
    this.localOrigin = localOrigin;
    this.hooks = hooks;
  }
  proxies = /* @__PURE__ */ new Map();
  async ensureProxy(device, getUpstreamBaseUrl) {
    let proxy = this.proxies.get(device.id);
    if (proxy === void 0) {
      proxy = new NativeDeviceProxy(
        device,
        getUpstreamBaseUrl,
        this.authManager,
        this.localOrigin,
        this.hooks
      );
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
  /** Current injected-bridge lifecycle for one device. */
  bridgeSnapshot(deviceId) {
    return this.proxies.get(deviceId)?.bridgeSnapshot() ?? { state: "idle" };
  }
  /** Navigate the framed page to one raw remote Session (queued until ready). */
  openSession(deviceId, sessionId) {
    const proxy = this.proxies.get(deviceId);
    if (proxy === void 0) return false;
    proxy.openSession(sessionId);
    return true;
  }
  /** Ask the framed page to refresh its own Session catalog. */
  requestRefresh(deviceId) {
    const proxy = this.proxies.get(deviceId);
    if (proxy === void 0) return false;
    proxy.requestRefresh();
    return true;
  }
  /** Toggle the remote sidebar for pane vs full native rendering. */
  setEmbedded(deviceId, enabled) {
    this.proxies.get(deviceId)?.setEmbedded(enabled);
  }
  /** Push Host-owned fold state to the device's framed page(s). */
  setGroupState(deviceId, groups) {
    this.proxies.get(deviceId)?.setGroupState(groups);
  }
  /** Push Host-owned unread Session IDs to the device's framed page(s). */
  setUnreadState(deviceId, unreadSessionIds) {
    this.proxies.get(deviceId)?.setUnreadState(unreadSessionIds);
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
var NAVIGATION_DESTINATIONS = /* @__PURE__ */ new Set(["document", "iframe", "frame", "embed", "object"]);
function isHtmlNavigation(req) {
  const destination = req.headers["sec-fetch-dest"];
  if (typeof destination === "string" && NAVIGATION_DESTINATIONS.has(destination)) return true;
  const accept = req.headers.accept;
  return typeof accept === "string" && accept.toLowerCase().includes("text/html");
}
function headerValueOf(headers, name2) {
  const value = headers[name2];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  return void 0;
}
function removeHeader(headers, name2) {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name2) delete headers[key];
  }
}
function decodeHtmlBody(raw, encoding) {
  const normalized = (encoding ?? "").trim().toLowerCase();
  if (normalized === "" || normalized === "identity") return raw;
  try {
    if (normalized === "gzip" || normalized === "x-gzip") return gunzipSync(raw);
    if (normalized === "deflate") return inflateSync(raw);
    if (normalized === "br") return brotliDecompressSync(raw);
  } catch {
    return void 0;
  }
  return void 0;
}
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
function stripProxyTokenFromRawTarget(raw) {
  const queryAt = raw.indexOf("?");
  if (queryAt === -1) return raw;
  const pathPart = raw.slice(0, queryAt);
  const kept = raw.slice(queryAt + 1).split("&").filter((part) => part !== "" && !part.startsWith(`${PROXY_TOKEN_QUERY}=`));
  return kept.length === 0 ? pathPart : `${pathPart}?${kept.join("&")}`;
}
function splitUpstreamBase(base) {
  const url = new URL(base);
  const prefix = url.pathname.replace(/\/+$/u, "");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return { url, prefix };
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
function renderStatusPage(options) {
  const name2 = escapeHtml(options.deviceName);
  const title = escapeHtml(options.title);
  const badge = escapeHtml(options.badge);
  const paragraphs = options.paragraphs.map((text) => `    <p>${escapeHtml(text)}</p>`).join("\n");
  const retry = options.retry === false ? "" : '    <button type="button" onclick="location.reload()">\u91CD\u8BD5 / Retry</button>';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="color-scheme" content="light dark" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${name2} \u2014 ${title}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", Roboto, sans-serif;
    background: #f4f5f7; color: #1b1c1f;
  }
  .card {
    width: min(480px, 100%); padding: 24px; border-radius: 14px; text-align: start;
    background: #ffffff; border: 1px solid #e3e5e9; box-shadow: 0 8px 28px rgb(0 0 0 / 8%);
  }
  .badge {
    display: inline-flex; align-items: center; gap: 6px; margin-bottom: 12px;
    padding: 3px 9px; border-radius: 999px; font-size: 12px; line-height: 18px;
  }
  .badge.warn { color: #8a5a00; background: #fff4d6; border: 1px solid #f0d48a; }
  .badge.error { color: #9f2d2d; background: #fdecec; border: 1px solid #f2bdbd; }
  h1 { margin: 0 0 8px; font-size: 17px; line-height: 1.4; font-weight: 600; }
  p { margin: 0 0 10px; font-size: 13px; line-height: 1.6; color: #4b5563; overflow-wrap: anywhere; }
  button {
    margin-top: 6px; padding: 7px 16px; border-radius: 8px; border: 1px solid #3b82f6;
    background: #2563eb; color: #fff; font: inherit; font-size: 13px; cursor: pointer;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #141518; color: #e5e7eb; }
    .card { background: #1e2025; border-color: #2e323b; box-shadow: none; }
    .badge.warn { color: #f0c674; background: #3a2f12; border-color: #5a4a1f; }
    .badge.error { color: #f2a3a3; background: #3a1c1c; border-color: #5a2a2a; }
    p { color: #9ca3af; }
  }
</style>
</head>
<body>
  <main class="card">
    <div class="badge ${options.tone}">${badge}</div>
    <h1>${title}</h1>
${paragraphs}
${retry}
  </main>
</body>
</html>`;
}
function renderAuthRequiredHtml(deviceName, status) {
  return renderStatusPage({
    deviceName,
    badge: "\u9700\u8981\u767B\u5F55 \xB7 Sign-in required",
    tone: "warn",
    title: deviceName,
    paragraphs: [
      `\u8FDC\u7AEF DSH \u62D2\u7EDD\u4E86\u5F53\u524D\u51ED\u636E\uFF08HTTP ${String(status)}\uFF09\u3002SSH \u96A7\u9053\u5DF2\u8FDE\u901A\uFF0C\u4F46\u6D4F\u89C8\u5668 Cookie \u65E0\u6548\u6216\u5DF2\u8FC7\u671F\u3002`,
      "\u8BF7\u5728 DSH \u4E2D\u6253\u5F00\u4FA7\u680F\u5E95\u90E8\u7684\u300C\u591A\u8BBE\u5907\u300D\uFF0C\u9009\u62E9\u8BE5\u8BBE\u5907\u540E\u8F93\u5165 dsh web \u542F\u52A8\u94FE\u63A5/Token\uFF0C\u6216\u70B9\u51FB\u300C\u901A\u8FC7 SSH \u81EA\u52A8\u4FEE\u590D\u300D\u91CD\u65B0\u7B7E\u53D1 Cookie\u3002",
      `The remote DSH rejected this credential (HTTP ${String(status)}). Open Multi-Device in the sidebar, pick this device, then paste a launch token or repair the cookie over SSH.`
    ]
  });
}
function renderUnavailableHtml(deviceName, detail) {
  return renderStatusPage({
    deviceName,
    badge: "\u6682\u4E0D\u53EF\u8FBE \xB7 Unavailable",
    tone: "error",
    title: deviceName,
    paragraphs: [
      detail,
      "SSH \u96A7\u9053\u6216\u8FDC\u7AEF DSH \u6682\u4E0D\u53EF\u7528\u3002\u8BF7\u786E\u8BA4\u8FDC\u7AEF dsh web \u6B63\u5728\u8FD0\u884C\uFF0C\u7136\u540E\u91CD\u8BD5\u3002",
      "The SSH tunnel or the remote DSH is not reachable right now. Confirm dsh web is running, then retry."
    ]
  });
}
function renderProxyRejectedHtml(reason) {
  return renderStatusPage({
    deviceName: "\u591A\u8BBE\u5907\u4EE3\u7406",
    badge: "\u4EE3\u7406\u4F1A\u8BDD\u5DF2\u5931\u6548 \xB7 Proxy session expired",
    tone: "warn",
    title: "\u8BF7\u91CD\u65B0\u6253\u5F00\u8BE5\u8BBE\u5907 / Reopen the device",
    paragraphs: [
      reason,
      "\u8BF7\u4ECE DSH \u7684\u300C\u591A\u8BBE\u5907\u300D\u9762\u677F\u91CD\u65B0\u6253\u5F00\u8BE5\u8BBE\u5907\u3002",
      "Reopen the device from the Multi-Device panel in DSH."
    ],
    retry: false
  });
}
function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// src/host/read-state.ts
var READ_STATE_ENTRY_LIMIT = 2e3;
var READ_TOUCH_INTERVAL_MS = 2e3;
var ReadStateTracker = class {
  constructor(onChange) {
    this.onChange = onChange;
  }
  entries = /* @__PURE__ */ new Map();
  running = /* @__PURE__ */ new Map();
  /**
   * Observe one authoritative running-status transition.
   *
   * Only a real `true -> false` transition creates unread state. A first
   * `false` (for example a catalog row that was already finished at startup)
   * must not manufacture an unread reminder.
   */
  observeRunning(sessionId, running, now = Date.now()) {
    if (sessionId === "") return false;
    const previous = this.running.get(sessionId);
    this.running.set(sessionId, running);
    if (running) {
      if (this.isUnread(sessionId)) {
        this.markRead(sessionId, now);
        return true;
      }
      return false;
    }
    if (previous === true && !this.isUnread(sessionId)) {
      this.setEntry(sessionId, { unread: true, at: now }, true);
      return true;
    }
    return false;
  }
  /** Mark a Session read; returns true when an unread marker was removed. */
  markRead(sessionId, now = Date.now()) {
    if (sessionId === "") return false;
    const previous = this.entries.get(sessionId);
    const unreadChanged = previous?.unread === true;
    if (previous !== void 0 && previous.unread === false && now - previous.at < READ_TOUCH_INTERVAL_MS) {
      return false;
    }
    this.setEntry(sessionId, { unread: false, at: now }, unreadChanged);
    return unreadChanged;
  }
  /**
   * Merge one entry from another Host's shared file. The newest timestamp wins;
   * a read at the same instant wins over unread so a cleared dot cannot come
   * back merely because two Hosts replayed the same completion.
   */
  mergeEntry(sessionId, entry) {
    if (sessionId === "") return false;
    const previous = this.entries.get(sessionId);
    if (previous !== void 0 && (previous.at > entry.at || previous.at === entry.at && (previous.unread === entry.unread || !previous.unread))) {
      return false;
    }
    const next = {
      unread: entry.unread,
      at: Math.max(0, Math.trunc(entry.at))
    };
    const unreadChanged = previous?.unread === true !== next.unread;
    this.entries.set(sessionId, next);
    this.trim();
    this.onChange?.(sessionId, next, unreadChanged);
    return unreadChanged;
  }
  /** Mark a Session unread; returns true when it was not already unread. */
  markUnread(sessionId, now = Date.now()) {
    if (sessionId === "") return false;
    if (this.isUnread(sessionId)) return false;
    this.setEntry(sessionId, { unread: true, at: now }, true);
    return true;
  }
  isUnread(sessionId) {
    return this.entries.get(sessionId)?.unread === true;
  }
  /** Sorted read state for the snapshot; deterministic for clients and tests. */
  unreadIds() {
    const ids = [];
    for (const [sessionId, state] of this.entries) {
      if (state.unread) ids.push(sessionId);
    }
    return ids.sort();
  }
  /** Serializable durable representation. */
  entriesSnapshot() {
    const out = {};
    for (const [sessionId, state] of this.entries) {
      out[sessionId] = { unread: state.unread, at: state.at };
    }
    return out;
  }
  /**
   * Restore durable state. Invalid entries are ignored instead of crashing a
   * Host restart, and the result is capped like a live set.
   */
  hydrate(value) {
    if (typeof value !== "object" || value === null) return;
    for (const [sessionId, raw] of Object.entries(value)) {
      if (sessionId === "" || typeof raw !== "object" || raw === null) continue;
      const entry = raw;
      if (typeof entry.unread !== "boolean") continue;
      const at = typeof entry.at === "number" && Number.isFinite(entry.at) ? Math.max(0, Math.trunc(entry.at)) : 0;
      this.entries.set(sessionId, { unread: entry.unread, at });
    }
    this.trim();
  }
  remove(sessionId) {
    const existed = this.entries.delete(sessionId);
    this.running.delete(sessionId);
    if (existed) this.onChange?.(sessionId, { unread: false, at: Date.now() }, true);
  }
  /** Drop entries whose Session no longer belongs to a configured device. */
  retain(predicate) {
    for (const sessionId of [...this.entries.keys()]) {
      if (!predicate(sessionId)) {
        this.entries.delete(sessionId);
        this.running.delete(sessionId);
      }
    }
  }
  /** Keep the most recently touched entries bounded. */
  trim(limit = READ_STATE_ENTRY_LIMIT) {
    if (this.entries.size <= limit) return;
    const ordered = [...this.entries.entries()].sort((left, right) => left[1].at - right[1].at);
    const drop = this.entries.size - Math.max(0, limit);
    for (let index = 0; index < drop; index += 1) {
      const entry = ordered[index];
      if (entry !== void 0) {
        this.entries.delete(entry[0]);
        this.running.delete(entry[0]);
      }
    }
  }
  setEntry(sessionId, state, unreadChanged) {
    this.entries.set(sessionId, state);
    this.trim();
    this.onChange?.(sessionId, state, unreadChanged);
  }
};

// src/host/shared-state.ts
var SHARED_READ_STATE_VERSION = 1;
var SHARED_READ_SECTION_LIMIT = 300;
var SHARED_READ_HOST_LIMIT = 20;
function validEntry(value) {
  if (typeof value !== "object" || value === null) return void 0;
  const entry = value;
  if (typeof entry.unread !== "boolean") return void 0;
  if (typeof entry.at !== "number" || !Number.isFinite(entry.at)) return void 0;
  return { unread: entry.unread, at: Math.max(0, Math.trunc(entry.at)) };
}
function validSessions(value) {
  const out = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  let count = 0;
  for (const [sessionId, raw] of Object.entries(value)) {
    if (count >= SHARED_READ_SECTION_LIMIT) break;
    if (sessionId === "" || sessionId.length > 512) continue;
    if (sessionId === "__proto__" || sessionId === "constructor" || sessionId === "prototype") continue;
    const entry = validEntry(raw);
    if (entry !== void 0) {
      out[sessionId] = entry;
      count += 1;
    }
  }
  return out;
}
function parseSharedReadDocument(text) {
  if (text.trim() === "") return void 0;
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return void 0;
  }
  if (typeof raw !== "object" || raw === null) return void 0;
  const doc = raw;
  if (doc.version !== SHARED_READ_STATE_VERSION) return void 0;
  if (typeof doc.hosts !== "object" || doc.hosts === null || Array.isArray(doc.hosts)) return void 0;
  const hosts = {};
  let hostCount = 0;
  for (const [hostId, rawSection] of Object.entries(doc.hosts)) {
    if (hostCount >= SHARED_READ_HOST_LIMIT) break;
    if (hostId === "" || hostId.length > 80) continue;
    if (hostId === "__proto__" || hostId === "constructor" || hostId === "prototype") continue;
    if (typeof rawSection !== "object" || rawSection === null) continue;
    const section = rawSection;
    const updatedAt = typeof section.updatedAt === "number" && Number.isFinite(section.updatedAt) ? Math.max(0, Math.trunc(section.updatedAt)) : 0;
    hosts[hostId] = { updatedAt, sessions: validSessions(section.sessions) };
    hostCount += 1;
  }
  return { version: SHARED_READ_STATE_VERSION, hosts };
}
function buildSharedReadDocument(existing, hostId, sessions, now) {
  const ordered = Object.entries(sessions).sort((left, right) => right[1].at - left[1].at).slice(0, SHARED_READ_SECTION_LIMIT);
  const ownSessions = Object.fromEntries(ordered);
  const hosts = {
    [hostId]: { updatedAt: now, sessions: ownSessions }
  };
  let remaining = 600 - Object.keys(ownSessions).length;
  const peers = Object.entries(existing?.hosts ?? {}).filter(([id]) => id !== hostId).sort((left, right) => right[1].updatedAt - left[1].updatedAt).slice(0, SHARED_READ_HOST_LIMIT);
  for (const [id, section] of peers) {
    if (remaining <= 0) break;
    const peerSessions = {};
    const entries = Object.entries(section.sessions).sort((left, right) => right[1].at - left[1].at).slice(0, remaining);
    for (const [sessionId, entry] of entries) {
      peerSessions[sessionId] = entry;
      remaining -= 1;
    }
    hosts[id] = { updatedAt: section.updatedAt, sessions: peerSessions };
  }
  return { version: SHARED_READ_STATE_VERSION, hosts };
}
function isPosixRemoteHome(remoteHome) {
  if (remoteHome === void 0) return false;
  const trimmed = remoteHome.trim();
  if (trimmed === "" || trimmed.includes("\0")) return false;
  if (!trimmed.startsWith("/")) return false;
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return false;
  if (trimmed.startsWith("\\\\") || trimmed.startsWith("%") || trimmed.startsWith("~")) return false;
  return true;
}
function sharedReadStatePath(remoteHome) {
  const base = remoteHome.trim().replace(/\/+$/, "");
  return `${base}/plugins/dsh-multi-device/read-state.json`;
}
function shellQuote3(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function buildReadSharedStateCommand(path) {
  return `cat ${shellQuote3(path)} 2>/dev/null || true`;
}
function buildWriteSharedStateCommand(path, document) {
  const text = JSON.stringify(document);
  const encoded = Buffer.from(text, "utf8").toString("base64");
  const slash = path.lastIndexOf("/");
  const dir = slash > 0 ? path.slice(0, slash) : ".";
  const tmp = `${path}.tmp`;
  const script = [
    `umask 077; mkdir -p ${shellQuote3(dir)}`,
    `if printf %s ${shellQuote3(encoded)} | base64 -d > ${shellQuote3(tmp)} 2>/dev/null; then`,
    `  mv -f ${shellQuote3(tmp)} ${shellQuote3(path)}`,
    "else",
    `  printf %s ${shellQuote3(encoded)} | base64 -D > ${shellQuote3(tmp)} && mv -f ${shellQuote3(tmp)} ${shellQuote3(path)}`,
    "fi"
  ].join("\n");
  return `sh -c ${shellQuote3(script)}`;
}

// src/host/remote-client.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import WebSocket2 from "ws";
function pendingInteractionKind(event) {
  switch (event) {
    case "approval/request":
      return "approval";
    case "user-questions/request":
      return "question";
    case "plan-review/request":
      return "plan-review";
    default:
      return void 0;
  }
}
function isConnectedState(state) {
  return state === "connected";
}
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
  /** 0.1 has no live stream. The UI uses this to show a list-only device. */
  realtime = false;
  remoteDshVersion;
  remoteHome;
  latencyMs;
  connectedAt;
  lastError;
  reconnectAttempt = 0;
  nativeProxyUrl;
  /** Epoch ms of the last successful catalog sync (live or hydrated from disk). */
  lastSyncedAt;
  /** True while the catalog rows predate a live baseline (hydrated cache). */
  catalogStale = false;
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
  iterationAbort;
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
    const runningCount = this.sessionSummaries().filter((s) => s.running).length;
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
          ...this.config.transport.remoteDshHome !== void 0 ? { remoteDshHome: this.config.transport.remoteDshHome } : {},
          ...this.config.transport.bootstrapFromRemoteCredentials === true ? { bootstrapFromRemoteCredentials: true } : {},
          ...this.config.transport.engine !== void 0 ? { engine: this.config.transport.engine } : {}
        }
      } : {},
      targetSummary: this.targetSummary(),
      ...this.effectiveBaseUrl() !== void 0 ? { effectiveBaseUrl: this.effectiveBaseUrl() } : {},
      ...this.nativeProxyUrl !== void 0 ? { nativeProxyUrl: this.nativeProxyUrl } : {},
      keepNativeAlive: this.config.keepNativeAlive !== false,
      protocolVersion: this.protocolVersion,
      realtime: this.realtime,
      ...this.remoteDshVersion !== void 0 ? { remoteDshVersion: this.remoteDshVersion } : {},
      ...this.remoteHome !== void 0 ? { remoteHome: this.remoteHome } : {},
      ...this.latencyMs !== void 0 ? { latencyMs: this.latencyMs } : {},
      ...this.connectedAt !== void 0 ? { connectedAt: this.connectedAt } : {},
      ...this.lastError !== void 0 ? { lastError: this.lastError } : {},
      reconnectAttempt: this.reconnectAttempt,
      sessionCount: this.summaries.length,
      runningSessionCount: runningCount,
      pendingApprovalCount: this.catalogStale ? 0 : this.pendingInteractions.size,
      workspaceCount: this.workspaces.length,
      ...this.lastSyncedAt !== void 0 ? { lastSyncedAt: this.lastSyncedAt } : {},
      ...this.catalogStale ? { catalogStale: true } : {}
    };
  }
  /** Current lifecycle state, read through a getter so callers never narrow a stale value. */
  get connectionState() {
    return this.state;
  }
  /** True while this device has a live baseline and can answer RPCs. */
  isConnected() {
    return this.connectionState === "connected";
  }
  /**
   * Seed the in-memory catalog from the persisted cache before the first
   * connection attempt, so an offline device keeps its sidebar rows after a
   * Host restart. A later live baseline replaces everything.
   */
  hydrateCatalog(cache) {
    if (cache === void 0) return;
    if (this.summaries.length > 0 || this.workspaces.length > 0) return;
    this.summaries = cache.sessions.map((session) => ({
      sessionId: session.sessionId,
      updatedAt: session.updatedAt,
      agentAvailable: session.agentAvailable,
      running: session.running,
      blank: session.blank,
      ...session.parentSessionId !== void 0 ? { parentSessionId: session.parentSessionId } : {},
      ...session.origin !== void 0 ? { origin: session.origin } : {},
      ...session.cwd !== void 0 ? { cwd: session.cwd } : {}
    }));
    this.workspaces = cache.workspaces.map((workspace) => ({
      workspaceId: workspace.workspaceId,
      path: workspace.path,
      title: workspace.title,
      sessionIds: [...workspace.sessionIds],
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt
    }));
    this.archivedSessionIds = [...cache.archivedSessionIds];
    this.pinnedSessionIds = [...cache.pinnedSessionIds];
    if (cache.protocolVersion !== "unknown") this.protocolVersion = cache.protocolVersion;
    this.lastSyncedAt = cache.syncedAt;
    this.catalogStale = true;
  }
  /** Durable mirror of the current catalog; projections and secrets stay out. */
  catalogSnapshot() {
    return {
      deviceId: this.config.id,
      syncedAt: this.lastSyncedAt ?? 0,
      protocolVersion: this.protocolVersion,
      sessions: this.summaries.map((session) => ({
        sessionId: session.sessionId,
        updatedAt: session.updatedAt,
        agentAvailable: session.agentAvailable,
        running: session.running,
        blank: session.blank,
        ...session.parentSessionId !== void 0 ? { parentSessionId: session.parentSessionId } : {},
        ...session.origin !== void 0 ? { origin: session.origin } : {},
        ...session.cwd !== void 0 ? { cwd: session.cwd } : {}
      })),
      workspaces: this.workspaces.map((workspace) => ({
        workspaceId: workspace.workspaceId,
        path: workspace.path,
        title: workspace.title,
        sessionIds: [...workspace.sessionIds],
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt
      })),
      archivedSessionIds: [...this.archivedSessionIds],
      pinnedSessionIds: [...this.pinnedSessionIds]
    };
  }
  /**
   * Wait until the device reaches `connected`, for a Session that is opened
   * while the tunnel is still coming up. Polling keeps this free of extra
   * listener lifecycles; the wait is bounded by the caller's timeout.
   */
  async waitForConnected(signal, timeoutMs) {
    if (isConnectedState(this.connectionState)) return true;
    if (this.connectionState === "disabled" || timeoutMs <= 0) return false;
    const deadline = Date.now() + timeoutMs;
    while (!signal.aborted) {
      if (isConnectedState(this.connectionState)) return true;
      if (!this.running) return false;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleepWithSignal(Math.min(250, remaining), signal);
    }
    return isConnectedState(this.connectionState);
  }
  sessionSummaries() {
    if (!this.catalogStale) return this.summaries;
    return this.summaries.map(
      (summary) => summary.running ? { ...summary, running: false, agentAvailable: false } : summary
    );
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
    if (this.catalogStale) return [];
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
    this.iterationAbort?.abort();
    this.iterationAbort = void 0;
    this.closeMuxSocket();
    this.tunnel?.stop();
    this.tunnel = void 0;
    this.state = this.config.enabled ? "error" : "disabled";
    if (!this.config.enabled) this.clearPendingInteractions();
    this.markDisconnected();
    this.callbacks.onStateChanged(this.id);
  }
  /**
   * A transport generation ended. The last catalog remains visible, but a
   * Session that was running cannot still be running on an unreachable Host:
   * report the transition so the sidebar spinner stops and completion becomes
   * detectable. Pending waterfalls are cancelled in the local UI but kept so a
   * reconnect can replay them (the remote may still be waiting for an answer).
   */
  markDisconnected() {
    this.catalogStale = true;
    const running = this.summaries.filter((summary) => summary.running);
    if (running.length > 0) {
      this.summaries = this.summaries.map(
        (summary) => summary.running ? { ...summary, running: false, agentAvailable: false } : summary
      );
      for (const summary of running) {
        this.callbacks.onRemoteEventFrame(this.id, {
          type: "emit",
          event: "api-session/status",
          args: [encodeRemoteSessionId(this.id, summary.sessionId), false]
        });
      }
    }
    for (const pending of this.pendingInteractions.values()) {
      this.callbacks.onRemoteEventFrame(this.id, {
        type: "cancel",
        eventId: pending.namespacedEventId
      });
    }
  }
  /** Drop every pending waterfall and close its local card (device removed/disabled). */
  clearPendingInteractions() {
    if (this.pendingInteractions.size === 0) return;
    for (const pending of this.pendingInteractions.values()) {
      this.callbacks.onRemoteEventFrame(this.id, {
        type: "cancel",
        eventId: pending.namespacedEventId
      });
    }
    this.pendingInteractions.clear();
  }
  /** Re-deliver still-pending waterfalls after the `$events` stream comes back. */
  replayPendingInteractions() {
    for (const pending of this.pendingInteractions.values()) {
      this.callbacks.onRemoteEventFrame(this.id, {
        type: "waterfall",
        event: pending.eventName,
        eventId: pending.namespacedEventId,
        agentId: pending.namespacedSessionId,
        request: pending.request
      });
    }
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
    if (socket === void 0 || socket.readyState !== WebSocket2.OPEN) {
      throw new Error(`Device "${this.config.name}" stream socket is not connected`);
    }
    const streamId = randomUUID3();
    const queue = new BoundedStreamQueue();
    this.muxStreams.set(streamId, {
      push: (frame) => {
        queue.push(frame);
      }
    });
    const onAbort = () => {
      queue.notify();
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
        if (queue.overflow) {
          throw new Error(`Remote ${endpoint} stream consumer fell behind; reconnect to replay history`);
        }
        const frame = queue.shift();
        if (frame === void 0) {
          await queue.wait();
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
      if (socket.readyState === WebSocket2.OPEN) {
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
      this.iterationAbort?.abort();
      const iterAbort = new AbortController();
      this.iterationAbort = iterAbort;
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
        this.realtime = probed.protocolVersion === "0.2";
        if (probed.remoteDshVersion !== void 0) {
          this.remoteDshVersion = probed.remoteDshVersion;
        }
        this.state = "connected";
        this.connectedAt = Date.now();
        this.lastError = void 0;
        this.reconnectAttempt = 0;
        this.lastSyncedAt = Date.now();
        this.catalogStale = false;
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
        this.markDisconnected();
        this.callbacks.onStateChanged(this.id);
      } finally {
        iterAbort.abort();
        if (this.iterationAbort === iterAbort) this.iterationAbort = void 0;
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
    const previousSummaries = new Map(this.summaries.map((summary) => [summary.sessionId, summary]));
    const body02 = res02.ok ? res02.value : void 0;
    const listGen = classifyRemoteProtocol(body02);
    let hostValue;
    if (listGen !== "0.2") {
      const res01 = await this.rawRpcPost("host.describe", {}, signal, "host.describe");
      if (res01.ok) hostValue = res01.value;
    }
    const resolved = resolveProbedProtocol(body02, hostValue);
    if (resolved?.protocol === "0.2") {
      if (isRecord2(body02) && Array.isArray(body02.items)) {
        this.summaries = body02.items;
      }
      this.reconcileSessionSummaries(previousSummaries);
      this.realtime = true;
      return { protocolVersion: "0.2", remoteDshVersion: resolved.version ?? "0.2.x" };
    }
    if (resolved?.protocol === "0.1") {
      if (isRecord2(hostValue) && typeof hostValue.cwd === "string") {
        this.remoteHome = hostValue.cwd;
      }
      await this.refreshLegacy01Lists(signal);
      this.realtime = false;
      return { protocolVersion: "0.1", remoteDshVersion: resolved.version ?? "0.1.x" };
    }
    throw new Error(res02.ok ? "Unrecognized DSH /api response" : res02.error.message);
  }
  async runProtocol02Streams(baseUrl, signal) {
    const wsUrl = new URL("/api/remote.mux", baseUrl);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    const headers = this.authManager.getAuthHeaders(this.config);
    const socket = new WebSocket2(wsUrl.href, {
      headers,
      rejectUnauthorized: this.config.transport.kind === "direct" ? this.config.transport.rejectUnauthorized !== false : true
    });
    this.muxSocket = socket;
    await new Promise((resolve4, reject) => {
      const onOpen = () => {
        cleanup();
        resolve4();
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
        this.replayPendingInteractions();
        continue;
      }
      if (item.type === "emit" && typeof item.event === "string" && Array.isArray(item.args)) {
        this.handle02EmitEvent(item.event, item.args);
        continue;
      }
      if (item.type === "waterfall" && typeof item.event === "string" && typeof item.eventId === "string" && typeof item.agentId === "string" && isRecord2(item.request)) {
        const namespacedSessionId = encodeRemoteSessionId(this.id, item.agentId);
        const namespacedEventId = encodeRemoteEventId(this.id, item.eventId);
        const kind = pendingInteractionKind(item.event);
        if (kind !== void 0) {
          this.pendingInteractions.set(item.eventId, {
            eventId: item.eventId,
            namespacedEventId,
            deviceId: this.id,
            rawSessionId: item.agentId,
            namespacedSessionId,
            kind,
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
      case "llm/adapters-updated":
      case "settings/document-updated":
      case "credentials/record-updated":
      case "credentials/reference-updated": {
        this.callbacks.onModelCatalogChanged(this.id);
        break;
      }
      default:
        break;
    }
  }
  async pump02WorkspaceFollow(signal) {
    for await (const frame of this.openStream("workspace/follow", {}, signal)) {
      if (!isRecord2(frame) || typeof frame.type !== "string") continue;
      if ((frame.type === "baseline" || frame.type === "replace") && isRecord2(frame.value)) {
        const val = frame.value;
        this.workspaces = Array.isArray(val.items) ? val.items : [];
        this.archivedSessionIds = Array.isArray(val.archivedSessionIds) ? val.archivedSessionIds : [];
        this.pinnedSessionIds = Array.isArray(val.pinnedSessionIds) ? val.pinnedSessionIds : [];
        this.callbacks.onStateChanged(this.id);
        this.callbacks.onWorkspacesChanged(this.id);
        void this.refreshRegisteredWorkspaceOrigins();
        continue;
      }
      if (frame.type === "upsert" && isRecord2(frame.workspace)) {
        const ws = frame.workspace;
        const idx = this.workspaces.findIndex((w) => w.workspaceId === ws.workspaceId);
        if (idx === -1) this.workspaces = [ws, ...this.workspaces];
        else this.workspaces = this.workspaces.map((w, i) => i === idx ? ws : w);
        this.callbacks.onWorkspacesChanged(this.id);
        void this.refreshRegisteredWorkspaceOrigins();
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
  /**
   * Read `remote.origin.url` for workspaces that are already registered on this
   * device, so devices that both registered the same repository keep grouping.
   *
   * This is deliberately not a filesystem scan and it never registers anything:
   * only the paths DSH already lists are read. Discovering projects that exist
   * on disk but are not registered happens solely in the manual Git match.
   */
  async refreshRegisteredWorkspaceOrigins() {
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
    const previousSummaries = new Map(this.summaries.map((summary) => [summary.sessionId, summary]));
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
      void this.refreshRegisteredWorkspaceOrigins();
    }
    this.reconcileSessionSummaries(previousSummaries);
  }
  async runProtocol01Polling(_baseUrl, signal) {
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
    yield {
      type: "snapshot",
      header: { version: 2, id: sessionId, createdAt: Date.now(), isSeeded: false },
      cursor: -1,
      records: [],
      hasMore: false,
      degraded: "list-only",
      projections: { asOfSeq: -1, values: {} },
      assistantStream: { revision: 0 }
    };
    await new Promise((resolve4) => {
      signal.addEventListener("abort", () => resolve4(), { once: true });
    });
  }
  // ==========================================================================
  // Helpers
  // ==========================================================================
  /**
   * Push the initial/reconnected session list into the browser's Session store.
   *
   * DSH fetches `session.list` once per connection and then relies exclusively
   * on `api-session/added` / `api-session/removed` events. A remote device that
   * finishes its SSH handshake after that initial fetch would otherwise keep
   * its Sessions invisible even though `workspace/follow` already lists their
   * ids; the sidebar silently skips ids with no summary.
   */
  reconcileSessionSummaries(previous) {
    const current = new Map(this.summaries.map((summary) => [summary.sessionId, summary]));
    let changed = false;
    for (const summary of this.summaries) {
      const old = previous.get(summary.sessionId);
      if (old !== void 0 && old.updatedAt === summary.updatedAt && old.running === summary.running && old.blank === summary.blank && old.agentAvailable === summary.agentAvailable && old.parentSessionId === summary.parentSessionId && old.origin === summary.origin && old.cwd === summary.cwd && // Projections carry the title, model, queue and other list-surface
      // facts. A rename made while this Host was offline changes only this
      // block, so it must invalidate the summary or the reconnect keeps the
      // stale title forever.
      projectionsEqual(old.projections, summary.projections)) {
        continue;
      }
      changed = true;
      this.callbacks.onRemoteEventFrame(this.id, {
        type: "emit",
        event: "api-session/added",
        args: [this.namespaceSummary(summary)]
      });
    }
    for (const sessionId of previous.keys()) {
      if (current.has(sessionId)) continue;
      changed = true;
      this.callbacks.onRemoteEventFrame(this.id, {
        type: "emit",
        event: "api-session/removed",
        args: [encodeRemoteSessionId(this.id, sessionId)]
      });
    }
    if (changed) this.callbacks.onWorkspacesChanged(this.id);
  }
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
function projectionsEqual(left, right) {
  if (left === right) return true;
  if (left === void 0 || right === void 0) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function protocolGeneration(version) {
  if (version === void 0) return "unknown";
  const match = /^v?(\d+)\.(\d+)/.exec(version.trim());
  if (match === null) return "unknown";
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major > 0 || minor >= 2) return "0.2";
  if (major === 0 && minor === 1) return "0.1";
  return "unknown";
}
function classifyRemoteProtocol(value) {
  if (!isRecord2(value)) return "unknown";
  const fromVersion = protocolGeneration(typeof value.version === "string" ? value.version : void 0);
  if (fromVersion !== "unknown") return fromVersion;
  const fromProtocol = protocolGeneration(typeof value.protocolVersion === "string" ? value.protocolVersion : void 0);
  if (fromProtocol !== "unknown") return fromProtocol;
  if (value.protocol === "0.2" || value.wire === "0.2") return "0.2";
  return "unknown";
}
function resolveProbedProtocol(sessionListValue, hostDescribeValue) {
  const listGen = classifyRemoteProtocol(sessionListValue);
  const describeGen = classifyRemoteProtocol(hostDescribeValue);
  const listVersion = isRecord2(sessionListValue) && typeof sessionListValue.version === "string" ? sessionListValue.version : void 0;
  const describeVersion = isRecord2(hostDescribeValue) && typeof hostDescribeValue.version === "string" ? hostDescribeValue.version : void 0;
  if (listGen === "0.1" || describeGen === "0.1") {
    return { protocol: "0.1", ...describeVersion ?? listVersion ? { version: describeVersion ?? listVersion } : {} };
  }
  if (listGen === "0.2" || describeGen === "0.2") {
    return { protocol: "0.2", ...listVersion ?? describeVersion ? { version: listVersion ?? describeVersion } : {} };
  }
  if (isRecord2(sessionListValue) && Array.isArray(sessionListValue.items)) {
    return { protocol: "0.2", ...listVersion !== void 0 ? { version: listVersion } : {} };
  }
  if (describeVersion !== void 0 || isRecord2(hostDescribeValue) && typeof hostDescribeValue.cwd === "string") {
    return { protocol: "0.1", ...describeVersion !== void 0 ? { version: describeVersion } : {} };
  }
  return void 0;
}
function sleepWithSignal(ms, signal) {
  return new Promise((resolve4) => {
    if (signal.aborted) {
      resolve4();
      return;
    }
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve4();
    }
  });
}

// src/host/registry.ts
function describeProbeFailure(status, input) {
  if (status === void 0) {
    return "Could not reach remote DSH HTTP endpoint over the connection";
  }
  if (status === 401 || status === 403) {
    const ssh = input.transport.kind === "ssh" ? input.transport : void 0;
    const sshAuto = ssh !== void 0 && (input.auth?.mode ?? "auto") === "auto";
    const bootstrapping = sshAuto && ssh?.bootstrapFromRemoteCredentials === true;
    if (sshAuto && !bootstrapping) {
      return `SSH tunnel is up, but remote DSH answered HTTP ${String(status)}. Auto auth did not read the remote credentials; enable SSH credential bootstrap or paste the launch URL.`;
    }
    if (bootstrapping) {
      return `SSH tunnel is up, but remote DSH rejected the minted cookie (HTTP ${String(status)}). Check the remote DSH port (${input.transport.kind === "ssh" ? String(input.transport.remotePort ?? 3080) : "direct"}) and that dsh web is the process listening there.`;
    }
    return `SSH tunnel is up, but remote DSH answered HTTP ${String(status)}. Check the authentication token or DSH port.`;
  }
  return `Remote DSH answered HTTP ${String(status)} (check authentication token or DSH port)`;
}
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
var DEFAULT_UI_PREFERENCES = {
  sessionRowDeviceDot: false,
  nativePane: true,
  crossHostReadState: false
};
function sameGroupState2(left, right) {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}
function sanitizeNativeGroups(value) {
  const out = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  for (const [deviceId, groups] of Object.entries(value)) {
    if (deviceId === "") continue;
    const clean = sanitizeGroupState(groups);
    if (Object.keys(clean).length > 0) out[DeviceId(deviceId)] = clean;
  }
  return out;
}
var DeviceRegistry = class {
  constructor(dataFilePath, secretsFilePath, localHost, options = {}) {
    this.dataFilePath = dataFilePath;
    this.localHost = localHost;
    this.options = options;
    this.authManager = new DeviceAuthManager(secretsFilePath);
    this.nativeProxyManager = new NativeProxyManager(
      this.authManager,
      options.localOrigin,
      {
        onAuthState: (deviceId, state, error) => {
          this.setAuthState(deviceId, state, error);
        },
        onBridgeState: (deviceId, state, error) => {
          this.setNativePaneState(deviceId, state, error);
        },
        onBridgeSelection: (deviceId, sessionId) => {
          this.setNativePaneSelection(deviceId, sessionId);
        },
        getGroupState: (deviceId) => this.nativeGroups.get(deviceId),
        onGroupState: (deviceId, groups) => {
          this.setNativeGroupState(deviceId, groups);
        },
        getUnreadState: (deviceId) => this.unreadForDevice(deviceId),
        onBridgeRead: (deviceId, sessionId) => {
          this.readTracker.markRead(encodeRemoteSessionId(deviceId, sessionId));
        }
      }
    );
    this.aggregator = new WorkspaceAggregator();
    this.nativeProxyActive = options.enableNativeProxy !== false;
    this.loadFromDisk();
    this.syncSharedReadStateTimer();
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
  modelCatalogListeners = /* @__PURE__ */ new Set();
  modeListeners = /* @__PURE__ */ new Set();
  activeSessionSeq = -1;
  activeSessionClientId;
  activeSessionIsRemote = false;
  activeSessionDeviceId;
  activeSessionId;
  /** The one framed device currently rendered as the aggregated pane. */
  paneEmbeddedDeviceId;
  revision = 1;
  displayMode = "aggregated";
  gitMatchRunner;
  gitMatchRun = createIdleGitMatch();
  localWorkspaceCreator;
  aggregatedGatewayActive = false;
  aggregatedGatewayError;
  nativeProxyActive = true;
  authStates = /* @__PURE__ */ new Map();
  /** Durable mirror of each device catalog (see {@link DeviceCatalogCache}). */
  catalogs = /* @__PURE__ */ new Map();
  /** Injected Native Pane bridge lifecycle and last page selection per device. */
  nativePanes = /* @__PURE__ */ new Map();
  /** Previous connection state per device, so workspace rows are recomputed on a real transition. */
  lastDeviceStates = /* @__PURE__ */ new Map();
  /** Host-owned fold state per device, restored into the framed page before its first render. */
  nativeGroups = /* @__PURE__ */ new Map();
  /** Host-owned read/unread state for namespaced remote Sessions. */
  readTracker = new ReadStateTracker((sessionId, _state, unreadChanged) => {
    this.schedulePersist();
    if (unreadChanged) this.bumpRevision();
    this.publishUnreadState(sessionId);
  });
  /** Stable Host identity (used by the optional cross-Host state file). */
  hostId = randomUUID4();
  uiPreferences = { ...DEFAULT_UI_PREFERENCES };
  catalogPersistTimer;
  persistTimer;
  /** Optional cross-Host read-state polling and per-device push debounce. */
  sharedReadStateTimer;
  sharedReadStateInFlight = /* @__PURE__ */ new Set();
  sharedReadStateInitialized = /* @__PURE__ */ new Set();
  sharedReadStatePushTimers = /* @__PURE__ */ new Map();
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
  /**
   * Subscribe to model-catalog scope changes. The Host re-emits DSH's
   * `llm/adapters-updated` event so the browser's shared model picker drops its
   * cached catalog and asks `session/modelCatalog` again.
   */
  onModelCatalogChanged(listener) {
    this.modelCatalogListeners.add(listener);
    return () => this.modelCatalogListeners.delete(listener);
  }
  /**
   * Record the Session currently rendered on the right. `requestSeq` is
   * client-monotonic so out-of-order control-plane HTTP requests cannot move
   * the scope back to a previously selected Session.
   */
  setActiveSession(sessionId, requestSeq = 0, clientId = "") {
    const sameClient = clientId === "" || clientId === this.activeSessionClientId;
    if (sameClient && requestSeq > 0 && requestSeq <= this.activeSessionSeq) return false;
    if (clientId !== "") this.activeSessionClientId = clientId;
    if (requestSeq > 0) this.activeSessionSeq = requestSeq;
    const previousKind = this.activeSessionIsRemote ? "remote" : "local";
    const previousDeviceId = this.activeSessionDeviceId;
    const next = sessionId === void 0 || sessionId === "" ? void 0 : sessionId;
    const decoded = next !== void 0 ? decodeSessionId(next) : void 0;
    this.activeSessionId = next;
    this.activeSessionIsRemote = decoded?.isRemote === true;
    this.activeSessionDeviceId = decoded?.isRemote === true ? decoded.deviceId : void 0;
    const changed = previousKind !== (this.activeSessionIsRemote ? "remote" : "local") || previousDeviceId !== this.activeSessionDeviceId;
    if (changed) this.notifyModelCatalogChanged();
    if (this.activeSessionIsRemote && this.activeSessionDeviceId !== void 0) {
      this.publishNativePaneSession(this.activeSessionDeviceId);
    }
    this.syncNativePaneEmbedding();
    if (next !== void 0) this.readTracker.markRead(next);
    return changed;
  }
  /**
   * Clear one remote Session's unread marker. Returns true when this call
   * actually removed a marker, so callers can distinguish a real transition
   * from a redundant read touch.
   */
  markSessionRead(sessionId) {
    return this.readTracker.markRead(sessionId);
  }
  /** Local DSH session status, observed through this Host's own event bus. */
  observeLocalSessionStatus(sessionId, running) {
    if (typeof sessionId !== "string" || sessionId === "") return;
    this.readTracker.observeRunning(sessionId, running);
  }
  /** Persisted fold state for one device; the bridge injection uses this map. */
  nativeGroupState(deviceId) {
    return this.nativeGroups.get(deviceId);
  }
  /**
   * Accept a fold-state report from a framed page. This is deliberately not
   * part of the UI snapshot: only the device's bridge needs it, and routing it
   * through revisions would re-render every sidebar row on each fold click.
   */
  setNativeGroupState(deviceId, groups) {
    if (!this.configs.has(deviceId)) return;
    const next = sanitizeGroupState(groups);
    const previous = this.nativeGroups.get(deviceId);
    if (previous !== void 0 && sameGroupState2(previous, next)) return;
    if (Object.keys(next).length === 0) this.nativeGroups.delete(deviceId);
    else this.nativeGroups.set(deviceId, next);
    this.schedulePersist();
    this.nativeProxyManager.setGroupState(deviceId, next);
  }
  /** Raw remote Session IDs that are unread on one device. */
  unreadForDevice(deviceId) {
    const out = [];
    for (const sessionId of this.readTracker.unreadIds()) {
      const decoded = decodeSessionId(sessionId);
      if (decoded.isRemote && decoded.deviceId === deviceId) out.push(decoded.rawSessionId);
    }
    return out;
  }
  /** Push the new unread set to the owning device's framed page. */
  publishUnreadState(sessionId) {
    const decoded = decodeSessionId(sessionId);
    if (!decoded.isRemote) return;
    this.nativeProxyManager.setUnreadState(decoded.deviceId, this.unreadForDevice(decoded.deviceId));
    this.scheduleSharedReadStatePush(decoded.deviceId);
  }
  /**
   * Reconcile running flags from the authoritative list. DSH can miss a
   * `api-session/status` frame across a stream gap; the list refresh still
   * carries the final flag, and a live `true -> false` there is a completion
   * for the same reason a stream event is.
   */
  reconcileRunningForDevice(deviceId) {
    const client = this.clients.get(deviceId);
    if (client === void 0 || !client.isConnected()) return;
    if (client.toView().catalogStale === true) return;
    for (const summary of client.sessionSummaries()) {
      this.readTracker.observeRunning(
        encodeRemoteSessionId(deviceId, summary.sessionId),
        summary.running
      );
    }
  }
  /** Observe one remote event before it is forwarded to the local mirror. */
  observeRemoteFrame(deviceId, frame) {
    if (frame.type !== "emit" || frame.event !== "api-session/status") return;
    const [sessionId, running] = frame.args;
    if (typeof sessionId !== "string" || typeof running !== "boolean") return;
    const client = this.clients.get(deviceId);
    if (client === void 0 || !client.isConnected()) return;
    this.readTracker.observeRunning(sessionId, running);
  }
  /**
   * Optional cross-Host sync. The state file lives in the remote DSH home and
   * is written only over an existing SSH transport; direct-only devices and
   * Windows remote homes are skipped rather than guessed at.
   */
  /** Seed the transition baseline from a cached catalog without marking it unread. */
  seedRunningFromCatalog(client) {
    for (const summary of client.sessionSummaries()) {
      if (!summary.running) continue;
      this.readTracker.observeRunning(encodeRemoteSessionId(client.id, summary.sessionId), true);
    }
  }
  /** One pull+push per connection once the remote home is known. */
  maybeInitializeSharedReadState(deviceId) {
    if (!this.uiPreferences.crossHostReadState) return;
    if (this.sharedReadStateInitialized.has(deviceId)) return;
    const client = this.clients.get(deviceId);
    if (client === void 0 || !client.isConnected()) return;
    if (!isPosixRemoteHome(client.toView().remoteHome)) return;
    this.sharedReadStateInitialized.add(deviceId);
    void this.pullSharedReadState(deviceId).then(() => {
      this.scheduleSharedReadStatePush(deviceId, 0);
    });
  }
  sharedReadStateTarget(deviceId) {
    if (!this.uiPreferences.crossHostReadState) return void 0;
    const client = this.clients.get(deviceId);
    if (client === void 0 || !client.isConnected()) return void 0;
    const transport = client.deviceConfig.transport;
    if (transport.kind !== "ssh") return void 0;
    const remoteHome = client.toView().remoteHome;
    if (!isPosixRemoteHome(remoteHome)) return void 0;
    return { transport, path: sharedReadStatePath(remoteHome) };
  }
  scheduleSharedReadStatePush(deviceId, delayMs = 1500) {
    if (!this.uiPreferences.crossHostReadState) return;
    if (this.sharedReadStateInFlight.has(deviceId)) return;
    if (this.sharedReadStatePushTimers.has(deviceId)) return;
    const timer = setTimeout(() => {
      this.sharedReadStatePushTimers.delete(deviceId);
      void this.pushSharedReadState(deviceId);
    }, delayMs);
    timer.unref?.();
    this.sharedReadStatePushTimers.set(deviceId, timer);
  }
  /** Read the remote file and merge every Host's Session entries locally. */
  async pullSharedReadState(deviceId) {
    const target = this.sharedReadStateTarget(deviceId);
    if (target === void 0 || this.sharedReadStateInFlight.has(deviceId)) return;
    this.sharedReadStateInFlight.add(deviceId);
    try {
      const read = await execSshCommand(
        target.transport,
        buildReadSharedStateCommand(target.path),
        8e3
      );
      if (!read.ok) return;
      const doc = parseSharedReadDocument(read.stdout);
      if (doc !== void 0) this.mergeSharedReadDocument(deviceId, doc);
    } catch {
    } finally {
      this.sharedReadStateInFlight.delete(deviceId);
    }
  }
  /**
   * Read-merge-write one Host section. Preserving the other sections is what
   * makes several Hosts converge; the write only happens after a successful
   * read so an unreachable file cannot clobber another machine's reminders.
   */
  async pushSharedReadState(deviceId) {
    const target = this.sharedReadStateTarget(deviceId);
    if (target === void 0 || this.sharedReadStateInFlight.has(deviceId)) return;
    this.sharedReadStateInFlight.add(deviceId);
    try {
      const read = await execSshCommand(
        target.transport,
        buildReadSharedStateCommand(target.path),
        8e3
      );
      if (!read.ok) return;
      const existing = parseSharedReadDocument(read.stdout);
      if (existing !== void 0) this.mergeSharedReadDocument(deviceId, existing);
      const sessions = {};
      for (const [sessionId, entry] of Object.entries(this.readTracker.entriesSnapshot())) {
        const decoded = decodeSessionId(sessionId);
        if (!decoded.isRemote || decoded.deviceId !== deviceId) continue;
        if (decoded.rawSessionId === "__proto__" || decoded.rawSessionId === "constructor" || decoded.rawSessionId === "prototype") continue;
        sessions[decoded.rawSessionId] = entry;
      }
      const doc = buildSharedReadDocument(existing, this.hostId, sessions, Date.now());
      await execSshCommand(
        target.transport,
        buildWriteSharedStateCommand(target.path, doc),
        15e3
      );
    } catch {
    } finally {
      this.sharedReadStateInFlight.delete(deviceId);
    }
  }
  mergeSharedReadDocument(deviceId, doc) {
    if (doc === void 0) return;
    for (const section of Object.values(doc.hosts)) {
      for (const [rawSessionId, entry] of Object.entries(section.sessions)) {
        this.readTracker.mergeEntry(encodeRemoteSessionId(deviceId, rawSessionId), entry);
      }
    }
  }
  /** Start/stop the 30s remote scan when the preference changes. */
  syncSharedReadStateTimer() {
    if (!this.uiPreferences.crossHostReadState) {
      if (this.sharedReadStateTimer !== void 0) {
        clearInterval(this.sharedReadStateTimer);
        this.sharedReadStateTimer = void 0;
      }
      this.sharedReadStateInitialized.clear();
      return;
    }
    if (this.sharedReadStateTimer !== void 0) return;
    const timer = setInterval(() => {
      for (const deviceId of this.clients.keys()) {
        void this.pullSharedReadState(deviceId);
      }
    }, 3e4);
    timer.unref?.();
    this.sharedReadStateTimer = timer;
    for (const deviceId of this.clients.keys()) {
      this.maybeInitializeSharedReadState(deviceId);
      this.scheduleSharedReadStatePush(deviceId, 0);
    }
  }
  schedulePersist() {
    if (this.persistTimer !== void 0) return;
    const timer = setTimeout(() => {
      this.persistTimer = void 0;
      try {
        this.saveToDisk();
      } catch {
      }
    }, 800);
    timer.unref?.();
    this.persistTimer = timer;
  }
  /**
   * Keep exactly one device frame in embedded mode (remote sidebar hidden) and
   * restore every other frame's sidebar for full native rendering.
   */
  syncNativePaneEmbedding() {
    const next = this.displayMode === "aggregated" && this.uiPreferences.nativePane && this.activeSessionIsRemote && this.activeSessionDeviceId !== void 0 ? this.activeSessionDeviceId : void 0;
    if (next === this.paneEmbeddedDeviceId) return;
    const previous = this.paneEmbeddedDeviceId;
    this.paneEmbeddedDeviceId = next;
    if (previous !== void 0 && previous !== next) {
      this.nativeProxyManager.setEmbedded(previous, false);
    }
    if (next !== void 0) this.nativeProxyManager.setEmbedded(next, true);
  }
  /**
   * Ask the framed page of the active remote device to show the selected
   * Session. Called on every selection and when a bridge becomes ready; the
   * proxy queues the command until then, so an iframe that is still loading
   * still lands on the right conversation.
   */
  publishNativePaneSession(deviceId) {
    if (this.displayMode !== "aggregated") return;
    if (!this.uiPreferences.nativePane) return;
    if (this.activeSessionDeviceId !== deviceId || this.activeSessionId === void 0) return;
    const decoded = decodeSessionId(this.activeSessionId);
    if (!decoded.isRemote || decoded.deviceId !== deviceId) return;
    this.nativeProxyManager.openSession(deviceId, decoded.rawSessionId);
  }
  setNativePaneState(deviceId, state, error) {
    const previous = this.nativePanes.get(deviceId);
    const nextError = error?.trim() === "" ? void 0 : error;
    const nextSessionId = state === "ready" ? previous?.sessionId : void 0;
    if (previous?.state === state && previous.error === nextError && previous.sessionId === nextSessionId) {
      return;
    }
    this.nativePanes.set(deviceId, {
      state,
      ...nextError !== void 0 ? { error: nextError } : {},
      ...nextSessionId !== void 0 ? { sessionId: nextSessionId } : {}
    });
    this.bumpRevision();
    if (state === "ready") {
      this.publishNativePaneSession(deviceId);
      if (this.paneEmbeddedDeviceId === deviceId) {
        this.nativeProxyManager.setEmbedded(deviceId, true);
      }
    }
  }
  setNativePaneSelection(deviceId, sessionId) {
    const previous = this.nativePanes.get(deviceId);
    if (previous?.sessionId === sessionId) return;
    this.nativePanes.set(deviceId, {
      state: previous?.state ?? "idle",
      ...previous?.error !== void 0 ? { error: previous.error } : {},
      ...sessionId !== void 0 ? { sessionId } : {}
    });
    this.bumpRevision();
    if (sessionId !== void 0) {
      this.readTracker.markRead(encodeRemoteSessionId(deviceId, sessionId));
    }
  }
  withNativePane(view) {
    const pane = this.nativePanes.get(view.id);
    if (pane === void 0) return view;
    return {
      ...view,
      nativePaneState: pane.state,
      ...pane.error !== void 0 ? { nativePaneError: pane.error } : {},
      ...pane.sessionId !== void 0 ? { nativePaneSessionId: pane.sessionId } : {}
    };
  }
  /** Scope `session/modelCatalog` to the Session currently shown on the right. */
  activeSessionScope() {
    if (!this.activeSessionIsRemote || this.activeSessionDeviceId === void 0) {
      return { kind: "local" };
    }
    const client = this.clients.get(this.activeSessionDeviceId);
    return {
      kind: "remote",
      deviceId: this.activeSessionDeviceId,
      deviceName: client?.toView().name ?? String(this.activeSessionDeviceId),
      client
    };
  }
  notifyModelCatalogChanged() {
    for (const listener of this.modelCatalogListeners) {
      try {
        listener();
      } catch {
      }
    }
  }
  onDisplayModeChanged(listener) {
    this.modeListeners.add(listener);
    return () => this.modeListeners.delete(listener);
  }
  /** Host-authoritative UI mode. Defaults to aggregated for existing installs. */
  getDisplayMode() {
    return this.displayMode;
  }
  /** Aggregated mode is the only mode that may merge or route remote data. */
  isAggregatedMode() {
    return this.displayMode === "aggregated";
  }
  /**
   * Persist and publish a mode change. The workspace stream recomputes its
   * snapshot immediately, so already-connected clients receive remove/upsert
   * frames for the rows that just became invisible (or visible again).
   */
  setDisplayMode(mode) {
    if (this.displayMode === mode) return;
    this.displayMode = mode;
    this.saveToDisk();
    this.bumpRevision();
    this.notifyWorkspacesChanged();
    this.syncNativePaneEmbedding();
    for (const listener of this.modeListeners) {
      try {
        listener(mode);
      } catch {
      }
    }
  }
  startAll() {
    for (const config of this.configs.values()) {
      void this.mountClient(config);
    }
  }
  dispose() {
    try {
      this.flushCatalogCache();
      this.saveToDisk();
    } catch {
    }
    for (const client of this.clients.values()) {
      client.stop();
    }
    this.clients.clear();
    if (this.catalogPersistTimer !== void 0) {
      clearTimeout(this.catalogPersistTimer);
      this.catalogPersistTimer = void 0;
    }
    if (this.persistTimer !== void 0) {
      clearTimeout(this.persistTimer);
      this.persistTimer = void 0;
    }
    if (this.sharedReadStateTimer !== void 0) {
      clearInterval(this.sharedReadStateTimer);
      this.sharedReadStateTimer = void 0;
    }
    for (const timer of this.sharedReadStatePushTimers.values()) clearTimeout(timer);
    this.sharedReadStatePushTimers.clear();
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
    this.authStates.delete(id);
    this.saveToDisk();
    const client = await this.mountClient(sanitized);
    this.bumpRevision();
    this.notifyWorkspacesChanged();
    return { ok: true, device: this.withNativePane(this.withAuthState(client.toView())) };
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
    this.authStates.delete(deviceId);
    this.catalogs.delete(deviceId);
    this.nativePanes.delete(deviceId);
    this.nativeGroups.delete(deviceId);
    this.sharedReadStateInitialized.delete(deviceId);
    const pendingPush = this.sharedReadStatePushTimers.get(deviceId);
    if (pendingPush !== void 0) {
      clearTimeout(pendingPush);
      this.sharedReadStatePushTimers.delete(deviceId);
    }
    this.readTracker.retain((sessionId) => {
      const decoded = decodeSessionId(sessionId);
      return !decoded.isRemote || decoded.deviceId !== deviceId;
    });
    this.lastDeviceStates.delete(deviceId);
    if (this.paneEmbeddedDeviceId === deviceId) this.paneEmbeddedDeviceId = void 0;
    this.saveToDisk();
    this.bumpRevision();
    this.notifyWorkspacesChanged();
    return true;
  }
  reconnectDevice(deviceId) {
    const client = this.clients.get(deviceId);
    if (client === void 0) return false;
    this.authStates.delete(deviceId);
    client.reconnectNow();
    this.bumpRevision();
    return true;
  }
  /** Current native-mode credential state for one device. */
  authStateOf(deviceId) {
    return this.authStates.get(deviceId)?.state ?? "unknown";
  }
  setAuthState(deviceId, state, error) {
    const previous = this.authStates.get(deviceId);
    const nextError = error?.trim() === "" ? void 0 : error;
    if (previous?.state === state && previous.error === nextError) return;
    this.authStates.set(deviceId, {
      state,
      ...nextError !== void 0 ? { error: nextError } : {}
    });
    this.bumpRevision();
  }
  withAuthState(view) {
    const auth = this.authStates.get(view.id);
    if (auth === void 0) return view;
    return {
      ...view,
      authState: auth.state,
      ...auth.error !== void 0 ? { authError: auth.error } : {}
    };
  }
  /**
   * Re-authenticate one device on user request. An explicit credential (launch
   * URL/token) replaces the stored one; otherwise the SSH bootstrap path runs
   * again. Always forces a fresh cookie so a rotated remote secret recovers.
   */
  async authenticateDevice(deviceId, credential) {
    const config = this.configs.get(deviceId);
    const client = this.clients.get(deviceId);
    if (config === void 0 || client === void 0) {
      return { ok: false, error: "Device is not configured" };
    }
    if (credential !== void 0 && credential.trim() !== "") {
      this.authManager.setAuthCredential(deviceId, credential.trim());
    }
    const baseUrl = client.effectiveBaseUrl();
    if (baseUrl === void 0) {
      return { ok: false, error: "The SSH tunnel is not ready yet. Try again in a moment." };
    }
    this.authManager.invalidate(deviceId);
    const repairConfig = {
      ...config,
      auth: { ...config.auth ?? { mode: "auto" }, mode: "auto" },
      ...config.transport.kind === "ssh" ? {
        transport: {
          ...config.transport,
          bootstrapFromRemoteCredentials: true
        }
      } : {}
    };
    const result = await this.authManager.ensureAuthenticated(repairConfig, baseUrl, true);
    if (!result.ok) {
      this.setAuthState(deviceId, "required", result.error);
      return result;
    }
    this.setAuthState(deviceId, "ok");
    return { ok: true, authState: "ok" };
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
      const listValue = res02 !== void 0 && res02.status >= 200 && res02.status < 300 ? parseProbeBody(res02.body).result?.value : void 0;
      const listGen = classifyRemoteProtocol(listValue);
      let describeValue;
      if (listGen !== "0.2") {
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
          describeValue = parseProbeBody(res01.body).result?.value;
        }
      }
      const resolved = resolveProbedProtocol(listValue, describeValue);
      if (resolved !== void 0) {
        return {
          ok: true,
          protocolVersion: resolved.protocol,
          remoteDshVersion: resolved.version ?? (resolved.protocol === "0.2" ? "0.2.x" : "0.1.x"),
          latencyMs: Date.now() - t0
        };
      }
      return {
        ok: false,
        error: describeProbeFailure(res02?.status, input)
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
  /** Wire the local Workspace controller so a match can register local folders. */
  setLocalWorkspaceCreator(creator) {
    this.localWorkspaceCreator = creator;
  }
  /** Latest manual Git match state (running progress or the last outcome). */
  gitMatch() {
    return this.gitMatchRun;
  }
  /**
   * Start the manual Git match run. This is the only trigger: nothing in the
   * device/session streams starts a scan or registers a workspace.
   */
  startGitMatch() {
    if (this.gitMatchRunner?.running === true) {
      return { ok: false, error: "A Git match run is already in progress" };
    }
    const targets = this.gitMatchTargets();
    if (targets.length === 0) {
      return { ok: false, error: "No device to scan" };
    }
    const runner = new GitMatchRunner({
      devices: () => this.gitMatchTargets(),
      discoverRemoteOrigins: (deviceId, paths) => this.discoverRemoteOrigins(deviceId, paths),
      scanRemoteRepos: (deviceId, roots) => this.scanRemoteRepos(deviceId, roots),
      scanLocalRepos: (roots) => scanLocalGitRepos(roots),
      createLocalWorkspace: async (path) => {
        if (this.localWorkspaceCreator === void 0) {
          return { ok: false, error: "Local workspace creation is unavailable" };
        }
        try {
          await this.localWorkspaceCreator(path);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      createRemoteWorkspace: async (deviceId, path) => {
        const res = await this.createRemoteWorkspace({ deviceId, path });
        return res.ok ? { ok: true } : { ok: false, error: res.error };
      },
      noteOrigin: (deviceId, path, rawOrigin) => {
        this.aggregator.noteGitRemote(deviceId, path, rawOrigin);
      },
      localHome: () => homedir3(),
      onProgress: (run) => {
        this.gitMatchRun = run;
        this.bumpRevision();
        if (run.status !== "running") this.saveToDisk();
      }
    });
    this.gitMatchRunner = runner;
    void runner.execute();
    return { ok: true };
  }
  /** Ask the running manual Git match to stop. */
  cancelGitMatch() {
    return this.gitMatchRunner?.cancel() === true;
  }
  gitMatchTargets() {
    const targets = [
      {
        deviceId: LOCAL_DEVICE_ID,
        deviceName: "Local",
        state: "connected",
        local: true,
        home: homedir3(),
        workspacePaths: this.localHost.localWorkspaces().map((ws) => ws.path)
      }
    ];
    for (const [deviceId, config] of this.configs) {
      const client = this.clients.get(deviceId);
      const view = client?.toView();
      targets.push({
        deviceId,
        deviceName: view?.name ?? config.name,
        state: view?.state ?? "connecting",
        local: false,
        ...view?.remoteHome !== void 0 ? { home: view.remoteHome } : {},
        workspacePaths: client?.workspaceItems().map((ws) => ws.path) ?? []
      });
    }
    return targets;
  }
  async discoverRemoteOrigins(deviceId, paths) {
    if (paths.length === 0) return /* @__PURE__ */ new Map();
    const config = this.configs.get(deviceId);
    if (config === void 0 || config.transport.kind !== "ssh") return /* @__PURE__ */ new Map();
    const found = await discoverRemoteGitRemotesViaSsh(config.transport, paths);
    for (const [path, rawUrl] of found) this.aggregator.noteGitRemote(deviceId, path, rawUrl);
    return found;
  }
  async scanRemoteRepos(deviceId, roots) {
    const config = this.configs.get(deviceId);
    if (config === void 0) return { ok: false, error: "Device is not configured" };
    if (config.transport.kind !== "ssh") {
      return { ok: false, error: "Scanning requires an SSH transport" };
    }
    return scanRemoteGitRepos(config.transport, roots);
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
      const archived = new Set(client.archivedIds());
      const attached = new Set(
        client.workspaceItems().flatMap((ws) => [...ws.sessionIds])
      );
      const orphanByCwd = /* @__PURE__ */ new Map();
      for (const s of summaries) {
        if (s.blank || s.cwd === void 0 || s.parentSessionId !== void 0) continue;
        if (archived.has(s.sessionId) || attached.has(s.sessionId)) continue;
        const key = normalizeWorkspacePath(s.cwd);
        if (key === "") continue;
        const list = orphanByCwd.get(key) ?? [];
        list.push(s.sessionId);
        orphanByCwd.set(key, list);
      }
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
        const adopted = orphanByCwd.get(normalizeWorkspacePath(ws.path)) ?? [];
        const sessionIds = adopted.length === 0 ? [...ws.sessionIds] : [...ws.sessionIds, ...adopted];
        const runningCount = sessionIds.filter((id) => runningBySession.get(id) === true).length;
        physicalInputs.push({
          deviceId: client.id,
          deviceName: view.name,
          workspaceId: ws.workspaceId,
          path: ws.path,
          title: ws.title,
          sessionIds,
          runningSessionCount: runningCount,
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt
        });
      }
    }
    const deviceStates = /* @__PURE__ */ new Map([
      [LOCAL_DEVICE_ID, "connected"]
    ]);
    for (const [deviceId, client] of this.clients.entries()) {
      deviceStates.set(deviceId, client.toView().state);
    }
    const { logicalWorkspaces, allPhysicalWorkspaces } = this.aggregator.aggregate(
      physicalInputs,
      updatedAtMap,
      deviceStates
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
      displayMode: this.displayMode,
      hostStatus: {
        aggregatedGatewayActive: this.aggregatedGatewayActive,
        ...this.aggregatedGatewayError !== void 0 ? { aggregatedGatewayError: this.aggregatedGatewayError } : {},
        nativeProxyActive: this.nativeProxyActive
      },
      devices: [...this.clients.values()].map((c) => this.withNativePane(this.withAuthState(c.toView()))),
      sshConfigHosts: listSshConfigHosts(),
      aggregationConfig: this.aggregator.getConfig(),
      logicalWorkspaces,
      allPhysicalWorkspaces,
      sessionOrigins,
      unreadSessionIds: this.readTracker.unreadIds(),
      gitMatch: this.gitMatchRun,
      ui: this.uiPreferences
    };
  }
  /** Persisted display preferences (Snapshot also carries them under `ui`). */
  ui() {
    return this.uiPreferences;
  }
  /** Update and persist display preferences; unknown keys are ignored by the type. */
  updateUiPreferences(patch) {
    this.uiPreferences = {
      sessionRowDeviceDot: patch.sessionRowDeviceDot === void 0 ? this.uiPreferences.sessionRowDeviceDot : patch.sessionRowDeviceDot === true,
      nativePane: patch.nativePane === void 0 ? this.uiPreferences.nativePane : patch.nativePane === true,
      crossHostReadState: patch.crossHostReadState === void 0 ? this.uiPreferences.crossHostReadState : patch.crossHostReadState === true
    };
    this.saveToDisk();
    this.bumpRevision();
    this.syncNativePaneEmbedding();
    this.syncSharedReadStateTimer();
    return this.uiPreferences;
  }
  /**
   * Wait for a device to become reachable, bounded by `timeoutMs`.
   *
   * The local machine is always reachable; an unconfigured or disabled device
   * answers false immediately. Callers use this before opening a Session so a
   * tunnel that is still coming back up does not surface as a transport error.
   */
  async waitForDeviceConnected(deviceId, signal, timeoutMs) {
    if (deviceId === LOCAL_DEVICE_ID) return true;
    const client = this.clients.get(deviceId);
    if (client === void 0) return false;
    if (client.isConnected()) return true;
    if (!client.deviceConfig.enabled) return false;
    return client.waitForConnected(signal, timeoutMs);
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
      onStateChanged: (deviceId) => {
        this.bumpRevision();
        this.scheduleCatalogPersist();
        const state = this.clients.get(deviceId)?.connectionState;
        if (state === "connected") {
          this.reconcileRunningForDevice(deviceId);
          this.maybeInitializeSharedReadState(deviceId);
        } else {
          this.sharedReadStateInitialized.delete(deviceId);
        }
        if (state !== void 0 && this.lastDeviceStates.get(deviceId) !== state) {
          this.lastDeviceStates.set(deviceId, state);
          this.notifyWorkspacesChanged();
        }
        if (this.activeSessionIsRemote && this.activeSessionDeviceId === deviceId) {
          this.notifyModelCatalogChanged();
        }
      },
      onModelCatalogChanged: (deviceId) => {
        if (this.activeSessionIsRemote && this.activeSessionDeviceId === deviceId) {
          this.notifyModelCatalogChanged();
        }
      },
      onRemoteEventFrame: (deviceId, frame) => {
        this.observeRemoteFrame(deviceId, frame);
        for (const listener of this.eventListeners) listener(deviceId, frame);
      },
      onControlProjectionFrame: (deviceId, frame) => {
        for (const listener of this.projectionListeners) listener(deviceId, frame);
      },
      onWorkspacesChanged: (deviceId) => {
        this.reconcileRunningForDevice(deviceId);
        this.bumpRevision();
        this.notifyWorkspacesChanged();
        this.scheduleCatalogPersist();
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
      client.hydrateCatalog(this.catalogs.get(config.id));
      this.clients.set(config.id, client);
      this.seedRunningFromCatalog(client);
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
  /**
   * Publish a workspace-set change made directly through the aggregator
   * (a logical-workspace split, an external organizer, ...). Workspace
   * consumers derive both data and visibility from the registry snapshot, so
   * they must be woken even when no platform controller method ran.
   */
  refreshWorkspaceView() {
    this.bumpRevision();
    this.notifyWorkspacesChanged();
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
      if (typeof raw.hostId === "string" && /^[A-Za-z0-9-]{8,80}$/.test(raw.hostId)) {
        this.hostId = raw.hostId;
      }
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
      if (raw.ui && typeof raw.ui === "object") {
        this.uiPreferences = {
          sessionRowDeviceDot: raw.ui.sessionRowDeviceDot === true,
          // Older documents predate the preference; the pane is the default.
          nativePane: raw.ui.nativePane !== false,
          crossHostReadState: raw.ui.crossHostReadState === true
        };
      }
      if (raw.displayMode === "native") this.displayMode = "native";
      else if (raw.displayMode === "aggregated") this.displayMode = "aggregated";
      if (raw.catalogs && typeof raw.catalogs === "object") {
        for (const [deviceId, catalog] of Object.entries(raw.catalogs)) {
          if (this.configs.has(DeviceId(deviceId))) {
            this.catalogs.set(DeviceId(deviceId), catalog);
          }
        }
      }
      for (const [deviceId, groups] of Object.entries(sanitizeNativeGroups(raw.nativeGroups))) {
        if (this.configs.has(deviceId)) this.nativeGroups.set(deviceId, groups);
      }
      if (raw.readState && typeof raw.readState === "object") {
        this.readTracker.hydrate(raw.readState.entries);
        this.readTracker.retain((sessionId) => {
          const decoded = decodeSessionId(sessionId);
          return decoded.isRemote && this.configs.has(decoded.deviceId);
        });
      }
      if (raw.gitMatch && typeof raw.gitMatch === "object") {
        const restored = raw.gitMatch;
        this.gitMatchRun = restored.status === "running" ? {
          ...restored,
          status: "failed",
          phase: "finished",
          error: "Interrupted before completion",
          currentDeviceId: void 0,
          currentDeviceName: void 0,
          currentProject: void 0
        } : restored;
      }
      if (migratedSecrets) this.saveToDisk();
    } catch {
    }
  }
  /** Persisted catalog of one device (hydrated cache or the last capture). */
  deviceCatalog(deviceId) {
    return this.catalogs.get(deviceId);
  }
  /**
   * Replace the persisted catalog of one device. Used for hydration and by
   * tests; live clients are captured through {@link scheduleCatalogPersist}.
   */
  setDeviceCatalog(cache) {
    this.catalogs.set(cache.deviceId, trimCatalog(cache));
  }
  /**
   * Capture every live client's catalog and write it to disk. Debounced: the
   * session/workspace streams can burst many changes per turn, and the file is
   * rewritten atomically on each save.
   */
  scheduleCatalogPersist() {
    if (this.catalogPersistTimer !== void 0) return;
    this.catalogPersistTimer = setTimeout(() => {
      this.catalogPersistTimer = void 0;
      try {
        this.flushCatalogCache();
        this.saveToDisk();
      } catch {
      }
    }, 3e3);
    if (typeof this.catalogPersistTimer === "object" && this.catalogPersistTimer !== null) {
      const timer = this.catalogPersistTimer;
      timer.unref?.();
    }
  }
  /** Copy each client's current catalog into the durable map. */
  flushCatalogCache() {
    for (const [deviceId, client] of this.clients.entries()) {
      const snapshot = client.catalogSnapshot();
      if (snapshot.syncedAt === 0 && snapshot.sessions.length === 0 && snapshot.workspaces.length === 0) continue;
      this.catalogs.set(deviceId, trimCatalog(snapshot));
    }
  }
  saveToDisk() {
    const dir = dirname4(this.dataFilePath);
    mkdirSync2(dir, { recursive: true });
    const tmp = `${this.dataFilePath}.${randomUUID4()}.tmp`;
    const readEntries = this.readTracker.entriesSnapshot();
    const doc = {
      version: 1,
      devices: [...this.configs.values()],
      aggregation: this.aggregator.getConfig(),
      displayMode: this.displayMode,
      gitMatch: this.gitMatchRun,
      ui: this.uiPreferences,
      hostId: this.hostId,
      ...this.catalogs.size > 0 ? { catalogs: Object.fromEntries(this.catalogs) } : {},
      ...this.nativeGroups.size > 0 ? { nativeGroups: Object.fromEntries(this.nativeGroups) } : {},
      ...Object.keys(readEntries).length > 0 ? { readState: { entries: readEntries } } : {}
    };
    try {
      writeFileSync2(tmp, JSON.stringify(doc, null, 2), { mode: 384 });
      try {
        chmodSync2(tmp, 384);
      } catch {
      }
      copyFileSync2(tmp, this.dataFilePath);
      try {
        chmodSync2(this.dataFilePath, 384);
      } catch {
      }
    } finally {
      try {
        unlinkSync2(tmp);
      } catch {
      }
    }
  }
};
var CATALOG_SESSION_LIMIT = 2e3;
var CATALOG_WORKSPACE_LIMIT = 300;
var CATALOG_ID_LIMIT = 5e3;
function trimCatalog(cache) {
  const sessions = cache.sessions.length > CATALOG_SESSION_LIMIT ? [...cache.sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, CATALOG_SESSION_LIMIT) : cache.sessions;
  return {
    ...cache,
    sessions,
    workspaces: cache.workspaces.length > CATALOG_WORKSPACE_LIMIT ? cache.workspaces.slice(0, CATALOG_WORKSPACE_LIMIT) : cache.workspaces,
    archivedSessionIds: cache.archivedSessionIds.slice(0, CATALOG_ID_LIMIT),
    pinnedSessionIds: cache.pinnedSessionIds.slice(0, CATALOG_ID_LIMIT)
  };
}
function parseProbeBody(body) {
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    return {};
  }
}

// src/runtime.ts
var MULTI_DEVICE_API_PATH = "/multi-device/api";
var MULTI_DEVICE_EVENTS_PATH = "/multi-device/events";
var MAX_BODY_BYTES = 2 * 1024 * 1024;
var LOOPBACK_NAMES = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "[::1]"]);
function isLoopbackHostHeader(hostHeader) {
  const host = (hostHeader ?? "").trim().toLowerCase();
  if (LOOPBACK_NAMES.has(host)) return true;
  return host.startsWith("127.0.0.1:") || host.startsWith("localhost:") || host.startsWith("[::1]:");
}
function admitControlPlaneRequest(headers, extraRejection) {
  const host = headers.host ?? "";
  if (!isLoopbackHostHeader(host)) return false;
  if (headers["sec-fetch-site"] === "cross-site") return false;
  const origin = headers.origin;
  if (typeof origin === "string" && origin !== "") {
    try {
      const parsed = new URL(origin);
      if (!LOOPBACK_NAMES.has(parsed.hostname.toLowerCase())) return false;
      if (parsed.host.toLowerCase() !== host.toLowerCase()) return false;
    } catch {
      return false;
    }
  }
  if (extraRejection?.(headers) !== void 0) return false;
  return true;
}
function readConnectionService(ctx) {
  try {
    return ctx.get?.("connection");
  } catch {
    return void 0;
  }
}
function connectionRequestRejection(ctx, headers) {
  const connection = readConnectionService(ctx);
  if (connection === void 0 || typeof connection.requestRejection !== "function") return void 0;
  try {
    return connection.requestRejection({ headers });
  } catch {
    return 403;
  }
}
function admitMultiDeviceRequest(ctx, req) {
  try {
    return admitControlPlaneRequest(req.headers, (headers) => connectionRequestRejection(ctx, headers));
  } catch {
    return false;
  }
}
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
        case "setActiveSession": {
          const raw = payload.sessionId;
          const sessionId = typeof raw === "string" && raw !== "" ? raw : void 0;
          const requestSeq = typeof payload.requestSeq === "number" && Number.isFinite(payload.requestSeq) ? payload.requestSeq : 0;
          const clientId = typeof payload.clientId === "string" ? payload.clientId : "";
          this.registry.setActiveSession(sessionId, requestSeq, clientId);
          return { ok: true, value: { accepted: true } };
        }
        case "markSessionRead": {
          const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
          if (sessionId === "") {
            return { ok: false, error: "sessionId is required" };
          }
          const changed = this.registry.markSessionRead(sessionId);
          return {
            ok: true,
            value: { changed, snapshot: this.registry.snapshot() }
          };
        }
        case "setDisplayMode": {
          const mode = payload.displayMode;
          if (mode !== "aggregated" && mode !== "native") {
            return { ok: false, error: 'displayMode must be "aggregated" or "native"' };
          }
          this.registry.setDisplayMode(mode);
          return { ok: true, value: { snapshot: this.registry.snapshot() } };
        }
        case "upsertDevice": {
          const input = payload;
          const res = await this.registry.upsertDevice(input);
          if (!res.ok) return res;
          return { ok: true, value: { device: res.device, snapshot: this.registry.snapshot() } };
        }
        case "removeDevice": {
          const deviceId = String(payload.deviceId ?? "");
          if (deviceId === "") return { ok: false, error: "Device id is required" };
          const removed = this.registry.removeDevice(deviceId);
          if (!removed) return { ok: false, error: "Device is not configured" };
          return { ok: true, value: { removed, snapshot: this.registry.snapshot() } };
        }
        case "reconnectDevice": {
          const deviceId = String(payload.deviceId ?? "");
          if (deviceId === "") return { ok: false, error: "Device id is required" };
          const triggered = this.registry.reconnectDevice(deviceId);
          if (!triggered) return { ok: false, error: "Device is not configured" };
          return { ok: true, value: { triggered, snapshot: this.registry.snapshot() } };
        }
        case "authenticateDevice": {
          const deviceId = String(payload.deviceId ?? "");
          if (deviceId === "") return { ok: false, error: "Device id is required" };
          const credential = typeof payload.credential === "string" ? payload.credential : void 0;
          const res = await this.registry.authenticateDevice(deviceId, credential);
          if (!res.ok) return res;
          return { ok: true, value: { ...res, snapshot: this.registry.snapshot() } };
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
          try {
            this.registry.updateAggregationConfig(patch);
          } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) };
          }
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
          if (memberKey === "") return { ok: false, error: "Member key is required" };
          const excluded = Boolean(payload.excluded);
          try {
            this.registry.aggregator.setMemberExcluded(memberKey, excluded);
            this.registry.saveToDisk();
          } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) };
          }
          return { ok: true, value: this.registry.snapshot() };
        }
        case "setUiPreferences": {
          this.registry.updateUiPreferences({
            ...typeof payload.sessionRowDeviceDot === "boolean" ? { sessionRowDeviceDot: payload.sessionRowDeviceDot } : {},
            ...typeof payload.nativePane === "boolean" ? { nativePane: payload.nativePane } : {},
            ...typeof payload.crossHostReadState === "boolean" ? { crossHostReadState: payload.crossHostReadState } : {}
          });
          return { ok: true, value: this.registry.snapshot() };
        }
        case "setPreferredDevice": {
          const logicalWorkspaceId = String(payload.logicalWorkspaceId ?? "");
          const deviceId = String(payload.deviceId ?? "");
          this.registry.aggregator.setPreferredDevice(logicalWorkspaceId, deviceId);
          this.registry.saveToDisk();
          return { ok: true, value: this.registry.snapshot() };
        }
        case "startGitMatch": {
          const res = this.registry.startGitMatch();
          if (!res.ok) return res;
          return { ok: true, value: { gitMatch: this.registry.gitMatch(), snapshot: this.registry.snapshot() } };
        }
        case "cancelGitMatch": {
          const cancelled = this.registry.cancelGitMatch();
          return { ok: true, value: { cancelled, gitMatch: this.registry.gitMatch() } };
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
    return isLoopbackHostHeader(req.headers.host);
  }
};
function readBody(req) {
  return new Promise((resolve4) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        resolve4(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve4(Buffer.concat(chunks)));
    req.on("error", () => resolve4(null));
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
  const dshHome = process.env.DSH_HOME ?? join5(homedir4(), ".dsh");
  const dataFile = resolved.dataFile ?? join5(dshHome, "plugins", "dsh-multi-device.json");
  const secretsFile = resolved.secretsFile ?? join5(dshHome, "plugins", "dsh-multi-device-secrets.json");
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
  const getClientReleaseVersion = () => {
    try {
      const service = ctx.get?.("clientModules");
      return typeof service?.release?.version === "string" ? service.release.version : void 0;
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
  try {
    for (const agent of getLocalAgents()?.list?.() ?? []) {
      if (agent.status === "running") registry.observeLocalSessionStatus(String(agent.id), true);
    }
  } catch {
  }
  ctx.effect(() => {
    const on = ctx.on;
    if (typeof on !== "function") return () => {
    };
    const dispose = on.call(ctx, "api-session/status", (sessionId, running) => {
      if (typeof sessionId === "string" && typeof running === "boolean") {
        registry.observeLocalSessionStatus(sessionId, running);
      }
    });
    return typeof dispose === "function" ? dispose : () => {
    };
  }, "dsh-multi-device: local session status");
  if (features.autoGitAggregate === false) {
    registry.aggregator.setConfig({ autoGitAggregate: false });
  }
  registry.onModelCatalogChanged(() => {
    try {
      const emit = ctx.emit;
      emit?.call(ctx, "llm/adapters-updated");
    } catch {
    }
  });
  const admitRequest = (req) => admitMultiDeviceRequest(ctx, req);
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
            registry.setLocalWorkspaceCreator(async (path) => {
              await workspaceController.create({ path });
            });
            const disposeGateway = installAggregatedGateway02(
              registry,
              sessionController,
              workspaceController,
              typertGateway,
              getWorkspaceRegistry(),
              {
                workspaceReplaceFrames: () => supportsWorkspaceReplaceFrames(getClientReleaseVersion())
              }
            );
            registry.setGatewayStatus(true);
            return () => {
              disposeGateway();
              registry.setLocalWorkspaceCreator(async () => {
                throw new Error("Local workspace creation is unavailable");
              });
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

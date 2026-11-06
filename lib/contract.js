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
function isNamespacedSessionId(sessionId) {
  return sessionId.startsWith(REMOTE_SESSION_PREFIX);
}
function isNamespacedWorkspaceId(workspaceId) {
  return workspaceId.startsWith(REMOTE_WORKSPACE_PREFIX) || workspaceId.startsWith(LOGICAL_WORKSPACE_PREFIX);
}
function isNamespacedEventId(eventId) {
  return eventId.startsWith(REMOTE_EVENT_PREFIX);
}
function encodeRemoteSessionId(deviceId, remoteSessionId) {
  if (deviceId === LOCAL_DEVICE_ID) return remoteSessionId;
  if (remoteSessionId.startsWith(REMOTE_SESSION_PREFIX)) return remoteSessionId;
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
  const rawSessionId = rest.slice(sepIndex + 1);
  if (rawSessionId.startsWith(REMOTE_SESSION_PREFIX)) {
    return { deviceId: LOCAL_DEVICE_ID, rawSessionId: sessionId, isRemote: false };
  }
  const deviceId = unescapeSegment(rest.slice(0, sepIndex));
  return { deviceId, rawSessionId, isRemote: true };
}
function encodeRemoteWorkspaceId(deviceId, remoteWorkspaceId) {
  if (deviceId === LOCAL_DEVICE_ID) return remoteWorkspaceId;
  if (isNamespacedWorkspaceId(remoteWorkspaceId)) return remoteWorkspaceId;
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
  const rawWorkspaceId = rest.slice(sepIndex + 1);
  if (isNamespacedWorkspaceId(rawWorkspaceId)) {
    return { deviceId: LOCAL_DEVICE_ID, rawWorkspaceId: workspaceId, isRemote: false };
  }
  return {
    deviceId: unescapeSegment(rest.slice(0, sepIndex)),
    rawWorkspaceId,
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
export {
  DeviceId,
  LOCAL_DEVICE_ID,
  decodeLogicalWorkspaceId,
  decodeRemoteEventId,
  decodeRemoteWorkspaceId,
  decodeSessionId,
  encodeLogicalWorkspaceId,
  encodeRemoteEventId,
  encodeRemoteSessionId,
  encodeRemoteWorkspaceId,
  isNamespacedEventId,
  isNamespacedSessionId,
  isNamespacedWorkspaceId,
  normalizeGitRemote,
  normalizeWorkspacePath,
  workspaceMemberKey
};
//# sourceMappingURL=contract.js.map

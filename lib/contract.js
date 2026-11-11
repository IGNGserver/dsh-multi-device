// src/contract.ts
function DeviceId(id) {
  return id;
}
var LOCAL_DEVICE_ID = "local";
function sanitizeWorkspaceViewState(value) {
  const groups = {};
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const raw = value;
    const split = raw.groups;
    if (typeof split === "object" && split !== null && !Array.isArray(split)) {
      let count = 0;
      for (const [key, expanded] of Object.entries(split)) {
        if (count >= 1e3) break;
        if (typeof key !== "string" || key === "" || key.length > 256) continue;
        if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
        if (typeof expanded !== "boolean") continue;
        groups[key] = expanded;
        count += 1;
      }
    }
    const groupBy = raw.groupBy;
    const orderBy = raw.orderBy;
    const archivedFilter = raw.archivedFilter;
    return {
      groups,
      ...groupBy === "workspace" || groupBy === "flat" || groupBy === "workspace-tree" ? { groupBy } : {},
      ...orderBy === "updated" || orderBy === "manual" ? { orderBy } : {},
      ...archivedFilter === "default" || archivedFilter === "show" || archivedFilter === "only" ? { archivedFilter } : {}
    };
  }
  return { groups };
}
function sameWorkspaceViewState(left, right) {
  if (left === right) return true;
  if (left === void 0 || right === void 0) return false;
  if (left.groupBy !== right.groupBy || left.orderBy !== right.orderBy || left.archivedFilter !== right.archivedFilter) return false;
  const leftKeys = Object.keys(left.groups);
  if (leftKeys.length !== Object.keys(right.groups).length) return false;
  return leftKeys.every((key) => left.groups[key] === right.groups[key]);
}
var REMOTE_SESSION_PREFIX = "md~";
var REMOTE_EVENT_PREFIX = "md-ev~";
var SEPARATOR = "~";
function isNamespacedSessionId(sessionId) {
  return sessionId.startsWith(REMOTE_SESSION_PREFIX);
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
function encodeRemoteEventId(deviceId, remoteEventId) {
  return `${REMOTE_EVENT_PREFIX}${escapeSegment(deviceId)}${SEPARATOR}${remoteEventId}`;
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
  decodeSessionId,
  encodeRemoteEventId,
  encodeRemoteSessionId,
  isNamespacedEventId,
  isNamespacedSessionId,
  sameWorkspaceViewState,
  sanitizeWorkspaceViewState
};
//# sourceMappingURL=contract.js.map

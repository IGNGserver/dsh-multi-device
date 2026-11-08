// src/contract.ts
function DeviceId(id) {
  return id;
}
var LOCAL_DEVICE_ID = "local";
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
  isNamespacedSessionId
};
//# sourceMappingURL=contract.js.map

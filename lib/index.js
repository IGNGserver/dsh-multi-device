// src/index.ts
import z from "@deepseek-ai/schemastery";
import { appendFileSync } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join5 } from "node:path";

// src/host/local-attention.ts
var originalService = Symbol.for("cordis.original");
function identity(value) {
  if (value === null || typeof value !== "object" && typeof value !== "function") return value;
  const original = value[originalService];
  return original !== null && (typeof original === "object" || typeof original === "function") ? original : value;
}
function persistenceBinding(query) {
  return query._corpus === void 0 ? query._persistence : query._corpus?._persistence;
}
async function readLocalAttentionCatalog(resolve2, signal) {
  signal?.throwIfAborted();
  const query = resolve2("sessionQuery");
  const persistence = resolve2("sessionPersistence");
  const sessions = resolve2("sessions");
  const agents = resolve2("agents");
  if (typeof query?.listSessions !== "function" || persistence == null || identity(persistenceBinding(query)) !== identity(persistence) || typeof sessions?.list !== "function" || typeof agents?.list !== "function") return void 0;
  const listSessions = query.listSessions;
  const listLive = sessions.list;
  const listAgents = agents.list;
  const queryIdentity = identity(query);
  const persistenceIdentity = identity(persistence);
  const sessionsIdentity = identity(sessions);
  const agentsIdentity = identity(agents);
  const corpusIdentity = identity(query._corpus);
  const sameServices = () => identity(resolve2("sessionQuery")) === queryIdentity && identity(resolve2("sessionPersistence")) === persistenceIdentity && identity(resolve2("sessions")) === sessionsIdentity && identity(resolve2("agents")) === agentsIdentity && identity(query._corpus) === corpusIdentity && identity(persistenceBinding(query)) === persistenceIdentity;
  if (!sameServices()) return void 0;
  const records = await listSessions.call(query, signal);
  signal?.throwIfAborted();
  if (!sameServices()) return void 0;
  const live = new Map(listLive.call(sessions).map((session) => [String(session.id), session]));
  const running = new Set(listAgents.call(agents).filter((agent) => agent.status === "running").map((agent) => String(agent.id)));
  const projection = resolve2("sessionProjections");
  const factFor = (id, origin) => {
    const session = live.get(id);
    const values = session === void 0 ? void 0 : projection?.snapshot?.(
      session,
      ["sessionListMetadata", "subagentCatalog"]
    ).values;
    const metadata2 = values?.sessionListMetadata;
    const children = values?.subagentCatalog;
    const runningSubagentCount = Array.isArray(children) ? children.filter((child) => typeof child?.id === "string" && running.has(child.id)).length : 0;
    return {
      sessionId: id,
      deviceId: "local",
      running: running.has(id),
      origin,
      blank: session === void 0 ? false : metadata2?.blank ?? session.seq === 0,
      runningSubagentCount
    };
  };
  const facts = /* @__PURE__ */ new Map();
  for (const record of records) {
    const id = String(record.header.id);
    facts.set(id, factFor(id, record.header.origin));
  }
  for (const [id, session] of live) {
    if (!facts.has(id)) facts.set(id, factFor(id, session.header?.origin));
  }
  signal?.throwIfAborted();
  return sameServices() ? [...facts.values()] : void 0;
}

// src/host/registry.ts
import { randomUUID as randomUUID7 } from "node:crypto";
import { dirname as dirname3, join as join4 } from "node:path";

// src/contract.ts
function DeviceId(id) {
  return id;
}
var LOCAL_DEVICE_ID = "local";
var REMOTE_SESSION_PREFIX = "md~";
var REMOTE_EVENT_PREFIX = "md-ev~";
var SEPARATOR = "~";
function isNamespacedSessionId(sessionId2) {
  return sessionId2.startsWith(REMOTE_SESSION_PREFIX);
}
function isNamespacedEventId(eventId) {
  return eventId.startsWith(REMOTE_EVENT_PREFIX);
}
function encodeRemoteSessionId(deviceId, remoteSessionId) {
  if (deviceId === LOCAL_DEVICE_ID) return remoteSessionId;
  if (remoteSessionId.startsWith(REMOTE_SESSION_PREFIX)) return remoteSessionId;
  return `${REMOTE_SESSION_PREFIX}${escapeSegment(deviceId)}${SEPARATOR}${remoteSessionId}`;
}
function decodeSessionId(sessionId2) {
  if (!sessionId2.startsWith(REMOTE_SESSION_PREFIX)) {
    return { deviceId: LOCAL_DEVICE_ID, rawSessionId: sessionId2, isRemote: false };
  }
  const rest = sessionId2.slice(REMOTE_SESSION_PREFIX.length);
  const sepIndex = rest.indexOf(SEPARATOR);
  if (sepIndex <= 0 || sepIndex === rest.length - 1) {
    return { deviceId: LOCAL_DEVICE_ID, rawSessionId: sessionId2, isRemote: false };
  }
  const rawSessionId = rest.slice(sepIndex + 1);
  if (rawSessionId.startsWith(REMOTE_SESSION_PREFIX)) {
    return { deviceId: LOCAL_DEVICE_ID, rawSessionId: sessionId2, isRemote: false };
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

// src/attention.ts
function emptyDeviceAttention(fresh = true) {
  return {
    eligibleSessionIds: [],
    runningSessionIds: [],
    pendingSessionIds: [],
    unreadSessionIds: [],
    pendingRequestCount: 0,
    fresh
  };
}
function count(value) {
  return value !== void 0 && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
function selectDeviceAttention(facts, unread, policy = {}) {
  const devices = /* @__PURE__ */ new Map();
  for (const fact of facts) {
    let sessions = devices.get(fact.deviceId);
    if (sessions === void 0) devices.set(fact.deviceId, sessions = /* @__PURE__ */ new Map());
    const previous = sessions.get(fact.sessionId);
    const pending = Math.max(count(fact.pendingRequestCount), fact.pendingInteractionKind ? 1 : 0);
    sessions.set(fact.sessionId, {
      hidden: previous?.hidden === true || fact.archived === true || fact.origin === "subagent",
      blank: (previous?.blank ?? true) && fact.blank === true,
      running: previous?.running === true || fact.running || count(fact.runningSubagentCount) > 0,
      pending: Math.max(previous?.pending ?? 0, pending)
    });
  }
  return Object.fromEntries([...devices.keys()].sort().map((deviceId) => {
    const eligibleSessionIds = [];
    const runningSessionIds = [];
    const pendingSessionIds = [];
    const unreadSessionIds = [];
    let pendingRequestCount = 0;
    for (const [sessionId2, fact] of [...devices.get(deviceId)].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      if (fact.hidden || fact.blank && sessionId2 !== policy.currentSessionId) continue;
      eligibleSessionIds.push(sessionId2);
      if (fact.pending > 0) {
        pendingSessionIds.push(sessionId2);
        pendingRequestCount += fact.pending;
      } else if (fact.running) runningSessionIds.push(sessionId2);
      else if (unread.has(sessionId2)) unreadSessionIds.push(sessionId2);
    }
    return [deviceId, {
      eligibleSessionIds,
      runningSessionIds,
      pendingSessionIds,
      unreadSessionIds,
      pendingRequestCount,
      fresh: policy.fresh !== false
    }];
  }));
}

// src/host/completion-identity.ts
var MAX_BACKWARD_PAGES = 4;
var READ_TIMEOUT_MS = 5e3;
var MAX_PAGE_RECORDS = 1e4;
function isRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function isIndex(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}
function parsePage(value) {
  if (!isRecord(value) || !Array.isArray(value.records) || typeof value.hasMore !== "boolean" || value.records.length > MAX_PAGE_RECORDS) return void 0;
  const records = [];
  let previous;
  for (const entry of value.records) {
    if (!isRecord(entry) || entry.type !== "event" || !isRecord(entry.event)) return void 0;
    const event = entry.event;
    if (typeof event.type !== "string" || event.type.length === 0 || !isIndex(event.seq) || !isIndex(event.time) || !Object.hasOwn(event, "data") || previous !== void 0 && event.seq !== previous + 1) return void 0;
    records.push({ type: event.type, seq: event.seq, data: event.data });
    previous = event.seq;
  }
  if (records.length === 0) return value.hasMore ? void 0 : { records, hasMore: false };
  if (value.hasMore !== records[0].seq > 0) return void 0;
  return { records, hasMore: value.hasMore };
}
function scanPage(page) {
  let laterTurnActivity = false;
  for (let index = page.records.length - 1; index >= 0; index--) {
    const event = page.records[index];
    if (event.type === "turn/start") return { kind: "open" };
    if (event.type !== "turn/end") {
      if (isRecord(event.data) && Object.hasOwn(event.data, "turn")) laterTurnActivity = true;
      continue;
    }
    if (laterTurnActivity || !isRecord(event.data) || !isIndex(event.data.turn) || !isRecord(event.data.reason)) return { kind: "invalid" };
    const reason = event.data.reason;
    switch (reason.kind) {
      case "aborted": {
        if (!isRecord(reason.reason)) return { kind: "invalid" };
        const cause = reason.reason;
        if (typeof cause.kind !== "string" || !["user", "parent", "hook", "disposed", "legacy"].includes(cause.kind) || cause.kind === "hook" && typeof cause.reason !== "string") return { kind: "invalid" };
        break;
      }
      case "error":
        if (!isRecord(reason.error) || typeof reason.error.message !== "string" || typeof reason.error.code !== "string") return { kind: "invalid" };
        break;
      case "completed":
      case "blocked":
      case "max-tokens":
        break;
      default:
        return { kind: "invalid" };
    }
    return { kind: "found", token: `turn:${event.seq}:${event.data.turn}` };
  }
  return { kind: laterTurnActivity ? "open" : "none" };
}
function projectionCut(value) {
  return isRecord(value) && value.kind === "sequenced" && isIndex(value.asOfSeq) && isRecord(value.values) ? value.asOfSeq : void 0;
}
async function readRemoteCompletionIdentity(client, rawSessionId, signal) {
  if (typeof rawSessionId !== "string" || rawSessionId.length === 0 || rawSessionId.length > 512 || signal?.aborted) return void 0;
  const deadline = AbortSignal.timeout(READ_TIMEOUT_MS);
  const lifetime = signal === void 0 ? deadline : AbortSignal.any([signal, deadline]);
  let onAbort;
  const cancelled = new Promise((resolve2) => {
    onAbort = () => resolve2(void 0);
    lifetime.addEventListener("abort", onAbort, { once: true });
  });
  const invoke = (method, request) => Promise.race([client.invokeUnary("session", method, { request }, lifetime), cancelled]);
  try {
    const throughSeq = projectionCut(await invoke("projections", { sessionId: rawSessionId }));
    if (lifetime.aborted || throughSeq === void 0) return void 0;
    const address = { kind: "session", sessionId: rawSessionId };
    let beforeSeq;
    for (let pageIndex = 0; pageIndex <= MAX_BACKWARD_PAGES; pageIndex++) {
      if (lifetime.aborted) return void 0;
      const value = await invoke("page", {
        address,
        throughSeq,
        maxMessages: 1,
        ...beforeSeq === void 0 ? {} : { beforeSeq }
      });
      if (lifetime.aborted) return void 0;
      const page = parsePage(value);
      if (page === void 0 || page.records.length === 0) return void 0;
      const expectedLast = beforeSeq === void 0 ? throughSeq : beforeSeq - 1;
      if (page.records.at(-1).seq !== expectedLast) return void 0;
      const result = scanPage(page);
      if (result.kind === "found") {
        const confirmed = projectionCut(await invoke("projections", { sessionId: rawSessionId }));
        return !lifetime.aborted && confirmed === throughSeq ? result.token : void 0;
      }
      if (result.kind !== "none" || !page.hasMore) return void 0;
      beforeSeq = page.records[0].seq;
    }
    return void 0;
  } catch {
    return void 0;
  } finally {
    if (onAbort !== void 0) lifetime.removeEventListener("abort", onAbort);
  }
}

// src/host/auth.ts
import { createHash as createHash2, createHmac } from "node:crypto";

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
  return new Promise((resolve2, reject) => {
    let settled = false;
    let timer;
    const finish = (error, response) => {
      if (settled) return;
      settled = true;
      if (timer !== void 0) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error !== void 0) reject(error);
      else if (response !== void 0) resolve2(response);
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
  const nullBody = response.status === 204 || response.status === 205 || response.status === 304;
  return new Response(nullBody ? null : new Uint8Array(response.body), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
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

// src/host/storage.ts
import { createHash, randomUUID as randomUUID2, webcrypto } from "node:crypto";
import { closeSync as closeSync2, existsSync as existsSync2, fsyncSync as fsyncSync2, mkdirSync, openSync as openSync2, readFileSync as readFileSync2, renameSync as renameSync2, unlinkSync as unlinkSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { mkdir, open as open2, readFile as readFile2, rename as rename2, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

// src/host/storage-lock.ts
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { open, readFile, rename, unlink } from "node:fs/promises";
import { hostname } from "node:os";
function metadata(owner = randomUUID()) {
  return { version: 1, pid: process.pid, hostname: hostname(), owner, createdAt: Date.now() };
}
function serialize(value) {
  return JSON.stringify(value);
}
function parse(text) {
  try {
    const value = JSON.parse(text);
    if (value.version !== 1 || !Number.isSafeInteger(value.pid) || value.pid <= 0 || typeof value.hostname !== "string" || typeof value.owner !== "string" || value.owner.length < 8 || !Number.isFinite(value.createdAt)) return void 0;
    return value;
  } catch {
    return void 0;
  }
}
function deadLocalOwner(value) {
  if (value === void 0 || value.hostname !== hostname()) return false;
  try {
    process.kill(value.pid, 0);
    return false;
  } catch (error) {
    return error.code === "ESRCH";
  }
}
function readSync(path) {
  try {
    return parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    return void 0;
  }
}
async function readAsync(path) {
  try {
    return parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    return void 0;
  }
}
function removeIfOwnerSync(path, owner) {
  if (readSync(path)?.owner !== owner) return;
  try {
    unlinkSync(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
async function removeIfOwnerAsync(path, owner) {
  if ((await readAsync(path))?.owner !== owner) return;
  try {
    await unlink(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
function openSyncLease(path) {
  const owner = randomUUID();
  const fd = openSync(path, "wx", 384);
  try {
    writeFileSync(fd, serialize(metadata(owner)));
    fsyncSync(fd);
  } catch (error) {
    try {
      closeSync(fd);
    } finally {
      removeIfOwnerSync(path, owner);
    }
    throw error;
  }
  return { owner, release: () => {
    try {
      closeSync(fd);
    } finally {
      removeIfOwnerSync(path, owner);
    }
  } };
}
async function openAsyncLease(path) {
  const owner = randomUUID();
  const handle = await open(path, "wx", 384);
  try {
    await handle.writeFile(serialize(metadata(owner)));
    await handle.sync();
  } catch (error) {
    try {
      await handle.close();
    } finally {
      await removeIfOwnerAsync(path, owner);
    }
    throw error;
  }
  return { owner, release: async () => {
    try {
      await handle.close();
    } finally {
      await removeIfOwnerAsync(path, owner);
    }
  } };
}
function recoverDeadLocalSync(path) {
  const current = readSync(path);
  if (current === null) return true;
  if (!deadLocalOwner(current)) return false;
  const quarantine = `${path}.stale-${randomUUID()}`;
  try {
    renameSync(path, quarantine);
  } catch (error) {
    return error.code === "ENOENT";
  }
  try {
    unlinkSync(quarantine);
  } catch {
  }
  return true;
}
async function recoverDeadLocalAsync(path) {
  const current = await readAsync(path);
  if (current === null) return true;
  if (!deadLocalOwner(current)) return false;
  const quarantine = `${path}.stale-${randomUUID()}`;
  try {
    await rename(path, quarantine);
  } catch (error) {
    return error.code === "ENOENT";
  }
  try {
    await unlink(quarantine);
  } catch {
  }
  return true;
}
function recoveryGuardSync(lock) {
  const path = `${lock}.recovery`;
  try {
    return openSyncLease(path);
  } catch {
  }
  if (!recoverDeadLocalSync(path)) return void 0;
  try {
    return openSyncLease(path);
  } catch {
    return void 0;
  }
}
async function recoveryGuardAsync(lock) {
  const path = `${lock}.recovery`;
  try {
    return await openAsyncLease(path);
  } catch {
  }
  if (!await recoverDeadLocalAsync(path)) return void 0;
  try {
    return await openAsyncLease(path);
  } catch {
    return void 0;
  }
}
function recoverWithGuardSync(lock) {
  const guard = recoveryGuardSync(lock);
  if (guard === void 0) return false;
  try {
    return recoverDeadLocalSync(lock);
  } finally {
    guard.release();
  }
}
async function recoverWithGuardAsync(lock) {
  const guard = await recoveryGuardAsync(lock);
  if (guard === void 0) return false;
  try {
    return await recoverDeadLocalAsync(lock);
  } finally {
    await guard.release();
  }
}
function busy(path) {
  return new Error(`Storage is busy at ${path}; retry after the other writer finishes`);
}
function acquireStorageLock(path) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return openSyncLease(path);
    } catch {
    }
    if (!recoverWithGuardSync(path)) throw busy(path);
  }
  throw busy(path);
}
async function acquireStorageLockAsync(path) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await openAsyncLease(path);
    } catch {
    }
    if (!await recoverWithGuardAsync(path)) throw busy(path);
  }
  throw busy(path);
}
function assertStorageLockAvailable(path) {
  if (!existsSync(path)) return;
  if (!recoverWithGuardSync(path)) throw busy(path);
}
async function assertStorageLockAvailableAsync(path) {
  if (!existsSync(path)) return;
  if (!await recoverWithGuardAsync(path)) throw busy(path);
}

// src/host/storage.ts
function bytes(path) {
  try {
    return readFileSync2(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
}
function digest(text) {
  return text === void 0 ? "missing" : createHash("sha256").update(text).digest("hex");
}
async function bytesAsync(path) {
  try {
    return await readFile2(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
}
async function digestAsync(text) {
  if (text === void 0) return "missing";
  const hash = await webcrypto.subtle.digest("SHA-256", Buffer.from(text, "utf8"));
  return Buffer.from(hash).toString("hex");
}
function parseDocument(text) {
  const value = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new SyntaxError("Expected a JSON object document");
  return value;
}
function atomicWrite(path, text) {
  mkdirSync(dirname(path), { recursive: true, mode: 448 });
  const temp = `${path}.${randomUUID2()}.tmp`;
  let fd;
  try {
    fd = openSync2(temp, "wx", 384);
    writeFileSync2(fd, text);
    fsyncSync2(fd);
    closeSync2(fd);
    fd = void 0;
    renameSync2(temp, path);
    try {
      const dir = openSync2(dirname(path), "r");
      try {
        fsyncSync2(dir);
      } finally {
        closeSync2(dir);
      }
    } catch {
    }
  } finally {
    if (fd !== void 0) closeSync2(fd);
    if (existsSync2(temp)) unlinkSync2(temp);
  }
}
async function atomicWriteAsync(path, text) {
  await mkdir(dirname(path), { recursive: true, mode: 448 });
  const temp = `${path}.${randomUUID2()}.tmp`;
  let handle;
  try {
    handle = await open2(temp, "wx", 384);
    await handle.writeFile(text);
    await handle.sync();
    await handle.close();
    handle = void 0;
    await rename2(temp, path);
    try {
      const directory = await open2(dirname(path), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch {
    }
  } finally {
    if (handle !== void 0) await handle.close().catch(() => {
    });
    await rm(temp, { force: true }).catch(() => {
    });
  }
}
var JsonSnapshotFile = class {
  constructor(path, validate) {
    this.path = path;
    this.validate = validate;
  }
  expected;
  unreadable = false;
  pendingWrites = Promise.resolve();
  parse(text) {
    const value = parseDocument(text);
    if (this.validate !== void 0 && !this.validate(value)) throw new SyntaxError("Unsupported JSON document schema");
    return value;
  }
  read() {
    this.unreadable = true;
    const text = bytes(this.path);
    this.expected = digest(text);
    this.unreadable = false;
    if (text === void 0) return void 0;
    try {
      return this.parse(text);
    } catch {
      this.unreadable = true;
      const backup = bytes(`${this.path}.bak`);
      if (backup === void 0) throw new Error(`Invalid JSON at ${this.path}; preserve the file and restore a valid backup`);
      let recovered;
      try {
        recovered = this.parse(backup);
      } catch {
        throw new Error(`Invalid JSON and backup at ${this.path}; refusing to overwrite either`);
      }
      atomicWrite(`${this.path}.corrupt-${randomUUID2()}`, text);
      try {
        this.unreadable = false;
        this.write(recovered);
        return recovered;
      } catch (error) {
        this.unreadable = true;
        throw error;
      }
    }
  }
  /** Reject predictable stale/busy writes before callers mutate live services. */
  assertWritable() {
    if (this.expected === void 0) this.read();
    if (this.unreadable) throw new Error(`Cannot overwrite unreadable state at ${this.path}`);
    assertStorageLockAvailable(`${this.path}.lock`);
    if (digest(bytes(this.path)) !== this.expected) {
      throw new Error(`Storage changed outside this Host: ${this.path}; reload before saving to avoid losing another writer's changes`);
    }
  }
  write(value) {
    if (this.expected === void 0) this.read();
    if (this.unreadable) throw new Error(`Cannot overwrite unreadable state at ${this.path}`);
    mkdirSync(dirname(this.path), { recursive: true, mode: 448 });
    const lease = acquireStorageLock(`${this.path}.lock`);
    try {
      const current = bytes(this.path);
      const actual = digest(current);
      if (this.expected !== void 0 && actual !== this.expected) {
        throw new Error(`Storage changed outside this Host: ${this.path}; reload before saving to avoid losing another writer's changes`);
      }
      const text = JSON.stringify(value, null, 2) + "\n";
      this.parse(text);
      if (current !== void 0) {
        try {
          this.parse(current);
          atomicWrite(`${this.path}.bak`, current);
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
      }
      atomicWrite(this.path, text);
      this.expected = digest(text);
    } finally {
      lease.release();
    }
  }
  /** Async reads wait for earlier writes on this instance before refreshing CAS state. */
  async readAsync() {
    await this.pendingWrites;
    return await this.readAsyncNow();
  }
  async readAsyncNow() {
    this.unreadable = true;
    const text = await bytesAsync(this.path);
    this.expected = await digestAsync(text);
    this.unreadable = false;
    if (text === void 0) return void 0;
    try {
      return this.parse(text);
    } catch {
      this.unreadable = true;
      const backup = await bytesAsync(`${this.path}.bak`);
      if (backup === void 0) throw new Error(`Invalid JSON at ${this.path}; preserve the file and restore a valid backup`);
      let recovered;
      try {
        recovered = this.parse(backup);
      } catch {
        throw new Error(`Invalid JSON and backup at ${this.path}; refusing to overwrite either`);
      }
      await atomicWriteAsync(`${this.path}.corrupt-${randomUUID2()}`, text);
      try {
        this.unreadable = false;
        await this.writeAsyncNow(recovered);
        return recovered;
      } catch (error) {
        this.unreadable = true;
        throw error;
      }
    }
  }
  async assertWritableAsync() {
    await this.pendingWrites;
    if (this.expected === void 0) await this.readAsyncNow();
    if (this.unreadable) throw new Error(`Cannot overwrite unreadable state at ${this.path}`);
    await assertStorageLockAvailableAsync(`${this.path}.lock`);
    if (await digestAsync(await bytesAsync(this.path)) !== this.expected) {
      throw new Error(`Storage changed outside this Host: ${this.path}; reload before saving to avoid losing another writer's changes`);
    }
  }
  /** Serialize asynchronous writes per file; the CAS comparison remains inside the lease. */
  writeAsync(value) {
    const operation = this.pendingWrites.then(async () => await this.writeAsyncNow(value));
    this.pendingWrites = operation.catch(() => {
    });
    return operation;
  }
  async writeAsyncNow(value) {
    if (this.expected === void 0) await this.readAsyncNow();
    if (this.unreadable) throw new Error(`Cannot overwrite unreadable state at ${this.path}`);
    await mkdir(dirname(this.path), { recursive: true, mode: 448 });
    const lease = await acquireStorageLockAsync(`${this.path}.lock`);
    try {
      const current = await bytesAsync(this.path);
      const actual = await digestAsync(current);
      if (this.expected !== void 0 && actual !== this.expected) {
        throw new Error(`Storage changed outside this Host: ${this.path}; reload before saving to avoid losing another writer's changes`);
      }
      const text = JSON.stringify(value, null, 2) + "\n";
      this.parse(text);
      if (current !== void 0) {
        try {
          this.parse(current);
          await atomicWriteAsync(`${this.path}.bak`, current);
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
      }
      await atomicWriteAsync(this.path, text);
      this.expected = await digestAsync(text);
    } finally {
      await lease.release();
    }
  }
};
function resolvePluginStorage(home, profileDir, profile = "standalone") {
  const dir = join(profileDir || join(home, "profiles", profile), "plugins", "dsh-multi-device");
  const targets = { dataFile: join(dir, "devices.json"), secretsFile: join(dir, "secrets.json") };
  const legacy = [
    [targets.dataFile, join(home, "plugins", "dsh-multi-device.json")],
    [targets.secretsFile, join(home, "plugins", "dsh-multi-device-secrets.json")]
  ];
  for (const [target, source] of legacy) {
    if (existsSync2(target) || !existsSync2(source)) continue;
    const sourceFile = new JsonSnapshotFile(source, (value) => value.version === 1 && (target === targets.dataFile ? Array.isArray(value.devices) : typeof value.secrets === "object" && value.secrets !== null && !Array.isArray(value.secrets)));
    const document = sourceFile.read();
    if (document === void 0 || document.version !== 1) throw new Error(`Unsupported legacy plugin state: ${source}`);
    if (target === targets.dataFile) document.hostId = randomUUID2();
    const destination = new JsonSnapshotFile(target);
    if (destination.read() === void 0) destination.write(document);
  }
  return targets;
}

// src/host/tunnel.ts
import { execFileSync, spawn as nodeSpawn } from "node:child_process";
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "node:fs";
import { createConnection, createServer } from "node:net";
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";

// src/host/ssh-config.ts
import { existsSync as existsSync3, readdirSync, readFileSync as readFileSync3, statSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname as dirname2, isAbsolute, join as join2, resolve } from "node:path";
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
  const sshDir = join2(home, ".ssh");
  const found = [];
  for (const name2 of DEFAULT_KEY_NAMES) {
    const candidate = join2(sshDir, name2);
    try {
      if (existsSync3(candidate) && statSync(candidate).isFile()) {
        found.push(candidate);
      }
    } catch {
    }
  }
  return found;
}
function listLocalSshKeys(home = homedir()) {
  const sshDir = join2(home, ".ssh");
  if (!existsSync3(sshDir)) return [];
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
    const path = join2(sshDir, name2);
    let mode;
    let text;
    try {
      const stat = statSync(path);
      if (!stat.isFile()) continue;
      mode = stat.mode;
      text = readFileSync3(path, "utf8").slice(0, 4096);
    } catch {
      continue;
    }
    if (!/-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(text)) continue;
    const publicKeyPath = existsSync3(`${path}.pub`) ? `${path}.pub` : void 0;
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
function loadSystemSshConfigBlocks(configFile = join2(homedir(), ".ssh", "config")) {
  const expanded = expandHomePath(configFile);
  if (!existsSync3(expanded)) return [];
  let content;
  try {
    content = readFileSync3(expanded, "utf8");
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
var cachedDefaultHosts;
var SSH_CONFIG_CACHE_TTL_MS = 3e3;
function listSshConfigHosts(configFile = join2(homedir(), ".ssh", "config"), home = homedir()) {
  const now = Date.now();
  if (cachedDefaultHosts !== void 0 && cachedDefaultHosts.configFile === configFile && cachedDefaultHosts.home === home && now - cachedDefaultHosts.at < SSH_CONFIG_CACHE_TTL_MS) {
    return cachedDefaultHosts.hosts;
  }
  const blocks = loadSystemSshConfigBlocks(configFile);
  const hosts = extractConcreteHostsFromBlocks(blocks, home);
  cachedDefaultHosts = { at: now, configFile, home, hosts };
  return hosts;
}
function extractConcreteHostsFromBlocks(blocks, home = homedir()) {
  const seenAliases = /* @__PURE__ */ new Set();
  const entries = [];
  for (const block of blocks) {
    for (const pattern of block.patterns) {
      if (pattern.startsWith("!") || pattern.includes("*") || pattern.includes("?")) continue;
      if (seenAliases.has(pattern)) continue;
      seenAliases.add(pattern);
      let hasExplicitUser = false;
      let hasExplicitPort = false;
      for (const candidate of blocks) {
        if (!matchesHostPatterns(pattern, candidate.patterns)) continue;
        if (candidate.options["user"]?.[0] !== void 0) hasExplicitUser = true;
        if (candidate.options["port"]?.[0] !== void 0) hasExplicitPort = true;
      }
      const resolved = resolveSshParametersFromBlocks(pattern, blocks, home);
      entries.push({
        alias: pattern,
        hostName: resolved.hostName,
        ...hasExplicitUser && resolved.user !== "" ? { user: resolved.user } : {},
        ...hasExplicitPort ? { port: resolved.port } : { port: 22 },
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
        if (!identityFiles.includes(rawKey)) identityFiles.push(rawKey);
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
  const tokenMap = {
    h: finalHostName,
    u: localUser,
    r: finalUser,
    p: String(finalPort)
  };
  const expandedIdentityFiles = [];
  for (const file of identityFiles) {
    const expanded = expandHomePath(expandSshTokens(file, tokenMap), home);
    if (!expandedIdentityFiles.includes(expanded)) expandedIdentityFiles.push(expanded);
  }
  return {
    aliasOrHost: targetHost,
    hostName: finalHostName,
    port: finalPort,
    user: finalUser,
    identityFiles: expandedIdentityFiles,
    ...proxyJump !== void 0 ? { proxyJump: expandSshTokens(proxyJump, tokenMap) } : {},
    ...proxyCommand !== void 0 ? { proxyCommand: expandSshTokens(proxyCommand, tokenMap) } : {},
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
  return isAbsolute(expanded) ? expanded : resolve(join2(homedir(), ".ssh"), expanded);
}
function expandIncludeFiles(pattern) {
  const expandedPattern = resolveUserIncludePattern(pattern);
  const dir = dirname2(expandedPattern);
  const filePattern = expandedPattern.slice(dir.length + 1);
  if (!existsSync3(dir)) return [];
  try {
    if (!filePattern.includes("*") && !filePattern.includes("?")) {
      if (existsSync3(expandedPattern) && statSync(expandedPattern).isFile()) {
        return [{ path: expandedPattern, content: readFileSync3(expandedPattern, "utf8") }];
      }
      return [];
    }
    const regex = globToRegExp(filePattern);
    const entries = readdirSync(dir).sort();
    const results = [];
    for (const entry of entries) {
      if (!regex.test(entry)) continue;
      const fullPath = join2(dir, entry);
      try {
        if (statSync(fullPath).isFile()) {
          results.push({ path: fullPath, content: readFileSync3(fullPath, "utf8") });
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
var SSH2_MISSING_MESSAGE = "The optional ssh2 engine is not installed. Use system-ssh with an SSH agent, or explicitly install ssh2 in this DSH Profile through dsh plugin and approve only its reported build scripts.";
var MAX_EXEC_STDOUT_BYTES = 2 * 1024 * 1024;
var MAX_EXEC_STDERR_BYTES = 256 * 1024;
var spawnImpl = nodeSpawn;
function spawn(command, args, options) {
  return spawnImpl(command, args, options);
}
var BACKOFF_BASE_MS = 600;
var BACKOFF_MAX_MS = 15e3;
var READY_TIMEOUT_MS = 15e3;
var KEEPALIVE_INTERVAL_SEC = 15;
async function allocateLoopbackPort() {
  return new Promise((resolve2, reject) => {
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
        else resolve2(port);
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
    args.push("-o", "IdentitiesOnly=yes");
  }
  if (transport.proxyJump !== void 0 && transport.proxyJump.trim() !== "") {
    args.push("-J", transport.proxyJump.trim());
  }
  args.push(parsedSpec.host);
  return args;
}
async function execSshCommand(transport, command, timeoutMs = 8e3, signal) {
  if (signal?.aborted === true) return { ok: false, error: "ssh command aborted" };
  const resolved = resolveSshConfigForTransport(transport);
  const useSsh2 = transport.engine === "ssh2";
  if (useSsh2) {
    if (resolved.proxyJump !== void 0 || resolved.proxyCommand !== void 0) {
      return {
        ok: false,
        error: "ssh2 engine cannot honor ProxyJump/ProxyCommand; use system-ssh with an SSH agent"
      };
    }
    return execViaSsh2(transport, resolved, command, timeoutMs, signal);
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
  const explicitIdentity = transport.privateKeyPath?.trim();
  if (explicitIdentity !== void 0 && explicitIdentity !== "") {
    args.push("-i", expandHomePath(explicitIdentity));
    args.push("-o", "IdentitiesOnly=yes");
  }
  if (transport.proxyJump !== void 0 && transport.proxyJump.trim() !== "") {
    args.push("-J", transport.proxyJump.trim());
  }
  args.push(parsedSpec.host, command);
  return new Promise((resolve2) => {
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const proc = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] });
    const onAbort = () => {
      try {
        proc.kill("SIGKILL");
      } catch {
      }
      finish({ ok: false, error: "ssh command aborted" });
    };
    const finish = (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      resolve2(res);
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
    if (signal?.aborted === true) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    proc.stdout?.on("data", (chunk) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > MAX_EXEC_STDOUT_BYTES) {
        try {
          proc.kill("SIGKILL");
        } catch {
        }
        finish({ ok: false, error: "ssh command exceeded its stdout limit" });
        return;
      }
      stdoutChunks.push(chunk);
    });
    proc.stderr?.on("data", (chunk) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > MAX_EXEC_STDERR_BYTES) {
        try {
          proc.kill("SIGKILL");
        } catch {
        }
        finish({ ok: false, error: "ssh command exceeded its stderr limit" });
        return;
      }
      stderrChunks.push(chunk);
    });
    proc.on("error", (err) => {
      finish({ ok: false, error: err.message });
    });
    proc.on("close", (code) => {
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code === 0) finish({ ok: true, stdout: Buffer.concat(stdoutChunks).toString("utf8") });
      else finish({ ok: false, error: stderr.trim() || `ssh exited with code ${String(code)}` });
    });
  });
}
async function execViaSsh2(transport, resolved, command, timeoutMs, signal) {
  let ClientCtor;
  try {
    const mod = await import("ssh2");
    ClientCtor = mod.Client;
  } catch {
    return { ok: false, error: SSH2_MISSING_MESSAGE };
  }
  let privateKey;
  for (const keyPath of resolved.identityFiles) {
    if (existsSync4(keyPath)) {
      try {
        privateKey = readFileSync4(keyPath);
        break;
      } catch {
      }
    }
  }
  return new Promise((resolve2) => {
    const conn = new ClientCtor();
    let settled = false;
    const onAbort = () => finish({ ok: false, error: "ssh2 exec aborted" });
    const finish = (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      try {
        if (conn.destroy !== void 0) conn.destroy();
        else conn.end();
      } catch {
      }
      resolve2(res);
    };
    const timer = setTimeout(() => finish({ ok: false, error: "ssh2 exec timed out" }), timeoutMs);
    if (signal?.aborted === true) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    conn.on("ready", () => {
      conn.exec?.(command, (err, stream) => {
        if (err || !stream) {
          finish({ ok: false, error: err?.message ?? "ssh2 exec failed" });
          return;
        }
        const stdoutChunks = [];
        const stderrChunks = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        stream.on("data", (data) => {
          stdoutBytes += data.byteLength;
          if (stdoutBytes > MAX_EXEC_STDOUT_BYTES) {
            finish({ ok: false, error: "ssh2 exec exceeded its stdout limit" });
            return;
          }
          stdoutChunks.push(data);
        });
        stream.stderr?.on("data", (data) => {
          stderrBytes += data.byteLength;
          if (stderrBytes > MAX_EXEC_STDERR_BYTES) {
            finish({ ok: false, error: "ssh2 exec exceeded its stderr limit" });
            return;
          }
          stderrChunks.push(data);
        });
        stream.on("close", (code) => {
          const stderr = Buffer.concat(stderrChunks).toString("utf8");
          if (code === 0) finish({ ok: true, stdout: Buffer.concat(stdoutChunks).toString("utf8") });
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
    const preferSsh2 = this.transport.engine === "ssh2";
    if (!preferSsh2) {
      await this.openWithSystemSsh(resolved, generation);
      return;
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
    if (this.transport.privateKeyPath !== void 0 && this.transport.privateKeyPath.trim() !== "" && !existsSync4(expandHomePath(this.transport.privateKeyPath.trim()))) {
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
      this.fail(`System OpenSSH is required; install ssh and configure an SSH agent. ${error instanceof Error ? error.message : String(error)}`, generation, false);
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
      if (!detail.includes("ENOENT")) {
        this.fail(`SSH tunnel failed (${resolved.hostName}): ${detail}`, generation);
        return true;
      }
      this.killChild(proc);
      if (this.sshProc === proc) this.sshProc = void 0;
      this.fail("System OpenSSH is required; install ssh and configure an SSH agent. No implicit ssh2 fallback is installed.", generation, false);
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
      this.fail(SSH2_MISSING_MESSAGE, generation, false);
      return;
    }
    let privateKey;
    if (this.transport.privateKeyPath !== void 0 && this.transport.privateKeyPath.trim() !== "") {
      const keyFile = expandHomePath(this.transport.privateKeyPath.trim());
      try {
        privateKey = readFileSync4(keyFile);
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
        if (existsSync4(candidate)) {
          try {
            privateKey = readFileSync4(candidate);
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
  return new Promise((resolve2) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve2(ok);
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
  const knownHosts = join3(homedir2(), ".ssh", "known_hosts");
  if (!existsSync4(knownHosts)) return false;
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
  return COOKIE_PREFIX + encodeBase64Url(createHash2("sha256").update(authority).digest());
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
    const host = (device.transport.remoteBindHost ?? "127.0.0.1").trim();
    const port = device.transport.remotePort ?? 3080;
    const hostname2 = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
    return `${hostname2.includes(":") ? `[${hostname2}]` : hostname2}:${String(port)}`;
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
function authenticationCacheBinding(device, stored) {
  const transport = device.transport;
  const target = transport.kind === "ssh" ? [
    "ssh",
    transport.host,
    transport.port ?? null,
    transport.username ?? null,
    transport.privateKeyPath ?? null,
    transport.proxyJump ?? null,
    transport.engine ?? "auto",
    transport.remoteBindHost ?? "127.0.0.1",
    transport.remotePort ?? 3080,
    transport.remoteDshHome?.trim() || "~/.dsh",
    transport.bootstrapFromRemoteCredentials === true
  ] : ["direct", transport.baseUrl.replace(/\/+$/u, ""), transport.rejectUnauthorized !== false];
  return createHash2("sha256").update(JSON.stringify([
    1,
    target,
    device.auth.mode,
    device.auth.credential?.trim() || stored?.authCredential?.trim() || null,
    stored?.credentialVersion ?? 0
  ])).digest("hex");
}
function withoutCachedAuthentication(stored) {
  const {
    cookie: _cookie,
    cookieAuthority: _authority,
    bearerToken: _bearer,
    signingSecret: _secret,
    cacheBinding: _binding,
    ...rest
  } = stored;
  return rest;
}
var DeviceAuthManager = class {
  constructor(secretsFilePath) {
    this.secretsFilePath = secretsFilePath;
    this.storage = secretsFilePath === void 0 ? void 0 : new JsonSnapshotFile(
      secretsFilePath,
      (value) => value.version === 1 && typeof value.secrets === "object" && value.secrets !== null && !Array.isArray(value.secrets)
    );
    this.load();
  }
  secrets = /* @__PURE__ */ new Map();
  storage;
  load() {
    if (this.storage === void 0) return;
    try {
      const raw = this.storage.read();
      if (raw && typeof raw.secrets === "object" && raw.secrets !== null) {
        let stripped = false;
        for (const [id, entry] of Object.entries(raw.secrets)) {
          if (entry && typeof entry === "object") {
            const unbound = typeof entry.cacheBinding !== "string" || !/^[a-f0-9]{64}$/u.test(entry.cacheBinding);
            if (unbound || entry.signingSecret !== void 0) {
              if (entry.cookie !== void 0 || entry.cookieAuthority !== void 0 || entry.bearerToken !== void 0 || entry.signingSecret !== void 0 || entry.cacheBinding !== void 0) stripped = true;
              this.secrets.set(id, withoutCachedAuthentication(entry));
            } else {
              this.secrets.set(id, entry);
            }
          }
        }
        if (stripped) this.save();
      }
    } catch {
    }
  }
  save() {
    this.storage?.write({ version: 1, secrets: Object.fromEntries(this.secrets) });
  }
  /** Preflight for multi-file registry mutations; write still performs locked CAS. */
  assertWritable() {
    this.storage?.assertWritable();
  }
  /** A failed save must not leave credentials active only in this Host's memory. */
  persistEntry(deviceId, next) {
    const previous = this.secrets.get(deviceId);
    if (next === void 0) this.secrets.delete(deviceId);
    else this.secrets.set(deviceId, next);
    try {
      this.save();
    } catch (error) {
      if (previous === void 0) this.secrets.delete(deviceId);
      else this.secrets.set(deviceId, previous);
      throw error;
    }
  }
  removeDevice(deviceId) {
    if (this.secrets.has(deviceId)) this.persistEntry(deviceId, void 0);
  }
  /**
   * Drop cached cookies/bearer tokens after the remote rejected them, while
   * keeping the user-supplied credential and SSH passphrase for re-authentication.
   */
  invalidate(deviceId) {
    const current = this.secrets.get(deviceId);
    if (current === void 0) return;
    this.persistEntry(deviceId, { ...withoutCachedAuthentication(current), updatedAt: Date.now() });
  }
  /** Internal Host transaction snapshot; never serialize this record to Clients. */
  snapshotDevice(deviceId) {
    return this.secrets.get(deviceId);
  }
  /** Best-effort durable rollback. A rejected setter that already rolled back needs no write. */
  restoreDevice(deviceId, snapshot) {
    if (this.secrets.get(deviceId) === snapshot) return;
    this.persistEntry(deviceId, snapshot);
  }
  /** Read the persisted secret record for a device (never exposed to the Client). */
  storedSecret(deviceId) {
    return this.secrets.get(deviceId);
  }
  /** Persist or clear the explicit auth credential entered in the device form. */
  setAuthCredential(deviceId, credential) {
    const current = this.secrets.get(deviceId);
    const normalized = credential?.trim() || void 0;
    const changed = normalized !== current?.authCredential?.trim();
    const next = {
      ...current === void 0 ? { deviceId, updatedAt: Date.now() } : changed ? withoutCachedAuthentication(current) : current,
      deviceId,
      updatedAt: Date.now(),
      credentialVersion: (current?.credentialVersion ?? 0) + (changed ? 1 : 0),
      ...normalized !== void 0 ? { authCredential: normalized } : {}
    };
    if (normalized === void 0) delete next.authCredential;
    this.persistEntry(deviceId, next);
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
    this.persistEntry(deviceId, next);
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
    let stored = this.secrets.get(device.id);
    if (stored !== void 0 && (stored.cookie !== void 0 || stored.bearerToken !== void 0) && stored.cacheBinding !== authenticationCacheBinding(device, stored)) {
      this.invalidate(device.id);
      stored = this.secrets.get(device.id);
    }
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
    let existing = this.secrets.get(device.id);
    const cacheBinding = authenticationCacheBinding(device, existing);
    if (existing !== void 0 && (forceRefresh || existing.cacheBinding !== cacheBinding) && (existing.cookie !== void 0 || existing.bearerToken !== void 0)) {
      this.invalidate(device.id);
      existing = this.secrets.get(device.id);
    }
    if (!forceRefresh && existing?.cookie !== void 0 && existing.cookieAuthority === cookieAuthority && existing.cacheBinding === cacheBinding) {
      return { ok: true };
    }
    const configuredCredential = auth.credential?.trim() || existing?.authCredential?.trim();
    if (configuredCredential !== void 0 && configuredCredential !== "") {
      const exchanged = await this.exchangeLaunchToken(
        device.id,
        effectiveBaseUrl,
        authority,
        cookieAuthority,
        extractLaunchToken(configuredCredential),
        cacheBinding,
        device.transport.kind === "direct" ? device.transport.rejectUnauthorized !== false : true
      );
      if (exchanged.ok || auth.mode === "token") return exchanged;
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
      const current = this.secrets.get(device.id);
      if (authenticationCacheBinding(device, current) !== cacheBinding) {
        return { ok: false, error: "Authentication configuration changed; retry authentication" };
      }
      const next = {
        ...current ?? { deviceId: device.id, updatedAt: Date.now() },
        deviceId: device.id,
        cookie: minted,
        cookieAuthority,
        cacheBinding,
        updatedAt: Date.now()
      };
      delete next.signingSecret;
      this.persistEntry(device.id, next);
      return { ok: true };
    }
    return { ok: true };
  }
  /**
   * Exchange a DSH launch token (`/?token=<launchToken>`) for a persistent `dsh-auth-*` cookie.
   */
  async exchangeLaunchToken(deviceId, effectiveBaseUrl, authority, cookieAuthority, launchToken, cacheBinding, rejectUnauthorized = true) {
    const credentialVersion = this.secrets.get(deviceId)?.credentialVersion ?? 0;
    try {
      const url = new URL("/", effectiveBaseUrl);
      url.searchParams.set("token", launchToken);
      const response = await requestRemote(url.href, {
        method: "GET",
        headers: { Host: authority },
        timeoutMs: 15e3,
        rejectUnauthorized
      });
      const rawSetCookie = response.headers["set-cookie"];
      const setCookies = Array.isArray(rawSetCookie) ? rawSetCookie : rawSetCookie === void 0 ? [] : [rawSetCookie];
      for (const setCookie of setCookies) {
        const cookiePair = setCookie.split(";")[0]?.trim();
        if (cookiePair !== void 0 && cookiePair.startsWith(COOKIE_PREFIX)) {
          const current = this.secrets.get(deviceId);
          if ((current?.credentialVersion ?? 0) !== credentialVersion) {
            return { ok: false, error: "Authentication credential changed; retry authentication" };
          }
          this.persistEntry(deviceId, {
            ...current === void 0 ? { deviceId, updatedAt: Date.now() } : withoutCachedAuthentication(current),
            deviceId,
            cookie: cookiePair,
            cookieAuthority,
            ...cacheBinding !== void 0 ? { cacheBinding } : {},
            updatedAt: Date.now()
          });
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

// src/host/device-catalog.ts
function isCatalogRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var finite = (value) => typeof value === "number" && Number.isFinite(value);
var sequence = (value) => finite(value) && Number.isSafeInteger(value) && value >= -1;
var sessionId = (value) => typeof value === "string" && value.length > 0 && !isNamespacedSessionId(value);
var workspaceId = (value) => typeof value === "string" && value.length > 0;
function catalogSessionIds(value) {
  return Array.isArray(value) ? [...new Set(value.filter(sessionId))] : [];
}
function parseSessionSummary(value, legacy = false) {
  if (!isCatalogRecord(value) || !sessionId(value.sessionId)) return void 0;
  if (!legacy && (!finite(value.updatedAt) || typeof value.agentAvailable !== "boolean" || typeof value.running !== "boolean" || typeof value.blank !== "boolean")) return void 0;
  if (value.updatedAt !== void 0 && !finite(value.updatedAt)) return void 0;
  if (value.running !== void 0 && typeof value.running !== "boolean") return void 0;
  if (value.blank !== void 0 && typeof value.blank !== "boolean") return void 0;
  if (value.parentSessionId !== void 0 && !sessionId(value.parentSessionId)) return void 0;
  if (value.origin !== void 0 && value.origin !== "subagent") return void 0;
  if (value.cwd !== void 0 && typeof value.cwd !== "string") return void 0;
  const projection = value.projections;
  return {
    sessionId: value.sessionId,
    updatedAt: finite(value.updatedAt) ? value.updatedAt : 0,
    agentAvailable: typeof value.agentAvailable === "boolean" ? value.agentAvailable : false,
    running: value.running === true,
    blank: value.blank === true,
    ...typeof value.parentSessionId === "string" ? { parentSessionId: value.parentSessionId } : {},
    ...value.origin === "subagent" ? { origin: "subagent" } : {},
    ...typeof value.cwd === "string" ? { cwd: value.cwd } : {},
    ...isCatalogRecord(projection) && sequence(projection.asOfSeq) && isCatalogRecord(projection.values) && (projection.kind === "cached" || projection.kind === "sequenced" || legacy) ? { projections: {
      kind: projection.kind === "sequenced" ? "sequenced" : "cached",
      asOfSeq: projection.asOfSeq,
      values: { ...projection.values }
    } } : {}
  };
}
function parseWorkspace(value, legacy = false) {
  if (!isCatalogRecord(value) || !workspaceId(value.workspaceId) || typeof value.path !== "string") return void 0;
  if (!legacy && (typeof value.title !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || !Array.isArray(value.sessionIds))) return void 0;
  return {
    workspaceId: value.workspaceId,
    path: value.path,
    title: typeof value.title === "string" ? value.title : value.path,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    sessionIds: catalogSessionIds(value.sessionIds)
  };
}
var DeviceCatalog = class {
  generation = 0;
  request = 0;
  flight;
  rows = [];
  workspaceRows = [];
  archived = [];
  pinned = [];
  projections = /* @__PURE__ */ new Map();
  projectionSequences = /* @__PURE__ */ new Map();
  projectionBaselines = /* @__PURE__ */ new Map();
  readyParts = /* @__PURE__ */ new Set();
  staleValue = false;
  syncedAtValue;
  get epoch() {
    return this.generation;
  }
  get stale() {
    return this.staleValue;
  }
  get syncedAt() {
    return this.syncedAtValue;
  }
  get sessions() {
    return this.rows;
  }
  get workspaces() {
    return this.workspaceRows;
  }
  get archivedIds() {
    return this.archived;
  }
  get pinnedIds() {
    return this.pinned;
  }
  get controlProjections() {
    return this.projections;
  }
  get ready() {
    return this.readyParts.size === 4;
  }
  get eventsReady() {
    return this.readyParts.has("events");
  }
  isCurrent(epoch) {
    return epoch === this.generation;
  }
  beginEpoch() {
    this.generation += 1;
    this.request += 1;
    this.flight = void 0;
    this.readyParts.clear();
    this.projections.clear();
    this.projectionSequences.clear();
    this.projectionBaselines.clear();
    this.staleValue = true;
    return this.generation;
  }
  disconnect() {
    this.beginEpoch();
  }
  markEventsReady(epoch) {
    if (this.isCurrent(epoch)) this.readyParts.add("events");
  }
  markLive(epoch, legacy = false) {
    if (!this.isCurrent(epoch) || (legacy ? !this.readyParts.has("sessions") || !this.readyParts.has("workspace") : !this.ready)) return false;
    this.staleValue = false;
    this.syncedAtValue = Date.now();
    return true;
  }
  visibleSessions() {
    return this.staleValue ? this.rows.map((row) => ({ ...row, running: false, agentAvailable: false })) : this.rows;
  }
  hydrate(cache) {
    if (this.rows.length || this.workspaceRows.length || this.readyParts.size) return false;
    this.rows = cache.sessions.map((row) => parseSessionSummary(row)).filter((row) => row !== void 0);
    this.workspaceRows = cache.workspaces.map((row) => parseWorkspace(row)).filter((row) => row !== void 0);
    this.setArchivedIds(cache.archivedSessionIds);
    this.setPinnedIds(cache.pinnedSessionIds);
    this.syncedAtValue = cache.syncedAt;
    this.staleValue = true;
    return true;
  }
  setArchivedIds(ids2) {
    this.archived = catalogSessionIds(ids2);
  }
  setPinnedIds(ids2) {
    this.pinned = catalogSessionIds(ids2);
  }
  /** Replace validated facts without introducing a second transport-side table. */
  replaceSessions(items) {
    this.rows = items.map((item) => parseSessionSummary(item)).filter((row) => row !== void 0);
  }
  /** Explicit freshness override for hydration/test adapters; readiness stays independent. */
  setStale(stale) {
    this.staleValue = stale;
  }
  /** Single flight per epoch; an individual caller cannot cancel another caller's flight. */
  refreshSessions(epoch, load, legacy = false, signal, onBeforeCommit) {
    if (!this.isCurrent(epoch)) return Promise.resolve(false);
    if (this.flight?.epoch === epoch) return this.flight.promise;
    const request = ++this.request;
    const flight = { epoch, request, journal: [], overflow: false, promise: Promise.resolve(false) };
    this.flight = flight;
    flight.promise = Promise.resolve().then(() => {
      if (signal?.aborted || !this.isCurrent(epoch) || this.flight !== flight) return void 0;
      return load();
    }).then((value) => {
      if (signal?.aborted || !this.isCurrent(epoch) || this.flight !== flight || request !== this.request) return false;
      if (!isCatalogRecord(value) || !Array.isArray(value.items)) throw new Error("Invalid remote session/list baseline");
      if (flight.overflow) throw new Error("Remote catalog changed too quickly during baseline; reconnect required");
      const rows = value.items.map((row) => parseSessionSummary(row, legacy)).filter((row) => row !== void 0);
      onBeforeCommit?.();
      this.rows = [...new Map(rows.map((row) => [row.sessionId, this.withControlHints(row, true)])).values()];
      for (const delta of flight.journal) this.reduceSession(delta);
      const present = new Set(this.rows.map((row) => row.sessionId));
      for (const id of this.projections.keys()) if (!present.has(id)) {
        this.projections.delete(id);
        this.projectionSequences.delete(id);
        this.projectionBaselines.delete(id);
      }
      this.readyParts.add("sessions");
      if (!this.staleValue) this.syncedAtValue = Date.now();
      return true;
    }).finally(() => {
      if (this.flight === flight) this.flight = void 0;
    });
    return flight.promise;
  }
  applySessionEvent(epoch, event, args) {
    if (!this.isCurrent(epoch)) return false;
    const [id, value] = args;
    let delta;
    if (event === "api-session/added") {
      const summary = parseSessionSummary(id);
      if (summary === void 0) return false;
      delta = { type: "upsert", summary };
    } else {
      if (!sessionId(id)) return false;
      if (event === "api-session/removed") delta = { type: "remove", id };
      else if (event === "api-session/status" && typeof value === "boolean") delta = { type: "status", id, running: value };
      else if (event === "api-session/activity" && finite(value)) delta = { type: "activity", id, updatedAt: value };
      else return false;
    }
    const flight = this.flight;
    if (flight?.epoch === epoch) {
      if (flight.journal.length >= 1e4) flight.overflow = true;
      else flight.journal.push(delta);
    }
    this.reduceSession(delta);
    return true;
  }
  withControlHints(row, incoming = false) {
    if (incoming && row.projections?.kind === "sequenced") {
      const block = this.projections.get(row.sessionId);
      const sequences = this.projectionSequences.get(row.sessionId) ?? /* @__PURE__ */ new Map();
      const values2 = { ...block?.values };
      let changed = false;
      for (const key of ["title", "sessionListMetadata"]) {
        if (!Object.hasOwn(row.projections.values, key)) continue;
        const watermark = sequences.get(key) ?? this.projectionBaselines.get(row.sessionId) ?? -Infinity;
        if (row.projections.asOfSeq <= watermark) continue;
        values2[key] = row.projections.values[key];
        sequences.set(key, row.projections.asOfSeq);
        changed = true;
      }
      if (changed) {
        this.projectionSequences.set(row.sessionId, sequences);
        this.projections.set(row.sessionId, { asOfSeq: Math.max(block?.asOfSeq ?? -1, row.projections.asOfSeq), values: values2 });
      }
    }
    const control = this.projections.get(row.sessionId);
    if (control === void 0 || !Object.hasOwn(control.values, "title") && !Object.hasOwn(control.values, "sessionListMetadata")) return row;
    const values = { ...row.projections?.values };
    for (const [key, value] of Object.entries(control.values)) {
      if (key !== "title" && key !== "sessionListMetadata") continue;
      values[key] = value;
    }
    const metadata2 = control.values.sessionListMetadata;
    return {
      ...row,
      ...isCatalogRecord(metadata2) && typeof metadata2.blank === "boolean" ? { blank: metadata2.blank } : {},
      projections: {
        kind: "sequenced",
        asOfSeq: Math.max(row.projections?.asOfSeq ?? -1, control.asOfSeq),
        values
      }
    };
  }
  syncControlHints() {
    this.rows = this.rows.map((row) => this.withControlHints(row));
  }
  reduceSession(delta) {
    if (delta.type === "upsert") {
      const summary = this.withControlHints(delta.summary, true);
      const index = this.rows.findIndex((row) => row.sessionId === summary.sessionId);
      this.rows = index < 0 ? [summary, ...this.rows] : this.rows.map((row, i) => i === index ? summary : row);
    } else if (delta.type === "remove") {
      this.rows = this.rows.filter((row) => row.sessionId !== delta.id);
      this.projections.delete(delta.id);
      this.projectionSequences.delete(delta.id);
      this.projectionBaselines.delete(delta.id);
    } else {
      this.rows = this.rows.map((row) => row.sessionId !== delta.id ? row : delta.type === "status" ? { ...row, running: delta.running, agentAvailable: true } : { ...row, updatedAt: Math.max(row.updatedAt, delta.updatedAt) });
    }
  }
  applyWorkspaceFrame(epoch, frame, legacy = false) {
    if (!this.isCurrent(epoch) || !isCatalogRecord(frame)) return false;
    if ((frame.type === "baseline" || frame.type === "replace") && isCatalogRecord(frame.value) && Array.isArray(frame.value.items)) {
      this.workspaceRows = frame.value.items.map((row) => parseWorkspace(row, legacy)).filter((row) => row !== void 0);
      this.setArchivedIds(catalogSessionIds(frame.value.archivedSessionIds));
      this.setPinnedIds(catalogSessionIds(frame.value.pinnedSessionIds));
      this.readyParts.add("workspace");
    } else if (frame.type === "upsert") {
      const row = parseWorkspace(frame.workspace, legacy);
      if (row === void 0) return false;
      const index = this.workspaceRows.findIndex((existing) => existing.workspaceId === row.workspaceId);
      this.workspaceRows = index < 0 ? [row, ...this.workspaceRows] : this.workspaceRows.map((existing, i) => i === index ? row : existing);
    } else if (frame.type === "remove" && workspaceId(frame.workspaceId)) {
      this.workspaceRows = this.workspaceRows.filter((row) => row.workspaceId !== frame.workspaceId);
    } else if (frame.type === "order" && Array.isArray(frame.workspaceIds)) {
      const rank = new Map(frame.workspaceIds.filter(workspaceId).map((id, i) => [id, i]));
      this.workspaceRows = [...this.workspaceRows].sort((a, b) => (rank.get(a.workspaceId) ?? Infinity) - (rank.get(b.workspaceId) ?? Infinity));
    } else if (frame.type === "archived" && Array.isArray(frame.archivedSessionIds)) this.setArchivedIds(catalogSessionIds(frame.archivedSessionIds));
    else if (frame.type === "pinned" && Array.isArray(frame.pinnedSessionIds)) this.setPinnedIds(catalogSessionIds(frame.pinnedSessionIds));
    else return false;
    return true;
  }
  applyControlFrame(epoch, frame, namespace) {
    if (!this.isCurrent(epoch) || !isCatalogRecord(frame)) return void 0;
    const updates = [];
    if (frame.type === "baseline" && isCatalogRecord(frame.value) && isCatalogRecord(frame.value.projections)) {
      for (const [id, block] of Object.entries(frame.value.projections)) {
        if (!sessionId(id) || !isCatalogRecord(block) || !sequence(block.asOfSeq) || !isCatalogRecord(block.values)) continue;
        const existing2 = this.projections.get(id);
        if ((this.projectionBaselines.get(id) ?? -Infinity) >= block.asOfSeq) continue;
        const sequences2 = this.projectionSequences.get(id) ?? /* @__PURE__ */ new Map();
        const values = { ...existing2?.values };
        for (const key of Object.keys(values)) {
          if (!Object.hasOwn(block.values, key) && (sequences2.get(key) ?? -1) <= block.asOfSeq) {
            delete values[key];
            sequences2.delete(key);
          }
        }
        for (const [key, raw] of Object.entries(block.values)) {
          if ((sequences2.get(key) ?? -Infinity) > block.asOfSeq) continue;
          const value2 = namespace(key, raw);
          values[key] = value2;
          sequences2.set(key, block.asOfSeq);
          updates.push({ sessionId: id, key, value: value2, seq: Math.max(0, block.asOfSeq) });
        }
        this.projections.set(id, { asOfSeq: Math.max(existing2?.asOfSeq ?? -1, block.asOfSeq), values });
        this.projectionBaselines.set(id, block.asOfSeq);
        this.projectionSequences.set(id, sequences2);
      }
      this.readyParts.add("control");
      this.syncControlHints();
      return updates;
    }
    if (frame.type !== "projection" || !sessionId(frame.sessionId) || typeof frame.key !== "string" || !sequence(frame.seq) || frame.seq < 0) return void 0;
    const existing = this.projections.get(frame.sessionId);
    const sequences = this.projectionSequences.get(frame.sessionId) ?? /* @__PURE__ */ new Map();
    const watermark = sequences.get(frame.key) ?? this.projectionBaselines.get(frame.sessionId) ?? -1;
    if (frame.seq <= watermark) return void 0;
    const value = namespace(frame.key, frame.value);
    sequences.set(frame.key, frame.seq);
    this.projectionSequences.set(frame.sessionId, sequences);
    this.projections.set(frame.sessionId, { asOfSeq: Math.max(existing?.asOfSeq ?? -1, frame.seq), values: { ...existing?.values, [frame.key]: value } });
    if (frame.key === "title" || frame.key === "sessionListMetadata") this.syncControlHints();
    return [{ sessionId: frame.sessionId, key: frame.key, value, seq: frame.seq }];
  }
};

// src/host/catalog-codec.ts
function invalid(message) {
  throw new SyntaxError(`Invalid catalog document: ${message}`);
}
function ids(value, label) {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  const parsed = catalogSessionIds(value);
  if (parsed.length !== value.length) invalid(`${label} contains an invalid or duplicate raw Session ID`);
  return parsed;
}
function catalog(deviceId, value) {
  if (!isCatalogRecord(value) || value.deviceId !== deviceId || !Number.isFinite(value.syncedAt) || !["0.2", "0.1", "unknown"].includes(value.protocolVersion) || value.catalogTruncated !== void 0 && typeof value.catalogTruncated !== "boolean" || !Array.isArray(value.sessions) || !Array.isArray(value.workspaces)) invalid(`device ${deviceId} has an invalid header`);
  const sessions = value.sessions.map((item, index) => {
    const summary = parseSessionSummary(item, true);
    if (summary === void 0) invalid(`device ${deviceId} Session ${index} is invalid`);
    if (isCatalogRecord(item) && item.title !== void 0 && typeof item.title !== "string") invalid(`device ${deviceId} Session ${index} title is invalid`);
    return {
      ...isCatalogRecord(item) && typeof item.title === "string" ? { title: item.title } : {},
      sessionId: summary.sessionId,
      updatedAt: summary.updatedAt,
      agentAvailable: summary.agentAvailable,
      running: summary.running,
      blank: summary.blank,
      ...summary.parentSessionId !== void 0 ? { parentSessionId: summary.parentSessionId } : {},
      ...summary.origin !== void 0 ? { origin: summary.origin } : {},
      ...summary.cwd !== void 0 ? { cwd: summary.cwd } : {}
    };
  });
  if (new Set(sessions.map((item) => item.sessionId)).size !== sessions.length) invalid(`device ${deviceId} contains duplicate Session IDs`);
  const workspaces = value.workspaces.map((item, index) => {
    if (isCatalogRecord(item)) ids(item.sessionIds, `device ${deviceId} Workspace ${index} sessions`);
    const workspace = parseWorkspace(item, true);
    if (workspace === void 0) invalid(`device ${deviceId} Workspace ${index} is invalid`);
    return { ...workspace };
  });
  if (new Set(workspaces.map((item) => item.workspaceId)).size !== workspaces.length) invalid(`device ${deviceId} contains duplicate Workspace IDs`);
  return {
    deviceId,
    syncedAt: value.syncedAt,
    protocolVersion: value.protocolVersion,
    sessions,
    workspaces,
    archivedSessionIds: ids(value.archivedSessionIds, `device ${deviceId} archived IDs`),
    pinnedSessionIds: ids(value.pinnedSessionIds, `device ${deviceId} pinned IDs`),
    ...value.catalogTruncated !== void 0 ? { catalogTruncated: value.catalogTruncated === true } : {}
  };
}
function catalogs(value) {
  if (!isCatalogRecord(value)) invalid("catalogs must be an object");
  const result = /* @__PURE__ */ new Map();
  for (const [key, item] of Object.entries(value)) {
    if (key === "" || key === LOCAL_DEVICE_ID || key.length > 160) invalid("device key is invalid");
    const deviceId = DeviceId(key);
    result.set(deviceId, catalog(deviceId, item));
  }
  return result;
}
function decodeCatalogDocument(value) {
  if (!isCatalogRecord(value) || value.version !== 2) invalid("expected version 2");
  return catalogs(value.catalogs);
}
function decodeLegacyCatalogs(value) {
  return catalogs(value);
}
function encodeCatalogDocument(values) {
  const result = {};
  for (const [deviceId, cache] of values) {
    result[deviceId] = catalog(deviceId, cache);
  }
  return { version: 2, catalogs: result };
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
  // The script URL is shared/cached by all pages; ownership comes from the
  // containing frame URL supplied by NativeViewport, not script.src.
  var clientId = '';
  try { clientId = new URLSearchParams(location.search || '').get('md_client') || ''; } catch (error) {}

  var initialGroups = {};
  var initialUnread = [];
  var initialReadCompletions;
  try {
    if (window.__DSH_MD_GROUPS__ && typeof window.__DSH_MD_GROUPS__ === 'object' && !Array.isArray(window.__DSH_MD_GROUPS__)) {
      initialGroups = window.__DSH_MD_GROUPS__;
    }
    if (Array.isArray(window.__DSH_MD_UNREAD__)) initialUnread = window.__DSH_MD_UNREAD__;
    initialReadCompletions = window.__DSH_MD_READ_COMPLETIONS__;
  } catch (error) {}

  var socket = null;
  var retryTimer = null;
  var readySent = false;
  var failedReason = null;
  var captured = null;
  var lastSelection = null;
  var navigation = null;
  var navigationSeq = 0;
  var socketGeneration = 0;
  var NAVIGATION_TIMEOUT_MS = 15000;
  var lastTitle = '';
  var lastSentTitle = null;
  var titleObserver = null;
  // A keep-alive page is often display:none. Read clearing must only happen
  // while this page is actually visible, or a background device would consume
  // another device's unread marker.
  var frameVisible = true;
  var visibilityObserver = null;
  var lastSentVisibility = null;
  // The parent shell knows exactly which tab/pane is active. Its postMessage
  // signal is more reliable than IntersectionObserver for display:none frames,
  // so it takes precedence once received.
  var parentVisible = null;

  // Workspace fold state is owned by the local Host. The injected prefix is
  // applied before the workspace browser first renders, so there is no
  // collapsed-then-expanded flash.
  var groups = normalizeGroups(initialGroups);
  var groupSyncInstalled = false;
  var groupSendTimer = null;
  var groupEchoGuard = false;

  // Session completion reminders are owned by the local Host too; the tab strip
  // overlays that set instead of DSH's in-memory one.
  var unread = Object.create(null);
  var hostUnread = Object.create(null);
  var readCompletions = normalizeReadCompletions(initialReadCompletions);
  var pendingReads = [];
  var readRequestSequence = 0;
  var readRetryTimer = null;
  var readStateReady = false;
  var readStateVersion = 0;
  for (var initialUnreadIndex = 0; initialUnreadIndex < initialUnread.length; initialUnreadIndex += 1) {
    if (typeof initialUnread[initialUnreadIndex] === 'string' && initialUnread[initialUnreadIndex] !== '') {
      unread[initialUnread[initialUnreadIndex]] = true;
      hostUnread[initialUnread[initialUnreadIndex]] = true;
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

  function isFrameVisible() {
    var pageVisible = true;
    try { pageVisible = document.visibilityState !== 'hidden'; } catch (error) {}
    var shellVisible = parentVisible === null ? frameVisible : parentVisible;
    return shellVisible && pageVisible;
  }

  function sendVisibility(force) {
    var next = isFrameVisible();
    if (!force && next === lastSentVisibility) return;
    lastSentVisibility = next;
    send({ type: 'visibility', visible: next });
    if (next && readySent) {
      clearUnreadForSelection();
      flushReads();
      report();
    }
  }

  function installVisibilityTracking() {
    if (typeof IntersectionObserver === 'function') {
      // Start hidden until the observer confirms this frame is rendered. The
      // callback fires immediately after observe(), including for display:none.
      frameVisible = false;
      try {
        visibilityObserver = new IntersectionObserver(function (entries) {
          var entry = entries && entries[0];
          if (!entry) return;
          var next = entry.isIntersecting === true;
          if (next === frameVisible) return;
          frameVisible = next;
          sendVisibility(false);
        }, { threshold: 0 });
        visibilityObserver.observe(document.documentElement);
      } catch (error) {
        frameVisible = true;
        visibilityObserver = null;
      }
    }
    try {
      document.addEventListener('visibilitychange', function () { sendVisibility(false); });
    } catch (error) {}
    try {
      window.addEventListener('message', function (event) {
        var data = event && event.data;
        if (!data || data.__dshMdVisibility !== true) return;
        var next = data.visible === true;
        if (next === parentVisible) return;
        parentVisible = next;
        sendVisibility(false);
      });
    } catch (error) {}
    sendVisibility(true);
  }

  function sanitizeTitle(value) {
    var text = '';
    try { text = String(value == null ? '' : value); } catch (error) { return ''; }
    text = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 300 ? text.slice(0, 300) : text;
  }

  function sendTitle(force) {
    if (!force && lastSentTitle === lastTitle) return;
    if (send({ type: 'title', title: lastTitle })) lastSentTitle = lastTitle;
  }

  function reportTitle() {
    var next = '';
    try { next = sanitizeTitle(document.title); } catch (error) {}
    if (next !== lastTitle) lastTitle = next;
    sendTitle(false);
  }

  function installTitleReporter() {
    if (titleObserver === null && typeof MutationObserver === 'function') {
      try {
        titleObserver = new MutationObserver(function () { reportTitle(); });
        titleObserver.observe(document.head || document.documentElement, {
          subtree: true,
          childList: true,
          characterData: true
        });
      } catch (error) {
        titleObserver = null;
      }
    }
    reportTitle();
  }

  function copyTextFallback(text) {
    var area = null;
    var selection = null;
    var previousRange = null;
    try {
      area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      area.style.left = '-1000px';
      area.style.opacity = '0';
      document.body.appendChild(area);
      try {
        selection = document.getSelection();
        if (selection && selection.rangeCount > 0) previousRange = selection.getRangeAt(0);
      } catch (error) {}
      area.select();
      var copied = false;
      try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
      try { area.remove(); } catch (error) {}
      if (selection && previousRange) {
        try {
          selection.removeAllRanges();
          selection.addRange(previousRange);
        } catch (error) {}
      }
      return copied === true;
    } catch (error) {
      try { if (area) area.remove(); } catch (cleanupError) {}
      return false;
    }
  }

  // Cross-origin iframes only receive clipboard-write when the parent delegates
  // it (the client also sets allow= on the iframe). Electron guests can still
  // deny it, so every copy gets a synchronous execCommand fallback inside the
  // page that owns the click. Without this, DSH's copy buttons silently fail.
  function installClipboardFallback() {
    var proto = null;
    try { proto = typeof Clipboard === 'function' ? Clipboard.prototype : null; } catch (error) {}
    var target = proto;
    var original = null;
    try {
      var descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'writeText');
      if (descriptor && typeof descriptor.value === 'function') original = descriptor.value;
    } catch (error) {}
    if (typeof original !== 'function') {
      try {
        var clipboard = navigator.clipboard;
        if (clipboard && typeof clipboard.writeText === 'function') {
          original = clipboard.writeText;
          target = clipboard;
        }
      } catch (error) {}
    }
    if (typeof original !== 'function' || original.__dshMdClipboard === true) return;
    var wrapped = function (text) {
      var value = '';
      try { value = String(text); } catch (error) { value = ''; }
      if (copyTextFallback(value)) return Promise.resolve();
      return original.apply(this, arguments);
    };
    wrapped.__dshMdClipboard = true;
    try {
      if (target && typeof target.writeText === 'function') {
        target.writeText = wrapped;
        return;
      }
    } catch (error) {}
    try {
      if (target && typeof Object.defineProperty === 'function') {
        Object.defineProperty(target, 'writeText', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: wrapped
        });
      }
    } catch (error) {}
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

  function hasKnownSession(sessionId) {
    if (!captured || !captured.sessions || !captured.sessions.list || typeof captured.sessions.list.getSnapshot !== 'function') {
      return false;
    }
    try {
      var snap = captured.sessions.list.getSnapshot();
      return Boolean(snap && snap.byId && snap.byId[sessionId]);
    } catch (error) {
      return false;
    }
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
    if (sessionId && unread[sessionId] === true && isFrameVisible()) {
      queueRead(sessionId);
    }
  }

  function refreshSessions() {
    if (!captured || !captured.sessions || typeof captured.sessions.refresh !== 'function') return;
    try {
      var pending = captured.sessions.refresh();
      if (pending && typeof pending.catch === 'function') pending.catch(function () {});
    } catch (error) {}
  }

  function navigationError(error) {
    if (error && typeof error.message === 'string') {
      return (typeof error.code === 'string' ? error.code + ': ' : '') + error.message;
    }
    return typeof error === 'string' ? error : 'The remote Session could not open its history';
  }

  function cancelNavigation() {
    var previous = navigation;
    navigation = null;
    if (!previous) return;
    if (previous.timer !== null) clearTimeout(previous.timer);
    if (previous.poll !== null) clearInterval(previous.poll);
    if (previous.off) { try { previous.off(); } catch (error) {} }
  }

  function openSession(sessionId, requestSeq) {
    if (typeof sessionId !== 'string' || sessionId === '') return;
    var seq = typeof requestSeq === 'number' && Number.isSafeInteger(requestSeq) && requestSeq >= 0
      ? requestSeq : navigationSeq + 1;
    // Commands in one socket generation must be monotonic. A replay of the
    // same transaction is harmless; a reconnect starts a fresh generation.
    if (seq < navigationSeq) return;
    navigationSeq = seq;
    cancelNavigation();
    var tx = { sessionId: sessionId, requestSeq: seq, context: captured,
      generation: socketGeneration, timer: null, poll: null, off: null, face: null, settled: false };
    navigation = tx;
    function active() {
      return navigation === tx && tx.context === captured && tx.generation === socketGeneration && !tx.settled;
    }
    function status(state, error) {
      if (!active()) return;
      var message = { type: 'navigation', sessionId: sessionId, requestSeq: seq, openState: state };
      if (error) message.error = error;
      send(message);
      if (state !== 'loading') { tx.settled = true; cancelNavigation(); }
    }
    status('loading');
    var sessions = captured && captured.sessions;
    var workspace = captured && captured.uiWorkspace;
    if (!workspace || typeof workspace.openSession !== 'function' || !sessions || typeof sessions.binding !== 'function') {
      status('error', 'Incompatible DSH version: native navigation requires the 0.2.1-rc.5 sessions.binding/session snapshot contract');
      return;
    }
    function inspect() {
      if (!active()) return;
      try {
        var binding = sessions.binding(sessionId);
        if (!binding) return;
        var face = binding.session;
        if (!face || typeof face.getSnapshot !== 'function' || typeof face.subscribe !== 'function') {
          status('error', 'Incompatible DSH version: Session binding has no observable session snapshot');
          return;
        }
        if (face !== tx.face) {
          if (tx.off) { try { tx.off(); } catch (error) {} }
          tx.face = face;
          // Bind callbacks to the exact Session generation, not just its id.
          var off = face.subscribe(function () { if (active() && tx.face === face) inspect(); });
          if (!active()) { if (typeof off === 'function') off(); return; }
          tx.off = typeof off === 'function' ? off : null;
        }
        var snapshot = face.getSnapshot();
        if (!snapshot || snapshot.sessionId !== sessionId ||
            ['cold', 'loading', 'open', 'error'].indexOf(snapshot.openState) === -1) {
          status('error', 'Incompatible DSH version: unsupported Session snapshot/openState contract');
          return;
        }
        if (snapshot.openState === 'error') { status('error', navigationError(snapshot.openError)); return; }
        // Selection is necessary to show the target, never sufficient to prove
        // history opened. An open empty history is a valid successful Session.
        if (snapshot.openState === 'open' && currentSelection() === sessionId) status('open');
      } catch (error) { status('error', navigationError(error)); }
    }
    tx.timer = setTimeout(function () {
      status('error', 'Timed out waiting for the remote Session history to open');
    }, NAVIGATION_TIMEOUT_MS);
    // Poll only to discover/rebind a borrowed binding after startup or a local
    // Session generation replacement; history completion is observed directly.
    var opening = false;
    var refreshSettled = false;
    function run() {
      if (!active() || opening) return;
      if (!hasKnownSession(sessionId)) return;
      opening = true;
      try { workspace.openSession(sessionId); } catch (error) {
        // A reconnect can retire the manager baseline between list publication
        // and retain. Wait for the next authoritative directory notification.
        if (String(error && error.message || error).indexOf('sessions.retain: unknown session') !== -1) { opening = false; return; }
        status('error', navigationError(error)); return;
      }
      report();
      inspect();
    }
    // Observe the actual published directory, not just refresh's Promise:
    // official refresh can finish an old generation without publishing a list.
    tx.poll = setInterval(function () { if (!active()) return; if (opening) inspect(); else if (refreshSettled) run(); }, 50);
    if (!hasKnownSession(sessionId) && typeof sessions.refresh === 'function') {
      try {
        var pending = sessions.refresh();
        if (pending && typeof pending.then === 'function') { pending.then(function () { refreshSettled = true; run(); }, function (error) { status('error', navigationError(error)); }); return; }
      } catch (error) { status('error', navigationError(error)); return; }
    }
    refreshSettled = true;
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

  function normalizeReadCompletions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var out = Object.create(null);
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length && i < 2000; i += 1) {
      var key = keys[i];
      if (key && key.length <= 512 && typeof value[key] === 'string' && value[key] && value[key].length <= 512) out[key] = value[key];
    }
    return out;
  }

  function tokenFor(sessionId) {
    return readCompletions ? readCompletions[sessionId] : undefined;
  }

  function pendingFor(sessionId, completionId) {
    for (var i = 0; i < pendingReads.length; i += 1) {
      if (pendingReads[i].sessionId === sessionId && pendingReads[i].completionId === completionId) return pendingReads[i];
    }
    return null;
  }

  function queueRead(sessionId) {
    var completionId = tokenFor(sessionId);
    if (readCompletions !== null && completionId === undefined) return;
    if (!pendingFor(sessionId, completionId)) {
      // Never evict an unacknowledged read to make room. Leave the overlay
      // unread instead; it can be consumed after an ACK frees capacity.
      if (pendingReads.length >= 256) return;
      pendingReads.push({ sessionId: sessionId, completionId: completionId,
        requestId: 'read-' + Date.now().toString(36) + '-' + (++readRequestSequence),
        attempts: 0, nextAt: 0, stateVersion: readStateVersion });
    }
    delete unread[sessionId];
    notifyRead();
    flushReads();
  }

  function flushReads() {
    if (readRetryTimer !== null) { clearTimeout(readRetryTimer); readRetryTimer = null; }
    if (!readStateReady || !socket || socket.readyState !== 1) return;
    var now = Date.now();
    var nextAt = Infinity;
    var sent = 0;
    for (var i = 0; i < pendingReads.length; i += 1) {
      var pending = pendingReads[i];
      // Tokenless legacy reads must not clear a completion after an upgrade.
      // Token-bearing stale reads are safe to replay: the Host rejects them.
      if (pending.completionId !== undefined && readCompletions === null) continue;
      if (pending.completionId === undefined && (readCompletions !== null || !hostUnread[pending.sessionId] ||
          !isFrameVisible() || currentSelection() !== pending.sessionId)) continue;
      if (pending.nextAt <= now && sent < 16) {
        var message = { type: 'read', sessionId: pending.sessionId, requestId: pending.requestId };
        if (pending.completionId !== undefined) message.completionId = pending.completionId;
        // send success is NOT acceptance. Keep the exact token/request until
        // read-ack, including when read-state arrives synchronously first.
        send(message);
        pending.attempts += 1;
        pending.nextAt = now + Math.min(30000, 1000 * Math.pow(2, Math.min(pending.attempts - 1, 5)));
        sent += 1;
      }
      nextAt = Math.min(nextAt, pending.nextAt);
    }
    if (nextAt !== Infinity) readRetryTimer = setTimeout(function () {
      readRetryTimer = null;
      flushReads();
    }, Math.max(100, nextAt - Date.now()));
  }

  function applyReadAck(data) {
    if (typeof data.sessionId !== 'string' || typeof data.accepted !== 'boolean') return;
    var index = -1;
    for (var i = 0; i < pendingReads.length; i += 1) {
      var candidate = pendingReads[i];
      if (candidate.sessionId !== data.sessionId) continue;
      if (typeof data.requestId === 'string' ? candidate.requestId !== data.requestId : candidate.completionId !== data.completionId) continue;
      // Even a matching request ID cannot acknowledge a different token.
      if (candidate.completionId !== data.completionId) continue;
      index = i;
      break;
    }
    if (index === -1) return; // duplicate/late ACK is idempotent
    var pending = pendingReads[index];
    var sameCurrent = tokenFor(pending.sessionId) === pending.completionId;
    var ackToken = typeof data.currentCompletionId === 'string' && data.currentCompletionId ? data.currentCompletionId : undefined;
    var stale = ackToken !== undefined && ackToken !== pending.completionId;
    // A rejected read for a deleted/trimmed completion is terminal too: the
    // authority has no current completion and explicitly reports no unread.
    var obsolete = data.accepted === false && data.unread === false && ackToken === undefined;
    if (data.accepted || stale || obsolete) pendingReads.splice(index, 1);
    // A newer read-state wins over this ACK. In particular, a synchronous
    // Host bump must not let the old token erase the new completion.
    if (sameCurrent && pending.stateVersion === readStateVersion) {
      if (stale) {
        if (readCompletions === null) readCompletions = Object.create(null);
        readCompletions[pending.sessionId] = ackToken;
      }
      hostUnread[pending.sessionId] = data.unread === true;
      if (data.unread === true) unread[pending.sessionId] = true;
      else delete unread[pending.sessionId];
      notifyRead();
    }
    clearUnreadForSelection();
    flushReads();
  }

  function clearUnreadForSelection() {
    if (!isFrameVisible()) return;
    var current = currentSelection();
    if (current && unread[current] === true) queueRead(current);
  }

  function setUnreadState(ids, completions) {
    var next = Object.create(null);
    if (Array.isArray(ids)) {
      for (var i = 0; i < ids.length && i < 2000; i += 1) {
        if (typeof ids[i] === 'string' && ids[i] !== '' && ids[i].length <= 512) next[ids[i]] = true;
      }
    }
    hostUnread = next;
    readCompletions = normalizeReadCompletions(completions);
    if (readCompletions === null) {
      // Old Hosts do not ACK. A fresh legacy snapshot that omits this session
      // confirms it is no longer unread. Retire only tokenless pending reads;
      // do not clear a later reminder or infer acceptance for token reads.
      pendingReads = pendingReads.filter(function (pending) {
        return pending.completionId !== undefined || next[pending.sessionId] === true;
      });
    }
    readStateVersion += 1;
    readStateReady = true;
    unread = Object.create(null);
    var keys = Object.keys(next);
    for (var j = 0; j < keys.length; j += 1) {
      if (!pendingFor(keys[j], tokenFor(keys[j])) || (tokenFor(keys[j]) === undefined && !isFrameVisible())) unread[keys[j]] = true;
    }
    notifyRead();
    clearUnreadForSelection();
    flushReads();
  }

  // Embedding hides the remote left sidebar when the Host frames only the
  // conversation column. The Host sends set-embedded to switch a live page
  // between the two layouts without reloading it.
  var embedded = false;
  var originalColumns = null;
  var originalSidebarVisibility = null;
  var originalSidebarPointerEvents = null;
  var embedTimer = null;
  var sidebarObserver = null;
  var sidebarScheduled = false;

  function findSidebar() {
    // CSS-module prefixes change between DSH builds, so probe from the most
    // specific selector to the most generic. A miss only degrades pane
    // embedding (the remote sidebar stays visible); it never breaks driving
    // Sessions, which goes through the captured client Context.
    var selectors = [
      '[class*="_frame"] > [class*="_sidebarCol"]',
      '[class*="_sidebarCol"]',
      '[data-side="sidebar"]',
      '[data-shell-leading]',
      'aside',
      '[role="navigation"]'
    ];
    for (var i = 0; i < selectors.length; i += 1) {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  function ensureEmbeddedStyleTag() {
    try {
      if (!document.head || document.querySelector('style[data-dsh-md-pane-css="1"]')) return;
      var style = document.createElement('style');
      style.setAttribute('data-dsh-md-pane-css', '1');
      style.textContent =
        '[data-dsh-md-native-pane="1"] > [data-side="sidebar"],' +
        '[data-dsh-md-native-pane="1"] > [data-shell-leading],' +
        '[data-dsh-md-native-pane="1"] [data-conversation-header-leading] {' +
        '  display: none !important; pointer-events: none !important;' +
        '}';
      document.head.appendChild(style);
    } catch (error) {}
  }

  function applyEmbedded() {
    ensureEmbeddedStyleTag();
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
    cancelNavigation();
    captured = context;
    try { installGroupSync(context); } catch (error) {}
    try { installReadOverlay(context); } catch (error) {}
    var tries = 0;
    var finish = function () {
      if (captured !== context) return;
      tries += 1;
      var workspace = captured && captured.uiWorkspace;
      var selection = workspace && workspace.selection;
      var sessions = captured && captured.sessions;
      if (!workspace || !selection || !sessions || !sessions.list) {
        if (tries < 80) { setTimeout(finish, 50); return; }
        fail('the DSH workspace/session services were not captured');
        return;
      }
      if (typeof workspace.openSession !== 'function' || typeof sessions.binding !== 'function') {
        fail('Incompatible DSH version: native navigation requires the 0.2.1-rc.5 sessions.binding contract');
        return;
      }
      try { selection.subscribe(report); } catch (error) {}
      try { sessions.list.subscribe(report); } catch (error) {}
      readySent = true;
      send({ type: 'ready', deviceId: deviceId });
      report();
      reportTitle();
      sendTitle(true);
      sendVisibility(true);
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
      socket = new WebSocket(protocol + '//' + location.host + '/__md/bridge?device=' + encodeURIComponent(deviceId) + (clientId ? '&client=' + encodeURIComponent(clientId) : ''));
    } catch (error) {
      socket = null;
      schedule();
      return;
    }
    var connectedSocket = socket;
    socketGeneration += 1;
    navigationSeq = 0;
    socket.addEventListener('open', function () {
      if (socket !== connectedSocket) return;
      if (readySent) send({ type: 'ready', deviceId: deviceId });
      else if (failedReason) send({ type: 'failed', error: failedReason });
      report();
      reportTitle();
      sendTitle(true);
      sendVisibility(true);
      if (groupSyncInstalled) sendGroups();
    });
    socket.addEventListener('message', function (event) {
      if (socket !== connectedSocket) return;
      var data;
      try { data = JSON.parse(event.data); } catch (error) { return; }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'open-session' && typeof data.sessionId === 'string') openSession(data.sessionId, data.requestSeq);
      else if (data.type === 'refresh') refreshSessions();
      else if (data.type === 'set-embedded') setEmbedded(data.enabled === true);
      else if (data.type === 'group-expansion') applyGroupState(data.groups);
      else if (data.type === 'read-state') setUnreadState(data.unreadSessionIds, data.readCompletions);
      else if (data.type === 'read-ack') applyReadAck(data);
    });
    socket.addEventListener('close', function () {
      if (socket !== connectedSocket) return;
      cancelNavigation();
      socket = null;
      readStateReady = false;
      if (readRetryTimer !== null) { clearTimeout(readRetryTimer); readRetryTimer = null; }
      for (var i = 0; i < pendingReads.length; i += 1) pendingReads[i].nextAt = 0;
      // Force a fresh selection/title/visibility report on reconnect; the
      // previous socket may have gone away before the Host persisted them.
      lastSelection = null;
      lastSentTitle = null;
      lastSentVisibility = null;
      schedule();
    });
    socket.addEventListener('error', function () {
      try { connectedSocket.close(); } catch (error) {}
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
        // a changed shape reports incompatibility without replacing the native page.
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
    installClipboardFallback();
  } catch (error) {}

  try {
    installTitleReporter();
  } catch (error) {}

  try {
    installVisibilityTracking();
  } catch (error) {}

  try {
    installLoaderHook();
  } catch (error) {
    fail('the DSH client module loader could not be wrapped');
  }

  setTimeout(function () {
    if (!readySent) fail('Incompatible DSH version or unavailable client: the workspace service was not available within 10s');
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
function sanitizeReadCompletions(value) {
  const out = /* @__PURE__ */ Object.create(null);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  for (const [key, token] of Object.entries(value).slice(0, 2e3)) {
    if (key === "" || key.length > 512 || typeof token !== "string" || token === "" || token.length > 512) continue;
    out[key] = token;
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
    ...state.readCompletions !== void 0 ? [`window.__DSH_MD_READ_COMPLETIONS__ = ${jsonForInlineScript(sanitizeReadCompletions(state.readCompletions))};`] : [],
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
import { randomUUID as randomUUID3 } from "node:crypto";
import {
  createServer as createServer2,
  request as httpRequest2
} from "node:http";
import { request as httpsRequest2 } from "node:https";
import { brotliDecompress, gunzip, inflate } from "node:zlib";
import { promisify } from "node:util";
import { WebSocket, WebSocketServer } from "ws";
var PROXY_TOKEN_QUERY = "md_token";
var PROXY_COOKIE_PREFIX = "dsh-md-native-";
var LEGACY_CLIENT_ID = "legacy";
function bridgeClientId(value) {
  return value === void 0 || value === null || value === "" ? LEGACY_CLIENT_ID : value;
}
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
function sanitizeBridgeTitle(value) {
  if (typeof value !== "string") return void 0;
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  return text === "" ? void 0 : text;
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
  startPromise;
  startAbort;
  generation = 0;
  /** Includes requests waiting on authentication, HTTP streams and WS handshakes. */
  cancelUpstreams = /* @__PURE__ */ new Set();
  localPort;
  sockets = /* @__PURE__ */ new Set();
  stopped = false;
  lastAuthAttemptAt = 0;
  lastAuthRecoveryAt = 0;
  authRecoveryInFlight;
  token = randomUUID3().replaceAll("-", "");
  bridgeServer;
  // Cookies ignore ports: one name per proxy prevents device A/B overwriting
  // each other's loopback bootstrap cookie in the same browser cookie jar.
  cookieName = `${PROXY_COOKIE_PREFIX}${randomUUID3().replaceAll("-", "")}`;
  bridgeClients = /* @__PURE__ */ new Map();
  clientStates = /* @__PURE__ */ new Map();
  bridgeVisibility = /* @__PURE__ */ new Map();
  readyBridgeClients = /* @__PURE__ */ new Set();
  /** Host-owned workspace fold state, applied before the remote page's first render. */
  groupState = {};
  /** Host-owned raw Session IDs whose completion is unread. */
  unreadState = [];
  readCompletions;
  updateDevice(device) {
    this.device = device;
    this.refreshHostState(device);
  }
  refreshHostState(device) {
    this.groupState = sanitizeGroupState(this.hooks.getGroupState?.(device.id));
    this.unreadState = this.hooks.getUnreadState?.(device.id) ?? [];
    const completions = this.hooks.getReadCompletions?.(device.id);
    this.readCompletions = completions === void 0 ? void 0 : sanitizeReadCompletions(completions);
  }
  proxyUrl() {
    if (this.localPort === void 0) return void 0;
    return `http://127.0.0.1:${this.localPort}/?${PROXY_TOKEN_QUERY}=${this.token}`;
  }
  proxyOrigin() {
    return this.localPort === void 0 ? void 0 : `http://127.0.0.1:${this.localPort}`;
  }
  allowedFramingAncestors() {
    const local = this.localOrigin?.();
    if (local === void 0 || local === "") return [];
    const origins = /* @__PURE__ */ new Set([local]);
    try {
      const parsed = new URL(local);
      const host = parsed.hostname.toLowerCase();
      if (host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1") {
        const portSuffix = parsed.port !== "" ? `:${parsed.port}` : "";
        origins.add(`${parsed.protocol}//127.0.0.1${portSuffix}`);
        origins.add(`${parsed.protocol}//localhost${portSuffix}`);
        origins.add(`${parsed.protocol}//[::1]${portSuffix}`);
      }
    } catch {
    }
    return [...origins];
  }
  isAllowedCallerOrigin(origin) {
    if (origin === void 0 || origin === "") return true;
    const allowed = new Set(this.allowedFramingAncestors());
    const proxyOrigin = this.proxyOrigin();
    if (proxyOrigin !== void 0) {
      allowed.add(proxyOrigin);
      try {
        const parsed = new URL(proxyOrigin);
        const portSuffix = parsed.port !== "" ? `:${parsed.port}` : "";
        allowed.add(`${parsed.protocol}//127.0.0.1${portSuffix}`);
        allowed.add(`${parsed.protocol}//localhost${portSuffix}`);
        allowed.add(`${parsed.protocol}//[::1]${portSuffix}`);
      } catch {
      }
    }
    return allowed.has(origin);
  }
  port() {
    return this.localPort;
  }
  start(preferredPort) {
    if (this.startPromise !== void 0) return this.startPromise;
    if (this.server !== void 0 || this.stopped) return Promise.resolve();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.startAbort = controller;
    const server = createServer2((req, res) => {
      void this.handleHttp(req, res).catch((error) => {
        this.respondProxyError(res, error);
      });
    });
    this.server = server;
    server.on("upgrade", (req, socket, head) => {
      try {
        const parsed = parseOriginForm(req.url);
        if (parsed !== void 0 && isNativeBridgeSocketPath(parsed.pathname)) {
          this.handleBridgeUpgrade(req, socket, head);
          return;
        }
        this.handleUpgrade(req, socket, head);
      } catch {
        socket.destroy();
      }
    });
    server.on("connection", (socket) => {
      if (this.stopped) {
        socket.destroy();
        return;
      }
      this.sockets.add(socket);
      socket.once("close", () => this.sockets.delete(socket));
    });
    const listenOn = (port) => new Promise((resolve2, reject) => {
      const cleanup = () => {
        server.off("listening", onListening);
        server.off("error", onError);
        controller.signal.removeEventListener("abort", onAbort);
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const onListening = () => {
        cleanup();
        resolve2();
      };
      const onAbort = () => {
        cleanup();
        resolve2();
      };
      if (controller.signal.aborted) {
        resolve2();
        return;
      }
      server.once("error", onError);
      server.once("listening", onListening);
      controller.signal.addEventListener("abort", onAbort, { once: true });
      try {
        server.listen({ port, host: "127.0.0.1", signal: controller.signal });
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
    const promise = (async () => {
      try {
        const preferred = typeof preferredPort === "number" && Number.isInteger(preferredPort) && preferredPort > 0 && preferredPort <= 65535 ? preferredPort : void 0;
        if (preferred !== void 0) {
          try {
            await listenOn(preferred);
          } catch (error) {
            if (this.stopped || generation !== this.generation) return;
            if (error.code !== "EADDRINUSE") throw error;
            await listenOn(0);
          }
        } else {
          await listenOn(0);
        }
        if (this.stopped || generation !== this.generation) {
          server.close();
          return;
        }
        const addr = server.address();
        if (addr !== null && typeof addr === "object") this.localPort = addr.port;
        this.bridgeServer = new WebSocketServer({ noServer: true });
        if (this.localPort !== void 0) {
          try {
            this.hooks.onPortAllocated?.(this.device.id, this.localPort);
          } catch {
          }
        }
      } catch (error) {
        controller.abort();
        server.close();
        if (this.server === server) this.server = void 0;
        if (!this.stopped) throw error;
      } finally {
        if (this.startAbort === controller) this.startAbort = void 0;
        this.startPromise = void 0;
      }
    })();
    this.startPromise = promise;
    return promise;
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    ++this.generation;
    this.startAbort?.abort();
    for (const cancel of [...this.cancelUpstreams]) cancel();
    this.cancelUpstreams.clear();
    for (const [clientId, state] of [...this.clientStates]) {
      this.clearBridgeTimer(clientId);
      try {
        if (state.visible) {
          state.visible = false;
          this.hooks.onBridgeVisibility?.(this.device.id, false, clientId);
        }
        if (state.title !== void 0) {
          state.title = void 0;
          this.hooks.onBridgeTitle?.(this.device.id, void 0, clientId);
        }
        this.resetBridgeSelection(clientId);
        this.setBridgeState("idle", void 0, clientId);
      } catch {
      }
    }
    for (const client of this.bridgeClients.keys()) {
      try {
        client.terminate();
      } catch {
      }
    }
    this.bridgeClients.clear();
    this.bridgeServer?.close();
    this.bridgeServer = void 0;
    this.bridgeVisibility.clear();
    this.clientStates.clear();
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
  /** Keep recent disconnected panes/pending navigation without evicting live bridges. */
  trimClientStates(protectedClientId) {
    const live = new Set(this.bridgeClients.values());
    let offline = [...this.clientStates.keys()].filter((id) => !live.has(id)).length;
    for (const id of this.clientStates.keys()) {
      if (offline <= 256) break;
      if (id === protectedClientId || live.has(id)) continue;
      this.clearBridgeTimer(id);
      this.clientStates.delete(id);
      offline--;
    }
  }
  clientState(clientId = LEGACY_CLIENT_ID) {
    let state = this.clientStates.get(clientId);
    if (state === void 0) state = { state: "idle", visible: false, embedded: false };
    this.clientStates.delete(clientId);
    this.clientStates.set(clientId, state);
    this.trimClientStates(clientId);
    return state;
  }
  /** Current bridge lifecycle for this client only. */
  bridgeSnapshot(clientId = LEGACY_CLIENT_ID) {
    const state = this.clientStates.get(clientId);
    return {
      state: state?.state ?? "idle",
      ...state?.error !== void 0 ? { error: state.error } : {},
      ...state?.sessionId !== void 0 ? { sessionId: state.sessionId } : {},
      ...state?.title !== void 0 ? { title: state.title } : {}
    };
  }
  /** Queue/replay navigation only within the requesting browser client. */
  openSession(sessionId2, clientId = LEGACY_CLIENT_ID, requestSeq) {
    if (requestSeq !== void 0 && (!Number.isSafeInteger(requestSeq) || requestSeq < 0)) return;
    const state = this.clientState(clientId);
    state.pendingOpenSession = sessionId2;
    state.pendingRequestSeq = requestSeq;
    this.sendToBridge({ type: "open-session", sessionId: sessionId2, ...requestSeq === void 0 ? {} : { requestSeq } }, clientId);
  }
  /** Ask the framed page to refresh its own Session list (after fork/create). */
  requestRefresh() {
    this.sendToBridge({ type: "refresh" });
  }
  /** Switch the same framed page between embedded pane and full native mode. */
  setEmbedded(enabled, clientId = LEGACY_CLIENT_ID) {
    const state = this.clientState(clientId);
    if (state.embedded === enabled) return;
    state.embedded = enabled;
    this.sendToBridge({ type: "set-embedded", enabled }, clientId);
  }
  /** Apply Host-owned fold state to the framed page and every open client. */
  setGroupState(groups) {
    const next = sanitizeGroupState(groups);
    if (sameGroupState(this.groupState, next)) return;
    this.groupState = next;
    this.sendToBridge({ type: "group-expansion", groups: next });
  }
  /** Apply Host-owned unread state to the framed page. */
  setUnreadState(unreadSessionIds, readCompletions) {
    const next = [...unreadSessionIds];
    const tokens = readCompletions === void 0 ? void 0 : sanitizeReadCompletions(readCompletions);
    const sameTokens = tokens === void 0 ? this.readCompletions === void 0 : this.readCompletions !== void 0 && Object.keys(tokens).length === Object.keys(this.readCompletions).length && Object.keys(tokens).every((id) => tokens[id] === this.readCompletions?.[id]);
    if (sameTokens && next.length === this.unreadState.length && next.every((id, index) => id === this.unreadState[index])) {
      return;
    }
    this.unreadState = next;
    this.readCompletions = tokens;
    this.sendToBridge({ type: "read-state", unreadSessionIds: next, ...tokens !== void 0 ? { readCompletions: tokens } : {} });
  }
  /** Reset only this client's cached command target (device switched away). */
  clearPendingSession(clientId = LEGACY_CLIENT_ID) {
    const state = this.clientStates.get(clientId);
    if (state !== void 0) {
      state.pendingOpenSession = void 0;
      state.pendingRequestSeq = void 0;
    }
  }
  sendToSocket(client, message) {
    if (client.readyState !== WebSocket.OPEN) return;
    try {
      client.send(JSON.stringify(message));
    } catch {
    }
  }
  sendToBridge(message, clientId) {
    if (clientId === void 0 && (message.type === "open-session" || message.type === "set-embedded")) return;
    for (const [client, owner] of this.bridgeClients) {
      if (clientId !== void 0 && owner !== clientId) continue;
      if (message.type === "open-session" && this.clientStates.get(owner)?.navigationOwner !== client) continue;
      this.sendToSocket(client, message);
    }
  }
  setBridgeState(state, error, clientId = LEGACY_CLIENT_ID) {
    const current = this.clientState(clientId);
    const nextError = error?.trim() === "" ? void 0 : error;
    if (current.state === state && current.error === nextError) return;
    current.state = state;
    current.error = nextError;
    this.hooks.onBridgeState?.(this.device.id, state, nextError, clientId);
  }
  clearBridgeTimer(clientId = LEGACY_CLIENT_ID) {
    const state = this.clientStates.get(clientId);
    if (state?.readyTimer !== void 0) {
      clearTimeout(state.readyTimer);
      state.readyTimer = void 0;
    }
  }
  armBridgeTimer(clientId = LEGACY_CLIENT_ID) {
    this.clearBridgeTimer(clientId);
    const state = this.clientState(clientId);
    const timer = setTimeout(() => {
      state.readyTimer = void 0;
      if (state.state === "ready") return;
      this.setBridgeState("failed", "the framed page never reported a ready bridge", clientId);
    }, BRIDGE_READY_TIMEOUT_MS);
    timer.unref?.();
    state.readyTimer = timer;
  }
  respondProxyError(res, error) {
    if (this.stopped || res.destroyed || res.writableEnded) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(502, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(renderUnavailableHtml(this.device.name, error instanceof Error ? error.message : String(error)));
  }
  async handleHttp(req, res) {
    if (this.stopped) {
      res.destroy();
      return;
    }
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
    if (!this.isAllowedCallerOrigin(req.headers.origin)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("Native proxy caller origin is not allowed");
      return;
    }
    const rawTarget = stripProxyTokenFromRawTarget(req.url ?? "/");
    const requestUrl = new URL(req.url ?? "/", proxyOrigin);
    const clientId = bridgeClientId(requestUrl.searchParams.get("md_client"));
    const queryToken = requestUrl.searchParams.get(PROXY_TOKEN_QUERY);
    const cookieToken = readCookie(req.headers.cookie, this.cookieName);
    if (queryToken === this.token && cookieToken !== this.token) {
      res.writeHead(302, {
        location: rawTarget,
        "set-cookie": `${this.cookieName}=${this.token}; Path=/; HttpOnly; SameSite=Lax`,
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
        unread: this.unreadState,
        readCompletions: this.readCompletions
      }));
      return;
    }
    let cancelled = false;
    const resources = /* @__PURE__ */ new Set();
    const cleanups = [];
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      this.cancelUpstreams.delete(cancel);
      req.off("aborted", cancel);
      res.off("close", cancel);
      res.off("finish", cancel);
      for (const cleanup of cleanups) cleanup();
      for (const resource of resources) resource.destroy();
      resources.clear();
    };
    const active = () => !cancelled && !this.stopped && !req.aborted && !res.destroyed && !res.writableEnded;
    const fail = (error) => {
      if (!active()) {
        cancel();
        return;
      }
      this.respondProxyError(res, error);
      cancel();
    };
    this.cancelUpstreams.add(cancel);
    req.once("aborted", cancel);
    req.once("error", cancel);
    res.once("close", cancel);
    res.once("finish", cancel);
    res.once("error", cancel);
    try {
      await this.ensureAuthenticated(upstreamBase);
      if (!active()) {
        cancel();
        return;
      }
    } catch (error) {
      fail(error);
      return;
    }
    try {
      const upstream = splitUpstreamBase(upstreamBase);
      const upstreamPath = `${upstream.prefix}${rawTarget}`;
      const isHttps = upstream.url.protocol === "https:";
      const authority = resolveRemoteAuthority(this.device);
      const reqFn = isHttps ? httpsRequest2 : httpRequest2;
      const rejectUnauthorized = this.device.transport.kind === "direct" ? this.device.transport.rejectUnauthorized !== false : true;
      const method = req.method ?? "GET";
      const injectHtml = isHtmlNavigation(req);
      const forward = (retried) => {
        if (!active()) return;
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
            resources.add(proxyRes);
            proxyRes.once("close", () => resources.delete(proxyRes));
            proxyRes.on("error", fail);
            let discarded = false;
            proxyRes.once("aborted", () => {
              if (!discarded) fail(new Error("The upstream response was aborted"));
            });
            if (!active()) {
              proxyRes.destroy();
              return;
            }
            try {
              const status = proxyRes.statusCode ?? 502;
              if (status === 401 || status === 403) {
                discarded = true;
                proxyRes.destroy();
                proxyReq.destroy();
                if (!retried && (method === "GET" || method === "HEAD")) {
                  void this.recoverAuthentication(upstreamBase, status).then((recovered) => {
                    if (!active()) return;
                    if (recovered) {
                      forward(true);
                      return;
                    }
                    this.respondAuthRequired(res, status);
                  }).catch(fail);
                  return;
                }
                void this.recoverAuthentication(upstreamBase, status).then((recovered) => {
                  if (!active()) return;
                  if (!recovered) {
                    this.hooks.onAuthState?.(
                      this.device.id,
                      "required",
                      `Remote DSH returned HTTP ${status}`
                    );
                  }
                }).catch(fail);
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
                  const cleaned = (Array.isArray(val) ? val.join("; ") : val).replace(/frame-ancestors[^;]*;?/gi, "").replace(/;\s*$/u, "").trim();
                  const allowedAncestors = this.allowedFramingAncestors();
                  const framing = allowedAncestors.length > 0 ? `frame-ancestors 'self' ${allowedAncestors.join(" ")}` : "";
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
                this.setBridgeState("loading", void 0, clientId);
                this.armBridgeTimer(clientId);
                cleanups.push(this.streamInjectedHtml(proxyRes, res, status, resHeaders, clientId));
                return;
              }
              res.writeHead(status, resHeaders);
              proxyRes.pipe(res);
            } catch (error) {
              fail(error);
            }
          }
        );
        resources.add(proxyReq);
        proxyReq.once("close", () => resources.delete(proxyReq));
        cleanups.push(() => {
          req.unpipe(proxyReq);
        });
        proxyReq.on("error", fail);
        if (retried || method === "GET" || method === "HEAD") {
          proxyReq.end();
        } else {
          req.pipe(proxyReq);
        }
      };
      forward(false);
    } catch (error) {
      fail(error);
    }
  }
  /**
   * Buffer one HTML document, inject the bridge script and forward it.
   *
   * The response is held only for documents (the SPA shell); assets keep the
   * streaming path. Compression is normally already removed by
   * `accept-encoding: identity`, but a proxy in front of DSH may still compress,
   * so gzip/deflate/br are decoded before injection.
   */
  streamInjectedHtml(proxyRes, res, status, baseHeaders, clientId) {
    const chunks = [];
    let size = 0;
    let finished = false;
    const cleanup = () => {
      chunks.length = 0;
      proxyRes.off("data", onData);
      proxyRes.off("end", onEnd);
      proxyRes.off("error", onError);
      proxyRes.off("aborted", onError);
      if (!finished) this.clearBridgeTimer(clientId);
    };
    const onError = () => {
      if (finished) return;
      finished = true;
      cleanup();
      this.clearBridgeTimer(clientId);
      this.resetBridgeSelection(clientId);
      this.setBridgeState("failed", "the remote HTML document was interrupted", clientId);
      res.destroy();
    };
    const onData = (chunk) => {
      size += chunk.byteLength;
      if (size > MAX_INJECTABLE_HTML_BYTES) {
        finished = true;
        cleanup();
        this.clearBridgeTimer(clientId);
        this.resetBridgeSelection(clientId);
        this.setBridgeState("failed", "the remote HTML document was too large to inject the native bridge", clientId);
        res.writeHead(502, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(renderUnavailableHtml(this.device.name, "The remote page is too large to inject the native bridge."));
        proxyRes.destroy();
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (finished || res.destroyed || this.stopped) {
        cleanup();
        return;
      }
      finished = true;
      const raw = Buffer.concat(chunks);
      cleanup();
      void (async () => {
        const headers = { ...baseHeaders };
        const encoding = headerValueOf(proxyRes.headers, "content-encoding");
        let body = raw;
        let injected = false;
        const decoded = await decodeHtmlBody(raw, encoding);
        if (res.destroyed || this.stopped) return;
        if (decoded !== void 0) {
          body = Buffer.from(injectNativeBridge(decoded.toString("utf8"), { deviceId: this.device.id }), "utf8");
          if (body.byteLength > MAX_INJECTABLE_HTML_BYTES) throw new Error("injected HTML exceeded output limit");
          removeHeader(headers, "content-encoding");
          injected = true;
        }
        if (!injected) {
          this.clearBridgeTimer(clientId);
          this.resetBridgeSelection(clientId);
          this.setBridgeState(
            "failed",
            `the remote HTML document used an unsupported content-encoding (${encoding ?? "unknown"})`,
            clientId
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
      })().catch(() => {
        this.clearBridgeTimer(clientId);
        this.resetBridgeSelection(clientId);
        this.setBridgeState("failed", "the remote HTML document could not be decoded within its output limit", clientId);
        if (!res.destroyed && !res.headersSent && !this.stopped) {
          res.writeHead(502, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          res.end(renderUnavailableHtml(this.device.name, "The remote page could not be decoded safely."));
        }
      });
    };
    proxyRes.on("data", onData);
    proxyRes.prependOnceListener("error", onError);
    proxyRes.prependOnceListener("aborted", onError);
    proxyRes.once("end", onEnd);
    return cleanup;
  }
  /** Validate one same-origin bridge upgrade and hand it to the WebSocket server. */
  handleBridgeUpgrade(req, clientSocket, head) {
    const parsed = parseOriginForm(req.url);
    const proxyOrigin = this.proxyOrigin();
    const cookieToken = readCookie(req.headers.cookie, this.cookieName);
    if (parsed === void 0 || proxyOrigin === void 0 || cookieToken !== this.token) {
      clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    if (req.headers["sec-fetch-site"] === "cross-site") {
      clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const origin = req.headers.origin;
    if (!this.isAllowedCallerOrigin(origin)) {
      clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const bridgeServer = this.bridgeServer;
    if (bridgeServer === void 0) {
      clientSocket.destroy();
      return;
    }
    bridgeServer.handleUpgrade(req, clientSocket, head, (ws) => {
      this.attachBridge(ws, bridgeClientId(new URLSearchParams(parsed.search).get("client")));
    });
  }
  /** Own one framed page's bridge socket, its readiness and its selection reports. */
  attachBridge(ws, clientId) {
    const state = this.clientState(clientId);
    const ownerChanged = state.navigationOwner !== ws;
    state.navigationOwner = ws;
    this.bridgeClients.set(ws, clientId);
    this.bridgeVisibility.set(ws, false);
    if (ownerChanged) {
      this.clearBridgeTimer(clientId);
      this.setBridgeState("loading", void 0, clientId);
      this.armBridgeTimer(clientId);
    }
    ws.on("message", (raw) => {
      if (this.stopped || !this.bridgeClients.has(ws)) return;
      let message;
      try {
        const parsed = JSON.parse(raw.toString());
        if (typeof parsed !== "object" || parsed === null) return;
        message = parsed;
      } catch {
        return;
      }
      if (state.navigationOwner !== ws && (message.type === "failed" || message.type === "navigation" || message.type === "selection")) return;
      if (message.type === "ready") {
        this.readyBridgeClients.add(ws);
        if (state.navigationOwner === ws) {
          this.clearBridgeTimer(clientId);
          this.setBridgeState("ready", void 0, clientId);
        }
        this.sendToSocket(ws, { type: "set-embedded", enabled: state.embedded });
        this.sendToSocket(ws, { type: "group-expansion", groups: this.groupState });
        const tokens = this.hooks.getReadCompletions?.(this.device.id) ?? this.readCompletions;
        this.sendToSocket(ws, {
          type: "read-state",
          unreadSessionIds: this.hooks.getUnreadState?.(this.device.id) ?? this.unreadState,
          ...tokens !== void 0 ? { readCompletions: sanitizeReadCompletions(tokens) } : {}
        });
        if (state.navigationOwner === ws && state.pendingOpenSession !== void 0) {
          this.sendToSocket(ws, {
            type: "open-session",
            sessionId: state.pendingOpenSession,
            ...state.pendingRequestSeq === void 0 ? {} : { requestSeq: state.pendingRequestSeq }
          });
        }
        return;
      }
      if (message.type === "failed") {
        this.clearBridgeTimer(clientId);
        this.setBridgeState("failed", message.error ?? "the framed page could not start the native bridge", clientId);
        return;
      }
      if (message.type === "navigation") {
        if (typeof message.sessionId !== "string" || state.pendingOpenSession === void 0 || message.sessionId !== state.pendingOpenSession || !Number.isSafeInteger(message.requestSeq) || message.requestSeq < 0 || state.pendingRequestSeq !== void 0 && message.requestSeq !== state.pendingRequestSeq || !["loading", "open", "error"].includes(message.openState)) return;
        const error = typeof message.error === "string" ? message.error.slice(0, 2e3) : void 0;
        this.hooks.onBridgeNavigation?.(this.device.id, {
          sessionId: message.sessionId,
          requestSeq: message.requestSeq,
          openState: message.openState,
          ...error === void 0 ? {} : { error }
        }, clientId);
        return;
      }
      if (message.type === "selection") {
        const sessionId2 = typeof message.sessionId === "string" && message.sessionId !== "" ? message.sessionId : void 0;
        if (sessionId2 === state.sessionId) return;
        state.sessionId = sessionId2;
        this.hooks.onBridgeSelection?.(this.device.id, sessionId2, clientId);
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
        const sessionId2 = typeof message.sessionId === "string" ? message.sessionId : "";
        if (sessionId2 === "" || sessionId2.length > 512) return;
        if (message.completionId !== void 0 && (typeof message.completionId !== "string" || message.completionId === "" || message.completionId.length > 512)) return;
        const completionId = typeof message.completionId === "string" && message.completionId !== "" && message.completionId.length <= 512 ? message.completionId : void 0;
        const requestId = typeof message.requestId === "string" && message.requestId !== "" && message.requestId.length <= 512 ? message.requestId : void 0;
        let result;
        try {
          result = this.hooks.onBridgeRead?.(this.device.id, sessionId2, completionId) ?? { accepted: true, unread: false };
        } catch {
          const tokens = this.hooks.getReadCompletions?.(this.device.id) ?? this.readCompletions;
          const currentCompletionId = tokens?.[sessionId2];
          result = {
            accepted: false,
            unread: (this.hooks.getUnreadState?.(this.device.id) ?? this.unreadState).includes(sessionId2),
            ...currentCompletionId !== void 0 ? { currentCompletionId } : {}
          };
        }
        this.sendToSocket(ws, {
          type: "read-ack",
          sessionId: sessionId2,
          ...requestId !== void 0 ? { requestId } : {},
          ...completionId !== void 0 ? { completionId } : {},
          ...result
        });
        return;
      }
      if (message.type === "title") {
        const title = sanitizeBridgeTitle(message.title);
        if (title === state.title) return;
        state.title = title;
        this.hooks.onBridgeTitle?.(this.device.id, title, clientId);
        return;
      }
      if (message.type === "visibility") {
        this.updateBridgeVisibility(ws, message.visible === true);
      }
    });
    ws.on("close", () => {
      this.bridgeClients.delete(ws);
      this.bridgeVisibility.delete(ws);
      this.readyBridgeClients.delete(ws);
      if (this.stopped) return;
      const wasOwner = state.navigationOwner === ws;
      const remaining = wasOwner ? [...this.bridgeClients].filter(([, owner]) => owner === clientId).map(([socket]) => socket) : [];
      const nextOwner = remaining.at(-1);
      if (wasOwner) {
        state.navigationOwner = nextOwner;
        this.clearBridgeTimer(clientId);
        if (nextOwner !== void 0) {
          if (this.readyBridgeClients.has(nextOwner)) this.setBridgeState("ready", void 0, clientId);
          else {
            this.setBridgeState("loading", void 0, clientId);
            this.armBridgeTimer(clientId);
          }
        }
      }
      this.trimClientStates(clientId);
      this.reportBridgeVisibility(clientId);
      if (!wasOwner || nextOwner !== void 0) return;
      if (state.title !== void 0) {
        state.title = void 0;
        this.hooks.onBridgeTitle?.(this.device.id, void 0, clientId);
      }
      this.resetBridgeSelection(clientId);
      if (state.state === "ready" || state.state === "loading") {
        this.setBridgeState("idle", void 0, clientId);
      }
    });
    ws.on("error", () => {
      try {
        ws.close();
      } catch {
      }
    });
  }
  reportBridgeVisibility(clientId) {
    const state = this.clientState(clientId);
    const visible = [...this.bridgeClients].some(([ws, owner]) => owner === clientId && this.bridgeVisibility.get(ws) === true);
    if (visible === state.visible) return;
    state.visible = visible;
    this.hooks.onBridgeVisibility?.(this.device.id, visible, clientId);
  }
  updateBridgeVisibility(ws, visible) {
    if (this.bridgeVisibility.get(ws) === visible) return;
    this.bridgeVisibility.set(ws, visible);
    const clientId = this.bridgeClients.get(ws);
    if (clientId !== void 0) this.reportBridgeVisibility(clientId);
  }
  resetBridgeSelection(clientId = LEGACY_CLIENT_ID) {
    const state = this.clientStates.get(clientId);
    if (state?.sessionId === void 0) return;
    state.sessionId = void 0;
    this.hooks.onBridgeSelection?.(this.device.id, void 0, clientId);
  }
  async ensureAuthenticated(upstreamBase) {
    const now = Date.now();
    if (now - this.lastAuthAttemptAt < 3e4) return;
    this.lastAuthAttemptAt = now;
    const result = await this.authManager.ensureAuthenticated(this.device, upstreamBase);
    if (this.stopped) return;
    if (!result.ok) {
      this.hooks.onAuthState?.(this.device.id, "required", result.error);
    }
  }
  async recoverAuthentication(upstreamBase, status) {
    if (this.authRecoveryInFlight !== void 0) return this.authRecoveryInFlight;
    const now = Date.now();
    if (now - this.lastAuthRecoveryAt < 5e3) return false;
    this.lastAuthRecoveryAt = now;
    const promise = (async () => {
      try {
        this.authManager.invalidate(this.device.id);
        const result = await this.authManager.ensureAuthenticated(this.device, upstreamBase, true);
        if (this.stopped) return false;
        if (result.ok && this.authManager.getAuthHeaders(this.device)["Cookie"] !== void 0) {
          this.hooks.onAuthState?.(this.device.id, "ok");
          return true;
        }
        this.hooks.onAuthState?.(
          this.device.id,
          status === 401 ? "required" : "error",
          result.ok ? `Remote DSH returned HTTP ${status}` : result.error
        );
        return false;
      } finally {
        this.authRecoveryInFlight = void 0;
      }
    })();
    this.authRecoveryInFlight = promise;
    return promise;
  }
  respondAuthRequired(res, status) {
    if (this.stopped || res.destroyed || res.writableEnded) return;
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
    if (this.stopped || clientSocket.destroyed) {
      clientSocket.destroy();
      return;
    }
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
    const cookieToken = readCookie(req.headers.cookie, this.cookieName);
    if (proxyOrigin === void 0 || cookieToken !== this.token) {
      clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    if (req.headers["sec-fetch-site"] === "cross-site") {
      clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const origin = req.headers.origin;
    if (!this.isAllowedCallerOrigin(origin)) {
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
    let cancelled = false;
    let upstreamSocket;
    let upstreamResponse;
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      this.cancelUpstreams.delete(cancel);
      clientSocket.off("close", cancel);
      clientSocket.off("end", cancel);
      upstreamSocket?.unpipe(clientSocket);
      if (upstreamSocket !== void 0) clientSocket.unpipe(upstreamSocket);
      upstreamSocket?.destroy();
      upstreamResponse?.destroy();
      proxyReq.destroy();
      clientSocket.destroy();
    };
    const proxyReq = reqFn(upstream.url, {
      method: "GET",
      path: upstreamPath,
      headers: outHeaders,
      ...isHttps ? { rejectUnauthorized } : {}
    });
    this.cancelUpstreams.add(cancel);
    clientSocket.once("close", cancel);
    clientSocket.once("end", cancel);
    clientSocket.on("error", cancel);
    proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
      upstreamResponse = proxyRes;
      upstreamSocket = proxySocket;
      proxySocket.on("error", cancel);
      proxySocket.once("close", cancel);
      proxySocket.once("end", cancel);
      if (cancelled || this.stopped || clientSocket.destroyed) {
        cancel();
        proxySocket.destroy();
        return;
      }
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
    });
    proxyReq.on("response", (proxyRes) => {
      upstreamResponse = proxyRes;
      proxyRes.on("error", cancel);
      if (cancelled || this.stopped || clientSocket.destroyed) {
        proxyRes.destroy();
        cancel();
        return;
      }
      const status = proxyRes.statusCode ?? 403;
      if (status === 401 || status === 403) {
        void this.recoverAuthentication(upstreamBase, status).catch(() => {
        });
      }
      proxyRes.destroy();
      clientSocket.end(`HTTP/1.1 ${status} ${proxyRes.statusMessage ?? "Rejected"}\r
Connection: close\r
\r
`);
    });
    proxyReq.on("error", cancel);
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
    } else {
      proxy.updateDevice(device);
    }
    try {
      await proxy.start(device.nativeProxyPort);
    } catch {
      proxy.stop();
      if (this.proxies.get(device.id) === proxy) this.proxies.delete(device.id);
      return void 0;
    }
    if (this.proxies.get(device.id) !== proxy) return void 0;
    return proxy.proxyUrl();
  }
  proxyUrl(deviceId) {
    return this.proxies.get(deviceId)?.proxyUrl();
  }
  /** Current injected-bridge lifecycle for one device. */
  bridgeSnapshot(deviceId, clientId = LEGACY_CLIENT_ID) {
    return this.proxies.get(deviceId)?.bridgeSnapshot(clientId) ?? { state: "idle" };
  }
  /** Navigate the framed page to one raw remote Session (queued until ready). */
  openSession(deviceId, sessionId2, clientId = LEGACY_CLIENT_ID, requestSeq) {
    const proxy = this.proxies.get(deviceId);
    if (proxy === void 0) return false;
    proxy.openSession(sessionId2, clientId, requestSeq);
    return true;
  }
  /** Ask the framed page to refresh its own Session catalog. */
  requestRefresh(deviceId) {
    const proxy = this.proxies.get(deviceId);
    if (proxy === void 0) return false;
    proxy.requestRefresh();
    return true;
  }
  /** Push Host-owned fold state to the device's framed page(s). */
  setGroupState(deviceId, groups) {
    this.proxies.get(deviceId)?.setGroupState(groups);
  }
  /** Push Host-owned unread Session IDs to the device's framed page(s). */
  setUnreadState(deviceId, unreadSessionIds, readCompletions) {
    this.proxies.get(deviceId)?.setUnreadState(unreadSessionIds, readCompletions);
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
var gunzipAsync = promisify(gunzip);
var inflateAsync = promisify(inflate);
var brotliDecompressAsync = promisify(brotliDecompress);
async function decodeHtmlBody(raw, encoding) {
  const normalized = (encoding ?? "").trim().toLowerCase();
  if (normalized === "" || normalized === "identity") return raw;
  const options = { maxOutputLength: MAX_INJECTABLE_HTML_BYTES };
  if (normalized === "gzip" || normalized === "x-gzip") return await gunzipAsync(raw, options);
  if (normalized === "deflate") return await inflateAsync(raw, options);
  if (normalized === "br") return await brotliDecompressAsync(raw, options);
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
      "\u8BF7\u5728 DSH \u4E2D\u6253\u5F00\u300C\u8BBE\u7F6E \u2192 \u591A\u8BBE\u5907\u300D\uFF0C\u9009\u62E9\u8BE5\u8BBE\u5907\u540E\u8F93\u5165 dsh web \u542F\u52A8\u94FE\u63A5/Token\uFF0C\u6216\u70B9\u51FB\u300C\u901A\u8FC7 SSH \u81EA\u52A8\u4FEE\u590D\u300D\u91CD\u65B0\u7B7E\u53D1 Cookie\u3002",
      `The remote DSH rejected this credential (HTTP ${String(status)}). Open Settings \u2192 Multi-Device, pick this device, then paste a launch token or repair the cookie over SSH.`
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
      "\u8BF7\u4ECE DSH \u7684\u300C\u8BBE\u7F6E \u2192 \u591A\u8BBE\u5907\u300D\u91CD\u65B0\u6253\u5F00\u6216\u5237\u65B0\u8BE5\u8BBE\u5907\u3002",
      "Reopen or reload the device from Settings \u2192 Multi-Device in DSH."
    ],
    retry: false
  });
}
function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// src/host/read-state.ts
import { randomUUID as randomUUID4 } from "node:crypto";
var READ_STATE_ENTRY_LIMIT = 2e3;
var READ_TOUCH_INTERVAL_MS = 2e3;
function cursor(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 ? value : void 0;
}
function parseSessionReadState(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
  const raw = value;
  if (typeof raw.unread !== "boolean") return void 0;
  const at = typeof raw.at === "number" && Number.isFinite(raw.at) ? Math.max(0, Math.trunc(raw.at)) : 0;
  const completionId = cursor(raw.completionId);
  const readCompletionId = cursor(raw.readCompletionId);
  const entry = {
    unread: raw.deleted === true ? false : raw.unread,
    at,
    ...completionId === void 0 ? {} : { completionId },
    ...readCompletionId === void 0 ? {} : { readCompletionId },
    ...raw.deleted === true ? { deleted: true } : {}
  };
  if (completionId !== void 0 && (!entry.unread || readCompletionId === completionId)) {
    return { ...entry, unread: false, readCompletionId: completionId };
  }
  return entry;
}
function mergeSessionReadState(current, incoming) {
  if (current?.deleted === true) return current;
  if (current === void 0) return incoming;
  if (current.completionId !== void 0) {
    if (incoming.completionId !== current.completionId) return current;
    if (incoming.deleted === true) return incoming;
    const read = !current.unread || !incoming.unread || current.readCompletionId === current.completionId || incoming.readCompletionId === current.completionId;
    return {
      ...current,
      at: Math.max(current.at, incoming.at),
      unread: !read,
      ...read ? { readCompletionId: current.completionId } : {}
    };
  }
  if (incoming.deleted === true || incoming.completionId !== void 0) return incoming;
  if (current.at > incoming.at || current.at === incoming.at && (!current.unread || current.unread === incoming.unread)) return current;
  return incoming;
}
function equalEntry(left, right) {
  return left !== void 0 && left.unread === right.unread && left.at === right.at && left.completionId === right.completionId && left.readCompletionId === right.readCompletionId && left.deleted === right.deleted;
}
var ReadStateTracker = class {
  constructor(onChange) {
    this.onChange = onChange;
  }
  entries = /* @__PURE__ */ new Map();
  /** Only true baselines need retention; absent and false are equivalent. */
  running = /* @__PURE__ */ new Map();
  /** First false and duplicate false observations never mint a completion. */
  observeRunning(sessionId2, running, now = Date.now()) {
    if (sessionId2 === "" || this.entries.get(sessionId2)?.deleted === true) return false;
    const previous = this.running.get(sessionId2);
    this.running.delete(sessionId2);
    if (running) this.running.set(sessionId2, true);
    this.trim();
    if (running) return this.isUnread(sessionId2) ? this.markRead(sessionId2, now) : false;
    if (previous !== true) return false;
    const old = this.entries.get(sessionId2);
    this.setEntry(sessionId2, {
      unread: true,
      at: now,
      completionId: randomUUID4(),
      ...old?.readCompletionId === void 0 ? {} : { readCompletionId: old.readCompletionId }
    }, true);
    return true;
  }
  /** Optional expected token prevents an old page read from clearing a new run. */
  markRead(sessionId2, now = Date.now(), expectedCompletionId) {
    if (sessionId2 === "") return false;
    const previous = this.entries.get(sessionId2);
    if (previous?.deleted === true) return false;
    if (expectedCompletionId !== void 0 && previous?.completionId !== expectedCompletionId) return false;
    const unreadChanged = previous?.unread === true;
    if (previous !== void 0 && !previous.unread && now - previous.at < READ_TOUCH_INTERVAL_MS) return false;
    this.setEntry(sessionId2, {
      ...previous,
      unread: false,
      at: Math.max(previous?.at ?? 0, now),
      ...previous?.completionId === void 0 ? {} : { readCompletionId: previous.completionId }
    }, unreadChanged);
    return unreadChanged;
  }
  /** ACK acceptance is independent of whether an idempotent read changed a dot. */
  readCompletion(sessionId2, expectedCompletionId, now = Date.now()) {
    const state = this.entries.get(sessionId2);
    if (state === void 0 || state.deleted === true) return { accepted: false, unread: false };
    const accepted = state.completionId !== void 0 && state.completionId === expectedCompletionId;
    if (accepted) this.markRead(sessionId2, now, expectedCompletionId);
    return {
      accepted,
      ...state.completionId === void 0 ? {} : { currentCompletionId: state.completionId },
      unread: this.isUnread(sessionId2)
    };
  }
  /**
   * Rebind this exact finished completion to a caller-verified shared identity.
   * The registry must derive the identity from the same real terminal turn/end,
   * never from updatedAt. A racing run, deletion, or replacement rejects it.
   */
  promoteCompletion(sessionId2, expectedCompletionId, sharedCompletionId) {
    const previous = this.entries.get(sessionId2);
    if (previous === void 0 || previous.deleted === true || this.running.has(sessionId2) || previous.completionId === void 0 || previous.completionId !== expectedCompletionId || sharedCompletionId === expectedCompletionId || cursor(sharedCompletionId) === void 0) return false;
    this.setEntry(sessionId2, {
      ...previous,
      completionId: sharedCompletionId,
      ...previous.readCompletionId === expectedCompletionId ? { readCompletionId: sharedCompletionId } : {}
    }, true);
    return true;
  }
  /**
   * Finish a legacy shared merge batch before publishing to token-aware clients.
   * Keeps low-level legacy LWW until explicitly called; emits one publication
   * for all migrations. Persist the returned ids' new metadata before restart.
   */
  migrateLegacyIds() {
    const changed = [];
    for (const [sessionId2, state] of this.entries) {
      if (!state.unread || state.deleted === true || state.completionId !== void 0) continue;
      this.entries.set(sessionId2, { ...state, completionId: `legacy:${randomUUID4()}` });
      changed.push(sessionId2);
    }
    const first = changed[0];
    if (first !== void 0) this.onChange?.(first, this.entries.get(first), true);
    return changed;
  }
  /** One unread notification/revision, while preserving every per-Session cursor. */
  markManyRead(predicate, now = Date.now()) {
    const changed = [];
    for (const [sessionId2, state] of this.entries) {
      if (!state.unread || !predicate(sessionId2)) continue;
      this.entries.set(sessionId2, {
        ...state,
        unread: false,
        at: Math.max(state.at, now),
        ...state.completionId === void 0 ? {} : { readCompletionId: state.completionId }
      });
      changed.push(sessionId2);
    }
    const first = changed[0];
    if (first !== void 0) this.onChange?.(first, this.entries.get(first), true);
    return changed;
  }
  mergeEntry(sessionId2, entry) {
    if (sessionId2 === "") return false;
    const incoming = parseSessionReadState(entry);
    if (incoming === void 0) return false;
    const previous = this.entries.get(sessionId2);
    const next = mergeSessionReadState(previous, incoming);
    if (equalEntry(previous, next)) return false;
    const unreadChanged = previous?.unread === true !== next.unread;
    if (next.deleted === true) this.running.delete(sessionId2);
    this.setEntry(sessionId2, next, unreadChanged);
    return unreadChanged;
  }
  /** Legacy/manual API: it cannot reopen an already cursorized completion. */
  markUnread(sessionId2, now = Date.now()) {
    if (sessionId2 === "" || this.isUnread(sessionId2)) return false;
    const previous = this.entries.get(sessionId2);
    if (previous?.deleted === true || previous?.completionId !== void 0) return false;
    this.setEntry(sessionId2, { unread: true, at: now }, true);
    return true;
  }
  isUnread(sessionId2) {
    return this.entries.get(sessionId2)?.unread === true;
  }
  unreadIds() {
    return [...this.entries].filter(([, state]) => state.unread).map(([id]) => id).sort();
  }
  /** Includes already-read completions; clients need the identity for read ACKs. */
  completionIds() {
    return Object.fromEntries([...this.entries].filter(([, state]) => state.deleted !== true && state.completionId !== void 0).map(([id, state]) => [id, state.completionId]));
  }
  /** Tombstones and both cursor fields survive persistence and shared replay. */
  entriesSnapshot() {
    return Object.fromEntries([...this.entries].map(([id, state]) => [id, { ...state }]));
  }
  /**
   * Upgrade legacy unread once so token-aware native pages can acknowledge it.
   * The caller must persist entriesSnapshot after hydration: the `legacy:` UUID
   * is a compatibility read cursor, not a newly observed completion. Already-read
   * legacy entries stay legacy and keep their original LWW behavior.
   */
  hydrate(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return;
    for (const [sessionId2, raw] of Object.entries(value)) {
      if (sessionId2 === "") continue;
      const entry = parseSessionReadState(raw);
      if (entry !== void 0) {
        const merged = mergeSessionReadState(this.entries.get(sessionId2), entry);
        const needsMigration = merged.unread && merged.deleted !== true && merged.completionId === void 0;
        const next = needsMigration ? { ...merged, completionId: `legacy:${randomUUID4()}` } : merged;
        this.entries.set(sessionId2, next);
        if (next.deleted === true) this.running.delete(sessionId2);
      }
    }
    this.trim();
  }
  /** Keep a terminal tombstone so old shared unread cannot revive this id. */
  remove(sessionId2, now = Date.now()) {
    if (sessionId2 === "") return;
    const previous = this.entries.get(sessionId2);
    this.running.delete(sessionId2);
    if (previous?.deleted === true) return;
    const next = {
      ...previous,
      unread: false,
      at: Math.max(previous?.at ?? 0, now),
      deleted: true,
      ...previous?.completionId === void 0 ? {} : { readCompletionId: previous.completionId }
    };
    this.entries.set(sessionId2, next);
    this.trim();
    if (previous?.unread === true) this.onChange?.(sessionId2, next, true);
  }
  /**
   * Only call with authoritative existence information. Offline/unknown/empty
   * catalogs are NOT evidence of deletion; the registry must guard that boundary.
   */
  prune(predicate) {
    let removedUnread = 0;
    for (const [sessionId2, state] of [...this.entries]) {
      if (state.deleted === true || predicate(sessionId2, state)) continue;
      if (state.unread) removedUnread += 1;
      this.remove(sessionId2);
    }
    for (const sessionId2 of [...this.running.keys()]) {
      if (!predicate(sessionId2, this.entries.get(sessionId2) ?? { unread: false, at: 0 })) this.remove(sessionId2);
    }
    return removedUnread;
  }
  /** Config removal is deletion, not permission for stale shared replay. */
  retain(predicate) {
    for (const sessionId2 of /* @__PURE__ */ new Set([...this.entries.keys(), ...this.running.keys()])) {
      if (!predicate(sessionId2)) this.remove(sessionId2);
    }
  }
  trim(limit = READ_STATE_ENTRY_LIMIT) {
    const cap = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : READ_STATE_ENTRY_LIMIT;
    if (this.entries.size > cap) {
      const ordered = [...this.entries].sort((left, right) => left[1].at - right[1].at);
      for (const [sessionId2] of ordered.slice(0, this.entries.size - cap)) {
        this.entries.delete(sessionId2);
        this.running.delete(sessionId2);
      }
    }
    while (this.running.size > cap) this.running.delete(this.running.keys().next().value);
  }
  setEntry(sessionId2, state, unreadChanged) {
    this.entries.set(sessionId2, state);
    this.trim();
    this.onChange?.(sessionId2, state, unreadChanged);
  }
};

// src/host/shared-state.ts
import { randomUUID as randomUUID5 } from "node:crypto";
var SHARED_READ_STATE_VERSION = 1;
var SHARED_READ_SECTION_LIMIT = 300;
var SHARED_READ_HOST_LIMIT = 20;
function validEntry(value) {
  if (typeof value !== "object" || value === null) return void 0;
  const entry = value;
  if (typeof entry.at !== "number" || !Number.isFinite(entry.at)) return void 0;
  return parseSessionReadState(value);
}
function validSessions(value) {
  const out = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  let count2 = 0;
  for (const [sessionId2, raw] of Object.entries(value)) {
    if (count2 >= SHARED_READ_SECTION_LIMIT) break;
    if (sessionId2 === "" || sessionId2.length > 512) continue;
    if (sessionId2 === "__proto__" || sessionId2 === "constructor" || sessionId2 === "prototype") continue;
    const entry = validEntry(raw);
    if (entry !== void 0) {
      out[sessionId2] = entry;
      count2 += 1;
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
    const parts = text.includes("") ? text.split("") : text.split(/\r?\n/);
    const hosts2 = {};
    let valid = false;
    for (const part of parts) {
      if (part.trim() === "") continue;
      let document;
      try {
        const candidate = JSON.parse(part);
        document = parseSharedReadDocument(JSON.stringify(candidate));
      } catch {
        continue;
      }
      if (document === void 0) continue;
      valid = true;
      for (const [id, section] of Object.entries(document.hosts)) {
        if (hosts2[id] === void 0 && Object.keys(hosts2).length >= SHARED_READ_HOST_LIMIT) continue;
        const previous = hosts2[id];
        if (previous === void 0) {
          hosts2[id] = section;
        } else {
          const [older, newer] = section.updatedAt >= previous.updatedAt ? [previous, section] : [section, previous];
          const sessions = { ...newer.sessions };
          for (const [sessionId2, current] of Object.entries(newer.sessions)) {
            const old = older.sessions[sessionId2];
            if (old !== void 0) sessions[sessionId2] = mergeSessionReadState(current, old);
          }
          hosts2[id] = { updatedAt: newer.updatedAt, sessions };
        }
      }
    }
    return valid ? { version: 1, hosts: hosts2 } : void 0;
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
  const peers = Object.entries(existing?.hosts ?? {}).filter(([id]) => id !== hostId).sort((left, right) => right[1].updatedAt - left[1].updatedAt).slice(0, Math.max(0, SHARED_READ_HOST_LIMIT - 1));
  for (const [id, section] of peers) {
    if (remaining <= 0) break;
    const peerSessions = {};
    const entries = Object.entries(section.sessions).sort((left, right) => right[1].at - left[1].at).slice(0, remaining);
    for (const [sessionId2, entry] of entries) {
      peerSessions[sessionId2] = entry;
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
function shellQuote2(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function buildReadSharedStateCommand(path) {
  return `if [ -f ${shellQuote2(path)} ]; then cat ${shellQuote2(path)}; printf '\\036'; fi; for f in ${shellQuote2(`${path}.hosts`)}/*.json; do [ -f "$f" ] || continue; cat "$f"; printf '\\036'; done`;
}
function buildWriteSharedStateCommand(path, document, hostId) {
  if (hostId !== void 0) {
    if (!/^[A-Za-z0-9-]{1,80}$/.test(hostId)) throw new Error("Invalid shared state Host id");
    path = `${path}.hosts/${hostId}.json`;
    document = { version: 1, hosts: { [hostId]: document.hosts[hostId] ?? { updatedAt: 0, sessions: {} } } };
  }
  const text = JSON.stringify(document);
  const encoded = Buffer.from(text, "utf8").toString("base64");
  const slash = path.lastIndexOf("/");
  const dir = slash > 0 ? path.slice(0, slash) : ".";
  const tmp = `${path}.${randomUUID5()}.tmp`;
  const script = [
    `set -e; umask 077; mkdir -p ${shellQuote2(dir)}`,
    `trap 'rm -f ${shellQuote2(tmp).replaceAll("'", "'\\''")}' EXIT HUP INT TERM`,
    `if printf %s ${shellQuote2(encoded)} | base64 -d > ${shellQuote2(tmp)} 2>/dev/null; then`,
    `  mv -f ${shellQuote2(tmp)} ${shellQuote2(path)}`,
    "else",
    `  printf %s ${shellQuote2(encoded)} | base64 -D > ${shellQuote2(tmp)} && mv -f ${shellQuote2(tmp)} ${shellQuote2(path)}`,
    "fi"
  ].join("\n");
  return `sh -c ${shellQuote2(script)}`;
}

// src/host/remote-client.ts
import { randomUUID as randomUUID6 } from "node:crypto";
import WebSocket2 from "ws";

// src/host/stream-queue.ts
var DEFAULT_STREAM_BACKLOG = 2048;
var BoundedStreamQueue = class {
  constructor(limit = DEFAULT_STREAM_BACKLOG) {
    this.limit = limit;
  }
  items = [];
  head = 0;
  size = 0;
  overflowed = false;
  wake;
  /** Append a frame. Frames after the cap are dropped; the consumer will fail. */
  push(item) {
    if (this.overflowed) return;
    if (this.size >= this.limit) {
      this.overflowed = true;
    } else {
      this.items.push(item);
      this.size += 1;
    }
    this.notify();
  }
  shift() {
    if (this.size === 0) return void 0;
    const item = this.items[this.head];
    this.items[this.head] = void 0;
    this.head += 1;
    this.size -= 1;
    if (this.size === 0) {
      this.items = [];
      this.head = 0;
    } else if (this.head >= 1024 && this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return item;
  }
  get overflow() {
    return this.overflowed;
  }
  /** Resolve when a frame arrives or the stream is aborted. */
  wait() {
    return new Promise((resolve2) => {
      this.wake = resolve2;
    });
  }
  /** Wake the consumer without adding a frame (abort or overflow). */
  notify() {
    const wake = this.wake;
    this.wake = void 0;
    wake?.();
  }
};

// src/host/remote-client.ts
function pendingInteractionKind(event, request) {
  switch (event) {
    case "approval/request":
      return "approval";
    case "user-questions/request": {
      const questions = Array.isArray(request?.questions) ? request.questions : [];
      if (questions.length === 1 && isRecord2(questions[0]) && isRecord2(questions[0].intent)) {
        if (questions[0].intent.kind === "plan-review") return "plan-review";
      }
      return "question";
    }
    case "plan-review/request":
      return "plan-review";
    default:
      return void 0;
  }
}
function countVisibleSessions(summaries, archivedSessionIds) {
  const archived = new Set(archivedSessionIds);
  let sessionCount = 0;
  let runningSessionCount = 0;
  let allRunningSessionCount = 0;
  for (const summary of summaries) {
    if (summary.running) allRunningSessionCount += 1;
    if (summary.origin === "subagent" || archived.has(summary.sessionId)) continue;
    sessionCount += 1;
    if (summary.running) runningSessionCount += 1;
  }
  return {
    sessionCount,
    runningSessionCount,
    allSessionCount: summaries.length,
    allRunningSessionCount
  };
}
function isConnectedState(state) {
  return state === "connected";
}
var BACKOFF_BASE_MS2 = 600;
var BACKOFF_MAX_MS2 = 12e3;
var MAX_MUX_PAYLOAD_BYTES = 16 * 1024 * 1024;
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
  catalog = new DeviceCatalog();
  refreshHealthy = true;
  generationAbort = new AbortController();
  baselineGeneration;
  get generation() {
    return this.catalog.epoch;
  }
  get lastSyncedAt() {
    return this.catalog.syncedAt;
  }
  get catalogStale() {
    return this.catalog.stale;
  }
  get summaries() {
    return this.catalog.sessions;
  }
  get workspaces() {
    return this.catalog.workspaces;
  }
  get archivedSessionIds() {
    return this.catalog.archivedIds;
  }
  get pinnedSessionIds() {
    return this.catalog.pinnedIds;
  }
  get projectionsBySession() {
    return this.catalog.controlProjections;
  }
  baselineFlight;
  authRecovery;
  pendingInteractions = /* @__PURE__ */ new Map();
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
    const summaries = this.sessionSummaries();
    const counts = countVisibleSessions(summaries, this.archivedSessionIds);
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
          bootstrapFromRemoteCredentials: this.config.transport.bootstrapFromRemoteCredentials === true,
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
      sessionCount: counts.sessionCount,
      runningSessionCount: counts.runningSessionCount,
      allSessionCount: counts.allSessionCount,
      allRunningSessionCount: counts.allRunningSessionCount,
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
  /** Monotonic transport epoch; asynchronous work must never cross this fence. */
  get connectionGeneration() {
    return this.generation;
  }
  /** A live, events-ready baseline (never merely an open socket or cached rows). */
  get catalogFresh() {
    return this.isConnected() && !this.catalogStale && this.refreshHealthy && this.baselineGeneration === this.generation;
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
    if (cache === void 0 || !this.catalog.hydrate(cache)) return;
    if (cache.protocolVersion !== "unknown") this.protocolVersion = cache.protocolVersion;
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
    return this.catalog.visibleSessions();
  }
  workspaceItems() {
    return this.workspaces;
  }
  archivedIds() {
    return this.archivedSessionIds;
  }
  setArchivedIds(ids2) {
    this.catalog.setArchivedIds(ids2);
  }
  pinnedIds() {
    return this.pinnedSessionIds;
  }
  setPinnedIds(ids2) {
    this.catalog.setPinnedIds(ids2);
  }
  /**
   * Refresh the remote `session/list` catalog and notify local `$events`
   * listeners of any newly created or updated remote Sessions.
   */
  refreshSessionCatalog(signal) {
    if (this.protocolVersion !== "0.2" || signal?.aborted) return Promise.resolve();
    if (this.running && !this.catalog.eventsReady) return Promise.resolve();
    return this.loadSessionBaseline(this.catalog.epoch, signal);
  }
  setRefreshHealthy(healthy) {
    if (this.refreshHealthy === healthy) return;
    this.refreshHealthy = healthy;
    this.callbacks.onStateChanged(this.id);
  }
  loadSessionBaseline(epoch, callerSignal) {
    if (this.baselineFlight?.epoch === epoch) return this.baselineFlight.promise;
    const signal = AbortSignal.any([
      this.generationAbort.signal,
      ...this.iterationAbort === void 0 ? [] : [this.iterationAbort.signal],
      ...callerSignal === void 0 ? [] : [callerSignal]
    ]);
    let previous = /* @__PURE__ */ new Map();
    let transportThrew = false;
    const promise = this.catalog.refreshSessions(epoch, async () => {
      try {
        const res = await this.rawRpcPost("session/list", { args: { _request: {} } }, signal);
        if (!res.ok) return void 0;
        return res.value;
      } catch (error) {
        transportThrew = true;
        throw error;
      }
    }, false, signal, () => {
      previous = new Map(this.summaries.map((summary) => [summary.sessionId, summary]));
    }).then((applied) => {
      if (!applied || signal.aborted || !this.catalog.isCurrent(epoch)) return;
      this.prunePendingInteractions(new Set(this.summaries.map((summary) => summary.sessionId)));
      this.baselineGeneration = epoch;
      this.refreshHealthy = true;
      this.reconcileSessionSummaries(previous);
      this.callbacks.onStateChanged(this.id);
    }).catch((error) => {
      if (signal.aborted || !this.catalog.isCurrent(epoch)) return;
      this.setRefreshHealthy(false);
      if (transportThrew) throw error;
    }).finally(() => {
      if (this.baselineFlight?.promise === promise) this.baselineFlight = void 0;
    });
    this.baselineFlight = { epoch, promise };
    return promise;
  }
  prunePendingInteractions(sessionIds) {
    for (const [eventId, pending] of this.pendingInteractions) {
      if (sessionIds.has(pending.rawSessionId)) continue;
      this.pendingInteractions.delete(eventId);
      this.callbacks.onRemoteEventFrame(this.id, { type: "cancel", eventId: pending.namespacedEventId });
    }
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
    this.invalidateGeneration();
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
  /** Fence every async operation before a transport/configuration can change. */
  invalidateGeneration() {
    this.generationAbort.abort();
    this.generationAbort = new AbortController();
    this.catalog.beginEpoch();
    this.baselineFlight = void 0;
    this.authRecovery = void 0;
    this.baselineGeneration = void 0;
    this.refreshHealthy = true;
    this.remoteEventsClientId = void 0;
    this.clearPendingInteractions();
  }
  /** Preserve offline rows, but never claim live execution or pending requests. */
  markDisconnected() {
    this.clearPendingInteractions();
  }
  /** Drop every pending waterfall and close its local card. */
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
  updateConfig(next) {
    this.stop();
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
  // Public Remote RPC & Stream Operations
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
      const rawDetails = isRecord2(response.error.details) ? { ...response.error.details } : {};
      if (typeof rawDetails.sessionId === "string" && !isNamespacedSessionId(rawDetails.sessionId)) {
        rawDetails.sessionId = encodeRemoteSessionId(this.id, rawDetails.sessionId);
      }
      const err = new Error(response.error.message);
      err.name = "RemoteError";
      err.code = response.error.code;
      err.details = rawDetails;
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
    const streamId = randomUUID6();
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
      if (socket === this.muxSocket) this.muxStreams.delete(streamId);
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
    const generation = this.generation;
    const pending = this.pendingInteractions.get(remoteEventId);
    const acknowledge = (ok) => {
      if (!ok || outcome.kind === "next" || generation !== this.generation) return;
      if (this.pendingInteractions.get(remoteEventId) !== pending) return;
      if (this.pendingInteractions.delete(remoteEventId)) this.callbacks.onStateChanged(this.id);
    };
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
      acknowledge(res2.ok);
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
      AbortSignal.any([this.generationAbort.signal, ...signal !== void 0 ? [signal] : []])
    );
    acknowledge(res.ok);
    return { ok: res.ok, ...res.ok ? {} : { error: res.error.message } };
  }
  // ==========================================================================
  // Internal Connection & Stream Supervision Loop
  // ==========================================================================
  async superviseLoop(outerSignal) {
    while (this.running && !outerSignal.aborted) {
      this.iterationAbort?.abort();
      this.invalidateGeneration();
      const iterAbort = new AbortController();
      this.iterationAbort = iterAbort;
      const signal = AbortSignal.any([outerSignal, iterAbort.signal, this.generationAbort.signal]);
      const epoch = this.catalog.epoch;
      try {
        this.state = this.reconnectAttempt === 0 ? "connecting" : "reconnecting";
        this.callbacks.onStateChanged(this.id);
        const baseUrl = await this.ensureTransportUp(signal);
        if (signal.aborted || !this.catalog.isCurrent(epoch)) return;
        if (baseUrl === void 0) {
          throw new Error(this.tunnel?.status().error ?? "Transport endpoint unavailable");
        }
        const authRes = await this.authManager.ensureAuthenticated(this.config, baseUrl);
        if (signal.aborted || !this.catalog.isCurrent(epoch)) return;
        if (!authRes.ok) {
          throw new Error(authRes.error);
        }
        const t0 = Date.now();
        const probed = await this.handshakeAndLoadInitial(baseUrl, signal, epoch);
        if (signal.aborted || !this.catalog.isCurrent(epoch)) return;
        this.latencyMs = Date.now() - t0;
        this.protocolVersion = probed.protocolVersion;
        this.realtime = probed.protocolVersion === "0.2";
        if (probed.remoteDshVersion !== void 0) {
          this.remoteDshVersion = probed.remoteDshVersion;
        }
        if (this.protocolVersion === "0.2") {
          await this.runProtocol02Streams(baseUrl, signal, () => {
            if (signal.aborted || !this.catalog.markLive(epoch)) return;
            this.state = "connected";
            this.connectedAt = Date.now();
            this.lastError = void 0;
            this.reconnectAttempt = 0;
            this.callbacks.onStateChanged(this.id);
            this.callbacks.onWorkspacesChanged(this.id);
          }, epoch);
        } else {
          if (!this.catalog.markLive(epoch, true)) return;
          this.state = "connected";
          this.connectedAt = Date.now();
          this.lastError = void 0;
          this.reconnectAttempt = 0;
          this.callbacks.onStateChanged(this.id);
          await this.runProtocol01Polling(baseUrl, signal);
        }
      } catch (error) {
        if (signal.aborted || !this.running || !this.catalog.isCurrent(epoch)) return;
        this.lastError = error instanceof Error ? error.message : String(error);
        this.state = "error";
        this.invalidateGeneration();
        this.closeMuxSocket();
        this.markDisconnected();
        this.callbacks.onStateChanged(this.id);
      } finally {
        iterAbort.abort();
        if (this.iterationAbort === iterAbort) {
          this.iterationAbort = void 0;
          this.closeMuxSocket();
        }
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
    const tunnel = this.tunnel;
    const base = tunnel.baseUrl();
    if (base !== void 0) return base;
    for (let i = 0; i < 20 && !signal.aborted; i++) {
      const current = tunnel.baseUrl();
      if (current !== void 0) return current;
      if (tunnel.status().state === "error") break;
      await sleepWithSignal(250, signal);
    }
    return signal.aborted ? void 0 : tunnel.baseUrl();
  }
  async handshakeAndLoadInitial(baseUrl, signal, epoch = this.catalog.epoch) {
    let res02 = await this.rawRpcPost("session/list", { args: { _request: {} } }, signal);
    if (signal.aborted || !this.catalog.isCurrent(epoch)) throw new Error("Remote connection superseded");
    if (!res02.ok && (res02.httpStatus === 401 || res02.httpStatus === 403)) {
      this.authManager.invalidate(this.config.id);
      await this.authManager.ensureAuthenticated(this.config, baseUrl, true);
      if (signal.aborted || !this.catalog.isCurrent(epoch)) throw new Error("Remote connection superseded");
      res02 = await this.rawRpcPost("session/list", { args: { _request: {} } }, signal);
      if (signal.aborted || !this.catalog.isCurrent(epoch)) throw new Error("Remote connection superseded");
      if (!res02.ok && (res02.httpStatus === 401 || res02.httpStatus === 403)) {
        this.callbacks.onAuthState?.(this.id, "required", res02.error.message);
      }
    }
    if (res02.ok) {
      this.callbacks.onAuthState?.(this.id, "ok");
    }
    if (signal.aborted || !this.catalog.isCurrent(epoch)) throw new Error("Remote connection superseded");
    const body02 = res02.ok ? res02.value : void 0;
    const listGen = classifyRemoteProtocol(body02);
    let hostValue;
    if (listGen !== "0.2") {
      const res01 = await this.rawRpcPost("host.describe", {}, signal, "host.describe");
      if (res01.ok) hostValue = res01.value;
    }
    signal.throwIfAborted();
    const resolved = resolveProbedProtocol(body02, hostValue);
    if (signal.aborted || !this.catalog.isCurrent(epoch)) throw new Error("Remote connection superseded");
    if (resolved?.protocol === "0.2") {
      this.realtime = true;
      return { protocolVersion: "0.2", remoteDshVersion: resolved.version ?? "0.2.x" };
    }
    if (resolved?.protocol === "0.1") {
      if (isRecord2(hostValue) && typeof hostValue.cwd === "string") {
        this.remoteHome = hostValue.cwd;
      }
      await this.refreshLegacy01Lists(signal);
      if (signal.aborted || !this.catalog.isCurrent(epoch)) throw new Error("Remote connection superseded");
      this.realtime = false;
      return { protocolVersion: "0.1", remoteDshVersion: resolved.version ?? "0.1.x" };
    }
    throw new Error(res02.ok ? "Unrecognized DSH /api response" : res02.error.message);
  }
  async runProtocol02Streams(baseUrl, signal, onReady, epoch = this.catalog.epoch) {
    signal.throwIfAborted();
    const wsUrl = new URL("/api/remote.mux", baseUrl);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    const headers = this.authManager.getAuthHeaders(this.config);
    const socket = new WebSocket2(wsUrl.href, {
      headers,
      maxPayload: MAX_MUX_PAYLOAD_BYTES,
      rejectUnauthorized: this.config.transport.kind === "direct" ? this.config.transport.rejectUnauthorized !== false : true
    });
    this.muxSocket = socket;
    await new Promise((resolve2, reject) => {
      const onOpen = () => {
        cleanup();
        resolve2();
      };
      const onErr = (err) => {
        cleanup();
        reject(err);
      };
      const onAbort = () => {
        cleanup();
        reject(new Error("Remote connection aborted"));
      };
      const onClose = () => onErr(new Error("Remote stream WebSocket closed before open"));
      const cleanup = () => {
        socket.off("open", onOpen);
        socket.off("error", onErr);
        socket.off("close", onClose);
        signal.removeEventListener("abort", onAbort);
      };
      socket.once("open", onOpen);
      socket.once("error", onErr);
      socket.once("close", onClose);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    if (signal.aborted || !this.catalog.isCurrent(epoch)) return;
    let announced = false;
    let baselineTimer;
    const ready = () => {
      if (announced || signal.aborted || !this.catalog.isCurrent(epoch) || !this.catalog.ready) return;
      announced = true;
      clearTimeout(baselineTimer);
      onReady?.();
    };
    socket.on("message", (data) => {
      if (signal.aborted || !this.catalog.isCurrent(epoch)) return;
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
    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket2.OPEN) {
        try {
          socket.ping();
        } catch {
        }
      }
    }, 15e3);
    pingInterval.unref?.();
    const closed = new Promise((_, reject) => {
      socket.once("close", (code, reason) => {
        reject(new Error(`Remote stream WebSocket closed (${String(code)} ${reason.toString()})`));
      });
      socket.once("error", (err) => reject(err));
    });
    const baselineTimeout = new Promise((_, reject) => {
      baselineTimer = setTimeout(() => reject(new Error("Remote catalog baseline timed out")), 15e3);
      baselineTimer.unref?.();
    });
    try {
      await Promise.race([
        closed,
        baselineTimeout,
        this.pump02RemoteEvents(signal, epoch, ready).then(() => {
          if (!signal.aborted) throw new Error("Remote $events stream ended");
        }),
        this.pump02WorkspaceFollow(signal, epoch, ready),
        this.pump02SessionControl(signal, epoch, ready).then(() => {
          if (!signal.aborted) throw new Error("Remote session/control stream ended");
        })
      ]);
    } finally {
      clearInterval(pingInterval);
      clearTimeout(baselineTimer);
    }
  }
  async pump02RemoteEvents(signal, epoch = this.catalog.epoch, onReady = () => {
  }) {
    let baseline;
    let baselineError;
    for await (const item of this.openStream("$events", {}, signal)) {
      if (signal.aborted || !this.catalog.isCurrent(epoch)) return;
      if (baselineError !== void 0) throw baselineError;
      if (!isRecord2(item) || typeof item.type !== "string") continue;
      if (item.type === "ready") {
        if (typeof item.clientId === "string") {
          this.remoteEventsClientId = item.clientId;
        }
        if (isRecord2(item.host) && typeof item.host.home === "string") {
          this.remoteHome = item.host.home;
          this.callbacks.onStateChanged(this.id);
        }
        if (typeof item.clientId !== "string" || item.clientId.length === 0) continue;
        this.catalog.markEventsReady(epoch);
        baseline ??= this.loadSessionBaseline(epoch).then(() => {
          if (!signal.aborted && this.catalog.isCurrent(epoch) && !this.refreshHealthy) throw new Error("Remote session baseline unavailable");
          onReady();
        }).catch((error) => {
          baselineError = error;
          if (this.catalog.isCurrent(epoch) && !signal.aborted) this.muxSocket?.close();
        });
        continue;
      }
      if (item.type === "emit" && typeof item.event === "string" && Array.isArray(item.args)) {
        this.handle02EmitEvent(item.event, item.args, epoch);
        continue;
      }
      if (item.type === "waterfall" && typeof item.event === "string" && typeof item.eventId === "string" && typeof item.agentId === "string" && isRecord2(item.request)) {
        if (isNamespacedSessionId(item.agentId) || isNamespacedEventId(item.eventId)) continue;
        const namespacedSessionId = encodeRemoteSessionId(this.id, item.agentId);
        const namespacedEventId = encodeRemoteEventId(this.id, item.eventId);
        const kind = pendingInteractionKind(item.event, item.request);
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
        if (isNamespacedEventId(item.eventId)) continue;
        this.pendingInteractions.delete(item.eventId);
        this.callbacks.onStateChanged(this.id);
        this.callbacks.onRemoteEventFrame(this.id, {
          type: "cancel",
          eventId: encodeRemoteEventId(this.id, item.eventId)
        });
      }
    }
  }
  handle02EmitEvent(event, args, epoch = this.catalog.epoch) {
    if (!this.catalog.isCurrent(epoch)) return;
    switch (event) {
      case "api-session/added":
      case "api-session/removed":
      case "api-session/status":
      case "api-session/activity": {
        if (!this.catalog.applySessionEvent(epoch, event, args)) break;
        if (event === "api-session/removed") this.prunePendingInteractions(new Set(this.summaries.map((summary2) => summary2.sessionId)));
        const raw = args[0];
        const summary = event === "api-session/added" && isRecord2(raw) ? this.summaries.find((row) => row.sessionId === raw.sessionId) : void 0;
        this.callbacks.onStateChanged(this.id);
        this.callbacks.onWorkspacesChanged(this.id);
        this.callbacks.onRemoteEventFrame(this.id, {
          type: "emit",
          event,
          args: summary !== void 0 ? [this.namespaceSummary(summary)] : [encodeRemoteSessionId(this.id, args[0]), ...args.slice(1)]
        });
        break;
      }
      case "api-session/error": {
        const [sessionId2, message] = args;
        if (typeof sessionId2 === "string" && typeof message === "string") {
          if (isNamespacedSessionId(sessionId2)) break;
          this.callbacks.onRemoteEventFrame(this.id, {
            type: "emit",
            event,
            args: [encodeRemoteSessionId(this.id, sessionId2), message]
          });
        }
        break;
      }
      case "llm/adapters-updated":
      case "settings/document-updated":
      case "credentials/record-updated":
      case "credentials/reference-updated": {
        this.callbacks.onStateChanged(this.id);
        break;
      }
      default:
        break;
    }
  }
  async pump02WorkspaceFollow(signal, epoch = this.catalog.epoch, onReady = () => {
  }) {
    for await (const frame of this.openStream("workspace/follow", {}, signal)) {
      if (signal.aborted || !this.catalog.isCurrent(epoch)) return;
      if (!this.catalog.applyWorkspaceFrame(epoch, frame)) continue;
      this.callbacks.onStateChanged(this.id);
      this.callbacks.onWorkspacesChanged(this.id);
      onReady();
    }
    if (!signal.aborted) throw new Error("Remote workspace/follow stream ended");
  }
  async pump02SessionControl(signal, epoch = this.catalog.epoch, onReady = () => {
  }) {
    for await (const frame of this.openStream("session/control", {}, signal)) {
      if (signal.aborted || !this.catalog.isCurrent(epoch)) return;
      const previous = new Map(this.summaries.map((summary) => [summary.sessionId, summary]));
      const updates = this.catalog.applyControlFrame(epoch, frame, (key, value) => this.namespaceProjectionValue(key, value));
      if (updates === void 0) continue;
      for (const update of updates) this.callbacks.onControlProjectionFrame(this.id, {
        ...update,
        sessionId: encodeRemoteSessionId(this.id, update.sessionId)
      });
      if (updates.some((update) => update.key === "title" || update.key === "sessionListMetadata")) {
        this.reconcileSessionSummaries(previous);
        this.callbacks.onWorkspacesChanged(this.id);
        this.callbacks.onStateChanged(this.id);
      }
      onReady();
    }
  }
  // ==========================================================================
  // DSH 0.1.x Compatibility Layer
  // ==========================================================================
  async refreshLegacy01Lists(signal) {
    const epoch = this.catalog.epoch;
    const previous = new Map(this.summaries.map((summary) => [summary.sessionId, summary]));
    const [sessions, workspaces] = await Promise.all([
      this.catalog.refreshSessions(epoch, async () => {
        const res = await this.rawRpcPost("session.list", {}, signal, "session.list");
        if (!res.ok) throw new Error(res.error.message);
        return res.value;
      }, true),
      this.rawRpcPost("workspace.list", {}, signal, "workspace.list")
    ]);
    if (signal.aborted || !this.catalog.isCurrent(epoch)) return;
    if (!workspaces.ok) throw new Error(workspaces.error.message);
    if (!this.catalog.applyWorkspaceFrame(epoch, { type: "baseline", value: workspaces.value }, true)) {
      throw new Error("Invalid legacy workspace.list baseline");
    }
    if (sessions) {
      this.baselineGeneration = epoch;
      this.refreshHealthy = true;
      this.prunePendingInteractions(new Set(this.summaries.map((summary) => summary.sessionId)));
      this.reconcileSessionSummaries(previous);
    }
    this.callbacks.onWorkspacesChanged(this.id);
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
    const sessionId2 = req.address?.sessionId ?? "";
    yield {
      type: "snapshot",
      header: { version: 2, id: sessionId2, createdAt: Date.now(), isSeeded: false },
      cursor: -1,
      records: [],
      hasMore: false,
      degraded: "list-only",
      projections: { asOfSeq: -1, values: {} },
      assistantStream: { revision: 0 }
    };
    if (signal.aborted) return;
    await new Promise((resolve2) => {
      signal.addEventListener("abort", () => resolve2(), { once: true });
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
    for (const sessionId2 of previous.keys()) {
      if (current.has(sessionId2)) continue;
      changed = true;
      this.callbacks.onRemoteEventFrame(this.id, {
        type: "emit",
        event: "api-session/removed",
        args: [encodeRemoteSessionId(this.id, sessionId2)]
      });
    }
    if (changed) this.callbacks.onWorkspacesChanged(this.id);
  }
  namespaceProjectionValue(key, value) {
    if (key === "subagentCatalog" && Array.isArray(value)) {
      return value.map((entry) => {
        if (!isRecord2(entry) || typeof entry.id !== "string") return entry;
        return {
          ...entry,
          id: encodeRemoteSessionId(this.id, entry.id),
          ...typeof entry.parentSessionId === "string" ? { parentSessionId: encodeRemoteSessionId(this.id, entry.parentSessionId) } : {}
        };
      });
    }
    return value;
  }
  namespaceProjectionValues(values) {
    const out = {};
    for (const [key, val] of Object.entries(values)) {
      out[key] = this.namespaceProjectionValue(key, val);
    }
    return out;
  }
  namespaceSummary(summary) {
    return {
      ...summary,
      sessionId: encodeRemoteSessionId(this.id, summary.sessionId),
      ...summary.parentSessionId !== void 0 ? { parentSessionId: encodeRemoteSessionId(this.id, summary.parentSessionId) } : {},
      ...summary.projections !== void 0 ? {
        projections: {
          ...summary.projections,
          values: this.namespaceProjectionValues(summary.projections.values)
        }
      } : {}
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
      socket.on("error", () => {
      });
      try {
        socket.close();
      } catch {
      }
    }
  }
  async rawRpcPost(endpointPath, payload, signal, methodField = endpointPath) {
    const epoch = this.generation;
    let result = await this.rawRpcPostOnce(endpointPath, payload, signal, methodField);
    if (this.protocolVersion === "0.2" && !result.ok && (result.httpStatus === 401 || result.httpStatus === 403)) {
      const recovered = await this.recoverAuthentication(epoch, signal);
      if (recovered && epoch === this.generation) {
        result = await this.rawRpcPostOnce(endpointPath, payload, signal, methodField);
      }
    }
    if (!result.ok && (result.httpStatus === 401 || result.httpStatus === 403)) {
      this.callbacks.onAuthState?.(this.id, "required", result.error.message);
    }
    return result;
  }
  recoverAuthentication(epoch, signal) {
    if (this.authRecovery?.epoch === epoch) return this.authRecovery.promise;
    if (this.config.auth.mode === "none" || this.config.auth.mode === "cookie" || this.config.auth.mode === "bearer") {
      return Promise.resolve(false);
    }
    const promise = (async () => {
      const isAborted = () => signal?.aborted === true;
      const baseUrl = this.effectiveBaseUrl();
      if (baseUrl === void 0 || isAborted()) return false;
      this.callbacks.onAuthState?.(this.id, "unknown");
      this.authManager.invalidate(this.id);
      const result = await this.authManager.ensureAuthenticated(this.config, baseUrl, true);
      if (epoch !== this.generation || isAborted()) return false;
      if (result.ok) {
        this.callbacks.onAuthState?.(this.id, "ok");
        return true;
      }
      this.lastError = result.error;
      this.state = "error";
      this.callbacks.onAuthState?.(this.id, "required", result.error);
      this.callbacks.onStateChanged(this.id);
      this.closeMuxSocket();
      return false;
    })();
    this.authRecovery = { epoch, promise };
    const clearRecovery = () => {
      if (this.authRecovery?.promise === promise) this.authRecovery = void 0;
    };
    void promise.then(clearRecovery, clearRecovery);
    return promise;
  }
  async rawRpcPostOnce(endpointPath, payload, signal, methodField = endpointPath) {
    signal = AbortSignal.any([this.generationAbort.signal, ...signal !== void 0 ? [signal] : []]);
    const baseUrl = this.effectiveBaseUrl();
    if (baseUrl === void 0) {
      return {
        ok: false,
        httpStatus: 503,
        error: { code: "gateway/service-unavailable", message: `Device "${this.config.name}" is not connected` }
      };
    }
    const rpcId = randomUUID6();
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
            return { ok: true, value: parsed.result.value, httpStatus: response.status };
          }
          if (parsed.result.ok === false && parsed.result.error !== void 0) {
            return { ok: false, httpStatus: response.status, error: parsed.result.error };
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
  return new Promise((resolve2) => {
    if (signal.aborted) {
      resolve2();
      return;
    }
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve2();
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
  crossHostReadState: false
};
var RUNNING_RECONCILE_INTERVAL_MS = 45e3;
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
    this.storage = new JsonSnapshotFile(dataFilePath, (value) => value.version === 1 && Array.isArray(value.devices));
    this.catalogStorage = new JsonSnapshotFile(
      join4(dirname3(dataFilePath), "catalogs.json"),
      (value) => value.version === 2 && typeof value.catalogs === "object" && value.catalogs !== null && !Array.isArray(value.catalogs)
    );
    this.authManager = new DeviceAuthManager(secretsFilePath);
    this.nativeProxyManager = new NativeProxyManager(
      this.authManager,
      options.localOrigin,
      {
        onAuthState: (deviceId, state, error) => {
          this.setAuthState(deviceId, state, error);
        },
        onBridgeState: (deviceId, state, error, clientId) => {
          this.setNativePaneState(deviceId, state, error, clientId);
        },
        onBridgeSelection: (deviceId, sessionId2, clientId) => {
          this.setNativePaneSelection(deviceId, sessionId2, clientId);
        },
        onBridgeTitle: (deviceId, title, clientId) => {
          this.setNativePaneTitle(deviceId, title, clientId);
        },
        onBridgeVisibility: (deviceId, visible, clientId) => {
          this.setNativePaneVisibility(deviceId, visible, clientId);
        },
        onPortAllocated: (deviceId, port) => {
          this.persistNativeProxyPort(deviceId, port);
        },
        getGroupState: (deviceId) => this.nativeGroups.get(deviceId),
        onGroupState: (deviceId, groups) => {
          this.setNativeGroupState(deviceId, groups);
        },
        getUnreadState: (deviceId) => this.unreadForDevice(deviceId),
        getReadCompletions: (deviceId) => this.completionsForDevice(deviceId),
        onBridgeRead: (deviceId, sessionId2, expectedCompletionId) => {
          const id = encodeRemoteSessionId(deviceId, sessionId2);
          if (expectedCompletionId !== void 0) return this.readTracker.readCompletion(id, expectedCompletionId);
          this.readTracker.markRead(id);
        }
      }
    );
    this.loadFromDisk();
    if (this.catalogMigrationPending) {
      this.catalogDirty = true;
      void this.persistCatalogsAsync().catch(() => {
      });
    }
    this.syncSharedReadStateTimer();
  }
  authManager;
  nativeProxyManager;
  configs = /* @__PURE__ */ new Map();
  clients = /* @__PURE__ */ new Map();
  /** Invalidates asynchronous proxy mounts when a device is updated, removed or disposed. */
  mountGenerations = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  eventListeners = /* @__PURE__ */ new Set();
  projectionListeners = /* @__PURE__ */ new Set();
  workspaceListeners = /* @__PURE__ */ new Set();
  /** Navigation belongs to a browser instance, never to the Host process. */
  activeSessions = /* @__PURE__ */ new Map();
  revision = 1;
  snapshotCache = /* @__PURE__ */ new Map();
  disposed = false;
  lifetime = new AbortController();
  localCatalog;
  localCatalogFresh = false;
  localCatalogInflight;
  localCatalogMutations;
  localStatus = /* @__PURE__ */ new Map();
  localPending = /* @__PURE__ */ new Map();
  authStates = /* @__PURE__ */ new Map();
  /** Durable mirror of each device catalog (see {@link DeviceCatalogCache}). */
  catalogs = /* @__PURE__ */ new Map();
  /** Why one device's summaries could not be projected into the merged `session.list`. */
  sessionListErrors = /* @__PURE__ */ new Map();
  /**
   * Live `$events` generations that must be told to (re)publish Session
   * summaries before a Workspace row referencing them reaches the sidebar.
   */
  sessionPublishListeners = /* @__PURE__ */ new Set();
  /** Injected Native Pane bridge lifecycle, last page selection/title, and visibility per device. */
  nativePanes = /* @__PURE__ */ new Map();
  /** Previous connection state per device, so workspace rows are recomputed on a real transition. */
  lastDeviceStates = /* @__PURE__ */ new Map();
  /** Host-owned fold state per device, restored into the framed page before its first render. */
  nativeGroups = /* @__PURE__ */ new Map();
  remoteRunningEvidence = /* @__PURE__ */ new Map();
  completionBindings = /* @__PURE__ */ new Map();
  completionBindingOffsets = /* @__PURE__ */ new Map();
  sharedReadStateDirty = /* @__PURE__ */ new Set();
  sharedReadStateFailures = /* @__PURE__ */ new Map();
  /** Host-owned read/unread state for namespaced remote Sessions. */
  readTracker = new ReadStateTracker((sessionId2, state, unreadChanged) => {
    const decoded = decodeSessionId(sessionId2);
    const generation = decoded.isRemote ? this.clients.get(decoded.deviceId)?.connectionGeneration : void 0;
    if (state.unread && state.completionId !== void 0 && !state.completionId.startsWith("legacy:") && !state.completionId.startsWith("turn:") && generation !== void 0 && this.remoteRunningEvidence.get(sessionId2) === generation) {
      this.completionBindings.set(sessionId2, { completionId: state.completionId, generation });
      while (this.completionBindings.size > 2e3) this.completionBindings.delete(this.completionBindings.keys().next().value);
    }
    this.schedulePersist();
    if (unreadChanged) this.bumpRevision();
    this.publishUnreadState(sessionId2);
  });
  /** Stable Host identity (used by the optional cross-Host state file). */
  hostId = randomUUID7();
  /** Identity of this Host process; clients reset their revision when it changes. */
  hostEpoch = randomUUID7();
  /** Low-frequency catalog refresh that heals lost running-status frames. */
  runningReconcileTimer;
  uiPreferences = { ...DEFAULT_UI_PREFERENCES };
  catalogPersistTimer;
  persistTimer;
  /** Optional cross-Host read-state polling and per-device push debounce. */
  sharedReadStateTimer;
  sharedReadStateInFlight = /* @__PURE__ */ new Set();
  sharedReadStateInitialized = /* @__PURE__ */ new Set();
  sharedReadStatePushTimers = /* @__PURE__ */ new Map();
  storage;
  catalogStorage;
  catalogWrite;
  catalogWriteAgain = false;
  catalogDirty = false;
  catalogMigrationPending = false;
  catalogPersistFailures = 0;
  catalogPersistenceError;
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
   * Ask every live multiplexed `$events` generation to publish
   * `api-session/added` for the given namespaced Session ids.
   *
   * The sidebar silently skips Workspace children that have no summary in the
   * browser's Session store, so a Workspace frame must never outrun the
   * summaries it references. The `workspace/follow` stream calls
   * this before emitting any frame that carries `sessionIds`; each event
   * generation dedupes against the ids it already pushed. Cross-stream wire
   * order is not guaranteed, but the store update re-renders the row, so the
   * "expanded but empty" state can only last milliseconds, never forever.
   */
  requestSessionPublish(sessionIds) {
    if (sessionIds.length === 0) return;
    for (const listener of this.sessionPublishListeners) {
      try {
        listener(sessionIds);
      } catch {
      }
    }
  }
  onSessionPublishRequest(listener) {
    this.sessionPublishListeners.add(listener);
    return () => this.sessionPublishListeners.delete(listener);
  }
  /**
   * Record that one device's summaries could not be projected into the merged
   * `session.list`. The rest of the list still ships, and the failing device
   * says why in the sidebar/diagnostics instead of silently blanking every
   * remote Workspace.
   */
  noteSessionListError(deviceId, message) {
    if (this.sessionListErrors.get(deviceId) === message) return;
    this.sessionListErrors.set(deviceId, message);
    this.bumpRevision();
  }
  /** Clear the recorded projection failure after a successful merge. */
  clearSessionListError(deviceId) {
    if (!this.sessionListErrors.delete(deviceId)) return;
    this.bumpRevision();
  }
  /** Last recorded projection failure for one device, if any. */
  sessionListErrorFor(deviceId) {
    return this.sessionListErrors.get(deviceId);
  }
  /**
   * Subscribe to model-catalog scope changes. The Host re-emits DSH's
   * `llm/adapters-updated` event so the browser's shared model picker drops its
   * cached catalog and asks `session/modelCatalog` again.
   */
  /**
   * Record the Session currently rendered on the right. `requestSeq` is
   * client-monotonic so out-of-order control-plane HTTP requests cannot move
   * the scope back to a previously selected Session.
   */
  setActiveSession(sessionId2, requestSeq = 0, clientId = "") {
    const key = clientId || "legacy";
    const previous = this.activeSessions.get(key);
    if (requestSeq > 0 && previous !== void 0 && requestSeq <= previous.seq) return false;
    const next = sessionId2 || void 0;
    const changed = previous?.sessionId !== next;
    const navigationChanged = changed || previous?.seq !== requestSeq;
    if (!this.activeSessions.has(key) && this.activeSessions.size >= 256) {
      const oldest = this.activeSessions.keys().next().value;
      if (oldest !== void 0) this.activeSessions.delete(oldest);
    }
    this.activeSessions.set(key, { sessionId: next, seq: requestSeq });
    if (navigationChanged) this.bumpRevision();
    return changed;
  }
  /**
   * Clear one remote Session's unread marker. Returns true when this call
   * actually removed a marker, so callers can distinguish a real transition
   * from a redundant read touch.
   */
  markSessionRead(sessionId2, expectedCompletionId) {
    return this.readTracker.markRead(sessionId2, Date.now(), expectedCompletionId);
  }
  /**
   * Clear every unread marker owned by one device (本机 included).
   *
   * A safety valve for the one read signal the Host cannot observe — a Remote
   * page viewed outside this plugin, or a native page whose injected bridge
   * never became ready. Without it those reminders could only be cleared by
   * deleting the Session.
   *
   * @returns how many markers were actually removed.
   */
  markDeviceRead(deviceId) {
    const changed = this.readTracker.markManyRead(
      (sessionId2) => decodeSessionId(sessionId2).deviceId === deviceId
    );
    return changed.length;
  }
  /** Local DSH session status, observed through this Host's own event bus. */
  observeLocalSessionStatus(sessionId2, running) {
    if (this.disposed || typeof sessionId2 !== "string" || sessionId2 === "" || decodeSessionId(sessionId2).isRemote) return;
    this.localStatus.set(sessionId2, running);
    const mutation = (rows) => rows.map((row) => row.sessionId === sessionId2 ? { ...row, running } : row);
    this.localCatalogMutations?.push(mutation);
    if (this.localCatalog !== void 0) this.localCatalog = mutation(this.localCatalog);
    this.readTracker.observeRunning(sessionId2, running);
    this.bumpRevision();
  }
  /** A local live summary was added or changed; a full query supplies persisted identities. */
  observeLocalSessionAdded(fact) {
    if (this.disposed || decodeSessionId(fact.sessionId).isRemote) return;
    const mutation = (rows) => [...rows.filter((row) => row.sessionId !== fact.sessionId), { ...fact, deviceId: LOCAL_DEVICE_ID }];
    this.localCatalogMutations?.push(mutation);
    if (this.localCatalog !== void 0) this.localCatalog = mutation(this.localCatalog);
    this.observeLocalSessionStatus(fact.sessionId, fact.running);
    void this.refreshLocalCatalog();
  }
  /** Internal adapter for the local gateway's still-pending requests; never persists requests. */
  observeLocalPending(requests) {
    if (this.disposed) return;
    const next = new Map(requests.filter((request) => !decodeSessionId(request.sessionId).isRemote).map((request) => [request.eventId, request]));
    if (next.size === this.localPending.size && [...next].every(([id, request]) => {
      const old = this.localPending.get(id);
      return old?.sessionId === request.sessionId && old.kind === request.kind;
    })) return;
    this.localPending.clear();
    for (const [id, request] of next) this.localPending.set(id, request);
    this.bumpRevision();
  }
  /** Complete, successful persisted+live query only; failed/unavailable reads never mean deleted. */
  refreshLocalCatalog() {
    if (this.disposed || this.localHost.localSessionCatalog === void 0) return Promise.resolve();
    if (this.localCatalogInflight !== void 0) return this.localCatalogInflight;
    const mutations = [];
    this.localCatalogMutations = mutations;
    const operation = Promise.resolve().then(() => this.localHost.localSessionCatalog(this.lifetime.signal)).then((rows) => {
      if (this.disposed || this.localCatalogMutations !== mutations) return;
      if (rows === void 0) {
        this.localCatalogFresh = false;
        this.bumpRevision();
        return;
      }
      this.localCatalogFresh = true;
      let current = rows.filter((row) => row.sessionId !== "" && !decodeSessionId(row.sessionId).isRemote);
      for (const mutation of mutations) current = mutation(current);
      this.localCatalog = current;
      const known = new Set(current.map((row) => row.sessionId));
      this.readTracker.prune((id) => decodeSessionId(id).isRemote || known.has(id));
      for (const id of this.localStatus.keys()) if (!known.has(id)) this.localStatus.delete(id);
      for (const [id, request] of this.localPending) if (!known.has(request.sessionId)) this.localPending.delete(id);
      this.localStatus.clear();
      for (const row of current) {
        this.localStatus.set(row.sessionId, row.running);
        this.readTracker.observeRunning(row.sessionId, row.running);
      }
      this.schedulePersist();
      this.bumpRevision();
    }).catch(() => {
      if (!this.disposed && this.localCatalogMutations === mutations) {
        this.localCatalogFresh = false;
        this.bumpRevision();
      }
    }).finally(() => {
      if (this.localCatalogMutations === mutations) {
        this.localCatalogMutations = void 0;
        this.localCatalogInflight = void 0;
      }
    });
    this.localCatalogInflight = operation;
    return operation;
  }
  /**
   * Forget Host-owned read state for a local Session DSH deleted. Remote
   * removals arrive as `api-session/removed` on the device stream.
   */
  forgetLocalSession(sessionId2) {
    if (sessionId2 === "") return;
    if (decodeSessionId(sessionId2).isRemote) return;
    this.readTracker.remove(sessionId2);
    this.localStatus.delete(sessionId2);
    const mutation = (rows) => rows.filter((row) => row.sessionId !== sessionId2);
    this.localCatalogMutations?.push(mutation);
    if (this.localCatalog !== void 0) this.localCatalog = mutation(this.localCatalog);
    for (const [id, request] of this.localPending) if (request.sessionId === sessionId2) this.localPending.delete(id);
    this.schedulePersist();
    this.bumpRevision();
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
    for (const sessionId2 of this.readTracker.unreadIds()) {
      const decoded = decodeSessionId(sessionId2);
      if (decoded.isRemote && decoded.deviceId === deviceId) out.push(decoded.rawSessionId);
    }
    return out;
  }
  completionsForDevice(deviceId) {
    const out = /* @__PURE__ */ Object.create(null);
    for (const [id, completion] of Object.entries(this.readTracker.completionIds())) {
      const decoded = decodeSessionId(id);
      if (decoded.isRemote && decoded.deviceId === deviceId) out[decoded.rawSessionId] = completion;
    }
    return out;
  }
  /** Push the new unread set to the owning device's framed page. */
  publishUnreadState(sessionId2) {
    const decoded = decodeSessionId(sessionId2);
    if (!decoded.isRemote) return;
    this.nativeProxyManager.setUnreadState(decoded.deviceId, this.unreadForDevice(decoded.deviceId), this.completionsForDevice(decoded.deviceId));
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
    if (this.disposed || client === void 0 || !client.isConnected()) return;
    if (client.toView().catalogStale === true) return;
    for (const summary of client.sessionSummaries()) {
      const namespacedId = encodeRemoteSessionId(deviceId, summary.sessionId);
      if (summary.running) this.remoteRunningEvidence.set(namespacedId, client.connectionGeneration);
      this.readTracker.observeRunning(namespacedId, summary.running);
      if (!summary.running) this.remoteRunningEvidence.delete(namespacedId);
    }
    this.pruneDeviceReadState(deviceId);
  }
  /**
   * Drop Host-owned read state for Sessions the device's live catalog no
   * longer lists. A deleted Session can never be read again, so keeping its
   * unread marker would pin the tab badge forever.
   */
  pruneDeviceReadState(deviceId) {
    const client = this.clients.get(deviceId);
    if (this.disposed || client === void 0 || !client.catalogFresh) return;
    const known = new Set(
      client.sessionSummaries().map((summary) => encodeRemoteSessionId(deviceId, summary.sessionId))
    );
    this.readTracker.prune((sessionId2) => {
      const decoded = decodeSessionId(sessionId2);
      if (!decoded.isRemote) return true;
      if (decoded.deviceId !== deviceId) return true;
      return known.has(sessionId2);
    });
    this.schedulePersist();
  }
  /**
   * Refresh every connected device's catalog on a slow timer.
   *
   * `session/list` is the authoritative repair path for a missed
   * `api-session/status` frame: `reconcileSessionSummaries` emits the changed
   * rows and `reconcileRunningForDevice` turns them into running transitions
   * (and prunes read state for Sessions that disappeared).
   */
  startRunningReconcile() {
    if (this.runningReconcileTimer !== void 0) return;
    const timer = setInterval(() => {
      this.refreshConnectedCatalogs();
    }, RUNNING_RECONCILE_INTERVAL_MS);
    timer.unref?.();
    this.runningReconcileTimer = timer;
  }
  refreshConnectedCatalogs() {
    if (this.disposed) return;
    void this.refreshLocalCatalog();
    for (const client of this.clients.values()) {
      if (!client.isConnected()) continue;
      void client.refreshSessionCatalog(this.lifetime.signal).catch(() => {
      });
    }
  }
  /** Observe one remote event before it is forwarded to the local mirror. */
  observeRemoteFrame(deviceId, frame) {
    if (frame.type !== "emit") return;
    if (frame.event === "api-session/removed") {
      const [removedId] = frame.args;
      if (typeof removedId === "string") {
        this.readTracker.remove(removedId);
        this.schedulePersist();
      }
      return;
    }
    if (frame.event !== "api-session/status") return;
    const [sessionId2, running] = frame.args;
    if (typeof sessionId2 !== "string" || typeof running !== "boolean") return;
    const client = this.clients.get(deviceId);
    if (client === void 0 || !client.isConnected()) return;
    if (running) this.remoteRunningEvidence.set(sessionId2, client.connectionGeneration);
    this.readTracker.observeRunning(sessionId2, running);
    if (!running) this.remoteRunningEvidence.delete(sessionId2);
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
    if (!this.uiPreferences.crossHostReadState || this.disposed) return;
    if (this.sharedReadStateInFlight.has(deviceId)) {
      this.sharedReadStateDirty.add(deviceId);
      return;
    }
    if (this.sharedReadStatePushTimers.has(deviceId)) return;
    const timer = setTimeout(() => {
      this.sharedReadStatePushTimers.delete(deviceId);
      void this.pushSharedReadState(deviceId);
    }, delayMs);
    timer.unref?.();
    this.sharedReadStatePushTimers.set(deviceId, timer);
  }
  /** Resolve only a bounded batch of idle completions using real durable terminal events. */
  async promoteSharedCompletions(deviceId) {
    const client = this.clients.get(deviceId);
    if (this.disposed || !this.uiPreferences.crossHostReadState || client === void 0 || !client.catalogFresh) return;
    const generation = client.connectionGeneration;
    const entries = this.readTracker.entriesSnapshot();
    const eligible = client.sessionSummaries().filter((summary) => {
      const id = encodeRemoteSessionId(deviceId, summary.sessionId);
      const entry = entries[id];
      const binding = this.completionBindings.get(id);
      return !summary.running && entry?.completionId !== void 0 && !entry.completionId.startsWith("turn:") && entry.deleted !== true && binding?.completionId === entry.completionId && binding.generation === generation;
    });
    const offset = (this.completionBindingOffsets.get(deviceId) ?? 0) % Math.max(1, eligible.length);
    const candidates = [...eligible.slice(offset), ...eligible.slice(0, offset)].slice(0, 8);
    this.completionBindingOffsets.set(deviceId, offset + candidates.length);
    for (const summary of candidates) {
      const id = encodeRemoteSessionId(deviceId, summary.sessionId);
      const expected = entries[id].completionId;
      try {
        const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(5e3)]);
        const identity2 = await readRemoteCompletionIdentity(client, summary.sessionId, signal);
        if (this.disposed || this.clients.get(deviceId) !== client || generation !== client.connectionGeneration || !client.catalogFresh) return;
        if (identity2 !== void 0 && !client.sessionSummaries().find((row) => row.sessionId === summary.sessionId)?.running) {
          this.readTracker.promoteCompletion(id, expected, identity2);
        }
      } catch {
      }
    }
  }
  /** Read the remote file and merge every Host's Session entries locally. */
  async pullSharedReadState(deviceId) {
    const target = this.sharedReadStateTarget(deviceId);
    const client = this.clients.get(deviceId);
    const generation = client?.connectionGeneration;
    if (this.disposed || target === void 0 || this.sharedReadStateInFlight.has(deviceId)) return;
    this.sharedReadStateInFlight.add(deviceId);
    try {
      await this.promoteSharedCompletions(deviceId);
      if (this.disposed || this.clients.get(deviceId) !== client || client?.connectionGeneration !== generation) return;
      const read = await execSshCommand(
        target.transport,
        buildReadSharedStateCommand(target.path),
        8e3,
        this.lifetime.signal
      );
      if (!read.ok || this.disposed || this.clients.get(deviceId) !== client || client?.connectionGeneration !== generation) return;
      const doc = parseSharedReadDocument(read.stdout);
      if (doc !== void 0) this.mergeSharedReadDocument(deviceId, doc);
    } catch {
    } finally {
      this.sharedReadStateInFlight.delete(deviceId);
      if (this.sharedReadStateDirty.delete(deviceId) && !this.disposed) this.scheduleSharedReadStatePush(deviceId, 0);
    }
  }
  /**
   * Read-merge-write one Host section. Preserving the other sections is what
   * makes several Hosts converge; the write only happens after a successful
   * read so an unreachable file cannot clobber another machine's reminders.
   */
  async pushSharedReadState(deviceId) {
    const target = this.sharedReadStateTarget(deviceId);
    const client = this.clients.get(deviceId);
    const generation = client?.connectionGeneration;
    if (this.disposed || target === void 0 || this.sharedReadStateInFlight.has(deviceId)) return;
    this.sharedReadStateInFlight.add(deviceId);
    let committed = false;
    let failed = false;
    try {
      await this.promoteSharedCompletions(deviceId);
      if (this.disposed || this.clients.get(deviceId) !== client || client?.connectionGeneration !== generation) return;
      const read = await execSshCommand(
        target.transport,
        buildReadSharedStateCommand(target.path),
        8e3,
        this.lifetime.signal
      );
      if (!read.ok) throw new Error(read.error);
      if (this.disposed || this.clients.get(deviceId) !== client || client?.connectionGeneration !== generation) return;
      const existing = parseSharedReadDocument(read.stdout);
      if (existing !== void 0) this.mergeSharedReadDocument(deviceId, existing);
      const sessions = {};
      for (const [sessionId2, entry] of Object.entries(this.readTracker.entriesSnapshot())) {
        const decoded = decodeSessionId(sessionId2);
        if (!decoded.isRemote || decoded.deviceId !== deviceId) continue;
        if (decoded.rawSessionId === "__proto__" || decoded.rawSessionId === "constructor" || decoded.rawSessionId === "prototype") continue;
        sessions[decoded.rawSessionId] = entry;
      }
      const doc = buildSharedReadDocument(existing, this.hostId, sessions, Date.now());
      const write = await execSshCommand(
        target.transport,
        buildWriteSharedStateCommand(target.path, doc, this.hostId),
        15e3,
        this.lifetime.signal
      );
      if (!write.ok) throw new Error(write.error);
      if (this.disposed || this.clients.get(deviceId) !== client || client?.connectionGeneration !== generation) return;
      committed = true;
      this.sharedReadStateFailures.delete(deviceId);
    } catch {
      failed = true;
      if (!this.disposed && this.clients.get(deviceId) === client) {
        this.sharedReadStateFailures.set(deviceId, (this.sharedReadStateFailures.get(deviceId) ?? 0) + 1);
      }
    } finally {
      this.sharedReadStateInFlight.delete(deviceId);
      if (!committed && !this.disposed && this.sharedReadStateTarget(deviceId) !== void 0) {
        this.sharedReadStateDirty.add(deviceId);
      }
      if (this.sharedReadStateDirty.delete(deviceId) && !this.disposed) {
        const failures = this.sharedReadStateFailures.get(deviceId) ?? 0;
        const delay = failed ? Math.min(3e4, 1e3 * 2 ** Math.min(failures - 1, 5)) : 0;
        this.scheduleSharedReadStatePush(deviceId, delay);
      }
    }
  }
  mergeSharedReadDocument(deviceId, doc) {
    if (doc === void 0) return;
    const client = this.clients.get(deviceId);
    const known = client !== void 0 && client.isConnected() && client.toView().catalogStale !== true ? new Set(client.sessionSummaries().map((summary) => summary.sessionId)) : void 0;
    for (const section of Object.values(doc.hosts)) {
      for (const [rawSessionId, entry] of Object.entries(section.sessions)) {
        if (known !== void 0 && !known.has(rawSessionId)) continue;
        this.readTracker.mergeEntry(encodeRemoteSessionId(deviceId, rawSessionId), entry);
      }
    }
    this.readTracker.migrateLegacyIds();
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
   * Push the Client's selected remote Session into that device's framed page.
   *
   * Opening a Session from an attention menu switches to the device tab and
   * must also take the framed page to that conversation; `NativeDeviceProxy`
   * remembers the command and replays it when the frame's bridge connects, so
   * publishing before the tab is mounted is safe.
   */
  publishNativePaneSession(deviceId, clientId = "legacy") {
    const decoded = decodeSessionId(this.activeSessions.get(clientId)?.sessionId ?? "");
    if (!decoded.isRemote || decoded.deviceId !== deviceId) return;
    this.nativeProxyManager.openSession(deviceId, decoded.rawSessionId, clientId, this.activeSessions.get(clientId)?.seq);
  }
  paneKey(deviceId, clientId = "legacy") {
    return `${clientId}\0${deviceId}`;
  }
  setNativePaneState(deviceId, state, error, clientId = "legacy") {
    const previous = this.nativePanes.get(this.paneKey(deviceId, clientId));
    const nextError = error?.trim() === "" ? void 0 : error;
    const nextSessionId = state === "ready" ? previous?.sessionId : void 0;
    const nextTitle = state === "ready" ? previous?.title : void 0;
    const nextVisible = state === "ready" ? previous?.visible === true : false;
    if (previous?.state === state && previous.error === nextError && previous.sessionId === nextSessionId && previous.title === nextTitle && previous.visible === true === nextVisible) {
      return;
    }
    this.nativePanes.set(this.paneKey(deviceId, clientId), {
      state,
      ...nextError !== void 0 ? { error: nextError } : {},
      ...nextSessionId !== void 0 ? { sessionId: nextSessionId } : {},
      ...nextTitle !== void 0 ? { title: nextTitle } : {},
      ...nextVisible ? { visible: true } : {}
    });
    this.bumpRevision();
  }
  setNativePaneSelection(deviceId, sessionId2, clientId = "legacy") {
    const previous = this.nativePanes.get(this.paneKey(deviceId, clientId));
    if (previous?.sessionId === sessionId2) return;
    this.nativePanes.set(this.paneKey(deviceId, clientId), {
      ...previous,
      state: previous?.state ?? "idle",
      sessionId: sessionId2,
      ...previous?.error !== void 0 ? { error: previous.error } : {},
      ...previous?.title !== void 0 ? { title: previous.title } : {},
      ...previous?.visible === true ? { visible: true } : {}
    });
    this.bumpRevision();
  }
  /** Persist the framed page's own document title for window chrome. */
  setNativePaneTitle(deviceId, title, clientId = "legacy") {
    const previous = this.nativePanes.get(this.paneKey(deviceId, clientId));
    const next = sanitizeBridgeTitle(title);
    if (previous === void 0 && next === void 0) return;
    if (previous?.title === next) return;
    this.nativePanes.set(this.paneKey(deviceId, clientId), {
      ...previous,
      state: previous?.state ?? "idle",
      ...previous?.error !== void 0 ? { error: previous.error } : {},
      ...previous?.sessionId !== void 0 ? { sessionId: previous.sessionId } : {},
      ...next !== void 0 ? { title: next } : {},
      ...previous?.visible === true ? { visible: true } : {}
    });
    this.bumpRevision();
  }
  /**
   * Track whether any framed page for this device is actually on screen.
   * Read clearing and "currently viewed" detection must not treat a hidden
   * keep-alive page as if the user were reading it.
   */
  setNativePaneVisibility(deviceId, visible, clientId = "legacy") {
    const previous = this.nativePanes.get(this.paneKey(deviceId, clientId));
    if (previous === void 0 && !visible) return;
    if (previous?.visible === visible) return;
    this.nativePanes.set(this.paneKey(deviceId, clientId), {
      ...previous,
      state: previous?.state ?? "idle",
      ...previous?.error !== void 0 ? { error: previous.error } : {},
      ...previous?.sessionId !== void 0 ? { sessionId: previous.sessionId } : {},
      ...previous?.title !== void 0 ? { title: previous.title } : {},
      visible
    });
  }
  /** Persist the actually-bound native proxy port so the origin stays stable. */
  persistNativeProxyPort(deviceId, port) {
    const current = this.configs.get(deviceId);
    if (current === void 0 || current.nativeProxyPort === port) return;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return;
    this.configs.set(deviceId, { ...current, nativeProxyPort: port });
    this.schedulePersist();
  }
  withNativePane(view, clientId = "legacy") {
    const pane = this.nativePanes.get(this.paneKey(view.id, clientId));
    if (pane === void 0) return view;
    return {
      ...view,
      nativePaneState: pane.state,
      ...pane.error !== void 0 ? { nativePaneError: pane.error } : {},
      ...pane.sessionId !== void 0 ? { nativePaneSessionId: pane.sessionId } : {},
      ...pane.title !== void 0 ? { nativePaneTitle: pane.title } : {}
    };
  }
  startAll() {
    if (this.disposed) return;
    void this.refreshLocalCatalog();
    for (const config of this.configs.values()) {
      void this.mountClient(config);
    }
    this.startRunningReconcile();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const deviceId of this.mountGenerations.keys()) {
      this.mountGenerations.set(deviceId, (this.mountGenerations.get(deviceId) ?? 0) + 1);
    }
    this.lifetime.abort();
    this.localCatalogMutations = void 0;
    this.localCatalogInflight = void 0;
    this.localCatalogFresh = false;
    try {
      this.flushCatalogCache();
      this.saveToDisk();
    } catch {
    }
    for (const client of this.clients.values()) {
      try {
        client.stop();
      } catch {
      }
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
    if (this.runningReconcileTimer !== void 0) {
      clearInterval(this.runningReconcileTimer);
      this.runningReconcileTimer = void 0;
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
    const id = input.id ? DeviceId(input.id.trim()) : DeviceId(`dev-${randomUUID7().slice(0, 8)}`);
    if (id === LOCAL_DEVICE_ID) {
      return { ok: false, error: '"local" is a reserved device ID' };
    }
    this.storage.assertWritable();
    this.authManager.assertWritable();
    const previous = this.configs.get(id);
    const config = {
      id,
      name: name2,
      ...input.label !== void 0 && input.label.trim() !== "" ? { label: input.label.trim() } : {},
      enabled: input.enabled !== false,
      transport: input.transport,
      auth: input.auth ?? { mode: "auto" },
      keepNativeAlive: input.keepNativeAlive !== false,
      ...previous?.nativeProxyPort !== void 0 ? { nativeProxyPort: previous.nativeProxyPort } : {}
    };
    const previousSecret = this.authManager.snapshotDevice(id);
    const sanitized = sanitizeDeviceConfig(config);
    try {
      if (input.auth?.credential !== void 0) {
        this.authManager.setAuthCredential(id, input.auth.credential);
      }
      if (input.transport.kind === "ssh") {
        const keyPath = input.transport.privateKeyPath?.trim() ?? "";
        if (input.transport.passphrase !== void 0 && input.transport.passphrase.trim() !== "") {
          this.authManager.setSshPassphrase(id, input.transport.passphrase);
        } else if (keyPath === "") {
          this.authManager.setSshPassphrase(id, null);
        }
      }
      this.configs.set(id, sanitized);
      this.saveToDisk();
    } catch (error) {
      if (previous === void 0) this.configs.delete(id);
      else this.configs.set(id, previous);
      try {
        this.authManager.restoreDevice(id, previousSecret);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `${error instanceof Error ? error.message : String(error)}; credential rollback also failed`,
          { cause: error }
        );
      }
      throw error;
    }
    this.authStates.delete(id);
    const client = await this.mountClient(sanitized);
    this.bumpRevision();
    this.notifyWorkspacesChanged();
    return { ok: true, device: this.withNativePane(this.withAuthState(client.toView())) };
  }
  removeDevice(deviceId) {
    const existing = this.configs.get(deviceId);
    if (existing === void 0) return false;
    this.mountGenerations.set(deviceId, (this.mountGenerations.get(deviceId) ?? 0) + 1);
    this.storage.assertWritable();
    this.authManager.assertWritable();
    const previousSecret = this.authManager.snapshotDevice(deviceId);
    try {
      this.authManager.removeDevice(deviceId);
      this.configs.delete(deviceId);
      this.saveToDisk();
    } catch (error) {
      this.configs.set(deviceId, existing);
      try {
        this.authManager.restoreDevice(deviceId, previousSecret);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `${error instanceof Error ? error.message : String(error)}; credential rollback also failed`,
          { cause: error }
        );
      }
      throw error;
    }
    const client = this.clients.get(deviceId);
    if (client !== void 0) {
      client.stop();
      this.clients.delete(deviceId);
    }
    this.nativeProxyManager.removeProxy(deviceId);
    this.authStates.delete(deviceId);
    this.catalogs.delete(deviceId);
    this.scheduleCatalogPersist();
    for (const [clientId, selection] of this.activeSessions) {
      const owner = decodeSessionId(selection.sessionId ?? "");
      if (owner.isRemote && owner.deviceId === deviceId) this.activeSessions.set(clientId, { seq: selection.seq });
    }
    for (const key of this.nativePanes.keys()) {
      if (key.endsWith(`\0${deviceId}`)) this.nativePanes.delete(key);
    }
    this.nativeGroups.delete(deviceId);
    this.sharedReadStateInitialized.delete(deviceId);
    this.sharedReadStateDirty.delete(deviceId);
    this.sharedReadStateFailures.delete(deviceId);
    const pendingPush = this.sharedReadStatePushTimers.get(deviceId);
    if (pendingPush !== void 0) {
      clearTimeout(pendingPush);
      this.sharedReadStatePushTimers.delete(deviceId);
    }
    this.readTracker.retain((sessionId2) => {
      const decoded = decodeSessionId(sessionId2);
      return !decoded.isRemote || decoded.deviceId !== deviceId;
    });
    this.lastDeviceStates.delete(deviceId);
    this.schedulePersist();
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
    const storedConfig = this.configs.get(deviceId);
    const client = this.clients.get(deviceId);
    if (storedConfig === void 0 || client === void 0) {
      return { ok: false, error: "Device is not configured" };
    }
    if (credential !== void 0 && credential.trim() !== "") {
      this.authManager.setAuthCredential(deviceId, credential.trim());
    }
    const config = this.hydrateConfig(storedConfig);
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
    const existingId = input.id !== void 0 && input.id.trim() !== "" ? DeviceId(input.id.trim()) : void 0;
    const existingSecret = existingId !== void 0 ? this.authManager.storedSecret(existingId) : void 0;
    const effectiveTransport = input.transport.kind === "ssh" && (input.transport.passphrase === void 0 || input.transport.passphrase === "") && existingSecret?.sshPassphrase !== void 0 && existingSecret.sshPassphrase !== "" && input.transport.privateKeyPath !== void 0 && input.transport.privateKeyPath.trim() !== "" ? { ...input.transport, passphrase: existingSecret.sshPassphrase } : input.transport;
    const effectiveCredential = input.auth?.credential?.trim() || existingSecret?.authCredential;
    let baseUrl;
    let cleanup;
    if (effectiveTransport.kind === "ssh") {
      const probed = await probeSshTunnel(effectiveTransport);
      if (!probed.ok) return probed;
      baseUrl = probed.baseUrl;
      cleanup = probed.close;
    } else {
      baseUrl = effectiveTransport.baseUrl.replace(/\/+$/, "");
    }
    const probeAuth = new DeviceAuthManager(void 0);
    const tempConfig = {
      id: DeviceId(`probe-${randomUUID7()}`),
      name: input.name || "probe",
      enabled: true,
      transport: effectiveTransport,
      auth: {
        mode: input.auth?.mode ?? "auto",
        ...effectiveCredential !== void 0 && effectiveCredential !== "" ? { credential: effectiveCredential } : {}
      }
    };
    try {
      const t0 = Date.now();
      const authRes = await probeAuth.ensureAuthenticated(tempConfig, baseUrl, true);
      if (!authRes.ok) return authRes;
      const headers = {
        ...probeAuth.getAuthHeaders(tempConfig),
        "content-type": "application/json"
      };
      const selfProbe = await requestRemote(new URL("/multi-device/api", baseUrl).href, {
        method: "GET",
        headers,
        timeoutMs: 3e3
      }).catch(() => void 0);
      if (selfProbe !== void 0 && selfProbe.status === 200) {
        try {
          const parsedSelf = JSON.parse(selfProbe.body.toString("utf8"));
          if (parsedSelf?.value?.hostId === this.hostId) {
            return { ok: false, error: "Self-loop rejected: target points to this local DSH host" };
          }
        } catch {
        }
      }
      const res02 = await requestRemote(new URL("/api/session/list", baseUrl).href, {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "client-request",
          rpcId: randomUUID7(),
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
            rpcId: randomUUID7(),
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
      probeAuth.removeDevice(tempConfig.id);
      cleanup?.();
    }
  }
  /**
   * Local archived Session IDs. A missing provider (older callers, tests that
   * do not care) or a stale controller simply means "nothing archived", so a
   * read failure must never break the whole snapshot.
   */
  localArchivedIds() {
    try {
      return (this.localHost.localArchivedSessionIds?.() ?? []).map(String);
    } catch {
      return [];
    }
  }
  /** Local subagent-origin Session IDs; same failure policy as {@link localArchivedIds}. */
  localSubagentIds() {
    try {
      return (this.localHost.localSubagentSessionIds?.() ?? []).map(String);
    } catch {
      return [];
    }
  }
  /** Build the complete snapshot for the Client UI. */
  snapshot(clientId = "legacy") {
    const cached = this.snapshotCache.get(clientId);
    if (cached?.revision === this.revision) return cached.value;
    const archivedSessionIds = new Set(this.localArchivedIds());
    const subagentSessionIds = new Set(this.localSubagentIds());
    const attentionFacts = (this.localCatalog ?? []).map((row) => ({
      ...row,
      deviceId: LOCAL_DEVICE_ID,
      archived: archivedSessionIds.has(row.sessionId),
      origin: subagentSessionIds.has(row.sessionId) ? "subagent" : row.origin
    }));
    const localPendingBySession = /* @__PURE__ */ new Map();
    for (const pending of this.localPending.values()) {
      const old = localPendingBySession.get(pending.sessionId);
      localPendingBySession.set(pending.sessionId, { count: (old?.count ?? 0) + 1, kind: pending.kind });
    }
    for (let index = 0; index < attentionFacts.length; index += 1) {
      const row = attentionFacts[index];
      const pending = localPendingBySession.get(row.sessionId);
      if (pending !== void 0) attentionFacts[index] = { ...row, pendingInteractionKind: pending.kind, pendingRequestCount: pending.count };
    }
    for (const client of this.clients.values()) {
      const summaries = client.sessionSummaries();
      const pendingBySession = /* @__PURE__ */ new Map();
      for (const pending of client.pendingInteractionList()) {
        const previous = pendingBySession.get(pending.rawSessionId);
        pendingBySession.set(pending.rawSessionId, { count: (previous?.count ?? 0) + 1, kind: pending.kind });
      }
      const childrenByParent = /* @__PURE__ */ new Map();
      for (const summary of summaries) if (summary.origin === "subagent" && summary.running && summary.parentSessionId !== void 0) {
        childrenByParent.set(summary.parentSessionId, (childrenByParent.get(summary.parentSessionId) ?? 0) + 1);
      }
      const archived = new Set(client.archivedIds());
      for (const archivedId of archived) {
        archivedSessionIds.add(encodeRemoteSessionId(client.id, archivedId));
      }
      for (const summary of summaries) {
        const namespacedId = encodeRemoteSessionId(client.id, summary.sessionId);
        if (summary.origin === "subagent") subagentSessionIds.add(namespacedId);
        const pending = pendingBySession.get(summary.sessionId);
        attentionFacts.push({
          sessionId: namespacedId,
          deviceId: client.id,
          running: summary.running,
          blank: summary.blank,
          origin: summary.origin,
          archived: archived.has(summary.sessionId),
          runningSubagentCount: childrenByParent.get(summary.sessionId) ?? 0,
          ...pending !== void 0 ? { pendingInteractionKind: pending.kind, pendingRequestCount: pending.count } : {}
        });
      }
    }
    const attentionByDevice = selectDeviceAttention(attentionFacts, new Set(this.readTracker.unreadIds()), {
      currentSessionId: this.activeSessions.get(clientId)?.sessionId
    });
    attentionByDevice[LOCAL_DEVICE_ID] = { ...attentionByDevice[LOCAL_DEVICE_ID] ?? emptyDeviceAttention(), fresh: this.localCatalogFresh };
    for (const client of this.clients.values()) {
      const fresh = client.catalogFresh;
      const rawSelected = this.nativePanes.get(this.paneKey(client.id, clientId))?.sessionId;
      const currentSessionId = rawSelected === void 0 ? this.activeSessions.get(clientId)?.sessionId : encodeRemoteSessionId(client.id, rawSelected);
      const projected = selectDeviceAttention(attentionFacts.filter((fact) => fact.deviceId === client.id), new Set(this.readTracker.unreadIds()), { currentSessionId, fresh });
      attentionByDevice[client.id] = projected[client.id] ?? emptyDeviceAttention(fresh);
    }
    const result = {
      revision: this.revision,
      hostId: this.hostId,
      hostEpoch: this.hostEpoch,
      devices: [...this.clients.values()].map((c) => {
        const attention = attentionByDevice[c.id];
        const view = this.withNativePane(this.withAuthState({
          ...c.toView(),
          runningSessionCount: attention.runningSessionIds.length,
          pendingApprovalCount: attention.pendingSessionIds.length
        }), clientId);
        const sessionListError = this.sessionListErrors.get(view.id);
        return sessionListError === void 0 ? view : { ...view, sessionListError };
      }),
      sshConfigHosts: listSshConfigHosts(),
      unreadSessionIds: this.readTracker.unreadIds(),
      readCompletions: this.readTracker.completionIds(),
      attentionByDevice,
      archivedSessionIds: [...archivedSessionIds].sort(),
      subagentSessionIds: [...subagentSessionIds].sort(),
      ui: { ...this.uiPreferences }
    };
    this.snapshotCache.delete(clientId);
    this.snapshotCache.set(clientId, { revision: this.revision, value: result });
    while (this.snapshotCache.size > 16) {
      const oldest = this.snapshotCache.keys().next().value;
      if (oldest === void 0) break;
      this.snapshotCache.delete(oldest);
    }
    return result;
  }
  /** Persisted display preferences (Snapshot also carries them under `ui`). */
  ui() {
    return this.uiPreferences;
  }
  /** Update and persist display preferences; unknown keys are ignored by the type. */
  updateUiPreferences(patch) {
    this.storage.assertWritable();
    const previous = this.uiPreferences;
    this.uiPreferences = {
      crossHostReadState: patch.crossHostReadState === void 0 ? this.uiPreferences.crossHostReadState : patch.crossHostReadState === true
    };
    try {
      this.saveToDisk();
    } catch (error) {
      this.uiPreferences = previous;
      throw error;
    }
    this.bumpRevision();
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
  resolveSessionOwner(sessionId2) {
    const decoded = decodeSessionId(sessionId2);
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
    if (this.disposed) throw new Error("Device registry is disposed");
    const mountGeneration = (this.mountGenerations.get(storedConfig.id) ?? 0) + 1;
    this.mountGenerations.set(storedConfig.id, mountGeneration);
    const isMountCurrent = (client2) => !this.disposed && this.mountGenerations.get(storedConfig.id) === mountGeneration && this.clients.get(storedConfig.id) === client2;
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
      onAuthState: (deviceId, state, error) => {
        this.setAuthState(deviceId, state, error);
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
    const proxyUrl = await this.nativeProxyManager.ensureProxy(config, () => client.effectiveBaseUrl());
    if (!isMountCurrent(client)) return client;
    client.setNativeProxyUrl(proxyUrl);
    if (proxyUrl !== void 0) this.bumpRevision();
    if (!isMountCurrent(client)) return client;
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
    const resolved = resolveSshConfigForTransport(transport);
    const hostPart = resolved.hostName.trim().toLowerCase();
    const remotePort = transport.remotePort ?? 3080;
    const sshPort = resolved.port;
    return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostPart) && sshPort === 22 && resolved.proxyJump === void 0 && resolved.proxyCommand === void 0 && remotePort === localPort;
  }
  bumpRevision() {
    this.revision += 1;
    this.snapshotCache.clear();
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
    let migratedSecrets = false;
    try {
      const raw = this.storage.read();
      if (raw === void 0) return;
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
      if (raw.ui && typeof raw.ui === "object") {
        this.uiPreferences = { crossHostReadState: raw.ui.crossHostReadState === true };
      }
      const persistedCatalogDocument = this.catalogStorage.read();
      const restoredCatalogs = persistedCatalogDocument !== void 0 ? decodeCatalogDocument(persistedCatalogDocument) : raw.catalogs && typeof raw.catalogs === "object" ? decodeLegacyCatalogs(raw.catalogs) : void 0;
      if (persistedCatalogDocument === void 0 && restoredCatalogs !== void 0) this.catalogMigrationPending = true;
      for (const [deviceId, cache] of restoredCatalogs ?? []) {
        if (this.configs.has(deviceId)) this.catalogs.set(deviceId, cache);
      }
      for (const [deviceId, groups] of Object.entries(sanitizeNativeGroups(raw.nativeGroups))) {
        if (this.configs.has(deviceId)) this.nativeGroups.set(deviceId, groups);
      }
      if (raw.readState && typeof raw.readState === "object") {
        this.readTracker.hydrate(raw.readState.entries);
        this.readTracker.retain((sessionId2) => {
          const decoded = decodeSessionId(sessionId2);
          return !decoded.isRemote || this.configs.has(decoded.deviceId);
        });
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
    this.catalogDirty = true;
  }
  /**
   * Capture every live client's catalog and write it to disk. Debounced: the
   * session/workspace streams can burst many changes per turn, and the file is
   * rewritten atomically on each save.
   */
  scheduleCatalogPersist() {
    this.catalogDirty = true;
    if (this.catalogPersistTimer !== void 0 || this.disposed) return;
    const delay = Math.min(3e4, 3e3 * 2 ** Math.min(this.catalogPersistFailures, 3));
    this.catalogPersistTimer = setTimeout(() => {
      this.catalogPersistTimer = void 0;
      try {
        this.flushCatalogCache();
        void this.persistCatalogsAsync().catch(() => {
        });
      } catch {
      }
    }, delay);
    if (typeof this.catalogPersistTimer === "object" && this.catalogPersistTimer !== null) {
      const timer = this.catalogPersistTimer;
      timer.unref?.();
    }
  }
  /** Coalesce bursts into the newest document while one async write is active. */
  persistCatalogsAsync() {
    if (!this.catalogDirty && !this.catalogMigrationPending) return this.catalogWrite ?? Promise.resolve();
    this.catalogWriteAgain = true;
    if (this.catalogWrite !== void 0) return this.catalogWrite;
    const operation = (async () => {
      try {
        do {
          this.catalogWriteAgain = false;
          this.catalogDirty = false;
          await this.catalogStorage.writeAsync(encodeCatalogDocument(this.catalogs));
          if (this.catalogMigrationPending) {
            this.catalogMigrationPending = false;
            try {
              this.saveToDisk();
            } catch (error) {
              this.catalogMigrationPending = true;
              throw error;
            }
          }
        } while (this.catalogWriteAgain || this.catalogDirty || this.catalogMigrationPending);
        this.catalogPersistFailures = 0;
        const recovered = this.catalogPersistenceError !== void 0;
        this.catalogPersistenceError = void 0;
        if (recovered) this.bumpRevision();
      } catch (error) {
        this.catalogDirty = true;
        this.catalogPersistFailures += 1;
        this.catalogPersistenceError = error instanceof Error ? error.message : String(error);
        this.bumpRevision();
        if (!this.disposed) this.scheduleCatalogPersist();
        throw error;
      } finally {
        this.catalogWrite = void 0;
      }
    })();
    this.catalogWrite = operation;
    return operation;
  }
  /** Wait for the final asynchronous catalog write during Host shutdown. */
  async flushPersistence() {
    if (this.catalogPersistTimer !== void 0) {
      clearTimeout(this.catalogPersistTimer);
      this.catalogPersistTimer = void 0;
    }
    this.flushCatalogCache();
    await this.persistCatalogsAsync();
  }
  /** Copy each client's current catalog into the durable map. */
  flushCatalogCache() {
    for (const [deviceId, client] of this.clients.entries()) {
      const snapshot = client.catalogSnapshot();
      if (snapshot.syncedAt === 0 && snapshot.sessions.length === 0 && snapshot.workspaces.length === 0) continue;
      this.catalogs.set(deviceId, trimCatalog(snapshot));
      this.catalogDirty = true;
    }
  }
  saveToDisk() {
    const readEntries = this.readTracker.entriesSnapshot();
    const doc = {
      version: 1,
      devices: [...this.configs.values()],
      ui: this.uiPreferences,
      hostId: this.hostId,
      ...this.catalogMigrationPending && this.catalogs.size > 0 ? { catalogs: Object.fromEntries(this.catalogs) } : {},
      ...this.nativeGroups.size > 0 ? { nativeGroups: Object.fromEntries(this.nativeGroups) } : {},
      ...Object.keys(readEntries).length > 0 ? { readState: { entries: readEntries } } : {}
    };
    this.storage.write(doc);
  }
};
var CATALOG_ID_LIMIT = 5e3;
function trimCatalog(cache) {
  const sessions = cache.sessions;
  const workspaces = cache.workspaces;
  const archivedSessionIds = cache.archivedSessionIds.length > CATALOG_ID_LIMIT ? cache.archivedSessionIds.slice(0, CATALOG_ID_LIMIT) : cache.archivedSessionIds;
  const pinnedSessionIds = cache.pinnedSessionIds.length > CATALOG_ID_LIMIT ? cache.pinnedSessionIds.slice(0, CATALOG_ID_LIMIT) : cache.pinnedSessionIds;
  const trimmed = sessions !== cache.sessions || workspaces !== cache.workspaces || archivedSessionIds !== cache.archivedSessionIds || pinnedSessionIds !== cache.pinnedSessionIds;
  return {
    ...cache,
    sessions,
    workspaces,
    archivedSessionIds,
    pinnedSessionIds,
    catalogTruncated: trimmed
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
var MAX_ACTIVE_CONTROL_REQUESTS = 64;
var CONTROL_REQUEST_DEADLINE_MS = 6e4;
var BODY_READ_DEADLINE_MS = 15e3;
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
var CONTROL_ACTIONS = /* @__PURE__ */ new Set([
  "snapshot",
  "diagnostics",
  "upsertDevice",
  "removeDevice",
  "reconnectDevice",
  "authenticateDevice",
  "testDevice",
  "listSshKeys",
  "setActiveSession",
  "markSessionRead",
  "markDeviceRead",
  "setUiPreferences"
]);
function parseControlPlaneRequest(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a request object");
  const candidate = value;
  if (typeof candidate.action !== "string" || !CONTROL_ACTIONS.has(candidate.action)) throw new Error("Unknown action");
  if (candidate.payload !== void 0 && (candidate.payload === null || typeof candidate.payload !== "object" || Array.isArray(candidate.payload))) {
    throw new Error("Payload must be an object");
  }
  const request = candidate;
  validateControlPlanePayload(request);
  return request;
}
function payloadString(payload, key, required = true, max = 4096, allowEmpty = false) {
  const value = payload[key];
  if (value === void 0 && !required) return;
  if (typeof value !== "string" || value.length > max || !allowEmpty && value.trim() === "") {
    throw new Error(`${key} must be ${required ? "a" : "an optional"} ${allowEmpty ? "" : "non-empty "}string of at most ${max} characters`);
  }
}
function payloadBoolean(payload, key, required = false) {
  const value = payload[key];
  if (value === void 0 && !required) return;
  if (typeof value !== "boolean") throw new Error(`${key} must be ${required ? "a" : "an optional"} boolean`);
}
function payloadPort(payload, key) {
  const value = payload[key];
  if (value === void 0) return;
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${key} must be an integer from 1 to 65535`);
}
function payloadObject(value, key) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} must be an object`);
  return value;
}
function validateDeviceInput(payload) {
  payloadString(payload, "id", false, 512);
  payloadString(payload, "name", true, 256);
  payloadString(payload, "label", false, 256, true);
  payloadBoolean(payload, "enabled");
  payloadBoolean(payload, "keepNativeAlive");
  const transport = payloadObject(payload.transport, "transport");
  if (transport.kind === "ssh") {
    payloadString(transport, "host");
    for (const key of ["username", "privateKeyPath", "proxyJump", "remoteBindHost", "remoteDshHome"]) payloadString(transport, key, false, 16384);
    payloadString(transport, "passphrase", false, 1024 * 1024, true);
    payloadPort(transport, "port");
    payloadPort(transport, "remotePort");
    payloadBoolean(transport, "bootstrapFromRemoteCredentials");
    if (transport.engine !== void 0 && !["auto", "system-ssh", "ssh2"].includes(String(transport.engine))) throw new Error("Invalid SSH engine");
  } else if (transport.kind === "direct") {
    payloadString(transport, "baseUrl", true, 16384);
    payloadBoolean(transport, "rejectUnauthorized");
  } else throw new Error('transport.kind must be "ssh" or "direct"');
  if (payload.auth !== void 0) {
    const auth = payloadObject(payload.auth, "auth");
    if (!["auto", "token", "cookie", "bearer", "none"].includes(String(auth.mode))) throw new Error("Invalid auth mode");
    payloadString(auth, "credential", false, 1024 * 1024, true);
  }
}
function validateControlPlanePayload(request) {
  const payload = request.payload ?? {};
  payloadString(payload, "clientId", false, 128);
  switch (request.action) {
    case "diagnostics":
      if (payload.client !== void 0) payloadObject(payload.client, "client");
      break;
    case "setActiveSession":
      payloadString(payload, "sessionId", false, 4096, true);
      if (payload.requestSeq !== void 0 && (!Number.isSafeInteger(payload.requestSeq) || payload.requestSeq < 0)) throw new Error("requestSeq must be a non-negative safe integer");
      break;
    case "markSessionRead":
      payloadString(payload, "sessionId");
      payloadString(payload, "expectedCompletionId", false, 1024);
      break;
    case "markDeviceRead":
    case "removeDevice":
    case "reconnectDevice":
      payloadString(payload, "deviceId", true, 512);
      break;
    case "authenticateDevice":
      payloadString(payload, "deviceId", true, 512);
      payloadString(payload, "credential", false, 1024 * 1024, true);
      break;
    case "upsertDevice":
    case "testDevice":
      validateDeviceInput(payload);
      break;
    case "setUiPreferences":
      payloadBoolean(payload, "crossHostReadState");
      break;
    default:
      break;
  }
}
function optionalNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function optionalString(value) {
  return typeof value === "string" && value !== "" ? value : void 0;
}
function readDiagnosticsClientReport(raw) {
  if (typeof raw !== "object" || raw === null) return void 0;
  const record = raw;
  const report = {
    ...optionalNumber(record.innerWidth) !== void 0 ? { innerWidth: optionalNumber(record.innerWidth) } : {},
    ...optionalNumber(record.innerHeight) !== void 0 ? { innerHeight: optionalNumber(record.innerHeight) } : {},
    ...optionalNumber(record.devicePixelRatio) !== void 0 ? { devicePixelRatio: optionalNumber(record.devicePixelRatio) } : {},
    ...optionalNumber(record.barLeft) !== void 0 ? { barLeft: optionalNumber(record.barLeft) } : {},
    ...optionalNumber(record.barWidth) !== void 0 ? { barWidth: optionalNumber(record.barWidth) } : {},
    ...optionalNumber(record.barClampedWidth) !== void 0 ? { barClampedWidth: optionalNumber(record.barClampedWidth) } : {},
    ...typeof record.compact === "boolean" ? { compact: record.compact } : {},
    ...optionalString(record.barObstruction) !== void 0 ? { barObstruction: optionalString(record.barObstruction) } : {},
    ...optionalString(record.userAgent) !== void 0 ? { userAgent: optionalString(record.userAgent) } : {}
  };
  return Object.keys(report).length === 0 ? void 0 : report;
}
function buildDiagnostics(snapshot, client, now = Date.now()) {
  const devices = snapshot.devices.map((device) => ({
    id: String(device.id),
    name: device.name,
    enabled: device.enabled,
    state: device.state,
    transportKind: device.transportKind,
    protocolVersion: device.protocolVersion,
    realtime: device.realtime,
    ...device.remoteDshVersion !== void 0 ? { remoteDshVersion: device.remoteDshVersion } : {},
    ...device.authState !== void 0 ? { authState: device.authState } : {},
    sessionCount: device.sessionCount,
    runningSessionCount: device.runningSessionCount,
    allSessionCount: device.allSessionCount ?? device.sessionCount,
    allRunningSessionCount: device.allRunningSessionCount ?? device.runningSessionCount,
    workspaceCount: device.workspaceCount,
    pendingApprovalCount: device.pendingApprovalCount,
    catalogStale: device.catalogStale === true,
    ...device.lastSyncedAt !== void 0 ? { lastSyncedAt: device.lastSyncedAt } : {},
    ...device.lastError !== void 0 ? { lastError: device.lastError } : {},
    ...device.sessionListError !== void 0 ? { sessionListError: device.sessionListError } : {}
  }));
  return {
    kind: "dsh-multi-device/diagnostics",
    generatedAt: now,
    hostId: snapshot.hostId ?? "unknown",
    counts: {
      devices: devices.length,
      connectedDevices: devices.filter((device) => device.state === "connected").length,
      staleDevices: devices.filter((device) => device.catalogStale).length,
      runningSessions: devices.reduce((total, device) => total + device.runningSessionCount, 0),
      allRunningSessions: devices.reduce((total, device) => total + device.allRunningSessionCount, 0)
    },
    devices,
    ...snapshot.attentionByDevice !== void 0 ? { attentionByDevice: snapshot.attentionByDevice } : {},
    ...client !== void 0 ? { client } : {}
  };
}
var MultiDeviceControlPlane = class {
  constructor(registry, admitRequest) {
    this.registry = registry;
    this.admitRequest = admitRequest;
  }
  activeControlRequests = 0;
  /** Execute one control-plane action and return a JSON-serializable result envelope. */
  async dispatch(request, signal) {
    const payload = request.payload ?? {};
    const clientId = typeof payload.clientId === "string" ? payload.clientId.slice(0, 128) : "legacy";
    try {
      validateControlPlanePayload(request);
      switch (request.action) {
        case "snapshot":
          return { ok: true, value: this.registry.snapshot(clientId) };
        case "diagnostics":
          return {
            ok: true,
            value: buildDiagnostics(
              this.registry.snapshot(clientId),
              readDiagnosticsClientReport(payload.client)
            )
          };
        case "setActiveSession": {
          const raw = payload.sessionId;
          const sessionId2 = typeof raw === "string" && raw !== "" ? raw : void 0;
          const requestSeq = typeof payload.requestSeq === "number" && Number.isFinite(payload.requestSeq) ? payload.requestSeq : 0;
          this.registry.setActiveSession(sessionId2, requestSeq, clientId);
          return { ok: true, value: { accepted: true } };
        }
        case "markSessionRead": {
          const sessionId2 = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
          if (sessionId2 === "") {
            return { ok: false, error: "sessionId is required" };
          }
          const expectedCompletionId = typeof payload.expectedCompletionId === "string" ? payload.expectedCompletionId : void 0;
          const changed = this.registry.markSessionRead(sessionId2, expectedCompletionId);
          return {
            ok: true,
            value: { changed, snapshot: this.registry.snapshot(clientId) }
          };
        }
        case "markDeviceRead": {
          const deviceId = typeof payload.deviceId === "string" ? payload.deviceId.trim() : "";
          if (deviceId === "") {
            return { ok: false, error: "deviceId is required" };
          }
          const changed = this.registry.markDeviceRead(String(deviceId));
          return {
            ok: true,
            value: { changed, snapshot: this.registry.snapshot(clientId) }
          };
        }
        case "upsertDevice": {
          const input = payload;
          const res = await this.registry.upsertDevice(input);
          if (!res.ok) return res;
          return { ok: true, value: { device: res.device, snapshot: this.registry.snapshot(clientId) } };
        }
        case "removeDevice": {
          const deviceId = String(payload.deviceId ?? "");
          if (deviceId === "") return { ok: false, error: "Device id is required" };
          const removed = this.registry.removeDevice(deviceId);
          if (!removed) return { ok: false, error: "Device is not configured" };
          return { ok: true, value: { removed, snapshot: this.registry.snapshot(clientId) } };
        }
        case "reconnectDevice": {
          const deviceId = String(payload.deviceId ?? "");
          if (deviceId === "") return { ok: false, error: "Device id is required" };
          const triggered = this.registry.reconnectDevice(deviceId);
          if (!triggered) return { ok: false, error: "Device is not configured" };
          return { ok: true, value: { triggered, snapshot: this.registry.snapshot(clientId) } };
        }
        case "authenticateDevice": {
          const deviceId = String(payload.deviceId ?? "");
          if (deviceId === "") return { ok: false, error: "Device id is required" };
          const credential = typeof payload.credential === "string" ? payload.credential : void 0;
          const res = await this.registry.authenticateDevice(deviceId, credential);
          if (!res.ok) return res;
          return { ok: true, value: { ...res, snapshot: this.registry.snapshot(clientId) } };
        }
        case "testDevice": {
          const input = payload;
          const res = await this.registry.testDeviceConnection(input);
          if (!res.ok) return res;
          return { ok: true, value: res };
        }
        case "listSshKeys":
          return { ok: true, value: { keys: this.registry.listSshKeys() } };
        case "setUiPreferences": {
          this.registry.updateUiPreferences({
            ...typeof payload.crossHostReadState === "boolean" ? { crossHostReadState: payload.crossHostReadState } : {}
          });
          return { ok: true, value: this.registry.snapshot(clientId) };
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
      const clientId = readClientId(req);
      const snapshot = this.registry.snapshot(clientId);
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
    if (this.activeControlRequests >= MAX_ACTIVE_CONTROL_REQUESTS) {
      res.writeHead(429, { "content-type": "application/json; charset=utf-8", "retry-after": "1" });
      res.end(JSON.stringify({ ok: false, error: "Control plane is busy; retry after the current operations finish" }));
      return;
    }
    this.activeControlRequests += 1;
    let dispatchStarted = false;
    try {
      const bodyBuf = await readBody(req);
      if (bodyBuf === null) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "Invalid request body" }));
        return;
      }
      let parsed;
      try {
        parsed = parseControlPlaneRequest(JSON.parse(bodyBuf.toString("utf8")));
      } catch {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "Malformed control-plane request" }));
        return;
      }
      const operationAbort = new AbortController();
      const abortOperation = () => {
        operationAbort.abort();
      };
      req.once("aborted", abortOperation);
      res.once("close", abortOperation);
      const work = this.dispatch(parsed, operationAbort.signal);
      dispatchStarted = true;
      const release = () => {
        this.activeControlRequests = Math.max(0, this.activeControlRequests - 1);
        req.off("aborted", abortOperation);
        res.off("close", abortOperation);
      };
      void work.then(release, release);
      const deadlineMarker = Symbol("control-plane-deadline");
      let timer;
      const deadline = new Promise((resolve2) => {
        timer = setTimeout(() => resolve2(deadlineMarker), CONTROL_REQUEST_DEADLINE_MS);
        timer.unref?.();
      });
      const outcome = await Promise.race([work, deadline]);
      if (timer !== void 0) clearTimeout(timer);
      if (outcome === deadlineMarker) {
        if (!res.destroyed) {
          res.writeHead(504, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          res.end(JSON.stringify({ ok: false, error: "Operation deadline exceeded; its result is unknown and non-idempotent retries may be unsafe" }));
        }
        return;
      }
      if (res.destroyed) return;
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      res.end(JSON.stringify(outcome));
    } finally {
      if (!dispatchStarted) this.activeControlRequests = Math.max(0, this.activeControlRequests - 1);
    }
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
    const clientId = readClientId(req);
    let closed = false;
    let queued = false;
    let flushing = false;
    let heartbeat;
    let unsubscribe;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      queued = false;
      if (heartbeat !== void 0) clearInterval(heartbeat);
      unsubscribe?.();
    };
    const waitForDrain = () => new Promise((resolve2) => {
      const done = () => {
        res.off("drain", done);
        res.off("close", done);
        res.off("error", done);
        resolve2();
      };
      res.once("drain", done);
      res.once("close", done);
      res.once("error", done);
    });
    const flush = async () => {
      if (flushing || closed) return;
      flushing = true;
      try {
        while (queued && !closed) {
          queued = false;
          const snap = this.registry.snapshot(clientId);
          if (!res.write(`event: snapshot
data: ${JSON.stringify(snap)}

`) && !closed) {
            await waitForDrain();
          }
        }
      } catch {
        if (!closed) res.destroy();
      } finally {
        flushing = false;
        if (queued && !closed) void flush();
      }
    };
    const sendSnapshot = () => {
      queued = true;
      void flush();
    };
    req.once("close", cleanup);
    res.once("close", cleanup);
    res.on("error", cleanup);
    unsubscribe = this.registry.onSnapshotChanged(sendSnapshot);
    sendSnapshot();
    heartbeat = setInterval(() => {
      if (!closed && !res.writableNeedDrain) res.write(": ping\n\n");
    }, 15e3);
  }
  isAuthorized(req) {
    if (this.admitRequest !== void 0) {
      return this.admitRequest(req);
    }
    return isLoopbackHostHeader(req.headers.host);
  }
};
function readBody(req) {
  return new Promise((resolve2) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve2(value);
    };
    const timer = setTimeout(() => {
      finish(null);
      req.destroy();
    }, BODY_READ_DEADLINE_MS);
    timer.unref?.();
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        finish(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => finish(Buffer.concat(chunks)));
    req.on("aborted", () => finish(null));
    req.on("error", () => finish(null));
  });
}
function readClientId(req) {
  try {
    return new URL(req.url ?? "/", "http://localhost").searchParams.get("clientId")?.slice(0, 128) || "legacy";
  } catch {
    return "legacy";
  }
}

// src/index.ts
var name = "dsh-multi-device";
var inject = ["webServer"];
var Config = z.object({
  dataFile: z.string(),
  secretsFile: z.string(),
  features: z.object({
    sshTunnel: z.boolean().default(true),
    directTransport: z.boolean().default(false)
  }).default({})
});
function appendBootLog(dshHome, line) {
  try {
    appendFileSync(join5(dshHome, "dsh-multi-device-boot.log"), `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
  } catch {
  }
}
function apply(ctx, config) {
  const resolved = Config(config ?? {});
  const dshHome = process.env.DSH_HOME ?? join5(homedir3(), ".dsh");
  const defaults = resolved.dataFile !== void 0 && resolved.secretsFile !== void 0 ? { dataFile: resolved.dataFile, secretsFile: resolved.secretsFile } : resolvePluginStorage(dshHome, process.env.DSH_PROFILE_DIR, process.env.DSH_PROFILE);
  const dataFile = resolved.dataFile ?? defaults.dataFile;
  const secretsFile = resolved.secretsFile ?? defaults.secretsFile;
  appendBootLog(dshHome, "apply:enter");
  try {
    applyHost(ctx, resolved, dshHome, dataFile, secretsFile);
    appendBootLog(dshHome, "apply:ok");
  } catch (error) {
    appendBootLog(
      dshHome,
      `apply:failed ${error instanceof Error ? error.stack ?? error.message : String(error)}`
    );
    throw error;
  }
}
function applyHost(ctx, resolved, dshHome, dataFile, secretsFile) {
  const features = resolved.features ?? {};
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
  const registry = new DeviceRegistry(
    dataFile,
    secretsFile,
    {
      localPort: () => webServer?.port,
      localSessionCatalog: (signal) => readLocalAttentionCatalog(
        (key) => ctx.get?.(key),
        signal
      ),
      // Archived Sessions have no default sidebar row, so the unread counters
      // must know about them to avoid reporting reminders that cannot be seen.
      localArchivedSessionIds: () => {
        try {
          return (getWorkspaceRegistry()?.archivedSessionIds ?? []).map(String);
        } catch {
          return [];
        }
      },
      // Subagent children render under their parent Session, never as rows.
      localSubagentSessionIds: () => {
        try {
          return (getLocalSessions()?.list?.() ?? []).filter((s) => s.header?.origin === "subagent").map((s) => String(s.id));
        } catch {
          return [];
        }
      }
    },
    {
      enableTunnels,
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
    const dispose = on.call(ctx, "api-session/status", (sessionId2, running) => {
      if (typeof sessionId2 === "string" && typeof running === "boolean") {
        registry.observeLocalSessionStatus(sessionId2, running);
        void registry.refreshLocalCatalog();
      }
    });
    return typeof dispose === "function" ? dispose : () => {
    };
  }, "dsh-multi-device: local session status");
  ctx.effect(() => {
    const on = ctx.on;
    if (typeof on !== "function") return () => {
    };
    const dispose = on.call(ctx, "api-session/removed", (sessionId2) => {
      if (typeof sessionId2 === "string" && sessionId2 !== "") {
        registry.forgetLocalSession(sessionId2);
      }
    });
    return typeof dispose === "function" ? dispose : () => {
    };
  }, "dsh-multi-device: local session removal");
  ctx.effect(() => {
    const on = ctx.on;
    if (typeof on !== "function") return () => {
    };
    const disposers = [
      on.call(ctx, "api-session/added", (summary) => {
        if (typeof summary?.sessionId === "string") registry.observeLocalSessionAdded({
          sessionId: summary.sessionId,
          deviceId: "local",
          running: summary.running === true,
          blank: summary.blank,
          origin: summary.origin
        });
      }),
      on.call(ctx, "api-session/activity", () => {
        void registry.refreshLocalCatalog();
      }),
      on.call(ctx, "workspace/changed", () => {
        void registry.refreshLocalCatalog();
      })
    ];
    return () => {
      for (const off of disposers) if (typeof off === "function") off();
    };
  }, "dsh-multi-device: local catalog updates");
  ctx.effect(() => {
    const sample = () => {
      let gateway;
      try {
        gateway = ctx.get?.("typertGateway");
      } catch {
        return;
      }
      const pending = gateway?.pendingRemoteEvents;
      if (!(pending instanceof Map)) return;
      const requests = [];
      for (const [id, value] of pending) {
        const frame = value?.frame;
        if (typeof id !== "string" || typeof frame?.agentId !== "string") continue;
        const kind = frame.event === "approval/request" ? "approval" : frame.event === "plan-review/request" || frame.event === "user-questions/request" && frame.request?.questions?.length === 1 && frame.request.questions[0]?.intent?.kind === "plan-review" ? "plan-review" : frame.event === "user-questions/request" ? "question" : void 0;
        if (kind !== void 0) requests.push({ eventId: id, sessionId: frame.agentId, kind });
      }
      registry.observeLocalPending(requests);
    };
    sample();
    const timer = setInterval(sample, 1e3);
    timer.unref?.();
    return () => clearInterval(timer);
  }, "dsh-multi-device: local pending compatibility");
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
      void registry.flushPersistence().catch((error) => {
        console.error("[dsh-multi-device] Failed to flush catalog persistence:", error);
      });
    };
  }, "dsh-multi-device: device registry");
}
export {
  Config,
  DeviceId,
  LOCAL_DEVICE_ID,
  apply,
  decodeSessionId,
  encodeRemoteEventId,
  encodeRemoteSessionId,
  inject,
  isNamespacedEventId,
  isNamespacedSessionId,
  name
};
//# sourceMappingURL=index.js.map

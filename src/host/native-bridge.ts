/**
 * Device-page bridge: the tiny script the local reverse proxy injects into the
 * framed remote DSH page, plus the HTML injection helper.
 *
 * Why a bridge at all: DSH Web has no URL router, and the remote page's own
 * client state (selected Session, unread set, title, workspace fold state) is
 * only reachable from inside that page. The script runs before the DSH client
 * modules materialize, wraps the module table, and captures the client Context
 * that owns `uiWorkspace` so the Host can mirror what the page is showing.
 *
 * The bridge talks to the proxy over a same-origin WebSocket
 * (`/__md/bridge`), not `postMessage`: the proxy is the one local origin that
 * already carries the HttpOnly proxy cookie, and Electron `<webview>` guests
 * do not expose a reliable `contentWindow`.
 *
 * Failure is always explicit: unsupported workspace/session contracts report a
 * bridge failure or navigation error; the native page is never replaced by a
 * mirror renderer.
 *
 * @module dsh-multi-device/host/native-bridge
 */

/** Path the proxy serves the bridge script from (root-relative inside the frame). */
export const NATIVE_BRIDGE_SCRIPT_PATH = '/__md/bridge.js'

/** Same-origin WebSocket the bridge opens to receive commands. */
export const NATIVE_BRIDGE_SOCKET_PATH = '/__md/bridge'

/** The DSH client module that owns `uiWorkspace` in 0.2.x. */
export const NATIVE_BRIDGE_WORKSPACE_MODULE = '@deepseek-ai/dsh-client-ui-workspace'

/**
 * Plain-JS bridge source. Kept as a template string (not a bundled module) so
 * the proxy can serve it byte-for-byte without another build target.
 */
export const NATIVE_BRIDGE_SCRIPT = String.raw`(function () {
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
})();`

/**
 * Bound and validate one device's workspace fold state before it crosses the
 * Host/page boundary. Unknown shapes are dropped rather than injected into
 * the remote workspace store.
 */
export function sanitizeGroupState(value: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out
  let index = 0
  for (const [key, expanded] of Object.entries(value as Record<string, unknown>)) {
    if (index >= 1_000) break
    if (typeof key !== 'string' || key === '' || key.length > 256) continue
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    if (typeof expanded !== 'boolean') continue
    out[key] = expanded
    index += 1
  }
  return out
}

/** Bounded raw-session completion map for the Host/page boundary. */
export function sanitizeReadCompletions(value: unknown): Record<string, string> {
  const out: Record<string, string> = Object.create(null)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out
  for (const [key, token] of Object.entries(value).slice(0, 2_000)) {
    if (key === '' || key.length > 512 || typeof token !== 'string' || token === '' || token.length > 512) continue
    out[key] = token
  }
  return out
}

/** Serialize a value for a classic `<script>` body without closing the tag. */
function jsonForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

/** Initial page state served alongside the bridge script. */
export interface NativeBridgeScriptState {
  /** Explicit workspace fold state last observed by the Host. */
  readonly groups?: Readonly<Record<string, boolean>>
  /** Raw remote Session IDs whose completion is currently unread. */
  readonly unread?: readonly string[]
  /** All current completion tokens, including already-read completions. */
  readonly readCompletions?: Readonly<Record<string, string>>
}

/**
 * Build the per-device bridge response. The state prefix runs before the
 * bridge body and before any DSH module, so the first workspace render already
 * has the Host's fold state.
 */
export function buildNativeBridgeScript(state: NativeBridgeScriptState = {}): string {
  const groups = sanitizeGroupState(state.groups)
  const unread = Array.isArray(state.unread)
    ? state.unread
        .filter((id): id is string => typeof id === 'string' && id !== '' && id.length <= 512)
        .slice(0, 2_000)
    : []
  return [
    `window.__DSH_MD_GROUPS__ = ${jsonForInlineScript(groups)};`,
    `window.__DSH_MD_UNREAD__ = ${jsonForInlineScript(unread)};`,
    ...(state.readCompletions !== undefined
      ? [`window.__DSH_MD_READ_COMPLETIONS__ = ${jsonForInlineScript(sanitizeReadCompletions(state.readCompletions))};`]
      : []),
    NATIVE_BRIDGE_SCRIPT,
  ].join('\n')
}

/** Options for {@link injectNativeBridge}. */
export interface NativeBridgeInjectionOptions {
  readonly deviceId: string
}

/**
 * Insert the bridge `<script>` as the first head child so it executes before
 * any DSH client module script.
 *
 * Idempotent: a second call on already-injected HTML returns it unchanged.
 * Falls back to an `<html>` prefix or a document prefix when the remote shell
 * has no explicit `<head>` (unusual, but never worse than dropping the bridge).
 */
export function injectNativeBridge(html: string, options: NativeBridgeInjectionOptions): string {
  if (html.includes('data-dsh-md-native-bridge')) return html
  const query = `device=${encodeURIComponent(options.deviceId)}`
  const tag = `<script data-dsh-md-native-bridge="1" src="${NATIVE_BRIDGE_SCRIPT_PATH}?${query}"></script>`
  const head = /<head(?:\s[^>]*)?>/i.exec(html)
  if (head !== null) {
    const at = head.index + head[0].length
    return `${html.slice(0, at)}${tag}${html.slice(at)}`
  }
  const htmlTag = /<html(?:\s[^>]*)?>/i.exec(html)
  if (htmlTag !== null) {
    const at = htmlTag.index + htmlTag[0].length
    return `${html.slice(0, at)}<head>${tag}</head>${html.slice(at)}`
  }
  return `${tag}${html}`
}

/** True when a proxied request path asks for the bridge script. */
export function isNativeBridgeScriptPath(pathname: string): boolean {
  return pathname === NATIVE_BRIDGE_SCRIPT_PATH
}

/** True when a proxy upgrade targets the bridge socket (not a remote API socket). */
export function isNativeBridgeSocketPath(pathname: string): boolean {
  return pathname === NATIVE_BRIDGE_SOCKET_PATH
}

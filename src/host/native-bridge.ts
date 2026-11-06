/**
 * Native Pane bridge: the tiny script the local reverse proxy injects into the
 * framed remote DSH page, plus the HTML injection helper.
 *
 * Why a bridge at all: DSH Web has no URL router. `uiWorkspace.openSession()`
 * lives in the remote page's in-memory client store, so the only way the local
 * aggregated sidebar can drive the framed page to a Session is to execute a
 * script inside that page. The script runs before the DSH client modules
 * materialize, wraps the module table, and captures the client Context that
 * owns `uiWorkspace`.
 *
 * The bridge talks to the proxy over a same-origin WebSocket
 * (`/__md/bridge`), not `postMessage`: the proxy is the one local origin that
 * already carries the HttpOnly proxy cookie, and Electron `<webview>` guests
 * do not expose a reliable `contentWindow`.
 *
 * Failure is always graceful: when the module id, loader shape or CSP differs,
 * the bridge reports `failed` (or simply never becomes ready) and the client
 * falls back to the local mirror renderer.
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

  var socket = null;
  var retryTimer = null;
  var readySent = false;
  var failedReason = null;
  var captured = null;
  var lastSelection = null;

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
    if (sessionId === lastSelection) return;
    lastSelection = sessionId;
    send({ type: 'selection', sessionId: sessionId });
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

  // Pane embedding hides the remote left sidebar. Native/full mode must get it
  // back: the Host sends set-embedded whenever the same framed page changes
  // between the aggregated pane and the full native tab.
  var embedded = false;
  var originalColumns = null;
  var originalSidebarDisplay = null;
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
      if (originalSidebarDisplay !== null) {
        try { sidebar.style.display = originalSidebarDisplay; } catch (error) {}
      }
      if (frame) {
        try { frame.removeAttribute('data-dsh-md-native-pane'); } catch (error) {}
      }
      originalColumns = null;
      originalSidebarDisplay = null;
      return true;
    }

    if (frame) {
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
      try {
        if (frame.getAttribute('data-dsh-md-native-pane') !== '1') {
          frame.setAttribute('data-dsh-md-native-pane', '1');
        }
      } catch (error) {}
    }
    if (originalSidebarDisplay === null) originalSidebarDisplay = sidebar.style.display || '';
    try {
      if (sidebar.style.display !== 'none') sidebar.style.display = 'none';
    } catch (error) {}
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
    });
    socket.addEventListener('message', function (event) {
      var data;
      try { data = JSON.parse(event.data); } catch (error) { return; }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'open-session' && typeof data.sessionId === 'string') openSession(data.sessionId);
      else if (data.type === 'refresh') refreshSessions();
      else if (data.type === 'set-embedded') setEmbedded(data.enabled === true);
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
    installLoaderHook();
  } catch (error) {
    fail('the DSH client module loader could not be wrapped');
  }

  setTimeout(function () {
    if (!readySent) fail('the DSH workspace service was not available within 10s');
  }, 10000);

  connect();
})();`

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

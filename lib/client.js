window.__ModuleLoader__.load({ id: 'dsh-multi-device', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  PANEL_ID: () => PANEL_ID,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react5 = require("react");

// src/client/locales.ts
var LOCALE_NS = "multiDevice";
var zh = {
  panelTitle: "\u591A\u8BBE\u5907\u4E2D\u67A2",
  settingsTabTitle: "\u591A\u8BBE\u5907\u7BA1\u7406",
  modeAggregated: "\u805A\u5408\u6A21\u5F0F",
  modeNative: "\u539F\u751F\u6A21\u5F0F",
  switchToNative: "\u5207\u81F3\u539F\u751F\u6A21\u5F0F",
  switchToAggregated: "\u8FD4\u56DE\u805A\u5408\u6A21\u5F0F",
  tabNative: "\u539F\u751F\u89C6\u56FE (Native)",
  tabDevices: "\u8BBE\u5907\u4E0E\u8FDE\u63A5",
  tabGitAggregation: "Git \u5DE5\u4F5C\u533A\u805A\u5408",
  statusConnected: "\u5DF2\u8FDE\u63A5",
  statusConnecting: "\u8FDE\u63A5\u4E2D\u2026",
  statusReconnecting: "\u91CD\u8FDE\u4E2D\u2026",
  statusError: "\u8FDE\u63A5\u5F02\u5E38",
  statusDisabled: "\u5DF2\u505C\u7528",
  addDevice: "\u6DFB\u52A0\u8BBE\u5907",
  editDevice: "\u7F16\u8F91\u8BBE\u5907",
  importSshConfig: "\u4ECE ~/.ssh/config \u5FEB\u901F\u5BFC\u5165",
  selectSshHostPlaceholder: "\u9009\u62E9\u7CFB\u7EDF SSH \u914D\u7F6E\u4E2D\u7684\u4E3B\u673A\u522B\u540D\u2026",
  deviceName: "\u8BBE\u5907\u540D\u79F0",
  deviceNamePlaceholder: "\u4F8B\u5982\uFF1Aubuntu-gpu / macbook-pro",
  deviceLabel: "\u73AF\u5883\u6807\u7B7E\uFF08\u53EF\u9009\uFF09",
  deviceLabelPlaceholder: "\u4F8B\u5982\uFF1ALinux 4090 / \u817E\u8BAF\u4E91",
  transportKind: "\u8FDE\u63A5\u65B9\u5F0F",
  transportSsh: "SSH \u96A7\u9053\uFF08\u9ED8\u8BA4\u63A8\u8350\uFF0C\u514D\u66B4\u9732\u7AEF\u53E3\uFF09",
  transportDirect: "HTTP(S) \u76F4\u8FDE",
  sshHost: "SSH \u4E3B\u673A\u6216\u914D\u7F6E\u522B\u540D",
  sshHostPlaceholder: "\u4E3B\u673A\u522B\u540D\u3001IP \u6216 user@host:port",
  sshUser: "SSH \u7528\u6237\u540D\uFF08\u7559\u7A7A\u590D\u7528 ~/.ssh/config\uFF09",
  sshPort: "SSH \u7AEF\u53E3",
  sshKeyPath: "\u79C1\u94A5\u8DEF\u5F84\uFF08\u7559\u7A7A\u81EA\u52A8\u4F7F\u7528 SSH Agent / \u9ED8\u8BA4\u5BC6\u94A5\uFF09",
  sshProxyJump: "ProxyJump \u8DF3\u677F\u673A\uFF08\u53EF\u9009\uFF09",
  remoteDshPort: "\u8FDC\u7AEF DSH Web \u7AEF\u53E3",
  sshEngine: "SSH \u96A7\u9053\u5F15\u64CE",
  sshEngineAuto: "\u81EA\u52A8\uFF08\u4F18\u5148\u7CFB\u7EDF ssh\uFF0C100% \u517C\u5BB9 ~/.ssh/config\uFF09",
  sshEngineSystem: "\u7CFB\u7EDF OpenSSH (ssh -N -L)",
  sshEngineSsh2: "\u5185\u7F6E ssh2 \u5E93",
  directUrl: "\u8FDC\u7AEF DSH \u5730\u5740 (HTTP/HTTPS)",
  directUrlPlaceholder: "\u4F8B\u5982\uFF1Ahttp://127.0.0.1:3081 \u6216 https://dev.example.com:3080",
  authMode: "\u9274\u6743\u4E0E\u6301\u4E45\u767B\u5F55",
  authAuto: "\u81EA\u52A8\u9274\u6743\uFF08SSH \u81EA\u52A8\u63D0\u53D6\u7B7E\u540D\u5BC6\u94A5 / \u6301\u4E45 Cookie\uFF09",
  authToken: "\u542F\u52A8\u94FE\u63A5\u6216 Token\uFF08\u81EA\u52A8\u5151\u6362 30 \u5929\u6301\u4E45 Cookie\uFF09",
  authCookie: "\u81EA\u5B9A\u4E49 Cookie (dsh-auth-...)",
  authBearer: "Bearer Token",
  authNone: "\u65E0\u9274\u6743\uFF08\u517C\u5BB9\u65E7\u7248 DSH 0.1.x\uFF09",
  authCredential: "\u9274\u6743\u51ED\u636E / \u5E26 ?token= \u7684\u542F\u52A8 URL",
  authCredentialPlaceholder: "\u7C98\u8D34 dsh web \u542F\u52A8\u8F93\u51FA\u7684 URL \u6216 Token\uFF08\u81EA\u52A8\u6A21\u5F0F\u4E0B\u53EF\u7559\u7A7A\uFF09",
  keepNativeAlive: "\u539F\u751F\u6A21\u5F0F\u540E\u53F0\u4FDD\u6D3B\uFF08\u5207\u6362\u6A21\u5F0F\u6216\u8BBE\u5907\u65F6\u4E0D\u9500\u6BC1\u9875\u9762\u72B6\u6001\uFF09",
  testConnection: "\u6D4B\u8BD5\u8FDE\u63A5",
  testingConnection: "\u6B63\u5728\u6D4B\u8BD5\u2026",
  saveDevice: "\u4FDD\u5B58\u8BBE\u5907",
  cancel: "\u53D6\u6D88",
  reconnect: "\u91CD\u8FDE",
  remove: "\u79FB\u9664",
  openNative: "\u6253\u5F00\u539F\u751F\u9875\u9762",
  openExternal: "\u5728\u7CFB\u7EDF\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00",
  reloadPage: "\u5237\u65B0\u8FDC\u7AEF\u9875\u9762",
  releaseKeepAlive: "\u91CA\u653E\u4FDD\u6D3B\u9875\u9762",
  keepAliveActive: "\u4FDD\u6D3B\u4E2D",
  noDevicesTitle: "\u5C1A\u672A\u914D\u7F6E\u8FDC\u7AEF\u5F00\u53D1\u673A",
  noDevicesDesc: "\u6DFB\u52A0\u4E00\u53F0 SSH \u6216 HTTP(S) \u8FDC\u7AEF\u8BBE\u5907\uFF0C\u5373\u53EF\u5728\u5DE6\u4FA7\u680F\u7EDF\u4E00\u805A\u5408\u6240\u6709\u5DE5\u4F5C\u533A\u4E0E\u4F1A\u8BDD\uFF0C\u6216\u4E00\u952E\u5207\u5165\u8FDC\u7AEF\u539F\u751F DSH \u754C\u9762\u3002",
  gitAutoTitle: "Git Remote \u81EA\u52A8\u5DE5\u4F5C\u533A\u805A\u5408",
  gitAutoDesc: "\u81EA\u52A8\u8BC6\u522B\u4E0D\u540C\u8BBE\u5907\u4E0A\u6307\u5411\u540C\u4E00 Git \u4ED3\u5E93\uFF08\u5982 github.com/org/repo\uFF09\u7684\u76EE\u5F55\uFF0C\u5408\u5E76\u4E3A\u4E00\u4E2A\u903B\u8F91\u5DE5\u4F5C\u533A\u7EDF\u4E00\u5C55\u793A\u4F1A\u8BDD\u3002\u53EA\u805A\u5408\u5DE5\u4F5C\u533A\u4E0E\u4F1A\u8BDD\uFF0C\u4E0D\u505A\u4EFB\u4F55\u6587\u4EF6\u540C\u6B65\u3002",
  gitAutoToggle: "\u542F\u7528 Git Remote \u81EA\u52A8\u805A\u5408",
  gitPrefixToggle: "\u672A\u805A\u5408\u7684\u8FDC\u7AEF\u5DE5\u4F5C\u533A\u663E\u793A [\u8BBE\u5907\u540D] \u524D\u7F00",
  logicalWorkspacesHeading: "\u5F53\u524D\u903B\u8F91\u5DE5\u4F5C\u533A\u89C6\u56FE",
  targetDeviceForNewSession: "\u65B0\u5EFA\u4F1A\u8BDD\u76EE\u6807\u8BBE\u5907\uFF1A",
  splitWorkspace: "\u62C6\u5206\u6B64\u805A\u5408\u5DE5\u4F5C\u533A",
  restoreAutoMerge: "\u6062\u590D\u81EA\u52A8\u805A\u5408",
  manualRuleBuilderTitle: "\u65B0\u5EFA\u624B\u52A8\u805A\u5408\u89C4\u5219",
  manualRuleNamePlaceholder: "\u903B\u8F91\u5DE5\u4F5C\u533A\u540D\u79F0\uFF08\u5982\uFF1A\u6838\u5FC3\u540E\u7AEF\u8DE8\u673A\u5DE5\u4F5C\u533A\uFF09",
  manualRuleGitPlaceholder: "\u5173\u8054 Git \u4ED3\u5E93\uFF08\u53EF\u9009\uFF0C\u5982 github.com/org/repo\uFF09",
  createManualRule: "\u521B\u5EFA\u624B\u52A8\u805A\u5408\u5DE5\u4F5C\u533A",
  deleteManualRule: "\u5220\u9664\u89C4\u5219",
  menuOpenInNative: "\u5728\u539F\u751F\u6A21\u5F0F\u4E2D\u6253\u5F00\u6240\u5C5E\u8BBE\u5907",
  hoverDeviceLabel: "\u6240\u5C5E\u8BBE\u5907",
  hoverGitRepoLabel: "Git \u4ED3\u5E93",
  gatewayDegradedNotice: "\u805A\u5408\u7F51\u5173\u5F53\u524D\u5904\u4E8E\u964D\u7EA7\u72B6\u6001\uFF0C\u60A8\u4ECD\u53EF\u6B63\u5E38\u4F7F\u7528\u539F\u751F\u6A21\u5F0F\u7BA1\u7406\u6240\u6709\u8FDC\u7AEF\u8BBE\u5907\u3002"
};
var en = {
  panelTitle: "Multi-Device Hub",
  settingsTabTitle: "Multi-Device",
  modeAggregated: "Aggregated",
  modeNative: "Native UI",
  switchToNative: "Switch to Native UI",
  switchToAggregated: "Back to Aggregated",
  tabNative: "Native Viewport",
  tabDevices: "Devices & SSH",
  tabGitAggregation: "Git Aggregation",
  statusConnected: "Connected",
  statusConnecting: "Connecting\u2026",
  statusReconnecting: "Reconnecting\u2026",
  statusError: "Error",
  statusDisabled: "Disabled",
  addDevice: "Add Device",
  editDevice: "Edit Device",
  importSshConfig: "Quick Import from ~/.ssh/config",
  selectSshHostPlaceholder: "Select a Host alias from ~/.ssh/config\u2026",
  deviceName: "Device Name",
  deviceNamePlaceholder: "e.g. ubuntu-gpu / macbook-pro",
  deviceLabel: "Environment Tag (optional)",
  deviceLabelPlaceholder: "e.g. Linux 4090 / Cloud",
  transportKind: "Transport",
  transportSsh: "SSH Tunnel (Recommended, loopback-only)",
  transportDirect: "HTTP(S) Direct",
  sshHost: "SSH Host or Alias",
  sshHostPlaceholder: "Host alias, IP, or user@host:port",
  sshUser: "SSH User (leave blank to reuse ~/.ssh/config)",
  sshPort: "SSH Port",
  sshKeyPath: "Private Key Path (blank uses SSH Agent / default keys)",
  sshProxyJump: "ProxyJump (optional)",
  remoteDshPort: "Remote DSH Web Port",
  sshEngine: "SSH Tunnel Engine",
  sshEngineAuto: "Auto (prefer system ssh, 100% ~/.ssh/config compatible)",
  sshEngineSystem: "System OpenSSH (ssh -N -L)",
  sshEngineSsh2: "Built-in ssh2 library",
  directUrl: "Remote DSH URL (HTTP/HTTPS)",
  directUrlPlaceholder: "e.g. http://127.0.0.1:3081 or https://dev.example.com:3080",
  authMode: "Authentication & Persistent Login",
  authAuto: "Auto (SSH credential bootstrap / persistent cookie)",
  authToken: "Launch URL or Token (exchanges for 30-day cookie)",
  authCookie: "Custom Cookie (dsh-auth-...)",
  authBearer: "Bearer Token",
  authNone: "None (DSH 0.1.x compatible)",
  authCredential: "Credential / Launch URL with ?token=",
  authCredentialPlaceholder: "Paste URL printed by dsh web or token (optional in Auto SSH mode)",
  keepNativeAlive: "Keep Native UI alive in background across switches",
  testConnection: "Test Connection",
  testingConnection: "Testing\u2026",
  saveDevice: "Save Device",
  cancel: "Cancel",
  reconnect: "Reconnect",
  remove: "Remove",
  openNative: "Open Native UI",
  openExternal: "Open in System Browser",
  reloadPage: "Reload Remote Page",
  releaseKeepAlive: "Release Keep-Alive Page",
  keepAliveActive: "Keep-Alive",
  noDevicesTitle: "No Remote Devices Configured",
  noDevicesDesc: "Add a remote machine via SSH tunnel or HTTP(S) to unify workspaces and sessions in the sidebar, or switch into its full native DSH Web UI.",
  gitAutoTitle: "Git Remote Workspace Auto-Aggregation",
  gitAutoDesc: "Automatically group directories across devices that share the same Git remote (e.g. github.com/org/repo) into one logical workspace. Aggregates workspaces and sessions only \u2014 never syncs files.",
  gitAutoToggle: "Enable Git Remote Auto-Aggregation",
  gitPrefixToggle: "Prefix unmatched remote workspaces with [DeviceName]",
  logicalWorkspacesHeading: "Logical Workspaces",
  targetDeviceForNewSession: "Target device for New Session:",
  splitWorkspace: "Split from auto-aggregation",
  restoreAutoMerge: "Restore auto-aggregation",
  manualRuleBuilderTitle: "Create Manual Aggregation Rule",
  manualRuleNamePlaceholder: "Logical workspace title (e.g. Cross-Device Core Backend)",
  manualRuleGitPlaceholder: "Optional Git remote (e.g. github.com/org/repo)",
  createManualRule: "Create Manual Logical Workspace",
  deleteManualRule: "Delete Rule",
  menuOpenInNative: "Open Device in Native Mode",
  hoverDeviceLabel: "Device",
  hoverGitRepoLabel: "Git Repo",
  gatewayDegradedNotice: "Aggregated Gateway is degraded; Native Mode remains fully available for all devices."
};

// src/client/ModeSwitcherOverlay.tsx
var import_react3 = require("react");

// src/contract.ts
var LOCAL_DEVICE_ID = "local";
var REMOTE_SESSION_PREFIX = "md~";
var SEPARATOR = "~";
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
function unescapeSegment(value) {
  return value.replaceAll("%7E", "~").replaceAll("%25", "%");
}

// src/client/NativeViewport.tsx
var import_react2 = require("react");

// src/client/state.ts
var import_react = require("react");
var UI_STORAGE_KEY = "dsh.multi-device.ui.v1";
var MAX_KEEP_ALIVE_PAGES = 6;
var EMPTY_SNAPSHOT = {
  revision: 0,
  hostStatus: {
    aggregatedGatewayActive: true,
    nativeProxyActive: true
  },
  devices: [],
  sshConfigHosts: [],
  aggregationConfig: {
    autoGitAggregate: true,
    prefixUnmatchedWithDevice: true,
    excludedMemberKeys: [],
    preferredDeviceByLogicalId: {},
    customTitleByLogicalId: {},
    manualRules: []
  },
  logicalWorkspaces: [],
  allPhysicalWorkspaces: [],
  sessionOrigins: {}
};
function loadPersistedUiPrefs() {
  if (typeof localStorage === "undefined") {
    return { displayMode: "aggregated", overlayCollapsed: false };
  }
  try {
    const raw = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? "{}");
    return {
      displayMode: raw.displayMode === "native" ? "native" : "aggregated",
      ...typeof raw.activeNativeDeviceId === "string" && raw.activeNativeDeviceId !== "" ? { activeNativeDeviceId: raw.activeNativeDeviceId } : {},
      overlayCollapsed: raw.overlayCollapsed === true
    };
  } catch {
    return { displayMode: "aggregated", overlayCollapsed: false };
  }
}
function savePersistedUiPrefs(state) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({
        displayMode: state.displayMode,
        activeNativeDeviceId: state.activeNativeDeviceId,
        overlayCollapsed: state.overlayCollapsed
      })
    );
  } catch {
  }
}
var MultiDeviceClientStore = class {
  state;
  listeners = /* @__PURE__ */ new Set();
  eventSource;
  pollTimer;
  started = false;
  constructor() {
    const prefs = loadPersistedUiPrefs();
    this.state = {
      snapshot: EMPTY_SNAPSHOT,
      loading: true,
      displayMode: prefs.displayMode,
      ...prefs.activeNativeDeviceId !== void 0 ? { activeNativeDeviceId: prefs.activeNativeDeviceId } : {},
      keepAliveDeviceIds: prefs.activeNativeDeviceId ? [prefs.activeNativeDeviceId] : [],
      reloadCounters: {},
      activeHubTab: "devices",
      overlayCollapsed: prefs.overlayCollapsed
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  setState(patch, persistPrefs = false) {
    this.state = { ...this.state, ...patch };
    if (persistPrefs) savePersistedUiPrefs(this.state);
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
      }
    }
  }
  start() {
    if (this.started) return () => {
    };
    this.started = true;
    void this.refreshSnapshot();
    this.connectSse();
    this.pollTimer = setInterval(() => {
      void this.refreshSnapshot();
    }, 5e3);
    return () => {
      this.started = false;
      if (this.pollTimer !== void 0) {
        clearInterval(this.pollTimer);
        this.pollTimer = void 0;
      }
      this.eventSource?.close();
      this.eventSource = void 0;
    };
  }
  connectSse() {
    if (typeof EventSource === "undefined") return;
    try {
      const es = new EventSource("/multi-device/events");
      this.eventSource = es;
      es.addEventListener("snapshot", (ev) => {
        try {
          const snap = JSON.parse(ev.data);
          this.applyIncomingSnapshot(snap);
        } catch {
        }
      });
      es.onerror = () => {
      };
    } catch {
    }
  }
  applyIncomingSnapshot(snap) {
    const validIds = new Set(snap.devices.map((d) => d.id));
    let activeNative = this.state.activeNativeDeviceId;
    if (activeNative === void 0 || !validIds.has(activeNative)) {
      activeNative = snap.devices[0]?.id;
    }
    const keepAlive = this.state.keepAliveDeviceIds.filter((id) => validIds.has(id));
    if (this.state.displayMode === "native" && activeNative !== void 0 && !keepAlive.includes(activeNative)) {
      keepAlive.push(activeNative);
    }
    this.setState({
      snapshot: snap,
      loading: false,
      error: void 0,
      ...activeNative !== void 0 ? { activeNativeDeviceId: activeNative } : {},
      keepAliveDeviceIds: keepAlive
    });
  }
  // ==========================================================================
  // UI Navigation & Keep-Alive Actions
  // ==========================================================================
  setDisplayMode(mode, targetDeviceId) {
    const nextDeviceId = targetDeviceId ?? this.state.activeNativeDeviceId ?? this.state.snapshot.devices[0]?.id;
    const keepAlive = [...this.state.keepAliveDeviceIds];
    if (mode === "native" && nextDeviceId !== void 0) {
      const existingIdx = keepAlive.indexOf(nextDeviceId);
      if (existingIdx !== -1) keepAlive.splice(existingIdx, 1);
      keepAlive.push(nextDeviceId);
      while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) {
        keepAlive.shift();
      }
    }
    this.setState(
      {
        displayMode: mode,
        ...nextDeviceId !== void 0 ? { activeNativeDeviceId: nextDeviceId } : {},
        keepAliveDeviceIds: keepAlive
      },
      true
    );
  }
  toggleDisplayMode() {
    this.setDisplayMode(this.state.displayMode === "native" ? "aggregated" : "native");
  }
  selectNativeDevice(deviceId) {
    this.setDisplayMode("native", deviceId);
  }
  releaseKeepAliveDevice(deviceId) {
    const nextKeepAlive = this.state.keepAliveDeviceIds.filter((id) => id !== deviceId);
    const nextActive = this.state.activeNativeDeviceId === deviceId ? nextKeepAlive[nextKeepAlive.length - 1] ?? this.state.snapshot.devices.find((d) => d.id !== deviceId)?.id : this.state.activeNativeDeviceId;
    this.setState(
      {
        keepAliveDeviceIds: nextKeepAlive,
        activeNativeDeviceId: nextActive,
        ...nextKeepAlive.length === 0 ? { displayMode: "aggregated" } : {}
      },
      true
    );
  }
  reloadNativeDevice(deviceId) {
    const current = this.state.reloadCounters[deviceId] ?? 0;
    this.setState({
      reloadCounters: {
        ...this.state.reloadCounters,
        [deviceId]: current + 1
      }
    });
  }
  setActiveHubTab(tab) {
    this.setState({ activeHubTab: tab });
  }
  setOverlayCollapsed(collapsed) {
    this.setState({ overlayCollapsed: collapsed }, true);
  }
  // ==========================================================================
  // Control-Plane RPC Calls
  // ==========================================================================
  async callControlPlane(request) {
    try {
      const response = await fetch("/multi-device/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  async refreshSnapshot() {
    const res = await this.callControlPlane({ action: "snapshot" });
    if (res.ok) {
      this.applyIncomingSnapshot(res.value);
    } else {
      this.setState({ loading: false, error: res.error });
    }
  }
  async upsertDevice(input) {
    const res = await this.callControlPlane({
      action: "upsertDevice",
      payload: input
    });
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot);
      return { ok: true };
    }
    return { ok: false, error: res.error };
  }
  async removeDevice(deviceId) {
    const res = await this.callControlPlane({
      action: "removeDevice",
      payload: { deviceId }
    });
    if (res.ok) {
      this.releaseKeepAliveDevice(deviceId);
      this.applyIncomingSnapshot(res.value.snapshot);
    }
  }
  async reconnectDevice(deviceId) {
    const res = await this.callControlPlane({
      action: "reconnectDevice",
      payload: { deviceId }
    });
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot);
    }
  }
  async testDevice(input) {
    const res = await this.callControlPlane({
      action: "testDevice",
      payload: input
    });
    return res.ok ? { ok: true, ...res.value } : res;
  }
  async updateAggregationConfig(patch) {
    const res = await this.callControlPlane({
      action: "updateAggregationConfig",
      payload: patch
    });
    if (res.ok) this.applyIncomingSnapshot(res.value);
  }
  async upsertManualRule(rule) {
    const res = await this.callControlPlane({
      action: "upsertManualRule",
      payload: rule
    });
    if (res.ok) this.applyIncomingSnapshot(res.value);
  }
  async removeManualRule(ruleId) {
    const res = await this.callControlPlane({
      action: "removeManualRule",
      payload: { ruleId }
    });
    if (res.ok) this.applyIncomingSnapshot(res.value);
  }
  async setMemberExcluded(memberKey, excluded) {
    const res = await this.callControlPlane({
      action: "setMemberExcluded",
      payload: { memberKey, excluded }
    });
    if (res.ok) this.applyIncomingSnapshot(res.value);
  }
  async setPreferredDevice(logicalWorkspaceId, deviceId) {
    const res = await this.callControlPlane({
      action: "setPreferredDevice",
      payload: { logicalWorkspaceId, deviceId }
    });
    if (res.ok) this.applyIncomingSnapshot(res.value);
  }
};
var clientStore = new MultiDeviceClientStore();
function useMultiDeviceState() {
  return (0, import_react.useSyncExternalStore)(clientStore.subscribe, clientStore.getSnapshot, clientStore.getSnapshot);
}

// src/client/NativeViewport.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function getDesktopBrowserBridge() {
  const desktop = globalThis.dshDesktop;
  return desktop?.protocolVersion === 1 ? desktop.browser : void 0;
}
function KeepAliveDeviceFrame({
  device,
  active,
  reloadCount
}) {
  const targetUrl = device.nativeProxyUrl ?? device.effectiveBaseUrl;
  const containerRef = (0, import_react2.useRef)(null);
  const webviewLeaseRef = (0, import_react2.useRef)(void 0);
  (0, import_react2.useEffect)(() => {
    const bridge = getDesktopBrowserBridge();
    const container = containerRef.current;
    if (bridge === void 0 || container === null || targetUrl === void 0) return;
    let cancelled = false;
    let currentEl;
    void bridge.acquire(`multi-device:${device.id}`).then((reservation) => {
      if (cancelled || containerRef.current === null) {
        void bridge.release(reservation.lease);
        return;
      }
      webviewLeaseRef.current = reservation.lease;
      const webview = document.createElement("webview");
      webview.className = "dsh-md-native-iframe";
      webview.setAttribute("name", reservation.lease);
      webview.setAttribute("partition", reservation.partition);
      webview.setAttribute("allowpopups", "");
      webview.setAttribute("src", `about:blank#${reservation.lease}`);
      webview.addEventListener(
        "dom-ready",
        () => {
          try {
            const wv = webview;
            if (wv.getURL?.().startsWith("about:blank#")) {
              void wv.loadURL?.(targetUrl);
            }
          } catch {
          }
        },
        { once: true }
      );
      currentEl = webview;
      container.innerHTML = "";
      container.appendChild(webview);
    }).catch(() => {
    });
    return () => {
      cancelled = true;
      currentEl?.remove();
      const lease = webviewLeaseRef.current;
      webviewLeaseRef.current = void 0;
      if (lease !== void 0) {
        void bridge.release(lease).catch(() => {
        });
      }
    };
  }, [device.id, targetUrl, reloadCount]);
  const useDesktopWebview = getDesktopBrowserBridge() !== void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      className: "dsh-md-native-frame-wrap",
      style: {
        display: active ? "flex" : "none",
        visibility: active ? "visible" : "hidden"
      },
      "data-device-id": device.id,
      "data-active": active ? "true" : "false",
      children: targetUrl === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "div",
        {
          style: {
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: 24
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-md-dot", "data-state": device.state }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 15, fontWeight: 600 }, children: device.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary, #9ca3af)" }, children: device.lastError ?? device.targetSummary }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "dsh-md-btn dsh-md-btn-primary",
                onClick: () => {
                  void clientStore.reconnectDevice(device.id);
                },
                children: "Reconnect"
              }
            )
          ]
        }
      ) : useDesktopWebview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { ref: containerRef, className: "dsh-md-native-iframe" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "iframe",
        {
          className: "dsh-md-native-iframe",
          src: targetUrl,
          title: `DSH Native - ${device.name}`,
          referrerPolicy: "no-referrer"
        },
        `${device.id}:${reloadCount}`
      )
    }
  );
}
function NativeViewport({
  t,
  embedded = false,
  onOpenSettings
}) {
  const state = useMultiDeviceState();
  const { devices } = state.snapshot;
  const activeDevice = devices.find((d) => d.id === state.activeNativeDeviceId) ?? devices[0];
  const mountedDeviceIds = new Set(state.keepAliveDeviceIds);
  if (activeDevice !== void 0) mountedDeviceIds.add(activeDevice.id);
  const mountedDevices = devices.filter((d) => mountedDeviceIds.has(d.id));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: embedded ? 480 : 0,
        height: "100%"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-native-toolbar", style: embedded ? { paddingLeft: 12 } : void 0, children: [
          !embedded && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              className: "dsh-md-btn dsh-md-btn-primary",
              onClick: () => clientStore.setDisplayMode("aggregated"),
              children: [
                "\u2190 ",
                t("switchToAggregated")
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", alignItems: "center", gap: 6, flex: 1, overflowX: "auto" }, children: devices.map((dev) => {
            const isSelected = dev.id === activeDevice?.id;
            const isKeptAlive = state.keepAliveDeviceIds.includes(dev.id);
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "div",
              {
                style: { display: "inline-flex", alignItems: "center", gap: 2 },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "button",
                    {
                      type: "button",
                      className: "dsh-md-device-pill",
                      "data-active": isSelected ? "true" : "false",
                      onClick: () => clientStore.selectNativeDevice(dev.id),
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-md-dot", "data-state": dev.state }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: dev.name }),
                        dev.runningSessionCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-md-badge", style: { color: "#60a5fa" }, children: [
                          dev.runningSessionCount,
                          " run"
                        ] }),
                        dev.latencyMs !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { opacity: 0.65 }, children: [
                          dev.latencyMs,
                          "ms"
                        ] }),
                        isKeptAlive && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { title: t("keepAliveActive"), style: { color: "#10b981", fontSize: 10 }, children: "\u25CF" })
                      ]
                    }
                  ),
                  isKeptAlive && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "button",
                    {
                      type: "button",
                      title: t("releaseKeepAlive"),
                      onClick: () => clientStore.releaseKeepAliveDevice(dev.id),
                      style: {
                        border: "none",
                        background: "transparent",
                        color: "var(--dsw-alias-label-tertiary, #9ca3af)",
                        cursor: "pointer",
                        fontSize: 11,
                        padding: "0 3px"
                      },
                      children: "\xD7"
                    }
                  )
                ]
              },
              dev.id
            );
          }) }),
          activeDevice !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "button",
              {
                type: "button",
                className: "dsh-md-btn",
                title: t("reloadPage"),
                onClick: () => clientStore.reloadNativeDevice(activeDevice.id),
                children: [
                  "\u21BB ",
                  t("reloadPage")
                ]
              }
            ),
            (activeDevice.nativeProxyUrl ?? activeDevice.effectiveBaseUrl) !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "button",
              {
                type: "button",
                className: "dsh-md-btn",
                title: t("openExternal"),
                onClick: () => {
                  const url = activeDevice.nativeProxyUrl ?? activeDevice.effectiveBaseUrl;
                  if (url !== void 0) window.open(url, "_blank", "noopener,noreferrer");
                },
                children: [
                  "\u2197 ",
                  t("openExternal")
                ]
              }
            )
          ] }),
          onOpenSettings !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "dsh-md-btn", onClick: onOpenSettings, children: [
            "\u2699 ",
            t("tabDevices")
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-md-native-stage", children: devices.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: 32
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 16, fontWeight: 600 }, children: t("noDevicesTitle") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 13, color: "var(--dsw-alias-label-tertiary, #9ca3af)", maxWidth: 420, textAlign: "center" }, children: t("noDevicesDesc") }),
              onOpenSettings !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "dsh-md-btn dsh-md-btn-primary", onClick: onOpenSettings, children: [
                "+ ",
                t("addDevice")
              ] })
            ]
          }
        ) : mountedDevices.map((dev) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          KeepAliveDeviceFrame,
          {
            device: dev,
            active: dev.id === activeDevice?.id,
            reloadCount: state.reloadCounters[dev.id] ?? 0
          },
          dev.id
        )) })
      ]
    }
  );
}

// src/client/ModeSwitcherOverlay.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function ModeSwitcherOverlay({
  t,
  onOpenHubPanel
}) {
  const state = useMultiDeviceState();
  const { devices } = state.snapshot;
  const isNative = state.displayMode === "native";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-overlay-bar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-mode-seg", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-md-mode-btn",
            "data-active": !isNative ? "true" : "false",
            onClick: () => clientStore.setDisplayMode("aggregated"),
            children: t("modeAggregated")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-md-mode-btn",
            "data-active": isNative ? "true" : "false",
            onClick: () => clientStore.setDisplayMode("native"),
            children: t("modeNative")
          }
        )
      ] }),
      !state.overlayCollapsed && devices.map((dev) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "button",
        {
          type: "button",
          className: "dsh-md-device-pill",
          "data-active": isNative && state.activeNativeDeviceId === dev.id ? "true" : "false",
          title: `${dev.name} (${dev.targetSummary})`,
          onClick: () => clientStore.selectNativeDevice(dev.id),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-dot", "data-state": dev.state }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: dev.name }),
            dev.runningSessionCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { color: "#60a5fa", fontWeight: 600 }, children: dev.runningSessionCount }),
            dev.pendingApprovalCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { color: "#f59e0b", fontWeight: 700 }, children: [
              "!",
              dev.pendingApprovalCount
            ] })
          ]
        },
        dev.id
      )),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-md-device-pill",
          title: t("panelTitle"),
          onClick: () => {
            clientStore.setDisplayMode("aggregated");
            onOpenHubPanel();
          },
          children: "\u2699"
        }
      )
    ] }),
    (isNative || state.keepAliveDeviceIds.length > 0) && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "div",
      {
        className: "dsh-md-native-fullscreen",
        style: {
          display: isNative ? "flex" : "none",
          pointerEvents: isNative ? "auto" : "none"
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          NativeViewport,
          {
            t,
            onOpenSettings: () => {
              clientStore.setDisplayMode("aggregated");
              onOpenHubPanel();
            }
          }
        )
      }
    )
  ] });
}
function SessionRowLeadingBadge({ sessionId }) {
  const decoded = decodeSessionId(sessionId);
  const state = useMultiDeviceState();
  if (!decoded.isRemote) return null;
  const origin = state.snapshot.sessionOrigins[sessionId];
  const label = (origin?.deviceName ?? decoded.deviceId).slice(0, 2).toUpperCase();
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "span",
    {
      className: "dsh-md-row-leading-tag",
      title: origin?.deviceName ?? decoded.deviceId,
      children: label
    }
  );
}
function SessionRowHoverDeviceSection({
  sessionId,
  t
}) {
  const decoded = decodeSessionId(sessionId);
  const state = useMultiDeviceState();
  if (!decoded.isRemote) return null;
  const origin = state.snapshot.sessionOrigins[sessionId];
  const devName = origin?.deviceName ?? decoded.deviceId;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 2, fontSize: 11, paddingTop: 2 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-dot", "data-state": origin?.deviceState ?? "connected" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        t("hoverDeviceLabel"),
        ": ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: devName })
      ] })
    ] }),
    origin?.gitRemote !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { color: "var(--dsw-alias-label-tertiary, #9ca3af)" }, children: [
      t("hoverGitRepoLabel"),
      ": ",
      origin.gitRemote
    ] })
  ] });
}
function SessionMenuOpenInNativeItem({
  sessionId,
  useMenuOpenState,
  t
}) {
  const [, setMenuOpen] = useMenuOpenState();
  const decoded = decodeSessionId(sessionId);
  if (!decoded.isRemote) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "button",
    {
      type: "button",
      role: "menuitem",
      className: "dsh-md-btn",
      style: {
        width: "100%",
        justifyContent: "flex-start",
        border: "none",
        background: "transparent",
        height: 28,
        padding: "0 8px"
      },
      onClick: () => {
        setMenuOpen(false);
        clientStore.selectNativeDevice(decoded.deviceId);
      },
      children: [
        "\u{1F5A5} ",
        t("menuOpenInNative")
      ]
    }
  );
}

// src/client/MultiDeviceHubPanel.tsx
var import_react4 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function MultiDeviceHubPanel({
  t,
  defaultTab = "devices"
}) {
  const state = useMultiDeviceState();
  const [tab, setTab] = (0, import_react4.useState)(defaultTab);
  const [editingDevice, setEditingDevice] = (0, import_react4.useState)(null);
  const [showAddForm, setShowAddForm] = (0, import_react4.useState)(false);
  const [name, setName] = (0, import_react4.useState)("");
  const [label, setLabel] = (0, import_react4.useState)("");
  const [transportKind, setTransportKind] = (0, import_react4.useState)("ssh");
  const [sshHost, setSshHost] = (0, import_react4.useState)("");
  const [sshUser, setSshUser] = (0, import_react4.useState)("");
  const [sshPort, setSshPort] = (0, import_react4.useState)("22");
  const [sshKeyPath, setSshKeyPath] = (0, import_react4.useState)("");
  const [sshProxyJump, setSshProxyJump] = (0, import_react4.useState)("");
  const [remotePort, setRemotePort] = (0, import_react4.useState)("3080");
  const [sshEngine, setSshEngine] = (0, import_react4.useState)("auto");
  const [directUrl, setDirectUrl] = (0, import_react4.useState)("http://127.0.0.1:3081");
  const [authMode, setAuthMode] = (0, import_react4.useState)("auto");
  const [authCredential, setAuthCredential] = (0, import_react4.useState)("");
  const [keepNativeAlive, setKeepNativeAlive] = (0, import_react4.useState)(true);
  const [testing, setTesting] = (0, import_react4.useState)(false);
  const [testFeedback, setTestFeedback] = (0, import_react4.useState)(null);
  const [saveError, setSaveError] = (0, import_react4.useState)(null);
  const [ruleTitle, setRuleTitle] = (0, import_react4.useState)("");
  const [ruleGitRemote, setRuleGitRemote] = (0, import_react4.useState)("");
  const [selectedMemberKeys, setSelectedMemberKeys] = (0, import_react4.useState)(() => /* @__PURE__ */ new Set());
  const resetForm = (dev) => {
    setTestFeedback(null);
    setSaveError(null);
    if (dev === void 0) {
      setEditingDevice(null);
      setName("");
      setLabel("");
      setTransportKind("ssh");
      setSshHost("");
      setSshUser("");
      setSshPort("22");
      setSshKeyPath("");
      setSshProxyJump("");
      setRemotePort("3080");
      setSshEngine("auto");
      setDirectUrl("http://127.0.0.1:3081");
      setAuthMode("auto");
      setAuthCredential("");
      setKeepNativeAlive(true);
      return;
    }
    setEditingDevice(dev);
    setName(dev.name);
    setLabel(dev.label ?? "");
    setTransportKind(dev.transportKind);
    setKeepNativeAlive(dev.keepNativeAlive);
  };
  const buildInputFromForm = () => {
    return {
      ...editingDevice !== null ? { id: editingDevice.id } : {},
      name: name.trim() || sshHost.trim() || "remote-device",
      ...label.trim() !== "" ? { label: label.trim() } : {},
      enabled: true,
      keepNativeAlive,
      transport: transportKind === "ssh" ? {
        kind: "ssh",
        host: sshHost.trim(),
        ...sshUser.trim() !== "" ? { username: sshUser.trim() } : {},
        ...Number(sshPort) > 0 ? { port: Number(sshPort) } : {},
        ...sshKeyPath.trim() !== "" ? { privateKeyPath: sshKeyPath.trim() } : {},
        ...sshProxyJump.trim() !== "" ? { proxyJump: sshProxyJump.trim() } : {},
        remotePort: Number(remotePort) > 0 ? Number(remotePort) : 3080,
        engine: sshEngine
      } : {
        kind: "direct",
        baseUrl: directUrl.trim()
      },
      auth: {
        mode: authMode,
        ...authCredential.trim() !== "" ? { credential: authCredential.trim() } : {}
      }
    };
  };
  const handleImportSshHost = (alias) => {
    const entry = state.snapshot.sshConfigHosts.find((h) => h.alias === alias);
    if (entry === void 0) return;
    setTransportKind("ssh");
    setSshHost(entry.alias);
    if (name.trim() === "") setName(entry.alias);
    setSshUser(entry.user ?? "");
    setSshPort(String(entry.port ?? 22));
    setSshKeyPath(entry.identityFile ?? "");
    setSshProxyJump(entry.proxyJump ?? "");
  };
  const handleTestConnection = async () => {
    setTesting(true);
    setTestFeedback(null);
    const res = await clientStore.testDevice(buildInputFromForm());
    setTesting(false);
    if (res.ok) {
      setTestFeedback({
        ok: true,
        text: `\u2713 Connected (DSH ${res.remoteDshVersion ?? res.protocolVersion}, RTT ${res.latencyMs}ms)`
      });
    } else {
      setTestFeedback({ ok: false, text: `\u2715 ${res.error}` });
    }
  };
  const handleSaveDevice = async (e) => {
    e.preventDefault();
    setSaveError(null);
    const res = await clientStore.upsertDevice(buildInputFromForm());
    if (!res.ok) {
      setSaveError(res.error ?? "Failed to save device");
      return;
    }
    setShowAddForm(false);
    setEditingDevice(null);
  };
  const { snapshot } = state;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-hub-root", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-hub-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { style: { margin: 0, fontSize: 18, fontWeight: 600 }, children: t("panelTitle") }),
        !snapshot.hostStatus.aggregatedGatewayActive && snapshot.hostStatus.aggregatedGatewayError && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { marginTop: 4, fontSize: 12, color: "#f59e0b" }, children: [
          "\u26A0 ",
          t("gatewayDegradedNotice"),
          " (",
          snapshot.hostStatus.aggregatedGatewayError,
          ")"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-mode-seg", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-md-mode-btn",
              "data-active": state.displayMode === "aggregated" ? "true" : "false",
              onClick: () => clientStore.setDisplayMode("aggregated"),
              children: t("modeAggregated")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-md-mode-btn",
              "data-active": state.displayMode === "native" ? "true" : "false",
              onClick: () => clientStore.setDisplayMode("native"),
              children: t("modeNative")
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "button",
          {
            type: "button",
            className: "dsh-md-btn dsh-md-btn-primary",
            onClick: () => {
              resetForm();
              setTab("devices");
              setShowAddForm(true);
            },
            children: [
              "+ ",
              t("addDevice")
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-tabs", role: "tablist", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "button",
        {
          type: "button",
          role: "tab",
          className: "dsh-md-tab",
          "data-active": tab === "devices" ? "true" : "false",
          onClick: () => setTab("devices"),
          children: [
            t("tabDevices"),
            " (",
            snapshot.devices.length,
            ")"
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "button",
        {
          type: "button",
          role: "tab",
          className: "dsh-md-tab",
          "data-active": tab === "git" ? "true" : "false",
          onClick: () => setTab("git"),
          children: [
            t("tabGitAggregation"),
            " (",
            snapshot.logicalWorkspaces.length,
            ")"
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          role: "tab",
          className: "dsh-md-tab",
          "data-active": tab === "native" ? "true" : "false",
          onClick: () => setTab("native"),
          children: t("tabNative")
        }
      )
    ] }),
    tab === "devices" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 14 }, children: [
      (showAddForm || editingDevice !== null) && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("form", { className: "dsh-md-card", onSubmit: (e) => {
        void handleSaveDevice(e);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { style: { fontSize: 14 }, children: editingDevice !== null ? t("editDevice") : t("addDevice") }),
          snapshot.sshConfigHosts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "select",
            {
              className: "dsh-md-select",
              defaultValue: "",
              "aria-label": t("importSshConfig"),
              onChange: (e) => handleImportSshHost(e.currentTarget.value),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: "", disabled: true, children: [
                  "\u26A1 ",
                  t("selectSshHostPlaceholder")
                ] }),
                snapshot.sshConfigHosts.map((h) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: h.alias, children: [
                  h.alias,
                  " (",
                  h.user ? `${h.user}@` : "",
                  h.hostName,
                  h.port && h.port !== 22 ? `:${h.port}` : "",
                  ")"
                ] }, h.alias))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-grid", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { children: t("deviceName") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                className: "dsh-md-input",
                required: true,
                value: name,
                placeholder: t("deviceNamePlaceholder"),
                onChange: (e) => setName(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { children: t("deviceLabel") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                className: "dsh-md-input",
                value: label,
                placeholder: t("deviceLabelPlaceholder"),
                onChange: (e) => setLabel(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { children: t("transportKind") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
              "select",
              {
                className: "dsh-md-select",
                value: transportKind,
                onChange: (e) => setTransportKind(e.currentTarget.value),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "ssh", children: t("transportSsh") }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "direct", children: t("transportDirect") })
                ]
              }
            )
          ] })
        ] }),
        transportKind === "ssh" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-grid", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { children: t("sshHost") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                className: "dsh-md-input",
                required: true,
                value: sshHost,
                placeholder: t("sshHostPlaceholder"),
                onChange: (e) => setSshHost(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { children: t("sshUser") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                className: "dsh-md-input",
                value: sshUser,
                placeholder: "root / ubuntu",
                onChange: (e) => setSshUser(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { children: t("sshPort") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                className: "dsh-md-input",
                type: "number",
                value: sshPort,
                onChange: (e) => setSshPort(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { children: t("remoteDshPort") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                className: "dsh-md-input",
                type: "number",
                value: remotePort,
                onChange: (e) => setRemotePort(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { children: t("sshKeyPath") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                className: "dsh-md-input",
                value: sshKeyPath,
                placeholder: "~/.ssh/id_ed25519",
                onChange: (e) => setSshKeyPath(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { children: t("sshProxyJump") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                className: "dsh-md-input",
                value: sshProxyJump,
                placeholder: "bastion-host",
                onChange: (e) => setSshProxyJump(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { children: t("sshEngine") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
              "select",
              {
                className: "dsh-md-select",
                value: sshEngine,
                onChange: (e) => setSshEngine(e.currentTarget.value),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "auto", children: t("sshEngineAuto") }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "system-ssh", children: t("sshEngineSystem") }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "ssh2", children: t("sshEngineSsh2") })
                ]
              }
            )
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { children: t("directUrl") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              className: "dsh-md-input",
              required: true,
              value: directUrl,
              placeholder: t("directUrlPlaceholder"),
              onChange: (e) => setDirectUrl(e.currentTarget.value)
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-grid", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { children: t("authMode") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
              "select",
              {
                className: "dsh-md-select",
                value: authMode,
                onChange: (e) => setAuthMode(e.currentTarget.value),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "auto", children: t("authAuto") }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "token", children: t("authToken") }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "cookie", children: t("authCookie") }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "bearer", children: t("authBearer") }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "none", children: t("authNone") })
                ]
              }
            )
          ] }),
          authMode !== "none" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { children: t("authCredential") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                className: "dsh-md-input",
                type: "password",
                autoComplete: "new-password",
                value: authCredential,
                placeholder: t("authCredentialPlaceholder"),
                onChange: (e) => setAuthCredential(e.currentTarget.value)
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              type: "checkbox",
              checked: keepNativeAlive,
              onChange: (e) => setKeepNativeAlive(e.currentTarget.checked)
            }
          ),
          t("keepNativeAlive")
        ] }),
        testFeedback !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 12, color: testFeedback.ok ? "#10b981" : "#ef4444" }, children: testFeedback.text }),
        saveError !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 12, color: "#ef4444" }, children: saveError }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-md-btn",
              disabled: testing,
              onClick: () => {
                void handleTestConnection();
              },
              children: testing ? t("testingConnection") : t("testConnection")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-md-btn",
              onClick: () => {
                setShowAddForm(false);
                setEditingDevice(null);
              },
              children: t("cancel")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "submit", className: "dsh-md-btn dsh-md-btn-primary", children: t("saveDevice") })
        ] })
      ] }),
      snapshot.devices.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-card", style: { alignItems: "center", textAlign: "center", padding: 32 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 15, fontWeight: 600 }, children: t("noDevicesTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 13, color: "var(--dsw-alias-label-tertiary, #9ca3af)", maxWidth: 460 }, children: t("noDevicesDesc") })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-grid", children: snapshot.devices.map((dev) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-md-dot", "data-state": dev.state }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { style: { fontSize: 14 }, children: dev.name }),
            dev.label !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-md-badge", children: dev.label })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-md-badge", children: dev.state === "connected" ? t("statusConnected") : dev.state === "connecting" ? t("statusConnecting") : dev.state === "reconnecting" ? t("statusReconnecting") : dev.state === "error" ? t("statusError") : t("statusDisabled") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, #9ca3af)", wordBreak: "break-all" }, children: dev.targetSummary }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dsh-md-badge", children: [
            " Workspaces: ",
            dev.workspaceCount
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dsh-md-badge", children: [
            "Sessions: ",
            dev.sessionCount
          ] }),
          dev.runningSessionCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dsh-md-badge", style: { color: "#60a5fa" }, children: [
            "Running: ",
            dev.runningSessionCount
          ] }),
          dev.pendingApprovalCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dsh-md-badge", style: { color: "#f59e0b" }, children: [
            "Pending Approval: ",
            dev.pendingApprovalCount
          ] }),
          dev.latencyMs !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dsh-md-badge", children: [
            dev.latencyMs,
            "ms"
          ] }),
          dev.remoteDshVersion !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dsh-md-badge", children: [
            "DSH ",
            dev.remoteDshVersion
          ] })
        ] }),
        dev.lastError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 11, color: "#ef4444", wordBreak: "break-word" }, children: dev.lastError }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: 6, marginTop: "auto", pt: 4 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-md-btn dsh-md-btn-primary",
              onClick: () => clientStore.selectNativeDevice(dev.id),
              children: t("openNative")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-md-btn",
              onClick: () => {
                void clientStore.reconnectDevice(dev.id);
              },
              children: t("reconnect")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-md-btn dsh-md-btn-danger",
              onClick: () => {
                void clientStore.removeDevice(dev.id);
              },
              children: t("remove")
            }
          )
        ] })
      ] }, dev.id)) })
    ] }),
    tab === "git" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 14 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { style: { fontSize: 14 }, children: t("gitAutoTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, #9ca3af)" }, children: t("gitAutoDesc") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              type: "checkbox",
              checked: snapshot.aggregationConfig.autoGitAggregate,
              onChange: (e) => {
                void clientStore.updateAggregationConfig({
                  autoGitAggregate: e.currentTarget.checked
                });
              }
            }
          ),
          t("gitAutoToggle")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              type: "checkbox",
              checked: snapshot.aggregationConfig.prefixUnmatchedWithDevice,
              onChange: (e) => {
                void clientStore.updateAggregationConfig({
                  prefixUnmatchedWithDevice: e.currentTarget.checked
                });
              }
            }
          ),
          t("gitPrefixToggle")
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { style: { fontSize: 14 }, children: t("logicalWorkspacesHeading") }),
        snapshot.logicalWorkspaces.map((lws) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "div",
          {
            style: {
              padding: "10px 12px",
              borderRadius: 8,
              border: "0.5px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.1))",
              display: "flex",
              flexDirection: "column",
              gap: 6
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: lws.title }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-md-badge", children: lws.kind.toUpperCase() }),
                  lws.gitRemote !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dsh-md-badge", style: { color: "#60a5fa" }, children: [
                    "\u2387 ",
                    lws.gitRemote
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dsh-md-badge", children: [
                    "Sessions: ",
                    lws.sessionIds.length
                  ] })
                ] }),
                lws.members.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 12 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t("targetDeviceForNewSession") }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                    "select",
                    {
                      className: "dsh-md-select",
                      style: { height: 26 },
                      value: lws.targetDeviceId,
                      onChange: (e) => {
                        void clientStore.setPreferredDevice(
                          lws.logicalWorkspaceId,
                          e.currentTarget.value
                        );
                      },
                      children: lws.members.map((m) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: m.deviceId, children: [
                        m.deviceName,
                        " (",
                        m.path,
                        ")"
                      ] }, `${m.deviceId}:${m.path}`))
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: lws.members.map((m) => {
                const memberKey = `${m.deviceId}:${m.path}`;
                const isExcluded = snapshot.aggregationConfig.excludedMemberKeys.includes(memberKey);
                return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dsh-md-badge", children: [
                  "\u{1F5A5} ",
                  m.deviceId === LOCAL_DEVICE_ID ? "Local" : m.deviceName,
                  ": ",
                  m.path,
                  " (",
                  m.sessionCount,
                  ")",
                  lws.kind === "git" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                    "button",
                    {
                      type: "button",
                      title: t("splitWorkspace"),
                      onClick: () => {
                        void clientStore.setMemberExcluded(memberKey, !isExcluded);
                      },
                      style: {
                        border: "none",
                        background: "transparent",
                        color: "#f59e0b",
                        cursor: "pointer",
                        marginLeft: 4,
                        fontSize: 11
                      },
                      children: isExcluded ? t("restoreAutoMerge") : "\xD7"
                    }
                  )
                ] }, memberKey);
              }) })
            ]
          },
          lws.logicalWorkspaceId
        ))
      ] }),
      snapshot.allPhysicalWorkspaces.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { style: { fontSize: 14 }, children: t("manualRuleBuilderTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-grid", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-field", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              className: "dsh-md-input",
              value: ruleTitle,
              placeholder: t("manualRuleNamePlaceholder"),
              onChange: (e) => setRuleTitle(e.currentTarget.value)
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-field", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              className: "dsh-md-input",
              value: ruleGitRemote,
              placeholder: t("manualRuleGitPlaceholder"),
              onChange: (e) => setRuleGitRemote(e.currentTarget.value)
            }
          ) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 }, children: snapshot.allPhysicalWorkspaces.map((pw) => {
          const key = `${pw.deviceId}:${pw.path}`;
          const checked = selectedMemberKeys.has(key);
          return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "label",
            {
              className: "dsh-md-badge",
              style: { cursor: "pointer", padding: "4px 8px" },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "input",
                  {
                    type: "checkbox",
                    checked,
                    onChange: (e) => {
                      const next = new Set(selectedMemberKeys);
                      if (e.currentTarget.checked) next.add(key);
                      else next.delete(key);
                      setSelectedMemberKeys(next);
                    }
                  }
                ),
                pw.deviceName,
                ": ",
                pw.path
              ]
            },
            key
          );
        }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "button",
          {
            type: "button",
            className: "dsh-md-btn dsh-md-btn-primary",
            disabled: ruleTitle.trim() === "" || selectedMemberKeys.size === 0 && ruleGitRemote.trim() === "",
            onClick: () => {
              void clientStore.upsertManualRule({
                id: `rule-${Date.now()}`,
                title: ruleTitle.trim(),
                memberKeys: [...selectedMemberKeys],
                ...ruleGitRemote.trim() !== "" ? { gitRemote: ruleGitRemote.trim() } : {}
              });
              setRuleTitle("");
              setRuleGitRemote("");
              setSelectedMemberKeys(/* @__PURE__ */ new Set());
            },
            children: [
              "+ ",
              t("createManualRule")
            ]
          }
        ) })
      ] })
    ] }),
    tab === "native" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(NativeViewport, { t, embedded: true, onOpenSettings: () => setTab("devices") })
  ] });
}

// src/client/styles.ts
var STYLE_TAG_ID = "dsh-multi-device/styles.css";
var CSS_TEXT = `
.dsh-md-overlay-bar {
  position: fixed;
  top: var(--dsh-frame-chrome-top, 10px);
  right: 16px;
  z-index: 90;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1, rgba(30, 32, 37, 0.92));
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(12px);
  color: var(--dsw-alias-label-primary, #e5e7eb);
  font-size: 12px;
  line-height: 18px;
  user-select: none;
}

.dsh-md-mode-seg {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.06));
  padding: 2px;
  gap: 2px;
}

.dsh-md-mode-btn {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #9ca3af);
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: background 0.15s ease, color 0.15s ease;
}

.dsh-md-mode-btn:hover {
  color: var(--dsw-alias-label-primary, #f3f4f6);
}

.dsh-md-mode-btn[data-active="true"] {
  background: var(--dsw-alias-state-business-primary, #3b82f6);
  color: #ffffff;
}

.dsh-md-device-pill {
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  background: transparent;
  color: var(--dsw-alias-label-primary, #e5e7eb);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dsh-md-device-pill:hover,
.dsh-md-device-pill[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(59, 130, 246, 0.16));
  border-color: var(--dsw-alias-state-business-primary, #3b82f6);
}

.dsh-md-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.dsh-md-dot[data-state="connected"] { background: #10b981; }
.dsh-md-dot[data-state="connecting"],
.dsh-md-dot[data-state="reconnecting"] { background: #f59e0b; animation: dsh-md-pulse 1.2s infinite; }
.dsh-md-dot[data-state="error"] { background: #ef4444; }
.dsh-md-dot[data-state="disabled"] { background: #6b7280; }

@keyframes dsh-md-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.dsh-md-native-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 80;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, #111318);
  color: var(--dsw-alias-label-primary, #e5e7eb);
}

.dsh-md-native-toolbar {
  height: 42px;
  padding: 0 12px;
  padding-left: calc(var(--dsh-frame-leading-clearance, 12px) + 64px);
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  background: var(--dsw-specific-sidebar-fill, #181a20);
  flex-shrink: 0;
  overflow-x: auto;
}

.dsh-md-native-stage {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

.dsh-md-native-frame-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

.dsh-md-native-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  flex: 1;
  background: var(--dsw-alias-bg-base, #111318);
}

.dsh-md-hub-root {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--dsw-alias-label-primary, #e5e7eb);
  background: var(--dsw-alias-bg-base, transparent);
  overflow-y: auto;
  padding: 20px 24px;
  box-sizing: border-box;
  gap: 16px;
}

.dsh-md-hub-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dsh-md-tabs {
  display: flex;
  gap: 16px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
}

.dsh-md-tab {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  padding: 8px 2px 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
}

.dsh-md-tab[data-active="true"] {
  color: var(--dsw-alias-label-primary, #ffffff);
}

.dsh-md-tab[data-active="true"]::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--dsw-alias-state-business-primary, #3b82f6);
  border-radius: 2px 2px 0 0;
}

.dsh-md-card {
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.03));
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsh-md-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.dsh-md-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.dsh-md-field label {
  color: var(--dsw-alias-label-secondary, #9ca3af);
  font-weight: 500;
}

.dsh-md-input,
.dsh-md-select {
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  background: var(--dsw-alias-bg-base, rgba(0, 0, 0, 0.2));
  color: var(--dsw-alias-label-primary, #e5e7eb);
  font-size: 12px;
  box-sizing: border-box;
}

.dsh-md-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.06));
  color: var(--dsw-alias-label-primary, #e5e7eb);
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.dsh-md-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.12));
}

.dsh-md-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.dsh-md-btn-primary {
  background: var(--dsw-alias-state-business-primary, #2563eb);
  border-color: var(--dsw-alias-state-business-primary, #2563eb);
  color: #ffffff;
}

.dsh-md-btn-primary:hover:not(:disabled) {
  filter: brightness(1.08);
}

.dsh-md-btn-danger:hover:not(:disabled) {
  color: #ef4444;
  border-color: #ef4444;
}

.dsh-md-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-secondary, #9ca3af);
}

.dsh-md-row-leading-tag {
  font-size: 9px;
  font-weight: 600;
  padding: 0 3px;
  border-radius: 3px;
  background: rgba(59, 130, 246, 0.18);
  color: #60a5fa;
  line-height: 13px;
  max-width: 16px;
  overflow: hidden;
  text-overflow: clip;
}
`;
function adoptMultiDeviceStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`) !== null) return;
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-multi-device");
  tag.setAttribute("data-plugin-css", STYLE_TAG_ID);
  tag.textContent = CSS_TEXT;
  document.head.appendChild(tag);
}

// src/client/index.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var PANEL_ID = "multi-device-hub";
var inject = ["slots", "locale"];
var zhPreferred = typeof navigator !== "undefined" ? navigator.language.toLowerCase().startsWith("zh") : true;
var fallbackDict = zhPreferred ? zh : en;
function translateFallback(key) {
  return fallbackDict[key] ?? en[key] ?? key;
}
function HubPanelIcon({ size = 16 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("rect", { x: "1.5", y: "2", width: "8.5", height: "6", rx: "1.2", stroke: "currentColor", strokeWidth: "1.3" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("rect", { x: "6", y: "8", width: "8.5", height: "6", rx: "1.2", stroke: "currentColor", strokeWidth: "1.3" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M4 11H6M10 5H12", stroke: "currentColor", strokeWidth: "1.3", strokeLinecap: "round" })
  ] });
}
function apply(ctx) {
  adoptMultiDeviceStyles();
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), "dsh-multi-device: locales");
  ctx.effect(() => clientStore.start(), "dsh-multi-device: client-store");
  const getTranslate = () => {
    try {
      if (typeof ctx.locale.bind === "function") {
        return ctx.locale.bind(LOCALE_NS);
      }
    } catch {
    }
    return translateFallback;
  };
  const openHubPanel = () => {
    try {
      ctx.layout?.selectPanel(PANEL_ID);
    } catch {
    }
  };
  ctx.inject(["shortcuts"], (shortcutCtx) => {
    shortcutCtx.effect(() => {
      if (shortcutCtx.shortcuts === void 0) return () => {
      };
      return shortcutCtx.shortcuts.register({
        id: "multiDevice.toggleMode",
        label: () => getTranslate()("switchToNative"),
        aliases: ["toggle native mode", "multi device mode"],
        defaults: {
          "desktop:macos": { code: "KeyM", modifiers: ["primary", "shift"] },
          "desktop:windows": { code: "KeyM", modifiers: ["primary", "shift"] },
          "desktop:linux": { code: "KeyM", modifiers: ["primary", "shift"] },
          "web:macos": { code: "KeyM", modifiers: ["primary", "shift"] },
          "web:windows": { code: "KeyM", modifiers: ["primary", "shift"] }
        },
        regions: ["page", "editable"],
        modals: [],
        resolve: () => ({
          status: "handled",
          run: () => {
            clientStore.toggleDisplayMode();
          }
        })
      });
    }, "dsh-multi-device: shortcut");
  });
  ctx.slots.inject(
    "shell.overlay",
    () => ctx.slots.register(
      {
        name: "shell.overlay",
        id: "multi-device-switcher",
        order: 40,
        locale: LOCALE_NS
      },
      (props) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ModeSwitcherOverlay, { t: props.t ?? getTranslate(), onOpenHubPanel: openHubPanel })
    )
  );
  ctx.slots.inject(
    "sidebar.panellist",
    () => ctx.slots.register(
      {
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: 25,
        label: () => getTranslate()("panelTitle")
      },
      (props) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(HubPanelIcon, { size: props.size, active: props.active })
    )
  );
  ctx.slots.inject(
    "main",
    () => ctx.slots.register(
      {
        name: "main",
        key: PANEL_ID,
        locale: LOCALE_NS
      },
      (props) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(MultiDeviceHubPanel, { t: props.t ?? getTranslate() })
    )
  );
  ctx.slots.inject(
    "settings.plugins.tab",
    () => ctx.slots.register(
      {
        name: "settings.plugins.tab",
        id: "multi-device-hub",
        order: 8,
        label: () => getTranslate()("settingsTabTitle"),
        locale: LOCALE_NS
      },
      (props) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(MultiDeviceHubPanel, { t: props.t ?? getTranslate() })
    )
  );
  ctx.slots.inject(
    "sidebar.session.row.leading",
    () => ctx.slots.register(
      {
        name: "sidebar.session.row.leading",
        id: "multi-device-row-badge",
        order: 10
      },
      (props) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SessionRowLeadingBadge, { sessionId: props.sessionId })
    )
  );
  ctx.slots.inject(
    "sidebar.session.row.hover",
    () => ctx.slots.register(
      {
        name: "sidebar.session.row.hover",
        id: "multi-device-row-hover",
        order: 10,
        locale: LOCALE_NS
      },
      (props) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SessionRowHoverDeviceSection, { sessionId: props.sessionId, t: props.t ?? getTranslate() })
    )
  );
  ctx.slots.inject(
    "sidebar.workspaces.session.menu.item",
    () => ctx.slots.register(
      {
        name: "sidebar.workspaces.session.menu.item",
        id: "multi-device-open-native",
        order: 450,
        locale: LOCALE_NS
      },
      (props) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        SessionMenuOpenInNativeItem,
        {
          sessionId: props.sessionId,
          useMenuOpenState: props.useMenuOpenState,
          t: props.t ?? getTranslate()
        }
      )
    )
  );
}
return module.exports; } });
//# sourceMappingURL=client.js.map

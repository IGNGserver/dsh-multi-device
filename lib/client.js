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
  SETTINGS_SECTION_ID: () => SETTINGS_SECTION_ID,
  apply: () => apply,
  inject: () => inject,
  openSettingsSection: () => openSettingsSection
});
module.exports = __toCommonJS(index_exports);
var import_react6 = require("react");

// src/client/locales.ts
var LOCALE_NS = "multiDevice";
var zh = {
  settingsSectionTitle: "\u591A\u8BBE\u5907",
  settingsSectionIntro: "\u901A\u8FC7 SSH \u96A7\u9053\u8FDE\u63A5\u8FDC\u7AEF\u5F00\u53D1\u673A\uFF0C\u5728\u4FA7\u8FB9\u680F\u7EDF\u4E00\u805A\u5408\u4F1A\u8BDD\uFF0C\u6216\u5207\u6362\u81F3\u5B8C\u6574\u7684\u8FDC\u7AEF\u539F\u751F\u754C\u9762\u3002",
  pluginSummary: "\u8FDE\u63A5\u591A\u53F0\u8FDC\u7AEF DSH \u5F00\u53D1\u673A\uFF0C\u652F\u6301\u8DE8\u673A\u5DE5\u4F5C\u533A\u805A\u5408\u4E0E\u539F\u751F\u754C\u9762\u5207\u6362\u3002",
  close: "\u5173\u95ED",
  modeRowTitle: "\u754C\u9762\u6A21\u5F0F",
  modeRowDesc: "\u805A\u5408\u6A21\u5F0F\u5728\u5F53\u524D\u4FA7\u8FB9\u680F\u5408\u5E76\u6240\u6709\u8BBE\u5907\u7684\u4F1A\u8BDD\uFF1B\u539F\u751F\u6A21\u5F0F\u76F4\u63A5\u5C55\u793A\u6307\u5B9A\u8FDC\u7AEF\u8BBE\u5907\u7684\u5B8C\u6574\u754C\u9762\u3002",
  modeAggregated: "\u805A\u5408\u6A21\u5F0F",
  modeNative: "\u539F\u751F\u6A21\u5F0F",
  modeNativeNoDeviceHint: "\u8BF7\u5148\u6DFB\u52A0\u81F3\u5C11\u4E00\u53F0\u8FDC\u7AEF\u8BBE\u5907",
  switchToAggregated: "\u8FD4\u56DE\u805A\u5408\u6A21\u5F0F",
  toggleMode: "\u5207\u6362\u805A\u5408\u6A21\u5F0F / \u539F\u751F\u6A21\u5F0F",
  gitAutoTitle: "\u81EA\u52A8\u805A\u5408\u76F8\u540C Git \u4ED3\u5E93",
  gitAutoDesc: "\u5C06\u4E0D\u540C\u8BBE\u5907\u4E0A\u6307\u5411\u540C\u4E00 Git \u8FDC\u7AEF\u7684\u5DE5\u4F5C\u533A\u5408\u5E76\u5C55\u793A\u4F1A\u8BDD\uFF0C\u4E0D\u4F1A\u540C\u6B65\u6216\u4FEE\u6539\u4EFB\u4F55\u9879\u76EE\u6587\u4EF6\u3002",
  targetDeviceHeading: "\u8DE8\u8BBE\u5907\u4ED3\u5E93\u7684\u65B0\u5EFA\u4F1A\u8BDD\u9ED8\u8BA4\u8BBE\u5907",
  devicesHeading: "\u8FDC\u7AEF\u8BBE\u5907",
  addDevice: "\u6DFB\u52A0\u8BBE\u5907",
  editDevice: "\u7F16\u8F91\u8BBE\u5907",
  importSshPlaceholder: "\u4ECE ~/.ssh/config \u5FEB\u901F\u586B\u5165\u2026",
  sshHost: "SSH \u4E3B\u673A",
  sshHostPlaceholder: "~/.ssh/config \u4E3B\u673A\u522B\u540D\u3001IP\uFF0C\u6216 user@host:port",
  deviceName: "\u663E\u793A\u540D\u79F0\uFF08\u53EF\u9009\uFF09",
  deviceNamePlaceholder: "\u7559\u7A7A\u9ED8\u8BA4\u4F7F\u7528\u4E3B\u673A\u540D",
  authCredential: "\u8FDC\u7AEF\u542F\u52A8\u94FE\u63A5\u6216 Token\uFF08\u53EF\u9009\uFF09",
  authCredentialPlaceholder: "\u9996\u6B21\u8FDE\u63A5\u53EF\u7C98\u8D34 dsh web \u542F\u52A8\u94FE\u63A5\u6216 Token\uFF1B\u5DF2\u8BA4\u8BC1\u53EF\u7559\u7A7A",
  keyReveal: "\u663E\u793A\u51ED\u636E",
  keyHide: "\u9690\u85CF\u51ED\u636E",
  advancedOptions: "\u9AD8\u7EA7\u8FDE\u63A5\u9009\u9879",
  remoteDshPort: "\u8FDC\u7AEF DSH \u7AEF\u53E3",
  sshUser: "SSH \u7528\u6237\u540D",
  sshUserPlaceholder: "\u7559\u7A7A\u590D\u7528 ~/.ssh/config",
  sshPort: "SSH \u7AEF\u53E3",
  sshKeySelect: "SSH \u79C1\u94A5",
  sshKeyAuto: "\u81EA\u52A8\uFF08SSH Agent / \u9ED8\u8BA4\u5BC6\u94A5\uFF09",
  sshKeyPassphrase: "\u79C1\u94A5\u53E3\u4EE4",
  sshKeyPassphrasePlaceholder: "\u8F93\u5165\u52A0\u5BC6\u79C1\u94A5\u53E3\u4EE4\uFF1B\u7559\u7A7A\u4F7F\u7528 SSH Agent",
  sshProxyJump: "ProxyJump \u8DF3\u677F\u673A",
  sshProxyJumpPlaceholder: "\u53EF\u9009\uFF0C\u7559\u7A7A\u590D\u7528 ~/.ssh/config",
  authBootstrap: "\u901A\u8FC7 SSH \u8BFB\u53D6\u8FDC\u7AEF\u51ED\u636E\u5E76\u7B7E\u53D1 Cookie\uFF08\u7B7E\u540D\u5BC6\u94A5\u4E0D\u5199\u5165\u672C\u673A\uFF09",
  remoteDshHome: "\u8FDC\u7AEF DSH \u4E3B\u76EE\u5F55\uFF08\u53EF\u9009\uFF09",
  remoteDshHomePlaceholder: "\u9ED8\u8BA4 ~/.dsh",
  testConnection: "\u6D4B\u8BD5\u8FDE\u63A5",
  testingConnection: "\u6D4B\u8BD5\u4E2D\u2026",
  testPassed: "\u8FDE\u63A5\u6210\u529F",
  saveDevice: "\u4FDD\u5B58",
  savingDevice: "\u4FDD\u5B58\u4E2D\u2026",
  cancel: "\u53D6\u6D88",
  reconnect: "\u91CD\u65B0\u8FDE\u63A5",
  reconnectedNotice: "\u5DF2\u89E6\u53D1\u91CD\u65B0\u8FDE\u63A5",
  remove: "\u79FB\u9664",
  deleteTitle: "\u79FB\u9664\u8BBE\u5907\u201C{name}\u201D\uFF1F",
  deleteDescription: "\u79FB\u9664\u540E\u5C06\u65AD\u5F00\u8BE5\u8BBE\u5907\u7684 SSH \u96A7\u9053\uFF0C\u5E76\u505C\u6B62\u805A\u5408\u5176\u5DE5\u4F5C\u533A\u4E0E\u4F1A\u8BDD\u3002\u8FDC\u7AEF\u8BBE\u5907\u4E0A\u7684\u6570\u636E\u4E0D\u53D7\u5F71\u54CD\u3002",
  deleteConfirm: "\u79FB\u9664\u8BBE\u5907",
  deletingDevice: "\u79FB\u9664\u4E2D\u2026",
  openNative: "\u539F\u751F\u754C\u9762",
  openExternal: "\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00",
  reloadPage: "\u5237\u65B0\u8FDC\u7AEF\u9875\u9762",
  releaseKeepAlive: "\u5173\u95ED\u540E\u53F0\u4FDD\u6D3B\u9875\u9762",
  statusConnected: "\u5DF2\u8FDE\u63A5",
  statusConnecting: "\u8FDE\u63A5\u4E2D",
  statusReconnecting: "\u91CD\u8FDE\u4E2D",
  statusError: "\u8FDE\u63A5\u5F02\u5E38",
  statusDisabled: "\u5DF2\u505C\u7528",
  runningCount: "{count} \u8FD0\u884C\u4E2D",
  pendingCount: "{count} \u5F85\u786E\u8BA4",
  noDevicesTitle: "\u5C1A\u672A\u6DFB\u52A0\u8FDC\u7AEF\u8BBE\u5907",
  noDevicesDesc: "\u70B9\u51FB\u4E0A\u65B9\u201C\u6DFB\u52A0\u8BBE\u5907\u201D\uFF0C\u901A\u8FC7 SSH \u8FDE\u63A5\u4F60\u7684\u5176\u4ED6\u5F00\u53D1\u673A\u6216\u670D\u52A1\u5668\u3002",
  menuOpenInNative: "\u5728\u539F\u751F\u6A21\u5F0F\u4E2D\u6253\u5F00\u6240\u5C5E\u8BBE\u5907",
  hoverDeviceLabel: "\u6240\u5C5E\u8BBE\u5907",
  hoverGitRepoLabel: "Git \u4ED3\u5E93",
  gatewayDegradedNotice: "\u805A\u5408\u7F51\u5173\u5F53\u524D\u5904\u4E8E\u964D\u7EA7\u72B6\u6001\uFF0C\u539F\u751F\u6A21\u5F0F\u4ECD\u53EF\u6B63\u5E38\u4F7F\u7528",
  savedNotice: "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58",
  actionFailed: "\u64CD\u4F5C\u5931\u8D25",
  sidebarEntryLabel: "\u591A\u8BBE\u5907",
  sidebarEntryTitle: "\u6253\u5F00\u591A\u8BBE\u5907\u9762\u677F",
  popoverEmpty: "\u5C1A\u672A\u6DFB\u52A0\u8FDC\u7AEF\u8BBE\u5907\uFF0C\u5148\u5728\u8BBE\u7F6E\u4E2D\u8FDE\u63A5\u4E00\u53F0 SSH \u8BBE\u5907\u3002",
  popoverDevices: "\u8FDC\u7AEF\u8BBE\u5907",
  popoverSettings: "\u591A\u8BBE\u5907\u8BBE\u7F6E",
  popoverRefresh: "\u5237\u65B0\u72B6\u6001",
  nativeExitHint: "\u6309 Esc \u4E5F\u53EF\u8FD4\u56DE\u805A\u5408\u6A21\u5F0F",
  authRequired: "\u9700\u8981\u767B\u5F55",
  authPanelTitle: "\u8FDC\u7AEF DSH \u9700\u8981\u767B\u5F55",
  authPanelDesc: "SSH \u96A7\u9053\u5DF2\u8FDE\u901A\uFF0C\u4F46\u8FDC\u7AEF DSH \u62D2\u7EDD\u4E86\u5F53\u524D\u51ED\u636E\u3002\u53EF\u7C98\u8D34 dsh web \u542F\u52A8\u65F6\u6253\u5370\u7684\u94FE\u63A5/Token\uFF0C\u6216\u8BA9\u63D2\u4EF6\u901A\u8FC7 SSH \u91CD\u65B0\u7B7E\u53D1 Cookie\u3002",
  authCredentialLabel: "\u542F\u52A8\u94FE\u63A5\u6216 Token",
  authTokenPlaceholder: "\u7C98\u8D34 http://127.0.0.1:3080/?token=\u2026 \u6216\u88F8 Token",
  authSubmit: "\u767B\u5F55\u5E76\u91CD\u8BD5",
  authUseSsh: "\u901A\u8FC7 SSH \u81EA\u52A8\u4FEE\u590D",
  authChecking: "\u6B63\u5728\u9A8C\u8BC1\u2026",
  authSuccess: "\u767B\u5F55\u6210\u529F\uFF0C\u6B63\u5728\u52A0\u8F7D\u8FDC\u7AEF\u754C\u9762\u2026",
  authFailed: "\u767B\u5F55\u5931\u8D25",
  authBack: "\u8FD4\u56DE\u805A\u5408\u6A21\u5F0F",
  authOpenSettings: "\u6253\u5F00\u591A\u8BBE\u5907\u8BBE\u7F6E",
  authHint: "\u82E5\u8FDC\u7AEF DSH \u5173\u95ED\u4E86 Token \u767B\u5F55\uFF0C\u8BF7\u5728\u8FDC\u7AEF\u91CD\u65B0\u542F\u52A8 dsh web \u540E\u7C98\u8D34\u65B0\u7684\u542F\u52A8\u94FE\u63A5\u3002"
};
var en = {
  settingsSectionTitle: "Multi-Device",
  settingsSectionIntro: "Connect remote machines over SSH tunnels to aggregate sessions in the sidebar or switch into their full native UI.",
  pluginSummary: "Connect remote DSH machines with Git workspace aggregation and native UI switching.",
  close: "Close",
  modeRowTitle: "Display mode",
  modeRowDesc: "Aggregated merges sessions from all devices in the sidebar; Native UI opens the full interface of a remote device.",
  modeAggregated: "Aggregated",
  modeNative: "Native UI",
  modeNativeNoDeviceHint: "Add at least one remote device first",
  switchToAggregated: "Back to Aggregated",
  toggleMode: "Toggle Aggregated / Native Mode",
  gitAutoTitle: "Auto-group matching Git repositories",
  gitAutoDesc: "Merge workspaces pointing to the same Git remote across devices without syncing or modifying files.",
  targetDeviceHeading: "Default device for new sessions in merged repositories",
  devicesHeading: "Remote devices",
  addDevice: "Add device",
  editDevice: "Edit device",
  importSshPlaceholder: "Quick fill from ~/.ssh/config\u2026",
  sshHost: "SSH host",
  sshHostPlaceholder: "~/.ssh/config alias, IP, or user@host:port",
  deviceName: "Display name (optional)",
  deviceNamePlaceholder: "Defaults to the SSH host name",
  authCredential: "Remote launch URL or token (optional)",
  authCredentialPlaceholder: "Paste URL or token printed by dsh web on first login; leave blank afterwards",
  keyReveal: "Show credential",
  keyHide: "Hide credential",
  advancedOptions: "Advanced connection options",
  remoteDshPort: "Remote DSH port",
  sshUser: "SSH user",
  sshUserPlaceholder: "Blank reuses ~/.ssh/config",
  sshPort: "SSH port",
  sshKeySelect: "SSH private key",
  sshKeyAuto: "Auto (SSH Agent / default keys)",
  sshKeyPassphrase: "Key passphrase",
  sshKeyPassphrasePlaceholder: "Passphrase for encrypted key; blank uses SSH Agent",
  sshProxyJump: "ProxyJump",
  sshProxyJumpPlaceholder: "Optional; blank reuses ~/.ssh/config",
  authBootstrap: "Read remote credentials over SSH and mint a cookie (signing secret is not saved locally)",
  remoteDshHome: "Remote DSH home (optional)",
  remoteDshHomePlaceholder: "Defaults to ~/.dsh",
  testConnection: "Test connection",
  testingConnection: "Testing\u2026",
  testPassed: "Connected",
  saveDevice: "Save",
  savingDevice: "Saving\u2026",
  cancel: "Cancel",
  reconnect: "Reconnect",
  reconnectedNotice: "Reconnection triggered",
  remove: "Remove",
  deleteTitle: 'Remove device "{name}"?',
  deleteDescription: "This closes its SSH tunnel and removes its sessions from the sidebar. Data on the remote machine is untouched.",
  deleteConfirm: "Remove device",
  deletingDevice: "Removing\u2026",
  openNative: "Native UI",
  openExternal: "Open in browser",
  reloadPage: "Reload remote page",
  releaseKeepAlive: "Close background page",
  statusConnected: "Connected",
  statusConnecting: "Connecting",
  statusReconnecting: "Reconnecting",
  statusError: "Disconnected",
  statusDisabled: "Disabled",
  runningCount: "{count} running",
  pendingCount: "{count} pending",
  noDevicesTitle: "No remote devices yet",
  noDevicesDesc: 'Select "Add device" above to connect another machine over SSH.',
  menuOpenInNative: "Open device in Native Mode",
  hoverDeviceLabel: "Device",
  hoverGitRepoLabel: "Git repo",
  gatewayDegradedNotice: "Aggregated gateway is degraded; Native Mode remains available",
  savedNotice: "Settings saved",
  actionFailed: "Action failed",
  sidebarEntryLabel: "Multi-Device",
  sidebarEntryTitle: "Open Multi-Device panel",
  popoverEmpty: "No remote devices yet. Add one over SSH in Settings.",
  popoverDevices: "Remote devices",
  popoverSettings: "Multi-Device settings",
  popoverRefresh: "Refresh status",
  nativeExitHint: "Press Esc to return to Aggregated mode",
  authRequired: "Sign-in required",
  authPanelTitle: "Remote DSH requires sign-in",
  authPanelDesc: "The SSH tunnel is up, but the remote DSH rejected the current credential. Paste the launch URL/token printed by dsh web, or let the plugin mint a fresh cookie over SSH.",
  authCredentialLabel: "Launch URL or token",
  authTokenPlaceholder: "Paste http://127.0.0.1:3080/?token=\u2026 or a bare token",
  authSubmit: "Sign in and retry",
  authUseSsh: "Repair via SSH",
  authChecking: "Verifying\u2026",
  authSuccess: "Signed in. Loading the remote UI\u2026",
  authFailed: "Sign-in failed",
  authBack: "Back to Aggregated",
  authOpenSettings: "Open Multi-Device settings",
  authHint: "If the remote DSH disabled token sign-in, restart dsh web there and paste the new launch URL."
};

// src/client/ModeSwitcherOverlay.tsx
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react4 = require("react");

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

// src/client/MultiDeviceHubPanel.tsx
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react2 = require("react");

// src/client/state.ts
var import_react = require("react");
function deviceStateToDotState(state) {
  switch (state) {
    case "connected":
      return "done";
    case "connecting":
    case "reconnecting":
      return "ongoing";
    case "error":
      return "error";
    case "disabled":
    default:
      return "idle";
  }
}
function parseSshHostInput(raw) {
  let trimmed = raw.trim();
  if (trimmed === "") return { host: "" };
  if (trimmed.toLowerCase().startsWith("ssh://")) {
    try {
      const parsed = new URL(trimmed);
      const portNum = parsed.port !== "" ? Number(parsed.port) : void 0;
      return {
        host: parsed.hostname,
        ...parsed.username !== "" ? { username: decodeURIComponent(parsed.username) } : {},
        ...portNum !== void 0 && Number.isInteger(portNum) && portNum > 0 && portNum <= 65535 ? { port: portNum } : {}
      };
    } catch {
      trimmed = trimmed.slice("ssh://".length);
    }
  }
  let username;
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex > 0 && atIndex < trimmed.length - 1) {
    username = trimmed.slice(0, atIndex);
    trimmed = trimmed.slice(atIndex + 1);
  }
  if (trimmed.startsWith("[")) {
    const closeIdx = trimmed.indexOf("]");
    if (closeIdx > 1) {
      const host = trimmed.slice(1, closeIdx);
      const rest = trimmed.slice(closeIdx + 1);
      if (rest.startsWith(":")) {
        const portNum = Number(rest.slice(1));
        if (Number.isInteger(portNum) && portNum > 0 && portNum <= 65535) {
          return {
            host,
            ...username !== void 0 ? { username } : {},
            port: portNum
          };
        }
      }
      return { host, ...username !== void 0 ? { username } : {} };
    }
  }
  const firstColon = trimmed.indexOf(":");
  if (firstColon > 0 && firstColon === trimmed.lastIndexOf(":")) {
    const hostPart = trimmed.slice(0, firstColon);
    const portPart = trimmed.slice(firstColon + 1);
    const portNum = Number(portPart);
    if (hostPart !== "" && /^\d+$/.test(portPart) && portNum > 0 && portNum <= 65535) {
      return {
        host: hostPart,
        ...username !== void 0 ? { username } : {},
        port: portNum
      };
    }
  }
  return {
    host: trimmed,
    ...username !== void 0 ? { username } : {}
  };
}
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
    workspaceOrder: [],
    manualRules: []
  },
  logicalWorkspaces: [],
  allPhysicalWorkspaces: [],
  sessionOrigins: {}
};
function loadPersistedUiPrefs() {
  if (typeof localStorage === "undefined") {
    return { displayMode: "aggregated" };
  }
  try {
    const raw = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? "{}");
    return {
      displayMode: raw.displayMode === "native" ? "native" : "aggregated",
      ...typeof raw.activeNativeDeviceId === "string" && raw.activeNativeDeviceId !== "" ? { activeNativeDeviceId: raw.activeNativeDeviceId } : {}
    };
  } catch {
    return { displayMode: "aggregated" };
  }
}
function savePersistedUiPrefs(state) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({
        displayMode: state.displayMode,
        activeNativeDeviceId: state.activeNativeDeviceId
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
  sseRetryTimer;
  sseAttempt = 0;
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
      settingsModalOpen: false
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
      if (this.sseRetryTimer !== void 0) {
        clearTimeout(this.sseRetryTimer);
        this.sseRetryTimer = void 0;
      }
    };
  }
  connectSse() {
    if (typeof EventSource === "undefined" || !this.started) return;
    this.eventSource?.close();
    try {
      const es = new EventSource("/multi-device/events");
      this.eventSource = es;
      es.addEventListener("snapshot", (ev) => {
        this.sseAttempt = 0;
        try {
          const snap = JSON.parse(ev.data);
          this.applyIncomingSnapshot(snap);
        } catch {
        }
      });
      es.onerror = () => {
        es.close();
        if (this.eventSource === es) this.eventSource = void 0;
        if (!this.started || this.sseRetryTimer !== void 0) return;
        const delay = Math.min(15e3, 500 * 2 ** this.sseAttempt);
        this.sseAttempt = Math.min(this.sseAttempt + 1, 6);
        this.sseRetryTimer = setTimeout(() => {
          this.sseRetryTimer = void 0;
          this.connectSse();
        }, delay);
      };
    } catch {
    }
  }
  applyIncomingSnapshot(snap) {
    if (snap.revision < this.state.snapshot.revision) return;
    const alive = new Set(
      snap.devices.filter((device) => device.keepNativeAlive !== false).map((device) => device.id)
    );
    let activeNative = this.state.activeNativeDeviceId;
    if (activeNative === void 0 || !alive.has(activeNative)) {
      activeNative = snap.devices.find((device) => alive.has(device.id))?.id;
    }
    const keepAlive = this.state.keepAliveDeviceIds.filter((id) => alive.has(id)).slice(-MAX_KEEP_ALIVE_PAGES);
    const nextDisplayMode = this.state.displayMode === "native" && snap.devices.length === 0 ? "aggregated" : this.state.displayMode;
    if (nextDisplayMode === "native" && activeNative !== void 0 && !keepAlive.includes(activeNative)) {
      keepAlive.push(activeNative);
      while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) keepAlive.shift();
    }
    this.setState({
      snapshot: snap,
      loading: false,
      error: void 0,
      displayMode: nextDisplayMode,
      ...activeNative !== void 0 ? { activeNativeDeviceId: activeNative } : {},
      keepAliveDeviceIds: keepAlive
    });
  }
  // ==========================================================================
  // UI Navigation & Keep-Alive Actions
  // ==========================================================================
  setDisplayMode(mode, targetDeviceId) {
    if (mode === "native" && this.state.snapshot.devices.length === 0 && targetDeviceId === void 0) {
      return;
    }
    const nextDeviceId = targetDeviceId ?? this.state.activeNativeDeviceId ?? this.state.snapshot.devices[0]?.id;
    const alive = new Set(
      this.state.snapshot.devices.filter((device) => device.keepNativeAlive !== false).map((device) => device.id)
    );
    const keepAlive = this.state.keepAliveDeviceIds.filter((id) => alive.has(id));
    if (mode === "native" && nextDeviceId !== void 0 && alive.has(nextDeviceId)) {
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
  setSettingsModalOpen(open) {
    this.setState({ settingsModalOpen: open });
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
      this.setState({ error: void 0 });
      return { ok: true };
    }
    this.setState({ error: res.error });
    return { ok: false, error: res.error };
  }
  async reconnectDevice(deviceId) {
    const res = await this.callControlPlane({
      action: "reconnectDevice",
      payload: { deviceId }
    });
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot);
      this.setState({ error: void 0 });
      return { ok: true };
    }
    this.setState({ error: res.error });
    return { ok: false, error: res.error };
  }
  async testDevice(input) {
    const res = await this.callControlPlane({
      action: "testDevice",
      payload: input
    });
    return res.ok ? { ok: true, ...res.value } : res;
  }
  async listSshKeys() {
    const res = await this.callControlPlane({ action: "listSshKeys" });
    return res.ok ? res.value.keys : [];
  }
  async createRemoteSession(input) {
    const res = await this.callControlPlane({
      action: "createSession",
      payload: input
    });
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot);
      return { ok: true, sessionId: res.value.sessionId };
    }
    return { ok: false, error: res.error };
  }
  async createRemoteWorkspace(input) {
    const res = await this.callControlPlane({
      action: "createRemoteWorkspace",
      payload: input
    });
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot);
      return { ok: true };
    }
    return { ok: false, error: res.error };
  }
  async updateAggregationConfig(patch) {
    const res = await this.callControlPlane({
      action: "updateAggregationConfig",
      payload: patch
    });
    if (res.ok) {
      this.applyIncomingSnapshot(res.value);
      this.setState({ error: void 0 });
      return { ok: true };
    }
    this.setState({ error: res.error });
    return { ok: false, error: res.error };
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
    if (res.ok) {
      this.applyIncomingSnapshot(res.value);
      this.setState({ error: void 0 });
      return { ok: true };
    }
    this.setState({ error: res.error });
    return { ok: false, error: res.error };
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

// src/client/MultiDeviceHubPanel.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var EYE_CONTOUR = "M1.5 8C2.9 5.25 5.25 3.5 8 3.5C10.75 3.5 13.1 5.25 14.5 8C13.1 10.75 10.75 12.5 8 12.5C5.25 12.5 2.9 10.75 1.5 8Z";
var EYE_PATH = `${EYE_CONTOUR}M10 8C10 9.1 9.1 10 8 10C6.9 10 6 9.1 6 8C6 6.9 6.9 6 8 6C9.1 6 10 6.9 10 8Z`;
var EYE_OFF_PATH = `${EYE_CONTOUR}M2.5 2.5L13.5 13.5`;
function formatCompactDeviceTarget(dev) {
  if (dev.ssh !== void 0) {
    const userPart = dev.ssh.username !== void 0 && dev.ssh.username !== "" ? `${dev.ssh.username}@` : "";
    const sshPortPart = dev.ssh.port !== void 0 && dev.ssh.port !== 22 ? `:${String(dev.ssh.port)}` : "";
    const remotePortPart = dev.ssh.remotePort !== void 0 && dev.ssh.remotePort !== 3080 ? ` \u2192 :${String(dev.ssh.remotePort)}` : "";
    return `${userPart}${dev.ssh.host}${sshPortPart}${remotePortPart}`;
  }
  return dev.targetSummary;
}
function hasCustomAdvancedFields(dev) {
  if (dev?.ssh === void 0) return false;
  return dev.ssh.remotePort !== void 0 && dev.ssh.remotePort !== 3080 || dev.ssh.port !== void 0 && dev.ssh.port !== 22 || dev.ssh.username !== void 0 && dev.ssh.username !== "" || dev.ssh.privateKeyPath !== void 0 && dev.ssh.privateKeyPath !== "" || dev.ssh.proxyJump !== void 0 && dev.ssh.proxyJump !== "" || dev.ssh.remoteDshHome !== void 0 && dev.ssh.remoteDshHome !== "" || dev.ssh.bootstrapFromRemoteCredentials === false;
}
function SecretCredentialInput({
  id,
  value,
  placeholder,
  disabled,
  t,
  onChange
}) {
  const [revealedValue, setRevealedValue] = (0, import_react2.useState)(void 0);
  const revealed = value.length > 0 && revealedValue === value;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-secret-wrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives.Input,
      {
        id,
        className: "dsh-md-secret-input",
        type: revealed ? "text" : "password",
        autoComplete: "new-password",
        value,
        placeholder,
        disabled,
        onChange: (e) => {
          setRevealedValue(void 0);
          onChange(e.currentTarget.value);
        }
      }
    ),
    value.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives.Button,
      {
        variant: "ghost",
        size: "icon",
        className: "dsh-md-secret-toggle",
        "aria-label": t(revealed ? "keyHide" : "keyReveal"),
        "aria-pressed": revealed,
        disabled,
        onClick: () => {
          setRevealedValue(revealed ? void 0 : value);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "svg",
          {
            width: 14,
            height: 14,
            viewBox: "0 0 16 16",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 1.3,
            strokeLinecap: "round",
            "aria-hidden": "true",
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: revealed ? EYE_OFF_PATH : EYE_PATH })
          }
        )
      }
    )
  ] });
}
function DeviceEditorForm({
  device,
  sshConfigHosts,
  sshKeys,
  t,
  onSaved,
  onCancel
}) {
  const formId = (0, import_react2.useId)();
  const [sshHost, setSshHost] = (0, import_react2.useState)(device?.ssh?.host ?? "");
  const [name, setName] = (0, import_react2.useState)(device?.name ?? "");
  const [authCredential, setAuthCredential] = (0, import_react2.useState)("");
  const [advancedOpen, setAdvancedOpen] = (0, import_react2.useState)(() => hasCustomAdvancedFields(device));
  const [remotePort, setRemotePort] = (0, import_react2.useState)(String(device?.ssh?.remotePort ?? 3080));
  const [sshUser, setSshUser] = (0, import_react2.useState)(device?.ssh?.username ?? "");
  const [sshPort, setSshPort] = (0, import_react2.useState)(String(device?.ssh?.port ?? 22));
  const [sshKeyPath, setSshKeyPath] = (0, import_react2.useState)(device?.ssh?.privateKeyPath ?? "");
  const [sshPassphrase, setSshPassphrase] = (0, import_react2.useState)("");
  const [sshProxyJump, setSshProxyJump] = (0, import_react2.useState)(device?.ssh?.proxyJump ?? "");
  const [remoteDshHome, setRemoteDshHome] = (0, import_react2.useState)(device?.ssh?.remoteDshHome ?? "");
  const [bootstrapCredentials, setBootstrapCredentials] = (0, import_react2.useState)(
    device?.ssh?.bootstrapFromRemoteCredentials !== false
  );
  const [testing, setTesting] = (0, import_react2.useState)(false);
  const [saving, setSaving] = (0, import_react2.useState)(false);
  const [testResult, setTestResult] = (0, import_react2.useState)(null);
  const [saveError, setSaveError] = (0, import_react2.useState)(null);
  const selectedKeyEntry = sshKeys.find((k) => k.path === sshKeyPath);
  const showPassphraseField = selectedKeyEntry?.encrypted === true;
  const busy = testing || saving;
  const buildInput = () => {
    const parsedHost = parseSshHostInput(sshHost);
    const effectiveHost = parsedHost.host;
    const effectiveUser = sshUser.trim() || parsedHost.username;
    const explicitPort = Number(sshPort);
    const effectiveSshPort = sshPort.trim() !== "" && explicitPort > 0 && (explicitPort !== 22 || parsedHost.port === void 0) ? explicitPort : parsedHost.port ?? 22;
    const parsedRemotePort = Number(remotePort);
    return {
      ...device !== void 0 ? { id: device.id } : {},
      name: name.trim() || effectiveHost || "remote-device",
      ...device?.label !== void 0 ? { label: device.label } : {},
      enabled: true,
      keepNativeAlive: device?.keepNativeAlive ?? true,
      transport: {
        kind: "ssh",
        host: effectiveHost,
        ...effectiveUser !== void 0 && effectiveUser !== "" ? { username: effectiveUser } : {},
        ...effectiveSshPort > 0 ? { port: effectiveSshPort } : {},
        ...sshKeyPath.trim() !== "" ? { privateKeyPath: sshKeyPath.trim() } : {},
        ...sshPassphrase.trim() !== "" ? { passphrase: sshPassphrase.trim() } : {},
        ...sshProxyJump.trim() !== "" ? { proxyJump: sshProxyJump.trim() } : {},
        remotePort: parsedRemotePort > 0 ? parsedRemotePort : 3080,
        ...remoteDshHome.trim() !== "" ? { remoteDshHome: remoteDshHome.trim() } : {},
        ...bootstrapCredentials ? { bootstrapFromRemoteCredentials: true } : {},
        engine: device?.ssh?.engine ?? "auto"
      },
      auth: {
        mode: "auto",
        ...authCredential.trim() !== "" ? { credential: authCredential.trim() } : {}
      }
    };
  };
  const handleImportSshHost = (alias) => {
    const entry = sshConfigHosts.find((h) => h.alias === alias);
    if (entry === void 0) return;
    setTestResult(null);
    setSaveError(null);
    setSshHost(entry.alias);
    if (name.trim() === "") setName(entry.alias);
    setSshUser(entry.user ?? "");
    setSshPort(String(entry.port ?? 22));
    setSshKeyPath(entry.identityFile ?? "");
    setSshProxyJump(entry.proxyJump ?? "");
  };
  const handleTest = async () => {
    if (sshHost.trim() === "" || busy) return;
    setTesting(true);
    setTestResult(null);
    setSaveError(null);
    const res = await clientStore.testDevice(buildInput());
    setTesting(false);
    if (res.ok) {
      setTestResult({
        ok: true,
        text: `${t("testPassed")} \xB7 DSH ${res.remoteDshVersion ?? res.protocolVersion} \xB7 ${String(res.latencyMs)}ms`
      });
    } else {
      setTestResult({ ok: false, text: res.error });
    }
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sshHost.trim() === "" || busy) return;
    setSaving(true);
    setSaveError(null);
    const res = await clientStore.upsertDevice(buildInput());
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error ?? t("actionFailed"));
      return;
    }
    onSaved();
  };
  const hasCustomKeyPath = sshKeyPath.trim() !== "" && !sshKeys.some((k) => k.path === sshKeyPath);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", { className: "dsh-md-editor", onSubmit: (e) => {
    void handleSubmit(e);
  }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-editor-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-md-editor-title", children: device !== void 0 ? t("editDevice") : t("addDevice") }),
      sshConfigHosts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "select",
        {
          className: "dsh-md-native-select dsh-md-native-select-compact",
          value: "",
          "aria-label": t("importSshPlaceholder"),
          disabled: busy,
          onChange: (e) => handleImportSshHost(e.currentTarget.value),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", disabled: true, children: t("importSshPlaceholder") }),
            sshConfigHosts.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: h.alias, children: [
              h.alias,
              " (",
              h.user ? `${h.user}@` : "",
              h.hostName,
              h.port && h.port !== 22 ? `:${String(h.port)}` : "",
              ")"
            ] }, h.alias))
          ]
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-form-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-host`, children: t("sshHost") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.Input,
          {
            id: `${formId}-host`,
            required: true,
            value: sshHost,
            placeholder: t("sshHostPlaceholder"),
            disabled: busy,
            onChange: (e) => {
              setSshHost(e.currentTarget.value);
              setTestResult(null);
            }
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-name`, children: t("deviceName") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.Input,
          {
            id: `${formId}-name`,
            value: name,
            placeholder: sshHost.trim() !== "" ? parseSshHostInput(sshHost).host : t("deviceNamePlaceholder"),
            disabled: busy,
            onChange: (e) => setName(e.currentTarget.value)
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-token`, children: t("authCredential") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        SecretCredentialInput,
        {
          id: `${formId}-token`,
          value: authCredential,
          placeholder: t("authCredentialPlaceholder"),
          disabled: busy,
          t,
          onChange: (next) => {
            setAuthCredential(next);
            setTestResult(null);
          }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives.DisclosureRow,
      {
        title: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-md-field-label", children: t("advancedOptions") }),
        open: advancedOpen,
        expandable: true,
        expandOnRowClick: true,
        onToggle: () => setAdvancedOpen((prev) => !prev),
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-form-grid dsh-md-advanced-body", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-rport`, children: t("remoteDshPort") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Input,
              {
                id: `${formId}-rport`,
                type: "number",
                min: 1,
                max: 65535,
                value: remotePort,
                disabled: busy,
                onChange: (e) => setRemotePort(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-user`, children: t("sshUser") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Input,
              {
                id: `${formId}-user`,
                value: sshUser,
                placeholder: t("sshUserPlaceholder"),
                disabled: busy,
                onChange: (e) => setSshUser(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-port`, children: t("sshPort") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Input,
              {
                id: `${formId}-port`,
                type: "number",
                min: 1,
                max: 65535,
                value: sshPort,
                disabled: busy,
                onChange: (e) => setSshPort(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-key`, children: t("sshKeySelect") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                id: `${formId}-key`,
                className: "dsh-md-native-select",
                value: sshKeyPath,
                disabled: busy,
                onChange: (e) => setSshKeyPath(e.currentTarget.value),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: t("sshKeyAuto") }),
                  hasCustomKeyPath && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: sshKeyPath, children: sshKeyPath }),
                  sshKeys.map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: key.path, children: [
                    key.name,
                    key.encrypted ? " (encrypted)" : "",
                    key.permissionsTooOpen ? " (!)" : ""
                  ] }, key.path))
                ]
              }
            )
          ] }),
          showPassphraseField && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-passphrase`, children: t("sshKeyPassphrase") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              SecretCredentialInput,
              {
                id: `${formId}-passphrase`,
                value: sshPassphrase,
                placeholder: t("sshKeyPassphrasePlaceholder"),
                disabled: busy,
                t,
                onChange: setSshPassphrase
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-jump`, children: t("sshProxyJump") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Input,
              {
                id: `${formId}-jump`,
                value: sshProxyJump,
                placeholder: t("sshProxyJumpPlaceholder"),
                disabled: busy,
                onChange: (e) => setSshProxyJump(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-home`, children: t("remoteDshHome") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Input,
              {
                id: `${formId}-home`,
                value: remoteDshHome,
                placeholder: t("remoteDshHomePlaceholder"),
                disabled: busy,
                onChange: (e) => setRemoteDshHome(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-md-field dsh-md-field-span", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.Switch,
            {
              checked: bootstrapCredentials,
              disabled: busy,
              label: t("authBootstrap"),
              onChange: setBootstrapCredentials
            }
          ) })
        ] })
      }
    ),
    saveError !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-md-error-text", role: "alert", children: saveError }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-editor-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-editor-footer-left", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.Button,
          {
            variant: "outline",
            size: "sm",
            disabled: busy || sshHost.trim() === "",
            icon: testing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: "ongoing", size: 12 }) : void 0,
            onClick: () => {
              void handleTest();
            },
            children: testing ? t("testingConnection") : t("testConnection")
          }
        ),
        testResult !== null && (testResult.ok ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-md-success-text", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: "done", size: 8 }),
          testResult.text
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-md-error-text", role: "alert", children: testResult.text }))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-editor-footer-right", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", disabled: busy, onClick: onCancel, children: t("cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.Button,
          {
            variant: "primary",
            size: "sm",
            type: "submit",
            disabled: busy || sshHost.trim() === "",
            children: saving ? t("savingDevice") : t("saveDevice")
          }
        )
      ] })
    ] })
  ] });
}
function MultiDeviceHubPanel({
  t,
  onCloseSettings,
  hideHeader = false
}) {
  const state = useMultiDeviceState();
  const { snapshot } = state;
  const modeSegId = (0, import_react2.useId)();
  const [addingNew, setAddingNew] = (0, import_react2.useState)(false);
  const [editingDeviceId, setEditingDeviceId] = (0, import_react2.useState)(null);
  const [sshKeys, setSshKeys] = (0, import_react2.useState)([]);
  const [aggBusy, setAggBusy] = (0, import_react2.useState)(false);
  const [deleteTarget, setDeleteTarget] = (0, import_react2.useState)(null);
  const [deleting, setDeleting] = (0, import_react2.useState)(false);
  const [deleteError, setDeleteError] = (0, import_react2.useState)(null);
  const [toastNotice, setToastNotice] = (0, import_react2.useState)(null);
  const pushToast = (text, tone) => {
    setToastNotice((prev) => ({
      seq: (prev?.seq ?? 0) + 1,
      text,
      ...tone !== void 0 ? { tone } : {}
    }));
  };
  (0, import_react2.useEffect)(() => {
    if (addingNew || editingDeviceId !== null) {
      void clientStore.listSshKeys().then(setSshKeys);
    }
  }, [addingNew, editingDeviceId]);
  const mergedWorkspaces = snapshot.logicalWorkspaces.filter((w) => w.members.length > 1);
  const hasDevices = snapshot.devices.length > 0;
  const handleConfirmDelete = async () => {
    if (deleteTarget === null || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await clientStore.removeDevice(deleteTarget.id);
    setDeleting(false);
    if (!res.ok) {
      setDeleteError(res.error ?? t("actionFailed"));
      return;
    }
    if (editingDeviceId === deleteTarget.id) {
      setEditingDeviceId(null);
    }
    setDeleteTarget(null);
    pushToast(t("savedNotice"), "success");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-section", children: [
    !hideHeader && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: "dsh-md-section-title", children: t("settingsSectionTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-md-section-intro", children: t("settingsSectionIntro") })
    ] }),
    !snapshot.hostStatus.aggregatedGatewayActive && snapshot.hostStatus.aggregatedGatewayError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "dsh-md-notice-warn", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconWarningOutlineRegular, { size: 14 }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        t("gatewayDegradedNotice"),
        " (",
        snapshot.hostStatus.aggregatedGatewayError,
        ")"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-pref-list", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-pref-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-md-pref-title", children: t("modeRowTitle") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-md-pref-desc", children: t("modeRowDesc") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.SegmentedControl,
          {
            id: modeSegId,
            label: t("modeRowTitle"),
            value: state.displayMode,
            options: [
              { value: "aggregated", label: t("modeAggregated") },
              {
                value: "native",
                label: t("modeNative"),
                disabled: !hasDevices,
                ...!hasDevices ? { title: t("modeNativeNoDeviceHint") } : {}
              }
            ],
            onChange: (next) => {
              clientStore.setDisplayMode(next);
              if (next === "native") {
                onCloseSettings?.();
              }
            }
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-pref-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-md-pref-title", children: t("gitAutoTitle") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-md-pref-desc", children: t("gitAutoDesc") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.Switch,
          {
            checked: snapshot.aggregationConfig.autoGitAggregate,
            label: t("gitAutoTitle"),
            disabled: aggBusy,
            onChange: (enabled) => {
              setAggBusy(true);
              void clientStore.updateAggregationConfig({ autoGitAggregate: enabled }).then((res) => {
                if (!res.ok) {
                  pushToast(`${t("actionFailed")}: ${res.error ?? ""}`, "error");
                }
              }).finally(() => {
                setAggBusy(false);
              });
            }
          }
        )
      ] }),
      snapshot.aggregationConfig.autoGitAggregate && mergedWorkspaces.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-merged-repos", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-md-merged-repos-label", children: t("targetDeviceHeading") }),
        mergedWorkspaces.map((lws) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-merged-repo-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-md-merged-repo-name", title: lws.gitRemote ?? lws.title, children: lws.title }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "select",
            {
              className: "dsh-md-native-select dsh-md-native-select-compact",
              value: lws.targetDeviceId,
              "aria-label": `${lws.title} - ${t("targetDeviceHeading")}`,
              onChange: (e) => {
                void clientStore.setPreferredDevice(
                  lws.logicalWorkspaceId,
                  e.currentTarget.value
                );
              },
              children: lws.members.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: m.deviceId, children: [
                m.deviceId === LOCAL_DEVICE_ID ? "Local" : m.deviceName,
                " (",
                m.path,
                ")"
              ] }, `${m.deviceId}:${m.path}`))
            }
          )
        ] }, lws.logicalWorkspaceId))
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-devices-block", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-devices-header", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "dsh-md-devices-heading", children: t("devicesHeading") }),
        !addingNew && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.Button,
          {
            variant: "outline",
            size: "sm",
            icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPlusOutlineRegular, { size: 13 }),
            onClick: () => {
              setEditingDeviceId(null);
              setAddingNew(true);
            },
            children: t("addDevice")
          }
        )
      ] }),
      addingNew && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-md-card", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        DeviceEditorForm,
        {
          sshConfigHosts: snapshot.sshConfigHosts,
          sshKeys,
          t,
          onSaved: () => {
            setAddingNew(false);
            pushToast(t("savedNotice"), "success");
          },
          onCancel: () => setAddingNew(false)
        }
      ) }),
      !hasDevices && !addingNew ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-card dsh-md-empty-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-md-row-name", children: t("noDevicesTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-md-pref-desc", children: t("noDevicesDesc") })
      ] }) : hasDevices ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "dsh-md-rows", children: snapshot.devices.map((dev) => {
        const isEditing = editingDeviceId === dev.id;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { className: "dsh-md-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-row-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-row-identity", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: deviceStateToDotState(dev.state), size: 8 }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-md-row-name", children: dev.name }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-md-code-text", children: formatCompactDeviceTarget(dev) }) }),
              dev.latencyMs !== void 0 && dev.state === "connected" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_dsh_client_ui_primitives.Tag, { children: [
                dev.latencyMs,
                "ms"
              ] }),
              dev.runningSessionCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { children: t("runningCount").replace("{count}", String(dev.runningSessionCount)) }),
              dev.pendingApprovalCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { children: t("pendingCount").replace("{count}", String(dev.pendingApprovalCount)) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-row-actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                import_dsh_client_ui_primitives.Button,
                {
                  variant: "outline",
                  size: "sm",
                  icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconRightUpOutlineRegular, { size: 13 }),
                  onClick: () => {
                    clientStore.selectNativeDevice(dev.id);
                    onCloseSettings?.();
                  },
                  children: t("openNative")
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: t("reconnect"), side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                import_dsh_client_ui_primitives.Button,
                {
                  variant: "ghost",
                  size: "icon",
                  "aria-label": t("reconnect"),
                  onClick: () => {
                    void clientStore.reconnectDevice(dev.id).then((res) => {
                      if (res.ok) {
                        pushToast(t("reconnectedNotice"), "success");
                      } else {
                        pushToast(`${t("actionFailed")}: ${res.error ?? ""}`, "error");
                      }
                    });
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconRefreshOutlineRegular, { size: 14 })
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: t("editDevice"), side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                import_dsh_client_ui_primitives.Button,
                {
                  variant: "ghost",
                  size: "icon",
                  "aria-label": t("editDevice"),
                  "aria-expanded": isEditing,
                  onClick: () => {
                    setAddingNew(false);
                    setEditingDeviceId(isEditing ? null : dev.id);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconEditOutlineRegular, { size: 14 })
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: t("remove"), side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                import_dsh_client_ui_primitives.Button,
                {
                  variant: "ghost",
                  size: "icon",
                  "aria-label": t("remove"),
                  onClick: () => {
                    setDeleteError(null);
                    setDeleteTarget(dev);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconTrashOutlineRegular, { size: 14 })
                }
              ) })
            ] })
          ] }),
          !isEditing && dev.lastError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-md-error-text", children: dev.lastError }),
          isEditing && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            DeviceEditorForm,
            {
              device: dev,
              sshConfigHosts: snapshot.sshConfigHosts,
              sshKeys,
              t,
              onSaved: () => {
                setEditingDeviceId(null);
                pushToast(t("savedNotice"), "success");
              },
              onCancel: () => setEditingDeviceId(null)
            }
          )
        ] }, dev.id);
      }) }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives.Modal,
      {
        open: deleteTarget !== null,
        onClose: () => {
          if (!deleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        },
        title: deleteTarget === null ? "" : t("deleteTitle").replace("{name}", deleteTarget.name),
        closeLabel: t("close"),
        description: deleteTarget === null ? void 0 : t("deleteDescription"),
        footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.Button,
            {
              variant: "outline",
              disabled: deleting,
              onClick: () => {
                setDeleteTarget(null);
                setDeleteError(null);
              },
              children: t("cancel")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.Button,
            {
              variant: "primary",
              disabled: deleting,
              onClick: () => {
                void handleConfirmDelete();
              },
              children: deleting ? t("deletingDevice") : t("deleteConfirm")
            }
          )
        ] }),
        children: deleteError !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-md-error-text", role: "alert", children: deleteError }) : null
      }
    ),
    toastNotice !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives.Toast,
      {
        text: toastNotice.text,
        tone: toastNotice.tone,
        onDone: () => setToastNotice(null)
      },
      toastNotice.seq
    )
  ] });
}

// src/client/NativeViewport.tsx
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react3 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
function getDesktopBrowserBridge() {
  const desktop = globalThis.dshDesktop;
  return desktop?.protocolVersion === 1 ? desktop.browser : void 0;
}
function KeepAliveDeviceFrame({
  device,
  active,
  reloadCount,
  t
}) {
  const targetUrl = device.nativeProxyUrl ?? device.effectiveBaseUrl;
  const containerRef = (0, import_react3.useRef)(null);
  const webviewLeaseRef = (0, import_react3.useRef)(void 0);
  const [webviewFailed, setWebviewFailed] = (0, import_react3.useState)(false);
  const [reconnectError, setReconnectError] = (0, import_react3.useState)(null);
  (0, import_react3.useEffect)(() => {
    setWebviewFailed(false);
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
      webview.addEventListener("did-fail-load", () => {
        if (!cancelled) setWebviewFailed(true);
      }, { once: true });
      webview.addEventListener(
        "dom-ready",
        () => {
          try {
            const wv = webview;
            if (wv.getURL?.().startsWith("about:blank#")) {
              void wv.loadURL?.(targetUrl);
            }
          } catch {
            if (!cancelled) setWebviewFailed(true);
          }
        },
        { once: true }
      );
      currentEl = webview;
      container.innerHTML = "";
      container.appendChild(webview);
    }).catch(() => {
      if (!cancelled) setWebviewFailed(true);
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
  const useDesktopWebview = getDesktopBrowserBridge() !== void 0 && !webviewFailed;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "div",
    {
      className: "dsh-md-native-frame-wrap",
      style: {
        display: active ? "flex" : "none",
        visibility: active ? "visible" : "hidden"
      },
      "data-device-id": device.id,
      "data-active": active ? "true" : "false",
      children: targetUrl === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-native-placeholder", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: deviceStateToDotState(device.state), size: 12 }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-row-name", children: device.name }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-pref-desc", children: reconnectError ?? device.lastError ?? device.targetSummary }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Button,
          {
            variant: "primary",
            size: "sm",
            icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRefreshOutlineRegular, { size: 13 }),
            onClick: () => {
              void clientStore.reconnectDevice(device.id).then((res) => {
                setReconnectError(res.ok ? null : res.error ?? t("actionFailed"));
              });
            },
            children: t("reconnect")
          }
        )
      ] }) : useDesktopWebview ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { ref: containerRef, className: "dsh-md-native-iframe" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
  const isNative = state.displayMode === "native";
  const exitButtonRef = (0, import_react3.useRef)(null);
  const activeDevice = devices.find((d) => d.id === state.activeNativeDeviceId) ?? devices[0];
  (0, import_react3.useEffect)(() => {
    if (!isNative) return;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      clientStore.setDisplayMode("aggregated");
    };
    window.addEventListener("keydown", onKeyDown, true);
    const focusTimer = window.setTimeout(() => exitButtonRef.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(focusTimer);
    };
  }, [isNative]);
  const mountedDeviceIds = new Set(state.keepAliveDeviceIds);
  if (activeDevice !== void 0) mountedDeviceIds.add(activeDevice.id);
  const mountedDevices = devices.filter((d) => mountedDeviceIds.has(d.id));
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
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
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-native-toolbar", style: embedded ? { paddingLeft: 12 } : void 0, children: [
          !embedded && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_dsh_client_ui_primitives2.Button,
            {
              ref: exitButtonRef,
              variant: "outline",
              size: "sm",
              className: "dsh-md-native-exit",
              title: t("nativeExitHint"),
              icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconChevronLeftOutlineRegular, { size: 14 }),
              onClick: () => clientStore.setDisplayMode("aggregated"),
              children: t("switchToAggregated")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-native-tabs", children: devices.map((dev) => {
            const isSelected = dev.id === activeDevice?.id;
            const isKeptAlive = state.keepAliveDeviceIds.includes(dev.id);
            return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-native-tab-item", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                import_dsh_client_ui_primitives2.Pill,
                {
                  active: isSelected,
                  onClick: () => clientStore.selectNativeDevice(dev.id),
                  children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dsh-md-pill-inner", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: deviceStateToDotState(dev.state), size: 8 }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: dev.name }),
                    dev.runningSessionCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-muted", children: t("runningCount").replace("{count}", String(dev.runningSessionCount)) }),
                    dev.latencyMs !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dsh-md-muted", children: [
                      dev.latencyMs,
                      "ms"
                    ] })
                  ] })
                }
              ),
              isKeptAlive && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: t("releaseKeepAlive"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                import_dsh_client_ui_primitives2.Button,
                {
                  variant: "ghost",
                  size: "icon",
                  "aria-label": t("releaseKeepAlive"),
                  onClick: () => clientStore.releaseKeepAliveDevice(dev.id),
                  children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconCloseOutlineRegular, { size: 12 })
                }
              ) })
            ] }, dev.id);
          }) }),
          activeDevice !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-native-tab-item", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: t("reloadPage"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              import_dsh_client_ui_primitives2.Button,
              {
                variant: "ghost",
                size: "icon",
                "aria-label": t("reloadPage"),
                onClick: () => clientStore.reloadNativeDevice(activeDevice.id),
                children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRefreshOutlineRegular, { size: 14 })
              }
            ) }),
            (activeDevice.nativeProxyUrl ?? activeDevice.effectiveBaseUrl) !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: t("openExternal"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              import_dsh_client_ui_primitives2.Button,
              {
                variant: "ghost",
                size: "icon",
                "aria-label": t("openExternal"),
                onClick: () => {
                  const url = activeDevice.nativeProxyUrl ?? activeDevice.effectiveBaseUrl;
                  if (url !== void 0) window.open(url, "_blank", "noopener,noreferrer");
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRightUpOutlineRegular, { size: 14 })
              }
            ) })
          ] }),
          onOpenSettings !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: t("settingsSectionTitle"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_dsh_client_ui_primitives2.Button,
            {
              variant: "ghost",
              size: "icon",
              "aria-label": t("settingsSectionTitle"),
              onClick: onOpenSettings,
              children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconSettingsOutlineRegular, { size: 14 })
            }
          ) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-native-stage", children: devices.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-native-placeholder", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-row-name", children: t("noDevicesTitle") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-pref-desc", style: { maxWidth: 420 }, children: t("noDevicesDesc") }),
          onOpenSettings !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_dsh_client_ui_primitives2.Button,
            {
              variant: "primary",
              size: "sm",
              icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlusOutlineRegular, { size: 13 }),
              onClick: onOpenSettings,
              children: t("addDevice")
            }
          )
        ] }) : mountedDevices.map((dev) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          KeepAliveDeviceFrame,
          {
            device: dev,
            active: dev.id === activeDevice?.id,
            reloadCount: state.reloadCounters[dev.id] ?? 0,
            t
          },
          dev.id
        )) })
      ]
    }
  );
}

// src/client/ModeSwitcherOverlay.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function ModeSwitcherOverlay({
  t,
  onOpenSettings
}) {
  const state = useMultiDeviceState();
  const isNative = state.displayMode === "native";
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    (isNative || state.keepAliveDeviceIds.length > 0) && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "div",
      {
        className: "dsh-md-native-fullscreen",
        style: {
          display: isNative ? "flex" : "none",
          pointerEvents: isNative ? "auto" : "none"
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(NativeViewport, { t, onOpenSettings })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives3.Modal,
      {
        open: state.settingsModalOpen,
        onClose: () => clientStore.setSettingsModalOpen(false),
        title: t("settingsSectionTitle"),
        closeLabel: t("close"),
        className: "dsh-md-fallback-modal",
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          MultiDeviceHubPanel,
          {
            t,
            hideHeader: true,
            onCloseSettings: () => clientStore.setSettingsModalOpen(false)
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 2, fontSize: 11, paddingTop: 2 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.StateDot, { state: deviceStateToDotState(origin?.deviceState ?? "connected"), size: 8 }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
        t("hoverDeviceLabel"),
        ": ",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: devName })
      ] })
    ] }),
    origin?.gitRemote !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { color: "var(--dsw-alias-label-tertiary)" }, children: [
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    import_dsh_client_ui_primitives3.MenuItemButton,
    {
      icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconRightUpOutlineRegular, { size: 14 }),
      onSelect: () => {
        setMenuOpen(false);
        clientStore.selectNativeDevice(decoded.deviceId);
      },
      children: t("menuOpenInNative")
    }
  );
}

// src/client/SidebarEntry.tsx
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react5 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
var POPOVER_WIDTH = 272;
var POPOVER_GAP = 8;
var POPOVER_MARGIN = 8;
function DevicesIcon({ size = 18 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.2,
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("rect", { x: "1.6", y: "2.4", width: "8", height: "5.6", rx: "1.1" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("rect", { x: "6.4", y: "8", width: "8", height: "5.6", rx: "1.1" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M4 8v1.6M12 8V4", strokeLinecap: "round" })
      ]
    }
  );
}
function deviceStatusLabel(device, t) {
  if (device.authState === "required") return { text: t("authRequired"), warn: true };
  if (device.state === "connected") return { text: t("statusConnected"), warn: false };
  if (device.state === "connecting") return { text: t("statusConnecting"), warn: false };
  if (device.state === "reconnecting") return { text: t("statusReconnecting"), warn: false };
  if (device.state === "error") return { text: t("statusError"), warn: true };
  return { text: t("statusDisabled"), warn: false };
}
function computePopoverPosition(anchor) {
  const rect = anchor.getBoundingClientRect();
  const maxLeft = Math.max(POPOVER_MARGIN, window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN);
  const left = Math.min(Math.max(POPOVER_MARGIN, rect.left), maxLeft);
  const openUp = rect.top > 360;
  const top = openUp ? Math.max(POPOVER_MARGIN, rect.top - POPOVER_GAP) : Math.min(window.innerHeight - 120, rect.bottom + POPOVER_GAP);
  return { left, top };
}
function MultiDeviceSidebarEntry({
  wide,
  t,
  onOpenSettings
}) {
  const state = useMultiDeviceState();
  const devices = state.snapshot.devices;
  const [open, setOpen] = (0, import_react5.useState)(false);
  const [position, setPosition] = (0, import_react5.useState)({ left: POPOVER_MARGIN, top: POPOVER_MARGIN });
  const [openUp, setOpenUp] = (0, import_react5.useState)(true);
  const entryRef = (0, import_react5.useRef)(null);
  const popoverRef = (0, import_react5.useRef)(null);
  const close = () => setOpen(false);
  const toggle = () => {
    if (open) {
      close();
      return;
    }
    const anchor = entryRef.current;
    if (anchor === null) return;
    const next = computePopoverPosition(anchor);
    setPosition(next);
    setOpenUp(anchor.getBoundingClientRect().top > 360);
    setOpen(true);
  };
  (0, import_react5.useEffect)(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      const target = event.target;
      if (target === null) return;
      if (popoverRef.current?.contains(target) === true) return;
      if (entryRef.current?.contains(target) === true) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    const onViewportChange = () => {
      const anchor = entryRef.current;
      if (anchor === null) return;
      setPosition(computePopoverPosition(anchor));
      setOpenUp(anchor.getBoundingClientRect().top > 360);
    };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);
  const openDevice = (deviceId) => {
    clientStore.selectNativeDevice(deviceId);
    close();
  };
  const openSettings = () => {
    close();
    onOpenSettings();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "div",
    {
      ref: entryRef,
      className: `dsh-md-sidebar-entry${wide ? " isWide" : " isRail"}${open ? " isOpen" : ""}`,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "button",
          {
            type: "button",
            className: "dsh-md-sidebar-button",
            "aria-haspopup": "dialog",
            "aria-expanded": open,
            title: t("sidebarEntryTitle"),
            onClick: toggle,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(DevicesIcon, { size: wide ? 16 : 18 }),
              wide && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-md-sidebar-label", children: t("sidebarEntryLabel") }),
              devices.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-md-sidebar-count", children: devices.length })
            ]
          }
        ),
        open && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "div",
          {
            ref: popoverRef,
            className: "dsh-md-device-popover",
            role: "dialog",
            "aria-label": t("sidebarEntryTitle"),
            style: {
              left: position.left,
              top: position.top,
              ...openUp ? { transform: "translateY(-100%)" } : {}
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-md-device-popover-title", children: t("popoverDevices") }),
              devices.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-md-device-popover-empty", children: t("popoverEmpty") }) : devices.map((device) => {
                const status = deviceStatusLabel(device, t);
                return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                  "button",
                  {
                    type: "button",
                    className: "dsh-md-device-popover-row",
                    title: `${device.name} (${device.targetSummary})`,
                    onClick: () => openDevice(device.id),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.StateDot, { state: deviceStateToDotState(device.state), size: 8 }),
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-md-device-popover-name", children: device.name }),
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: `dsh-md-device-popover-state${status.warn ? " isWarn" : ""}`, children: status.text })
                    ]
                  },
                  device.id
                );
              }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-md-device-popover-sep" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("button", { type: "button", className: "dsh-md-device-popover-action", onClick: openSettings, children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconSettingsOutlineRegular, { size: 14 }),
                t("popoverSettings")
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                "button",
                {
                  type: "button",
                  className: "dsh-md-device-popover-action",
                  onClick: () => {
                    void clientStore.refreshSnapshot();
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconRefreshOutlineRegular, { size: 14 }),
                    t("popoverRefresh")
                  ]
                }
              )
            ]
          }
        )
      ]
    }
  );
}

// src/client/styles.ts
var STYLE_TAG_ID = "dsh-multi-device/styles.css";
var CSS_TEXT = `
/* Settings Section Layout (aligned with @deepseek-ai/dsh-client-ui-settings-models & general) */
.dsh-md-section {
  max-width: 720px;
  color: var(--dsw-alias-label-primary);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dsh-md-section-title {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}

.dsh-md-section-intro {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}

.dsh-md-pref-list {
  display: flex;
  flex-direction: column;
}

.dsh-md-pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}

.dsh-md-pref-title {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 20px;
}

.dsh-md-pref-desc {
  margin-top: 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-merged-repos {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}

.dsh-md-merged-repos-label {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-merged-repo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  line-height: 20px;
}

.dsh-md-merged-repo-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
}

.dsh-md-devices-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 8px;
}

.dsh-md-devices-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dsh-md-devices-heading {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}

.dsh-md-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dsh-md-card {
  border: 0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2));
  background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1));
  border-radius: var(--dsw-radius-xl, 12px);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsh-md-empty-card {
  align-items: center;
  text-align: center;
  padding: 28px 20px;
  gap: 6px;
}

.dsh-md-row-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.dsh-md-row-identity {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.dsh-md-row-name {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}

.dsh-md-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.dsh-md-code-text {
  font-family: var(--ds-font-family-code);
}

.dsh-md-notice-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-label-secondary));
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-error-text {
  margin: 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}

.dsh-md-success-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--dsw-alias-state-success-primary);
  font-size: 12px;
  line-height: 18px;
}

/* Form Layout inside Settings Card */
.dsh-md-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dsh-md-editor-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dsh-md-editor-title {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}

.dsh-md-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px 12px;
}

.dsh-md-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.dsh-md-field-span {
  grid-column: 1 / -1;
}

.dsh-md-field-label {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-native-select {
  box-sizing: border-box;
  height: 32px;
  width: 100%;
  padding: 0 10px;
  border-radius: var(--dsw-radius-md, 8px);
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}

.dsh-md-native-select-compact {
  width: auto;
  max-width: 240px;
  height: 28px;
  font-size: 12px;
}

.dsh-md-native-select:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.dsh-md-secret-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.dsh-md-secret-input {
  width: 100%;
}

.dsh-md-secret-toggle {
  position: absolute;
  right: 4px;
}

.dsh-md-advanced-body {
  padding-top: 8px;
}

.dsh-md-editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 4px;
}

.dsh-md-editor-footer-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.dsh-md-editor-footer-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

/* Sidebar footer entry, device popover & Native Viewport chrome */
.dsh-md-sidebar-entry {
  box-sizing: border-box;
  flex: none;
  display: block;
  width: 36px;
  min-width: 36px;
}

.dsh-md-sidebar-entry.isWide {
  width: auto;
  max-width: 100%;
}

.dsh-md-sidebar-button {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  gap: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.dsh-md-sidebar-button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-sidebar-button:focus-visible {
  outline: var(--dsh-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -2px;
}

.dsh-md-sidebar-entry.isWide .dsh-md-sidebar-button {
  width: auto;
  max-width: 100%;
  justify-content: flex-start;
  gap: 6px;
  padding: 0 8px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 20px;
}

.dsh-md-sidebar-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-md-sidebar-count {
  flex: none;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-bg-layer-3));
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

.dsh-md-sidebar-entry.isWide .dsh-md-sidebar-count {
  margin-inline-start: auto;
}

.dsh-md-device-popover {
  position: fixed;
  z-index: 950;
  box-sizing: border-box;
  width: min(272px, calc(100vw - 24px));
  max-height: min(440px, calc(100vh - 96px));
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-elevation-prominent);
  color: var(--dsw-alias-label-primary);
  -webkit-app-region: no-drag;
}

.dsh-md-device-popover-title {
  padding: 4px 8px 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}

.dsh-md-device-popover-empty {
  padding: 10px 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-device-popover-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.dsh-md-device-popover-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-device-popover-name {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 20px;
}

.dsh-md-device-popover-state {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}

.dsh-md-device-popover-state.isWarn {
  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary));
}

.dsh-md-device-popover-sep {
  height: 0.5px;
  margin: 6px 4px;
  background: var(--dsw-alias-border-l2);
}

.dsh-md-device-popover-action {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 4px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  text-align: start;
  cursor: pointer;
}

.dsh-md-device-popover-action:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dsh-md-native-fullscreen {
  position: fixed;
  inset: var(--dsh-frame-chrome-top, 0px) 0 0;
  z-index: 80;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
}

.dsh-md-native-toolbar {
  box-sizing: border-box;
  height: 42px;
  padding: 0 12px;
  padding-left: calc(var(--dsh-frame-leading-clearance, 0px) + 12px);
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-1));
  flex-shrink: 0;
  overflow-x: auto;
  position: relative;
  z-index: 2;
  -webkit-app-region: no-drag;
}

.dsh-md-native-toolbar button,
.dsh-md-native-toolbar [role='button'] {
  -webkit-app-region: no-drag;
}

.dsh-md-native-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}

.dsh-md-native-tab-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.dsh-md-pill-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dsh-md-muted {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
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
  background: var(--dsw-alias-bg-base);
}

.dsh-md-native-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px;
  text-align: center;
}

.dsh-md-row-leading-tag {
  font-size: 9px;
  font-weight: 600;
  padding: 0 3px;
  border-radius: var(--dsw-radius-xs, 4px);
  border: 0.5px solid var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-secondary);
  line-height: 13px;
  max-width: 16px;
  overflow: hidden;
  text-overflow: clip;
}

.dsh-md-fallback-modal {
  width: min(740px, 100%);
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
var import_jsx_runtime5 = require("react/jsx-runtime");
var SETTINGS_SECTION_ID = "multi-device";
var PANEL_ID = SETTINGS_SECTION_ID;
var inject = ["slots", "locale"];
var zhPreferred = typeof navigator !== "undefined" ? navigator.language.toLowerCase().startsWith("zh") : true;
var fallbackDict = zhPreferred ? zh : en;
function translateFallback(key) {
  return fallbackDict[key] ?? en[key] ?? key;
}
function openSettingsSection(ctx, sectionId = SETTINGS_SECTION_ID) {
  try {
    const entries = ctx.slots.entries?.("sidebar.settings");
    const openSection = entries?.[0]?.options?.store?.create?.()?.actions?.openSection;
    if (typeof openSection === "function") {
      openSection(sectionId);
      return true;
    }
  } catch {
  }
  clientStore.setSettingsModalOpen(true);
  return false;
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
  const handleOpenSettings = () => {
    openSettingsSection(ctx, SETTINGS_SECTION_ID);
  };
  ctx.inject(["shortcuts"], (shortcutCtx) => {
    shortcutCtx.effect(() => {
      if (shortcutCtx.shortcuts === void 0) return () => {
      };
      return shortcutCtx.shortcuts.register({
        id: "multiDevice.toggleMode",
        label: () => getTranslate()("toggleMode"),
        aliases: ["toggle native mode", "multi device mode"],
        defaults: {
          "desktop:macos": { code: "KeyM", modifiers: ["primary", "shift"] },
          "desktop:windows": { code: "KeyM", modifiers: ["primary", "shift"] },
          "desktop:linux": { code: "KeyM", modifiers: ["primary", "shift"] },
          "web:macos": { code: "KeyM", modifiers: ["primary", "shift"] },
          "web:windows": { code: "KeyM", modifiers: ["primary", "shift"] }
        },
        // Only outside inputs: toggling the whole UI while typing in a
        // textarea loses the composer draft focus.
        regions: ["page"],
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
    "sidebar.footer.action",
    () => ctx.slots.register(
      {
        name: "sidebar.footer.action",
        id: "multi-device-entry",
        order: 30,
        locale: LOCALE_NS
      },
      (props) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        MultiDeviceSidebarEntry,
        {
          wide: props.wide === true,
          t: props.t ?? getTranslate(),
          onOpenSettings: handleOpenSettings
        }
      )
    )
  );
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      {
        name: "settings.section",
        id: SETTINGS_SECTION_ID,
        order: 12,
        label: () => getTranslate()("settingsSectionTitle"),
        locale: LOCALE_NS
      },
      (props) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        MultiDeviceHubPanel,
        {
          t: props.t ?? getTranslate(),
          onCloseSettings: props.close
        }
      )
    )
  );
  ctx.slots.inject(
    "plugins.bundle.config",
    () => ctx.slots.register(
      {
        name: "plugins.bundle.config",
        key: "dsh-multi-device",
        locale: LOCALE_NS
      },
      (props) => {
        const t = props.t ?? getTranslate();
        if (props.view === "summary") return t("pluginSummary");
        return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(MultiDeviceHubPanel, { t, hideHeader: true });
      }
    )
  );
  ctx.slots.inject(
    "shell.overlay",
    () => ctx.slots.register(
      {
        name: "shell.overlay",
        id: "multi-device-switcher",
        order: 40,
        locale: LOCALE_NS
      },
      (props) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        ModeSwitcherOverlay,
        {
          t: props.t ?? getTranslate(),
          onOpenSettings: handleOpenSettings
        }
      )
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
      (props) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SessionRowLeadingBadge, { sessionId: props.sessionId })
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
      (props) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SessionRowHoverDeviceSection, { sessionId: props.sessionId, t: props.t ?? getTranslate() })
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
      (props) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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

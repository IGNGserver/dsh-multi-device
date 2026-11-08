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
  installLocalSessionTracking: () => installLocalSessionTracking,
  openSettingsSection: () => openSettingsSection
});
module.exports = __toCommonJS(index_exports);
var import_react9 = require("react");

// src/client/clientServices.ts
var import_react = require("react");
var services = {};
var sessionListeners = /* @__PURE__ */ new Set();
var unsubscribeSessions;
function attachSessionList() {
  unsubscribeSessions?.();
  unsubscribeSessions = sessionListeners.size > 0 ? services.sessions?.list.subscribe?.(notifySessionListeners) : void 0;
}
function notifySessionListeners() {
  for (const listener of [...sessionListeners]) {
    try {
      listener();
    } catch {
    }
  }
}
function subscribeSessionSummary(listener) {
  sessionListeners.add(listener);
  if (sessionListeners.size === 1) attachSessionList();
  return () => {
    sessionListeners.delete(listener);
    if (sessionListeners.size === 0) attachSessionList();
  };
}
function bindClientServices(next) {
  services = next;
  attachSessionList();
  notifySessionListeners();
  return () => {
    if (services !== next) return;
    services = {};
    attachSessionList();
    notifySessionListeners();
  };
}
function getClientServices() {
  return services;
}
function useSessionListSnapshot() {
  return (0, import_react.useSyncExternalStore)(
    subscribeSessionSummary,
    () => services.sessions?.list.getSnapshot(),
    () => void 0
  );
}

// src/client/locales.ts
var LOCALE_NS = "multiDevice";
var zh = {
  settingsSectionTitle: "\u591A\u8BBE\u5907",
  settingsSectionIntro: "\u901A\u8FC7 SSH \u8FDE\u63A5\u8FDC\u7AEF\u5F00\u53D1\u673A\u3002\u9876\u90E8\u6807\u7B7E\u9875\u5E38\u9A7B\uFF1A\u672C\u673A\u663E\u793A\u672C\u5730 DSH\uFF0C\u6BCF\u53F0\u8FDC\u7AEF\u8BBE\u5907\u5728\u5404\u81EA\u7684\u6807\u7B7E\u9875\u91CC\u8FD0\u884C\u5B8C\u6574\u754C\u9762\u3002",
  pluginSummary: "\u901A\u8FC7 SSH \u8FDE\u63A5\u591A\u53F0\u8FDC\u7AEF DSH \u5F00\u53D1\u673A\uFF0C\u7528\u9876\u90E8\u6807\u7B7E\u9875\u5207\u6362\u672C\u673A\u4E0E\u5404\u8BBE\u5907\u7684\u5B8C\u6574\u754C\u9762\u3002",
  close: "\u5173\u95ED",
  nativeLocalTab: "\u672C\u673A",
  nativeTabsLabel: "\u539F\u751F\u6A21\u5F0F\u8BBE\u5907\u6807\u7B7E\u9875",
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
  advancedOptions: "\u9AD8\u7EA7\u8FDE\u63A5\u9009\u9879",
  remoteDshPort: "\u8FDC\u7AEF DSH \u7AEF\u53E3",
  sshUser: "SSH \u7528\u6237\u540D",
  sshUserPlaceholder: "\u7559\u7A7A\u590D\u7528 ~/.ssh/config",
  sshPort: "SSH \u7AEF\u53E3",
  sshPortPlaceholder: "\u9ED8\u8BA4 22 / \u590D\u7528 ~/.ssh/config",
  deviceEnabledLabel: "\u542F\u7528\u6B64\u8FDC\u7AEF\u8BBE\u5907\u8FDE\u63A5",
  sshKeySelect: "SSH \u79C1\u94A5",
  sshKeyAuto: "\u81EA\u52A8\uFF08SSH Agent / \u9ED8\u8BA4\u5BC6\u94A5\uFF09",
  sshKeyAutoDesc: "\u4F18\u5148\u590D\u7528\u7CFB\u7EDF SSH Agent \u6216\u9ED8\u8BA4\u5BC6\u94A5\u5BF9",
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
  saveAnyway: "\u4ECD\u7136\u4FDD\u5B58",
  cancel: "\u53D6\u6D88",
  reconnect: "\u91CD\u65B0\u8FDE\u63A5",
  reconnectedNotice: "\u5DF2\u89E6\u53D1\u91CD\u65B0\u8FDE\u63A5",
  remove: "\u79FB\u9664",
  deleteTitle: "\u79FB\u9664\u8BBE\u5907\u201C{name}\u201D\uFF1F",
  deleteDescription: "\u79FB\u9664\u540E\u5C06\u65AD\u5F00\u8BE5\u8BBE\u5907\u7684 SSH \u96A7\u9053\u5E76\u5173\u95ED\u5176\u6807\u7B7E\u9875\u3002\u8FDC\u7AEF\u8BBE\u5907\u4E0A\u7684\u6570\u636E\u4E0D\u53D7\u5F71\u54CD\u3002",
  deleteConfirm: "\u79FB\u9664\u8BBE\u5907",
  deletingDevice: "\u79FB\u9664\u4E2D\u2026",
  openExternal: "\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00",
  reloadPage: "\u5237\u65B0\u8FDC\u7AEF\u9875\u9762",
  releaseKeepAlive: "\u5173\u95ED\u540E\u53F0\u4FDD\u6D3B\u9875\u9762",
  attentionPending: "\u5F85\u786E\u8BA4",
  attentionRunning: "\u8FD0\u884C\u4E2D",
  attentionUnread: "\u672A\u8BFB",
  attentionStale: "\u540C\u6B65\u4E2D / \u6570\u636E\u8FC7\u671F",
  attentionLastKnown: "\u4E0A\u6B21\u5DF2\u77E5",
  attentionMembers: "\u4F1A\u8BDD\u6210\u5458",
  attentionUnavailable: "\u65E7\u7248 Host \u672A\u63D0\u4F9B\u6210\u5458 ID",
  attentionCopy: "\u590D\u5236 ID",
  attentionCopied: "\u5DF2\u590D\u5236",
  attentionCopyFailed: "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9 ID",
  attentionRequests: "\u5F85\u5904\u7406\u8BF7\u6C42",
  attentionOpenFailed: "\u6253\u5F00\u4F1A\u8BDD\u5931\u8D25",
  attentionOpenHint: "\u70B9\u51FB\u6253\u5F00\u4F1A\u8BDD",
  clearUnread: "\u6E05\u9664\u672A\u8BFB",
  clearedUnreadNotice: "\u5DF2\u6E05\u9664 {count} \u6761\u672A\u8BFB",
  noDevicesTitle: "\u5C1A\u672A\u6DFB\u52A0\u8FDC\u7AEF\u8BBE\u5907",
  noDevicesDesc: "\u70B9\u51FB\u4E0A\u65B9\u201C\u6DFB\u52A0\u8BBE\u5907\u201D\uFF0C\u901A\u8FC7 SSH \u8FDE\u63A5\u4F60\u7684\u5176\u4ED6\u5F00\u53D1\u673A\u6216\u670D\u52A1\u5668\u3002",
  bridgeFailedTitle: "\u8BBE\u5907 {name} \u7684\u9875\u9762\u6865\u63A5\u5931\u8D25",
  bridgeFailedError: "\u539F\u56E0\uFF1A{error}",
  bridgeFailedReload: "\u91CD\u65B0\u52A0\u8F7D",
  crossHostReadStateTitle: "\u8DE8 DSH Host \u540C\u6B65\u672A\u8BFB\u72B6\u6001",
  crossHostReadStateDesc: "\u4EC5\u5728\u591A\u53F0\u7535\u8111\u5404\u81EA\u8FD0\u884C DSH Host \u65F6\u9700\u8981\u3002\u5F00\u542F\u540E\u901A\u8FC7\u73B0\u6709 SSH \u5728\u80FD\u8BC6\u522B POSIX DSH \u5BB6\u76EE\u5F55\u7684\u8FDC\u7AEF\u8BBE\u5907\u4E0A\u4FDD\u5B58\u4E00\u4E2A\u53EA\u542B\u4F1A\u8BDD ID \u4E0E\u65F6\u95F4\u6233\u7684\u72B6\u6001\u6587\u4EF6\uFF1B\u4E0D\u5B89\u88C5\u8FDC\u7AEF\u63D2\u4EF6\uFF0C\u4E5F\u4E0D\u4E0A\u4F20\u6D88\u606F\u5185\u5BB9\u3002\u9ED8\u8BA4\u5173\u95ED\u3002",
  savedNotice: "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58",
  actionFailed: "\u64CD\u4F5C\u5931\u8D25",
  authRequired: "\u9700\u8981\u767B\u5F55",
  authPanelTitle: "\u8FDC\u7AEF DSH \u9700\u8981\u767B\u5F55",
  authPanelDesc: "SSH \u96A7\u9053\u5DF2\u8FDE\u901A\uFF0C\u4F46\u8FDC\u7AEF DSH \u62D2\u7EDD\u4E86\u5F53\u524D\u51ED\u636E\u3002\u53EF\u7C98\u8D34 dsh web \u542F\u52A8\u65F6\u6253\u5370\u7684\u94FE\u63A5/Token\uFF0C\u6216\u8BA9\u63D2\u4EF6\u901A\u8FC7 SSH \u91CD\u65B0\u7B7E\u53D1 Cookie\u3002",
  authCredentialLabel: "\u542F\u52A8\u94FE\u63A5\u6216 Token",
  authTokenPlaceholder: "\u7C98\u8D34 http://127.0.0.1:3080/?token=\u2026 \u6216\u88F8 Token",
  authSubmit: "\u767B\u5F55\u5E76\u91CD\u8BD5",
  authUseSsh: "\u901A\u8FC7 SSH \u81EA\u52A8\u4FEE\u590D",
  authChecking: "\u6B63\u5728\u9A8C\u8BC1\u2026",
  authFailed: "\u767B\u5F55\u5931\u8D25",
  authBackLocal: "\u8FD4\u56DE\u672C\u673A",
  authOpenSettings: "\u6253\u5F00\u591A\u8BBE\u5907\u8BBE\u7F6E",
  authHint: "\u82E5\u8FDC\u7AEF DSH \u5173\u95ED\u4E86 Token \u767B\u5F55\uFF0C\u8BF7\u5728\u8FDC\u7AEF\u91CD\u65B0\u542F\u52A8 dsh web \u540E\u7C98\u8D34\u65B0\u7684\u542F\u52A8\u94FE\u63A5\u3002",
  diagnosticsTitle: "\u8BCA\u65AD\u4FE1\u606F",
  diagnosticsDesc: "\u5BFC\u51FA\u4E00\u4EFD\u53EF\u590D\u5236\u7684\u73B0\u573A\u5FEB\u7167\uFF1A\u6BCF\u53F0\u8BBE\u5907\u7684\u8FDE\u63A5\u72B6\u6001\u3001\u534F\u8BAE\u7248\u672C\u3001\u4F1A\u8BDD\u8BA1\u6570\u4E0E\u9519\u8BEF\uFF0C\u4EE5\u53CA\u6D4F\u89C8\u5668\u89C6\u53E3\u548C\u9876\u90E8\u6807\u7B7E\u680F\u5C3A\u5BF8\u3002\u5206\u4EAB\u524D\u8BF7\u4EBA\u5DE5\u5BA1\u67E5\u5E76\u8131\u654F\u3002",
  diagnosticsRun: "\u751F\u6210\u8BCA\u65AD",
  diagnosticsCopy: "\u590D\u5236",
  diagnosticsCopied: "\u8BCA\u65AD\u4FE1\u606F\u5DF2\u590D\u5236",
  diagnosticsCopyFailed: "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9\u4E0B\u65B9\u6587\u672C",
  openDevice: "\u6253\u5F00\u8BBE\u5907\u754C\u9762",
  diagnosticsSummaryLine: "\u8BBE\u5907 {devices} \u53F0 \xB7 \u5DF2\u8FDE\u63A5 {connected} \u53F0",
  keyReveal: "\u663E\u793A\u51ED\u636E",
  keyHide: "\u9690\u85CF\u51ED\u636E",
  pendingCount: "{count} \u5F85\u786E\u8BA4",
  runningCount: "{count} \u8FD0\u884C\u4E2D",
  unreadCount: "{count} \u672A\u8BFB"
};
var en = {
  settingsSectionTitle: "Multi-Device",
  settingsSectionIntro: "Connect remote machines over SSH. A tab strip stays on top: This Device is your local DSH, and every remote device runs its complete UI in its own tab.",
  pluginSummary: "Connect remote DSH machines over SSH and switch between full native UIs in a persistent tab strip.",
  close: "Close",
  nativeLocalTab: "This Device",
  nativeTabsLabel: "Native Mode device tabs",
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
  advancedOptions: "Advanced connection options",
  remoteDshPort: "Remote DSH port",
  sshUser: "SSH user",
  sshUserPlaceholder: "Blank reuses ~/.ssh/config",
  sshPort: "SSH port",
  sshPortPlaceholder: "Default 22 / reuse ~/.ssh/config",
  deviceEnabledLabel: "Enable this remote device connection",
  sshKeySelect: "SSH private key",
  sshKeyAuto: "Auto (SSH Agent / default keys)",
  sshKeyAutoDesc: "Reuse keys from system SSH Agent or default key pair",
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
  saveAnyway: "Save anyway",
  cancel: "Cancel",
  reconnect: "Reconnect",
  reconnectedNotice: "Reconnection triggered",
  remove: "Remove",
  deleteTitle: 'Remove device "{name}"?',
  deleteDescription: "Removing drops this device\u2019s SSH tunnel and closes its tab. Data on the remote machine is not touched.",
  deleteConfirm: "Remove device",
  deletingDevice: "Removing\u2026",
  openExternal: "Open in browser",
  reloadPage: "Reload remote page",
  releaseKeepAlive: "Close background page",
  attentionPending: "Needs reply",
  attentionRunning: "Running",
  attentionUnread: "Unread",
  attentionStale: "Syncing / stale data",
  attentionLastKnown: "Last known",
  attentionMembers: "Session members",
  attentionUnavailable: "Older Host did not provide member IDs",
  attentionCopy: "Copy ID",
  attentionCopied: "Copied",
  attentionCopyFailed: "Copy failed; select the ID manually",
  attentionRequests: "pending requests",
  attentionOpenFailed: "Could not open session",
  attentionOpenHint: "Click to open the session",
  clearUnread: "Clear unread",
  clearedUnreadNotice: "Cleared {count} unread reminders",
  noDevicesTitle: "No remote devices yet",
  noDevicesDesc: 'Select "Add device" above to connect another machine over SSH.',
  bridgeFailedTitle: "The page bridge for {name} failed",
  bridgeFailedError: "Reason: {error}",
  bridgeFailedReload: "Reload",
  crossHostReadStateTitle: "Sync unread state across DSH Hosts",
  crossHostReadStateDesc: "Only needed when several computers run their own DSH Host. Writes a tiny session-ID/timestamp file into remote DSH homes reachable over the existing SSH transport with a POSIX home; no remote plugin is installed and no message content is uploaded. Off by default.",
  savedNotice: "Settings saved",
  actionFailed: "Action failed",
  authRequired: "Sign-in required",
  authPanelTitle: "Remote DSH requires sign-in",
  authPanelDesc: "The SSH tunnel is up, but the remote DSH rejected the current credential. Paste the launch URL/token printed by dsh web, or let the plugin mint a fresh cookie over SSH.",
  authCredentialLabel: "Launch URL or token",
  authTokenPlaceholder: "Paste http://127.0.0.1:3080/?token=\u2026 or a bare token",
  authSubmit: "Sign in and retry",
  authUseSsh: "Repair via SSH",
  authChecking: "Verifying\u2026",
  authFailed: "Sign-in failed",
  authBackLocal: "Back to This Device",
  authOpenSettings: "Open Multi-Device settings",
  authHint: "If the remote DSH disabled token sign-in, restart dsh web there and paste the new launch URL.",
  diagnosticsTitle: "Diagnostics",
  diagnosticsDesc: "Export a copyable snapshot: every device\u2019s connection state, protocol version, session counts and errors, plus the browser viewport and tab-bar geometry. Review and redact before sharing.",
  diagnosticsRun: "Generate diagnostics",
  diagnosticsCopy: "Copy",
  diagnosticsCopied: "Diagnostics copied",
  diagnosticsCopyFailed: "Copy failed; select the text below instead",
  openDevice: "Open device",
  diagnosticsSummaryLine: "{devices} devices \xB7 {connected} connected",
  keyReveal: "Show credential",
  keyHide: "Hide credential",
  pendingCount: "{count} needs reply",
  runningCount: "{count} running",
  unreadCount: "{count} unread"
};

// src/client/NativeOverlay.tsx
var import_dsh_client_ui_primitives6 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react8 = require("react");

// src/client/MultiDeviceHubPanel.tsx
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react5 = require("react");

// src/client/clipboard.ts
function fallbackCopyText(text) {
  if (typeof document === "undefined") return false;
  const value = String(text);
  let area;
  try {
    area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.left = "-1000px";
    area.style.opacity = "0";
    const parent = document.body ?? document.documentElement;
    if (parent === null) return false;
    parent.appendChild(area);
    const selection = typeof document.getSelection === "function" ? document.getSelection() : null;
    const previousRange = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    if (selection !== null && previousRange !== null) {
      try {
        selection.removeAllRanges();
        selection.addRange(previousRange);
      } catch {
      }
    }
    return copied;
  } catch {
    try {
      area?.remove();
    } catch {
    }
    return false;
  }
}
async function copyText(text) {
  const value = String(text);
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard !== void 0 && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
  }
  return fallbackCopyText(value);
}

// src/client/DshSelect.tsx
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react2 = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function CheckmarkIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      width: 14,
      height: 14,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      className: "dsh-md-select-check",
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: "3 8.5 6.5 12 13 4.5" })
    }
  );
}
function DshSelect({
  id,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  compact = false,
  clearOnSelect = false,
  className = "",
  ariaLabel,
  style
}) {
  const generatedId = (0, import_react2.useId)();
  const selectId = id ?? generatedId;
  const listboxId = `${selectId}-listbox`;
  const [open, setOpen] = (0, import_react2.useState)(false);
  const containerRef = (0, import_react2.useRef)(null);
  const triggerRef = (0, import_react2.useRef)(null);
  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption?.label ?? placeholder ?? (value !== "" ? value : "");
  (0, import_react2.useEffect)(() => {
    if (!open) return;
    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);
  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setOpen(false);
    if (!clearOnSelect) {
      triggerRef.current?.focus();
    }
  };
  const toggle = () => {
    if (disabled) return;
    setOpen((prev) => !prev);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      ref: containerRef,
      className: `dsh-md-select-container${compact ? " isCompact" : ""}${open ? " isOpen" : ""}${disabled ? " isDisabled" : ""} ${className}`.trim(),
      style,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            ref: triggerRef,
            id: selectId,
            type: "button",
            className: "dsh-md-select-trigger",
            "aria-haspopup": "listbox",
            "aria-expanded": open,
            "aria-controls": open ? listboxId : void 0,
            "aria-label": ariaLabel ?? placeholder,
            disabled,
            onClick: toggle,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-md-select-trigger-content", children: [
                selectedOption?.dotState && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: selectedOption.dotState, size: 7 }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `dsh-md-select-label${!selectedOption && placeholder ? " isPlaceholder" : ""}`, children: displayLabel })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `dsh-md-select-arrow${open ? " isOpen" : ""}`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: 13 }) })
            ]
          }
        ),
        open && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "div",
          {
            id: listboxId,
            role: "listbox",
            tabIndex: -1,
            "aria-label": ariaLabel ?? placeholder,
            className: "dsh-md-select-dropdown",
            children: options.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-md-select-empty", children: placeholder ?? "No options" }) : options.map((opt) => {
              const isSelected = !clearOnSelect && opt.value === value;
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  type: "button",
                  role: "option",
                  "aria-selected": isSelected,
                  disabled: opt.disabled,
                  className: `dsh-md-select-option${isSelected ? " isSelected" : ""}${opt.disabled ? " isDisabled" : ""}`,
                  onClick: () => handleSelect(opt.value),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-md-select-option-main", children: [
                      opt.dotState && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: opt.dotState, size: 7 }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-md-select-option-title", children: opt.label }),
                      opt.badge && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-md-select-option-badge", children: opt.badge })
                    ] }),
                    opt.description && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-md-select-option-desc", title: opt.description, children: opt.description }),
                    isSelected && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-md-select-check-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckmarkIcon, {}) })
                  ]
                },
                opt.value
              );
            })
          }
        )
      ]
    }
  );
}

// src/contract.ts
function DeviceId(id) {
  return id;
}
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
  const rawSessionId = rest.slice(sepIndex + 1);
  if (rawSessionId.startsWith(REMOTE_SESSION_PREFIX)) {
    return { deviceId: LOCAL_DEVICE_ID, rawSessionId: sessionId, isRemote: false };
  }
  const deviceId = unescapeSegment(rest.slice(0, sepIndex));
  return { deviceId, rawSessionId, isRemote: true };
}
function unescapeSegment(value) {
  return value.replaceAll("%7E", "~").replaceAll("%25", "%");
}

// src/attention.ts
function attentionUnreadIds(byDevice) {
  return new Set(Object.values(byDevice).flatMap((view) => view.unreadSessionIds));
}

// src/client/AttentionDetails.tsx
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react4 = require("react");

// src/client/attentionSessions.ts
function cleanTitle(value) {
  const trimmed = value?.trim();
  return trimmed === void 0 || trimmed === "" ? void 0 : trimmed;
}
function resolveAttentionTitle(sessionId, local, hostTitles) {
  return cleanTitle(local?.displayTitle) ?? cleanTitle(local?.title) ?? cleanTitle(hostTitles?.[sessionId]);
}
function resolveAttentionSession(sessionId, snapshot, options) {
  const decoded = decodeSessionId(sessionId);
  const deviceId = decoded.isRemote ? String(decoded.deviceId) : options.owningDeviceId ?? String(LOCAL_DEVICE_ID);
  const device = snapshot.devices.find((candidate) => String(candidate.id) === deviceId);
  const deviceName = decoded.isRemote ? cleanTitle(options.owningDeviceName) ?? cleanTitle(device?.name) ?? String(decoded.deviceId) : options.localDeviceName;
  return {
    sessionId,
    rawSessionId: decoded.isRemote ? decoded.rawSessionId : sessionId,
    deviceId,
    deviceName,
    title: cleanTitle(options.title?.(sessionId)) ?? ""
  };
}
function resolveAttentionSessions(sessionIds, snapshot, options) {
  return sessionIds.map((sessionId) => resolveAttentionSession(sessionId, snapshot, options));
}

// src/client/state.ts
var import_react3 = require("react");

// src/client/barMetrics.ts
var COMPACT_BAR_WIDTH = 720;
function resolveBarLayout(input) {
  const frameLeft = finiteNonNegative(input.frameLeft);
  const frameWidth = finiteNonNegative(input.frameWidth);
  const viewportWidth = finiteNonNegative(input.viewportWidth);
  const chromeTop = finiteNonNegative(input.chromeTop);
  const visible = viewportWidth > 0 ? Math.max(0, viewportWidth - frameLeft) : frameWidth;
  const width = frameWidth > 0 ? visible > 0 ? Math.min(frameWidth, visible) : frameWidth : visible;
  return {
    left: frameLeft,
    top: finiteNonNegative(input.frameTop) + chromeTop,
    width,
    compact: width > 0 && width < COMPACT_BAR_WIDTH,
    clipped: frameWidth > 0 && visible > 0 && frameWidth > visible + 1
  };
}
function finiteNonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
function measureNativeBar(input) {
  const innerWidth = finiteNonNegative(input.innerWidth);
  const left = finiteNonNegative(input.left);
  const width = finiteNonNegative(input.width);
  const visible = innerWidth > 0 ? Math.max(0, innerWidth - left) : width;
  const clampedWidth = visible > 0 ? Math.min(width === 0 ? visible : width, visible) : width;
  return {
    innerWidth,
    innerHeight: finiteNonNegative(input.innerHeight),
    ...input.devicePixelRatio !== void 0 ? { devicePixelRatio: input.devicePixelRatio } : {},
    barLeft: left,
    barWidth: width,
    barRight: left + width,
    clampedWidth,
    compact: clampedWidth > 0 && clampedWidth < COMPACT_BAR_WIDTH,
    updatedAt: input.now ?? Date.now()
  };
}
var current;
function recordNativeBarMetrics(metrics) {
  current = metrics;
}
function readNativeBarMetrics() {
  return current;
}
var obstruction;
function recordNativeBarObstruction(next) {
  obstruction = next;
}
function readNativeBarObstruction() {
  return obstruction;
}
function describeObstruction(element) {
  if (element === null || element === void 0) return void 0;
  const tag = element.tagName.toLowerCase();
  const id = element.id === "" ? "" : `#${element.id}`;
  const classes = Array.from(element.classList).filter((name) => !name.startsWith("dsh-md-")).slice(0, 2).map((name) => `.${name}`).join("");
  let zIndex = "";
  try {
    const style = globalThis.getComputedStyle?.(element);
    if (style !== void 0 && style.zIndex !== "auto" && style.zIndex !== "") zIndex = ` z=${style.zIndex}`;
  } catch {
  }
  return `${tag}${id}${classes}${zIndex}`;
}

// src/client/state.ts
var ACTIVE_NATIVE_DEVICE_KEY = "dsh-multi-device.active-native-device";
function shouldApplySnapshot(current2, next, force = false) {
  const epochChanged = next.hostEpoch !== void 0 && next.hostEpoch !== current2.hostEpoch;
  if (epochChanged) return true;
  if (next.revision < current2.revision) return false;
  if (next.revision === current2.revision && !force) return false;
  return true;
}
function readStoredActiveNativeDevice() {
  try {
    if (typeof localStorage === "undefined") return void 0;
    const value = localStorage.getItem(ACTIVE_NATIVE_DEVICE_KEY);
    return value === null || value === "" ? void 0 : DeviceId(value);
  } catch {
    return void 0;
  }
}
function storeActiveNativeDevice(deviceId) {
  try {
    if (typeof localStorage === "undefined") return;
    if (deviceId === void 0) localStorage.removeItem(ACTIVE_NATIVE_DEVICE_KEY);
    else localStorage.setItem(ACTIVE_NATIVE_DEVICE_KEY, deviceId);
  } catch {
  }
}
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
var MAX_KEEP_ALIVE_PAGES = 6;
var CLIENT_INSTANCE_ID = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `client-${String(Date.now())}-${Math.random().toString(36).slice(2)}`;
var EMPTY_SNAPSHOT = {
  revision: 0,
  devices: [],
  sshConfigHosts: [],
  unreadSessionIds: [],
  ui: { crossHostReadState: false }
};
var MultiDeviceClientStore = class {
  clientId = CLIENT_INSTANCE_ID;
  mainViewVisible = true;
  state;
  listeners = /* @__PURE__ */ new Set();
  eventSource;
  pollTimer;
  sseRetryTimer;
  sseAttempt = 0;
  started = false;
  disposed = false;
  lifecycleGeneration = 0;
  lifecycleAbort = new AbortController();
  snapshotInFlight;
  navigationGeneration = 0;
  connectionGeneration = 0;
  hostGeneration = 0;
  requestSequence = 0;
  latestRequests = /* @__PURE__ */ new Map();
  responseFences = /* @__PURE__ */ new WeakMap();
  /** Epochs are opaque identities, never lexically or numerically ordered. */
  retiredEpochs = /* @__PURE__ */ new Set();
  visibilityDocument;
  onVisibilityChange = () => {
    this.clearUnreadForActiveSession(this.state.snapshot);
  };
  /** Latest Session reported to the Host, used to dedupe mount/cleanup races. */
  reportedSessionId;
  hasReportedSession = false;
  observedLocalMainSessionId;
  /** Ignore the unchanged background main view, not an actual local navigation. */
  reportLocalMainSession(sessionId) {
    this.observedLocalMainSessionId = sessionId;
    return this.setActiveSession(sessionId);
  }
  reportingSessionId;
  activeSessionInFlight;
  /** Monotonic control-plane sequence so an older HTTP request cannot win. */
  activeSessionSeq = 0;
  lastPollAt = 0;
  /** Sessions for which this client already asked the Host to clear unread. */
  unreadClearInFlight = /* @__PURE__ */ new Map();
  constructor() {
    this.state = {
      snapshot: EMPTY_SNAPSHOT,
      loading: true,
      // Restored so a browser refresh keeps the last device tab while the
      // device still exists in the Host snapshot.
      activeNativeDeviceId: readStoredActiveNativeDevice(),
      keepAliveDeviceIds: [],
      reloadCounters: {},
      settingsModalOpen: false
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  setState(patch) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
      }
    }
  }
  resetActiveSessionReport() {
    this.hasReportedSession = false;
    this.reportedSessionId = void 0;
    this.activeSessionSeq += 1;
    this.activeSessionInFlight = void 0;
    this.reportingSessionId = void 0;
  }
  isFenceCurrent(fence) {
    return !this.disposed && fence.lifecycle === this.lifecycleGeneration && fence.connection === this.connectionGeneration && fence.host === this.hostGeneration && this.latestRequests.get(fence.key) === fence.request;
  }
  isResponseCurrent(response) {
    if (response.stale === true || this.disposed) return false;
    const fence = this.responseFences.get(response);
    return fence === void 0 || this.isFenceCurrent(fence);
  }
  start() {
    if (this.started || this.disposed) return () => {
    };
    this.started = true;
    this.lifecycleAbort = new AbortController();
    const lifecycle = ++this.lifecycleGeneration;
    this.resetActiveSessionReport();
    this.sseAttempt = 0;
    this.lastPollAt = 0;
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      this.visibilityDocument = document;
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
    this.connectSse();
    void this.refreshSnapshot();
    this.clearUnreadForActiveSession(this.state.snapshot);
    this.pollTimer = setInterval(() => {
      if (!this.started || lifecycle !== this.lifecycleGeneration) return;
      const sseOpen = typeof EventSource !== "undefined" && this.eventSource?.readyState === EventSource.OPEN;
      if (sseOpen) return;
      const now = Date.now();
      if (now - this.lastPollAt < 4e3) return;
      this.lastPollAt = now;
      void this.refreshSnapshot();
    }, 5e3);
    return () => {
      if (lifecycle === this.lifecycleGeneration) this.stop();
    };
  }
  stop() {
    this.started = false;
    this.lifecycleGeneration += 1;
    this.navigationGeneration += 1;
    this.lifecycleAbort.abort();
    this.connectionGeneration += 1;
    this.latestRequests.clear();
    this.snapshotInFlight = void 0;
    this.resetActiveSessionReport();
    this.unreadClearInFlight.clear();
    if (this.pollTimer !== void 0) clearInterval(this.pollTimer);
    this.pollTimer = void 0;
    this.eventSource?.close();
    this.eventSource = void 0;
    if (this.sseRetryTimer !== void 0) clearTimeout(this.sseRetryTimer);
    this.sseRetryTimer = void 0;
    this.visibilityDocument?.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.visibilityDocument = void 0;
  }
  /** Final teardown (including HMR): a disposed store cannot be restarted. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.listeners.clear();
  }
  connectSse() {
    if (typeof EventSource === "undefined" || !this.started || this.disposed) return;
    this.eventSource?.close();
    const lifecycle = this.lifecycleGeneration;
    const connection = ++this.connectionGeneration;
    this.resetActiveSessionReport();
    this.unreadClearInFlight.clear();
    const current2 = () => this.started && !this.disposed && lifecycle === this.lifecycleGeneration && connection === this.connectionGeneration;
    try {
      const es = new EventSource(`/multi-device/events?clientId=${encodeURIComponent(this.clientId)}`);
      this.eventSource = es;
      es.addEventListener("snapshot", (ev) => {
        if (!current2() || this.eventSource !== es) return;
        this.sseAttempt = 0;
        try {
          const snap = JSON.parse(ev.data);
          this.applyIncomingSnapshot(snap);
        } catch {
        }
      });
      es.onerror = () => {
        if (!current2() || this.eventSource !== es) return;
        es.close();
        this.eventSource = void 0;
        this.connectionGeneration += 1;
        this.resetActiveSessionReport();
        this.unreadClearInFlight.clear();
        if (this.sseRetryTimer !== void 0) return;
        const delay = Math.min(15e3, 500 * 2 ** this.sseAttempt);
        this.sseAttempt = Math.min(this.sseAttempt + 1, 6);
        this.sseRetryTimer = setTimeout(() => {
          if (!this.started || lifecycle !== this.lifecycleGeneration || this.disposed) return;
          this.sseRetryTimer = void 0;
          this.connectSse();
        }, delay);
      };
    } catch {
    }
  }
  applyIncomingSnapshot(snap, activeOverride) {
    if (this.disposed) return;
    const fence = this.responseFences.get(snap);
    if (fence !== void 0 && !this.isFenceCurrent(fence)) return;
    const previous = this.state.snapshot;
    if (snap.hostEpoch !== void 0 && this.retiredEpochs.has(snap.hostEpoch)) return;
    if (previous.hostEpoch !== void 0 && snap.hostEpoch === void 0) return;
    const force = activeOverride !== void 0 || this.state.loading || this.state.error !== void 0;
    if (!shouldApplySnapshot(previous, snap, force)) return;
    const epochChanged = snap.hostEpoch !== void 0 && snap.hostEpoch !== previous.hostEpoch;
    if (epochChanged) {
      if (previous.hostEpoch !== void 0) this.retiredEpochs.add(previous.hostEpoch);
      this.hostGeneration += 1;
      if (fence !== void 0) fence.host = this.hostGeneration;
      this.resetActiveSessionReport();
      this.unreadClearInFlight.clear();
    }
    const configuredIds = new Set(snap.devices.map((device) => device.id));
    const keepAliveEligible = new Set(
      snap.devices.filter((device) => device.keepNativeAlive !== false).map((device) => device.id)
    );
    let activeNative;
    if (activeOverride === null) {
      activeNative = void 0;
    } else if (activeOverride !== void 0 && configuredIds.has(activeOverride)) {
      activeNative = activeOverride;
    } else if (this.state.activeNativeDeviceId !== void 0 && configuredIds.has(this.state.activeNativeDeviceId)) {
      activeNative = this.state.activeNativeDeviceId;
    }
    storeActiveNativeDevice(activeNative);
    const keepAlive = this.state.keepAliveDeviceIds.filter((id) => keepAliveEligible.has(id)).slice(-MAX_KEEP_ALIVE_PAGES);
    if (activeNative !== void 0 && keepAliveEligible.has(activeNative) && !keepAlive.includes(activeNative)) {
      keepAlive.push(activeNative);
      while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) keepAlive.shift();
    }
    this.setState({
      snapshot: snap,
      loading: false,
      error: void 0,
      activeNativeDeviceId: activeNative,
      keepAliveDeviceIds: keepAlive
    });
    this.clearUnreadForActiveSession(snap);
    if (epochChanged) void this.setActiveSession(this.state.activeSessionId);
  }
  /**
   * A completion can arrive while its conversation is already the main view.
   * The Host has no reliable cross-client presence signal, so every *visible*
   * viewing client clears the marker as soon as it sees it. The next snapshot
   * removes the dot everywhere; the round-trip is short enough to avoid a
   * lingering reminder and keeps the "main view is read" rule identical to
   * DSH's.
   *
   * A hidden tab must NOT clear: nobody is looking at it, so consuming the
   * unread marker would silently drop the only reminder the user had. The
   * visibilitychange handler clears it immediately when the tab becomes visible.
   */
  clearUnreadForActiveSession(snap) {
    if (this.disposed) return;
    const active = this.state.activeSessionId;
    if (active === void 0) return;
    if (this.effectiveSessionId() !== active) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const unread = snap.unreadSessionIds ?? [];
    if (!unread.includes(active)) return;
    const completionId = this.readCompletionId(snap, active);
    const previous = this.unreadClearInFlight.get(active);
    if (previous !== void 0 && previous.completionId === completionId) return;
    const pending = { completionId };
    this.unreadClearInFlight.set(active, pending);
    void this.markSessionRead(active).finally(() => {
      if (this.unreadClearInFlight.get(active) === pending) this.unreadClearInFlight.delete(active);
    });
  }
  activateNativeDevice(deviceId) {
    const device = this.state.snapshot.devices.find((candidate) => candidate.id === deviceId);
    if (device === void 0) return;
    const keepAliveEligible = new Set(
      this.state.snapshot.devices.filter((candidate) => candidate.keepNativeAlive !== false).map((candidate) => candidate.id)
    );
    const keepAlive = this.state.keepAliveDeviceIds.filter((id) => keepAliveEligible.has(id) && id !== deviceId);
    if (keepAliveEligible.has(deviceId)) {
      keepAlive.push(deviceId);
      while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) keepAlive.shift();
    }
    storeActiveNativeDevice(deviceId);
    this.setState({ activeNativeDeviceId: deviceId, keepAliveDeviceIds: keepAlive });
  }
  /**
   * Mount (and keep alive) one device frame without selecting its tab.
   * Idempotent; unknown/disabled devices are ignored.
   */
  ensureKeepAliveDevice(deviceId) {
    const device = this.state.snapshot.devices.find((candidate) => candidate.id === deviceId);
    if (device === void 0 || device.keepNativeAlive === false) return;
    if (this.state.keepAliveDeviceIds.includes(deviceId)) return;
    const keepAlive = [...this.state.keepAliveDeviceIds, deviceId];
    while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) keepAlive.shift();
    this.setState({ keepAliveDeviceIds: keepAlive });
  }
  // ==========================================================================
  // UI Navigation & Keep-Alive Actions
  // ==========================================================================
  /** Switch to a remote device tab. */
  selectNativeDevice(deviceId) {
    this.activateNativeDevice(deviceId);
    return Promise.resolve({ ok: true });
  }
  /** Return to the 本机 tab. */
  selectLocalNativeTab() {
    this.navigationGeneration += 1;
    this.enterLocalScope();
  }
  /** Restore the local Session scope for the 本机 tab, even when none exists. */
  enterLocalScope() {
    const localSessionId = this.observedLocalMainSessionId;
    storeActiveNativeDevice(void 0);
    this.setState({ activeNativeDeviceId: void 0, activeSessionId: localSessionId });
    void this.setActiveSession(localSessionId);
    this.clearUnreadForActiveSession(this.state.snapshot);
  }
  releaseKeepAliveDevice(deviceId) {
    const nextKeepAlive = this.state.keepAliveDeviceIds.filter((id) => id !== deviceId);
    const nextActive = this.state.activeNativeDeviceId === deviceId ? nextKeepAlive[nextKeepAlive.length - 1] : this.state.activeNativeDeviceId;
    storeActiveNativeDevice(nextActive);
    this.setState({
      keepAliveDeviceIds: nextKeepAlive,
      activeNativeDeviceId: nextActive
    });
    if (nextActive === void 0) this.enterLocalScope();
  }
  reloadNativeDevice(deviceId) {
    const current2 = this.state.reloadCounters[deviceId] ?? 0;
    this.setState({
      reloadCounters: {
        ...this.state.reloadCounters,
        [deviceId]: current2 + 1
      }
    });
  }
  setSettingsModalOpen(open) {
    this.setState({ settingsModalOpen: open });
  }
  /** The local mirror is mounted behind device tabs and global panels. */
  effectiveSessionId() {
    if (!this.mainViewVisible) return void 0;
    if (this.state.activeNativeDeviceId !== void 0) return void 0;
    return this.state.activeSessionId;
  }
  setMainViewVisible(visible) {
    if (this.mainViewVisible === visible) return;
    this.mainViewVisible = visible;
    this.setState({});
    if (visible) this.clearUnreadForActiveSession(this.state.snapshot);
  }
  setActiveSession(sessionId) {
    if (this.disposed) return Promise.resolve();
    const next = sessionId || void 0;
    if (this.state.activeSessionId !== next) this.setState({ activeSessionId: next });
    this.clearUnreadForActiveSession(this.state.snapshot);
    if (this.hasReportedSession && this.reportedSessionId === next && this.activeSessionInFlight === void 0) return Promise.resolve();
    if (this.activeSessionInFlight !== void 0 && this.reportingSessionId === next) return this.activeSessionInFlight;
    const requestSeq = ++this.activeSessionSeq;
    this.reportingSessionId = next;
    const promise = this.callControlPlane({
      action: "setActiveSession",
      payload: { sessionId: next ?? "", requestSeq }
    }).then((result) => {
      if (this.isResponseCurrent(result) && result.ok && requestSeq === this.activeSessionSeq) {
        this.reportedSessionId = next;
        this.hasReportedSession = true;
      }
    }).finally(() => {
      if (this.activeSessionInFlight === promise) this.activeSessionInFlight = void 0;
    });
    this.activeSessionInFlight = promise;
    this.clearUnreadForActiveSession(this.state.snapshot);
    return promise;
  }
  /** Clear the scope only when the unmounting Session is still the reported one. */
  clearActiveSession(sessionId) {
    if (this.state.activeSessionId !== sessionId) return;
    void this.setActiveSession(void 0);
  }
  readCompletionId(snap, sessionId) {
    return snap.readCompletions?.[sessionId];
  }
  /** Ask the Host to clear only the completion this browser actually observed. */
  async markSessionRead(sessionId) {
    if (sessionId === "") return false;
    const expectedCompletionId = this.readCompletionId(this.state.snapshot, sessionId);
    const res = await this.callControlPlane({
      action: "markSessionRead",
      payload: { sessionId, ...expectedCompletionId !== void 0 ? { expectedCompletionId } : {} }
    });
    if (!this.isResponseCurrent(res) || !res.ok) return false;
    this.applyIncomingSnapshot(res.value.snapshot);
    return res.value.changed;
  }
  /**
   * Clear every unread marker owned by one device (本机 included).
   *
   * The per-Session read signal depends on a page the Host can observe. When a
   * device is read outside that path (another browser, or a native page whose
   * bridge never became ready), this is the explicit way out.
   */
  async markDeviceRead(deviceId) {
    const res = await this.callControlPlane({
      action: "markDeviceRead",
      payload: { deviceId }
    });
    if (!this.isResponseCurrent(res)) return { ok: false, changed: 0, error: "stale-response" };
    if (!res.ok) return { ok: false, changed: 0, error: res.error };
    this.applyIncomingSnapshot(res.value.snapshot);
    return { ok: true, changed: res.value.changed };
  }
  // ==========================================================================
  // Control-Plane RPC Calls
  // ==========================================================================
  async callControlPlane(request) {
    const payload = request.payload;
    const scope = request.action === "setActiveSession" ? "" : payload?.logicalWorkspaceId ?? payload?.sessionId ?? payload?.deviceId ?? payload?.memberKey ?? payload?.ruleId ?? payload?.id ?? "";
    const key = `${request.action}:${String(scope)}`;
    const fence = {
      lifecycle: this.lifecycleGeneration,
      connection: this.connectionGeneration,
      host: this.hostGeneration,
      request: ++this.requestSequence,
      key
    };
    this.latestRequests.set(key, fence.request);
    const stale = () => ({ ok: false, error: "stale-response", stale: true });
    if (this.disposed) return stale();
    try {
      const response = await fetch("/multi-device/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, payload: { ...request.payload, clientId: this.clientId } }),
        signal: AbortSignal.any([this.lifecycleAbort.signal, AbortSignal.timeout(3e4)])
      });
      const data = await response.json();
      if (!this.isFenceCurrent(fence)) return stale();
      if (data.ok && data.value !== null && typeof data.value === "object") {
        const value = data.value;
        const snapshot = typeof value.revision === "number" ? data.value : value.snapshot;
        if (snapshot !== void 0 && (snapshot.hostEpoch !== void 0 && this.retiredEpochs.has(snapshot.hostEpoch) || this.state.snapshot.hostEpoch !== void 0 && snapshot.hostEpoch === void 0 || snapshot.hostEpoch === this.state.snapshot.hostEpoch && snapshot.revision < this.state.snapshot.revision)) return stale();
      }
      this.responseFences.set(data, fence);
      if (data.ok && data.value !== null && typeof data.value === "object") {
        this.responseFences.set(data.value, fence);
        const snapshot = data.value.snapshot;
        if (snapshot !== null && typeof snapshot === "object") this.responseFences.set(snapshot, fence);
      }
      return data;
    } catch (error) {
      if (!this.isFenceCurrent(fence)) return stale();
      const result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
      this.responseFences.set(result, fence);
      return result;
    }
  }
  async refreshSnapshot() {
    if (this.disposed) return;
    if (this.snapshotInFlight !== void 0) return this.snapshotInFlight;
    const pending = this.callControlPlane({ action: "snapshot" }).then(async (res) => {
      if (!this.isResponseCurrent(res)) return;
      if (res.ok) {
        this.applyIncomingSnapshot(res.value);
        if (this.isResponseCurrent(res)) await this.setActiveSession(this.state.activeSessionId);
      } else if (!res.stale) {
        this.setState({ loading: false, error: res.error });
      }
    });
    this.snapshotInFlight = pending;
    try {
      await pending;
    } finally {
      if (this.snapshotInFlight === pending) this.snapshotInFlight = void 0;
    }
  }
  /**
   * Ask the Host for a support report. The browser contributes the geometry it
   * alone can see (viewport + Native Mode bar box), so a clipped mode switch is
   * visible in the copied report instead of being lost with the screenshot.
   */
  async fetchDiagnostics() {
    const client = collectClientDiagnosticsReport();
    return this.callControlPlane({
      action: "diagnostics",
      payload: client === void 0 ? {} : { client }
    });
  }
  async upsertDevice(input) {
    const res = await this.callControlPlane({
      action: "upsertDevice",
      payload: input
    });
    if (!this.isResponseCurrent(res)) return { ok: false, error: "stale-response" };
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot);
      return { ok: true };
    }
    return { ok: false, error: res.error };
  }
  /**
   * Force a fresh credential for one device. An optional launch URL/token
   * replaces the stored credential; without one the host re-runs the SSH
   * bootstrap so a rotated remote signing secret recovers automatically.
   */
  async authenticateDevice(deviceId, credential) {
    const res = await this.callControlPlane({
      action: "authenticateDevice",
      payload: {
        deviceId,
        ...credential !== void 0 && credential.trim() !== "" ? { credential: credential.trim() } : {}
      }
    });
    if (!this.isResponseCurrent(res)) return { ok: false, error: "stale-response" };
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot);
      return { ok: true };
    }
    void this.refreshSnapshot();
    return { ok: false, error: res.error };
  }
  async removeDevice(deviceId) {
    const res = await this.callControlPlane({
      action: "removeDevice",
      payload: { deviceId }
    });
    if (!this.isResponseCurrent(res)) return { ok: false, error: "stale-response" };
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
    if (!this.isResponseCurrent(res)) return { ok: false, error: "stale-response" };
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
  async setUiPreferences(patch) {
    const res = await this.callControlPlane({
      action: "setUiPreferences",
      payload: patch
    });
    if (!this.isResponseCurrent(res)) return { ok: false, error: "stale-response" };
    if (res.ok) {
      this.applyIncomingSnapshot(res.value);
      return { ok: true };
    }
    return { ok: false, error: res.error };
  }
};
function collectClientDiagnosticsReport() {
  if (typeof window === "undefined") return void 0;
  const bar = readNativeBarMetrics();
  const obstruction2 = readNativeBarObstruction();
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    ...Number.isFinite(window.devicePixelRatio) ? { devicePixelRatio: window.devicePixelRatio } : {},
    ...bar !== void 0 ? {
      barLeft: bar.barLeft,
      barWidth: bar.barWidth,
      barClampedWidth: bar.clampedWidth,
      compact: bar.compact
    } : {},
    ...obstruction2 !== void 0 ? { barObstruction: obstruction2.detail } : {},
    ...typeof navigator !== "undefined" && typeof navigator.userAgent === "string" ? { userAgent: navigator.userAgent } : {}
  };
}
var clientStore = new MultiDeviceClientStore();
function useMultiDeviceState() {
  return (0, import_react3.useSyncExternalStore)(clientStore.subscribe, clientStore.getSnapshot, clientStore.getSnapshot);
}

// src/client/AttentionDetails.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function attentionGroups(view) {
  return [
    { category: "pending", ids: view.pendingSessionIds, count: view.pendingSessionIds.length },
    { category: "running", ids: view.runningSessionIds, count: view.runningSessionIds.length },
    { category: "unread", ids: view.unreadSessionIds, count: view.unreadSessionIds.length }
  ];
}
function attentionLabels(t) {
  return {
    pending: t("attentionPending"),
    running: t("attentionRunning"),
    unread: t("attentionUnread"),
    stale: t("attentionStale"),
    last: t("attentionLastKnown"),
    members: t("attentionMembers"),
    unavailable: t("attentionUnavailable"),
    copy: t("attentionCopy"),
    copied: t("attentionCopied"),
    failed: t("attentionCopyFailed"),
    requests: t("attentionRequests")
  };
}
var CATEGORY_COUNT_KEY = {
  pending: "pendingCount",
  running: "runningCount",
  unread: "unreadCount"
};
function deviceStateOf(snapshot, deviceId) {
  if (deviceId === LOCAL_DEVICE_ID) return "connected";
  return snapshot.devices.find((device) => device.id === deviceId)?.state ?? "error";
}
function categoryIcon(category) {
  if (category === "pending") return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconWarningOutlineRegular, { size: 12 });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: category === "running" ? "ongoing" : "done", size: 8 });
}
function AttentionDetails({
  view,
  deviceName,
  t,
  nativeBar = false,
  fallback
}) {
  const state = useMultiDeviceState();
  const snapshot = state.snapshot;
  const words = attentionLabels(t);
  const sessionList = useSessionListSnapshot();
  const [openCategory, setOpenCategory] = (0, import_react4.useState)(null);
  const [failure, setFailure] = (0, import_react4.useState)(null);
  const fresh = view?.fresh ?? fallback?.fresh ?? false;
  const groups = view !== void 0 ? attentionGroups(view) : [
    { category: "pending", ids: [], count: fallback?.pendingCount ?? 0 },
    { category: "running", ids: [], count: fallback?.runningCount ?? 0 },
    { category: "unread", ids: fallback?.unreadSessionIds ?? [], count: fallback?.unreadSessionIds.length ?? 0 }
  ];
  const titleFor = (sessionId) => resolveAttentionTitle(sessionId, sessionList?.byId[sessionId], snapshot.sessionTitles);
  const chipCount = (count) => count > 99 ? "99+" : String(count);
  const fail = (detail) => {
    setFailure({
      seq: Date.now(),
      message: detail === void 0 || detail === "" ? t("attentionOpenFailed") : `${t("attentionOpenFailed")}: ${detail}`
    });
  };
  const openRow = async (row) => {
    setOpenCategory(null);
    const decoded = decodeSessionId(row.sessionId);
    try {
      if (!decoded.isRemote) {
        clientStore.selectLocalNativeTab();
        const workspace = getClientServices().uiWorkspace;
        if (workspace === void 0 || typeof workspace.openSession !== "function") {
          fail(void 0);
          return;
        }
        workspace.openSession(row.sessionId);
        await clientStore.setActiveSession(row.sessionId);
        return;
      }
      const switched = await clientStore.selectNativeDevice(decoded.deviceId);
      if (!switched.ok) {
        fail(switched.error);
        return;
      }
      await clientStore.setActiveSession(row.sessionId);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  };
  const renderRows = (ids) => {
    if (ids.length === 0) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-attention-note", children: words.unavailable });
    }
    const rows = resolveAttentionSessions(ids, snapshot, {
      localDeviceName: t("nativeLocalTab"),
      owningDeviceName: deviceName,
      title: titleFor
    });
    return rows.map((row) => {
      const meta = [row.cwd, row.deviceName].filter((part) => part !== void 0 && part !== "");
      const minimal = row.title === "";
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.MenuItemButton,
        {
          icon: row.deviceId === LOCAL_DEVICE_ID ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconGlobeOutlineRegular, { size: 12 }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: deviceStateToDotState(deviceStateOf(snapshot, row.deviceId)), size: 8 }),
          onSelect: () => {
            void openRow(row);
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dsh-md-attention-row", title: `${row.sessionId}
${t("attentionOpenHint")}`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `dsh-md-attention-row-title${minimal ? " isId" : ""}`, children: minimal ? row.rawSessionId : row.title }),
            meta.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-attention-row-meta", children: meta.join(" \xB7 ") })
          ] })
        },
        row.sessionId
      );
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dsh-md-attention", role: "group", "aria-label": `${deviceName} ${words.members}`, children: [
    fresh ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-attention-stale-slot", "aria-hidden": "true" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "span",
      {
        role: "status",
        className: "dsh-md-attention-stale",
        "data-attention-stale": "true",
        "aria-label": words.stale,
        title: words.stale,
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-attention-stale-dot", "aria-hidden": "true" })
      }
    ),
    groups.map((group) => {
      const label = t(CATEGORY_COUNT_KEY[group.category]).replace("{count}", String(group.count));
      if (group.count === 0) {
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "span",
          {
            className: "dsh-md-attention-slot",
            "data-attention-slot": group.category,
            "aria-hidden": "true"
          },
          group.category
        );
      }
      const chip = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "button",
        {
          type: "button",
          className: "dsh-md-attention-chip",
          "data-category": group.category,
          "data-open": openCategory === group.category ? "true" : "false",
          "data-attention-category": group.category,
          "aria-haspopup": "menu",
          "aria-expanded": openCategory === group.category,
          "aria-label": `${deviceName}: ${label}; ${words.members}`,
          title: label,
          onClick: () => {
            if (openCategory === group.category) {
              setOpenCategory(null);
              return;
            }
            setOpenCategory(group.category);
          },
          children: [
            categoryIcon(group.category),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-attention-count", children: chipCount(group.count) })
          ]
        }
      );
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_dsh_client_ui_primitives2.Menu,
        {
          open: openCategory === group.category,
          anchor: chip,
          onClose: () => setOpenCategory((current2) => current2 === group.category ? null : current2),
          portal: true,
          side: "bottom",
          align: "start",
          dense: nativeBar,
          listClassName: "dsh-md-attention-menu",
          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.MenuGroup, { label, children: renderRows(group.ids) })
        },
        group.category
      );
    }),
    failure !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Toast, { text: failure.message, tone: "error", onDone: () => setFailure(null) }, failure.seq)
  ] });
}

// src/client/unreadCounts.ts
function countableUnreadIds(unreadSessionIds, archivedSessionIds, subagentSessionIds, existsRemoteSession) {
  const hidden = /* @__PURE__ */ new Set();
  for (const sessionId of archivedSessionIds ?? []) hidden.add(sessionId);
  for (const sessionId of subagentSessionIds ?? []) hidden.add(sessionId);
  const unread = /* @__PURE__ */ new Set();
  for (const sessionId of unreadSessionIds) {
    if (hidden.has(sessionId)) continue;
    if (existsRemoteSession !== void 0 && decodeSessionId(sessionId).isRemote) {
      if (!existsRemoteSession(sessionId)) continue;
    }
    unread.add(sessionId);
  }
  return unread;
}
var EMPTY_UNREAD_SESSION_IDS = [];
function groupUnreadSessionIds(unread) {
  const grouped = /* @__PURE__ */ new Map();
  for (const sessionId of unread) {
    const deviceId = decodeSessionId(sessionId).deviceId;
    const ids = grouped.get(deviceId) ?? [];
    ids.push(sessionId);
    grouped.set(deviceId, ids);
  }
  return grouped;
}

// src/client/MultiDeviceHubPanel.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
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
  if (dev === void 0) return false;
  if (dev.enabled === false) return true;
  if (dev.ssh === void 0) return false;
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
  const [revealedValue, setRevealedValue] = (0, import_react5.useState)(void 0);
  const revealed = value.length > 0 && revealedValue === value;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-secret-wrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives3.Input,
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
    value.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives3.Button,
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
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
            children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: revealed ? EYE_OFF_PATH : EYE_PATH })
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
  const formId = (0, import_react5.useId)();
  const [sshHost, setSshHost] = (0, import_react5.useState)(device?.ssh?.host ?? "");
  const [name, setName] = (0, import_react5.useState)(device?.name ?? "");
  const [authCredential, setAuthCredential] = (0, import_react5.useState)("");
  const [advancedOpen, setAdvancedOpen] = (0, import_react5.useState)(() => hasCustomAdvancedFields(device));
  const [remotePort, setRemotePort] = (0, import_react5.useState)(String(device?.ssh?.remotePort ?? 3080));
  const [sshUser, setSshUser] = (0, import_react5.useState)(device?.ssh?.username ?? "");
  const [sshPort, setSshPort] = (0, import_react5.useState)(
    device?.ssh?.port !== void 0 && device.ssh.port !== 22 ? String(device.ssh.port) : ""
  );
  const [sshKeyPath, setSshKeyPath] = (0, import_react5.useState)(device?.ssh?.privateKeyPath ?? "");
  const [sshPassphrase, setSshPassphrase] = (0, import_react5.useState)("");
  const [sshProxyJump, setSshProxyJump] = (0, import_react5.useState)(device?.ssh?.proxyJump ?? "");
  const [remoteDshHome, setRemoteDshHome] = (0, import_react5.useState)(device?.ssh?.remoteDshHome ?? "");
  const [bootstrapCredentials, setBootstrapCredentials] = (0, import_react5.useState)(
    device === void 0 || device.ssh?.bootstrapFromRemoteCredentials === true
  );
  const [deviceEnabled, setDeviceEnabled] = (0, import_react5.useState)(device?.enabled !== false);
  const [testing, setTesting] = (0, import_react5.useState)(false);
  const [saving, setSaving] = (0, import_react5.useState)(false);
  const [saveAnyway, setSaveAnyway] = (0, import_react5.useState)(false);
  const [testResult, setTestResult] = (0, import_react5.useState)(null);
  const [saveError, setSaveError] = (0, import_react5.useState)(null);
  const selectedKeyEntry = sshKeys.find((k) => k.path === sshKeyPath);
  const showPassphraseField = selectedKeyEntry?.encrypted === true;
  const busy = testing || saving;
  const buildInput = () => {
    const parsedHost = parseSshHostInput(sshHost);
    const effectiveHost = parsedHost.host;
    const effectiveUser = sshUser.trim() || parsedHost.username;
    const explicitPort = Number(sshPort);
    const effectiveSshPort = sshPort.trim() !== "" && Number.isInteger(explicitPort) && explicitPort > 0 && explicitPort <= 65535 ? explicitPort : parsedHost.port;
    const parsedRemotePort = Number(remotePort);
    return {
      ...device !== void 0 ? { id: device.id } : {},
      name: name.trim() || effectiveHost || "remote-device",
      ...device?.label !== void 0 ? { label: device.label } : {},
      enabled: deviceEnabled,
      keepNativeAlive: device?.keepNativeAlive ?? true,
      transport: {
        kind: "ssh",
        host: effectiveHost,
        ...effectiveUser !== void 0 && effectiveUser !== "" ? { username: effectiveUser } : {},
        ...effectiveSshPort !== void 0 && effectiveSshPort > 0 ? { port: effectiveSshPort } : {},
        ...sshKeyPath.trim() !== "" ? { privateKeyPath: sshKeyPath.trim() } : {},
        ...sshPassphrase.trim() !== "" ? { passphrase: sshPassphrase.trim() } : {},
        ...sshProxyJump.trim() !== "" ? { proxyJump: sshProxyJump.trim() } : {},
        remotePort: parsedRemotePort > 0 ? parsedRemotePort : 3080,
        ...remoteDshHome.trim() !== "" ? { remoteDshHome: remoteDshHome.trim() } : {},
        bootstrapFromRemoteCredentials: bootstrapCredentials,
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
    setSaveAnyway(false);
    setSshHost(entry.alias);
    if (name.trim() === "") setName(entry.alias);
    setSshUser("");
    setSshPort("");
    setSshKeyPath("");
    setSshProxyJump("");
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
    if (!saveAnyway) {
      const preflight = await clientStore.testDevice(buildInput());
      if (!preflight.ok) {
        setSaving(false);
        setTestResult({ ok: false, text: preflight.error });
        setSaveAnyway(true);
        return;
      }
      setTestResult({
        ok: true,
        text: `${t("testPassed")} \xB7 DSH ${preflight.remoteDshVersion ?? preflight.protocolVersion} \xB7 ${String(preflight.latencyMs)}ms`
      });
    }
    const res = await clientStore.upsertDevice(buildInput());
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error ?? t("actionFailed"));
      return;
    }
    onSaved();
  };
  const hasCustomKeyPath = sshKeyPath.trim() !== "" && !sshKeys.some((k) => k.path === sshKeyPath);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("form", { className: "dsh-md-editor", onSubmit: (e) => {
    void handleSubmit(e);
  }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-editor-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-md-editor-title", children: device !== void 0 ? t("editDevice") : t("addDevice") }),
      sshConfigHosts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        DshSelect,
        {
          compact: true,
          clearOnSelect: true,
          value: "",
          placeholder: t("importSshPlaceholder"),
          ariaLabel: t("importSshPlaceholder"),
          disabled: busy,
          options: sshConfigHosts.map((h) => ({
            value: h.alias,
            label: h.alias,
            description: `${h.user ? `${h.user}@` : ""}${h.hostName}${h.port && h.port !== 22 ? `:${String(h.port)}` : ""}`
          })),
          onChange: (alias) => handleImportSshHost(alias)
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-form-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-host`, children: t("sshHost") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          import_dsh_client_ui_primitives3.Input,
          {
            id: `${formId}-host`,
            required: true,
            value: sshHost,
            placeholder: t("sshHostPlaceholder"),
            disabled: busy,
            onChange: (e) => {
              setSshHost(e.currentTarget.value);
              setTestResult(null);
              setSaveAnyway(false);
            }
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-name`, children: t("deviceName") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          import_dsh_client_ui_primitives3.Input,
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
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-token`, children: t("authCredential") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives3.DisclosureRow,
      {
        title: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-md-field-label", children: t("advancedOptions") }),
        open: advancedOpen,
        expandable: true,
        expandOnRowClick: true,
        onToggle: () => setAdvancedOpen((prev) => !prev),
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-form-grid dsh-md-advanced-body", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-rport`, children: t("remoteDshPort") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              import_dsh_client_ui_primitives3.Input,
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
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-user`, children: t("sshUser") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              import_dsh_client_ui_primitives3.Input,
              {
                id: `${formId}-user`,
                value: sshUser,
                placeholder: t("sshUserPlaceholder"),
                disabled: busy,
                onChange: (e) => setSshUser(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-port`, children: t("sshPort") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              import_dsh_client_ui_primitives3.Input,
              {
                id: `${formId}-port`,
                type: "number",
                min: 1,
                max: 65535,
                value: sshPort,
                placeholder: t("sshPortPlaceholder"),
                disabled: busy,
                onChange: (e) => setSshPort(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-key`, children: t("sshKeySelect") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              DshSelect,
              {
                id: `${formId}-key`,
                value: sshKeyPath,
                placeholder: t("sshKeyAuto"),
                disabled: busy,
                options: [
                  { value: "", label: t("sshKeyAuto"), description: t("sshKeyAutoDesc") },
                  ...hasCustomKeyPath ? [{ value: sshKeyPath, label: sshKeyPath, description: sshKeyPath }] : [],
                  ...sshKeys.map((key) => ({
                    value: key.path,
                    label: key.name,
                    description: key.path,
                    badge: key.encrypted ? "encrypted" : key.permissionsTooOpen ? "(!)" : void 0
                  }))
                ],
                onChange: (next) => setSshKeyPath(next)
              }
            )
          ] }),
          showPassphraseField && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-passphrase`, children: t("sshKeyPassphrase") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-jump`, children: t("sshProxyJump") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              import_dsh_client_ui_primitives3.Input,
              {
                id: `${formId}-jump`,
                value: sshProxyJump,
                placeholder: t("sshProxyJumpPlaceholder"),
                disabled: busy,
                onChange: (e) => setSshProxyJump(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-home`, children: t("remoteDshHome") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              import_dsh_client_ui_primitives3.Input,
              {
                id: `${formId}-home`,
                value: remoteDshHome,
                placeholder: t("remoteDshHomePlaceholder"),
                disabled: busy,
                onChange: (e) => setRemoteDshHome(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-field dsh-md-field-span", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            import_dsh_client_ui_primitives3.Switch,
            {
              checked: bootstrapCredentials,
              disabled: busy,
              label: t("authBootstrap"),
              onChange: setBootstrapCredentials
            }
          ) }),
          device !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-field dsh-md-field-span", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            import_dsh_client_ui_primitives3.Switch,
            {
              checked: deviceEnabled,
              disabled: busy,
              label: t("deviceEnabledLabel"),
              onChange: setDeviceEnabled
            }
          ) })
        ] })
      }
    ),
    saveError !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsh-md-error-text", role: "alert", children: saveError }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-editor-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-editor-footer-left", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          import_dsh_client_ui_primitives3.Button,
          {
            variant: "outline",
            size: "sm",
            disabled: busy || sshHost.trim() === "",
            icon: testing ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.StateDot, { state: "ongoing", size: 12 }) : void 0,
            onClick: () => {
              void handleTest();
            },
            children: testing ? t("testingConnection") : t("testConnection")
          }
        ),
        testResult !== null && (testResult.ok ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dsh-md-success-text", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.StateDot, { state: "done", size: 8 }),
          testResult.text
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-md-error-text", role: "alert", children: testResult.text }))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-editor-footer-right", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "outline", size: "sm", disabled: busy, onClick: onCancel, children: t("cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          import_dsh_client_ui_primitives3.Button,
          {
            variant: "primary",
            size: "sm",
            type: "submit",
            disabled: busy || sshHost.trim() === "",
            children: saving ? t("savingDevice") : saveAnyway ? t("saveAnyway") : t("saveDevice")
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
  const unread = snapshot.attentionByDevice !== void 0 ? attentionUnreadIds(snapshot.attentionByDevice) : countableUnreadIds(
    snapshot.unreadSessionIds,
    snapshot.archivedSessionIds,
    snapshot.subagentSessionIds
  );
  const unreadByDevice = groupUnreadSessionIds(unread);
  const [addingNew, setAddingNew] = (0, import_react5.useState)(false);
  const [editingDeviceId, setEditingDeviceId] = (0, import_react5.useState)(null);
  const [sshKeys, setSshKeys] = (0, import_react5.useState)([]);
  const [deleteTarget, setDeleteTarget] = (0, import_react5.useState)(null);
  const [deleting, setDeleting] = (0, import_react5.useState)(false);
  const [deleteError, setDeleteError] = (0, import_react5.useState)(null);
  const [diagnostics, setDiagnostics] = (0, import_react5.useState)(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = (0, import_react5.useState)(false);
  const [diagnosticsCopied, setDiagnosticsCopied] = (0, import_react5.useState)(false);
  const [toastNotice, setToastNotice] = (0, import_react5.useState)(null);
  const pushToast = (text, tone) => {
    setToastNotice((prev) => ({
      seq: (prev?.seq ?? 0) + 1,
      text,
      ...tone !== void 0 ? { tone } : {}
    }));
  };
  (0, import_react5.useEffect)(() => {
    if (addingNew || editingDeviceId !== null) {
      void clientStore.listSshKeys().then(setSshKeys);
    }
  }, [addingNew, editingDeviceId]);
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
  const copyDiagnosticsText = async (value) => {
    const copied = await copyText(JSON.stringify(value, null, 2));
    if (copied) {
      setDiagnosticsCopied(true);
      pushToast(t("diagnosticsCopied"), "success");
    } else {
      pushToast(t("diagnosticsCopyFailed"), "error");
    }
  };
  const runDiagnostics = () => {
    if (diagnosticsBusy) return;
    setDiagnosticsBusy(true);
    setDiagnosticsCopied(false);
    void clientStore.fetchDiagnostics().then((res) => {
      if (!res.ok) {
        pushToast(`${t("actionFailed")}: ${res.error}`, "error");
        return;
      }
      setDiagnostics(res.value);
      void copyDiagnosticsText(res.value);
    }).finally(() => {
      setDiagnosticsBusy(false);
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-section", children: [
    !hideHeader && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { className: "dsh-md-section-title", children: t("settingsSectionTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsh-md-section-intro", children: t("settingsSectionIntro") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-pref-list", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-pref-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-pref-title", children: t("crossHostReadStateTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-pref-desc", children: t("crossHostReadStateDesc") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        import_dsh_client_ui_primitives3.Switch,
        {
          checked: snapshot.ui?.crossHostReadState === true,
          label: t("crossHostReadStateTitle"),
          onChange: (enabled) => {
            void clientStore.setUiPreferences({ crossHostReadState: enabled }).then((res) => {
              if (!res.ok) pushToast(`${t("actionFailed")}: ${res.error ?? ""}`, "error");
            });
          }
        }
      )
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-devices-block", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-devices-header", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-devices-heading-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { className: "dsh-md-devices-heading", children: t("devicesHeading") }),
          hasDevices && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-md-devices-count-pill", children: snapshot.devices.length })
        ] }),
        !addingNew && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          import_dsh_client_ui_primitives3.Button,
          {
            variant: "outline",
            size: "sm",
            icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconPlusOutlineRegular, { size: 13 }),
            onClick: () => {
              setEditingDeviceId(null);
              setAddingNew(true);
            },
            children: t("addDevice")
          }
        )
      ] }),
      addingNew && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-card", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
      !hasDevices && !addingNew ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-card dsh-md-empty-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-row-name", children: t("noDevicesTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-pref-desc", children: t("noDevicesDesc") })
      ] }) : hasDevices ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { className: "dsh-md-rows", children: snapshot.devices.map((dev) => {
        const isEditing = editingDeviceId === dev.id;
        const deviceUnread = (unreadByDevice.get(dev.id) ?? EMPTY_UNREAD_SESSION_IDS).length;
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { className: "dsh-md-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-row-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-row-identity", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.StateDot, { state: deviceStateToDotState(dev.state), size: 8 }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-md-row-name", children: dev.name }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                AttentionDetails,
                {
                  view: snapshot.attentionByDevice?.[dev.id],
                  deviceName: dev.name,
                  t,
                  fallback: {
                    runningCount: snapshot.attentionByDevice === void 0 ? dev.runningSessionCount : void 0,
                    pendingCount: snapshot.attentionByDevice === void 0 ? dev.pendingApprovalCount : void 0,
                    unreadSessionIds: unreadByDevice.get(dev.id) ?? EMPTY_UNREAD_SESSION_IDS,
                    fresh: snapshot.attentionByDevice === void 0 && dev.state === "connected" && dev.catalogStale !== true
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-md-device-endpoint", title: formatCompactDeviceTarget(dev), children: formatCompactDeviceTarget(dev) }),
              dev.latencyMs !== void 0 && dev.state === "connected" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dsh-md-latency-text", children: [
                dev.latencyMs,
                "ms"
              ] }),
              dev.authState === "required" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-md-auth-required-tag", children: t("authRequired") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-row-actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                import_dsh_client_ui_primitives3.Button,
                {
                  variant: "outline",
                  size: "sm",
                  icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconRightUpOutlineRegular, { size: 13 }),
                  onClick: () => {
                    void clientStore.selectNativeDevice(dev.id).then((res) => {
                      if (!res.ok) {
                        pushToast(`${t("actionFailed")}: ${res.error ?? ""}`, "error");
                        return;
                      }
                      onCloseSettings?.();
                    });
                  },
                  children: t("openDevice")
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-icon-actions-group", children: [
                deviceUnread > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tooltip, { label: t("clearUnread"), side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  import_dsh_client_ui_primitives3.Button,
                  {
                    variant: "ghost",
                    size: "icon",
                    "aria-label": t("clearUnread"),
                    onClick: () => {
                      void clientStore.markDeviceRead(dev.id).then((res) => {
                        if (res.ok) {
                          pushToast(
                            t("clearedUnreadNotice").replace("{count}", String(res.changed)),
                            "success"
                          );
                        } else {
                          pushToast(`${t("actionFailed")}: ${res.error ?? ""}`, "error");
                        }
                      });
                    },
                    children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconCheckCircleFillRegular, { size: 14 })
                  }
                ) }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tooltip, { label: t("reconnect"), side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  import_dsh_client_ui_primitives3.Button,
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
                    children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconRefreshOutlineRegular, { size: 14 })
                  }
                ) }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tooltip, { label: t("editDevice"), side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  import_dsh_client_ui_primitives3.Button,
                  {
                    variant: "ghost",
                    size: "icon",
                    "aria-label": t("editDevice"),
                    "aria-expanded": isEditing,
                    onClick: () => {
                      setAddingNew(false);
                      setEditingDeviceId(isEditing ? null : dev.id);
                    },
                    children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconEditOutlineRegular, { size: 14 })
                  }
                ) }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tooltip, { label: t("remove"), side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  import_dsh_client_ui_primitives3.Button,
                  {
                    variant: "ghost",
                    size: "icon",
                    "aria-label": t("remove"),
                    onClick: () => {
                      setDeleteError(null);
                      setDeleteTarget(dev);
                    },
                    children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconTrashOutlineRegular, { size: 14 })
                  }
                ) })
              ] })
            ] })
          ] }),
          !isEditing && dev.lastError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsh-md-error-text", children: dev.lastError }),
          isEditing && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-diagnostics", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-pref-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-pref-title", children: t("diagnosticsTitle") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-pref-desc", children: t("diagnosticsDesc") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-diagnostics-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "outline", size: "sm", disabled: diagnosticsBusy, onClick: runDiagnostics, children: diagnosticsBusy ? `${t("diagnosticsRun")}\u2026` : t("diagnosticsRun") }),
          diagnostics !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            import_dsh_client_ui_primitives3.Button,
            {
              variant: "ghost",
              size: "sm",
              onClick: () => {
                void copyDiagnosticsText(diagnostics);
              },
              children: diagnosticsCopied ? t("diagnosticsCopied") : t("diagnosticsCopy")
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsh-md-diagnostics-mode", children: t("diagnosticsSummaryLine").replace("{devices}", String(snapshot.devices.length)).replace("{connected}", String(snapshot.devices.filter((device) => device.state === "connected").length)) }),
      diagnostics !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { className: "dsh-md-diagnostics-output", children: JSON.stringify(diagnostics, null, 2) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives3.Modal,
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
        footer: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            import_dsh_client_ui_primitives3.Button,
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
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            import_dsh_client_ui_primitives3.Button,
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
        children: deleteError !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsh-md-error-text", role: "alert", children: deleteError }) : null
      }
    ),
    toastNotice !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives3.Toast,
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
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react7 = require("react");
var import_react_dom = require("react-dom");

// src/client/AuthPanel.tsx
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react6 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
function AuthRequiredPanel({
  device,
  t,
  onOpenSettings
}) {
  const [credential, setCredential] = (0, import_react6.useState)("");
  const [busy, setBusy] = (0, import_react6.useState)(null);
  const [error, setError] = (0, import_react6.useState)(null);
  const run = async (viaToken) => {
    if (busy !== null) return;
    if (viaToken && credential.trim() === "") {
      setError(t("authCredentialLabel"));
      return;
    }
    setBusy(viaToken ? "token" : "ssh");
    setError(null);
    const res = await clientStore.authenticateDevice(
      device.id,
      viaToken ? credential.trim() : void 0
    );
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? t("authFailed"));
      return;
    }
    setCredential("");
    clientStore.reloadNativeDevice(device.id);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-md-auth-stage", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-md-auth-card", role: "region", "aria-label": t("authPanelTitle"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-md-auth-badge", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.StateDot, { state: "error", size: 8 }),
      t("authRequired")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { className: "dsh-md-auth-title", children: t("authPanelTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsh-md-auth-desc", children: t("authPanelDesc") }),
    error === null && device.authError !== void 0 && device.authError !== "" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsh-md-error-text", role: "status", children: device.authError }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "dsh-md-field-label", htmlFor: `dsh-md-auth-${device.id}`, children: t("authCredentialLabel") }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      import_dsh_client_ui_primitives4.Input,
      {
        id: `dsh-md-auth-${device.id}`,
        value: credential,
        placeholder: t("authTokenPlaceholder"),
        disabled: busy !== null,
        autoComplete: "off",
        spellCheck: false,
        onChange: (event) => setCredential(event.currentTarget.value)
      }
    ),
    error !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsh-md-error-text", role: "alert", children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-md-auth-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        import_dsh_client_ui_primitives4.Button,
        {
          variant: "primary",
          size: "sm",
          disabled: busy !== null || credential.trim() === "",
          icon: busy === "token" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.StateDot, { state: "ongoing", size: 12 }) : void 0,
          onClick: () => {
            void run(true);
          },
          children: busy === "token" ? t("authChecking") : t("authSubmit")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        import_dsh_client_ui_primitives4.Button,
        {
          variant: "outline",
          size: "sm",
          disabled: busy !== null,
          icon: busy === "ssh" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.StateDot, { state: "ongoing", size: 12 }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconRefreshOutlineRegular, { size: 13 }),
          onClick: () => {
            void run(false);
          },
          children: busy === "ssh" ? t("authChecking") : t("authUseSsh")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        import_dsh_client_ui_primitives4.Button,
        {
          variant: "ghost",
          size: "sm",
          disabled: busy !== null,
          icon: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconChevronLeftOutlineRegular, { size: 13 }),
          onClick: () => clientStore.selectLocalNativeTab(),
          children: t("authBackLocal")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        import_dsh_client_ui_primitives4.Button,
        {
          variant: "ghost",
          size: "sm",
          icon: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconSettingsOutlineRegular, { size: 13 }),
          onClick: onOpenSettings,
          children: t("authOpenSettings")
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsh-md-auth-hint", children: t("authHint") })
  ] }) });
}

// src/host/browser-relay.ts
function unsupported(code, message) {
  return { status: "unsupported", code, message };
}
function parseUrl(value) {
  if (typeof value !== "string" || value !== value.trim() || /[\u0000-\u0020\u007f]/u.test(value)) return void 0;
  try {
    const url = new URL(value);
    if (url.username !== "" || url.password !== "") return void 0;
    return url;
  } catch {
    return void 0;
  }
}
function isIpv4ProxyHost(host) {
  return host === "127.0.0.1" || host === "localhost";
}
function isLoopbackPage(host) {
  return isIpv4ProxyHost(host) || host === "[::1]";
}
function assessBrowserNativeAccess(input) {
  if (input.proxyUrl === void 0 || input.proxyUrl === "") {
    return { status: "unavailable", code: "proxy-not-ready", message: "The native device proxy is not ready yet." };
  }
  const page = parseUrl(input.pageUrl);
  if (page === void 0) return unsupported("invalid-page-url", "The current page URL is invalid; native access cannot be assessed safely.");
  const proxy = parseUrl(input.proxyUrl);
  if (proxy === void 0 || proxy.protocol !== "http:" && proxy.protocol !== "https:") {
    return unsupported("invalid-proxy-url", "The native proxy URL must be an absolute HTTP(S) URL without embedded credentials.");
  }
  if (proxy.origin === page.origin) {
    return unsupported("same-origin-unsafe", "Remote native HTML cannot run on the local DSH Host origin: it could access Host cookies, storage and authenticated APIs. A same-origin path relay is not supported by the current remote runtime.");
  }
  const proxyHost = proxy.hostname.toLowerCase();
  if (proxyHost === "[::1]") {
    return unsupported("ipv6-proxy-not-listening", "The native proxy listens only on IPv4 127.0.0.1, not IPv6 ::1. No IPv6 proxy URL may be synthesized.");
  }
  if (!isIpv4ProxyHost(proxyHost)) {
    return unsupported("public-proxy-not-supported", "A public native proxy requires an administrator-configured, independently authenticated HTTPS origin per device. This version does not implement or verify that deployment; an arbitrary public URL is not a supported native entry.");
  }
  if (proxy.protocol !== "http:") {
    return unsupported("loopback-protocol-not-supported", "The current loopback native proxy serves HTTP only; changing its URL to HTTPS does not create a TLS listener.");
  }
  if (proxy.pathname !== "/") {
    return unsupported("prefixed-relay-not-supported", "The current remote runtime requires an origin root for assets, APIs, workers and navigation. A URL path prefix is not a supported native relay.");
  }
  if (input.desktopGuest === true) {
    return { status: "available", transport: "desktop-guest", url: proxy.href };
  }
  if (page.protocol !== "http:" && page.protocol !== "https:") {
    return unsupported("page-protocol-not-supported", "Native embedding on this page protocol requires the verified DSH Desktop guest bridge.");
  }
  const pageHost = page.hostname.toLowerCase();
  if (!isLoopbackPage(pageHost)) {
    return unsupported("remote-browser-loopback", "The native proxy is on the DSH Host loopback address, not the remote browser machine. This browser cannot use its own 127.0.0.1 to reach that proxy. Open DSH locally over HTTP or use DSH Desktop; remote-browser native relay is not supported in this version.");
  }
  if (page.protocol === "https:") {
    return unsupported("https-http-proxy", "An HTTPS page cannot reliably embed the HTTP loopback native proxy: browser mixed-content and schemeful-site cookie policies differ. Open the local HTTP DSH page or use DSH Desktop.");
  }
  if (pageHost === "[::1]") {
    return unsupported("ipv6-parent-ipv4-proxy", "An IPv6 DSH page and the IPv4-only native proxy do not share a reliable iframe cookie site. Open DSH using 127.0.0.1 or an IPv4-resolving localhost address; the proxy does not listen on ::1.");
  }
  proxy.hostname = pageHost;
  if (proxy.origin === page.origin) {
    return unsupported("same-origin-unsafe", "Normalizing the loopback hostname would put remote HTML on the local DSH Host origin. The native proxy must use its own dedicated port.");
  }
  return { status: "available", transport: "local-browser", url: proxy.href };
}

// src/client/NativeViewport.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var useBrowserLayoutEffect = typeof window === "undefined" ? import_react7.useEffect : import_react7.useLayoutEffect;
function getDesktopBrowserBridge() {
  const desktop = globalThis.dshDesktop;
  return desktop?.protocolVersion === 1 ? desktop.browser : void 0;
}
function postWebviewVisibility(webview, visible) {
  try {
    const pending = webview.executeJavaScript?.(
      `window.postMessage(${JSON.stringify({ __dshMdVisibility: true, visible })}, '*')`
    );
    if (pending !== void 0) void pending.catch(() => {
    });
  } catch {
  }
}
function KeepAliveDeviceFrame({
  device,
  active,
  reloadCount,
  t,
  onOpenSettings
}) {
  const access = assessBrowserNativeAccess({
    pageUrl: typeof window === "undefined" ? "http://127.0.0.1:3080/" : window.location.href ?? `${window.location.protocol}//${window.location.hostname}:3080/`,
    proxyUrl: device.nativeProxyUrl,
    desktopGuest: getDesktopBrowserBridge() !== void 0
  });
  const embeddingError = access.status === "available" ? void 0 : access.message;
  const proxyUrl = access.status === "available" ? access.url : void 0;
  const targetUrl = proxyUrl === void 0 ? void 0 : (() => {
    try {
      const url = new URL(proxyUrl);
      url.searchParams.set("md_client", clientStore.clientId);
      return url.href;
    } catch {
      return proxyUrl;
    }
  })();
  const authRequired = device.authState === "required" || device.authState === "error";
  const containerRef = (0, import_react7.useRef)(null);
  const frameRef = (0, import_react7.useRef)(null);
  const activeRef = (0, import_react7.useRef)(active);
  const attemptKey = `${device.id}:${targetUrl ?? ""}:${reloadCount}`;
  const [failedAttempt, setFailedAttempt] = (0, import_react7.useState)(void 0);
  const useDesktopWebview = getDesktopBrowserBridge() !== void 0 && failedAttempt !== attemptKey;
  const [reconnectError, setReconnectError] = (0, import_react7.useState)(null);
  (0, import_react7.useEffect)(() => {
    activeRef.current = active;
  }, [active]);
  (0, import_react7.useEffect)(() => {
    if (targetUrl === void 0) return;
    const message = { __dshMdVisibility: true, visible: active };
    const postVisibility = () => {
      const wrapper = frameRef.current;
      if (wrapper === null) return;
      const iframe = wrapper.querySelector("iframe");
      if (iframe !== null) {
        let origin = "*";
        try {
          origin = new URL(targetUrl).origin;
        } catch {
        }
        try {
          iframe.contentWindow?.postMessage(message, origin);
        } catch {
        }
        return;
      }
      const webview = wrapper.querySelector("webview");
      if (webview !== null) postWebviewVisibility(webview, active);
    };
    postVisibility();
    const first = window.setTimeout(postVisibility, 150);
    const second = window.setTimeout(postVisibility, 800);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [active, targetUrl, reloadCount, useDesktopWebview]);
  (0, import_react7.useEffect)(() => {
    if (!active) return;
    const focusFrame = () => {
      const wrapper = frameRef.current;
      if (wrapper === null) return;
      const webview = wrapper.querySelector("webview");
      if (webview !== null) {
        try {
          webview.focus();
        } catch {
        }
        return;
      }
      const iframe = wrapper.querySelector("iframe");
      try {
        iframe?.contentWindow?.focus();
      } catch {
      }
    };
    focusFrame();
    const timer = window.setTimeout(focusFrame, 120);
    return () => window.clearTimeout(timer);
  }, [active]);
  (0, import_react7.useEffect)(() => {
    if (authRequired || !useDesktopWebview) return;
    const bridge = getDesktopBrowserBridge();
    const container = containerRef.current;
    if (bridge === void 0 || container === null || targetUrl === void 0) return;
    let cancelled = false;
    let currentEl;
    let lease;
    const release = () => {
      const owned = lease;
      lease = void 0;
      if (owned !== void 0) void bridge.release(owned).catch(() => {
      });
    };
    const fail = () => {
      if (!cancelled) setFailedAttempt(attemptKey);
    };
    void bridge.acquire(`multi-device:${device.id}`).then((reservation) => {
      lease = reservation.lease;
      if (cancelled || containerRef.current !== container) {
        release();
        return;
      }
      const webview = document.createElement("webview");
      currentEl = webview;
      webview.className = "dsh-md-native-iframe";
      webview.setAttribute("name", reservation.lease);
      webview.setAttribute("partition", reservation.partition);
      webview.setAttribute("allowpopups", "");
      webview.setAttribute("src", `about:blank#${reservation.lease}`);
      webview.addEventListener("did-fail-load", fail, { once: true });
      webview.addEventListener("dom-ready", () => {
        if (!cancelled) postWebviewVisibility(webview, activeRef.current);
      });
      webview.addEventListener("dom-ready", () => {
        if (cancelled) return;
        try {
          if (activeRef.current) webview.focus();
        } catch {
        }
        try {
          const wv = webview;
          if (wv.getURL?.().startsWith("about:blank#")) {
            void wv.loadURL?.(targetUrl)?.then(() => {
              if (!cancelled) postWebviewVisibility(webview, activeRef.current);
            }).catch(fail);
          }
        } catch {
          fail();
        }
      }, { once: true });
      container.appendChild(webview);
    }).catch(fail);
    return () => {
      cancelled = true;
      currentEl?.remove();
      release();
    };
  }, [device.id, targetUrl, attemptKey, authRequired, useDesktopWebview]);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    "div",
    {
      ref: frameRef,
      className: "dsh-md-native-frame-wrap",
      style: {
        display: active ? "flex" : "none",
        visibility: active ? "visible" : "hidden"
      },
      "data-device-id": device.id,
      "data-active": active ? "true" : "false",
      children: authRequired ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(AuthRequiredPanel, { device, t, onOpenSettings }) : targetUrl === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-md-native-placeholder", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.StateDot, { state: deviceStateToDotState(device.state), size: 12 }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-md-row-name", children: device.name }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-md-pref-desc", children: embeddingError !== void 0 ? embeddingError : reconnectError ?? device.lastError ?? device.targetSummary }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          import_dsh_client_ui_primitives5.Button,
          {
            variant: "primary",
            size: "sm",
            icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconRefreshOutlineRegular, { size: 13 }),
            onClick: () => {
              void clientStore.reconnectDevice(device.id).then((res) => {
                setReconnectError(res.ok ? null : res.error ?? t("actionFailed"));
              });
            },
            children: t("reconnect")
          }
        )
      ] }) : useDesktopWebview ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { ref: containerRef, className: "dsh-md-native-iframe" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "iframe",
        {
          className: "dsh-md-native-iframe",
          src: targetUrl,
          title: `DSH Native - ${device.name}`,
          allow: "clipboard-write; clipboard-read; fullscreen",
          allowFullScreen: true,
          referrerPolicy: "no-referrer",
          onLoad: (event) => {
            if (targetUrl === void 0) return;
            let origin = "*";
            try {
              origin = new URL(targetUrl).origin;
            } catch {
            }
            try {
              event.currentTarget.contentWindow?.postMessage(
                { __dshMdVisibility: true, visible: active },
                origin
              );
              if (active) event.currentTarget.contentWindow?.focus();
            } catch {
            }
          }
        },
        `${device.id}:${reloadCount}`
      )
    }
  );
}
function NativeTabBar({
  t,
  onOpenSettings
}) {
  const state = useMultiDeviceState();
  const { devices } = state.snapshot;
  const [layout, setLayout] = (0, import_react7.useState)(void 0);
  const [obstructed, setObstructed] = (0, import_react7.useState)(void 0);
  const barRef = (0, import_react7.useRef)(null);
  const trailingRef = (0, import_react7.useRef)(null);
  useBrowserLayoutEffect(() => {
    if (typeof window === "undefined") return;
    let frame;
    let frameObserver;
    const resolveFrame = () => {
      const shell = document.querySelector("[data-shell-overlay]")?.parentElement;
      return shell instanceof HTMLElement ? shell : void 0;
    };
    const measure = () => {
      const next = resolveFrame();
      if (next !== void 0 && next !== frame) {
        frame = next;
        frameObserver?.disconnect();
        frameObserver = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(measure);
        frameObserver?.observe(next);
      }
      const rect = frame?.getBoundingClientRect();
      const chromeTop = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--dsh-frame-chrome-top")
      );
      const resolved = resolveBarLayout({
        frameLeft: rect?.left ?? 0,
        frameTop: rect?.top ?? 0,
        frameWidth: rect?.width ?? 0,
        viewportWidth: window.innerWidth,
        chromeTop: Number.isFinite(chromeTop) ? chromeTop : 0
      });
      setLayout((previous) => previous !== void 0 && previous.left === resolved.left && previous.top === resolved.top && previous.width === resolved.width && previous.compact === resolved.compact ? previous : resolved);
      recordNativeBarMetrics(measureNativeBar({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        left: resolved.left,
        // Diagnostics reports the frame extent the bar *would* take, so a
        // clipped frame still shows up as clipped after the box is clamped.
        width: rect?.width ?? resolved.width
      }));
    };
    measure();
    window.addEventListener("resize", measure);
    const hostObserver = typeof MutationObserver === "undefined" ? void 0 : new MutationObserver(measure);
    hostObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-fullscreen", "data-platform", "data-windows-titlebar"]
    });
    return () => {
      window.removeEventListener("resize", measure);
      frameObserver?.disconnect();
      hostObserver?.disconnect();
      recordNativeBarMetrics(void 0);
    };
  }, []);
  (0, import_react7.useEffect)(() => {
    if (layout === void 0) return;
    if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") return;
    const probe = () => {
      const element = trailingRef.current;
      const barElement = barRef.current;
      if (element === null || barElement === null) {
        setObstructed(void 0);
        recordNativeBarObstruction(void 0);
        return;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const detail = hit === null || barElement.contains(hit) ? void 0 : describeObstruction(hit);
      setObstructed((previous) => previous === detail ? previous : detail);
      recordNativeBarObstruction(detail === void 0 ? void 0 : { detail, updatedAt: Date.now() });
    };
    const handle = requestAnimationFrame(probe);
    return () => cancelAnimationFrame(handle);
  }, [layout, devices.length, state.activeNativeDeviceId]);
  const attentionByDevice = state.snapshot.attentionByDevice;
  const unread = attentionByDevice !== void 0 ? attentionUnreadIds(attentionByDevice) : countableUnreadIds(
    state.snapshot.unreadSessionIds,
    state.snapshot.archivedSessionIds,
    state.snapshot.subagentSessionIds
  );
  const unreadByDevice = groupUnreadSessionIds(unread);
  const activeDevice = devices.find((device) => device.id === state.activeNativeDeviceId);
  const localActive = activeDevice === void 0;
  const compact = layout?.compact === true;
  const clipped = layout?.clipped === true;
  const settingsButton = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Tooltip, { label: t("settingsSectionTitle"), side: "bottom", align: compact ? "start" : "end", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    import_dsh_client_ui_primitives5.Button,
    {
      variant: "ghost",
      size: "icon",
      "aria-label": t("settingsSectionTitle"),
      onClick: onOpenSettings,
      children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconSettingsOutlineRegular, { size: 14 })
    }
  ) });
  const bar = /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "div",
    {
      className: "dsh-md-native-bar",
      ref: barRef,
      "data-compact": compact ? "true" : "false",
      "data-clipped": clipped ? "true" : "false",
      "data-obstructed": obstructed ?? "false",
      "data-mode": "native",
      style: layout === void 0 ? void 0 : { left: `${layout.left}px`, top: `${layout.top}px`, width: `${layout.width}px` },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-md-native-tabs", role: "tablist", "aria-label": t("nativeTabsLabel"), children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-md-native-tab-item", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              import_dsh_client_ui_primitives5.Pill,
              {
                active: localActive,
                role: "tab",
                "aria-selected": localActive,
                onClick: () => clientStore.selectLocalNativeTab(),
                children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "dsh-md-pill-inner", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconGlobeOutlineRegular, { size: 13 }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t("nativeLocalTab") })
                ] })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              AttentionDetails,
              {
                view: attentionByDevice?.[LOCAL_DEVICE_ID],
                deviceName: t("nativeLocalTab"),
                t,
                nativeBar: true,
                fallback: { unreadSessionIds: unreadByDevice.get(LOCAL_DEVICE_ID) ?? EMPTY_UNREAD_SESSION_IDS, fresh: attentionByDevice === void 0 }
              }
            )
          ] }),
          devices.map((dev) => {
            const isSelected = dev.id === state.activeNativeDeviceId;
            const isKeptAlive = state.keepAliveDeviceIds.includes(dev.id);
            return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-md-native-tab-item", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                import_dsh_client_ui_primitives5.Pill,
                {
                  active: isSelected,
                  role: "tab",
                  "aria-selected": isSelected,
                  title: dev.latencyMs !== void 0 ? `${dev.name} \xB7 ${dev.latencyMs}ms` : dev.name,
                  onClick: () => {
                    void clientStore.selectNativeDevice(dev.id);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "dsh-md-pill-inner", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.StateDot, { state: deviceStateToDotState(dev.state), size: 8 }),
                    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-md-pill-name", children: dev.name })
                  ] })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                AttentionDetails,
                {
                  view: attentionByDevice?.[dev.id],
                  deviceName: dev.name,
                  t,
                  nativeBar: true,
                  fallback: {
                    runningCount: attentionByDevice === void 0 ? dev.runningSessionCount : void 0,
                    pendingCount: attentionByDevice === void 0 ? dev.pendingApprovalCount : void 0,
                    unreadSessionIds: unreadByDevice.get(dev.id) ?? EMPTY_UNREAD_SESSION_IDS,
                    fresh: attentionByDevice === void 0 && dev.state === "connected" && dev.catalogStale !== true
                  }
                }
              ),
              dev.keepNativeAlive !== false && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-md-tab-action-slot", children: isKeptAlive && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Tooltip, { label: t("releaseKeepAlive"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                import_dsh_client_ui_primitives5.Button,
                {
                  variant: "ghost",
                  size: "icon",
                  "aria-label": t("releaseKeepAlive"),
                  onClick: () => clientStore.releaseKeepAliveDevice(dev.id),
                  children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconCloseOutlineRegular, { size: 12 })
                }
              ) }) })
            ] }, dev.id);
          })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-md-native-bar-trailing", ref: trailingRef, children: [
          activeDevice !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-md-native-bar-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Tooltip, { label: t("reloadPage"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              import_dsh_client_ui_primitives5.Button,
              {
                variant: "ghost",
                size: "icon",
                "aria-label": t("reloadPage"),
                onClick: () => clientStore.reloadNativeDevice(activeDevice.id),
                children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconRefreshOutlineRegular, { size: 14 })
              }
            ) }),
            (activeDevice.nativeProxyUrl ?? activeDevice.effectiveBaseUrl) !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Tooltip, { label: t("openExternal"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              import_dsh_client_ui_primitives5.Button,
              {
                variant: "ghost",
                size: "icon",
                "aria-label": t("openExternal"),
                onClick: () => {
                  const access = assessBrowserNativeAccess({ pageUrl: window.location.href, proxyUrl: activeDevice.nativeProxyUrl, desktopGuest: getDesktopBrowserBridge() !== void 0 });
                  if (access.status === "available") window.open(access.url, "_blank", "noopener,noreferrer");
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconRightUpOutlineRegular, { size: 14 })
              }
            ) })
          ] }),
          settingsButton
        ] })
      ]
    }
  );
  return typeof document === "undefined" ? bar : (0, import_react_dom.createPortal)(bar, document.body);
}
function NativeViewport({
  t,
  onOpenSettings
}) {
  const state = useMultiDeviceState();
  const { devices } = state.snapshot;
  const activeDevice = devices.find((device) => device.id === state.activeNativeDeviceId);
  const stageRef = (0, import_react7.useRef)(null);
  const previousStates = (0, import_react7.useRef)(/* @__PURE__ */ new Map());
  (0, import_react7.useEffect)(() => {
    const prevMap = previousStates.current;
    const nextMap = /* @__PURE__ */ new Map();
    for (const dev of devices) {
      nextMap.set(dev.id, dev.state);
      const prevState = prevMap.get(dev.id);
      if (prevState !== void 0 && prevState !== "connected" && dev.state === "connected" && (dev.nativePaneState === "idle" || dev.nativePaneState === "failed" || dev.nativePaneState === void 0) && (state.keepAliveDeviceIds.includes(dev.id) || activeDevice?.id === dev.id)) {
        clientStore.reloadNativeDevice(dev.id);
      }
    }
    previousStates.current = nextMap;
  }, [devices, state.keepAliveDeviceIds, activeDevice?.id]);
  const mountedDeviceIds = new Set(state.keepAliveDeviceIds);
  if (activeDevice !== void 0) mountedDeviceIds.add(activeDevice.id);
  const mountedDevices = devices.filter((device) => mountedDeviceIds.has(device.id));
  const stageVisible = activeDevice !== void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "div",
    {
      ref: stageRef,
      className: "dsh-md-native-stage",
      "data-visible": stageVisible ? "true" : "false",
      "data-bridge": activeDevice?.nativePaneState ?? "idle",
      "aria-hidden": !stageVisible,
      children: [
        activeDevice !== void 0 && activeDevice.nativePaneState === "failed" && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-md-bridge-failed", role: "status", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconWarningOutlineRegular, { size: 16 }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-md-bridge-failed-text", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-md-bridge-failed-title", children: t("bridgeFailedTitle").replace("{name}", activeDevice.name) }),
            activeDevice.nativePaneError !== void 0 && activeDevice.nativePaneError !== "" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-md-bridge-failed-error", title: activeDevice.nativePaneError, children: t("bridgeFailedError").replace("{error}", activeDevice.nativePaneError) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            import_dsh_client_ui_primitives5.Button,
            {
              variant: "outline",
              size: "sm",
              icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconRefreshOutlineRegular, { size: 14 }),
              onClick: () => clientStore.reloadNativeDevice(activeDevice.id),
              children: t("bridgeFailedReload")
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-md-native-stage-body", children: mountedDevices.map((device) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          KeepAliveDeviceFrame,
          {
            device,
            active: stageVisible && device.id === activeDevice?.id,
            reloadCount: state.reloadCounters[device.id] ?? 0,
            t,
            onOpenSettings
          },
          device.id
        )) })
      ]
    }
  );
}

// src/client/NativeOverlay.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var FRAME_NATIVE_CLASS = "dsh-md-frame-native";
var FRAME_DESKTOP_CLASS = "dsh-md-frame-desktop";
var useBrowserLayoutEffect2 = typeof window === "undefined" ? import_react8.useEffect : import_react8.useLayoutEffect;
function isDesktopRuntime() {
  const desktop = globalThis.dshDesktop;
  return desktop?.protocolVersion === 1;
}
function NativeOverlay({
  t,
  onOpenSettings
}) {
  const state = useMultiDeviceState();
  const layerRef = (0, import_react8.useRef)(null);
  useBrowserLayoutEffect2(() => {
    const frame = layerRef.current?.closest("[data-shell-overlay]")?.parentElement;
    if (!(frame instanceof HTMLElement)) return;
    frame.classList.add(FRAME_NATIVE_CLASS);
    frame.classList.toggle(FRAME_DESKTOP_CLASS, isDesktopRuntime());
    return () => {
      frame.classList.remove(FRAME_NATIVE_CLASS);
      frame.classList.remove(FRAME_DESKTOP_CLASS);
    };
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { ref: layerRef, className: "dsh-md-native-layer", "data-native": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NativeTabBar, { t, onOpenSettings }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NativeViewport, { t, onOpenSettings })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      import_dsh_client_ui_primitives6.Modal,
      {
        open: state.settingsModalOpen,
        onClose: () => clientStore.setSettingsModalOpen(false),
        title: t("settingsSectionTitle"),
        closeLabel: t("close"),
        className: "dsh-md-fallback-modal",
        children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
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

// src/client/readState.ts
function existingSessionStatusNotifier(service) {
  const listeners = service?.statusListeners;
  if (!(listeners instanceof Set) || [...listeners].some((listener) => typeof listener !== "function")) {
    console.warn("[dsh-multi-device] DSH session-status notification bridge unavailable; reload the page to enable the unread overlay for existing views.");
    return void 0;
  }
  return (alreadyNotified) => {
    for (const listener of [...listeners]) {
      if (typeof listener !== "function" || alreadyNotified.has(listener)) continue;
      try {
        listener();
      } catch {
      }
    }
  };
}
function mergeSessionStatus(base, unread, shouldOverride) {
  const next = /* @__PURE__ */ new Map();
  if (base === void 0) return next;
  if (unread === void 0) {
    for (const [sessionId, value] of base) next.set(sessionId, value);
    return next;
  }
  for (const [sessionId, value] of base) {
    if (!shouldOverride(sessionId)) {
      next.set(sessionId, value);
      continue;
    }
    const shouldBeUnread = unread.has(sessionId);
    if (value.completionUnread === shouldBeUnread) {
      next.set(sessionId, value);
    } else {
      next.set(sessionId, { ...value, completionUnread: shouldBeUnread });
    }
  }
  return next;
}
function sameStatusMap(left, right) {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const [sessionId, value] of left) {
    const candidate = right.get(sessionId);
    if (candidate === void 0 || candidate.running !== value.running || candidate.pendingInteraction !== value.pendingInteraction || candidate.completionUnread !== value.completionUnread) {
      return false;
    }
  }
  return true;
}
function installReadStateOverlay(options) {
  const source = options.source;
  if (source === void 0) return () => {
  };
  const originalGet = source.getSnapshot;
  const originalSubscribe = source.subscribe;
  if (typeof originalGet !== "function" || typeof originalSubscribe !== "function") {
    return () => {
    };
  }
  const listeners = /* @__PURE__ */ new Set();
  let cache;
  let disposed = false;
  const invalidate = () => {
    cache = void 0;
    const notified = new Set(listeners);
    for (const listener of notified) {
      try {
        listener();
      } catch {
      }
    }
    options.notifyExistingSubscribers?.(notified);
  };
  source.getSnapshot = () => {
    const next = mergeSessionStatus(
      originalGet.call(source),
      options.getUnread(),
      options.shouldOverride
    );
    if (cache !== void 0 && sameStatusMap(cache, next)) return cache;
    cache = next;
    return cache;
  };
  source.subscribe = (listener) => {
    const offBase = originalSubscribe.call(source, listener);
    listeners.add(listener);
    return () => {
      try {
        offBase();
      } catch {
      }
      listeners.delete(listener);
    };
  };
  const offReadState = options.subscribeReadState(invalidate);
  invalidate();
  return () => {
    if (disposed) return;
    disposed = true;
    try {
      offReadState();
    } catch {
    }
    source.getSnapshot = originalGet;
    source.subscribe = originalSubscribe;
    invalidate();
    listeners.clear();
  };
}

// src/client/styles.ts
var STYLE_TAG_ID = "dsh-multi-device/styles.css";
var CSS_TEXT = `

/* Settings Section Layout (aligned with @deepseek-ai/dsh-client-ui-settings-models & general) */
.dsh-md-section {
  width: 100%;
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
  flex-wrap: wrap;
  gap: 12px 24px;
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

.dsh-md-devices-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 14px;
}

.dsh-md-devices-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 2px;
}

.dsh-md-devices-heading-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsh-md-devices-heading {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
}

.dsh-md-devices-count-pill {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-bg-layer-3));
  color: var(--dsw-alias-label-secondary);
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
  gap: 6px 10px;
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
  flex-wrap: wrap;
  gap: 6px;
  margin-left: auto;
  flex-shrink: 0;
}

.dsh-md-icon-actions-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.dsh-md-device-endpoint {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-family: var(--ds-font-family-code);
  padding: 1px 6px;
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-secondary);
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsh-md-latency-text {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  font-family: var(--ds-font-family-code);
}

.dsh-md-session-count-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-selected, rgba(103, 158, 254, 0.12));
  color: var(--dsw-alias-state-business-primary, #679efe);
}

.dsh-md-auth-required-tag {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-interactive-bg-hover-warning, rgba(245, 158, 11, 0.12));
  color: var(--dsw-alias-state-warn-label, #f59e0b);
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
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
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

/* DSH Design Compliant Select Dropdown */
.dsh-md-select-container {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}

.dsh-md-select-container.isCompact {
  width: auto;
  min-width: 160px;
  max-width: min(320px, 100%);
}

.dsh-md-select-trigger {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  padding: 0 8px 0 10px;
  gap: 8px;
  border-radius: var(--dsw-radius-md, 8px);
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
  text-align: start;
  transition: border-color 0.12s ease, background-color 0.12s ease;
}

.dsh-md-select-container.isCompact .dsh-md-select-trigger {
  height: 28px;
  padding: 0 6px 0 8px;
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-select-trigger:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l1);
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-select-trigger:focus-visible,
.dsh-md-select-container.isOpen .dsh-md-select-trigger {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.dsh-md-select-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dsh-md-select-trigger-content {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  flex: 1 1 auto;
}

.dsh-md-select-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-md-select-label.isPlaceholder {
  color: var(--dsw-alias-label-tertiary);
}

.dsh-md-select-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary));
  transition: transform 0.15s ease;
}

.dsh-md-select-arrow.isOpen {
  transform: rotate(180deg);
}

.dsh-md-select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  width: max-content;
  max-width: min(380px, 90vw);
  max-height: 240px;
  overflow-y: auto;
  z-index: 960;
  box-sizing: border-box;
  padding: 4px;
  border-radius: var(--dsw-radius-lg, 10px);
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-elevation-prominent);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dsh-md-select-container.isCompact .dsh-md-select-dropdown {
  left: auto;
  right: 0;
}

.dsh-md-select-empty {
  padding: 8px 10px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}

.dsh-md-select-option {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.dsh-md-select-option:hover:not(.isDisabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-select-option.isSelected {
  background: var(--dsw-alias-interactive-bg-selected, rgba(103, 158, 254, 0.08));
}

.dsh-md-select-option.isDisabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dsh-md-select-option-main {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.dsh-md-select-option-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 auto;
}

.dsh-md-select-option-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-bg-layer-4);
  color: var(--dsw-alias-label-secondary);
  flex: none;
}

.dsh-md-select-option-desc {
  font-size: 11px;
  font-family: var(--ds-font-family-code);
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 2px;
}

.dsh-md-select-check-wrap {
  display: inline-flex;
  align-items: center;
  color: var(--dsw-alias-brand-primary, #679efe);
  flex: none;
  margin-left: auto;
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
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
}

/* Native Mode tab bar, host-frame reservation and keep-alive stage */
html {
  --dsh-md-native-bar-height: 42px;
  --dsh-md-native-bar-top: var(--dsh-frame-chrome-top, 0px);
}

/* macOS Desktop keeps its traffic lights and the collapsed-sidebar leading
 * controls in the reserved title area; place the tab strip below that area.
 * Browser-hosted DSH on macOS has no such native title area and keeps 0. */
html[data-platform='darwin'] .dsh-md-frame-native.dsh-md-frame-desktop {
  --dsh-md-native-bar-top: var(--dsh-frame-top-clearance, 48px);
}

/* Keep macOS collapsed-sidebar window-chrome controls above the overlay */
[data-shell-leading] {
  z-index: 25 !important;
}

/* While resizing the local sidebar/rightbar, prevent iframes from swallowing pointer events */
[data-dragging] .dsh-md-native-stage {
  pointer-events: none !important;
}

.dsh-md-native-layer {
  position: absolute;
  inset: 0;
  z-index: 21;
  pointer-events: none;
}

.dsh-md-native-layer > * {
  pointer-events: auto;
}

/*
 * Reserve the tab-strip height inside the Host frame, below the platform
 * titlebar. !important is intentional: the layout plugin writes its own
 * padding-top for the Windows caption row.
 */
.dsh-md-frame-native {
  box-sizing: border-box;
  padding-top: calc(var(--dsh-md-native-bar-top) + var(--dsh-md-native-bar-height)) !important;
}

.dsh-md-native-bar {
  /* Portalled onto <body>: the Host's shell overlay is a stacking context
   * (z-index 20) sitting under its own in-frame chrome (leading seat 25,
   * sidebar toggle 30), and the frame clips overflow. Fixed positioning plus
   * this z-index keeps the Settings entry above every in-frame seat while
   * staying below Tooltip/HoverCard (100), Modal (1000) and Menu (1100).
   * left/top/width are written inline from the measured Host frame; the
   * values here are only the pre-measurement fallback. */
  position: fixed;
  top: var(--dsh-md-native-bar-top);
  left: 0;
  right: auto;
  bottom: auto;
  width: 100vw;
  max-width: 100vw;
  height: var(--dsh-md-native-bar-height);
  box-sizing: border-box;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

/* Compact bars only tighten the gap and padding. The Settings entry stays in the
 * trailing cluster at every width: moving it across the strip at 720px re-flowed
 * every tab, and the bar's width is already clamped to the visible viewport. */
.dsh-md-native-bar[data-compact='true'] {
  gap: 6px;
  padding: 0 8px;
}

.dsh-md-native-bar[data-compact='true'] .dsh-md-native-tabs {
  gap: 4px;
}

/*
 * Everything right of the tab strip. flex:none + margin-inline-start:auto
 * keeps the Settings entry out of the strip's scroll area: the tabs shrink
 * and scroll, this cluster never does.
 */
.dsh-md-native-bar-trailing {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
  margin-inline-start: auto;
}

.dsh-md-native-mode-switch-wrap {
  display: inline-flex;
  align-items: center;
  flex: none;
}

/* Diagnostics card in Settings \u2192 Multi-Device */
.dsh-md-diagnostics {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 0;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}

.dsh-md-diagnostics-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.dsh-md-diagnostics-mode {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-diagnostics-output {
  box-sizing: border-box;
  margin: 0;
  padding: 12px;
  max-height: 320px;
  overflow: auto;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  line-height: 16px;
  white-space: pre-wrap;
  word-break: break-word;
}

/*
 * The bar is portalled onto <body>, where the Host forces
 * body > :not(#root) { -webkit-app-region: no-drag }. !important restores the
 * drag affordance this strip provides in place of the macOS title bar; the
 * buttons inside opt back out below.
 */
html[data-platform='darwin'] body > .dsh-md-native-bar,
html[data-platform='darwin'] .dsh-md-native-bar {
  -webkit-app-region: drag !important;
}

.dsh-md-native-bar button,
.dsh-md-native-bar [role='button'],
.dsh-md-native-bar [role='tab'] {
  -webkit-app-region: no-drag;
}

.dsh-md-native-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  /* Shrinks and scrolls; the trailing cluster beside it never does. */
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.dsh-md-native-tabs::-webkit-scrollbar {
  display: none;
}

.dsh-md-native-bar-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

/* Separates the device actions from the rightmost mode switch. */
.dsh-md-native-bar-sep {
  width: 1px;
  height: 18px;
  flex: none;
  background: var(--dsw-alias-border-l2);
}

.dsh-md-native-tab-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

/*
 * The keep-alive release button lives in a slot that exists for every device
 * that can be kept alive, not only for the ones currently mounted. Adding it on
 * the first click resized the tab and shifted every tab beside it.
 */
.dsh-md-tab-action-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
}

.dsh-md-pill-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* Long device names must not push the trailing cluster off the bar. */
.dsh-md-pill-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * Attention chips: a number with a category icon, never a sentence. Every
 * category owns a slot of this exact width whether or not it has members, and
 * the freshness marker is a dot instead of a text chip, so a Session starting
 * or finishing never changes the strip's geometry.
 */
html {
  --dsh-md-attention-slot-width: 30px;
}
.dsh-md-attention {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

/* Menu wraps its anchor in a span; keep the chip inline with the pill. */
.dsh-md-attention > span {
  display: inline-flex;
  align-items: center;
}

/* Freshness marker and the empty slot that replaces it share one box, so a
 * snapshot flipping between cached and live cannot resize the tab. */
.dsh-md-attention-stale,
.dsh-md-attention-stale-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 8px;
  height: 20px;
  flex: none;
}

.dsh-md-attention-stale-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-state-warn-primary);
}

/* Reserved space for an empty category. Same width as a chip, invisible. */
.dsh-md-attention-slot {
  display: inline-flex;
  width: var(--dsh-md-attention-slot-width, 30px);
  height: 20px;
  flex: none;
}

.dsh-md-attention-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  box-sizing: border-box;
  width: var(--dsh-md-attention-slot-width, 30px);
  height: 20px;
  padding: 0;
  overflow: hidden;
  flex: none;
  border: 0.5px solid transparent;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-selected, rgba(103, 158, 254, 0.12));
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: border-color 0.12s ease, background-color 0.12s ease;
}

.dsh-md-attention-chip:hover {
  border-color: var(--dsw-alias-border-l2);
}

.dsh-md-attention-chip[data-open='true'] {
  border-color: var(--dsw-alias-border-l1);
}

.dsh-md-attention-chip:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}

.dsh-md-attention-chip[data-category='pending'] {
  color: var(--dsw-alias-state-warn-primary);
  background: transparent;
}

.dsh-md-attention-count {
  font-weight: 500;
}

/* The menu surface and rows are rendered by the Host's Menu; only the two
 * text lines inside a row are ours. */
.dsh-md-attention-menu {
  min-width: 260px;
  max-width: min(420px, calc(100vw - 24px));
}

.dsh-md-attention-row {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.dsh-md-attention-row-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-md-attention-row-title.isId {
  color: var(--dsw-alias-label-tertiary);
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
}

.dsh-md-attention-row-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 15px;
}

.dsh-md-attention-note {
  padding: 6px 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-muted {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dsh-md-pending {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--dsw-alias-state-warn-primary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dsh-md-native-stage {
  position: absolute;
  top: calc(var(--dsh-md-native-bar-top) + var(--dsh-md-native-bar-height));
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  pointer-events: auto;
}

.dsh-md-native-stage[data-visible='false'] {
  display: none;
  pointer-events: none;
}

.dsh-md-native-stage-body {
  position: relative;
  flex: 1;
  min-height: 0;
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

.dsh-md-auth-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: auto;
}

.dsh-md-auth-card {
  box-sizing: border-box;
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-panel);
}

.dsh-md-auth-badge {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-state-warn-tertiary, var(--dsw-alias-bg-layer-3));
  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary));
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-auth-title {
  margin: 2px 0 0;
  color: var(--dsw-alias-label-primary);
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
}

.dsh-md-auth-desc {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}

.dsh-md-auth-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.dsh-md-auth-hint {
  margin: 2px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

/* Bridge-failed banner at the top of the native stage: a failed bridge used
   to leave a blank stage with no explanation and no recovery action. */
.dsh-md-bridge-failed {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-secondary));
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-bridge-failed-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.dsh-md-bridge-failed-title {
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}

.dsh-md-bridge-failed-error {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dsh-md-fallback-modal {
  width: min(740px, 100%);
}

@media (max-width: 560px) {
  .dsh-md-pref-row {
    align-items: flex-start;
  }

  .dsh-md-editor-top {
    align-items: stretch;
  }

  .dsh-md-editor-footer {
    align-items: stretch;
  }

  .dsh-md-editor-footer-left,
  .dsh-md-editor-footer-right {
    width: 100%;
  }

  .dsh-md-editor-footer-right {
    justify-content: flex-end;
  }

  .dsh-md-auth-card {
    padding: 18px;
  }
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

// src/client/windowTitle.ts
var MAX_TITLE_LENGTH = 300;
function cleanTitle2(value) {
  if (typeof value !== "string") return void 0;
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
  return text === "" ? void 0 : text;
}
function resolveWindowTitle(input) {
  if (input.activeNativeDeviceId === void 0) return void 0;
  const device = input.devices.find((candidate) => candidate.id === input.activeNativeDeviceId);
  if (device === void 0) return void 0;
  const remoteTitle = device.state === "connected" ? cleanTitle2(device.nativePaneTitle) : void 0;
  return remoteTitle ?? cleanTitle2(device.name);
}
var DocumentTitleController = class {
  titleDescriptor;
  ownPropertyInstalled = false;
  baseTitle = "";
  override;
  observer;
  installed = false;
  install() {
    if (this.installed) return true;
    if (typeof document === "undefined") return false;
    this.installed = true;
    let cursor = document;
    let descriptor;
    while (cursor !== null) {
      descriptor = Object.getOwnPropertyDescriptor(cursor, "title");
      if (descriptor?.get !== void 0 && descriptor.set !== void 0) break;
      cursor = Object.getPrototypeOf(cursor);
    }
    if (descriptor?.get !== void 0 && descriptor.set !== void 0) {
      this.titleDescriptor = descriptor;
      try {
        this.baseTitle = String(descriptor.get.call(document));
        const self = this;
        Object.defineProperty(document, "title", {
          configurable: true,
          enumerable: descriptor.enumerable === true,
          get() {
            return self.titleDescriptor?.get?.call(document) ?? document.title;
          },
          set(value) {
            const text = String(value);
            if (self.override === void 0 || text !== self.override) self.baseTitle = text;
            if (self.override === void 0) self.titleDescriptor?.set?.call(document, text);
          }
        });
        this.ownPropertyInstalled = true;
        return true;
      } catch {
        this.titleDescriptor = void 0;
      }
    }
    this.baseTitle = document.title;
    if (typeof MutationObserver === "undefined") return false;
    try {
      this.observer = new MutationObserver(() => {
        if (this.override !== void 0 && document.title !== this.override) {
          document.title = this.override;
        }
      });
      this.observer.observe(document.head ?? document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true
      });
      return true;
    } catch {
      return false;
    }
  }
  apply(next) {
    if (!this.installed) return;
    const normalized = next === void 0 ? void 0 : cleanTitle2(next);
    if (normalized === this.override) return;
    this.override = normalized;
    const value = normalized ?? this.baseTitle;
    try {
      this.titleDescriptor?.set?.call(document, value);
    } catch {
      try {
        document.title = value;
      } catch {
      }
    }
  }
  dispose() {
    this.observer?.disconnect();
    this.observer = void 0;
    if (this.ownPropertyInstalled) {
      try {
        Reflect.deleteProperty(document, "title");
      } catch {
      }
      this.ownPropertyInstalled = false;
    }
    this.override = void 0;
    try {
      document.title = this.baseTitle;
    } catch {
    }
    this.installed = false;
  }
};
function installWindowTitle() {
  const controller = new DocumentTitleController();
  if (!controller.install()) return () => {
  };
  const sync = () => {
    const state = clientStore.getSnapshot();
    try {
      controller.apply(resolveWindowTitle({
        ...state.activeNativeDeviceId !== void 0 ? { activeNativeDeviceId: state.activeNativeDeviceId } : {},
        devices: state.snapshot.devices
      }));
    } catch {
    }
  };
  const unsubscribe = clientStore.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    controller.dispose();
  };
}

// src/client/index.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
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
function currentMainSessionId(list) {
  for (const sessionId of list.ids) {
    const summary = list.byId[sessionId];
    if ((summary?.retainedBy?.mainView ?? 0) > 0) return sessionId;
  }
  return void 0;
}
function installLocalSessionTracking(source) {
  const ctx = {
    sessions: source.sessions,
    layout: source.layout ?? source.get?.("layout"),
    get: source.get?.bind(source)
  };
  const resolveLayout = () => ctx.layout ?? ctx.get?.("layout");
  const isGlobalPanelActive = () => {
    try {
      const activePanelId = resolveLayout()?.panelInfo?.getSnapshot()?.activePanelId;
      return activePanelId !== void 0 && activePanelId !== null;
    } catch {
      return false;
    }
  };
  const syncMainSession = () => {
    const list = ctx.sessions?.list.getSnapshot();
    const current2 = list === void 0 ? void 0 : currentMainSessionId(list);
    clientStore.setMainViewVisible(!isGlobalPanelActive());
    if (isGlobalPanelActive()) return current2;
    if (current2 !== void 0) {
      void clientStore.reportLocalMainSession(current2);
    }
    return current2;
  };
  const unsubscribeSessions2 = ctx.sessions?.list.subscribe?.(() => {
    syncMainSession();
  });
  const unsubscribePanelInfo = resolveLayout()?.panelInfo?.subscribe?.(() => {
    syncMainSession();
  });
  syncMainSession();
  return () => {
    unsubscribeSessions2?.();
    unsubscribePanelInfo?.();
  };
}
function apply(ctx) {
  try {
    applyClient(ctx);
  } catch (error) {
    console.error("[dsh-multi-device] client entry failed to activate", error);
    throw error;
  }
}
function applyClient(ctx) {
  adoptMultiDeviceStyles();
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), "dsh-multi-device: locales");
  ctx.effect(() => clientStore.start(), "dsh-multi-device: client-store");
  ctx.effect(() => installWindowTitle(), "dsh-multi-device: window title");
  const getTranslate = () => {
    try {
      return ctx.locale.bind?.(LOCALE_NS) ?? translateFallback;
    } catch {
      return translateFallback;
    }
  };
  const handleOpenSettings = () => {
    openSettingsSection(ctx, SETTINGS_SECTION_ID);
  };
  ctx.inject(["sessions", "uiWorkspace"], (serviceCtx) => {
    serviceCtx.effect(
      () => bindClientServices({
        ...serviceCtx.sessions !== void 0 ? { sessions: serviceCtx.sessions } : {},
        ...serviceCtx.uiWorkspace !== void 0 ? { uiWorkspace: serviceCtx.uiWorkspace } : {}
      }),
      "dsh-multi-device: client services"
    );
  });
  ctx.inject(["sessions", "layout"], (trackCtx) => {
    trackCtx.effect(
      () => installLocalSessionTracking(trackCtx),
      "dsh-multi-device: local session tracking"
    );
  });
  ctx.inject(["uiSession"], (readCtx) => {
    readCtx.effect(() => {
      const service = readCtx.uiSession ?? readCtx.get?.("uiSession");
      return installReadStateOverlay({
        source: service?.sessionStatus,
        notifyExistingSubscribers: service === void 0 ? void 0 : existingSessionStatusNotifier(service),
        getUnread: () => {
          const snapshot = clientStore.getSnapshot();
          if (snapshot.snapshot.revision === 0) return void 0;
          return new Set(snapshot.snapshot.unreadSessionIds ?? []);
        },
        subscribeReadState: (listener) => clientStore.subscribe(listener),
        shouldOverride: () => true
      });
    }, "dsh-multi-device: device unread overlay");
  });
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
      (props) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
        return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(MultiDeviceHubPanel, { t, hideHeader: true });
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
      (props) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        NativeOverlay,
        {
          t: props.t ?? getTranslate(),
          onOpenSettings: handleOpenSettings
        }
      )
    )
  );
}
return module.exports; } });
//# sourceMappingURL=client.js.map

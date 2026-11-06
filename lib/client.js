window.__ModuleLoader__.load({ id: 'dsh-multi-device', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
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
var import_react9 = require("react");

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
function unescapeSegment(value) {
  return value.replaceAll("%7E", "~").replaceAll("%25", "%");
}

// src/client/locales.ts
var LOCALE_NS = "multiDevice";
var zh = {
  settingsSectionTitle: "\u591A\u8BBE\u5907",
  settingsSectionIntro: "\u901A\u8FC7 SSH \u96A7\u9053\u8FDE\u63A5\u8FDC\u7AEF\u5F00\u53D1\u673A\u3002\u805A\u5408\u6A21\u5F0F\u53EA\u5728\u4FA7\u8FB9\u680F\u5408\u5E76\u4F1A\u8BDD\uFF1B\u539F\u751F\u6A21\u5F0F\u7528\u9876\u90E8\u6807\u7B7E\u9875\u663E\u793A\u672C\u673A\u4E0E\u5404\u8FDC\u7AEF\u8BBE\u5907\u7684\u5B8C\u6574\u754C\u9762\u3002",
  pluginSummary: "\u8FDE\u63A5\u591A\u53F0\u8FDC\u7AEF DSH \u5F00\u53D1\u673A\uFF0C\u652F\u6301\u8DE8\u673A\u5DE5\u4F5C\u533A\u805A\u5408\u4E0E\u539F\u751F\u754C\u9762\u6807\u7B7E\u9875\u3002",
  close: "\u5173\u95ED",
  modeRowTitle: "\u754C\u9762\u6A21\u5F0F",
  modeRowDesc: "\u805A\u5408\u6A21\u5F0F\u5728\u4FA7\u8FB9\u680F\u5408\u5E76\u6240\u6709\u8BBE\u5907\u7684\u4F1A\u8BDD\uFF0C\u9996\u9875\u4E0D\u63D0\u4F9B\u8BBE\u5907\u5165\u53E3\uFF1B\u539F\u751F\u6A21\u5F0F\u9876\u90E8\u5E38\u9A7B\u6807\u7B7E\u9875\uFF0C\u672C\u673A\u4EC5\u663E\u793A\u672C\u5730\u6570\u636E\u3002",
  modeAggregated: "\u805A\u5408\u6A21\u5F0F",
  modeNative: "\u539F\u751F\u6A21\u5F0F",
  nativeLocalTab: "\u672C\u673A",
  nativeTabsLabel: "\u539F\u751F\u6A21\u5F0F\u8BBE\u5907\u6807\u7B7E\u9875",
  gitAutoTitle: "\u81EA\u52A8\u805A\u5408\u76F8\u540C Git \u4ED3\u5E93",
  gitAutoDesc: "\u5C06\u4E0D\u540C\u8BBE\u5907\u4E0A\u6307\u5411\u540C\u4E00 Git \u8FDC\u7AEF\u7684\u5DE5\u4F5C\u533A\u5408\u5E76\u5C55\u793A\u4F1A\u8BDD\uFF0C\u4E0D\u4F1A\u540C\u6B65\u6216\u4FEE\u6539\u4EFB\u4F55\u9879\u76EE\u6587\u4EF6\u3002",
  gitMatchTitle: "\u8DE8\u8BBE\u5907\u5339\u914D\u9879\u76EE",
  gitMatchDesc: "\u624B\u52A8\u626B\u63CF\u5404\u8BBE\u5907\u4E0A\u7684 Git \u4ED3\u5E93\uFF0C\u628A\u5176\u4ED6\u8BBE\u5907\u5DF2\u6709\u3001\u4F46\u672C\u673A\u5C1A\u672A\u767B\u8BB0\u7684\u9879\u76EE\u8865\u5145\u4E3A\u5DE5\u4F5C\u533A\u3002\u4E0D\u4F1A\u514B\u9686\u6216\u4FEE\u6539\u4EFB\u4F55\u6587\u4EF6\uFF0C\u53EA\u5728\u7F3A\u5931\u7684\u8BBE\u5907\u4E0A\u767B\u8BB0\u5DF2\u6709\u76EE\u5F55\u3002",
  gitMatchStart: "\u5F00\u59CB\u5339\u914D",
  gitMatchStarting: "\u542F\u52A8\u4E2D\u2026",
  gitMatchCancel: "\u505C\u6B62",
  gitMatchPhaseDiscovering: "\u8BFB\u53D6\u5404\u8BBE\u5907\u5DF2\u767B\u8BB0\u9879\u76EE\u7684 Git \u8FDC\u7AEF",
  gitMatchPhaseScanning: "\u626B\u63CF\u8BBE\u5907\u4E0A\u7684\u4ED3\u5E93",
  gitMatchPhaseCreating: "\u5728\u7F3A\u5931\u8BBE\u5907\u4E0A\u767B\u8BB0\u5DE5\u4F5C\u533A",
  gitMatchDeviceProgress: "\u8BBE\u5907 {done}/{total}",
  gitMatchProjectProgress: "\u9879\u76EE {done}/{total}",
  gitMatchCreatedCount: "\u65B0\u5EFA {count}",
  gitMatchNotFoundCount: "\u672A\u627E\u5230 {count}",
  gitMatchAlreadyCount: "\u5DF2\u6709 {count}",
  gitMatchStatusCompleted: "\u4E0A\u6B21\u5339\u914D\u5DF2\u5B8C\u6210",
  gitMatchStatusCancelled: "\u4E0A\u6B21\u5339\u914D\u5DF2\u505C\u6B62",
  gitMatchStatusFailed: "\u4E0A\u6B21\u5339\u914D\u5931\u8D25",
  gitMatchFinishedAt: "\u5B8C\u6210\u4E8E {time}",
  gitMatchNeverRun: "\u5C1A\u672A\u8FD0\u884C\u8FC7\u5339\u914D",
  projectDeviceCount: "{count}\u4E2A\u8BBE\u5907",
  projectDeviceNone: "\u4EC5\u672C\u673A",
  targetDeviceHeading: "\u8DE8\u8BBE\u5907\u4ED3\u5E93\u7684\u65B0\u5EFA\u4F1A\u8BDD\u9ED8\u8BA4\u8BBE\u5907",
  targetDeviceSubDesc: "\u5728\u805A\u5408\u6A21\u5F0F\u4E0B\u5411\u6307\u5411\u540C\u4E00 Git \u8FDC\u7AEF\u7684\u4ED3\u5E93\u53D1\u8D77\u65B0\u4F1A\u8BDD\u65F6\uFF0C\u7531\u6240\u9009\u8BBE\u5907\u6267\u884C\uFF1B\u8BE5\u8BBE\u5907\u79BB\u7EBF\u65F6\u81EA\u52A8\u56DE\u9000\u5230\u5728\u7EBF\u6210\u5458\u3002",
  selectDevicePlaceholder: "\u9009\u62E9\u627F\u63A5\u8BBE\u5907\u2026",
  targetFallbackHint: "\u9996\u9009\u8BBE\u5907\u79BB\u7EBF\uFF0C\u5C06\u4F7F\u7528 {device}",
  targetAllOfflineHint: "\u8BE5\u4ED3\u5E93\u7684\u6240\u6709\u8BBE\u5907\u5F53\u524D\u79BB\u7EBF\uFF0C\u6682\u65F6\u65E0\u6CD5\u65B0\u5EFA\u4F1A\u8BDD",
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
  hoverDeviceLabel: "\u6240\u5C5E\u8BBE\u5907",
  hoverGitRepoLabel: "Git \u4ED3\u5E93",
  deviceChipAria: "\u4F1A\u8BDD\u6240\u5C5E\u8BBE\u5907",
  deviceOfflineShort: "\u79BB\u7EBF",
  deviceChipState: "\u8FDE\u63A5\u72B6\u6001",
  deviceChipWorkspace: "\u5DE5\u4F5C\u533A",
  deviceChipCwd: "\u4F1A\u8BDD\u8DEF\u5F84",
  deviceChipOpenSettings: "\u591A\u8BBE\u5907\u8BBE\u7F6E",
  deviceChipOfflineHint: "\u8BE5\u8BBE\u5907\u5F53\u524D\u4E0D\u53EF\u8FBE\uFF1B\u5C55\u793A\u7684\u662F\u4E0A\u6B21\u540C\u6B65\u7684\u6570\u636E\u3002",
  deviceChipSwitchHint: "\u53EF\u5728\u4E0B\u65B9\u91CD\u65B0\u8FDE\u63A5\uFF0C\u6216\u5207\u6362\u5230\u5728\u7EBF\u8BBE\u5907\u65B0\u5EFA\u4F1A\u8BDD\u3002",
  gatewayDegradedNotice: "\u805A\u5408\u7F51\u5173\u5F53\u524D\u5904\u4E8E\u964D\u7EA7\u72B6\u6001\uFF0C\u539F\u751F\u6A21\u5F0F\u4ECD\u53EF\u6B63\u5E38\u4F7F\u7528",
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
  authSuccess: "\u767B\u5F55\u6210\u529F\uFF0C\u6B63\u5728\u52A0\u8F7D\u8FDC\u7AEF\u754C\u9762\u2026",
  authFailed: "\u767B\u5F55\u5931\u8D25",
  authBackLocal: "\u8FD4\u56DE\u672C\u673A",
  authOpenSettings: "\u6253\u5F00\u591A\u8BBE\u5907\u8BBE\u7F6E",
  authHint: "\u82E5\u8FDC\u7AEF DSH \u5173\u95ED\u4E86 Token \u767B\u5F55\uFF0C\u8BF7\u5728\u8FDC\u7AEF\u91CD\u65B0\u542F\u52A8 dsh web \u540E\u7C98\u8D34\u65B0\u7684\u542F\u52A8\u94FE\u63A5\u3002"
};
var en = {
  settingsSectionTitle: "Multi-Device",
  settingsSectionIntro: "Connect remote machines over SSH. Aggregated Mode only merges sessions in the sidebar; Native Mode keeps a tab strip for this machine and every remote device.",
  pluginSummary: "Connect remote DSH machines with Git workspace aggregation and native UI tabs.",
  close: "Close",
  modeRowTitle: "Display mode",
  modeRowDesc: "Aggregated merges sessions from all devices in the sidebar and exposes no device navigation; Native keeps a persistent tab strip, with This Device showing local data only.",
  modeAggregated: "Aggregated",
  modeNative: "Native UI",
  nativeLocalTab: "This Device",
  nativeTabsLabel: "Native Mode device tabs",
  gitAutoTitle: "Auto-group matching Git repositories",
  gitAutoDesc: "Merge workspaces pointing to the same Git remote across devices without syncing or modifying files.",
  gitMatchTitle: "Match projects across devices",
  gitMatchDesc: "Manually scan Git repositories on every device and register projects that exist elsewhere but are missing here. Nothing is cloned or modified; existing folders are only registered as workspaces.",
  gitMatchStart: "Start matching",
  gitMatchStarting: "Starting\u2026",
  gitMatchCancel: "Stop",
  gitMatchPhaseDiscovering: "Reading Git remotes of registered projects",
  gitMatchPhaseScanning: "Scanning repositories on disk",
  gitMatchPhaseCreating: "Registering missing workspaces",
  gitMatchDeviceProgress: "Devices {done}/{total}",
  gitMatchProjectProgress: "Projects {done}/{total}",
  gitMatchCreatedCount: "{count} created",
  gitMatchNotFoundCount: "{count} not found",
  gitMatchAlreadyCount: "{count} already present",
  gitMatchStatusCompleted: "Last match completed",
  gitMatchStatusCancelled: "Last match stopped",
  gitMatchStatusFailed: "Last match failed",
  gitMatchFinishedAt: "Finished {time}",
  gitMatchNeverRun: "No match run yet",
  projectDeviceCount: "{count} devices",
  projectDeviceNone: "This machine only",
  targetDeviceHeading: "Default device for new sessions in merged repositories",
  targetDeviceSubDesc: "A new session in an aggregated repository runs on this device; an offline device falls back to an online member.",
  selectDevicePlaceholder: "Select device\u2026",
  targetFallbackHint: "Preferred device offline \u2014 {device} will be used",
  targetAllOfflineHint: "Every device for this repository is offline; a new session cannot start yet",
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
  hoverDeviceLabel: "Device",
  hoverGitRepoLabel: "Git repo",
  deviceChipAria: "Session device",
  deviceOfflineShort: "Offline",
  deviceChipState: "Connection",
  deviceChipWorkspace: "Workspace",
  deviceChipCwd: "Session path",
  deviceChipOpenSettings: "Multi-device settings",
  deviceChipOfflineHint: "This device is unreachable; the data shown is from the last sync.",
  deviceChipSwitchHint: "Reconnect below, or switch to an online device for a new session.",
  gatewayDegradedNotice: "Aggregated gateway is degraded; Native Mode remains available",
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
  authSuccess: "Signed in. Loading the remote UI\u2026",
  authFailed: "Sign-in failed",
  authBackLocal: "Back to This Device",
  authOpenSettings: "Open Multi-Device settings",
  authHint: "If the remote DSH disabled token sign-in, restart dsh web there and paste the new launch URL."
};

// src/client/clientServices.ts
var import_react = require("react");
var services = {};
var sessionSubscribe;
function bindClientServices(next) {
  services = next;
  sessionSubscribe = typeof next.sessions?.list.subscribe === "function" ? next.sessions.list.subscribe.bind(next.sessions.list) : void 0;
  return () => {
    services = {};
    sessionSubscribe = void 0;
  };
}
function useSessionSummary(sessionId) {
  return (0, import_react.useSyncExternalStore)(
    sessionSubscribe ?? noSubscribe,
    () => {
      if (sessionId === void 0 || services.sessions === void 0) return void 0;
      return services.sessions.list.getSnapshot().byId[sessionId];
    },
    () => void 0
  );
}
function noSubscribe() {
  return () => {
  };
}

// src/client/ModeSwitcherOverlay.tsx
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react7 = __toESM(require("react"), 1);

// src/client/MultiDeviceHubPanel.tsx
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react4 = require("react");

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

// src/client/sessionDevice.ts
function resolveSessionDevice(snapshot, sessionId, localName) {
  const decoded = decodeSessionId(sessionId);
  if (!decoded.isRemote) {
    return {
      deviceId: LOCAL_DEVICE_ID,
      name: localName,
      state: "connected",
      isLocal: true
    };
  }
  const origin = snapshot.sessionOrigins[sessionId];
  const device = snapshot.devices.find((candidate) => candidate.id === decoded.deviceId);
  return {
    deviceId: decoded.deviceId,
    name: origin?.deviceName ?? device?.name ?? String(decoded.deviceId),
    state: origin?.deviceState ?? device?.state ?? "disabled",
    isLocal: false,
    ...origin !== void 0 ? { origin } : {}
  };
}
function resolveSessionLogicalWorkspace(snapshot, sessionId, cwd) {
  const origin = snapshot.sessionOrigins[sessionId];
  if (origin?.logicalWorkspaceId !== void 0) {
    const byOrigin = snapshot.logicalWorkspaces.find(
      (workspace) => workspace.logicalWorkspaceId === origin.logicalWorkspaceId
    );
    if (byOrigin !== void 0) return byOrigin;
  }
  const listed = snapshot.logicalWorkspaces.find(
    (workspace) => workspace.sessionIds.includes(sessionId)
  );
  if (listed !== void 0) return listed;
  const key = cwd === void 0 ? "" : normalizeWorkspacePath(cwd);
  if (key === "") return void 0;
  const member = snapshot.allPhysicalWorkspaces.find(
    (workspace) => normalizeWorkspacePath(workspace.path) === key
  );
  if (member === void 0) return void 0;
  return snapshot.logicalWorkspaces.find(
    (workspace) => workspace.members.some(
      (candidate) => candidate.deviceId === member.deviceId && normalizeWorkspacePath(candidate.path) === normalizeWorkspacePath(member.path)
    )
  );
}
function deviceTargetsForWorkspace(snapshot, workspace, localName) {
  return workspace.members.map((member) => {
    const isLocal = member.deviceId === LOCAL_DEVICE_ID;
    const device = snapshot.devices.find((candidate) => candidate.id === member.deviceId);
    const state = isLocal ? "connected" : device?.state ?? "disabled";
    return {
      deviceId: member.deviceId,
      name: isLocal ? localName : device?.name ?? member.deviceName,
      path: member.path,
      state,
      isLocal,
      online: state === "connected",
      preferred: member.deviceId === workspace.targetDeviceId
    };
  });
}

// src/client/state.ts
var import_react3 = require("react");
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
  displayMode: "aggregated",
  hostStatus: {
    aggregatedGatewayActive: true,
    nativeProxyActive: true
  },
  devices: [],
  sshConfigHosts: [],
  aggregationConfig: {
    autoGitAggregate: true,
    prefixUnmatchedWithDevice: false,
    excludedMemberKeys: [],
    preferredDeviceByLogicalId: {},
    customTitleByLogicalId: {},
    workspaceOrder: [],
    manualRules: []
  },
  logicalWorkspaces: [],
  allPhysicalWorkspaces: [],
  sessionOrigins: {},
  gitMatch: {
    status: "idle",
    totalDevices: 0,
    processedDevices: 0,
    totalProjects: 0,
    processedProjects: 0,
    createdCount: 0,
    alreadyTrackedCount: 0,
    notFoundCount: 0,
    reports: []
  }
};
var MultiDeviceClientStore = class {
  state;
  listeners = /* @__PURE__ */ new Set();
  eventSource;
  pollTimer;
  sseRetryTimer;
  sseAttempt = 0;
  started = false;
  /** Latest Session reported to the Host, used to dedupe mount/cleanup races. */
  reportedSessionId;
  /** Monotonic control-plane sequence so an older HTTP request cannot win. */
  activeSessionSeq = 0;
  constructor() {
    this.state = {
      snapshot: EMPTY_SNAPSHOT,
      loading: true,
      // The Host snapshot is authoritative. Starting in Aggregated Mode only
      // avoids showing a Native tab bar before the first snapshot arrives; the
      // local surface is already filtered by the Host if it persisted native.
      displayMode: "aggregated",
      keepAliveDeviceIds: [],
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
  setState(patch) {
    this.state = { ...this.state, ...patch };
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
  applyIncomingSnapshot(snap, activeOverride) {
    if (snap.revision < this.state.snapshot.revision) return;
    const alive = new Set(
      snap.devices.filter((device) => device.keepNativeAlive !== false).map((device) => device.id)
    );
    const nextDisplayMode = snap.displayMode ?? this.state.displayMode;
    let activeNative;
    if (nextDisplayMode === "native") {
      if (activeOverride === null) {
        activeNative = void 0;
      } else if (activeOverride !== void 0 && alive.has(activeOverride)) {
        activeNative = activeOverride;
      } else if (this.state.activeNativeDeviceId !== void 0 && alive.has(this.state.activeNativeDeviceId)) {
        activeNative = this.state.activeNativeDeviceId;
      }
    }
    const keepAlive = this.state.keepAliveDeviceIds.filter((id) => alive.has(id)).slice(-MAX_KEEP_ALIVE_PAGES);
    if (nextDisplayMode === "native" && activeNative !== void 0 && !keepAlive.includes(activeNative)) {
      keepAlive.push(activeNative);
      while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) keepAlive.shift();
    }
    this.setState({
      snapshot: snap,
      loading: false,
      error: void 0,
      displayMode: nextDisplayMode,
      activeNativeDeviceId: activeNative,
      keepAliveDeviceIds: keepAlive
    });
  }
  activateNativeDevice(deviceId) {
    const alive = new Set(
      this.state.snapshot.devices.filter((device) => device.keepNativeAlive !== false).map((device) => device.id)
    );
    if (!alive.has(deviceId)) return;
    const keepAlive = this.state.keepAliveDeviceIds.filter((id) => alive.has(id) && id !== deviceId);
    keepAlive.push(deviceId);
    while (keepAlive.length > MAX_KEEP_ALIVE_PAGES) keepAlive.shift();
    this.setState({ activeNativeDeviceId: deviceId, keepAliveDeviceIds: keepAlive });
  }
  // ==========================================================================
  // UI Navigation & Keep-Alive Actions
  // ==========================================================================
  /**
   * Switch modes through the Host. The Host persists the mode and immediately
   * stops/starts merging remote rows into the local surface; the resulting
   * snapshot is applied here. `targetDeviceId` selects a remote tab; omitting
   * it lands on 本机.
   */
  async setDisplayMode(mode, targetDeviceId) {
    const res = await this.callControlPlane({
      action: "setDisplayMode",
      payload: { displayMode: mode }
    });
    if (!res.ok) {
      this.setState({ error: res.error });
      return { ok: false, error: res.error };
    }
    this.applyIncomingSnapshot(
      res.value.snapshot,
      mode === "native" ? targetDeviceId ?? null : null
    );
    return { ok: true };
  }
  /** Switch to a remote device tab, entering Native Mode if necessary. */
  async selectNativeDevice(deviceId) {
    if (this.state.displayMode === "native") {
      this.activateNativeDevice(deviceId);
      return { ok: true };
    }
    return this.setDisplayMode("native", deviceId);
  }
  /** Return to the 本机 tab while staying in Native Mode. */
  selectLocalNativeTab() {
    if (this.state.displayMode !== "native") return;
    this.setState({ activeNativeDeviceId: void 0 });
  }
  releaseKeepAliveDevice(deviceId) {
    const nextKeepAlive = this.state.keepAliveDeviceIds.filter((id) => id !== deviceId);
    const nextActive = this.state.activeNativeDeviceId === deviceId ? nextKeepAlive[nextKeepAlive.length - 1] : this.state.activeNativeDeviceId;
    this.setState({
      keepAliveDeviceIds: nextKeepAlive,
      activeNativeDeviceId: nextActive
    });
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
  /**
   * Track the Session currently rendered in the conversation pane and report it
   * to the Host. The Host answers `session/modelCatalog` with exactly that
   * Session owner's catalog, so a remote conversation never mixes in local
   * models (and vice versa).
   */
  setActiveSession(sessionId) {
    const next = sessionId === void 0 || sessionId === "" ? void 0 : sessionId;
    if (this.reportedSessionId === next) return Promise.resolve();
    this.reportedSessionId = next;
    this.setState({
      ...next !== void 0 ? { activeSessionId: next } : { activeSessionId: void 0 }
    });
    const requestSeq = ++this.activeSessionSeq;
    return this.callControlPlane({
      action: "setActiveSession",
      payload: { sessionId: next ?? "", requestSeq, clientId: CLIENT_INSTANCE_ID }
    }).then(() => void 0);
  }
  /** Clear the scope only when the unmounting Session is still the reported one. */
  clearActiveSession(sessionId) {
    if (this.reportedSessionId !== sessionId) return;
    void this.setActiveSession(void 0);
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
  async startGitMatch() {
    const res = await this.callControlPlane({ action: "startGitMatch" });
    if (res.ok) {
      this.applyIncomingSnapshot(res.value.snapshot);
      return { ok: true };
    }
    return { ok: false, error: res.error };
  }
  async cancelGitMatch() {
    const res = await this.callControlPlane({ action: "cancelGitMatch" });
    return res.ok ? res.value.cancelled : false;
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
  return (0, import_react3.useSyncExternalStore)(clientStore.subscribe, clientStore.getSnapshot, clientStore.getSnapshot);
}

// src/client/MultiDeviceHubPanel.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
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
  const [revealedValue, setRevealedValue] = (0, import_react4.useState)(void 0);
  const revealed = value.length > 0 && revealedValue === value;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-secret-wrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.Input,
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
    value.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.Button,
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
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: revealed ? EYE_OFF_PATH : EYE_PATH })
          }
        )
      }
    )
  ] });
}
function GitMatchLastResult({
  run,
  t
}) {
  const finished = run.finishedAt !== void 0 ? new Date(run.finishedAt) : void 0;
  const created = run.reports.flatMap((report) => report.created);
  const errors = run.reports.filter((report) => report.error !== void 0);
  const tone = run.status === "failed" ? "dsh-md-gitmatch-status-error" : "dsh-md-gitmatch-status-ok";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-gitmatch-result", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-gitmatch-line", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: tone, children: t(
        run.status === "completed" ? "gitMatchStatusCompleted" : run.status === "cancelled" ? "gitMatchStatusCancelled" : "gitMatchStatusFailed"
      ) }),
      finished !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-gitmatch-detail", children: t("gitMatchFinishedAt").replace("{time}", finished.toLocaleString()) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-gitmatch-line", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("gitMatchCreatedCount").replace("{count}", String(run.createdCount)) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("gitMatchNotFoundCount").replace("{count}", String(run.notFoundCount)) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("gitMatchAlreadyCount").replace("{count}", String(run.alreadyTrackedCount)) })
    ] }),
    run.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-gitmatch-detail", children: run.error }),
    created.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "dsh-md-gitmatch-created", children: created.map((item) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: "dsh-md-gitmatch-detail", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-ellipsis", title: `${item.gitRemote} \u2192 ${item.path}`, children: item.gitRemote }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-gitmatch-path", title: item.path, children: item.path })
    ] }, `${item.gitRemote}:${item.path}`)) }),
    errors.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "dsh-md-gitmatch-created", children: errors.map((report) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: "dsh-md-gitmatch-detail", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: report.deviceName }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-gitmatch-path", children: report.error })
    ] }, report.deviceId)) })
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
  const formId = (0, import_react4.useId)();
  const [sshHost, setSshHost] = (0, import_react4.useState)(device?.ssh?.host ?? "");
  const [name, setName] = (0, import_react4.useState)(device?.name ?? "");
  const [authCredential, setAuthCredential] = (0, import_react4.useState)("");
  const [advancedOpen, setAdvancedOpen] = (0, import_react4.useState)(() => hasCustomAdvancedFields(device));
  const [remotePort, setRemotePort] = (0, import_react4.useState)(String(device?.ssh?.remotePort ?? 3080));
  const [sshUser, setSshUser] = (0, import_react4.useState)(device?.ssh?.username ?? "");
  const [sshPort, setSshPort] = (0, import_react4.useState)(String(device?.ssh?.port ?? 22));
  const [sshKeyPath, setSshKeyPath] = (0, import_react4.useState)(device?.ssh?.privateKeyPath ?? "");
  const [sshPassphrase, setSshPassphrase] = (0, import_react4.useState)("");
  const [sshProxyJump, setSshProxyJump] = (0, import_react4.useState)(device?.ssh?.proxyJump ?? "");
  const [remoteDshHome, setRemoteDshHome] = (0, import_react4.useState)(device?.ssh?.remoteDshHome ?? "");
  const [bootstrapCredentials, setBootstrapCredentials] = (0, import_react4.useState)(
    device?.ssh?.bootstrapFromRemoteCredentials !== false
  );
  const [testing, setTesting] = (0, import_react4.useState)(false);
  const [saving, setSaving] = (0, import_react4.useState)(false);
  const [saveAnyway, setSaveAnyway] = (0, import_react4.useState)(false);
  const [testResult, setTestResult] = (0, import_react4.useState)(null);
  const [saveError, setSaveError] = (0, import_react4.useState)(null);
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
    setSaveAnyway(false);
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
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("form", { className: "dsh-md-editor", onSubmit: (e) => {
    void handleSubmit(e);
  }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-editor-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-editor-title", children: device !== void 0 ? t("editDevice") : t("addDevice") }),
      sshConfigHosts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-form-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-host`, children: t("sshHost") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Input,
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
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-name`, children: t("deviceName") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Input,
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
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-token`, children: t("authCredential") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.DisclosureRow,
      {
        title: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-field-label", children: t("advancedOptions") }),
        open: advancedOpen,
        expandable: true,
        expandOnRowClick: true,
        onToggle: () => setAdvancedOpen((prev) => !prev),
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-form-grid dsh-md-advanced-body", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-rport`, children: t("remoteDshPort") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              import_dsh_client_ui_primitives2.Input,
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
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-user`, children: t("sshUser") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              import_dsh_client_ui_primitives2.Input,
              {
                id: `${formId}-user`,
                value: sshUser,
                placeholder: t("sshUserPlaceholder"),
                disabled: busy,
                onChange: (e) => setSshUser(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-port`, children: t("sshPort") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              import_dsh_client_ui_primitives2.Input,
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
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-key`, children: t("sshKeySelect") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
          showPassphraseField && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-passphrase`, children: t("sshKeyPassphrase") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-jump`, children: t("sshProxyJump") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              import_dsh_client_ui_primitives2.Input,
              {
                id: `${formId}-jump`,
                value: sshProxyJump,
                placeholder: t("sshProxyJumpPlaceholder"),
                disabled: busy,
                onChange: (e) => setSshProxyJump(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "dsh-md-field-label", htmlFor: `${formId}-home`, children: t("remoteDshHome") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              import_dsh_client_ui_primitives2.Input,
              {
                id: `${formId}-home`,
                value: remoteDshHome,
                placeholder: t("remoteDshHomePlaceholder"),
                disabled: busy,
                onChange: (e) => setRemoteDshHome(e.currentTarget.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-field dsh-md-field-span", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_dsh_client_ui_primitives2.Switch,
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
    saveError !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsh-md-error-text", role: "alert", children: saveError }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-editor-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-editor-footer-left", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Button,
          {
            variant: "outline",
            size: "sm",
            disabled: busy || sshHost.trim() === "",
            icon: testing ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "ongoing", size: 12 }) : void 0,
            onClick: () => {
              void handleTest();
            },
            children: testing ? t("testingConnection") : t("testConnection")
          }
        ),
        testResult !== null && (testResult.ok ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dsh-md-success-text", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: "done", size: 8 }),
          testResult.text
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-error-text", role: "alert", children: testResult.text }))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-editor-footer-right", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", size: "sm", disabled: busy, onClick: onCancel, children: t("cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Button,
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
  const modeSegId = (0, import_react4.useId)();
  const [addingNew, setAddingNew] = (0, import_react4.useState)(false);
  const [editingDeviceId, setEditingDeviceId] = (0, import_react4.useState)(null);
  const [sshKeys, setSshKeys] = (0, import_react4.useState)([]);
  const [aggBusy, setAggBusy] = (0, import_react4.useState)(false);
  const [modeBusy, setModeBusy] = (0, import_react4.useState)(false);
  const [deleteTarget, setDeleteTarget] = (0, import_react4.useState)(null);
  const [deleting, setDeleting] = (0, import_react4.useState)(false);
  const [deleteError, setDeleteError] = (0, import_react4.useState)(null);
  const [toastNotice, setToastNotice] = (0, import_react4.useState)(null);
  const pushToast = (text, tone) => {
    setToastNotice((prev) => ({
      seq: (prev?.seq ?? 0) + 1,
      text,
      ...tone !== void 0 ? { tone } : {}
    }));
  };
  (0, import_react4.useEffect)(() => {
    if (addingNew || editingDeviceId !== null) {
      void clientStore.listSshKeys().then(setSshKeys);
    }
  }, [addingNew, editingDeviceId]);
  const mergedWorkspaces = snapshot.logicalWorkspaces.filter((w) => w.members.length > 1);
  const hasDevices = snapshot.devices.length > 0;
  const gitMatch = snapshot.gitMatch;
  const gitMatchRunning = gitMatch.status === "running";
  const [gitMatchBusy, setGitMatchBusy] = (0, import_react4.useState)(false);
  const startGitMatch = () => {
    if (gitMatchBusy || gitMatchRunning) return;
    setGitMatchBusy(true);
    void clientStore.startGitMatch().then((res) => {
      if (!res.ok) pushToast(`${t("actionFailed")}: ${res.error ?? ""}`, "error");
    }).finally(() => {
      setGitMatchBusy(false);
    });
  };
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
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-section", children: [
    !hideHeader && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { className: "dsh-md-section-title", children: t("settingsSectionTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsh-md-section-intro", children: t("settingsSectionIntro") })
    ] }),
    !snapshot.hostStatus.aggregatedGatewayActive && snapshot.hostStatus.aggregatedGatewayError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "dsh-md-notice-warn", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconWarningOutlineRegular, { size: 14 }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        t("gatewayDegradedNotice"),
        " (",
        snapshot.hostStatus.aggregatedGatewayError,
        ")"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-pref-list", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-pref-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-pref-title", children: t("modeRowTitle") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-pref-desc", children: t("modeRowDesc") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.SegmentedControl,
          {
            id: modeSegId,
            label: t("modeRowTitle"),
            value: state.displayMode,
            disabled: modeBusy,
            options: [
              { value: "aggregated", label: t("modeAggregated") },
              { value: "native", label: t("modeNative") }
            ],
            onChange: (next) => {
              if (modeBusy || next === state.displayMode) return;
              setModeBusy(true);
              void clientStore.setDisplayMode(next).then((res) => {
                setModeBusy(false);
                if (!res.ok) {
                  pushToast(`${t("actionFailed")}: ${res.error ?? ""}`, "error");
                  return;
                }
                if (next === "native") onCloseSettings?.();
              });
            }
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-pref-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-pref-title", children: t("gitAutoTitle") }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-pref-desc", children: t("gitAutoDesc") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Switch,
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
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-gitmatch", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-gitmatch-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-pref-title", children: t("gitMatchTitle") }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-pref-desc", children: t("gitMatchDesc") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-gitmatch-actions", children: gitMatchRunning ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_dsh_client_ui_primitives2.Button,
            {
              variant: "outline",
              size: "sm",
              onClick: () => {
                void clientStore.cancelGitMatch();
              },
              children: t("gitMatchCancel")
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_dsh_client_ui_primitives2.Button,
            {
              variant: "primary",
              size: "sm",
              disabled: gitMatchBusy,
              icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRefreshOutlineRegular, { size: 13 }),
              onClick: startGitMatch,
              children: gitMatchBusy ? t("gitMatchStarting") : t("gitMatchStart")
            }
          ) })
        ] }),
        gitMatchRunning && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-gitmatch-progress", role: "status", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-gitmatch-line", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-gitmatch-phase", children: t(
              gitMatch.phase === "discovering" ? "gitMatchPhaseDiscovering" : gitMatch.phase === "creating" ? "gitMatchPhaseCreating" : "gitMatchPhaseScanning"
            ) }),
            gitMatch.currentDeviceName !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-gitmatch-detail", children: gitMatch.currentDeviceName }),
            gitMatch.currentProject !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-gitmatch-detail dsh-md-ellipsis", children: gitMatch.currentProject })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-gitmatch-line", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("gitMatchDeviceProgress").replace("{done}", String(gitMatch.processedDevices)).replace("{total}", String(gitMatch.totalDevices)) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("gitMatchProjectProgress").replace("{done}", String(gitMatch.processedProjects)).replace("{total}", String(gitMatch.totalProjects)) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("gitMatchCreatedCount").replace("{count}", String(gitMatch.createdCount)) })
          ] })
        ] }),
        !gitMatchRunning && gitMatch.status !== "idle" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(GitMatchLastResult, { run: gitMatch, t })
      ] }),
      snapshot.aggregationConfig.autoGitAggregate && mergedWorkspaces.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-subpanel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-subpanel-header", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-subpanel-title-wrap", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
              "svg",
              {
                width: 14,
                height: 14,
                viewBox: "0 0 16 16",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 1.3,
                "aria-hidden": "true",
                className: "dsh-md-subpanel-icon",
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "4", cy: "4", r: "2" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "4", cy: "12", r: "2" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "12", cy: "7", r: "2" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M4 6v4M4 8c2.5 0 4.5-1 6-1", strokeLinecap: "round" })
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-subpanel-title", children: t("targetDeviceHeading") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-subpanel-desc", children: t("targetDeviceSubDesc") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-merged-repos-list", children: mergedWorkspaces.map((lws) => {
          const targets = deviceTargetsForWorkspace(snapshot, lws, t("nativeLocalTab"));
          const selectOptions = targets.map((target) => ({
            value: target.deviceId,
            label: target.name,
            description: target.online ? target.path : `${target.path} \xB7 ${t("deviceOfflineShort")}`,
            dotState: deviceStateToDotState(target.state),
            disabled: !target.online
          }));
          const effective = targets.find(
            (target) => target.deviceId === lws.effectiveTargetDeviceId
          );
          const fallbackHint = lws.effectiveTargetDeviceId !== lws.targetDeviceId && effective !== void 0 ? t("targetFallbackHint").replace("{device}", effective.name) : lws.effectiveTargetOnline ? void 0 : t("targetAllOfflineHint");
          return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-merged-repo-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-merged-repo-info", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-merged-repo-name", title: lws.title, children: lws.title }),
              lws.gitRemote && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-merged-repo-remote", title: lws.gitRemote, children: lws.gitRemote }),
              fallbackHint !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-merged-repo-hint", role: "status", children: fallbackHint })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              DshSelect,
              {
                compact: true,
                value: lws.targetDeviceId,
                placeholder: t("selectDevicePlaceholder"),
                ariaLabel: `${lws.title} - ${t("targetDeviceHeading")}`,
                options: selectOptions,
                onChange: (next) => {
                  void clientStore.setPreferredDevice(
                    lws.logicalWorkspaceId,
                    next
                  );
                }
              }
            )
          ] }, lws.logicalWorkspaceId);
        }) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-devices-block", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-devices-header", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-devices-heading-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { className: "dsh-md-devices-heading", children: t("devicesHeading") }),
          hasDevices && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-devices-count-pill", children: snapshot.devices.length })
        ] }),
        !addingNew && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_dsh_client_ui_primitives2.Button,
          {
            variant: "outline",
            size: "sm",
            icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconPlusOutlineRegular, { size: 13 }),
            onClick: () => {
              setEditingDeviceId(null);
              setAddingNew(true);
            },
            children: t("addDevice")
          }
        )
      ] }),
      addingNew && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-card", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
      !hasDevices && !addingNew ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-card dsh-md-empty-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-row-name", children: t("noDevicesTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-md-pref-desc", children: t("noDevicesDesc") })
      ] }) : hasDevices ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "dsh-md-rows", children: snapshot.devices.map((dev) => {
        const isEditing = editingDeviceId === dev.id;
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: "dsh-md-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-row-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-row-identity", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot, { state: deviceStateToDotState(dev.state), size: 8 }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-row-name", children: dev.name }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-device-endpoint", title: formatCompactDeviceTarget(dev), children: formatCompactDeviceTarget(dev) }),
              dev.latencyMs !== void 0 && dev.state === "connected" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dsh-md-latency-text", children: [
                dev.latencyMs,
                "ms"
              ] }),
              dev.runningSessionCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-session-count-badge", children: t("runningCount").replace("{count}", String(dev.runningSessionCount)) }),
              dev.pendingApprovalCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tag, { children: t("pendingCount").replace("{count}", String(dev.pendingApprovalCount)) }),
              dev.authState === "required" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-md-auth-required-tag", children: t("authRequired") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-row-actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                import_dsh_client_ui_primitives2.Button,
                {
                  variant: "outline",
                  size: "sm",
                  disabled: modeBusy,
                  icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRightUpOutlineRegular, { size: 13 }),
                  onClick: () => {
                    if (modeBusy) return;
                    setModeBusy(true);
                    void clientStore.selectNativeDevice(dev.id).then((res) => {
                      setModeBusy(false);
                      if (!res.ok) {
                        pushToast(`${t("actionFailed")}: ${res.error ?? ""}`, "error");
                        return;
                      }
                      onCloseSettings?.();
                    });
                  },
                  children: t("openNative")
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-md-icon-actions-group", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: t("reconnect"), side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  import_dsh_client_ui_primitives2.Button,
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
                    children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconRefreshOutlineRegular, { size: 14 })
                  }
                ) }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: t("editDevice"), side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  import_dsh_client_ui_primitives2.Button,
                  {
                    variant: "ghost",
                    size: "icon",
                    "aria-label": t("editDevice"),
                    "aria-expanded": isEditing,
                    onClick: () => {
                      setAddingNew(false);
                      setEditingDeviceId(isEditing ? null : dev.id);
                    },
                    children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconEditOutlineRegular, { size: 14 })
                  }
                ) }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: t("remove"), side: "top", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  import_dsh_client_ui_primitives2.Button,
                  {
                    variant: "ghost",
                    size: "icon",
                    "aria-label": t("remove"),
                    onClick: () => {
                      setDeleteError(null);
                      setDeleteTarget(dev);
                    },
                    children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconTrashOutlineRegular, { size: 14 })
                  }
                ) })
              ] })
            ] })
          ] }),
          !isEditing && dev.lastError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsh-md-error-text", children: dev.lastError }),
          isEditing && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.Modal,
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
        footer: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_dsh_client_ui_primitives2.Button,
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
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            import_dsh_client_ui_primitives2.Button,
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
        children: deleteError !== null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsh-md-error-text", role: "alert", children: deleteError }) : null
      }
    ),
    toastNotice !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives2.Toast,
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
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react6 = require("react");

// src/client/AuthPanel.tsx
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react5 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function AuthRequiredPanel({
  device,
  t,
  onOpenSettings
}) {
  const [credential, setCredential] = (0, import_react5.useState)("");
  const [busy, setBusy] = (0, import_react5.useState)(null);
  const [error, setError] = (0, import_react5.useState)(null);
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-md-auth-stage", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-auth-card", role: "region", "aria-label": t("authPanelTitle"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-auth-badge", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.StateDot, { state: "error", size: 8 }),
      t("authRequired")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { className: "dsh-md-auth-title", children: t("authPanelTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsh-md-auth-desc", children: t("authPanelDesc") }),
    error === null && device.authError !== void 0 && device.authError !== "" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsh-md-error-text", role: "status", children: device.authError }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "dsh-md-field-label", htmlFor: `dsh-md-auth-${device.id}`, children: t("authCredentialLabel") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives3.Input,
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
    error !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsh-md-error-text", role: "alert", children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-md-auth-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        import_dsh_client_ui_primitives3.Button,
        {
          variant: "primary",
          size: "sm",
          disabled: busy !== null || credential.trim() === "",
          icon: busy === "token" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.StateDot, { state: "ongoing", size: 12 }) : void 0,
          onClick: () => {
            void run(true);
          },
          children: busy === "token" ? t("authChecking") : t("authSubmit")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        import_dsh_client_ui_primitives3.Button,
        {
          variant: "outline",
          size: "sm",
          disabled: busy !== null,
          icon: busy === "ssh" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.StateDot, { state: "ongoing", size: 12 }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconRefreshOutlineRegular, { size: 13 }),
          onClick: () => {
            void run(false);
          },
          children: busy === "ssh" ? t("authChecking") : t("authUseSsh")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        import_dsh_client_ui_primitives3.Button,
        {
          variant: "ghost",
          size: "sm",
          disabled: busy !== null,
          icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconChevronLeftOutlineRegular, { size: 13 }),
          onClick: () => clientStore.selectLocalNativeTab(),
          children: t("authBackLocal")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        import_dsh_client_ui_primitives3.Button,
        {
          variant: "ghost",
          size: "sm",
          icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconSettingsOutlineRegular, { size: 13 }),
          onClick: onOpenSettings,
          children: t("authOpenSettings")
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsh-md-auth-hint", children: t("authHint") })
  ] }) });
}

// src/client/NativeViewport.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function getDesktopBrowserBridge() {
  const desktop = globalThis.dshDesktop;
  return desktop?.protocolVersion === 1 ? desktop.browser : void 0;
}
function KeepAliveDeviceFrame({
  device,
  active,
  reloadCount,
  t,
  onOpenSettings
}) {
  const targetUrl = device.nativeProxyUrl ?? device.effectiveBaseUrl;
  const authRequired = device.authState === "required" || device.authState === "error";
  const containerRef = (0, import_react6.useRef)(null);
  const webviewLeaseRef = (0, import_react6.useRef)(void 0);
  const [webviewFailed, setWebviewFailed] = (0, import_react6.useState)(false);
  const [reconnectError, setReconnectError] = (0, import_react6.useState)(null);
  (0, import_react6.useEffect)(() => {
    setWebviewFailed(false);
    if (authRequired) return;
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
  }, [device.id, targetUrl, reloadCount, authRequired]);
  const useDesktopWebview = getDesktopBrowserBridge() !== void 0 && !webviewFailed;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "div",
    {
      className: "dsh-md-native-frame-wrap",
      style: {
        display: active ? "flex" : "none",
        visibility: active ? "visible" : "hidden"
      },
      "data-device-id": device.id,
      "data-active": active ? "true" : "false",
      children: authRequired ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(AuthRequiredPanel, { device, t, onOpenSettings }) : targetUrl === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-md-native-placeholder", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.StateDot, { state: deviceStateToDotState(device.state), size: 12 }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-md-row-name", children: device.name }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-md-pref-desc", children: reconnectError ?? device.lastError ?? device.targetSummary }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          import_dsh_client_ui_primitives4.Button,
          {
            variant: "primary",
            size: "sm",
            icon: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconRefreshOutlineRegular, { size: 13 }),
            onClick: () => {
              void clientStore.reconnectDevice(device.id).then((res) => {
                setReconnectError(res.ok ? null : res.error ?? t("actionFailed"));
              });
            },
            children: t("reconnect")
          }
        )
      ] }) : useDesktopWebview ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { ref: containerRef, className: "dsh-md-native-iframe" }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
function NativeTabBar({
  t,
  onOpenSettings
}) {
  const state = useMultiDeviceState();
  const { devices } = state.snapshot;
  if (state.displayMode !== "native") return null;
  const activeDevice = devices.find((device) => device.id === state.activeNativeDeviceId);
  const localActive = activeDevice === void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-md-native-bar", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-md-native-tabs", role: "tablist", "aria-label": t("nativeTabsLabel"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-md-native-tab-item", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        import_dsh_client_ui_primitives4.Pill,
        {
          active: localActive,
          role: "tab",
          "aria-selected": localActive,
          onClick: () => clientStore.selectLocalNativeTab(),
          children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-md-pill-inner", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconGlobeOutlineRegular, { size: 13 }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: t("nativeLocalTab") })
          ] })
        }
      ) }),
      devices.map((dev) => {
        const isSelected = dev.id === state.activeNativeDeviceId;
        const isKeptAlive = state.keepAliveDeviceIds.includes(dev.id);
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-md-native-tab-item", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            import_dsh_client_ui_primitives4.Pill,
            {
              active: isSelected,
              role: "tab",
              "aria-selected": isSelected,
              onClick: () => {
                void clientStore.selectNativeDevice(dev.id);
              },
              children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-md-pill-inner", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.StateDot, { state: deviceStateToDotState(dev.state), size: 8 }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: dev.name }),
                dev.runningSessionCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-md-muted", children: t("runningCount").replace("{count}", String(dev.runningSessionCount)) }),
                dev.latencyMs !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-md-muted", children: [
                  dev.latencyMs,
                  "ms"
                ] })
              ] })
            }
          ),
          isKeptAlive && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: t("releaseKeepAlive"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            import_dsh_client_ui_primitives4.Button,
            {
              variant: "ghost",
              size: "icon",
              "aria-label": t("releaseKeepAlive"),
              onClick: () => clientStore.releaseKeepAliveDevice(dev.id),
              children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconCloseOutlineRegular, { size: 12 })
            }
          ) })
        ] }, dev.id);
      })
    ] }),
    activeDevice !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-md-native-bar-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: t("reloadPage"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        import_dsh_client_ui_primitives4.Button,
        {
          variant: "ghost",
          size: "icon",
          "aria-label": t("reloadPage"),
          onClick: () => clientStore.reloadNativeDevice(activeDevice.id),
          children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconRefreshOutlineRegular, { size: 14 })
        }
      ) }),
      (activeDevice.nativeProxyUrl ?? activeDevice.effectiveBaseUrl) !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: t("openExternal"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        import_dsh_client_ui_primitives4.Button,
        {
          variant: "ghost",
          size: "icon",
          "aria-label": t("openExternal"),
          onClick: () => {
            const url = activeDevice.nativeProxyUrl ?? activeDevice.effectiveBaseUrl;
            if (url !== void 0) window.open(url, "_blank", "noopener,noreferrer");
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconRightUpOutlineRegular, { size: 14 })
        }
      ) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: t("settingsSectionTitle"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      import_dsh_client_ui_primitives4.Button,
      {
        variant: "ghost",
        size: "icon",
        "aria-label": t("settingsSectionTitle"),
        onClick: onOpenSettings,
        children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconSettingsOutlineRegular, { size: 14 })
      }
    ) })
  ] });
}
function NativeViewport({
  t,
  onOpenSettings
}) {
  const state = useMultiDeviceState();
  const { devices } = state.snapshot;
  const isNative = state.displayMode === "native";
  const activeDevice = devices.find((device) => device.id === state.activeNativeDeviceId);
  const mountedDeviceIds = new Set(state.keepAliveDeviceIds);
  if (activeDevice !== void 0) mountedDeviceIds.add(activeDevice.id);
  const mountedDevices = devices.filter((device) => mountedDeviceIds.has(device.id));
  const visible = isNative && activeDevice !== void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "div",
    {
      className: "dsh-md-native-stage",
      "data-visible": visible ? "true" : "false",
      "aria-hidden": !visible,
      children: mountedDevices.map((device) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        KeepAliveDeviceFrame,
        {
          device,
          active: visible && device.id === activeDevice?.id,
          reloadCount: state.reloadCounters[device.id] ?? 0,
          t,
          onOpenSettings
        },
        device.id
      ))
    }
  );
}

// src/client/ModeSwitcherOverlay.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var FRAME_NATIVE_CLASS = "dsh-md-frame-native";
var FRAME_DESKTOP_CLASS = "dsh-md-frame-desktop";
var useBrowserLayoutEffect = typeof window === "undefined" ? import_react7.useEffect : import_react7.useLayoutEffect;
function isDesktopRuntime() {
  const desktop = globalThis.dshDesktop;
  return desktop?.protocolVersion === 1;
}
function ModeSwitcherOverlay({
  t,
  onOpenSettings
}) {
  const state = useMultiDeviceState();
  const isNative = state.displayMode === "native";
  const layerRef = (0, import_react7.useRef)(null);
  useBrowserLayoutEffect(() => {
    const frame = layerRef.current?.closest("[data-shell-overlay]")?.parentElement;
    if (!(frame instanceof HTMLElement)) return;
    frame.classList.toggle(FRAME_NATIVE_CLASS, isNative);
    frame.classList.toggle(FRAME_DESKTOP_CLASS, isDesktopRuntime());
    return () => {
      frame.classList.remove(FRAME_NATIVE_CLASS);
      frame.classList.remove(FRAME_DESKTOP_CLASS);
    };
  }, [isNative]);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { ref: layerRef, className: "dsh-md-native-layer", "data-native": isNative ? "true" : "false", children: [
      isNative && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NativeTabBar, { t, onOpenSettings }),
      (isNative || state.keepAliveDeviceIds.length > 0) && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NativeViewport, { t, onOpenSettings })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      import_dsh_client_ui_primitives5.Modal,
      {
        open: state.settingsModalOpen,
        onClose: () => clientStore.setSettingsModalOpen(false),
        title: t("settingsSectionTitle"),
        closeLabel: t("close"),
        className: "dsh-md-fallback-modal",
        children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
function ActiveSessionReporter({
  sessionId,
  onScopeReported
}) {
  import_react7.default.useEffect(() => {
    let cancelled = false;
    void clientStore.setActiveSession(sessionId).then(() => {
      if (!cancelled) onScopeReported?.();
    });
    return () => {
      cancelled = true;
      clientStore.clearActiveSession(sessionId);
    };
  }, [onScopeReported, sessionId]);
  return null;
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
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 2, fontSize: 11, paddingTop: 2 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.StateDot, { state: deviceStateToDotState(origin?.deviceState ?? "connected"), size: 8 }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
        t("hoverDeviceLabel"),
        ": ",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: devName })
      ] })
    ] }),
    origin?.gitRemote !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { color: "var(--dsw-alias-label-tertiary)" }, children: [
      t("hoverGitRepoLabel"),
      ": ",
      origin.gitRemote
    ] }),
    origin?.deviceState === "error" || origin?.deviceState === "disabled" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { color: "var(--dsw-alias-state-warn-primary)" }, children: t("deviceOfflineShort") }) : null
  ] });
}

// src/client/projectBadges.ts
var BADGE_ATTR = "data-dsh-md-device-badge";
var DOT_ATTR = "data-dsh-md-device-dot";
var LABEL_ATTR = "data-dsh-md-device-label";
function shouldDecorateProjectRows(mode) {
  return mode === "aggregated";
}
function dotTone(snapshot, workspace) {
  let tone = "ok";
  for (const member of workspace.members) {
    if (member.deviceId === LOCAL_DEVICE_ID) continue;
    const device = snapshot.devices.find((candidate) => candidate.id === member.deviceId);
    const state = deviceStateToDotState(device?.state ?? "disabled");
    if (state === "error" || state === "idle") return "offline";
    if (state === "ongoing") tone = "pending";
  }
  return tone;
}
function labelFor(workspace, t) {
  const names = workspace.members.map(
    (member) => member.deviceId === LOCAL_DEVICE_ID ? t("projectDeviceNone") : member.deviceName
  );
  const tooltip = names.join(" \xB7 ");
  if (workspace.members.length <= 1) {
    return { text: names[0] ?? "", tooltip };
  }
  return {
    text: t("projectDeviceCount").replace("{count}", String(workspace.members.length)),
    tooltip
  };
}
function createBadge() {
  const badge = document.createElement("span");
  badge.className = "dsh-md-project-device";
  badge.setAttribute(BADGE_ATTR, "");
  const dot = document.createElement("span");
  dot.className = "dsh-md-project-dot";
  dot.setAttribute(DOT_ATTR, "");
  const label = document.createElement("span");
  label.className = "dsh-md-project-device-label";
  label.setAttribute(LABEL_ATTR, "");
  badge.append(dot, label);
  return badge;
}
function mountBadge(row) {
  const existing = row.querySelector(`:scope > [${BADGE_ATTR}]`);
  if (existing !== null) return existing;
  const badge = createBadge();
  const last = row.lastElementChild;
  if (last !== null && last !== row.firstElementChild) row.insertBefore(badge, last);
  else row.appendChild(badge);
  return badge;
}
function syncRows(t) {
  const state = clientStore.getSnapshot();
  if (!shouldDecorateProjectRows(state.displayMode)) {
    for (const badge of document.querySelectorAll(`[${BADGE_ATTR}]`)) badge.remove();
    return;
  }
  const snapshot = state.snapshot;
  const byId = new Map(snapshot.logicalWorkspaces.map((workspace) => [workspace.logicalWorkspaceId, workspace]));
  for (const row of document.querySelectorAll('[data-row-key^="workspace:"]')) {
    const key = row.getAttribute("data-row-key") ?? "";
    const workspaceId = key.slice("workspace:".length);
    const workspace = byId.get(workspaceId);
    const badge = row.querySelector(`:scope > [${BADGE_ATTR}]`);
    if (workspace === void 0 || workspace.members.length === 0) {
      badge?.remove();
      continue;
    }
    const target = mountBadge(row);
    const dot = target.querySelector(`[${DOT_ATTR}]`);
    const label = target.querySelector(`[${LABEL_ATTR}]`);
    if (dot !== null) dot.dataset.state = dotTone(snapshot, workspace);
    if (label !== null) {
      const { text, tooltip } = labelFor(workspace, t);
      if (label.textContent !== text) label.textContent = text;
      if (target.title !== tooltip) target.title = tooltip;
    }
  }
}
function installProjectDeviceBadges(t) {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return () => {
    };
  }
  let frame = 0;
  const schedule = () => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      try {
        syncRows(t);
      } catch {
      }
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  const unsubscribe = clientStore.subscribe(schedule);
  schedule();
  return () => {
    observer.disconnect();
    unsubscribe();
    if (frame !== 0) cancelAnimationFrame(frame);
    for (const badge of document.querySelectorAll(`[${BADGE_ATTR}]`)) badge.remove();
  };
}

// src/client/SessionDeviceChip.tsx
var import_dsh_client_ui_primitives6 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react8 = require("react");
var import_jsx_runtime6 = require("react/jsx-runtime");
function stateLabelKey(state) {
  switch (state) {
    case "connected":
      return "statusConnected";
    case "connecting":
      return "statusConnecting";
    case "reconnecting":
      return "statusReconnecting";
    case "disabled":
      return "statusDisabled";
    default:
      return "statusError";
  }
}
function SessionDeviceChip({
  sessionId,
  t,
  onOpenSettings,
  variant = "header"
}) {
  const state = useMultiDeviceState();
  const snapshot = state.snapshot;
  const summary = useSessionSummary(sessionId);
  const device = (0, import_react8.useMemo)(
    () => resolveSessionDevice(snapshot, sessionId, t("nativeLocalTab")),
    [snapshot, sessionId, t]
  );
  const workspace = (0, import_react8.useMemo)(
    () => resolveSessionLogicalWorkspace(snapshot, sessionId, summary?.cwd),
    [snapshot, sessionId, summary?.cwd]
  );
  const targets = (0, import_react8.useMemo)(
    () => workspace === void 0 ? [] : deviceTargetsForWorkspace(snapshot, workspace, t("nativeLocalTab")),
    [snapshot, workspace, t]
  );
  const [open, setOpen] = (0, import_react8.useState)(false);
  const [position, setPosition] = (0, import_react8.useState)(null);
  const buttonRef = (0, import_react8.useRef)(null);
  (0, import_react8.useEffect)(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  const online = device.state === "connected";
  const offline = !device.isLocal && !online;
  const stateBadge = device.isLocal || online ? void 0 : device.state === "reconnecting" ? t("statusReconnecting") : device.state === "connecting" ? void 0 : t("deviceOfflineShort");
  const showSwitchHint = variant === "hero" && online === false && targets.some((target) => target.online);
  const aria = `${t("deviceChipAria")}: ${device.name}`;
  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect === void 0) return;
    setPosition({
      top: Math.round(rect.bottom + 6),
      right: Math.max(8, Math.round(window.innerWidth - rect.right))
    });
    setOpen(true);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "dsh-md-device-chip-wrap", "data-variant": variant, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
      "button",
      {
        ref: buttonRef,
        type: "button",
        className: "dsh-md-device-chip",
        "data-state": device.state,
        "data-local": device.isLocal ? "true" : "false",
        "aria-label": aria,
        "aria-expanded": open,
        title: aria,
        onClick: toggle,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives6.StateDot, { state: deviceStateToDotState(device.state), size: 8 }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-md-device-chip-name", children: device.name }),
          stateBadge !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-md-device-chip-offline", children: stateBadge }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives6.IconChevronDownOutlineRegular, { size: 12, className: "dsh-md-device-chip-chevron" })
        ]
      }
    ),
    open && position !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-md-device-chip-backdrop", onClick: () => setOpen(false) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
        "div",
        {
          className: "dsh-md-device-popover",
          role: "dialog",
          "aria-label": aria,
          style: { top: position.top, right: position.right },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-md-device-popover-head", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives6.StateDot, { state: deviceStateToDotState(device.state), size: 8 }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-md-device-popover-name", children: device.name }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-md-device-popover-state", children: t(stateLabelKey(device.state)) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("dl", { className: "dsh-md-device-popover-rows", children: [
              workspace !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: t("deviceChipWorkspace") }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dd", { title: workspace.title, children: workspace.title })
              ] }),
              device.origin?.cwd !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: t("deviceChipCwd") }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dd", { title: device.origin.cwd, children: device.origin.cwd })
              ] }),
              device.origin?.gitRemote !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: t("hoverGitRepoLabel") }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dd", { title: device.origin.gitRemote, children: device.origin.gitRemote })
              ] })
            ] }),
            offline && device.origin === void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsh-md-device-popover-error", children: t("deviceChipOfflineHint") }),
            showSwitchHint && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dsh-md-device-popover-hint", children: t("deviceChipSwitchHint") }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-md-device-popover-actions", children: [
              !device.isLocal && !online && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-md-device-popover-action",
                  onClick: () => {
                    void clientStore.reconnectDevice(device.deviceId);
                    setOpen(false);
                  },
                  children: t("reconnect")
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-md-device-popover-action",
                  onClick: () => {
                    setOpen(false);
                    onOpenSettings();
                  },
                  children: t("deviceChipOpenSettings")
                }
              )
            ] })
          ]
        }
      )
    ] })
  ] });
}

// src/client/styles.ts
var STYLE_TAG_ID = "dsh-multi-device/styles.css";
var CSS_TEXT = `
/* Manual Git match block */
.dsh-md-gitmatch {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}

.dsh-md-gitmatch-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 24px;
}

.dsh-md-gitmatch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsh-md-gitmatch-progress,
.dsh-md-gitmatch-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-gitmatch-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}

.dsh-md-gitmatch-phase,
.dsh-md-gitmatch-status-ok {
  color: var(--dsw-alias-state-success-primary);
}

.dsh-md-gitmatch-status-error {
  color: var(--dsw-alias-state-error-primary);
}

.dsh-md-gitmatch-detail {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-gitmatch-created {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.dsh-md-gitmatch-created li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dsh-md-gitmatch-path {
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-md-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Sidebar project row device badge (dot + device name / device count) */
.dsh-md-project-device {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  margin-left: 4px;
  max-width: 110px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-md-project-device-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-md-project-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: var(--dsw-alias-state-success-primary);
}

.dsh-md-project-dot[data-state='pending'] {
  background: var(--dsw-alias-state-warn-primary);
}

.dsh-md-project-dot[data-state='offline'] {
  background: var(--dsw-alias-state-idle-primary);
}

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

/* Sub-panel for nested settings like Merged Git Workspaces */
.dsh-md-subpanel {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: var(--dsw-radius-lg, 10px);
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsh-md-subpanel-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dsh-md-subpanel-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
}

.dsh-md-subpanel-icon {
  color: var(--dsw-alias-brand-primary, #679efe);
  flex-shrink: 0;
}

.dsh-md-subpanel-desc {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-merged-repos-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dsh-md-merged-repo-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l2);
}

.dsh-md-merged-repo-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.dsh-md-merged-repo-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsh-md-merged-repo-remote {
  font-size: 11px;
  font-family: var(--ds-font-family-code);
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsh-md-merged-repo-hint {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-state-warn-label);
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
  max-width: min(240px, 100%);
  height: 28px;
  font-size: 12px;
}

.dsh-md-native-select:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
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
  right: 0;
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
  position: absolute;
  top: var(--dsh-md-native-bar-top);
  left: 0;
  right: 0;
  height: var(--dsh-md-native-bar-height);
  box-sizing: border-box;
  z-index: 2;
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

html[data-platform='darwin'] .dsh-md-native-bar {
  -webkit-app-region: drag;
}

.dsh-md-native-bar button,
.dsh-md-native-bar [role='button'] {
  -webkit-app-region: no-drag;
}

.dsh-md-native-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
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

/* Owning-device chip on the conversation page (header + New Session row) */
.dsh-md-device-chip-wrap {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.dsh-md-device-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 220px;
  padding: 3px 8px;
  border: 0.5px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}

.dsh-md-device-chip:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-device-chip[data-state='error'] {
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-tertiary);
}

.dsh-md-device-chip[data-state='disabled'],
.dsh-md-device-chip[data-state='connecting'],
.dsh-md-device-chip[data-state='reconnecting'] {
  color: var(--dsw-alias-label-tertiary);
}

.dsh-md-device-chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-md-device-chip-offline {
  flex: none;
  padding: 0 5px;
  border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-interactive-bg-hover-solid);
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}

.dsh-md-device-chip-chevron {
  flex: none;
  opacity: 0.55;
}

.dsh-md-device-chip-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
}

.dsh-md-device-popover {
  position: fixed;
  z-index: 2147483001;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 300px;
  max-width: calc(100vw - 16px);
  padding: 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-panel);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-device-popover-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.dsh-md-device-popover-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
}

.dsh-md-device-popover-state {
  margin-left: auto;
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dsh-md-device-popover-rows {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 10px;
  margin: 0;
}

.dsh-md-device-popover-rows dt {
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}

.dsh-md-device-popover-rows dd {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  color: var(--dsw-alias-label-secondary);
}

.dsh-md-device-popover-hint,
.dsh-md-device-popover-error {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-md-device-popover-error {
  color: var(--dsw-alias-state-error-primary);
}

.dsh-md-device-popover-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 2px;
}

.dsh-md-device-popover-action {
  padding: 4px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}

.dsh-md-device-popover-action:hover {
  background: var(--dsw-alias-interactive-bg-hover);
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
function refreshModelCatalog(ctx) {
  try {
    const models = ctx.get?.("modelDirectories");
    models?.catalog?.refresh?.();
  } catch {
  }
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
async function ensureNativeLocalSelection(ctx) {
  const sessions = ctx.sessions;
  if (sessions === void 0) return;
  const list = sessions.list.getSnapshot();
  const current = currentMainSessionId(list);
  if (current === void 0 || !decodeSessionId(current).isRemote) return;
  const localSession = list.ids.find((id) => !decodeSessionId(id).isRemote);
  if (localSession !== void 0) {
    ctx.uiWorkspace?.openSession(localSession);
    return;
  }
  const localWorkspace = clientStore.getSnapshot().snapshot.allPhysicalWorkspaces.find((workspace) => workspace.deviceId === LOCAL_DEVICE_ID);
  if (localWorkspace !== void 0 && ctx.uiWorkspace !== void 0) {
    await ctx.uiWorkspace.openWorkspace(localWorkspace.remoteWorkspaceId);
  }
}
function installModeSideEffects(ctx) {
  let lastMode = clientStore.getSnapshot().displayMode;
  let reconciling = false;
  let reconcileAgain = false;
  let guarding = false;
  const reconcile = async (mode) => {
    if (reconciling) {
      reconcileAgain = true;
      return;
    }
    reconciling = true;
    try {
      await ctx.sessions?.refresh();
    } catch {
    }
    refreshModelCatalog(ctx);
    if (mode === "native") {
      try {
        await ensureNativeLocalSelection(ctx);
      } catch {
      }
    }
    reconciling = false;
    if (reconcileAgain) {
      reconcileAgain = false;
      await reconcile(clientStore.getSnapshot().displayMode);
    }
  };
  const unsubscribeStore = clientStore.subscribe(() => {
    const mode = clientStore.getSnapshot().displayMode;
    if (mode === lastMode) return;
    lastMode = mode;
    void reconcile(mode);
  });
  const unsubscribeSessions = ctx.sessions?.list.subscribe?.(() => {
    if (clientStore.getSnapshot().displayMode !== "native" || guarding) return;
    const list = ctx.sessions?.list.getSnapshot();
    const current = list === void 0 ? void 0 : currentMainSessionId(list);
    if (current === void 0 || !decodeSessionId(current).isRemote) return;
    guarding = true;
    void ensureNativeLocalSelection(ctx).finally(() => {
      guarding = false;
    });
  });
  if (clientStore.getSnapshot().displayMode === "native") void reconcile("native");
  return () => {
    unsubscribeStore();
    unsubscribeSessions?.();
  };
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
  const refreshCatalog = () => refreshModelCatalog(ctx);
  ctx.effect(
    () => installProjectDeviceBadges(getTranslate()),
    "dsh-multi-device: project device badges"
  );
  ctx.inject(["sessions", "uiWorkspace"], (modeCtx) => {
    modeCtx.effect(
      () => installModeSideEffects(modeCtx),
      "dsh-multi-device: native local surface"
    );
    modeCtx.effect(
      () => bindClientServices({
        sessions: modeCtx.sessions,
        uiWorkspace: modeCtx.uiWorkspace
      }),
      "dsh-multi-device: client service handles"
    );
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
        ModeSwitcherOverlay,
        {
          t: props.t ?? getTranslate(),
          onOpenSettings: handleOpenSettings
        }
      )
    )
  );
  ctx.slots.inject(
    "conversation.input.right",
    () => ctx.slots.register(
      {
        name: "conversation.input.right",
        id: "multi-device-active-session",
        order: -100
      },
      (props) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ActiveSessionReporter, { sessionId: props.sessionId, onScopeReported: refreshCatalog })
    )
  );
  ctx.slots.inject(
    "conversation.session.header.utilities",
    () => ctx.slots.register(
      {
        name: "conversation.session.header.utilities",
        id: "multi-device-session-device",
        order: 20,
        locale: LOCALE_NS
      },
      (props) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        SessionDeviceChip,
        {
          sessionId: props.sessionId,
          t: props.t ?? getTranslate(),
          onOpenSettings: handleOpenSettings
        }
      )
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
      (props) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(SessionRowHoverDeviceSection, { sessionId: props.sessionId, t: props.t ?? getTranslate() })
    )
  );
}
return module.exports; } });
//# sourceMappingURL=client.js.map

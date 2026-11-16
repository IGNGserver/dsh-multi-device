window.__ModuleLoader__.load({ id: 'dsh-multi-device', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";var __defProp=Object.defineProperty;var __getOwnPropDesc=Object.getOwnPropertyDescriptor;var __getOwnPropNames=Object.getOwnPropertyNames;var __hasOwnProp=Object.prototype.hasOwnProperty;var __export=(target,all)=>{for(var name in all)__defProp(target,name,{get:all[name],enumerable:!0})},__copyProps=(to,from,except,desc)=>{if(from&&typeof from=="object"||typeof from=="function")for(let key of __getOwnPropNames(from))!__hasOwnProp.call(to,key)&&key!==except&&__defProp(to,key,{get:()=>from[key],enumerable:!(desc=__getOwnPropDesc(from,key))||desc.enumerable});return to};var __toCommonJS=mod=>__copyProps(__defProp({},"__esModule",{value:!0}),mod);var index_exports={};__export(index_exports,{PANEL_ID:()=>PANEL_ID,SETTINGS_SECTION_ID:()=>SETTINGS_SECTION_ID,apply:()=>apply,inject:()=>inject,installLocalSessionTracking:()=>installLocalSessionTracking,openSettingsSection:()=>openSettingsSection});module.exports=__toCommonJS(index_exports);var import_react10=require("react");var import_react=require("react"),services={},sessionListeners=new Set,unsubscribeSessions;function attachSessionList(){unsubscribeSessions?.(),unsubscribeSessions=sessionListeners.size>0?services.sessions?.list.subscribe?.(notifySessionListeners):void 0}function notifySessionListeners(){for(let listener of[...sessionListeners])try{listener()}catch{}}function subscribeSessionSummary(listener){return sessionListeners.add(listener),sessionListeners.size===1&&attachSessionList(),()=>{sessionListeners.delete(listener),sessionListeners.size===0&&attachSessionList()}}function bindClientServices(next){return services=next,attachSessionList(),notifySessionListeners(),()=>{services===next&&(services={},attachSessionList(),notifySessionListeners())}}function getClientServices(){return services}function useSessionListSnapshot(){return(0,import_react.useSyncExternalStore)(subscribeSessionSummary,()=>services.sessions?.list.getSnapshot(),()=>{})}var LOCALE_NS="multiDevice",zh={settingsSectionTitle:"\u591A\u8BBE\u5907",settingsSectionIntro:"\u901A\u8FC7 SSH \u8FDE\u63A5\u8FDC\u7AEF\u5F00\u53D1\u673A\u3002\u9876\u90E8\u6807\u7B7E\u9875\u5E38\u9A7B\uFF1A\u672C\u673A\u663E\u793A\u672C\u5730 DSH\uFF0C\u6BCF\u53F0\u8FDC\u7AEF\u8BBE\u5907\u5728\u5404\u81EA\u7684\u6807\u7B7E\u9875\u91CC\u8FD0\u884C\u5B8C\u6574\u754C\u9762\u3002",pluginSummary:"\u901A\u8FC7 SSH \u8FDE\u63A5\u591A\u53F0\u8FDC\u7AEF DSH \u5F00\u53D1\u673A\uFF0C\u7528\u9876\u90E8\u6807\u7B7E\u9875\u5207\u6362\u672C\u673A\u4E0E\u5404\u8BBE\u5907\u7684\u5B8C\u6574\u754C\u9762\u3002",close:"\u5173\u95ED",nativeLocalTab:"\u672C\u673A",nativeTabsLabel:"\u539F\u751F\u6A21\u5F0F\u8BBE\u5907\u6807\u7B7E\u9875",devicesHeading:"\u8FDC\u7AEF\u8BBE\u5907",addDevice:"\u6DFB\u52A0\u8BBE\u5907",editDevice:"\u7F16\u8F91\u8BBE\u5907",importSshPlaceholder:"\u4ECE ~/.ssh/config \u5FEB\u901F\u586B\u5165\u2026",sshHost:"SSH \u4E3B\u673A",sshHostPlaceholder:"~/.ssh/config \u4E3B\u673A\u522B\u540D\u3001IP\uFF0C\u6216 user@host:port",deviceName:"\u663E\u793A\u540D\u79F0\uFF08\u53EF\u9009\uFF09",deviceNamePlaceholder:"\u7559\u7A7A\u9ED8\u8BA4\u4F7F\u7528\u4E3B\u673A\u540D",authCredential:"\u8FDC\u7AEF\u542F\u52A8\u94FE\u63A5\u6216 Token\uFF08\u53EF\u9009\uFF09",authCredentialPlaceholder:"\u9996\u6B21\u8FDE\u63A5\u53EF\u7C98\u8D34 dsh web \u542F\u52A8\u94FE\u63A5\u6216 Token\uFF1B\u5DF2\u8BA4\u8BC1\u53EF\u7559\u7A7A",advancedOptions:"\u9AD8\u7EA7\u8FDE\u63A5\u9009\u9879",remoteDshPort:"\u8FDC\u7AEF DSH \u7AEF\u53E3",sshUser:"SSH \u7528\u6237\u540D",sshUserPlaceholder:"\u7559\u7A7A\u590D\u7528 ~/.ssh/config",sshPort:"SSH \u7AEF\u53E3",sshPortPlaceholder:"\u9ED8\u8BA4 22 / \u590D\u7528 ~/.ssh/config",deviceEnabledLabel:"\u542F\u7528\u6B64\u8FDC\u7AEF\u8BBE\u5907\u8FDE\u63A5",sshKeySelect:"SSH \u79C1\u94A5",sshKeyAuto:"\u81EA\u52A8\uFF08SSH Agent / \u9ED8\u8BA4\u5BC6\u94A5\uFF09",sshKeyAutoDesc:"\u4F18\u5148\u590D\u7528\u7CFB\u7EDF SSH Agent \u6216\u9ED8\u8BA4\u5BC6\u94A5\u5BF9",sshKeyPassphrase:"\u79C1\u94A5\u53E3\u4EE4",sshKeyPassphrasePlaceholder:"\u8F93\u5165\u52A0\u5BC6\u79C1\u94A5\u53E3\u4EE4\uFF1B\u7559\u7A7A\u4F7F\u7528 SSH Agent",sshProxyJump:"ProxyJump \u8DF3\u677F\u673A",sshProxyJumpPlaceholder:"\u53EF\u9009\uFF0C\u7559\u7A7A\u590D\u7528 ~/.ssh/config",authBootstrap:"\u901A\u8FC7 SSH \u8BFB\u53D6\u8FDC\u7AEF\u51ED\u636E\u5E76\u7B7E\u53D1 Cookie\uFF08\u7B7E\u540D\u5BC6\u94A5\u4E0D\u5199\u5165\u672C\u673A\uFF09",remoteDshHome:"\u8FDC\u7AEF DSH \u4E3B\u76EE\u5F55\uFF08\u53EF\u9009\uFF09",remoteDshHomePlaceholder:"\u9ED8\u8BA4 ~/.dsh",testConnection:"\u6D4B\u8BD5\u8FDE\u63A5",testingConnection:"\u6D4B\u8BD5\u4E2D\u2026",testPassed:"\u8FDE\u63A5\u6210\u529F",saveDevice:"\u4FDD\u5B58",savingDevice:"\u4FDD\u5B58\u4E2D\u2026",saveAnyway:"\u4ECD\u7136\u4FDD\u5B58",cancel:"\u53D6\u6D88",reconnect:"\u91CD\u65B0\u8FDE\u63A5",reconnectedNotice:"\u5DF2\u89E6\u53D1\u91CD\u65B0\u8FDE\u63A5",remove:"\u79FB\u9664",deleteTitle:"\u79FB\u9664\u8BBE\u5907\u201C{name}\u201D\uFF1F",deleteDescription:"\u79FB\u9664\u540E\u5C06\u65AD\u5F00\u8BE5\u8BBE\u5907\u7684 SSH \u96A7\u9053\u5E76\u5173\u95ED\u5176\u6807\u7B7E\u9875\u3002\u8FDC\u7AEF\u8BBE\u5907\u4E0A\u7684\u6570\u636E\u4E0D\u53D7\u5F71\u54CD\u3002",deleteConfirm:"\u79FB\u9664\u8BBE\u5907",deletingDevice:"\u79FB\u9664\u4E2D\u2026",openExternal:"\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00",reloadPage:"\u5237\u65B0\u8FDC\u7AEF\u9875\u9762",releaseKeepAlive:"\u5173\u95ED\u540E\u53F0\u4FDD\u6D3B\u9875\u9762",attentionPending:"\u5F85\u56DE\u590D",attentionRunning:"\u8FD0\u884C\u4E2D",attentionUnread:"\u5B8C\u6210\u672A\u8BFB",attentionStatus:"\u72B6\u6001",attentionStale:"\u540C\u6B65\u4E2D / \u6570\u636E\u8FC7\u671F",attentionLastKnown:"\u4E0A\u6B21\u5DF2\u77E5",attentionMembers:"\u4F1A\u8BDD\u6210\u5458",attentionUnavailable:"\u65E7\u7248 Host \u672A\u63D0\u4F9B\u6210\u5458 ID",attentionCopy:"\u590D\u5236 ID",attentionCopied:"\u5DF2\u590D\u5236",attentionCopyFailed:"\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9 ID",attentionRequests:"\u5F85\u5904\u7406\u8BF7\u6C42",attentionOpenFailed:"\u6253\u5F00\u4F1A\u8BDD\u5931\u8D25",attentionOpenHint:"\u70B9\u51FB\u6253\u5F00\u4F1A\u8BDD",clearUnread:"\u6E05\u9664\u672A\u8BFB",clearedUnreadNotice:"\u5DF2\u6E05\u9664 {count} \u6761\u672A\u8BFB",noDevicesTitle:"\u5C1A\u672A\u6DFB\u52A0\u8FDC\u7AEF\u8BBE\u5907",noDevicesDesc:"\u70B9\u51FB\u4E0A\u65B9\u201C\u6DFB\u52A0\u8BBE\u5907\u201D\uFF0C\u901A\u8FC7 SSH \u8FDE\u63A5\u4F60\u7684\u5176\u4ED6\u5F00\u53D1\u673A\u6216\u670D\u52A1\u5668\u3002",bridgeFailedTitle:"\u8BBE\u5907 {name} \u7684\u9875\u9762\u6865\u63A5\u5931\u8D25",bridgeFailedError:"\u539F\u56E0\uFF1A{error}",bridgeFailedReload:"\u91CD\u65B0\u52A0\u8F7D",crossHostReadStateTitle:"\u8DE8 DSH Host \u540C\u6B65\u672A\u8BFB\u72B6\u6001",crossHostReadStateDesc:"\u4EC5\u5728\u591A\u53F0\u7535\u8111\u5404\u81EA\u8FD0\u884C DSH Host \u65F6\u9700\u8981\u3002\u5F00\u542F\u540E\u901A\u8FC7\u73B0\u6709 SSH \u5728\u80FD\u8BC6\u522B POSIX DSH \u5BB6\u76EE\u5F55\u7684\u8FDC\u7AEF\u8BBE\u5907\u4E0A\u4FDD\u5B58\u4E00\u4E2A\u53EA\u542B\u4F1A\u8BDD ID \u4E0E\u65F6\u95F4\u6233\u7684\u72B6\u6001\u6587\u4EF6\uFF1B\u4E0D\u5B89\u88C5\u8FDC\u7AEF\u63D2\u4EF6\uFF0C\u4E5F\u4E0D\u4E0A\u4F20\u6D88\u606F\u5185\u5BB9\u3002\u9ED8\u8BA4\u5173\u95ED\u3002",crossHostUiStateTitle:"\u8DE8\u63A7\u5236\u673A\u540C\u6B65\u754C\u9762\u72B6\u6001",crossHostUiStateDesc:"\u4EC5\u5728\u591A\u53F0\u7535\u8111\u90FD\u4F5C\u4E3A\u63A7\u5236\u673A\u3001\u5404\u81EA\u5B89\u88C5\u672C\u63D2\u4EF6\u65F6\u9700\u8981\u3002\u628A\u8FDC\u7AEF\u9875\u9762\u7684\u6298\u53E0/\u5206\u7EC4/\u6392\u5E8F/\u5F52\u6863\u8FC7\u6EE4\u5199\u5165\u8FDC\u7AEF DSH \u5BB6\u76EE\u5F55\u7684\u4E00\u4E2A\u5C0F\u6587\u4EF6\uFF0C\u4F9B\u5176\u4ED6\u63A7\u5236\u673A\u8BFB\u53D6\uFF1B\u8FDC\u7AEF\u4E0D\u5B89\u88C5\u63D2\u4EF6\u3001\u4E0D\u8FD0\u884C\u5B88\u62A4\u8FDB\u7A0B\uFF0C\u4E5F\u53EA\u542B\u754C\u9762\u72B6\u6001\u3002\u9ED8\u8BA4\u5173\u95ED\u3002",savedNotice:"\u8BBE\u7F6E\u5DF2\u4FDD\u5B58",actionFailed:"\u64CD\u4F5C\u5931\u8D25",authRequired:"\u9700\u8981\u767B\u5F55",authPanelTitle:"\u8FDC\u7AEF DSH \u9700\u8981\u767B\u5F55",authPanelDesc:"SSH \u96A7\u9053\u5DF2\u8FDE\u901A\uFF0C\u4F46\u8FDC\u7AEF DSH \u62D2\u7EDD\u4E86\u5F53\u524D\u51ED\u636E\u3002\u53EF\u7C98\u8D34 dsh web \u542F\u52A8\u65F6\u6253\u5370\u7684\u94FE\u63A5/Token\uFF0C\u6216\u8BA9\u63D2\u4EF6\u901A\u8FC7 SSH \u91CD\u65B0\u7B7E\u53D1 Cookie\u3002",authCredentialLabel:"\u542F\u52A8\u94FE\u63A5\u6216 Token",authTokenPlaceholder:"\u7C98\u8D34 http://127.0.0.1:3080/?token=\u2026 \u6216\u88F8 Token",authSubmit:"\u767B\u5F55\u5E76\u91CD\u8BD5",authUseSsh:"\u901A\u8FC7 SSH \u81EA\u52A8\u4FEE\u590D",authChecking:"\u6B63\u5728\u9A8C\u8BC1\u2026",authFailed:"\u767B\u5F55\u5931\u8D25",authBackLocal:"\u8FD4\u56DE\u672C\u673A",authOpenSettings:"\u6253\u5F00\u591A\u8BBE\u5907\u8BBE\u7F6E",authHint:"\u82E5\u8FDC\u7AEF DSH \u5173\u95ED\u4E86 Token \u767B\u5F55\uFF0C\u8BF7\u5728\u8FDC\u7AEF\u91CD\u65B0\u542F\u52A8 dsh web \u540E\u7C98\u8D34\u65B0\u7684\u542F\u52A8\u94FE\u63A5\u3002",diagnosticsTitle:"\u8BCA\u65AD\u4FE1\u606F",diagnosticsDesc:"\u5BFC\u51FA\u4E00\u4EFD\u53EF\u590D\u5236\u7684\u73B0\u573A\u5FEB\u7167\uFF1A\u6BCF\u53F0\u8BBE\u5907\u7684\u8FDE\u63A5\u72B6\u6001\u3001\u534F\u8BAE\u7248\u672C\u3001\u4F1A\u8BDD\u8BA1\u6570\u4E0E\u9519\u8BEF\uFF0C\u4EE5\u53CA\u6D4F\u89C8\u5668\u89C6\u53E3\u548C\u9876\u90E8\u6807\u7B7E\u680F\u5C3A\u5BF8\u3002\u5206\u4EAB\u524D\u8BF7\u4EBA\u5DE5\u5BA1\u67E5\u5E76\u8131\u654F\u3002",diagnosticsRun:"\u751F\u6210\u8BCA\u65AD",diagnosticsCopy:"\u590D\u5236",diagnosticsCopied:"\u8BCA\u65AD\u4FE1\u606F\u5DF2\u590D\u5236",diagnosticsCopyFailed:"\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9\u4E0B\u65B9\u6587\u672C",openDevice:"\u6253\u5F00\u8BBE\u5907\u754C\u9762",diagnosticsSummaryLine:"\u8BBE\u5907 {devices} \u53F0 \xB7 \u5DF2\u8FDE\u63A5 {connected} \u53F0",keyReveal:"\u663E\u793A\u51ED\u636E",keyHide:"\u9690\u85CF\u51ED\u636E",pendingCount:"{count} \u5F85\u56DE\u590D",runningCount:"{count} \u8FD0\u884C\u4E2D",unreadCount:"{count} \u5B8C\u6210\u672A\u8BFB",taskbarSummaryTitle:"\u7A97\u53E3\u6807\u9898\u663E\u793A\u4EFB\u52A1\u6C47\u603B",taskbarSummaryDesc:"\u5F00\u542F\u540E\u7A97\u53E3\u4E0E\u4EFB\u52A1\u680F\u6807\u9898\u6539\u4E3A\u6240\u6709\u8BBE\u5907\u7684\u4EFB\u52A1\u8BA1\u6570\uFF0C\u4E0E\u6807\u7B7E\u80F6\u56CA\u540C\u4E00\u53E3\u5F84\uFF1A\u84DD\uFF1D\u8FD0\u884C\u4E2D\u3001\u9EC4\uFF1D\u5F85\u56DE\u590D\u3001\u7EFF\uFF1D\u5B8C\u6210\u672A\u8BFB\uFF0C\u4F8B\u5982\u300C1\u8DD1 2\u7ED3\u300D\u3002\u6CA1\u6709\u6210\u5458\u7684\u7C7B\u522B\u4E0D\u663E\u793A\uFF0C\u5168\u90E8\u4E3A\u96F6\u65F6\u4ECD\u663E\u793A\u4F1A\u8BDD\u540D\u3002\u9ED8\u8BA4\u5173\u95ED\u3002",taskbarRunningSegment:"{count}\u8DD1",taskbarPendingSegment:"{count}\u5F85",taskbarUnreadSegment:"{count}\u7ED3",enableDevice:"\u542F\u7528\u8BBE\u5907",disableDevice:"\u505C\u7528\u8BBE\u5907",deviceDisabledTag:"\u5DF2\u505C\u7528",deviceEnabledNotice:"\u5DF2\u542F\u7528\u8BBE\u5907 {name}",deviceDisabledNotice:"\u5DF2\u505C\u7528\u8BBE\u5907 {name}",keepAliveMaxPagesTitle:"\u540E\u53F0\u4FDD\u6D3B\u9875\u9762\u4E0A\u9650",keepAliveMaxPagesDesc:"\u540C\u65F6\u4FDD\u7559\u5728\u5185\u5B58\u4E2D\u7684\u8FDC\u7AEF\u8BBE\u5907\u9875\u9762\u6570\u91CF\uFF08\u542B\u672A\u53D1\u9001\u8349\u7A3F\u7684\u9875\u9762\u5C06\u81EA\u52A8\u8C41\u514D\u6DD8\u6C70\uFF09\u3002\u8C03\u4F4E\u53EF\u663E\u8457\u51CF\u5C11\u63A7\u5236\u7AEF\u5185\u5B58\u5360\u7528\u3002",keepAlivePagesOption:"{count} \u53F0\u8BBE\u5907",keepAliveIdleTitle:"\u540E\u53F0\u95F2\u7F6E\u81EA\u52A8\u4F11\u7720",keepAliveIdleDesc:"\u975E\u5F53\u524D\u67E5\u770B\u4E14\u65E0\u672A\u53D1\u9001\u8349\u7A3F\u7684\u540E\u53F0\u8BBE\u5907\u9875\u9762\uFF0C\u8D85\u8FC7\u95F2\u7F6E\u65F6\u957F\u540E\u81EA\u52A8\u5378\u8F7D\u91CA\u653E\u5185\u5B58\uFF1B\u5207\u56DE\u6807\u7B7E\u9875\u65F6\u81EA\u52A8\u6062\u590D\u539F\u4F1A\u8BDD\uFF0C\u4E0D\u5F71\u54CD\u8FDC\u7AEF\u8FD0\u884C\u4E2D\u7684\u4EFB\u52A1\u3002",keepAliveIdleNever:"\u4ECE\u4E0D\u4F11\u7720",keepAliveIdleMinutesOption:"{minutes} \u5206\u949F"},en={settingsSectionTitle:"Multi-Device",settingsSectionIntro:"Connect remote machines over SSH. A tab strip stays on top: This Device is your local DSH, and every remote device runs its complete UI in its own tab.",pluginSummary:"Connect remote DSH machines over SSH and switch between full native UIs in a persistent tab strip.",close:"Close",nativeLocalTab:"This Device",nativeTabsLabel:"Native Mode device tabs",devicesHeading:"Remote devices",addDevice:"Add device",editDevice:"Edit device",importSshPlaceholder:"Quick fill from ~/.ssh/config\u2026",sshHost:"SSH host",sshHostPlaceholder:"~/.ssh/config alias, IP, or user@host:port",deviceName:"Display name (optional)",deviceNamePlaceholder:"Defaults to the SSH host name",authCredential:"Remote launch URL or token (optional)",authCredentialPlaceholder:"Paste URL or token printed by dsh web on first login; leave blank afterwards",advancedOptions:"Advanced connection options",remoteDshPort:"Remote DSH port",sshUser:"SSH user",sshUserPlaceholder:"Blank reuses ~/.ssh/config",sshPort:"SSH port",sshPortPlaceholder:"Default 22 / reuse ~/.ssh/config",deviceEnabledLabel:"Enable this remote device connection",sshKeySelect:"SSH private key",sshKeyAuto:"Auto (SSH Agent / default keys)",sshKeyAutoDesc:"Reuse keys from system SSH Agent or default key pair",sshKeyPassphrase:"Key passphrase",sshKeyPassphrasePlaceholder:"Passphrase for encrypted key; blank uses SSH Agent",sshProxyJump:"ProxyJump",sshProxyJumpPlaceholder:"Optional; blank reuses ~/.ssh/config",authBootstrap:"Read remote credentials over SSH and mint a cookie (signing secret is not saved locally)",remoteDshHome:"Remote DSH home (optional)",remoteDshHomePlaceholder:"Defaults to ~/.dsh",testConnection:"Test connection",testingConnection:"Testing\u2026",testPassed:"Connected",saveDevice:"Save",savingDevice:"Saving\u2026",saveAnyway:"Save anyway",cancel:"Cancel",reconnect:"Reconnect",reconnectedNotice:"Reconnection triggered",remove:"Remove",deleteTitle:'Remove device "{name}"?',deleteDescription:"Removing drops this device\u2019s SSH tunnel and closes its tab. Data on the remote machine is not touched.",deleteConfirm:"Remove device",deletingDevice:"Removing\u2026",openExternal:"Open in browser",reloadPage:"Reload remote page",releaseKeepAlive:"Close background page",attentionPending:"Needs reply",attentionRunning:"Running",attentionUnread:"Finished, unread",attentionStatus:"status",attentionStale:"Syncing / stale data",attentionLastKnown:"Last known",attentionMembers:"Session members",attentionUnavailable:"Older Host did not provide member IDs",attentionCopy:"Copy ID",attentionCopied:"Copied",attentionCopyFailed:"Copy failed; select the ID manually",attentionRequests:"pending requests",attentionOpenFailed:"Could not open session",attentionOpenHint:"Click to open the session",clearUnread:"Clear unread",clearedUnreadNotice:"Cleared {count} unread reminders",noDevicesTitle:"No remote devices yet",noDevicesDesc:'Select "Add device" above to connect another machine over SSH.',bridgeFailedTitle:"The page bridge for {name} failed",bridgeFailedError:"Reason: {error}",bridgeFailedReload:"Reload",crossHostReadStateTitle:"Sync unread state across DSH Hosts",crossHostReadStateDesc:"Only needed when several computers run their own DSH Host. Writes a tiny session-ID/timestamp file into remote DSH homes reachable over the existing SSH transport with a POSIX home; no remote plugin is installed and no message content is uploaded. Off by default.",crossHostUiStateTitle:"Sync view state across Controllers",crossHostUiStateDesc:"Only needed when several computers are Controllers with this plugin installed. Writes each remote page's fold/group/sort/archive filter into one small file in the remote DSH home for other Controllers to read. No remote plugin, daemon, Session body, or credential is involved. Off by default.",savedNotice:"Settings saved",actionFailed:"Action failed",authRequired:"Sign-in required",authPanelTitle:"Remote DSH requires sign-in",authPanelDesc:"The SSH tunnel is up, but the remote DSH rejected the current credential. Paste the launch URL/token printed by dsh web, or let the plugin mint a fresh cookie over SSH.",authCredentialLabel:"Launch URL or token",authTokenPlaceholder:"Paste http://127.0.0.1:3080/?token=\u2026 or a bare token",authSubmit:"Sign in and retry",authUseSsh:"Repair via SSH",authChecking:"Verifying\u2026",authFailed:"Sign-in failed",authBackLocal:"Back to This Device",authOpenSettings:"Open Multi-Device settings",authHint:"If the remote DSH disabled token sign-in, restart dsh web there and paste the new launch URL.",diagnosticsTitle:"Diagnostics",diagnosticsDesc:"Export a copyable snapshot: every device\u2019s connection state, protocol version, session counts and errors, plus the browser viewport and tab-bar geometry. Review and redact before sharing.",diagnosticsRun:"Generate diagnostics",diagnosticsCopy:"Copy",diagnosticsCopied:"Diagnostics copied",diagnosticsCopyFailed:"Copy failed; select the text below instead",openDevice:"Open device",diagnosticsSummaryLine:"{devices} devices \xB7 {connected} connected",keyReveal:"Show credential",keyHide:"Hide credential",pendingCount:"{count} needs reply",runningCount:"{count} running",unreadCount:"{count} finished, unread",taskbarSummaryTitle:"Show task totals in the window title",taskbarSummaryDesc:`Replaces the window and taskbar title with every device's task counts, the same categories as the tab capsule (blue running, amber needs reply, green finished-unread), for example "1 run 2 done". Empty categories are omitted and an all-zero tally keeps the conversation title. Off by default.`,taskbarRunningSegment:"{count} run",taskbarPendingSegment:"{count} wait",taskbarUnreadSegment:"{count} done",enableDevice:"Enable device",disableDevice:"Disable device",deviceDisabledTag:"Disabled",deviceEnabledNotice:"Enabled {name}",deviceDisabledNotice:"Disabled {name}",keepAliveMaxPagesTitle:"Background keep-alive page limit",keepAliveMaxPagesDesc:"Maximum remote device pages kept mounted in memory at once (pages with unsent drafts are spared automatically). Lowering this reduces Controller memory usage.",keepAlivePagesOption:"{count} devices",keepAliveIdleTitle:"Hibernate idle background pages",keepAliveIdleDesc:"Automatically unmount inactive, draft-free background device pages after idle time to reclaim memory; re-selecting the tab restores the last session without interrupting remote tasks.",keepAliveIdleNever:"Never",keepAliveIdleMinutesOption:"{minutes} min"};var import_dsh_client_ui_primitives6=require("@deepseek-ai/dsh-client-ui-primitives"),import_react9=require("react");var import_dsh_client_ui_primitives3=require("@deepseek-ai/dsh-client-ui-primitives"),import_react5=require("react");function fallbackCopyText(text){if(typeof document>"u")return!1;let value=String(text),area;try{area=document.createElement("textarea"),area.value=value,area.setAttribute("readonly",""),area.style.position="fixed",area.style.top="-1000px",area.style.left="-1000px",area.style.opacity="0";let parent=document.body??document.documentElement;if(parent===null)return!1;parent.appendChild(area);let selection=typeof document.getSelection=="function"?document.getSelection():null,previousRange=selection!==null&&selection.rangeCount>0?selection.getRangeAt(0):null;area.select();let copied=!1;try{copied=document.execCommand("copy")}catch{copied=!1}if(area.remove(),selection!==null&&previousRange!==null)try{selection.removeAllRanges(),selection.addRange(previousRange)}catch{}return copied}catch{try{area?.remove()}catch{}return!1}}async function copyText(text){let value=String(text);try{if(typeof navigator<"u"&&navigator.clipboard!==void 0&&typeof navigator.clipboard.writeText=="function")return await navigator.clipboard.writeText(value),!0}catch{}return fallbackCopyText(value)}var import_dsh_client_ui_primitives=require("@deepseek-ai/dsh-client-ui-primitives"),import_react2=require("react"),import_jsx_runtime=require("react/jsx-runtime");function CheckmarkIcon(){return(0,import_jsx_runtime.jsx)("svg",{width:14,height:14,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",className:"dsh-md-select-check",children:(0,import_jsx_runtime.jsx)("polyline",{points:"3 8.5 6.5 12 13 4.5"})})}function DshSelect({id,value,options,onChange,placeholder,disabled=!1,compact=!1,clearOnSelect=!1,className="",ariaLabel,style}){let generatedId=(0,import_react2.useId)(),selectId=id??generatedId,listboxId=`${selectId}-listbox`,[open,setOpen]=(0,import_react2.useState)(!1),containerRef=(0,import_react2.useRef)(null),triggerRef=(0,import_react2.useRef)(null),selectedOption=options.find(o=>o.value===value),displayLabel=selectedOption?.label??placeholder??(value!==""?value:"");(0,import_react2.useEffect)(()=>{if(!open)return;let handlePointerDown=event=>{containerRef.current&&!containerRef.current.contains(event.target)&&setOpen(!1)},handleKeyDown=event=>{event.key==="Escape"&&(setOpen(!1),triggerRef.current?.focus())};return document.addEventListener("mousedown",handlePointerDown),document.addEventListener("keydown",handleKeyDown),()=>{document.removeEventListener("mousedown",handlePointerDown),document.removeEventListener("keydown",handleKeyDown)}},[open]);let handleSelect=optionValue=>{onChange(optionValue),setOpen(!1),clearOnSelect||triggerRef.current?.focus()},toggle=()=>{disabled||setOpen(prev=>!prev)};return(0,import_jsx_runtime.jsxs)("div",{ref:containerRef,className:`dsh-md-select-container${compact?" isCompact":""}${open?" isOpen":""}${disabled?" isDisabled":""} ${className}`.trim(),style,children:[(0,import_jsx_runtime.jsxs)("button",{ref:triggerRef,id:selectId,type:"button",className:"dsh-md-select-trigger","aria-haspopup":"listbox","aria-expanded":open,"aria-controls":open?listboxId:void 0,"aria-label":ariaLabel??placeholder,disabled,onClick:toggle,children:[(0,import_jsx_runtime.jsxs)("span",{className:"dsh-md-select-trigger-content",children:[selectedOption?.dotState&&(0,import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot,{state:selectedOption.dotState,size:7}),(0,import_jsx_runtime.jsx)("span",{className:`dsh-md-select-label${!selectedOption&&placeholder?" isPlaceholder":""}`,children:displayLabel})]}),(0,import_jsx_runtime.jsx)("span",{className:`dsh-md-select-arrow${open?" isOpen":""}`,children:(0,import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular,{size:13})})]}),open&&(0,import_jsx_runtime.jsx)("div",{id:listboxId,role:"listbox",tabIndex:-1,"aria-label":ariaLabel??placeholder,className:"dsh-md-select-dropdown",children:options.length===0?(0,import_jsx_runtime.jsx)("div",{className:"dsh-md-select-empty",children:placeholder??"No options"}):options.map(opt=>{let isSelected=!clearOnSelect&&opt.value===value;return(0,import_jsx_runtime.jsxs)("button",{type:"button",role:"option","aria-selected":isSelected,disabled:opt.disabled,className:`dsh-md-select-option${isSelected?" isSelected":""}${opt.disabled?" isDisabled":""}`,onClick:()=>handleSelect(opt.value),children:[(0,import_jsx_runtime.jsxs)("div",{className:"dsh-md-select-option-main",children:[opt.dotState&&(0,import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot,{state:opt.dotState,size:7}),(0,import_jsx_runtime.jsx)("span",{className:"dsh-md-select-option-title",children:opt.label}),opt.badge&&(0,import_jsx_runtime.jsx)("span",{className:"dsh-md-select-option-badge",children:opt.badge})]}),opt.description&&(0,import_jsx_runtime.jsx)("div",{className:"dsh-md-select-option-desc",title:opt.description,children:opt.description}),isSelected&&(0,import_jsx_runtime.jsx)("span",{className:"dsh-md-select-check-wrap",children:(0,import_jsx_runtime.jsx)(CheckmarkIcon,{})})]},opt.value)})})]})}var LOCAL_DEVICE_ID="local";function sanitizeWorkspaceViewState(value){let groups={};if(typeof value=="object"&&value!==null&&!Array.isArray(value)){let raw=value,split=raw.groups;if(typeof split=="object"&&split!==null&&!Array.isArray(split)){let count=0;for(let[key,expanded]of Object.entries(split)){if(count>=1e3)break;typeof key!="string"||key===""||key.length>256||key==="__proto__"||key==="constructor"||key==="prototype"||typeof expanded=="boolean"&&(groups[key]=expanded,count+=1)}}let groupBy=raw.groupBy,orderBy=raw.orderBy,archivedFilter=raw.archivedFilter;return{groups,...groupBy==="workspace"||groupBy==="flat"||groupBy==="workspace-tree"?{groupBy}:{},...orderBy==="updated"||orderBy==="manual"?{orderBy}:{},...archivedFilter==="default"||archivedFilter==="show"||archivedFilter==="only"?{archivedFilter}:{}}}return{groups}}var REMOTE_SESSION_PREFIX="md~";var SEPARATOR="~";function encodeRemoteSessionId(deviceId,remoteSessionId){return deviceId===LOCAL_DEVICE_ID||remoteSessionId.startsWith(REMOTE_SESSION_PREFIX)?remoteSessionId:`${REMOTE_SESSION_PREFIX}${escapeSegment(deviceId)}${SEPARATOR}${remoteSessionId}`}function decodeSessionId(sessionId){if(!sessionId.startsWith(REMOTE_SESSION_PREFIX))return{deviceId:LOCAL_DEVICE_ID,rawSessionId:sessionId,isRemote:!1};let rest=sessionId.slice(REMOTE_SESSION_PREFIX.length),sepIndex=rest.indexOf(SEPARATOR);if(sepIndex<=0||sepIndex===rest.length-1)return{deviceId:LOCAL_DEVICE_ID,rawSessionId:sessionId,isRemote:!1};let rawSessionId=rest.slice(sepIndex+1);return rawSessionId.startsWith(REMOTE_SESSION_PREFIX)?{deviceId:LOCAL_DEVICE_ID,rawSessionId:sessionId,isRemote:!1}:{deviceId:unescapeSegment(rest.slice(0,sepIndex)),rawSessionId,isRemote:!0}}function escapeSegment(value){return value.replaceAll("%","%25").replaceAll("~","%7E")}function unescapeSegment(value){return value.replaceAll("%7E","~").replaceAll("%25","%")}function attentionUnreadIds(byDevice){return new Set(Object.values(byDevice).flatMap(view=>view.unreadSessionIds))}var import_dsh_client_ui_primitives2=require("@deepseek-ai/dsh-client-ui-primitives"),import_react4=require("react");function cleanTitle(value){let trimmed=value?.trim();return trimmed===void 0||trimmed===""?void 0:trimmed}function resolveAttentionTitle(sessionId,local,hostTitles){return cleanTitle(local?.displayTitle)??cleanTitle(local?.title)??cleanTitle(hostTitles?.[sessionId])}function resolveAttentionSession(sessionId,snapshot,options){let decoded=decodeSessionId(sessionId),deviceId=decoded.isRemote?String(decoded.deviceId):options.owningDeviceId??String(LOCAL_DEVICE_ID),device=snapshot.devices.find(candidate=>String(candidate.id)===deviceId),deviceName=decoded.isRemote?cleanTitle(options.owningDeviceName)??cleanTitle(device?.name)??String(decoded.deviceId):options.localDeviceName;return{sessionId,rawSessionId:decoded.isRemote?decoded.rawSessionId:sessionId,deviceId,deviceName,title:cleanTitle(options.title?.(sessionId))??""}}function resolveAttentionSessions(sessionIds,snapshot,options){return sessionIds.map(sessionId=>resolveAttentionSession(sessionId,snapshot,options))}var import_react3=require("react");function resolveBarLayout(input){let frameLeft=finiteNonNegative(input.frameLeft),frameWidth=finiteNonNegative(input.frameWidth),viewportWidth=finiteNonNegative(input.viewportWidth),chromeTop=finiteNonNegative(input.chromeTop),visible=viewportWidth>0?Math.max(0,viewportWidth-frameLeft):frameWidth,width=frameWidth>0?visible>0?Math.min(frameWidth,visible):frameWidth:visible;return{left:frameLeft,top:finiteNonNegative(input.frameTop)+chromeTop,width,compact:width>0&&width<720,clipped:frameWidth>0&&visible>0&&frameWidth>visible+1}}function finiteNonNegative(value){return Number.isFinite(value)?Math.max(0,value):0}function measureNativeBar(input){let innerWidth=finiteNonNegative(input.innerWidth),left=finiteNonNegative(input.left),width=finiteNonNegative(input.width),visible=innerWidth>0?Math.max(0,innerWidth-left):width,clampedWidth=visible>0?Math.min(width===0?visible:width,visible):width;return{innerWidth,innerHeight:finiteNonNegative(input.innerHeight),...input.devicePixelRatio!==void 0?{devicePixelRatio:input.devicePixelRatio}:{},barLeft:left,barWidth:width,barRight:left+width,clampedWidth,compact:clampedWidth>0&&clampedWidth<720,updatedAt:input.now??Date.now()}}var current;function recordNativeBarMetrics(metrics){current=metrics}function readNativeBarMetrics(){return current}var obstruction;function recordNativeBarObstruction(next){obstruction=next}function readNativeBarObstruction(){return obstruction}function describeObstruction(element){if(element==null)return;let tag=element.tagName.toLowerCase(),id=element.id===""?"":`#${element.id}`,classes=Array.from(element.classList).filter(name=>!name.startsWith("dsh-md-")).slice(0,2).map(name=>`.${name}`).join(""),zIndex="";try{let style=globalThis.getComputedStyle?.(element);style!==void 0&&style.zIndex!=="auto"&&style.zIndex!==""&&(zIndex=` z=${style.zIndex}`)}catch{}return`${tag}${id}${classes}${zIndex}`}var ACTIVE_NATIVE_DEVICE_KEY="dsh-multi-device.active-native-device";function shouldApplySnapshot(current2,next,force=!1){return next.hostEpoch!==void 0&&next.hostEpoch!==current2.hostEpoch?!0:!(next.revision<current2.revision||next.revision===current2.revision&&!force)}function readStoredActiveNativeDevice(){try{if(typeof localStorage>"u")return;let value=localStorage.getItem(ACTIVE_NATIVE_DEVICE_KEY);return value===null||value===""?void 0:value}catch{return}}function storeActiveNativeDevice(deviceId){try{if(typeof localStorage>"u")return;deviceId===void 0?localStorage.removeItem(ACTIVE_NATIVE_DEVICE_KEY):localStorage.setItem(ACTIVE_NATIVE_DEVICE_KEY,deviceId)}catch{}}function deviceStateToDotState(state){switch(state){case"connected":return"done";case"connecting":case"reconnecting":return"ongoing";case"error":return"error";case"disabled":default:return"idle"}}function parseSshHostInput(raw){let trimmed=raw.trim();if(trimmed==="")return{host:""};if(trimmed.toLowerCase().startsWith("ssh://"))try{let parsed=new URL(trimmed),portNum=parsed.port!==""?Number(parsed.port):void 0;return{host:parsed.hostname,...parsed.username!==""?{username:decodeURIComponent(parsed.username)}:{},...portNum!==void 0&&Number.isInteger(portNum)&&portNum>0&&portNum<=65535?{port:portNum}:{}}}catch{trimmed=trimmed.slice(6)}let username,atIndex=trimmed.lastIndexOf("@");if(atIndex>0&&atIndex<trimmed.length-1&&(username=trimmed.slice(0,atIndex),trimmed=trimmed.slice(atIndex+1)),trimmed.startsWith("[")){let closeIdx=trimmed.indexOf("]");if(closeIdx>1){let host=trimmed.slice(1,closeIdx),rest=trimmed.slice(closeIdx+1);if(rest.startsWith(":")){let portNum=Number(rest.slice(1));if(Number.isInteger(portNum)&&portNum>0&&portNum<=65535)return{host,...username!==void 0?{username}:{},port:portNum}}return{host,...username!==void 0?{username}:{}}}}let firstColon=trimmed.indexOf(":");if(firstColon>0&&firstColon===trimmed.lastIndexOf(":")){let hostPart=trimmed.slice(0,firstColon),portPart=trimmed.slice(firstColon+1),portNum=Number(portPart);if(hostPart!==""&&/^\d+$/.test(portPart)&&portNum>0&&portNum<=65535)return{host:hostPart,...username!==void 0?{username}:{},port:portNum}}return{host:trimmed,...username!==void 0?{username}:{}}}var DEFAULT_MAX_KEEP_ALIVE_PAGES=6,HARD_KEEP_ALIVE_CEILING=12,DEFAULT_KEEP_ALIVE_IDLE_MINUTES=30,KEEP_ALIVE_SWEEP_INTERVAL_MS=3e4,CLIENT_INSTANCE_ID=typeof crypto<"u"&&typeof crypto.randomUUID=="function"?crypto.randomUUID():`client-${String(Date.now())}-${Math.random().toString(36).slice(2)}`,EMPTY_SNAPSHOT={revision:0,devices:[],sshConfigHosts:[],unreadSessionIds:[],ui:{crossHostReadState:!1,crossHostUiState:!1,taskbarSummary:!1,maxKeepAlivePages:DEFAULT_MAX_KEEP_ALIVE_PAGES,keepAliveIdleMinutes:DEFAULT_KEEP_ALIVE_IDLE_MINUTES}},MultiDeviceClientStore=class{clientId=CLIENT_INSTANCE_ID;mainViewVisible=!0;state;listeners=new Set;eventSource;pollTimer;lastKeepAliveSweepAt=0;sseRetryTimer;sseAttempt=0;started=!1;disposed=!1;lifecycleGeneration=0;lifecycleAbort=new AbortController;snapshotInFlight;navigationGeneration=0;connectionGeneration=0;hostGeneration=0;requestSequence=0;latestRequests=new Map;responseFences=new WeakMap;retiredEpochs=new Set;lastActiveAtByDevice=new Map;evictedSessionByDevice=new Map;visibilityDocument;onVisibilityChange=()=>{this.clearUnreadForActiveSession(this.state.snapshot)};reportedSessionId;hasReportedSession=!1;observedLocalMainSessionId;reportLocalMainSession(sessionId){return this.observedLocalMainSessionId=sessionId,this.setActiveSession(sessionId)}reportingSessionId;activeSessionInFlight;activeSessionSeq=0;lastPollAt=0;unreadClearInFlight=new Map;constructor(){this.state={snapshot:EMPTY_SNAPSHOT,loading:!0,activeNativeDeviceId:readStoredActiveNativeDevice(),keepAliveDeviceIds:[],reloadCounters:{},settingsModalOpen:!1}}getSnapshot=()=>this.state;subscribe=listener=>(this.listeners.add(listener),()=>this.listeners.delete(listener));setState(patch){if(!this.disposed){this.state={...this.state,...patch};for(let listener of this.listeners)try{listener()}catch{}}}resetActiveSessionReport(){this.hasReportedSession=!1,this.reportedSessionId=void 0,this.activeSessionSeq+=1,this.activeSessionInFlight=void 0,this.reportingSessionId=void 0}isFenceCurrent(fence){return!this.disposed&&fence.lifecycle===this.lifecycleGeneration&&fence.connection===this.connectionGeneration&&fence.host===this.hostGeneration&&this.latestRequests.get(fence.key)===fence.request}isResponseCurrent(response){if(response.stale===!0||this.disposed)return!1;let fence=this.responseFences.get(response);return fence===void 0||this.isFenceCurrent(fence)}start(){if(this.started||this.disposed)return()=>{};this.started=!0,this.lifecycleAbort=new AbortController;let lifecycle=++this.lifecycleGeneration;return this.resetActiveSessionReport(),this.sseAttempt=0,this.lastPollAt=0,this.lastKeepAliveSweepAt=Date.now(),typeof document<"u"&&typeof document.addEventListener=="function"&&(this.visibilityDocument=document,document.addEventListener("visibilitychange",this.onVisibilityChange)),this.connectSse(),this.refreshSnapshot(),this.clearUnreadForActiveSession(this.state.snapshot),this.pollTimer=setInterval(()=>{if(!this.started||lifecycle!==this.lifecycleGeneration)return;let now=Date.now();now-this.lastKeepAliveSweepAt>=KEEP_ALIVE_SWEEP_INTERVAL_MS&&(this.lastKeepAliveSweepAt=now,this.sweepIdleKeepAlive(now)),!(typeof EventSource<"u"&&this.eventSource?.readyState===EventSource.OPEN)&&(now-this.lastPollAt<4e3||(this.lastPollAt=now,this.refreshSnapshot()))},5e3),()=>{lifecycle===this.lifecycleGeneration&&this.stop()}}stop(){this.started=!1,this.lifecycleGeneration+=1,this.navigationGeneration+=1,this.lifecycleAbort.abort(),this.connectionGeneration+=1,this.latestRequests.clear(),this.snapshotInFlight=void 0,this.resetActiveSessionReport(),this.unreadClearInFlight.clear(),this.pollTimer!==void 0&&clearInterval(this.pollTimer),this.pollTimer=void 0,this.eventSource?.close(),this.eventSource=void 0,this.sseRetryTimer!==void 0&&clearTimeout(this.sseRetryTimer),this.sseRetryTimer=void 0,this.visibilityDocument?.removeEventListener("visibilitychange",this.onVisibilityChange),this.visibilityDocument=void 0}dispose(){this.disposed||(this.disposed=!0,this.stop(),this.listeners.clear())}maxKeepAlivePages(snap){let raw=snap.ui?.maxKeepAlivePages;return typeof raw!="number"||!Number.isInteger(raw)?DEFAULT_MAX_KEEP_ALIVE_PAGES:Math.max(1,Math.min(HARD_KEEP_ALIVE_CEILING,raw))}keepAliveIdleMs(snap){let raw=snap.ui?.keepAliveIdleMinutes,minutes=typeof raw=="number"&&Number.isInteger(raw)?Math.max(0,Math.min(240,raw)):DEFAULT_KEEP_ALIVE_IDLE_MINUTES;return minutes<=0?0:minutes*6e4}rememberEvictedSession(snap,deviceId){let dev=snap.devices.find(candidate=>candidate.id===deviceId);dev?.nativePaneSessionId!==void 0&&dev.nativePaneSessionId!==""&&this.evictedSessionByDevice.set(deviceId,dev.nativePaneSessionId)}trimKeepAlive(candidates,snap,activeId){let maxPages=this.maxKeepAlivePages(snap),byId=new Map(snap.devices.map(dev=>[dev.id,dev])),next=[...candidates];for(;next.length>maxPages;){let victimIdx=next.findIndex(id=>id!==activeId&&byId.get(id)?.nativePaneHasDraft!==!0);if(victimIdx===-1)break;let[evicted]=next.splice(victimIdx,1);evicted!==void 0&&this.rememberEvictedSession(snap,evicted)}for(;next.length>HARD_KEEP_ALIVE_CEILING;){let victimIdx=next.findIndex(id=>id!==activeId);if(victimIdx===-1)break;let[evicted]=next.splice(victimIdx,1);evicted!==void 0&&this.rememberEvictedSession(snap,evicted)}return next}sweepIdleKeepAlive(now=Date.now()){if(this.disposed)return;let snap=this.state.snapshot,idleMs=this.keepAliveIdleMs(snap);if(idleMs<=0||this.state.keepAliveDeviceIds.length===0)return;let activeId=this.state.activeNativeDeviceId,byId=new Map(snap.devices.map(dev=>[dev.id,dev])),changed=!1,nextKeepAlive=[];for(let id of this.state.keepAliveDeviceIds){if(id===activeId||byId.get(id)?.nativePaneHasDraft===!0){nextKeepAlive.push(id);continue}let lastActive=this.lastActiveAtByDevice.get(id)??now;if(this.lastActiveAtByDevice.has(id)||this.lastActiveAtByDevice.set(id,now),now-lastActive>=idleMs){this.rememberEvictedSession(snap,id),this.lastActiveAtByDevice.delete(id),changed=!0;continue}nextKeepAlive.push(id)}changed&&this.setState({keepAliveDeviceIds:nextKeepAlive})}connectSse(){if(typeof EventSource>"u"||!this.started||this.disposed)return;this.eventSource?.close();let lifecycle=this.lifecycleGeneration,connection=++this.connectionGeneration;this.resetActiveSessionReport(),this.unreadClearInFlight.clear();let current2=()=>this.started&&!this.disposed&&lifecycle===this.lifecycleGeneration&&connection===this.connectionGeneration;try{let es=new EventSource(`/multi-device/events?clientId=${encodeURIComponent(this.clientId)}`);this.eventSource=es,es.addEventListener("snapshot",ev=>{if(!(!current2()||this.eventSource!==es)){this.sseAttempt=0;try{let snap=JSON.parse(ev.data);this.applyIncomingSnapshot(snap)}catch{}}}),es.onerror=()=>{if(!current2()||this.eventSource!==es||(es.close(),this.eventSource=void 0,this.connectionGeneration+=1,this.resetActiveSessionReport(),this.unreadClearInFlight.clear(),this.sseRetryTimer!==void 0))return;let delay=Math.min(15e3,500*2**this.sseAttempt);this.sseAttempt=Math.min(this.sseAttempt+1,6),this.sseRetryTimer=setTimeout(()=>{!this.started||lifecycle!==this.lifecycleGeneration||this.disposed||(this.sseRetryTimer=void 0,this.connectSse())},delay)}}catch{}}applyIncomingSnapshot(snap,activeOverride){if(this.disposed)return;let fence=this.responseFences.get(snap);if(fence!==void 0&&!this.isFenceCurrent(fence))return;let previous=this.state.snapshot;if(snap.hostEpoch!==void 0&&this.retiredEpochs.has(snap.hostEpoch)||previous.hostEpoch!==void 0&&snap.hostEpoch===void 0)return;let force=activeOverride!==void 0||this.state.loading||this.state.error!==void 0;if(!shouldApplySnapshot(previous,snap,force))return;let epochChanged=snap.hostEpoch!==void 0&&snap.hostEpoch!==previous.hostEpoch;epochChanged&&(previous.hostEpoch!==void 0&&this.retiredEpochs.add(previous.hostEpoch),this.hostGeneration+=1,fence!==void 0&&(fence.host=this.hostGeneration),this.resetActiveSessionReport(),this.unreadClearInFlight.clear());let enabledDevices=snap.devices.filter(device=>device.enabled!==!1),configuredIds=new Set(enabledDevices.map(device=>device.id));for(let id of[...this.lastActiveAtByDevice.keys()])configuredIds.has(id)||this.lastActiveAtByDevice.delete(id);for(let id of[...this.evictedSessionByDevice.keys()])configuredIds.has(id)||this.evictedSessionByDevice.delete(id);let keepAliveEligible=new Set(enabledDevices.filter(device=>device.keepNativeAlive!==!1).map(device=>device.id)),previousActiveNative=this.state.activeNativeDeviceId,activeNative;activeOverride===null?activeNative=void 0:activeOverride!==void 0&&configuredIds.has(activeOverride)?activeNative=activeOverride:previousActiveNative!==void 0&&configuredIds.has(previousActiveNative)&&(activeNative=previousActiveNative);let now=Date.now();previousActiveNative!==void 0&&previousActiveNative!==activeNative&&configuredIds.has(previousActiveNative)&&this.lastActiveAtByDevice.set(previousActiveNative,now),activeNative!==void 0&&this.lastActiveAtByDevice.set(activeNative,now);let lostActiveNative=previousActiveNative!==void 0&&activeNative===void 0;storeActiveNativeDevice(activeNative);let rawKeepAlive=this.state.keepAliveDeviceIds.filter(id=>keepAliveEligible.has(id));activeNative!==void 0&&keepAliveEligible.has(activeNative)&&!rawKeepAlive.includes(activeNative)&&rawKeepAlive.push(activeNative);let keepAlive=this.trimKeepAlive(rawKeepAlive,snap,activeNative);this.setState({snapshot:snap,loading:!1,error:void 0,activeNativeDeviceId:activeNative,keepAliveDeviceIds:keepAlive,...lostActiveNative?{activeSessionId:this.observedLocalMainSessionId}:{}}),this.clearUnreadForActiveSession(snap),(epochChanged||lostActiveNative)&&this.setActiveSession(this.state.activeSessionId)}clearUnreadForActiveSession(snap){if(this.disposed)return;let active=this.state.activeSessionId;if(active===void 0||this.effectiveSessionId()!==active||typeof document<"u"&&document.visibilityState==="hidden"||!(snap.unreadSessionIds??[]).includes(active))return;let completionId=this.readCompletionId(snap,active),previous=this.unreadClearInFlight.get(active);if(previous!==void 0&&previous.completionId===completionId)return;let pending={completionId};this.unreadClearInFlight.set(active,pending),this.markSessionRead(active).finally(()=>{this.unreadClearInFlight.get(active)===pending&&this.unreadClearInFlight.delete(active)})}activateNativeDevice(deviceId){let snap=this.state.snapshot;if(snap.devices.find(candidate=>candidate.id===deviceId&&candidate.enabled!==!1)===void 0)return;let now=Date.now(),previousActive=this.state.activeNativeDeviceId;previousActive!==void 0&&previousActive!==deviceId&&this.lastActiveAtByDevice.set(previousActive,now),this.lastActiveAtByDevice.set(deviceId,now);let keepAliveEligible=new Set(snap.devices.filter(candidate=>candidate.enabled!==!1&&candidate.keepNativeAlive!==!1).map(candidate=>candidate.id)),candidates=this.state.keepAliveDeviceIds.filter(id=>keepAliveEligible.has(id)&&id!==deviceId);keepAliveEligible.has(deviceId)&&candidates.push(deviceId);let keepAlive=this.trimKeepAlive(candidates,snap,deviceId);storeActiveNativeDevice(deviceId),this.setState({activeNativeDeviceId:deviceId,keepAliveDeviceIds:keepAlive})}ensureKeepAliveDevice(deviceId){let snap=this.state.snapshot,device=snap.devices.find(candidate=>candidate.id===deviceId);if(device===void 0||device.enabled===!1||device.keepNativeAlive===!1||this.state.keepAliveDeviceIds.includes(deviceId))return;this.lastActiveAtByDevice.has(deviceId)||this.lastActiveAtByDevice.set(deviceId,Date.now());let keepAlive=this.trimKeepAlive([...this.state.keepAliveDeviceIds,deviceId],snap,this.state.activeNativeDeviceId);this.setState({keepAliveDeviceIds:keepAlive})}selectNativeDevice(deviceId){let device=this.state.snapshot.devices.find(candidate=>candidate.id===deviceId);if(device===void 0||device.enabled===!1)return Promise.resolve({ok:!1,error:"Device is disabled"});let wasKeptAlive=this.state.keepAliveDeviceIds.includes(deviceId);this.activateNativeDevice(deviceId);let evictedSessionId=this.evictedSessionByDevice.get(deviceId);return this.evictedSessionByDevice.delete(deviceId),!wasKeptAlive&&evictedSessionId!==void 0&&evictedSessionId!==""&&this.setActiveSession(encodeRemoteSessionId(deviceId,evictedSessionId)),Promise.resolve({ok:!0})}selectLocalNativeTab(){this.navigationGeneration+=1,this.enterLocalScope()}enterLocalScope(){let previousActive=this.state.activeNativeDeviceId;previousActive!==void 0&&this.lastActiveAtByDevice.set(previousActive,Date.now());let localSessionId=this.observedLocalMainSessionId;storeActiveNativeDevice(void 0),this.setState({activeNativeDeviceId:void 0,activeSessionId:localSessionId}),this.setActiveSession(localSessionId),this.clearUnreadForActiveSession(this.state.snapshot)}releaseKeepAliveDevice(deviceId){this.rememberEvictedSession(this.state.snapshot,deviceId),this.lastActiveAtByDevice.delete(deviceId);let nextKeepAlive=this.state.keepAliveDeviceIds.filter(id=>id!==deviceId),nextActive=this.state.activeNativeDeviceId===deviceId?nextKeepAlive[nextKeepAlive.length-1]:this.state.activeNativeDeviceId;nextActive!==void 0&&this.lastActiveAtByDevice.set(nextActive,Date.now()),storeActiveNativeDevice(nextActive),this.setState({keepAliveDeviceIds:nextKeepAlive,activeNativeDeviceId:nextActive}),nextActive===void 0&&this.enterLocalScope()}reloadNativeDevice(deviceId){let current2=this.state.reloadCounters[deviceId]??0;this.setState({reloadCounters:{...this.state.reloadCounters,[deviceId]:current2+1}})}setSettingsModalOpen(open){this.setState({settingsModalOpen:open})}effectiveSessionId(){if(this.mainViewVisible&&this.state.activeNativeDeviceId===void 0)return this.state.activeSessionId}setMainViewVisible(visible){this.mainViewVisible!==visible&&(this.mainViewVisible=visible,this.setState({}),visible&&this.clearUnreadForActiveSession(this.state.snapshot))}setActiveSession(sessionId){if(this.disposed)return Promise.resolve();let next=sessionId||void 0;if(this.state.activeSessionId!==next&&this.setState({activeSessionId:next}),this.clearUnreadForActiveSession(this.state.snapshot),this.hasReportedSession&&this.reportedSessionId===next&&this.activeSessionInFlight===void 0)return Promise.resolve();if(this.activeSessionInFlight!==void 0&&this.reportingSessionId===next)return this.activeSessionInFlight;let requestSeq=++this.activeSessionSeq;this.reportingSessionId=next;let promise=this.callControlPlane({action:"setActiveSession",payload:{sessionId:next??"",requestSeq}}).then(result=>{this.isResponseCurrent(result)&&result.ok&&requestSeq===this.activeSessionSeq&&(this.reportedSessionId=next,this.hasReportedSession=!0)}).finally(()=>{this.activeSessionInFlight===promise&&(this.activeSessionInFlight=void 0)});return this.activeSessionInFlight=promise,this.clearUnreadForActiveSession(this.state.snapshot),promise}clearActiveSession(sessionId){this.state.activeSessionId===sessionId&&this.setActiveSession(void 0)}readCompletionId(snap,sessionId){return snap.readCompletions?.[sessionId]}async markSessionRead(sessionId){if(sessionId==="")return!1;let expectedCompletionId=this.readCompletionId(this.state.snapshot,sessionId),res=await this.callControlPlane({action:"markSessionRead",payload:{sessionId,...expectedCompletionId!==void 0?{expectedCompletionId}:{}}});return!this.isResponseCurrent(res)||!res.ok?!1:(this.applyIncomingSnapshot(res.value.snapshot),res.value.changed)}async markDeviceRead(deviceId){let res=await this.callControlPlane({action:"markDeviceRead",payload:{deviceId}});return this.isResponseCurrent(res)?res.ok?(this.applyIncomingSnapshot(res.value.snapshot),{ok:!0,changed:res.value.changed}):{ok:!1,changed:0,error:res.error}:{ok:!1,changed:0,error:"stale-response"}}async callControlPlane(request){let payload=request.payload,scope=request.action==="setActiveSession"?"":payload?.logicalWorkspaceId??payload?.sessionId??payload?.deviceId??payload?.memberKey??payload?.ruleId??payload?.id??"",key=`${request.action}:${String(scope)}`,fence={lifecycle:this.lifecycleGeneration,connection:this.connectionGeneration,host:this.hostGeneration,request:++this.requestSequence,key};this.latestRequests.set(key,fence.request);let stale=()=>({ok:!1,error:"stale-response",stale:!0});if(this.disposed)return stale();try{let data=await(await fetch("/multi-device/api",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...request,payload:{...request.payload,clientId:this.clientId}}),signal:AbortSignal.any([this.lifecycleAbort.signal,AbortSignal.timeout(3e4)])})).json();if(!this.isFenceCurrent(fence))return stale();if(data.ok&&data.value!==null&&typeof data.value=="object"){let value=data.value,snapshot=typeof value.revision=="number"?data.value:value.snapshot;if(snapshot!==void 0&&(snapshot.hostEpoch!==void 0&&this.retiredEpochs.has(snapshot.hostEpoch)||this.state.snapshot.hostEpoch!==void 0&&snapshot.hostEpoch===void 0||snapshot.hostEpoch===this.state.snapshot.hostEpoch&&snapshot.revision<this.state.snapshot.revision))return stale()}if(this.responseFences.set(data,fence),data.ok&&data.value!==null&&typeof data.value=="object"){this.responseFences.set(data.value,fence);let snapshot=data.value.snapshot;snapshot!==null&&typeof snapshot=="object"&&this.responseFences.set(snapshot,fence)}return data}catch(error){if(!this.isFenceCurrent(fence))return stale();let result={ok:!1,error:error instanceof Error?error.message:String(error)};return this.responseFences.set(result,fence),result}}async refreshSnapshot(){if(this.disposed)return;if(this.snapshotInFlight!==void 0)return this.snapshotInFlight;let pending=this.callControlPlane({action:"snapshot"}).then(async res=>{this.isResponseCurrent(res)&&(res.ok?(this.applyIncomingSnapshot(res.value),this.isResponseCurrent(res)&&await this.setActiveSession(this.state.activeSessionId)):res.stale||this.setState({loading:!1,error:res.error}))});this.snapshotInFlight=pending;try{await pending}finally{this.snapshotInFlight===pending&&(this.snapshotInFlight=void 0)}}async fetchDiagnostics(){let client=collectClientDiagnosticsReport();return this.callControlPlane({action:"diagnostics",payload:client===void 0?{}:{client}})}async upsertDevice(input){let res=await this.callControlPlane({action:"upsertDevice",payload:input});return this.isResponseCurrent(res)?res.ok?(this.applyIncomingSnapshot(res.value.snapshot),{ok:!0}):{ok:!1,error:res.error}:{ok:!1,error:"stale-response"}}async authenticateDevice(deviceId,credential){let res=await this.callControlPlane({action:"authenticateDevice",payload:{deviceId,...credential!==void 0&&credential.trim()!==""?{credential:credential.trim()}:{}}});return this.isResponseCurrent(res)?res.ok?(this.applyIncomingSnapshot(res.value.snapshot),{ok:!0}):(this.refreshSnapshot(),{ok:!1,error:res.error}):{ok:!1,error:"stale-response"}}async removeDevice(deviceId){let res=await this.callControlPlane({action:"removeDevice",payload:{deviceId}});return this.isResponseCurrent(res)?res.ok?(this.releaseKeepAliveDevice(deviceId),this.applyIncomingSnapshot(res.value.snapshot),this.setState({error:void 0}),{ok:!0}):(this.setState({error:res.error}),{ok:!1,error:res.error}):{ok:!1,error:"stale-response"}}async setDeviceEnabled(deviceId,enabled){let res=await this.callControlPlane({action:"setDeviceEnabled",payload:{deviceId,enabled}});return this.isResponseCurrent(res)?res.ok?(this.applyIncomingSnapshot(res.value.snapshot),this.setState({error:void 0}),{ok:!0}):(this.setState({error:res.error}),{ok:!1,error:res.error}):{ok:!1,error:"stale-response"}}async reconnectDevice(deviceId){let res=await this.callControlPlane({action:"reconnectDevice",payload:{deviceId}});return this.isResponseCurrent(res)?res.ok?(this.applyIncomingSnapshot(res.value.snapshot),this.setState({error:void 0}),{ok:!0}):(this.setState({error:res.error}),{ok:!1,error:res.error}):{ok:!1,error:"stale-response"}}async testDevice(input){let res=await this.callControlPlane({action:"testDevice",payload:input});return res.ok?{ok:!0,...res.value}:res}async listSshKeys(){let res=await this.callControlPlane({action:"listSshKeys"});return res.ok?res.value.keys:[]}async patchUiState(state){let res=await this.callControlPlane({action:"patchUiState",payload:{state}});return this.isResponseCurrent(res)?res.ok?(this.applyIncomingSnapshot(res.value),{ok:!0}):{ok:!1,error:res.error}:{ok:!1,error:"stale-response"}}async setUiPreferences(patch){let res=await this.callControlPlane({action:"setUiPreferences",payload:patch});return this.isResponseCurrent(res)?res.ok?(this.applyIncomingSnapshot(res.value),{ok:!0}):{ok:!1,error:res.error}:{ok:!1,error:"stale-response"}}};function collectClientDiagnosticsReport(){if(typeof window>"u")return;let bar=readNativeBarMetrics(),obstruction2=readNativeBarObstruction();return{innerWidth:window.innerWidth,innerHeight:window.innerHeight,...Number.isFinite(window.devicePixelRatio)?{devicePixelRatio:window.devicePixelRatio}:{},...bar!==void 0?{barLeft:bar.barLeft,barWidth:bar.barWidth,barClampedWidth:bar.clampedWidth,compact:bar.compact}:{},...obstruction2!==void 0?{barObstruction:obstruction2.detail}:{},...typeof navigator<"u"&&typeof navigator.userAgent=="string"?{userAgent:navigator.userAgent}:{}}}var clientStore=new MultiDeviceClientStore;function useMultiDeviceState(){return(0,import_react3.useSyncExternalStore)(clientStore.subscribe,clientStore.getSnapshot,clientStore.getSnapshot)}var import_jsx_runtime2=require("react/jsx-runtime");function attentionGroups(view){return[{category:"pending",ids:view.pendingSessionIds,count:view.pendingSessionIds.length},{category:"running",ids:view.runningSessionIds,count:view.runningSessionIds.length},{category:"unread",ids:view.unreadSessionIds,count:view.unreadSessionIds.length}]}function attentionLabels(t){return{pending:t("attentionPending"),running:t("attentionRunning"),unread:t("attentionUnread"),stale:t("attentionStale"),last:t("attentionLastKnown"),members:t("attentionMembers"),unavailable:t("attentionUnavailable"),copy:t("attentionCopy"),copied:t("attentionCopied"),failed:t("attentionCopyFailed"),requests:t("attentionRequests")}}var CATEGORY_COUNT_KEY={pending:"pendingCount",running:"runningCount",unread:"unreadCount"};function deviceStateOf(snapshot,deviceId){return deviceId===LOCAL_DEVICE_ID?"connected":snapshot.devices.find(device=>device.id===deviceId)?.state??"error"}var CATEGORY_TONE={pending:"pending",running:"running",unread:"done"};function attentionSegments(view,fallback){return(view!==void 0?attentionGroups(view):[{category:"pending",ids:[],count:fallback?.pendingCount??0},{category:"running",ids:[],count:fallback?.runningCount??0},{category:"unread",ids:fallback?.unreadSessionIds??[],count:fallback?.unreadSessionIds.length??0}]).flatMap(group=>group.count>0?[{...group,tone:CATEGORY_TONE[group.category]}]:[])}function OpenAttentionMenuGroup({label,ids,snapshot,deviceName,t,unavailableText,onOpenRow}){let sessionList=useSessionListSnapshot(),titleFor=sessionId=>resolveAttentionTitle(sessionId,sessionList?.byId[sessionId],snapshot.sessionTitles);return(0,import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.MenuGroup,{label,children:ids.length===0?(0,import_jsx_runtime2.jsx)("div",{className:"dsh-md-attention-note",children:unavailableText}):resolveAttentionSessions(ids,snapshot,{localDeviceName:t("nativeLocalTab"),owningDeviceName:deviceName,title:titleFor}).map(row=>{let meta=[row.cwd,row.deviceName].filter(part=>part!==void 0&&part!==""),minimal=row.title==="";return(0,import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.MenuItemButton,{icon:row.deviceId===LOCAL_DEVICE_ID?(0,import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconGlobeOutlineRegular,{size:12}):(0,import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.StateDot,{state:deviceStateToDotState(deviceStateOf(snapshot,row.deviceId)),size:8}),onSelect:()=>{onOpenRow(row)},children:(0,import_jsx_runtime2.jsxs)("span",{className:"dsh-md-attention-row",title:`${row.sessionId}
${t("attentionOpenHint")}`,children:[(0,import_jsx_runtime2.jsx)("span",{className:`dsh-md-attention-row-title${minimal?" isId":""}`,children:minimal?row.rawSessionId:row.title}),meta.length>0&&(0,import_jsx_runtime2.jsx)("span",{className:"dsh-md-attention-row-meta",children:meta.join(" \xB7 ")})]})},row.sessionId)})})}function AttentionDetails({view,deviceName,t,nativeBar=!1,fallback}){let snapshot=useMultiDeviceState().snapshot,words=attentionLabels(t),[openCategory,setOpenCategory]=(0,import_react4.useState)(null),[failure,setFailure]=(0,import_react4.useState)(null),fresh=view?.fresh??fallback?.fresh??!1,segments=attentionSegments(view,fallback),stale=!fresh,chipCount=count=>count>99?"99+":String(count),fail=detail=>{setFailure({seq:Date.now(),message:detail===void 0||detail===""?t("attentionOpenFailed"):`${t("attentionOpenFailed")}: ${detail}`})},openRow=async row=>{setOpenCategory(null);let decoded=decodeSessionId(row.sessionId);try{if(!decoded.isRemote){clientStore.selectLocalNativeTab();let workspace=getClientServices().uiWorkspace;if(workspace===void 0||typeof workspace.openSession!="function"){fail(void 0);return}workspace.openSession(row.sessionId),await clientStore.setActiveSession(row.sessionId);return}let switched=await clientStore.selectNativeDevice(decoded.deviceId);if(!switched.ok){fail(switched.error);return}await clientStore.setActiveSession(row.sessionId)}catch(error){fail(error instanceof Error?error.message:String(error))}},capsuleLabel=stale?`${deviceName} ${t("attentionStatus")} \xB7 ${words.stale}`:`${deviceName} ${t("attentionStatus")}`;return(0,import_jsx_runtime2.jsxs)("span",{className:"dsh-md-attention",children:[(segments.length>0||stale)&&(0,import_jsx_runtime2.jsx)("span",{className:"dsh-md-tab-status",role:segments.length>0?"group":"status","aria-label":capsuleLabel,title:stale?words.stale:void 0,"data-stale":stale?"true":void 0,"data-empty":segments.length===0?"true":void 0,children:segments.map(segment=>{let label=t(CATEGORY_COUNT_KEY[segment.category]).replace("{count}",String(segment.count)),open=openCategory===segment.category,chip=(0,import_jsx_runtime2.jsx)("button",{type:"button",className:"dsh-md-tab-status-seg","data-tone":segment.tone,"data-attention-category":segment.category,"data-open":open?"true":"false","aria-haspopup":"menu","aria-expanded":open,"aria-label":`${deviceName}: ${label}; ${words.members}`,title:label,onClick:()=>{if(open){setOpenCategory(null);return}setOpenCategory(segment.category)},children:chipCount(segment.count)});return(0,import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Menu,{open,anchor:chip,onClose:()=>setOpenCategory(current2=>current2===segment.category?null:current2),portal:!0,side:"bottom",align:"start",dense:nativeBar,listClassName:"dsh-md-attention-menu",children:open?(0,import_jsx_runtime2.jsx)(OpenAttentionMenuGroup,{label,ids:segment.ids,snapshot,deviceName,t,unavailableText:words.unavailable,onOpenRow:openRow}):null},segment.category)})}),failure!==null&&(0,import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Toast,{text:failure.message,tone:"error",onDone:()=>setFailure(null)},failure.seq)]})}function countableUnreadIds(unreadSessionIds,archivedSessionIds,subagentSessionIds,existsRemoteSession){let hidden=new Set;for(let sessionId of archivedSessionIds??[])hidden.add(sessionId);for(let sessionId of subagentSessionIds??[])hidden.add(sessionId);let unread=new Set;for(let sessionId of unreadSessionIds)hidden.has(sessionId)||existsRemoteSession!==void 0&&decodeSessionId(sessionId).isRemote&&!existsRemoteSession(sessionId)||unread.add(sessionId);return unread}var EMPTY_UNREAD_SESSION_IDS=[];function groupUnreadSessionIds(unread){let grouped=new Map;for(let sessionId of unread){let deviceId=decodeSessionId(sessionId).deviceId,ids=grouped.get(deviceId)??[];ids.push(sessionId),grouped.set(deviceId,ids)}return grouped}var import_jsx_runtime3=require("react/jsx-runtime"),EYE_CONTOUR="M1.5 8C2.9 5.25 5.25 3.5 8 3.5C10.75 3.5 13.1 5.25 14.5 8C13.1 10.75 10.75 12.5 8 12.5C5.25 12.5 2.9 10.75 1.5 8Z",EYE_PATH=`${EYE_CONTOUR}M10 8C10 9.1 9.1 10 8 10C6.9 10 6 9.1 6 8C6 6.9 6.9 6 8 6C9.1 6 10 6.9 10 8Z`,EYE_OFF_PATH=`${EYE_CONTOUR}M2.5 2.5L13.5 13.5`;function formatCompactDeviceTarget(dev){if(dev.ssh!==void 0){let userPart=dev.ssh.username!==void 0&&dev.ssh.username!==""?`${dev.ssh.username}@`:"",sshPortPart=dev.ssh.port!==void 0&&dev.ssh.port!==22?`:${String(dev.ssh.port)}`:"",remotePortPart=dev.ssh.remotePort!==void 0&&dev.ssh.remotePort!==3080?` \u2192 :${String(dev.ssh.remotePort)}`:"";return`${userPart}${dev.ssh.host}${sshPortPart}${remotePortPart}`}return dev.targetSummary}function hasCustomAdvancedFields(dev){return dev===void 0?!1:dev.enabled===!1?!0:dev.ssh===void 0?!1:dev.ssh.remotePort!==void 0&&dev.ssh.remotePort!==3080||dev.ssh.port!==void 0&&dev.ssh.port!==22||dev.ssh.username!==void 0&&dev.ssh.username!==""||dev.ssh.privateKeyPath!==void 0&&dev.ssh.privateKeyPath!==""||dev.ssh.proxyJump!==void 0&&dev.ssh.proxyJump!==""||dev.ssh.remoteDshHome!==void 0&&dev.ssh.remoteDshHome!==""||dev.ssh.bootstrapFromRemoteCredentials===!1}function SecretCredentialInput({id,value,placeholder,disabled,t,onChange}){let[revealedValue,setRevealedValue]=(0,import_react5.useState)(void 0),revealed=value.length>0&&revealedValue===value;return(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-secret-wrap",children:[(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Input,{id,className:"dsh-md-secret-input",type:revealed?"text":"password",autoComplete:"new-password",value,placeholder,disabled,onChange:e=>{setRevealedValue(void 0),onChange(e.currentTarget.value)}}),value.length>0&&(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"ghost",size:"sm",className:"dsh-md-icon-btn isCompact dsh-md-secret-toggle","aria-label":t(revealed?"keyHide":"keyReveal"),"aria-pressed":revealed,disabled,onClick:()=>{setRevealedValue(revealed?void 0:value)},children:(0,import_jsx_runtime3.jsx)("svg",{width:14,height:14,viewBox:"0 0 16 16",fill:"none",stroke:"currentColor",strokeWidth:1.3,strokeLinecap:"round","aria-hidden":"true",children:(0,import_jsx_runtime3.jsx)("path",{d:revealed?EYE_OFF_PATH:EYE_PATH})})})]})}function DeviceEditorForm({device,sshConfigHosts,sshKeys,t,onSaved,onCancel,onRemove}){let formId=(0,import_react5.useId)(),[sshHost,setSshHost]=(0,import_react5.useState)(device?.ssh?.host??""),[name,setName]=(0,import_react5.useState)(device?.name??""),[authCredential,setAuthCredential]=(0,import_react5.useState)(""),[advancedOpen,setAdvancedOpen]=(0,import_react5.useState)(()=>hasCustomAdvancedFields(device)),[remotePort,setRemotePort]=(0,import_react5.useState)(String(device?.ssh?.remotePort??3080)),[sshUser,setSshUser]=(0,import_react5.useState)(device?.ssh?.username??""),[sshPort,setSshPort]=(0,import_react5.useState)(device?.ssh?.port!==void 0&&device.ssh.port!==22?String(device.ssh.port):""),[sshKeyPath,setSshKeyPath]=(0,import_react5.useState)(device?.ssh?.privateKeyPath??""),[sshPassphrase,setSshPassphrase]=(0,import_react5.useState)(""),[sshProxyJump,setSshProxyJump]=(0,import_react5.useState)(device?.ssh?.proxyJump??""),[remoteDshHome,setRemoteDshHome]=(0,import_react5.useState)(device?.ssh?.remoteDshHome??""),[bootstrapCredentials,setBootstrapCredentials]=(0,import_react5.useState)(device===void 0||device.ssh?.bootstrapFromRemoteCredentials===!0),[deviceEnabled,setDeviceEnabled]=(0,import_react5.useState)(device?.enabled!==!1),[testing,setTesting]=(0,import_react5.useState)(!1),[saving,setSaving]=(0,import_react5.useState)(!1),[saveAnyway,setSaveAnyway]=(0,import_react5.useState)(!1),[testResult,setTestResult]=(0,import_react5.useState)(null),[saveError,setSaveError]=(0,import_react5.useState)(null),showPassphraseField=sshKeys.find(k=>k.path===sshKeyPath)?.encrypted===!0,busy=testing||saving,buildInput=()=>{let parsedHost=parseSshHostInput(sshHost),effectiveHost=parsedHost.host,effectiveUser=sshUser.trim()||parsedHost.username,explicitPort=Number(sshPort),effectiveSshPort=sshPort.trim()!==""&&Number.isInteger(explicitPort)&&explicitPort>0&&explicitPort<=65535?explicitPort:parsedHost.port,parsedRemotePort=Number(remotePort);return{...device!==void 0?{id:device.id}:{},name:name.trim()||effectiveHost||"remote-device",...device?.label!==void 0?{label:device.label}:{},enabled:deviceEnabled,keepNativeAlive:device?.keepNativeAlive??!0,transport:{kind:"ssh",host:effectiveHost,...effectiveUser!==void 0&&effectiveUser!==""?{username:effectiveUser}:{},...effectiveSshPort!==void 0&&effectiveSshPort>0?{port:effectiveSshPort}:{},...sshKeyPath.trim()!==""?{privateKeyPath:sshKeyPath.trim()}:{},...sshPassphrase.trim()!==""?{passphrase:sshPassphrase.trim()}:{},...sshProxyJump.trim()!==""?{proxyJump:sshProxyJump.trim()}:{},remotePort:parsedRemotePort>0?parsedRemotePort:3080,...remoteDshHome.trim()!==""?{remoteDshHome:remoteDshHome.trim()}:{},bootstrapFromRemoteCredentials:bootstrapCredentials,engine:device?.ssh?.engine??"auto"},auth:{mode:"auto",...authCredential.trim()!==""?{credential:authCredential.trim()}:{}}}},handleImportSshHost=alias=>{let entry=sshConfigHosts.find(h=>h.alias===alias);entry!==void 0&&(setTestResult(null),setSaveError(null),setSaveAnyway(!1),setSshHost(entry.alias),name.trim()===""&&setName(entry.alias),setSshUser(""),setSshPort(""),setSshKeyPath(""),setSshProxyJump(""))},handleTest=async()=>{if(sshHost.trim()===""||busy)return;setTesting(!0),setTestResult(null),setSaveError(null);let res=await clientStore.testDevice(buildInput());setTesting(!1),res.ok?setTestResult({ok:!0,text:`${t("testPassed")} \xB7 DSH ${res.remoteDshVersion??res.protocolVersion} \xB7 ${String(res.latencyMs)}ms`}):setTestResult({ok:!1,text:res.error})},handleSubmit=async e=>{if(e.preventDefault(),sshHost.trim()===""||busy)return;if(setSaving(!0),setSaveError(null),!saveAnyway&&deviceEnabled){let preflight=await clientStore.testDevice(buildInput());if(!preflight.ok){setSaving(!1),setTestResult({ok:!1,text:preflight.error}),setSaveAnyway(!0);return}setTestResult({ok:!0,text:`${t("testPassed")} \xB7 DSH ${preflight.remoteDshVersion??preflight.protocolVersion} \xB7 ${String(preflight.latencyMs)}ms`})}let res=await clientStore.upsertDevice(buildInput());if(setSaving(!1),!res.ok){setSaveError(res.error??t("actionFailed"));return}onSaved()},hasCustomKeyPath=sshKeyPath.trim()!==""&&!sshKeys.some(k=>k.path===sshKeyPath);return(0,import_jsx_runtime3.jsxs)("form",{className:"dsh-md-editor",onSubmit:e=>{handleSubmit(e)},children:[(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-editor-top",children:[(0,import_jsx_runtime3.jsx)("span",{className:"dsh-md-editor-title",children:t(device!==void 0?"editDevice":"addDevice")}),sshConfigHosts.length>0&&(0,import_jsx_runtime3.jsx)(DshSelect,{compact:!0,clearOnSelect:!0,value:"",placeholder:t("importSshPlaceholder"),ariaLabel:t("importSshPlaceholder"),disabled:busy,options:sshConfigHosts.map(h=>({value:h.alias,label:h.alias,description:`${h.user?`${h.user}@`:""}${h.hostName}${h.port&&h.port!==22?`:${String(h.port)}`:""}`})),onChange:alias=>handleImportSshHost(alias)})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-form-grid",children:[(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-field",children:[(0,import_jsx_runtime3.jsx)("label",{className:"dsh-md-field-label",htmlFor:`${formId}-host`,children:t("sshHost")}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Input,{id:`${formId}-host`,required:!0,value:sshHost,placeholder:t("sshHostPlaceholder"),disabled:busy,onChange:e=>{setSshHost(e.currentTarget.value),setTestResult(null),setSaveAnyway(!1)}})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-field",children:[(0,import_jsx_runtime3.jsx)("label",{className:"dsh-md-field-label",htmlFor:`${formId}-name`,children:t("deviceName")}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Input,{id:`${formId}-name`,value:name,placeholder:sshHost.trim()!==""?parseSshHostInput(sshHost).host:t("deviceNamePlaceholder"),disabled:busy,onChange:e=>setName(e.currentTarget.value)})]})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-field",children:[(0,import_jsx_runtime3.jsx)("label",{className:"dsh-md-field-label",htmlFor:`${formId}-token`,children:t("authCredential")}),(0,import_jsx_runtime3.jsx)(SecretCredentialInput,{id:`${formId}-token`,value:authCredential,placeholder:t("authCredentialPlaceholder"),disabled:busy,t,onChange:next=>{setAuthCredential(next),setTestResult(null)}})]}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.DisclosureRow,{title:(0,import_jsx_runtime3.jsx)("span",{className:"dsh-md-field-label",children:t("advancedOptions")}),open:advancedOpen,expandable:!0,expandOnRowClick:!0,onToggle:()=>setAdvancedOpen(prev=>!prev),children:(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-form-grid dsh-md-advanced-body",children:[(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-field",children:[(0,import_jsx_runtime3.jsx)("label",{className:"dsh-md-field-label",htmlFor:`${formId}-rport`,children:t("remoteDshPort")}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Input,{id:`${formId}-rport`,type:"number",min:1,max:65535,value:remotePort,disabled:busy,onChange:e=>setRemotePort(e.currentTarget.value)})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-field",children:[(0,import_jsx_runtime3.jsx)("label",{className:"dsh-md-field-label",htmlFor:`${formId}-user`,children:t("sshUser")}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Input,{id:`${formId}-user`,value:sshUser,placeholder:t("sshUserPlaceholder"),disabled:busy,onChange:e=>setSshUser(e.currentTarget.value)})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-field",children:[(0,import_jsx_runtime3.jsx)("label",{className:"dsh-md-field-label",htmlFor:`${formId}-port`,children:t("sshPort")}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Input,{id:`${formId}-port`,type:"number",min:1,max:65535,value:sshPort,placeholder:t("sshPortPlaceholder"),disabled:busy,onChange:e=>setSshPort(e.currentTarget.value)})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-field",children:[(0,import_jsx_runtime3.jsx)("label",{className:"dsh-md-field-label",htmlFor:`${formId}-key`,children:t("sshKeySelect")}),(0,import_jsx_runtime3.jsx)(DshSelect,{id:`${formId}-key`,value:sshKeyPath,placeholder:t("sshKeyAuto"),disabled:busy,options:[{value:"",label:t("sshKeyAuto"),description:t("sshKeyAutoDesc")},...hasCustomKeyPath?[{value:sshKeyPath,label:sshKeyPath,description:sshKeyPath}]:[],...sshKeys.map(key=>({value:key.path,label:key.name,description:key.path,badge:key.encrypted?"encrypted":key.permissionsTooOpen?"(!)":void 0}))],onChange:next=>setSshKeyPath(next)})]}),showPassphraseField&&(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-field",children:[(0,import_jsx_runtime3.jsx)("label",{className:"dsh-md-field-label",htmlFor:`${formId}-passphrase`,children:t("sshKeyPassphrase")}),(0,import_jsx_runtime3.jsx)(SecretCredentialInput,{id:`${formId}-passphrase`,value:sshPassphrase,placeholder:t("sshKeyPassphrasePlaceholder"),disabled:busy,t,onChange:setSshPassphrase})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-field",children:[(0,import_jsx_runtime3.jsx)("label",{className:"dsh-md-field-label",htmlFor:`${formId}-jump`,children:t("sshProxyJump")}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Input,{id:`${formId}-jump`,value:sshProxyJump,placeholder:t("sshProxyJumpPlaceholder"),disabled:busy,onChange:e=>setSshProxyJump(e.currentTarget.value)})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-field",children:[(0,import_jsx_runtime3.jsx)("label",{className:"dsh-md-field-label",htmlFor:`${formId}-home`,children:t("remoteDshHome")}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Input,{id:`${formId}-home`,value:remoteDshHome,placeholder:t("remoteDshHomePlaceholder"),disabled:busy,onChange:e=>setRemoteDshHome(e.currentTarget.value)})]}),(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-field dsh-md-field-span",children:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Switch,{checked:bootstrapCredentials,disabled:busy,label:t("authBootstrap"),onChange:setBootstrapCredentials})}),device!==void 0&&(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-field dsh-md-field-span",children:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Switch,{checked:deviceEnabled,disabled:busy,label:t("deviceEnabledLabel"),onChange:setDeviceEnabled})})]})}),saveError!==null&&(0,import_jsx_runtime3.jsx)("p",{className:"dsh-md-error-text",role:"alert",children:saveError}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-editor-footer",children:[(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-editor-footer-left",children:[(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"outline",size:"sm",disabled:busy||sshHost.trim()==="",icon:testing?(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.StateDot,{state:"ongoing",size:12}):void 0,onClick:()=>{handleTest()},children:t(testing?"testingConnection":"testConnection")}),onRemove!==void 0&&(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"ghost",size:"sm",className:"dsh-md-danger-action",disabled:busy,icon:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconTrashOutlineRegular,{size:13}),onClick:onRemove,children:t("remove")}),testResult!==null&&(testResult.ok?(0,import_jsx_runtime3.jsxs)("span",{className:"dsh-md-success-text",children:[(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.StateDot,{state:"done",size:8}),testResult.text]}):(0,import_jsx_runtime3.jsx)("span",{className:"dsh-md-error-text",role:"alert",children:testResult.text}))]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-editor-footer-right",children:[(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"outline",size:"sm",disabled:busy,onClick:onCancel,children:t("cancel")}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"primary",size:"sm",type:"submit",disabled:busy||sshHost.trim()==="",children:t(saving?"savingDevice":saveAnyway?"saveAnyway":"saveDevice")})]})]})]})}function MultiDeviceHubPanel({t,onCloseSettings,hideHeader=!1}){let state=useMultiDeviceState(),{snapshot}=state,unread=snapshot.attentionByDevice!==void 0?attentionUnreadIds(snapshot.attentionByDevice):countableUnreadIds(snapshot.unreadSessionIds,snapshot.archivedSessionIds,snapshot.subagentSessionIds),unreadByDevice=groupUnreadSessionIds(unread),[addingNew,setAddingNew]=(0,import_react5.useState)(!1),[editingDeviceId,setEditingDeviceId]=(0,import_react5.useState)(null),[togglingDeviceId,setTogglingDeviceId]=(0,import_react5.useState)(null),[sshKeys,setSshKeys]=(0,import_react5.useState)([]),[deleteTarget,setDeleteTarget]=(0,import_react5.useState)(null),[deleting,setDeleting]=(0,import_react5.useState)(!1),[deleteError,setDeleteError]=(0,import_react5.useState)(null),[diagnostics,setDiagnostics]=(0,import_react5.useState)(null),[diagnosticsBusy,setDiagnosticsBusy]=(0,import_react5.useState)(!1),[diagnosticsCopied,setDiagnosticsCopied]=(0,import_react5.useState)(!1),[toastNotice,setToastNotice]=(0,import_react5.useState)(null),pushToast=(text,tone)=>{setToastNotice(prev=>({seq:(prev?.seq??0)+1,text,...tone!==void 0?{tone}:{}}))};(0,import_react5.useEffect)(()=>{(addingNew||editingDeviceId!==null)&&clientStore.listSshKeys().then(setSshKeys)},[addingNew,editingDeviceId]);let hasDevices=snapshot.devices.length>0,handleConfirmDelete=async()=>{if(deleteTarget===null||deleting)return;setDeleting(!0),setDeleteError(null);let res=await clientStore.removeDevice(deleteTarget.id);if(setDeleting(!1),!res.ok){setDeleteError(res.error??t("actionFailed"));return}editingDeviceId===deleteTarget.id&&setEditingDeviceId(null),setDeleteTarget(null),pushToast(t("savedNotice"),"success")},handleToggleDeviceEnabled=async(dev,nextEnabled)=>{if(togglingDeviceId===dev.id)return;setTogglingDeviceId(dev.id);let res=await clientStore.setDeviceEnabled(dev.id,nextEnabled);if(setTogglingDeviceId(prev=>prev===dev.id?null:prev),!res.ok){pushToast(`${t("actionFailed")}: ${res.error??""}`,"error");return}pushToast(t(nextEnabled?"deviceEnabledNotice":"deviceDisabledNotice").replace("{name}",dev.name),"success")},copyDiagnosticsText=async value=>{await copyText(JSON.stringify(value,null,2))?(setDiagnosticsCopied(!0),pushToast(t("diagnosticsCopied"),"success")):pushToast(t("diagnosticsCopyFailed"),"error")},runDiagnostics=()=>{diagnosticsBusy||(setDiagnosticsBusy(!0),setDiagnosticsCopied(!1),clientStore.fetchDiagnostics().then(res=>{if(!res.ok){pushToast(`${t("actionFailed")}: ${res.error}`,"error");return}setDiagnostics(res.value),copyDiagnosticsText(res.value)}).finally(()=>{setDiagnosticsBusy(!1)}))};return(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-section",children:[!hideHeader&&(0,import_jsx_runtime3.jsxs)("div",{children:[(0,import_jsx_runtime3.jsx)("h2",{className:"dsh-md-section-title",children:t("settingsSectionTitle")}),(0,import_jsx_runtime3.jsx)("p",{className:"dsh-md-section-intro",children:t("settingsSectionIntro")})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-pref-list",children:[(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-pref-row",children:[(0,import_jsx_runtime3.jsxs)("div",{children:[(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-pref-title",children:t("taskbarSummaryTitle")}),(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-pref-desc",children:t("taskbarSummaryDesc")})]}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Switch,{checked:snapshot.ui?.taskbarSummary===!0,label:t("taskbarSummaryTitle"),onChange:enabled=>{clientStore.setUiPreferences({taskbarSummary:enabled}).then(res=>{res.ok||pushToast(`${t("actionFailed")}: ${res.error??""}`,"error")})}})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-pref-row",children:[(0,import_jsx_runtime3.jsxs)("div",{children:[(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-pref-title",children:t("crossHostReadStateTitle")}),(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-pref-desc",children:t("crossHostReadStateDesc")})]}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Switch,{checked:snapshot.ui?.crossHostReadState===!0,label:t("crossHostReadStateTitle"),onChange:enabled=>{clientStore.setUiPreferences({crossHostReadState:enabled}).then(res=>{res.ok||pushToast(`${t("actionFailed")}: ${res.error??""}`,"error")})}})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-pref-row",children:[(0,import_jsx_runtime3.jsxs)("div",{children:[(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-pref-title",children:t("crossHostUiStateTitle")}),(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-pref-desc",children:t("crossHostUiStateDesc")})]}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Switch,{checked:snapshot.ui?.crossHostUiState===!0,label:t("crossHostUiStateTitle"),onChange:enabled=>{clientStore.setUiPreferences({crossHostUiState:enabled}).then(res=>{res.ok||pushToast(`${t("actionFailed")}: ${res.error??""}`,"error")})}})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-pref-row",children:[(0,import_jsx_runtime3.jsxs)("div",{children:[(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-pref-title",children:t("keepAliveMaxPagesTitle")}),(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-pref-desc",children:t("keepAliveMaxPagesDesc")})]}),(0,import_jsx_runtime3.jsx)(DshSelect,{compact:!0,ariaLabel:t("keepAliveMaxPagesTitle"),style:{minWidth:132},value:String(snapshot.ui?.maxKeepAlivePages??6),options:[1,2,3,4,6,8,12].map(count=>({value:String(count),label:t("keepAlivePagesOption").replace("{count}",String(count))})),onChange:val=>{let parsed=Number(val);Number.isInteger(parsed)&&clientStore.setUiPreferences({maxKeepAlivePages:parsed}).then(res=>{res.ok||pushToast(`${t("actionFailed")}: ${res.error??""}`,"error")})}})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-pref-row",children:[(0,import_jsx_runtime3.jsxs)("div",{children:[(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-pref-title",children:t("keepAliveIdleTitle")}),(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-pref-desc",children:t("keepAliveIdleDesc")})]}),(0,import_jsx_runtime3.jsx)(DshSelect,{compact:!0,ariaLabel:t("keepAliveIdleTitle"),style:{minWidth:132},value:String(snapshot.ui?.keepAliveIdleMinutes??30),options:[0,10,15,30,60,120].map(minutes=>({value:String(minutes),label:minutes===0?t("keepAliveIdleNever"):t("keepAliveIdleMinutesOption").replace("{minutes}",String(minutes))})),onChange:val=>{let parsed=Number(val);Number.isInteger(parsed)&&clientStore.setUiPreferences({keepAliveIdleMinutes:parsed}).then(res=>{res.ok||pushToast(`${t("actionFailed")}: ${res.error??""}`,"error")})}})]})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-devices-block",children:[(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-devices-header",children:[(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-devices-heading-group",children:[(0,import_jsx_runtime3.jsx)("h3",{className:"dsh-md-devices-heading",children:t("devicesHeading")}),hasDevices&&(0,import_jsx_runtime3.jsx)("span",{className:"dsh-md-devices-count-pill",children:snapshot.devices.length})]}),!addingNew&&(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"outline",size:"sm",icon:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconPlusOutlineRegular,{size:13}),onClick:()=>{setEditingDeviceId(null),setAddingNew(!0)},children:t("addDevice")})]}),addingNew&&(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-card",children:(0,import_jsx_runtime3.jsx)(DeviceEditorForm,{sshConfigHosts:snapshot.sshConfigHosts,sshKeys,t,onSaved:()=>{setAddingNew(!1),pushToast(t("savedNotice"),"success")},onCancel:()=>setAddingNew(!1)})}),!hasDevices&&!addingNew?(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-card dsh-md-empty-card",children:[(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-row-name",children:t("noDevicesTitle")}),(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-pref-desc",children:t("noDevicesDesc")})]}):hasDevices?(0,import_jsx_runtime3.jsx)("ul",{className:"dsh-md-rows",children:snapshot.devices.map(dev=>{let isEditing=editingDeviceId===dev.id,isDisabled=dev.enabled===!1,deviceUnread=(unreadByDevice.get(dev.id)??EMPTY_UNREAD_SESSION_IDS).length;return(0,import_jsx_runtime3.jsxs)("li",{className:isDisabled?"dsh-md-card isDisabled":"dsh-md-card",children:[(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-row-head",children:[(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-row-identity",children:[(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.StateDot,{state:deviceStateToDotState(isDisabled?"disabled":dev.state),size:8}),(0,import_jsx_runtime3.jsx)("span",{className:"dsh-md-row-name",children:dev.name}),isDisabled?(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tag,{tone:"outline",children:t("deviceDisabledTag")}):(0,import_jsx_runtime3.jsx)(AttentionDetails,{view:snapshot.attentionByDevice?.[dev.id],deviceName:dev.name,t,fallback:{runningCount:snapshot.attentionByDevice===void 0?dev.runningSessionCount:void 0,pendingCount:snapshot.attentionByDevice===void 0?dev.pendingApprovalCount:void 0,unreadSessionIds:unreadByDevice.get(dev.id)??EMPTY_UNREAD_SESSION_IDS,fresh:snapshot.attentionByDevice===void 0&&dev.state==="connected"&&dev.catalogStale!==!0}}),(0,import_jsx_runtime3.jsx)("span",{className:"dsh-md-device-endpoint",title:formatCompactDeviceTarget(dev),children:formatCompactDeviceTarget(dev)}),!isDisabled&&dev.latencyMs!==void 0&&dev.state==="connected"&&(0,import_jsx_runtime3.jsxs)("span",{className:"dsh-md-latency-text",children:[dev.latencyMs,"ms"]}),!isDisabled&&dev.authState==="required"&&(0,import_jsx_runtime3.jsx)("span",{className:"dsh-md-auth-required-tag",children:t("authRequired")})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-row-actions",children:[!isDisabled&&(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"outline",size:"sm",icon:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconRightUpOutlineRegular,{size:13}),onClick:()=>{clientStore.selectNativeDevice(dev.id).then(res=>{if(!res.ok){pushToast(`${t("actionFailed")}: ${res.error??""}`,"error");return}onCloseSettings?.()})},children:t("openDevice")}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-icon-actions-group",children:[!isDisabled&&deviceUnread>0&&(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tooltip,{label:t("clearUnread"),side:"top",children:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"ghost",size:"sm",className:"dsh-md-icon-btn","aria-label":t("clearUnread"),onClick:()=>{clientStore.markDeviceRead(dev.id).then(res=>{res.ok?pushToast(t("clearedUnreadNotice").replace("{count}",String(res.changed)),"success"):pushToast(`${t("actionFailed")}: ${res.error??""}`,"error")})},children:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconCheckCircleFillRegular,{size:14})})}),!isDisabled&&(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tooltip,{label:t("reconnect"),side:"top",children:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"ghost",size:"sm",className:"dsh-md-icon-btn","aria-label":t("reconnect"),onClick:()=>{clientStore.reconnectDevice(dev.id).then(res=>{res.ok?pushToast(t("reconnectedNotice"),"success"):pushToast(`${t("actionFailed")}: ${res.error??""}`,"error")})},children:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconRefreshOutlineRegular,{size:14})})}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tooltip,{label:t("editDevice"),side:"top",children:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"ghost",size:"sm",className:"dsh-md-icon-btn","aria-label":t("editDevice"),"aria-expanded":isEditing,onClick:()=>{setAddingNew(!1),setEditingDeviceId(isEditing?null:dev.id)},children:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconEditOutlineRegular,{size:14})})}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tooltip,{label:t("remove"),side:"top",children:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"ghost",size:"sm",className:"dsh-md-icon-btn isDanger","aria-label":t("remove"),onClick:()=>{setDeleteError(null),setDeleteTarget(dev)},children:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconTrashOutlineRegular,{size:14})})})]}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Tooltip,{label:t(isDisabled?"enableDevice":"disableDevice"),side:"top",children:(0,import_jsx_runtime3.jsx)("span",{className:"dsh-md-device-toggle",children:(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Switch,{checked:!isDisabled,disabled:togglingDeviceId===dev.id,label:`${t(isDisabled?"enableDevice":"disableDevice")}: ${dev.name}`,onChange:checked=>{handleToggleDeviceEnabled(dev,checked)}})})})]})]}),!isEditing&&!isDisabled&&dev.lastError!==void 0&&(0,import_jsx_runtime3.jsx)("p",{className:"dsh-md-error-text",children:dev.lastError}),isEditing&&(0,import_jsx_runtime3.jsx)(DeviceEditorForm,{device:dev,sshConfigHosts:snapshot.sshConfigHosts,sshKeys,t,onSaved:()=>{setEditingDeviceId(null),pushToast(t("savedNotice"),"success")},onCancel:()=>setEditingDeviceId(null),onRemove:()=>{setDeleteError(null),setDeleteTarget(dev)}})]},dev.id)})}):null]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-diagnostics",children:[(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-pref-row",children:[(0,import_jsx_runtime3.jsxs)("div",{children:[(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-pref-title",children:t("diagnosticsTitle")}),(0,import_jsx_runtime3.jsx)("div",{className:"dsh-md-pref-desc",children:t("diagnosticsDesc")})]}),(0,import_jsx_runtime3.jsxs)("div",{className:"dsh-md-diagnostics-actions",children:[(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"outline",size:"sm",disabled:diagnosticsBusy,onClick:runDiagnostics,children:diagnosticsBusy?`${t("diagnosticsRun")}\u2026`:t("diagnosticsRun")}),diagnostics!==null&&(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"ghost",size:"sm",onClick:()=>{copyDiagnosticsText(diagnostics)},children:t(diagnosticsCopied?"diagnosticsCopied":"diagnosticsCopy")})]})]}),(0,import_jsx_runtime3.jsx)("p",{className:"dsh-md-diagnostics-mode",children:t("diagnosticsSummaryLine").replace("{devices}",String(snapshot.devices.length)).replace("{connected}",String(snapshot.devices.filter(device=>device.state==="connected").length))}),diagnostics!==null&&(0,import_jsx_runtime3.jsx)("pre",{className:"dsh-md-diagnostics-output",children:JSON.stringify(diagnostics,null,2)})]}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Modal,{open:deleteTarget!==null,onClose:()=>{deleting||(setDeleteTarget(null),setDeleteError(null))},title:deleteTarget===null?"":t("deleteTitle").replace("{name}",deleteTarget.name),closeLabel:t("close"),description:deleteTarget===null?void 0:t("deleteDescription"),footer:(0,import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment,{children:[(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"outline",disabled:deleting,onClick:()=>{setDeleteTarget(null),setDeleteError(null)},children:t("cancel")}),(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button,{variant:"primary",disabled:deleting,onClick:()=>{handleConfirmDelete()},children:t(deleting?"deletingDevice":"deleteConfirm")})]}),children:deleteError!==null?(0,import_jsx_runtime3.jsx)("p",{className:"dsh-md-error-text",role:"alert",children:deleteError}):null}),toastNotice!==null&&(0,import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Toast,{text:toastNotice.text,tone:toastNotice.tone,onDone:()=>setToastNotice(null)},toastNotice.seq)]})}var import_dsh_client_ui_primitives5=require("@deepseek-ai/dsh-client-ui-primitives"),import_react8=require("react"),import_react_dom=require("react-dom");var import_dsh_client_ui_primitives4=require("@deepseek-ai/dsh-client-ui-primitives"),import_react6=require("react");var import_jsx_runtime4=require("react/jsx-runtime");function AuthRequiredPanel({device,t,onOpenSettings}){let[credential,setCredential]=(0,import_react6.useState)(""),[busy,setBusy]=(0,import_react6.useState)(null),[error,setError]=(0,import_react6.useState)(null),run=async viaToken=>{if(busy!==null)return;if(viaToken&&credential.trim()===""){setError(t("authCredentialLabel"));return}setBusy(viaToken?"token":"ssh"),setError(null);let res=await clientStore.authenticateDevice(device.id,viaToken?credential.trim():void 0);if(setBusy(null),!res.ok){setError(res.error??t("authFailed"));return}setCredential(""),clientStore.reloadNativeDevice(device.id)};return(0,import_jsx_runtime4.jsx)("div",{className:"dsh-md-auth-stage",children:(0,import_jsx_runtime4.jsxs)("div",{className:"dsh-md-auth-card",role:"region","aria-label":t("authPanelTitle"),children:[(0,import_jsx_runtime4.jsxs)("div",{className:"dsh-md-auth-badge",children:[(0,import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.StateDot,{state:"error",size:8}),t("authRequired")]}),(0,import_jsx_runtime4.jsx)("h3",{className:"dsh-md-auth-title",children:t("authPanelTitle")}),(0,import_jsx_runtime4.jsx)("p",{className:"dsh-md-auth-desc",children:t("authPanelDesc")}),error===null&&device.authError!==void 0&&device.authError!==""&&(0,import_jsx_runtime4.jsx)("p",{className:"dsh-md-error-text",role:"status",children:device.authError}),(0,import_jsx_runtime4.jsx)("label",{className:"dsh-md-field-label",htmlFor:`dsh-md-auth-${device.id}`,children:t("authCredentialLabel")}),(0,import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Input,{id:`dsh-md-auth-${device.id}`,value:credential,placeholder:t("authTokenPlaceholder"),disabled:busy!==null,autoComplete:"off",spellCheck:!1,onChange:event=>setCredential(event.currentTarget.value)}),error!==null&&(0,import_jsx_runtime4.jsx)("p",{className:"dsh-md-error-text",role:"alert",children:error}),(0,import_jsx_runtime4.jsxs)("div",{className:"dsh-md-auth-actions",children:[(0,import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button,{variant:"primary",size:"sm",disabled:busy!==null||credential.trim()==="",icon:busy==="token"?(0,import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.StateDot,{state:"ongoing",size:12}):void 0,onClick:()=>{run(!0)},children:t(busy==="token"?"authChecking":"authSubmit")}),(0,import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button,{variant:"outline",size:"sm",disabled:busy!==null,icon:busy==="ssh"?(0,import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.StateDot,{state:"ongoing",size:12}):(0,import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconRefreshOutlineRegular,{size:13}),onClick:()=>{run(!1)},children:t(busy==="ssh"?"authChecking":"authUseSsh")}),(0,import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button,{variant:"ghost",size:"sm",disabled:busy!==null,icon:(0,import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconChevronLeftOutlineRegular,{size:13}),onClick:()=>clientStore.selectLocalNativeTab(),children:t("authBackLocal")}),(0,import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button,{variant:"ghost",size:"sm",icon:(0,import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.IconSettingsOutlineRegular,{size:13}),onClick:onOpenSettings,children:t("authOpenSettings")})]}),(0,import_jsx_runtime4.jsx)("p",{className:"dsh-md-auth-hint",children:t("authHint")})]})})}function unsupported(code,message){return{status:"unsupported",code,message}}function parseUrl(value){if(!(typeof value!="string"||value!==value.trim()||/[\u0000-\u0020\u007f]/u.test(value)))try{let url=new URL(value);return url.username!==""||url.password!==""?void 0:url}catch{return}}function isIpv4ProxyHost(host){return host==="127.0.0.1"||host==="localhost"}function isLoopbackPage(host){return isIpv4ProxyHost(host)||host==="[::1]"}function assessBrowserNativeAccess(input){if(input.proxyUrl===void 0||input.proxyUrl==="")return{status:"unavailable",code:"proxy-not-ready",message:"The native device proxy is not ready yet."};let page=parseUrl(input.pageUrl);if(page===void 0)return unsupported("invalid-page-url","The current page URL is invalid; native access cannot be assessed safely.");let proxy=parseUrl(input.proxyUrl);if(proxy===void 0||proxy.protocol!=="http:"&&proxy.protocol!=="https:")return unsupported("invalid-proxy-url","The native proxy URL must be an absolute HTTP(S) URL without embedded credentials.");if(proxy.origin===page.origin)return unsupported("same-origin-unsafe","Remote native HTML cannot run on the local DSH Host origin: it could access Host cookies, storage and authenticated APIs. A same-origin path relay is not supported by the current remote runtime.");let proxyHost=proxy.hostname.toLowerCase();if(proxyHost==="[::1]")return unsupported("ipv6-proxy-not-listening","The native proxy listens only on IPv4 127.0.0.1, not IPv6 ::1. No IPv6 proxy URL may be synthesized.");if(!isIpv4ProxyHost(proxyHost))return unsupported("public-proxy-not-supported","A public native proxy requires an administrator-configured, independently authenticated HTTPS origin per device. This version does not implement or verify that deployment; an arbitrary public URL is not a supported native entry.");if(proxy.protocol!=="http:")return unsupported("loopback-protocol-not-supported","The current loopback native proxy serves HTTP only; changing its URL to HTTPS does not create a TLS listener.");if(proxy.pathname!=="/")return unsupported("prefixed-relay-not-supported","The current remote runtime requires an origin root for assets, APIs, workers and navigation. A URL path prefix is not a supported native relay.");if(input.desktopGuest===!0)return{status:"available",transport:"desktop-guest",url:proxy.href};if(page.protocol!=="http:"&&page.protocol!=="https:")return unsupported("page-protocol-not-supported","Native embedding on this page protocol requires the verified DSH Desktop guest bridge.");let pageHost=page.hostname.toLowerCase();return isLoopbackPage(pageHost)?page.protocol==="https:"?unsupported("https-http-proxy","An HTTPS page cannot reliably embed the HTTP loopback native proxy: browser mixed-content and schemeful-site cookie policies differ. Open the local HTTP DSH page or use DSH Desktop."):pageHost==="[::1]"?unsupported("ipv6-parent-ipv4-proxy","An IPv6 DSH page and the IPv4-only native proxy do not share a reliable iframe cookie site. Open DSH using 127.0.0.1 or an IPv4-resolving localhost address; the proxy does not listen on ::1."):(proxy.hostname=pageHost,proxy.origin===page.origin?unsupported("same-origin-unsafe","Normalizing the loopback hostname would put remote HTML on the local DSH Host origin. The native proxy must use its own dedicated port."):{status:"available",transport:"local-browser",url:proxy.href}):unsupported("remote-browser-loopback","The native proxy is on the DSH Host loopback address, not the remote browser machine. This browser cannot use its own 127.0.0.1 to reach that proxy. Open DSH locally over HTTP or use DSH Desktop; remote-browser native relay is not supported in this version.")}var import_react7=require("react");var EMPTY_TAB_SCROLL_METRICS={scrollable:!1,thumbWidth:0,thumbLeft:0,maxScrollLeft:0};function dimension(value){return Number.isFinite(value)?Math.max(0,value):0}function clamp(value,min,max){return value<min?min:value>max?max:value}function resolveTabScrollMetrics(input){let clientWidth=dimension(input.clientWidth),scrollWidth=dimension(input.scrollWidth),scrollLeft=dimension(input.scrollLeft),minThumbWidth=Math.max(1,dimension(input.minThumbWidth??24)),maxScrollLeft=Math.max(0,scrollWidth-clientWidth);if(clientWidth<=0||scrollWidth<=clientWidth+1||maxScrollLeft===0)return EMPTY_TAB_SCROLL_METRICS;let thumbWidth=clamp(Math.round(clientWidth*(clientWidth/scrollWidth)),Math.min(minThumbWidth,clientWidth),clientWidth),travel=Math.max(0,clientWidth-thumbWidth),thumbLeft=travel===0?0:Math.round(clamp(scrollLeft/maxScrollLeft,0,1)*travel);return{scrollable:!0,thumbWidth,thumbLeft,maxScrollLeft}}function resolveTabScrollWheel(input){let maxScrollLeft=dimension(input.maxScrollLeft);if(maxScrollLeft<=0)return{delta:0,consume:!1};let deltaX=Number.isFinite(input.deltaX)?input.deltaX:0,deltaY=Number.isFinite(input.deltaY)?input.deltaY:0;if(Math.abs(deltaX)>Math.abs(deltaY))return{delta:0,consume:!1};if(deltaY===0)return{delta:0,consume:!1};let scrollLeft=clamp(dimension(input.scrollLeft),0,maxScrollLeft),delta=clamp(scrollLeft+deltaY,0,maxScrollLeft)-scrollLeft;return delta===0?{delta:0,consume:!1}:{delta,consume:!0}}var import_jsx_runtime5=require("react/jsx-runtime"),useBrowserLayoutEffect=typeof window>"u"?import_react7.useEffect:import_react7.useLayoutEffect,SCROLL_HINT_MS=700;function TabScrollIndicator({scrollable,left,width,thumbWidth,thumbLeft,dragging,active,onThumbPointerDown,onThumbPointerMove,onThumbPointerUp,onThumbPointerCancel}){return!scrollable||width<=0||thumbWidth<=0?null:(0,import_jsx_runtime5.jsx)("div",{className:"dsh-md-native-tab-scroll","data-scrollable":"true","data-dragging":dragging?"true":"false","data-active":active?"true":"false",style:{left:`${left}px`,width:`${width}px`},"aria-hidden":"true",children:(0,import_jsx_runtime5.jsx)("div",{className:"dsh-md-native-tab-scroll-thumb",style:{width:`${thumbWidth}px`,transform:`translateX(${thumbLeft}px)`},...onThumbPointerDown===void 0?{}:{onPointerDown:onThumbPointerDown},...onThumbPointerMove===void 0?{}:{onPointerMove:onThumbPointerMove},...onThumbPointerUp===void 0?{}:{onPointerUp:onThumbPointerUp},...onThumbPointerCancel===void 0?{}:{onPointerCancel:onThumbPointerCancel}})})}function sameGeometry(left,right){return left.left===right.left&&left.width===right.width&&left.metrics.scrollable===right.metrics.scrollable&&left.metrics.thumbWidth===right.metrics.thumbWidth&&left.metrics.thumbLeft===right.metrics.thumbLeft&&left.metrics.maxScrollLeft===right.metrics.maxScrollLeft}function TabScrollbar({scrollerRef,barRef}){let[geometry,setGeometry]=(0,import_react7.useState)(void 0),[dragging,setDragging]=(0,import_react7.useState)(!1),[active,setActive]=(0,import_react7.useState)(!1),hintTimer=(0,import_react7.useRef)(void 0),frame=(0,import_react7.useRef)(void 0),drag=(0,import_react7.useRef)(void 0),measure=(0,import_react7.useCallback)(()=>{let scroller=scrollerRef.current,bar=barRef.current;if(scroller===null||bar===null)return;let scrollerRect=scroller.getBoundingClientRect(),barRect=bar.getBoundingClientRect(),next={left:Math.round(scrollerRect.left-barRect.left-bar.clientLeft),width:Math.round(scrollerRect.width),metrics:resolveTabScrollMetrics({clientWidth:scroller.clientWidth,scrollWidth:scroller.scrollWidth,scrollLeft:scroller.scrollLeft})};setGeometry(previous=>previous!==void 0&&sameGeometry(previous,next)?previous:next)},[scrollerRef,barRef]),revealHint=(0,import_react7.useCallback)(()=>{setActive(!0),hintTimer.current!==void 0&&window.clearTimeout(hintTimer.current),hintTimer.current=window.setTimeout(()=>{hintTimer.current=void 0,setActive(!1)},SCROLL_HINT_MS)},[]);useBrowserLayoutEffect(measure),(0,import_react7.useEffect)(()=>{let scroller=scrollerRef.current;if(scroller===null)return;let onScroll=()=>{frame.current===void 0&&(frame.current=window.requestAnimationFrame(()=>{frame.current=void 0,measure(),revealHint()}))};scroller.addEventListener("scroll",onScroll,{passive:!0});let observer=typeof ResizeObserver>"u"?void 0:new ResizeObserver(()=>{measure()});return observer?.observe(scroller),window.addEventListener("resize",measure),()=>{scroller.removeEventListener("scroll",onScroll),observer?.disconnect(),window.removeEventListener("resize",measure),frame.current!==void 0&&window.cancelAnimationFrame(frame.current),frame.current=void 0,hintTimer.current!==void 0&&window.clearTimeout(hintTimer.current),hintTimer.current=void 0}},[scrollerRef,measure,revealHint]),(0,import_react7.useEffect)(()=>{let scroller=scrollerRef.current;if(scroller===null)return;let onWheel=event=>{let scale=event.deltaMode===1?16:event.deltaMode===2?100:1,result=resolveTabScrollWheel({deltaX:event.deltaX*scale,deltaY:event.deltaY*scale,scrollLeft:scroller.scrollLeft,maxScrollLeft:scroller.scrollWidth-scroller.clientWidth});result.consume&&(event.preventDefault(),scroller.scrollLeft+=result.delta)};return scroller.addEventListener("wheel",onWheel,{passive:!1}),()=>scroller.removeEventListener("wheel",onWheel)},[scrollerRef]);let onThumbPointerDown=event=>{let scroller=scrollerRef.current,metrics2=geometry?.metrics;if(!(scroller===null||geometry===void 0||metrics2===void 0||!metrics2.scrollable)){drag.current={pointerId:event.pointerId,startX:event.clientX,startScrollLeft:scroller.scrollLeft,ratio:metrics2.maxScrollLeft/Math.max(1,geometry.width-metrics2.thumbWidth)},setDragging(!0);try{event.currentTarget.setPointerCapture(event.pointerId)}catch{}event.preventDefault()}},onThumbPointerMove=event=>{let current2=drag.current,scroller=scrollerRef.current;current2===void 0||scroller===null||current2.pointerId!==event.pointerId||(scroller.scrollLeft=current2.startScrollLeft+(event.clientX-current2.startX)*current2.ratio)},endDrag=event=>{if(drag.current?.pointerId===event.pointerId){drag.current=void 0,setDragging(!1);try{event.currentTarget.releasePointerCapture(event.pointerId)}catch{}}},metrics=geometry?.metrics??EMPTY_TAB_SCROLL_METRICS;return(0,import_jsx_runtime5.jsx)(TabScrollIndicator,{scrollable:metrics.scrollable,left:geometry?.left??0,width:geometry?.width??0,thumbWidth:metrics.thumbWidth,thumbLeft:metrics.thumbLeft,dragging,active,onThumbPointerDown,onThumbPointerMove,onThumbPointerUp:endDrag,onThumbPointerCancel:endDrag})}var import_jsx_runtime6=require("react/jsx-runtime"),useBrowserLayoutEffect2=typeof window>"u"?import_react8.useEffect:import_react8.useLayoutEffect;function getDesktopBrowserBridge(){let desktop=globalThis.dshDesktop;return desktop?.protocolVersion===1?desktop.browser:void 0}function postWebviewVisibility(webview,visible){try{let pending=webview.executeJavaScript?.(`window.postMessage(${JSON.stringify({__dshMdVisibility:!0,visible})}, '*')`);pending!==void 0&&pending.catch(()=>{})}catch{}}function KeepAliveDeviceFrame({device,active,reloadCount,t,onOpenSettings}){let access=assessBrowserNativeAccess({pageUrl:typeof window>"u"?"http://127.0.0.1:3080/":window.location.href??`${window.location.protocol}//${window.location.hostname}:3080/`,proxyUrl:device.nativeProxyUrl,desktopGuest:getDesktopBrowserBridge()!==void 0}),embeddingError=access.status==="available"?void 0:access.message,proxyUrl=access.status==="available"?access.url:void 0,targetUrl=proxyUrl===void 0?void 0:(()=>{try{let url=new URL(proxyUrl);return url.searchParams.set("md_client",clientStore.clientId),url.href}catch{return proxyUrl}})(),authRequired=device.authState==="required"||device.authState==="error",containerRef=(0,import_react8.useRef)(null),frameRef=(0,import_react8.useRef)(null),activeRef=(0,import_react8.useRef)(active),attemptKey=`${device.id}:${targetUrl??""}:${reloadCount}`,[failedAttempt,setFailedAttempt]=(0,import_react8.useState)(void 0),useDesktopWebview=getDesktopBrowserBridge()!==void 0&&failedAttempt!==attemptKey,[reconnectError,setReconnectError]=(0,import_react8.useState)(null);return(0,import_react8.useEffect)(()=>{activeRef.current=active},[active]),(0,import_react8.useEffect)(()=>{if(targetUrl===void 0)return;let message={__dshMdVisibility:!0,visible:active},postVisibility=()=>{let wrapper=frameRef.current;if(wrapper===null)return;let iframe=wrapper.querySelector("iframe");if(iframe!==null){let origin="*";try{origin=new URL(targetUrl).origin}catch{}try{iframe.contentWindow?.postMessage(message,origin)}catch{}return}let webview=wrapper.querySelector("webview");webview!==null&&postWebviewVisibility(webview,active)};postVisibility();let first=window.setTimeout(postVisibility,150),second=window.setTimeout(postVisibility,800);return()=>{window.clearTimeout(first),window.clearTimeout(second)}},[active,targetUrl,reloadCount,useDesktopWebview]),(0,import_react8.useEffect)(()=>{if(!active)return;let focusFrame=()=>{let wrapper=frameRef.current;if(wrapper===null)return;let webview=wrapper.querySelector("webview");if(webview!==null){try{webview.focus()}catch{}return}let iframe=wrapper.querySelector("iframe");try{iframe?.contentWindow?.focus()}catch{}};focusFrame();let timer=window.setTimeout(focusFrame,120);return()=>window.clearTimeout(timer)},[active]),(0,import_react8.useEffect)(()=>{if(authRequired||!useDesktopWebview)return;let bridge=getDesktopBrowserBridge(),container=containerRef.current;if(bridge===void 0||container===null||targetUrl===void 0)return;let cancelled=!1,currentEl,lease,release=()=>{let owned=lease;lease=void 0,owned!==void 0&&bridge.release(owned).catch(()=>{})},fail=()=>{cancelled||setFailedAttempt(attemptKey)};return bridge.acquire(`multi-device:${device.id}`).then(reservation=>{if(lease=reservation.lease,cancelled||containerRef.current!==container){release();return}let webview=document.createElement("webview");currentEl=webview,webview.className="dsh-md-native-iframe",webview.setAttribute("name",reservation.lease),webview.setAttribute("partition",reservation.partition),webview.setAttribute("allowpopups",""),webview.setAttribute("src",`about:blank#${reservation.lease}`),webview.addEventListener("did-fail-load",fail,{once:!0}),webview.addEventListener("dom-ready",()=>{cancelled||postWebviewVisibility(webview,activeRef.current)}),webview.addEventListener("dom-ready",()=>{if(!cancelled){try{activeRef.current&&webview.focus()}catch{}try{let wv=webview;wv.getURL?.().startsWith("about:blank#")&&wv.loadURL?.(targetUrl)?.then(()=>{cancelled||postWebviewVisibility(webview,activeRef.current)}).catch(fail)}catch{fail()}}},{once:!0}),container.appendChild(webview)}).catch(fail),()=>{cancelled=!0,currentEl?.remove(),release()}},[device.id,targetUrl,attemptKey,authRequired,useDesktopWebview]),(0,import_jsx_runtime6.jsx)("div",{ref:frameRef,className:"dsh-md-native-frame-wrap",style:{display:active?"flex":"none",visibility:active?"visible":"hidden"},"data-device-id":device.id,"data-active":active?"true":"false",children:authRequired?(0,import_jsx_runtime6.jsx)(AuthRequiredPanel,{device,t,onOpenSettings}):targetUrl===void 0?(0,import_jsx_runtime6.jsxs)("div",{className:"dsh-md-native-placeholder",children:[(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.StateDot,{state:deviceStateToDotState(device.state),size:12}),(0,import_jsx_runtime6.jsx)("div",{className:"dsh-md-row-name",children:device.name}),(0,import_jsx_runtime6.jsx)("div",{className:"dsh-md-pref-desc",children:embeddingError!==void 0?embeddingError:reconnectError??device.lastError??device.targetSummary}),(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Button,{variant:"primary",size:"sm",icon:(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconRefreshOutlineRegular,{size:13}),onClick:()=>{clientStore.reconnectDevice(device.id).then(res=>{setReconnectError(res.ok?null:res.error??t("actionFailed"))})},children:t("reconnect")})]}):useDesktopWebview?(0,import_jsx_runtime6.jsx)("div",{ref:containerRef,className:"dsh-md-native-iframe"}):(0,import_jsx_runtime6.jsx)("iframe",{className:"dsh-md-native-iframe",src:targetUrl,title:`DSH Native - ${device.name}`,allow:"clipboard-write; clipboard-read; fullscreen",allowFullScreen:!0,referrerPolicy:"no-referrer",onLoad:event=>{if(targetUrl===void 0)return;let origin="*";try{origin=new URL(targetUrl).origin}catch{}try{event.currentTarget.contentWindow?.postMessage({__dshMdVisibility:!0,visible:active},origin),active&&event.currentTarget.contentWindow?.focus()}catch{}}},`${device.id}:${reloadCount}`)})}function NativeTabBar({t,onOpenSettings}){let state=useMultiDeviceState(),{devices}=state.snapshot,visibleDevices=devices.filter(device=>device.enabled!==!1),[layout,setLayout]=(0,import_react8.useState)(void 0),[obstructed,setObstructed]=(0,import_react8.useState)(void 0),barRef=(0,import_react8.useRef)(null),tabsRef=(0,import_react8.useRef)(null),trailingRef=(0,import_react8.useRef)(null);useBrowserLayoutEffect2(()=>{if(typeof window>"u")return;let frame,frameObserver,resolveFrame=()=>{let shell=document.querySelector("[data-shell-overlay]")?.parentElement;return shell instanceof HTMLElement?shell:void 0},measure=()=>{let next=resolveFrame();next!==void 0&&next!==frame&&(frame=next,frameObserver?.disconnect(),frameObserver=typeof ResizeObserver>"u"?void 0:new ResizeObserver(measure),frameObserver?.observe(next));let rect=frame?.getBoundingClientRect(),chromeTop=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dsh-frame-chrome-top")),resolved=resolveBarLayout({frameLeft:rect?.left??0,frameTop:rect?.top??0,frameWidth:rect?.width??0,viewportWidth:window.innerWidth,chromeTop:Number.isFinite(chromeTop)?chromeTop:0});setLayout(previous=>previous!==void 0&&previous.left===resolved.left&&previous.top===resolved.top&&previous.width===resolved.width&&previous.compact===resolved.compact?previous:resolved),recordNativeBarMetrics(measureNativeBar({innerWidth:window.innerWidth,innerHeight:window.innerHeight,devicePixelRatio:window.devicePixelRatio,left:resolved.left,width:rect?.width??resolved.width}))};measure(),window.addEventListener("resize",measure);let hostObserver=typeof MutationObserver>"u"?void 0:new MutationObserver(measure);return hostObserver?.observe(document.documentElement,{attributes:!0,attributeFilter:["data-fullscreen","data-platform","data-windows-titlebar"]}),()=>{window.removeEventListener("resize",measure),frameObserver?.disconnect(),hostObserver?.disconnect(),recordNativeBarMetrics(void 0)}},[]),(0,import_react8.useEffect)(()=>{if(layout===void 0||typeof document>"u"||typeof document.elementFromPoint!="function")return;let handle=requestAnimationFrame(()=>{let element=trailingRef.current,barElement=barRef.current;if(element===null||barElement===null){setObstructed(void 0),recordNativeBarObstruction(void 0);return}let rect=element.getBoundingClientRect();if(rect.width===0||rect.height===0)return;let hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2),detail=hit===null||barElement.contains(hit)?void 0:describeObstruction(hit);setObstructed(previous=>previous===detail?previous:detail),recordNativeBarObstruction(detail===void 0?void 0:{detail,updatedAt:Date.now()})});return()=>cancelAnimationFrame(handle)},[layout,visibleDevices.length,state.activeNativeDeviceId]);let attentionByDevice=state.snapshot.attentionByDevice,unread=attentionByDevice!==void 0?attentionUnreadIds(attentionByDevice):countableUnreadIds(state.snapshot.unreadSessionIds,state.snapshot.archivedSessionIds,state.snapshot.subagentSessionIds),unreadByDevice=groupUnreadSessionIds(unread),activeDevice=visibleDevices.find(device=>device.id===state.activeNativeDeviceId),localActive=activeDevice===void 0,compact=layout?.compact===!0,clipped=layout?.clipped===!0,settingsButton=(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Tooltip,{label:t("settingsSectionTitle"),side:"bottom",align:compact?"start":"end",children:(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Button,{variant:"ghost",size:"sm",className:"dsh-md-icon-btn isCompact","aria-label":t("settingsSectionTitle"),onClick:onOpenSettings,children:(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconSettingsOutlineRegular,{size:14})})}),bar=(0,import_jsx_runtime6.jsxs)("div",{className:"dsh-md-native-bar",ref:barRef,"data-compact":compact?"true":"false","data-clipped":clipped?"true":"false","data-obstructed":obstructed??"false","data-mode":"native",style:layout===void 0?void 0:{left:`${layout.left}px`,top:`${layout.top}px`,width:`${layout.width}px`},children:[(0,import_jsx_runtime6.jsxs)("div",{className:"dsh-md-native-tabs",role:"tablist","aria-label":t("nativeTabsLabel"),ref:tabsRef,children:[(0,import_jsx_runtime6.jsxs)("div",{className:"dsh-md-native-tab-item",children:[(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Pill,{active:localActive,role:"tab","aria-selected":localActive,onClick:()=>clientStore.selectLocalNativeTab(),children:(0,import_jsx_runtime6.jsxs)("span",{className:"dsh-md-pill-inner",children:[(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconGlobeOutlineRegular,{size:13}),(0,import_jsx_runtime6.jsx)("span",{children:t("nativeLocalTab")})]})}),(0,import_jsx_runtime6.jsx)(AttentionDetails,{view:attentionByDevice?.[LOCAL_DEVICE_ID],deviceName:t("nativeLocalTab"),t,nativeBar:!0,fallback:{unreadSessionIds:unreadByDevice.get(LOCAL_DEVICE_ID)??EMPTY_UNREAD_SESSION_IDS,fresh:attentionByDevice===void 0}})]}),visibleDevices.map(dev=>{let isSelected=dev.id===state.activeNativeDeviceId,isKeptAlive=state.keepAliveDeviceIds.includes(dev.id);return(0,import_jsx_runtime6.jsxs)("div",{className:"dsh-md-native-tab-item",children:[(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Pill,{active:isSelected,role:"tab","aria-selected":isSelected,title:dev.latencyMs!==void 0?`${dev.name} \xB7 ${dev.latencyMs}ms`:dev.name,onClick:()=>{clientStore.selectNativeDevice(dev.id)},children:(0,import_jsx_runtime6.jsxs)("span",{className:"dsh-md-pill-inner",children:[(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.StateDot,{state:deviceStateToDotState(dev.state),size:8}),(0,import_jsx_runtime6.jsx)("span",{className:"dsh-md-pill-name",children:dev.name})]})}),(0,import_jsx_runtime6.jsx)(AttentionDetails,{view:attentionByDevice?.[dev.id],deviceName:dev.name,t,nativeBar:!0,fallback:{runningCount:attentionByDevice===void 0?dev.runningSessionCount:void 0,pendingCount:attentionByDevice===void 0?dev.pendingApprovalCount:void 0,unreadSessionIds:unreadByDevice.get(dev.id)??EMPTY_UNREAD_SESSION_IDS,fresh:attentionByDevice===void 0&&dev.state==="connected"&&dev.catalogStale!==!0}}),dev.keepNativeAlive!==!1&&isKeptAlive&&(0,import_jsx_runtime6.jsx)("span",{className:"dsh-md-tab-release",children:(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Tooltip,{label:t("releaseKeepAlive"),side:"bottom",children:(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Button,{variant:"ghost",size:"sm",className:"dsh-md-icon-btn isCompact","aria-label":t("releaseKeepAlive"),onClick:()=>clientStore.releaseKeepAliveDevice(dev.id),children:(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconCloseOutlineRegular,{size:12})})})})]},dev.id)})]}),(0,import_jsx_runtime6.jsxs)("div",{className:"dsh-md-native-bar-trailing",ref:trailingRef,children:[activeDevice!==void 0&&(0,import_jsx_runtime6.jsxs)("div",{className:"dsh-md-native-bar-actions",children:[(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Tooltip,{label:t("reloadPage"),side:"bottom",children:(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Button,{variant:"ghost",size:"sm",className:"dsh-md-icon-btn isCompact","aria-label":t("reloadPage"),onClick:()=>clientStore.reloadNativeDevice(activeDevice.id),children:(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconRefreshOutlineRegular,{size:14})})}),(activeDevice.nativeProxyUrl??activeDevice.effectiveBaseUrl)!==void 0&&(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Tooltip,{label:t("openExternal"),side:"bottom",children:(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Button,{variant:"ghost",size:"sm",className:"dsh-md-icon-btn isCompact","aria-label":t("openExternal"),onClick:()=>{let access=assessBrowserNativeAccess({pageUrl:window.location.href,proxyUrl:activeDevice.nativeProxyUrl,desktopGuest:getDesktopBrowserBridge()!==void 0});access.status==="available"&&window.open(access.url,"_blank","noopener,noreferrer")},children:(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconRightUpOutlineRegular,{size:14})})})]}),settingsButton]}),(0,import_jsx_runtime6.jsx)(TabScrollbar,{scrollerRef:tabsRef,barRef})]});return typeof document>"u"?bar:(0,import_react_dom.createPortal)(bar,document.body)}function NativeViewport({t,onOpenSettings}){let state=useMultiDeviceState(),{devices}=state.snapshot,visibleDevices=devices.filter(device=>device.enabled!==!1),activeDevice=visibleDevices.find(device=>device.id===state.activeNativeDeviceId),stageRef=(0,import_react8.useRef)(null),previousStates=(0,import_react8.useRef)(new Map),previousProxyReady=(0,import_react8.useRef)(new Map);(0,import_react8.useEffect)(()=>{let prevMap=previousStates.current,prevReadyMap=previousProxyReady.current,nextMap=new Map,nextReadyMap=new Map;for(let dev of visibleDevices){let readyNow=dev.proxyReady===!0;nextMap.set(dev.id,dev.state),nextReadyMap.set(dev.id,readyNow);let prevState=prevMap.get(dev.id),prevReady=prevReadyMap.get(dev.id),proxyJustBecameReady=prevReady===!1&&readyNow,stateJustConnected=prevState!==void 0&&prevState!=="connected"&&dev.state==="connected"&&!readyNow,stateConnectedWithoutPriorProxyReload=prevState!==void 0&&prevState!=="connected"&&dev.state==="connected"&&prevReady!==!0;(proxyJustBecameReady||stateJustConnected||stateConnectedWithoutPriorProxyReload)&&(dev.nativePaneState==="idle"||dev.nativePaneState==="failed"||dev.nativePaneState===void 0)&&(state.keepAliveDeviceIds.includes(dev.id)||activeDevice?.id===dev.id)&&clientStore.reloadNativeDevice(dev.id)}previousStates.current=nextMap,previousProxyReady.current=nextReadyMap},[visibleDevices,state.keepAliveDeviceIds,activeDevice?.id]);let mountedDeviceIds=new Set(state.keepAliveDeviceIds);activeDevice!==void 0&&mountedDeviceIds.add(activeDevice.id);let mountedDevices=visibleDevices.filter(device=>mountedDeviceIds.has(device.id)),stageVisible=activeDevice!==void 0;return(0,import_jsx_runtime6.jsxs)("div",{ref:stageRef,className:"dsh-md-native-stage","data-visible":stageVisible?"true":"false","data-bridge":activeDevice?.nativePaneState??"idle","aria-hidden":!stageVisible,children:[activeDevice!==void 0&&activeDevice.nativePaneState==="failed"&&(0,import_jsx_runtime6.jsxs)("div",{className:"dsh-md-bridge-failed",role:"status",children:[(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconWarningOutlineRegular,{size:16}),(0,import_jsx_runtime6.jsxs)("div",{className:"dsh-md-bridge-failed-text",children:[(0,import_jsx_runtime6.jsx)("span",{className:"dsh-md-bridge-failed-title",children:t("bridgeFailedTitle").replace("{name}",activeDevice.name)}),activeDevice.nativePaneError!==void 0&&activeDevice.nativePaneError!==""&&(0,import_jsx_runtime6.jsx)("span",{className:"dsh-md-bridge-failed-error",title:activeDevice.nativePaneError,children:t("bridgeFailedError").replace("{error}",activeDevice.nativePaneError)})]}),(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Button,{variant:"outline",size:"sm",icon:(0,import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconRefreshOutlineRegular,{size:14}),onClick:()=>clientStore.reloadNativeDevice(activeDevice.id),children:t("bridgeFailedReload")})]}),(0,import_jsx_runtime6.jsx)("div",{className:"dsh-md-native-stage-body",children:mountedDevices.map(device=>(0,import_jsx_runtime6.jsx)(KeepAliveDeviceFrame,{device,active:stageVisible&&device.id===activeDevice?.id,reloadCount:state.reloadCounters[device.id]??0,t,onOpenSettings},device.id))})]})}var import_jsx_runtime7=require("react/jsx-runtime"),FRAME_NATIVE_CLASS="dsh-md-frame-native",FRAME_DESKTOP_CLASS="dsh-md-frame-desktop",useBrowserLayoutEffect3=typeof window>"u"?import_react9.useEffect:import_react9.useLayoutEffect;function isDesktopRuntime(){return globalThis.dshDesktop?.protocolVersion===1}function NativeOverlay({t,onOpenSettings}){let state=useMultiDeviceState(),layerRef=(0,import_react9.useRef)(null);return useBrowserLayoutEffect3(()=>{let frame=layerRef.current?.closest("[data-shell-overlay]")?.parentElement;if(frame instanceof HTMLElement)return frame.classList.add(FRAME_NATIVE_CLASS),frame.classList.toggle(FRAME_DESKTOP_CLASS,isDesktopRuntime()),()=>{frame.classList.remove(FRAME_NATIVE_CLASS),frame.classList.remove(FRAME_DESKTOP_CLASS)}},[]),(0,import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment,{children:[(0,import_jsx_runtime7.jsxs)("div",{ref:layerRef,className:"dsh-md-native-layer","data-native":"true",children:[(0,import_jsx_runtime7.jsx)(NativeTabBar,{t,onOpenSettings}),(0,import_jsx_runtime7.jsx)(NativeViewport,{t,onOpenSettings})]}),(0,import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives6.Modal,{open:state.settingsModalOpen,onClose:()=>clientStore.setSettingsModalOpen(!1),title:t("settingsSectionTitle"),closeLabel:t("close"),className:"dsh-md-fallback-modal",children:(0,import_jsx_runtime7.jsx)(MultiDeviceHubPanel,{t,hideHeader:!0,onCloseSettings:()=>clientStore.setSettingsModalOpen(!1)})})]})}function existingSessionStatusNotifier(service){let listeners=service?.statusListeners;if(!(listeners instanceof Set)||[...listeners].some(listener=>typeof listener!="function")){console.warn("[dsh-multi-device] DSH session-status notification bridge unavailable; reload the page to enable the unread overlay for existing views.");return}return alreadyNotified=>{for(let listener of[...listeners])if(!(typeof listener!="function"||alreadyNotified.has(listener)))try{listener()}catch{}}}function mergeSessionStatus(base,unread,shouldOverride){let next=new Map;if(base===void 0)return next;if(unread===void 0){for(let[sessionId,value]of base)next.set(sessionId,value);return next}for(let[sessionId,value]of base){if(!shouldOverride(sessionId)){next.set(sessionId,value);continue}let shouldBeUnread=unread.has(sessionId);value.completionUnread===shouldBeUnread?next.set(sessionId,value):next.set(sessionId,{...value,completionUnread:shouldBeUnread})}return next}function sameStatusMap(left,right){if(left===right)return!0;if(left.size!==right.size)return!1;for(let[sessionId,value]of left){let candidate=right.get(sessionId);if(candidate===void 0||candidate.running!==value.running||candidate.pendingInteraction!==value.pendingInteraction||candidate.completionUnread!==value.completionUnread)return!1}return!0}function installReadStateOverlay(options){let source=options.source;if(source===void 0)return()=>{};let originalGet=source.getSnapshot,originalSubscribe=source.subscribe;if(typeof originalGet!="function"||typeof originalSubscribe!="function")return()=>{};let listeners=new Set,cache,disposed=!1,invalidate=()=>{cache=void 0;let notified=new Set(listeners);for(let listener of notified)try{listener()}catch{}options.notifyExistingSubscribers?.(notified)};source.getSnapshot=()=>{let next=mergeSessionStatus(originalGet.call(source),options.getUnread(),options.shouldOverride);return cache!==void 0&&sameStatusMap(cache,next)||(cache=next),cache},source.subscribe=listener=>{let offBase=originalSubscribe.call(source,listener);return listeners.add(listener),()=>{try{offBase()}catch{}listeners.delete(listener)}};let offReadState=options.subscribeReadState(invalidate);return invalidate(),()=>{if(!disposed){disposed=!0;try{offReadState()}catch{}source.getSnapshot=originalGet,source.subscribe=originalSubscribe,invalidate(),listeners.clear()}}}var PERSIST_PREFIX="dsh.workspace.view.";function readPersistedView(){if(!(typeof localStorage>"u"))try{let keys=[];for(let index=0;index<localStorage.length;index+=1){let key=localStorage.key(index);key!==null&&key.startsWith(PERSIST_PREFIX)&&keys.push(key)}keys.sort().reverse();for(let key of keys){let raw=localStorage.getItem(key);if(raw===null)continue;let parsed=JSON.parse(raw);if(typeof parsed!="object"||parsed===null||Array.isArray(parsed))continue;let record=parsed,groups={};if(typeof record.groupExpansion=="object"&&record.groupExpansion!==null&&!Array.isArray(record.groupExpansion))for(let[groupKey,expanded]of Object.entries(record.groupExpansion))typeof expanded=="boolean"&&(groups[groupKey]=expanded);return sanitizeWorkspaceViewState({groups,groupBy:record.groupBy,orderBy:record.orderBy,archivedFilter:record.archivedFilter})}}catch{}}function currentOrders(){if(typeof localStorage>"u")return{};try{let raw=localStorage.getItem("dsh.workspace.view.v5");if(raw===null)return{};let orders=JSON.parse(raw).sessionOrderByAccount;if(typeof orders!="object"||orders===null||Array.isArray(orders))return{};let out={};for(let[key,value]of Object.entries(orders))Array.isArray(value)&&value.every(item=>typeof item=="string")&&(out[key]=value.slice(0,5e3));return out}catch{return{}}}function installLocalUiStateSync(options){let view=options.uiWorkspace?.view;if(view===void 0||typeof view.setGroupExpanded!="function")return()=>{};let marker="__dshMdLocalUiStateSync",marked=view;if(marked[marker]===!0)return()=>{};marked[marker]=!0;let originals={setGroupExpanded:view.setGroupExpanded,retainAccountKeys:view.retainAccountKeys,setGroupBy:view.setGroupBy,setOrderBy:view.setOrderBy,setArchivedFilter:view.setArchivedFilter},state=readPersistedView()??{groups:{}},applying=!1,disposed=!1,timer,publish=()=>{disposed||applying||(timer!==void 0&&clearTimeout(timer),timer=setTimeout(()=>{timer=void 0,!disposed&&!applying&&options.report(state)},180))},setGroup=(key,expanded)=>{state.groups[key]!==expanded&&(state={...state,groups:{...state.groups,[key]:expanded}},publish())},apply2=remote=>{if(remote===void 0||disposed)return;let remoteKeys=new Set(Object.keys(remote.groups)),localOnly=Object.keys(state.groups).some(key=>!remoteKeys.has(key));applying=!0;try{for(let[key,expanded]of Object.entries(remote.groups))if(state.groups[key]!==expanded)try{originals.setGroupExpanded?.call(view,key,expanded)}catch{}if(remote.groupBy!==void 0&&remote.groupBy!==state.groupBy)try{originals.setGroupBy?.call(view,remote.groupBy)}catch{}if(remote.orderBy!==void 0&&remote.orderBy!==state.orderBy)try{originals.setOrderBy?.call(view,remote.orderBy,currentOrders())}catch{}if(remote.archivedFilter!==void 0&&remote.archivedFilter!==state.archivedFilter)try{originals.setArchivedFilter?.call(view,remote.archivedFilter)}catch{}state={groups:{...state.groups,...remote.groups},...remote.groupBy===void 0?state.groupBy===void 0?{}:{groupBy:state.groupBy}:{groupBy:remote.groupBy},...remote.orderBy===void 0?state.orderBy===void 0?{}:{orderBy:state.orderBy}:{orderBy:remote.orderBy},...remote.archivedFilter===void 0?state.archivedFilter===void 0?{}:{archivedFilter:state.archivedFilter}:{archivedFilter:remote.archivedFilter}}}finally{applying=!1}localOnly&&publish()};typeof originals.setGroupExpanded=="function"&&(view.setGroupExpanded=(key,expanded)=>{originals.setGroupExpanded.call(view,key,expanded),applying||setGroup(key,expanded===!0)}),typeof originals.retainAccountKeys=="function"&&(view.retainAccountKeys=keys=>{if(originals.retainAccountKeys.call(view,keys),applying)return;let retained=new Set(keys),groups={};for(let[key,expanded]of Object.entries(state.groups))retained.has(key)&&(groups[key]=expanded);state={...state,groups},publish()}),typeof originals.setGroupBy=="function"&&(view.setGroupBy=mode=>{if(originals.setGroupBy.call(view,mode),applying)return;let groupBy=sanitizeWorkspaceViewState({groups:{},groupBy:mode}).groupBy;groupBy!==void 0&&(state={...state,groupBy},publish())}),typeof originals.setOrderBy=="function"&&(view.setOrderBy=(mode,orders)=>{if(originals.setOrderBy.call(view,mode,orders),applying)return;let orderBy=sanitizeWorkspaceViewState({groups:{},orderBy:mode}).orderBy;orderBy!==void 0&&(state={...state,orderBy},publish())}),typeof originals.setArchivedFilter=="function"&&(view.setArchivedFilter=filter=>{if(originals.setArchivedFilter.call(view,filter),applying)return;let archivedFilter=sanitizeWorkspaceViewState({groups:{},archivedFilter:filter}).archivedFilter;archivedFilter!==void 0&&(state={...state,archivedFilter},publish())});let initial=options.getHostState();initial!==void 0?apply2(initial):publish();let unsubscribe=options.subscribeHostState(()=>{apply2(options.getHostState())});return()=>{disposed=!0,timer!==void 0&&clearTimeout(timer),unsubscribe(),typeof originals.setGroupExpanded=="function"&&(view.setGroupExpanded=originals.setGroupExpanded),typeof originals.retainAccountKeys=="function"&&(view.retainAccountKeys=originals.retainAccountKeys),typeof originals.setGroupBy=="function"&&(view.setGroupBy=originals.setGroupBy),typeof originals.setOrderBy=="function"&&(view.setOrderBy=originals.setOrderBy),typeof originals.setArchivedFilter=="function"&&(view.setArchivedFilter=originals.setArchivedFilter),delete marked[marker]}}var STYLE_TAG_ID="dsh-multi-device/styles.css",CSS_TEXT=`

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

.dsh-md-card.isDisabled .dsh-md-row-name {
  color: var(--dsw-alias-label-secondary);
}

.dsh-md-device-toggle {
  display: inline-flex;
  align-items: center;
  margin-left: 2px;
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

/*
 * DSH's real Button primitive only supports 'sm' | 'md' sizes (size='icon'
 * accidentally applies the inner 16x16 icon-span class onto <button> while
 * keeping padding: 0 14px, collapsing child SVGs to 0px wide). Always render
 * icon-only buttons with size='sm' plus this class to clear horizontal padding
 * and protect the SVG box.
 */
.dsh-md-icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  flex: none;
  color: var(--dsw-alias-label-secondary);
}

.dsh-md-icon-btn:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
}

.dsh-md-icon-btn.isCompact {
  width: 22px;
  height: 22px;
}

.dsh-md-icon-btn.isDanger:hover:not(:disabled) {
  color: var(--dsw-alias-state-error-primary, #ef4444);
}

.dsh-md-icon-btn svg {
  flex: none;
  display: block;
}

.dsh-md-danger-action {
  color: var(--dsw-alias-state-error-primary, #ef4444);
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

/*
 * Overlay scrollbar for the device strip.
 *
 * Absolutely positioned inside the bar \u2014 the bar is fixed, so it is the
 * containing block \u2014 and *not* inside the tab scroller: a positioned child of
 * the scroller would be dragged along by scrollLeft, and an in-flow one would
 * change the row's height. Nothing here takes part in the bar's flex layout,
 * which is what keeps every pill at the exact box it had before.
 *
 * Hidden by default; the bar's hover/focus reveals it, a drag holds it open,
 * and data-active covers the no-hover case. The thumb, not the track, owns
 * pointer events, so the 3px strip never steals a tab click.
 */
.dsh-md-native-tab-scroll {
  position: absolute;
  bottom: 2px;
  height: 3px;
  z-index: 2;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
  -webkit-app-region: no-drag;
}

.dsh-md-native-tab-scroll-thumb {
  height: 100%;
  border-radius: 999px;
  background: var(
    --dsw-alias-scrollbar-bg-l2,
    color-mix(in srgb, var(--dsw-alias-label-tertiary) 55%, transparent)
  );
  pointer-events: none;
  cursor: grab;
}

.dsh-md-native-bar:hover .dsh-md-native-tab-scroll[data-scrollable='true'],
.dsh-md-native-bar:focus-within .dsh-md-native-tab-scroll[data-scrollable='true'],
.dsh-md-native-tab-scroll[data-dragging='true'] {
  opacity: 1;
}

.dsh-md-native-bar:hover .dsh-md-native-tab-scroll[data-scrollable='true'] .dsh-md-native-tab-scroll-thumb,
.dsh-md-native-bar:focus-within .dsh-md-native-tab-scroll[data-scrollable='true'] .dsh-md-native-tab-scroll-thumb,
.dsh-md-native-tab-scroll[data-dragging='true'] .dsh-md-native-tab-scroll-thumb {
  pointer-events: auto;
}

.dsh-md-native-tab-scroll-thumb:hover,
.dsh-md-native-tab-scroll[data-dragging='true'] .dsh-md-native-tab-scroll-thumb {
  background: var(
    --dsw-alias-scrollbar-hover-l2,
    color-mix(in srgb, var(--dsw-alias-label-secondary) 70%, transparent)
  );
}

.dsh-md-native-tab-scroll[data-dragging='true'] .dsh-md-native-tab-scroll-thumb {
  cursor: grabbing;
}

/*
 * Touch: there is no hover, so the thumb appears for a moment after a pan.
 * It stays non-interactive there \u2014 native panning is the gesture, and a 3px
 * grab target would only compete with it. touch-action is deliberately left
 * at its default so a vertical swipe starting on the strip still scrolls the
 * page instead of being swallowed.
 */
@media (hover: none) {
  .dsh-md-native-tab-scroll[data-scrollable='true'][data-active='true'] {
    opacity: 1;
  }

  .dsh-md-native-tab-scroll-thumb {
    pointer-events: none !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dsh-md-native-tab-scroll {
    transition: none;
  }
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
 * The keep-alive release control exists only while that device's page is really
 * mounted. Keep a fixed 22x22 slot in flow and render the button visibly at
 * muted opacity so users can see and click it immediately without hovering
 * blindly, brightening on tab hover or focus.
 */
.dsh-md-tab-release {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: none;
  opacity: 0.6;
  pointer-events: auto;
  transition: opacity 0.12s ease;
}

.dsh-md-native-tab-item:hover .dsh-md-tab-release,
.dsh-md-native-tab-item:focus-within .dsh-md-tab-release {
  opacity: 1;
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
 * Tab status capsule: ONE capsule per device, numbers only. Colour is the
 * category \u2014 needs-reply (amber) \u2192 running (blue) \u2192 finished-unread (green) \u2014
 * and the words live in the title attribute, the aria-label and the menu heading.
 *
 * Only categories with members render a segment, so a quiet device carries no
 * invisible reservation; the three 30px slots plus the separate freshness marker
 * this replaces are what made the strip read as a row of scattered dots. Digits
 * are tabular and every segment keeps a two-digit cell, so 1 \u2194 9 \u2194 99 cannot
 * nudge the neighbouring tabs; only a category appearing or disappearing
 * reflows, which is a real change worth showing.
 */
html {
  --dsh-md-tone-pending: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary, #f59e0b));
  --dsh-md-tone-running: var(--dsw-alias-state-business-primary, #679efe);
  --dsh-md-tone-done: var(--dsw-alias-state-success-label, var(--dsw-alias-state-success-primary, #1f8b4c));
  --dsh-md-status-segment-width: 22px;
}

.dsh-md-attention {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: none;
}

/* Nothing to report and nothing stale: stay out of the tab's gap arithmetic so
 * a quiet device's tab is exactly as wide as its pill. */
.dsh-md-attention:empty {
  display: none;
}

.dsh-md-tab-status {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  box-sizing: border-box;
  height: 20px;
  padding: 0 3px;
  flex: none;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-3);
}

/* Menu wraps its anchor in a span; keep the segments flush inside the capsule. */
.dsh-md-tab-status > span {
  display: inline-flex;
  align-items: center;
}

/* Dock the capsule to its device tab; Settings rows keep their own row gap. */
.dsh-md-native-tab-item .dsh-md-tab-status {
  margin-inline-start: 4px;
}

/*
 * Cached or partial data is not an authoritative zero, so the capsule states
 * that itself instead of adding a second amber marker beside the numbers: it
 * dims and goes dashed, and with nothing to count it collapses to an empty ring.
 */
.dsh-md-tab-status[data-stale='true'] {
  opacity: 0.5;
  border-style: dashed;
}

.dsh-md-tab-status[data-empty='true'] {
  width: 10px;
  height: 10px;
  padding: 0;
}

.dsh-md-tab-status-seg {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: var(--dsh-md-status-segment-width, 22px);
  height: 18px;
  padding: 0 4px;
  flex: none;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background-color 0.12s ease;
}

/* The number stays small while the hit box still clears a comfortable target.
 * The button must not clip: a pseudo-element that overflows a clipping box stops
 * receiving pointer events, which would silently undo the enlargement. */
.dsh-md-tab-status-seg::after {
  content: '';
  position: absolute;
  inset: -3px -1px;
}

.dsh-md-tab-status-seg[data-tone='pending'] {
  color: var(--dsh-md-tone-pending);
}

.dsh-md-tab-status-seg[data-tone='running'] {
  color: var(--dsh-md-tone-running);
}

.dsh-md-tab-status-seg[data-tone='done'] {
  color: var(--dsh-md-tone-done);
}

.dsh-md-tab-status-seg:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-tab-status-seg[data-open='true'] {
  background: var(--dsw-alias-interactive-bg-selected);
}

.dsh-md-tab-status-seg:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
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
`;function adoptMultiDeviceStyles(){if(typeof document>"u"||document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`)!==null)return;let tag=document.createElement("style");tag.setAttribute("data-plugin","dsh-multi-device"),tag.setAttribute("data-plugin-css",STYLE_TAG_ID),tag.textContent=CSS_TEXT,document.head.appendChild(tag)}var TASKBAR_SEGMENT_ORDER=["running","pending","unread"];function finiteCount(value){return value!==void 0&&Number.isFinite(value)?Math.max(0,Math.floor(value)):0}function tallyTaskbarSessions(input){let disabledDeviceIds=new Set(input.devices.filter(device=>device.enabled===!1).map(device=>device.id)),attention=input.attentionByDevice;if(attention!==void 0&&Object.keys(attention).length>0){let running2=new Set,pending2=new Set,unread2=new Set;for(let[deviceId,view]of Object.entries(attention))if(!(view===void 0||disabledDeviceIds.has(deviceId))){for(let sessionId of view.runningSessionIds)running2.add(sessionId);for(let sessionId of view.pendingSessionIds)pending2.add(sessionId);for(let sessionId of view.unreadSessionIds)unread2.add(sessionId)}return{running:running2.size,pending:pending2.size,unread:unread2.size}}let enabledDevices=input.devices.filter(device=>device.enabled!==!1),running=enabledDevices.reduce((sum,device)=>sum+finiteCount(device.runningSessionCount),0),pending=enabledDevices.reduce((sum,device)=>sum+finiteCount(device.pendingApprovalCount),0),visibleUnread=input.unreadSessionIds.filter(sessionId=>{let decoded=decodeSessionId(sessionId);return!decoded.isRemote||!disabledDeviceIds.has(decoded.deviceId)}),unread=countableUnreadIds(visibleUnread,input.archivedSessionIds,input.subagentSessionIds).size;return{running,pending,unread}}function taskbarSegments(tally){return TASKBAR_SEGMENT_ORDER.flatMap(category=>tally[category]>0?[{category,count:tally[category]}]:[])}var SEGMENT_KEY={running:"taskbarRunningSegment",pending:"taskbarPendingSegment",unread:"taskbarUnreadSegment"};function formatTaskbarSummary(tally,t){let segments=taskbarSegments(tally);if(segments.length!==0)return segments.map(({category,count})=>t(SEGMENT_KEY[category]).replace("{count}",String(count))).join(" ")}var MAX_TITLE_LENGTH=300;function cleanTitle2(value){if(typeof value!="string")return;let text=value.replace(/[\u0000-\u001f\u007f]+/g," ").replace(/\s+/g," ").trim().slice(0,MAX_TITLE_LENGTH);return text===""?void 0:text}function resolveWindowTitle(input){let summary=cleanTitle2(input.summary);if(summary!==void 0)return summary;if(input.activeNativeDeviceId===void 0)return;let device=input.devices.find(candidate=>candidate.id===input.activeNativeDeviceId&&candidate.enabled!==!1);return device===void 0?void 0:(device.state==="connected"?cleanTitle2(device.nativePaneTitle):void 0)??cleanTitle2(device.name)}function resolveTaskbarSummary(snapshot,t){if(snapshot.ui?.taskbarSummary===!0)return formatTaskbarSummary(tallyTaskbarSessions(snapshot),t)}var DocumentTitleController=class{titleDescriptor;ownPropertyInstalled=!1;baseTitle="";override;observer;installed=!1;install(){if(this.installed)return!0;if(typeof document>"u")return!1;this.installed=!0;let cursor=document,descriptor;for(;cursor!==null&&(descriptor=Object.getOwnPropertyDescriptor(cursor,"title"),!(descriptor?.get!==void 0&&descriptor.set!==void 0));)cursor=Object.getPrototypeOf(cursor);if(descriptor?.get!==void 0&&descriptor.set!==void 0){this.titleDescriptor=descriptor;try{this.baseTitle=String(descriptor.get.call(document));let self=this;return Object.defineProperty(document,"title",{configurable:!0,enumerable:descriptor.enumerable===!0,get(){return self.titleDescriptor?.get?.call(document)??document.title},set(value){let text=String(value);(self.override===void 0||text!==self.override)&&(self.baseTitle=text),self.override===void 0&&self.titleDescriptor?.set?.call(document,text)}}),this.ownPropertyInstalled=!0,!0}catch{this.titleDescriptor=void 0}}if(this.baseTitle=document.title,typeof MutationObserver>"u")return!1;try{let observedTitle=typeof document.querySelector=="function"?document.querySelector("head > title"):null,bindTarget=obs=>{let currentTitle=typeof document.querySelector=="function"?document.querySelector("head > title"):null;obs.disconnect(),observedTitle=currentTitle,currentTitle!==null?obs.observe(currentTitle,{childList:!0,characterData:!0,subtree:!0}):obs.observe(document.head??document.documentElement,{subtree:!0,childList:!0,characterData:!0})};return this.observer=new MutationObserver(()=>{(observedTitle===null||!observedTitle.isConnected)&&this.observer!==void 0&&bindTarget(this.observer),this.override!==void 0&&document.title!==this.override&&(document.title=this.override)}),bindTarget(this.observer),!0}catch{return!1}}apply(next){if(!this.installed)return;let normalized=next===void 0?void 0:cleanTitle2(next);if(normalized===this.override)return;this.override=normalized;let value=normalized??this.baseTitle;try{this.titleDescriptor?.set?.call(document,value)}catch{try{document.title=value}catch{}}}dispose(){if(this.observer?.disconnect(),this.observer=void 0,this.ownPropertyInstalled){try{Reflect.deleteProperty(document,"title")}catch{}this.ownPropertyInstalled=!1}this.override=void 0;try{document.title=this.baseTitle}catch{}this.installed=!1}};function installWindowTitle(t){let controller=new DocumentTitleController;if(!controller.install())return()=>{};let sync=()=>{let state=clientStore.getSnapshot();try{let summary=resolveTaskbarSummary(state.snapshot,t);controller.apply(resolveWindowTitle({...state.activeNativeDeviceId!==void 0?{activeNativeDeviceId:state.activeNativeDeviceId}:{},devices:state.snapshot.devices,...summary!==void 0?{summary}:{}}))}catch{}},unsubscribe=clientStore.subscribe(sync);return sync(),()=>{unsubscribe(),controller.dispose()}}var import_jsx_runtime8=require("react/jsx-runtime"),SETTINGS_SECTION_ID="multi-device",PANEL_ID=SETTINGS_SECTION_ID,inject=["slots","locale"],zhPreferred=typeof navigator<"u"?navigator.language.toLowerCase().startsWith("zh"):!0,fallbackDict=zhPreferred?zh:en;function translateFallback(key){return fallbackDict[key]??en[key]??key}function openSettingsSection(ctx,sectionId=SETTINGS_SECTION_ID){try{let openSection=ctx.slots.entries?.("sidebar.settings")?.[0]?.options?.store?.create?.()?.actions?.openSection;if(typeof openSection=="function")return openSection(sectionId),!0}catch{}return clientStore.setSettingsModalOpen(!0),!1}function currentMainSessionId(list){for(let sessionId of list.ids)if((list.byId[sessionId]?.retainedBy?.mainView??0)>0)return sessionId}function installLocalSessionTracking(source){let ctx={sessions:source.sessions,layout:source.layout??source.get?.("layout"),get:source.get?.bind(source)},resolveLayout=()=>ctx.layout??ctx.get?.("layout"),isGlobalPanelActive=()=>{try{let activePanelId=resolveLayout()?.panelInfo?.getSnapshot()?.activePanelId;return activePanelId!=null}catch{return!1}},syncMainSession=()=>{let list=ctx.sessions?.list.getSnapshot(),current2=list===void 0?void 0:currentMainSessionId(list);return clientStore.setMainViewVisible(!isGlobalPanelActive()),isGlobalPanelActive()||current2!==void 0&&clientStore.reportLocalMainSession(current2),current2},unsubscribeSessions2=ctx.sessions?.list.subscribe?.(()=>{syncMainSession()}),unsubscribePanelInfo=resolveLayout()?.panelInfo?.subscribe?.(()=>{syncMainSession()});return syncMainSession(),()=>{unsubscribeSessions2?.(),unsubscribePanelInfo?.()}}function apply(ctx){try{applyClient(ctx)}catch(error){throw console.error("[dsh-multi-device] client entry failed to activate",error),error}}function applyClient(ctx){adoptMultiDeviceStyles(),ctx.effect(()=>ctx.locale.register(LOCALE_NS,{zh,en}),"dsh-multi-device: locales"),ctx.effect(()=>clientStore.start(),"dsh-multi-device: client-store");let getTranslate=()=>{try{return ctx.locale.bind?.(LOCALE_NS)??translateFallback}catch{return translateFallback}};ctx.effect(()=>installWindowTitle(getTranslate()),"dsh-multi-device: window title");let handleOpenSettings=()=>{openSettingsSection(ctx,SETTINGS_SECTION_ID)};ctx.inject(["sessions","uiWorkspace"],serviceCtx=>{serviceCtx.effect(()=>bindClientServices({...serviceCtx.sessions!==void 0?{sessions:serviceCtx.sessions}:{},...serviceCtx.uiWorkspace!==void 0?{uiWorkspace:serviceCtx.uiWorkspace}:{}}),"dsh-multi-device: client services"),serviceCtx.effect(()=>installLocalUiStateSync({...serviceCtx.uiWorkspace===void 0?{}:{uiWorkspace:serviceCtx.uiWorkspace},getHostState:()=>clientStore.getSnapshot().snapshot.uiState,subscribeHostState:listener=>clientStore.subscribe(listener),report:state=>{clientStore.patchUiState(state).catch(()=>{})}}),"dsh-multi-device: local view state")}),ctx.inject(["sessions","layout"],trackCtx=>{trackCtx.effect(()=>installLocalSessionTracking(trackCtx),"dsh-multi-device: local session tracking")}),ctx.inject(["uiSession"],readCtx=>{readCtx.effect(()=>{let service=readCtx.uiSession??readCtx.get?.("uiSession");return installReadStateOverlay({source:service?.sessionStatus,notifyExistingSubscribers:service===void 0?void 0:existingSessionStatusNotifier(service),getUnread:()=>{let snapshot=clientStore.getSnapshot();if(snapshot.snapshot.revision!==0)return new Set(snapshot.snapshot.unreadSessionIds??[])},subscribeReadState:listener=>clientStore.subscribe(listener),shouldOverride:()=>!0})},"dsh-multi-device: device unread overlay")}),ctx.slots.inject("settings.section",()=>ctx.slots.register({name:"settings.section",id:SETTINGS_SECTION_ID,order:12,label:()=>getTranslate()("settingsSectionTitle"),locale:LOCALE_NS},props=>(0,import_jsx_runtime8.jsx)(MultiDeviceHubPanel,{t:props.t??getTranslate(),onCloseSettings:props.close}))),ctx.slots.inject("plugins.bundle.config",()=>ctx.slots.register({name:"plugins.bundle.config",key:"dsh-multi-device",locale:LOCALE_NS},props=>{let t=props.t??getTranslate();return props.view==="summary"?t("pluginSummary"):(0,import_jsx_runtime8.jsx)(MultiDeviceHubPanel,{t,hideHeader:!0})})),ctx.slots.inject("shell.overlay",()=>ctx.slots.register({name:"shell.overlay",id:"multi-device-switcher",order:40,locale:LOCALE_NS},props=>(0,import_jsx_runtime8.jsx)(NativeOverlay,{t:props.t??getTranslate(),onOpenSettings:handleOpenSettings})))}
return module.exports; } });
//# sourceMappingURL=client.js.map

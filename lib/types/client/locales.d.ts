/**
 * Bilingual (`zh` / `en`) UI copy for `dsh-multi-device`.
 *
 * Keeps terminology concise and aligned with official DSH Settings sections.
 *
 * @module dsh-multi-device/client/locales
 */
export declare const LOCALE_NS: "multiDevice";
export declare const zh: {
    readonly settingsSectionTitle: "多设备";
    readonly settingsSectionIntro: "通过 SSH 隧道连接远端开发机，在侧边栏统一聚合会话，或切换至完整的远端原生界面。";
    readonly pluginSummary: "连接多台远端 DSH 开发机，支持跨机工作区聚合与原生界面切换。";
    readonly close: "关闭";
    readonly modeRowTitle: "界面模式";
    readonly modeRowDesc: "聚合模式在当前侧边栏合并所有设备的会话；原生模式直接展示指定远端设备的完整界面。";
    readonly modeAggregated: "聚合模式";
    readonly modeNative: "原生模式";
    readonly modeNativeNoDeviceHint: "请先添加至少一台远端设备";
    readonly switchToAggregated: "返回聚合模式";
    readonly toggleMode: "切换聚合模式 / 原生模式";
    readonly gitAutoTitle: "自动聚合相同 Git 仓库";
    readonly gitAutoDesc: "将不同设备上指向同一 Git 远端的工作区合并展示会话，不会同步或修改任何项目文件。";
    readonly targetDeviceHeading: "跨设备仓库的新建会话默认设备";
    readonly devicesHeading: "远端设备";
    readonly addDevice: "添加设备";
    readonly editDevice: "编辑设备";
    readonly importSshPlaceholder: "从 ~/.ssh/config 快速填入…";
    readonly sshHost: "SSH 主机";
    readonly sshHostPlaceholder: "~/.ssh/config 主机别名、IP，或 user@host:port";
    readonly deviceName: "显示名称（可选）";
    readonly deviceNamePlaceholder: "留空默认使用主机名";
    readonly authCredential: "远端启动链接或 Token（可选）";
    readonly authCredentialPlaceholder: "首次连接可粘贴 dsh web 启动链接或 Token；已认证可留空";
    readonly keyReveal: "显示凭据";
    readonly keyHide: "隐藏凭据";
    readonly advancedOptions: "高级连接选项";
    readonly remoteDshPort: "远端 DSH 端口";
    readonly sshUser: "SSH 用户名";
    readonly sshUserPlaceholder: "留空复用 ~/.ssh/config";
    readonly sshPort: "SSH 端口";
    readonly sshKeySelect: "SSH 私钥";
    readonly sshKeyAuto: "自动（SSH Agent / 默认密钥）";
    readonly sshKeyPassphrase: "私钥口令";
    readonly sshKeyPassphrasePlaceholder: "输入加密私钥口令；留空使用 SSH Agent";
    readonly sshProxyJump: "ProxyJump 跳板机";
    readonly sshProxyJumpPlaceholder: "可选，留空复用 ~/.ssh/config";
    readonly authBootstrap: "通过 SSH 读取远端凭据并签发 Cookie（签名密钥不写入本机）";
    readonly remoteDshHome: "远端 DSH 主目录（可选）";
    readonly remoteDshHomePlaceholder: "默认 ~/.dsh";
    readonly testConnection: "测试连接";
    readonly testingConnection: "测试中…";
    readonly testPassed: "连接成功";
    readonly saveDevice: "保存";
    readonly savingDevice: "保存中…";
    readonly cancel: "取消";
    readonly reconnect: "重新连接";
    readonly reconnectedNotice: "已触发重新连接";
    readonly remove: "移除";
    readonly deleteTitle: "移除设备“{name}”？";
    readonly deleteDescription: "移除后将断开该设备的 SSH 隧道，并停止聚合其工作区与会话。远端设备上的数据不受影响。";
    readonly deleteConfirm: "移除设备";
    readonly deletingDevice: "移除中…";
    readonly openNative: "原生界面";
    readonly openExternal: "在浏览器中打开";
    readonly reloadPage: "刷新远端页面";
    readonly releaseKeepAlive: "关闭后台保活页面";
    readonly statusConnected: "已连接";
    readonly statusConnecting: "连接中";
    readonly statusReconnecting: "重连中";
    readonly statusError: "连接异常";
    readonly statusDisabled: "已停用";
    readonly runningCount: "{count} 运行中";
    readonly pendingCount: "{count} 待确认";
    readonly noDevicesTitle: "尚未添加远端设备";
    readonly noDevicesDesc: "点击上方“添加设备”，通过 SSH 连接你的其他开发机或服务器。";
    readonly menuOpenInNative: "在原生模式中打开所属设备";
    readonly hoverDeviceLabel: "所属设备";
    readonly hoverGitRepoLabel: "Git 仓库";
    readonly gatewayDegradedNotice: "聚合网关当前处于降级状态，原生模式仍可正常使用";
    readonly savedNotice: "设置已保存";
    readonly actionFailed: "操作失败";
};
export type MultiDeviceLocaleKey = keyof typeof zh;
export declare const en: Record<MultiDeviceLocaleKey, string>;

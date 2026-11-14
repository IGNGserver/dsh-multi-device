import type { Locale } from '../types'

export const COPY = {
  zh: {
    nav: {
      badge: 'v0.3.6 · 原生模式架构',
      convergence: '空间汇聚',
      workbench: '交互工作台',
      architecture: 'SSH 与代理架构',
      boundaries: '边界契约',
      install: '安装指南',
      github: 'GitHub',
      releases: '发行版下载',
      langToggle: 'EN',
    },
    hero: {
      eyebrow: 'dsh-multi-device · DeepSeek Harness 多设备管理插件',
      titleLine1: '多台开发机的完整 DSH，',
      titleLine2: '磁吸汇聚于同一道顶部标签栏。',
      subtitle:
        '通过本机系统 OpenSSH 隧道直连远端环回 dsh web。「本机」保持未经改装的本地界面，每台远端服务器在各自 Keep-Alive 页面内独立运行完整 DSH——零远端插件、不混入本机会话、不触碰或同步任何项目源码。',
      ctaInteractive: '进入交互式多设备工作台',
      ctaInstall: '快速安装（Release .tgz）',
      ctaArch: '阅读原生架构说明',
      scrollHint: '向下滚动或点击阶段，观看四台离散开发机磁吸合拢',
      phases: [
        { id: 0, code: '01', label: '离散实例', sub: '4 台机器独立运行 DSH' },
        { id: 1, code: '02', label: '环回锁定', sub: 'System SSH 隧道对准 127.0.0.1' },
        { id: 2, code: '03', label: '保活层叠', sub: '独立 DOM 驻留，绝不混写会话' },
        { id: 3, code: '04', label: '磁吸成台', sub: '42px 常驻标签栏统一调度' },
      ],
      hudTelemetry: {
        scattered: '离散状态：4 个独立窗口散落于不同终端与服务器，上下文切换需频繁找窗口与重连',
        aligning: '隧道建立：复用 ~/.ssh/config 与 SSH Agent，仅转发远端 127.0.0.1:3080 环回监听',
        stacking: '空间层叠：每台远端分配独立本地环回反向代理端口，WebSocket 与 Lexical 草稿持续保活',
        snapped: '磁吸就绪：顶部 42px 标签条锁定于宿主框架，点击设备标签零重载瞬时切换！',
      },
    },
    workbench: {
      eyebrow: 'LIVE INTERACTIVE WORKBENCH · 真实交互演示',
      title: '亲手切换设备、审批远端命令、点击状态胶囊直达会话',
      subtitle:
        '下方工作台严格还原 DeepSeek Harness 官方 --dsw-* 视觉令牌与 dsh-multi-device 原生模式组件。试着在远端输入框打字后切回「本机」，或点击顶部黄 / 蓝 / 绿数字胶囊打开官方会话菜单。',
      controls: {
        exploded3d: '3D 保活层叠透视',
        exploded3dActive: '退出 3D 层叠透视',
        taskbarTitle: '窗口标题任务汇总',
        simulatePending: '+ 触发待回复 (黄)',
        simulateRunning: '+ 新建运行中 (蓝)',
        simulateUnread: '+ 产生完成未读 (绿)',
        simulateStale: '模拟闪断缓存态 (虚线)',
        simulateRecover: '恢复实时连接',
        resetDemo: '重置演示状态',
      },
      legend: {
        pending: '待回复（工具审批 / 提问）',
        running: '运行中（含子代理活动）',
        unread: '完成未读（turn/end 游标）',
        stale: '缓存 / 同步中（非权威零值）',
      },
      nativeBar: {
        localTab: '本机',
        settingsTooltip: '多设备设置',
        reloadTooltip: '刷新远端页面',
        externalTooltip: '在浏览器独立窗口打开',
        releaseTooltip: '关闭后台保活页面',
        staleHint: '同步中 / 上次已知快照（非权威零值）',
        pendingGroup: '{count} 待回复',
        runningGroup: '{count} 运行中',
        unreadGroup: '{count} 完成未读',
        taskbarRun: '{count}跑',
        taskbarWait: '{count}待',
        taskbarDone: '{count}结',
      },
      pane: {
        newSession: '新建会话',
        workspacesHeader: '工作区（仅当前设备本地目录）',
        localIsolationNote: '仅显示此机器自己的工作区与会话',
        keepAliveUnmountedTitle: '后台保活页面已手动释放',
        keepAliveUnmountedDesc: '远端 dsh web 与任务仍在服务器继续运行；重新挂载即可恢复原生界面。',
        remountBtn: '重新挂载原生页面',
        composerPlaceholder: '在此设备输入指令或草稿（切换设备标签不会丢失草稿）…',
        sendBtn: '发送指令',
        approveTitle: '等待工具执行批准 · Waiting for approval',
        approveDesc: '远端 Agent 请求在此服务器执行受控命令，批准后将实时转为蓝色运行态：',
        approveAllow: '允许一次 (Enter)',
        approveReject: '拒绝 (Esc)',
        bridgePill: 'Loopback Proxy · Keep-Alive 已挂载',
        localDomPill: 'Host 原生 DOM · 零代理开销',
      },
      settingsModal: {
        title: '设置 → 多设备 (MultiDeviceHubPanel)',
        intro: '通过系统 SSH 连接远端开发机。顶部标签页常驻：本机显示本地 DSH，每台远端设备在各自标签页运行完整界面。',
        prefTaskbar: '窗口标题显示任务汇总',
        prefTaskbarDesc: '将系统窗口与任务栏标题实时更新为「1跑 1待 2结」，零成员类别自动省略。',
        prefReadSync: '跨 DSH Host 同步未读状态',
        prefReadSyncDesc: '经现有 SSH 写入仅含会话 ID 与 turn/end 游标的轻量文件，不上传任何消息正文。',
        prefUiSync: '跨控制机同步界面状态',
        prefUiSyncDesc: '同步工作区折叠/分组/排序枚举至 views/<hostId>.json，远端零插件、零守护进程。',
        devicesHeading: '远端设备',
        importBtn: '+ 从 ~/.ssh/config 一键导入 prod-arm64',
        importedTag: '已导入 prod-arm64',
        close: '完成并关闭',
      },
    },
    architecture: {
      eyebrow: 'PURE NATIVE ARCHITECTURE · 0.3.x 原生架构解析',
      title: '为什么采用「系统 SSH 环回隧道 + 逐设备独立本地代理」？',
      subtitle:
        '拒绝脆弱的 HTML/AST 改写，也拒绝向本机控制器塞入外部会话状态。远端数据只走两条干净通路：轻量目录事件投影与完整原生页面保活。',
      pillars: [
        {
          tag: '01 · TRANSPORT & CREDENTIALS',
          title: 'System OpenSSH 环回隧道与无密钥落盘鉴权',
          summary:
            '默认直接调用宿主系统 ssh 客户端（-N -T -o StrictHostKeyChecking=yes -L 127.0.0.1:<local>:127.0.0.1:<remote>），100% 原生复用 ~/.ssh/config 别名、ProxyJump 跳板、ControlMaster 与系统 SSH Agent / Keychain。',
          points: [
            '强制 assertLoopbackForward：转发目标仅限远端 127.0.0.1 / localhost / ::1，绝不变相开放内网跳板或公网端口',
            'SSH 只读读取远端 $DSH_HOME/.credentials.yaml 换取本地会话 Cookie，远端签名密钥永不写入控制机磁盘',
            '指数退避（600ms → 15s + Jitter）健康巡检，隧道重连后自动恢复已挂载页面的单次就绪刷新',
          ],
          code: `ssh -N -T \\
  -o ExitOnForwardFailure=yes \\
  -o BatchMode=yes \\
  -o ServerAliveInterval=15 \\
  -o StrictHostKeyChecking=yes \\
  -L 127.0.0.1:52184:127.0.0.1:3080 \\
  ubuntu-dev`,
        },
        {
          tag: '02 · NATIVE REVERSE PROXY & BRIDGE',
          title: '逐设备独立 Loopback 端口与幂等桥接',
          summary:
            '官方 DSH 前端使用根路径资源（/assets/*、/plugins/??*、/api/remote.mux）。为每台设备分配独立本地 127.0.0.1:<port> 反向代理，无需篡改远端业务脚本即可 100% 完整运行模型选择、终端、文件预览与上传。',
          points: [
            '自动注入受控 Cookie 与 Origin，剥离客户端伪造认证头与 X-Frame-Options，兼容 Electron <webview> 独立 partition',
            '轻量 __md/bridge.js 双向同步会话打开（open-session）、工作区折叠态与可见性门控（__dshMdVisibility）',
            '隐藏保活标签页绝不静默吞掉新完成提醒；仅当页面真正可见且确认官方 turn/end 终态时才发送幂等 read-ack',
          ],
          code: `// Keep-Alive Stage: 切换只隐藏 display，不卸载实例
<div class="dsh-md-native-frame-wrap"
     data-device-id="ubuntu-dev"
     style="display: none; visibility: hidden">
  <iframe src="http://127.0.0.1:52184/?md_client=9f2a" />
</div>`,
        },
        {
          tag: '03 · EPOCH-FENCED ATTENTION PROJECTION',
          title: '代际隔离目录（Epoch）与互斥三态关注胶囊',
          summary:
            '每台设备拥有独立连接代际 epoch：先订阅 $events 实时流，再单航道（single-flight）拉取会话与工作区基线并重放增量日志；过时代际的数据帧一律丢弃。',
          points: [
            '严格互斥优先级：待回复（黄） > 运行中/子代理运行（蓝） > 完成未读（绿），单设备仅挂一枚纯数字胶囊',
            '固定双位等宽数字格（tabular-nums），1 → 9 → 99 绝不推挤相邻标签；零计数类别直接隐去，安静设备零视觉噪音',
            '断线或同步中使用半透明虚线胶囊（空计数退化为 10px 虚线圈），绝不把陈旧快照伪装成权威零值',
          ],
          code: `// src/attention.ts · 互斥分类优先级
if (fact.pending > 0)      pendingSessionIds.push(id)
else if (fact.running)     runningSessionIds.push(id)
else if (unread.has(id))   unreadSessionIds.push(id)
// 自动排除已归档与独立 subagent 子行，完整保留 fork`,
        },
      ],
    },
    boundaries: {
      eyebrow: 'ARCHITECTURAL CONTRACT · 架构诚实与设计边界',
      title: '清晰克制的产品定位：它是什么，更不是什么',
      subtitle:
        '多设备协同最常见的工程灾难，就是把代码同步、会话混写与远端守护进程强行揉成一团黑盒。dsh-multi-device 从架构根源划清四条红线：',
      cards: [
        {
          badge: 'NO FILE SYNC',
          wrong: '不是文件同步或代码镜像工具',
          right: '零克隆、零 rsync、零项目文件改写',
          desc: '插件从不复制、同步或触碰任何机器上的仓库文件。代码在哪台服务器编译与运行，就原封不动留在那台服务器的磁盘上。',
        },
        {
          badge: 'NO MERGED SESSIONS',
          wrong: '不是全局会话大杂烩合并器',
          right: '本机侧栏 100% 纯净，会话严格归属原设备',
          desc: '绝不向本地 Session Controller 注入远端会话，也不拼凑跨机聊天记录。每台设备拥有自己独立的侧边栏、模型配置、沙箱权限与终端上下文。',
        },
        {
          badge: 'ZERO REMOTE PLUGIN',
          wrong: '不需要在远端安装插件或守护进程',
          right: '仅控制机安装，远端只需原生 dsh web',
          desc: '被管开发机、GPU 节点或容器无需安装 dsh-multi-device，也不接管远端 Agent Loop；随时停用或卸载插件，远端环境毫发无损。',
        },
        {
          badge: 'FAIL-CLOSED SECURITY',
          wrong: '不靠裸奔代理或关闭校验“强行可用”',
          right: '不支持的拓扑明确告知原因，绝不静默降级',
          desc: '强制 StrictHostKeyChecking=yes；遇到远程浏览器直连控制机 loopback、HTTPS→HTTP 混合内容或 IPv6 父页面时明确给出原因，不暴露公网端口。',
        },
      ],
    },
    install: {
      eyebrow: 'INSTALLATION & VERIFICATION · 安装与验收',
      title: '三分钟接入你的多机开发矩阵',
      subtitle:
        '使用 GitHub Releases 已验证的预构建 .tgz 资产安装，普通用户无需 clone 仓库或本地编译。（注：公共 npm 注册表未发布同名包，请始终使用精确 Release 资产 URL。）',
      tabs: [
        {
          id: 'manager',
          label: '1. 官方插件管理器（推荐）',
          note: '适用于 DSH Desktop 应用内与 DSH Web Host 页面，自动匹配当前 Profile 与包管理器。',
          steps: [
            '在控制机确认系统 OpenSSH 可用，并已完成首次 known_hosts 指纹核验：ssh -V && ssh -o StrictHostKeyChecking=yes <你的主机别名> true',
            '在远端开发机启动原生 dsh web（保持默认 127.0.0.1 环回监听即可，无需开放防火墙端口）。',
            '打开控制机 DSH 侧栏「插件 → 添加插件 / 安装第三方插件」，粘贴 GitHub Releases 中已验证版本的完整 dsh-multi-device-vX.Y.Z.tgz 下载链接，启用后按提示重启并刷新。',
          ],
          codeLabel: '精确 Release .tgz 资产 URL 格式（请在 Releases 页面复制目标版本实际链接）',
          code: `https://github.com/IGNGserver/dsh-multi-device/releases/download/v0.3.6/dsh-multi-device-v0.3.6.tgz`,
        },
        {
          id: 'web-cli',
          label: '2. DSH Web 官方 CLI',
          note: '先停止使用同一 web Profile 的 dsh web 进程并备份配置，再执行安装。',
          steps: [
            '检查官方 DSH CLI 版本，确保使用同一套安装入口。',
            '通过 dsh plugin --profile web add 安装指定 Release .tgz URL（或已校验 SHA-256 的本地绝对路径）。',
            '核对 --dump-config 输出后重新启动 dsh web，在「设置 → 多设备」导入 ~/.ssh/config 主机。',
          ],
          codeLabel: 'DSH Web Profile 命令行安装',
          code: `# 1. 确认系统 SSH 与主机指纹已就绪
ssh -V
ssh -o StrictHostKeyChecking=yes your-host-alias true

# 2. 停止当前 web Profile 进程后安装指定 Release 资产
dsh --version
dsh plugin --profile web add "https://github.com/IGNGserver/dsh-multi-device/releases/download/v0.3.6/dsh-multi-device-v0.3.6.tgz"
dsh --profile web --dump-config
dsh web`,
        },
        {
          id: 'desktop-cli',
          label: '3. DSH Desktop CLI（含前置条件）',
          note: 'Desktop 优先推荐应用内插件管理器；使用 CLI 时必须先让 Desktop 初始化一次并完全退出（含托盘进程），且必须使用 Desktop 自带的 dsh 入口（不能用 npm 另装的 CLI）。',
          steps: [
            '首次正常打开 DSH Desktop 完成 desktop Profile 初始化，随后完全退出应用（含后台托盘）。',
            '使用 DSH Desktop 安装目录提供的官方 dsh 入口执行 desktop Profile 安装。',
            '重新启动 DSH Desktop，确认顶部出现 [本机][设备…] 常驻标签栏。',
          ],
          codeLabel: 'DSH Desktop 自带 CLI 入口安装',
          code: `# 前置条件：Desktop 已初始化一次并完全退出；此处 dsh 须为 Desktop 自带入口
dsh plugin --profile desktop add "https://github.com/IGNGserver/dsh-multi-device/releases/download/v0.3.6/dsh-multi-device-v0.3.6.tgz"`,
        },
      ],
      copyBtn: '复制',
      copiedBtn: '已复制',
      checklistTitle: '安装后四步快速自检（点击勾选）',
      checklist: [
        '插件管理器显示目标版本与精确来源，重启后无激活报错，「设置 → 多设备」可正常打开',
        '控制机 ssh -V 正常、known_hosts 已登记；连接设备采用默认 system-ssh，未隐式安装原生构建脚本',
        '顶部常驻 [本机][设备…] 标签条：「本机」侧栏仅含本地会话，远端标签展示该机完整 DSH 且来回切换不重载',
        '胶囊计数准确反映黄（待回复）/ 蓝（运行中）/ 绿（完成未读），点击菜单行可直接切到对应设备并打开会话',
      ],
    },
    footer: {
      summary: 'dsh-multi-device · 面向多开发机与异构服务器矩阵的原生 DeepSeek Harness 空间标签栏插件。',
      mit: 'MIT License · 遵循原子持久化与最小权限安全边界',
      links: {
        repo: 'GitHub 仓库',
        releases: 'Releases 发行包',
        arch: 'NATIVE-ARCHITECTURE.md',
        issues: '问题反馈',
      },
    },
  },
  en: {
    nav: {
      badge: 'v0.3.6 · Pure Native Mode',
      convergence: 'Spatial Convergence',
      workbench: 'Live Workbench',
      architecture: 'SSH & Proxy Architecture',
      boundaries: 'Contract & Boundaries',
      install: 'Install',
      github: 'GitHub',
      releases: 'Releases',
      langToggle: '中文',
    },
    hero: {
      eyebrow: 'dsh-multi-device · Multi-Device Plugin for DeepSeek Harness',
      titleLine1: 'Every machine’s full native DSH,',
      titleLine2: 'magnetically docked into one tab strip.',
      subtitle:
        'Connect remote dsh web hosts over system OpenSSH loopback tunnels. "This Device" stays your untouched local DSH, while each remote server runs its complete UI in a Keep-Alive frame — zero remote plugins, zero merged session soup, zero file sync.',
      ctaInteractive: 'Explore Interactive Workbench',
      ctaInstall: 'Quick Install (Release .tgz)',
      ctaArch: 'Read Native Architecture',
      scrollHint: 'Scroll down or click a phase to watch 4 independent machines dock into one frame',
      phases: [
        { id: 0, code: '01', label: 'Scattered Hosts', sub: '4 independent DSH instances' },
        { id: 1, code: '02', label: 'Loopback Lock', sub: 'System SSH tunnels bind 127.0.0.1' },
        { id: 2, code: '03', label: 'Keep-Alive Stack', sub: 'Isolated DOM layers stay mounted' },
        { id: 3, code: '04', label: 'Magnetic Snap', sub: '42px native tab strip takes helm' },
      ],
      hudTelemetry: {
        scattered: 'Scattered: 4 separate DSH windows across local laptop, Linux devbox, GPU node, and CI mini',
        aligning: 'Tunnel Lock: Reusing ~/.ssh/config & SSH Agent, strictly forwarding remote 127.0.0.1:3080 loopback',
        stacking: 'Z-Stacking: Dedicated per-device loopback proxy ports keep WebSockets & Lexical drafts alive',
        snapped: 'Docked: Persistent 42px native bar locked to Host frame — switch machines with zero reload!',
      },
    },
    workbench: {
      eyebrow: 'LIVE INTERACTIVE WORKBENCH · HANDS-ON SIMULATION',
      title: 'Switch machines, approve remote tools, and jump via status capsules',
      subtitle:
        'Built with authentic DeepSeek Harness --dsw-* tokens and dsh-multi-device Native Mode geometry. Type a draft on a remote server, switch back to This Device, or click any amber / blue / green count segment to open the official DSH Menu.',
      controls: {
        exploded3d: '3D Keep-Alive Stack X-Ray',
        exploded3dActive: 'Exit 3D Stack X-Ray',
        taskbarTitle: 'Window Title Task Summary',
        simulatePending: '+ Needs Reply (Amber)',
        simulateRunning: '+ Start Running (Blue)',
        simulateUnread: '+ Unread Done (Green)',
        simulateStale: 'Simulate Stale / Offline (Dashed)',
        simulateRecover: 'Reconnect Live Stream',
        resetDemo: 'Reset Demo',
      },
      legend: {
        pending: 'Needs reply (approval / question)',
        running: 'Running (incl. subagents)',
        unread: 'Finished, unread (turn/end)',
        stale: 'Cached / syncing (non-zero-authoritative)',
      },
      nativeBar: {
        localTab: 'This Device',
        settingsTooltip: 'Multi-Device Settings',
        reloadTooltip: 'Reload remote page',
        externalTooltip: 'Open in standalone browser tab',
        releaseTooltip: 'Close background Keep-Alive page',
        staleHint: 'Syncing / last-known snapshot (not an authoritative zero)',
        pendingGroup: '{count} needs reply',
        runningGroup: '{count} running',
        unreadGroup: '{count} finished, unread',
        taskbarRun: '{count} run',
        taskbarWait: '{count} wait',
        taskbarDone: '{count} done',
      },
      pane: {
        newSession: 'New Session',
        workspacesHeader: 'Workspaces (Local to this machine only)',
        localIsolationNote: 'Shows only workspaces & sessions owned by this machine',
        keepAliveUnmountedTitle: 'Background Keep-Alive frame released',
        keepAliveUnmountedDesc: 'Remote dsh web and running turns continue untouched on the server; remount anytime.',
        remountBtn: 'Remount Native Page',
        composerPlaceholder: 'Type a prompt or draft on this machine (preserved across tab switches)…',
        sendBtn: 'Send Prompt',
        approveTitle: 'Waiting for tool approval',
        approveDesc: 'Remote Agent requests permission on this server. Approving transitions Amber → Blue running:',
        approveAllow: 'Allow once (Enter)',
        approveReject: 'Reject (Esc)',
        bridgePill: 'Loopback Proxy · Keep-Alive Mounted',
        localDomPill: 'Host Native DOM · Zero Proxy Overhead',
      },
      settingsModal: {
        title: 'Settings → Multi-Device (MultiDeviceHubPanel)',
        intro: 'Connect remote machines over SSH. This Device is your local DSH, and every remote runs its complete UI in its own tab.',
        prefTaskbar: 'Show task totals in the window title',
        prefTaskbarDesc: 'Updates window & taskbar title to "1 run 1 wait 2 done"; empty categories are omitted.',
        prefReadSync: 'Sync unread state across DSH Hosts',
        prefReadSyncDesc: 'Exchanges lightweight session-ID + turn/end cursor metadata over SSH; zero message content uploaded.',
        prefUiSync: 'Sync view state across Controllers',
        prefUiSyncDesc: 'Persists workspace fold/group/sort enums in views/<hostId>.json with zero remote plugin or daemon.',
        devicesHeading: 'Remote devices',
        importBtn: '+ Quick import prod-arm64 from ~/.ssh/config',
        importedTag: 'prod-arm64 imported',
        close: 'Done',
      },
    },
    architecture: {
      eyebrow: 'PURE NATIVE ARCHITECTURE · 0.3.x DESIGN',
      title: 'Why System SSH Loopback Tunnels + Per-Device Local Reverse Proxies?',
      subtitle:
        'No brittle HTML/JS AST rewriting and no foreign session injection into your local controller. Remote data travels along two clean channels: epoch-fenced catalog metadata and full Keep-Alive native pages.',
      pillars: [
        {
          tag: '01 · TRANSPORT & CREDENTIALS',
          title: 'System OpenSSH Loopback Tunnel & Secret-Free Cookie Bootstrap',
          summary:
            'Spawns the OS ssh client (-N -T -o StrictHostKeyChecking=yes -L 127.0.0.1:<local>:127.0.0.1:<remote>), inheriting 100% of ~/.ssh/config aliases, ProxyJump, ControlMaster, and OS SSH Agent / Keychain.',
          points: [
            'Enforces assertLoopbackForward: forwards strictly to remote 127.0.0.1 / localhost / ::1 — never turning local ports into LAN jumpgates',
            'Reads remote $DSH_HOME/.credentials.yaml over SSH to mint a local session Cookie; remote signing secrets never touch local disk',
            'Exponential backoff (600ms → 15s + jitter) health supervision with automatic single-reload recovery on reconnect',
          ],
          code: `ssh -N -T \\
  -o ExitOnForwardFailure=yes \\
  -o BatchMode=yes \\
  -o ServerAliveInterval=15 \\
  -o StrictHostKeyChecking=yes \\
  -L 127.0.0.1:52184:127.0.0.1:3080 \\
  ubuntu-dev`,
        },
        {
          tag: '02 · NATIVE REVERSE PROXY & BRIDGE',
          title: 'Dedicated Per-Device Loopback Origin & Idempotent Bridge',
          summary:
            'Official DSH Web UI relies on root-relative paths (/assets/*, /plugins/??*, /api/remote.mux). Giving each device its own 127.0.0.1:<port> proxy preserves 100% native models, terminals, diffs, and uploads without AST hacks.',
          points: [
            'Injects authenticated Cookie & Origin, strips client auth-smuggling headers, and supports isolated Electron <webview> partitions',
            'Lightweight __md/bridge.js relays open-session navigation, workspace fold state, and __dshMdVisibility gating',
            'Hidden Keep-Alive tabs never silently clear unread completions; idempotent read-ack fires only once visible with verified turn/end',
          ],
          code: `// Keep-Alive Stage: hide via display, never unmount
<div class="dsh-md-native-frame-wrap"
     data-device-id="ubuntu-dev"
     style="display: none; visibility: hidden">
  <iframe src="http://127.0.0.1:52184/?md_client=9f2a" />
</div>`,
        },
        {
          tag: '03 · EPOCH-FENCED ATTENTION PROJECTION',
          title: 'Epoch-Fenced Catalogs & Exclusive 3-Tone Status Capsules',
          summary:
            'Every device maintains an independent connection epoch: subscribe to $events first, fetch baseline single-flight, replay bounded journal increments, and drop stale-generation frames.',
          points: [
            'Mutually exclusive urgency: Needs reply (Amber) > Running / Subagents (Blue) > Finished unread (Green) in one pure-digit capsule',
            'Fixed 2-digit tabular cells prevent 1 → 9 → 99 from nudging adjacent tabs; empty categories render zero width on quiet devices',
            'Offline or syncing state dims with a dashed border (or 10px dashed ring when empty), never faking an authoritative zero',
          ],
          code: `// src/attention.ts · Exclusive urgency order
if (fact.pending > 0)      pendingSessionIds.push(id)
else if (fact.running)     runningSessionIds.push(id)
else if (unread.has(id))   unreadSessionIds.push(id)
// Excludes archived & subagent rows; preserves forks`,
        },
      ],
    },
    boundaries: {
      eyebrow: 'ARCHITECTURAL CONTRACT · EXPLICIT BOUNDARIES',
      title: 'Precision by Restraint: What It Is — and What It Refuses to Be',
      subtitle:
        'Multi-machine developer tools fall apart when they conflate file syncing, merged chat state, and invasive remote daemons. dsh-multi-device enforces four strict architectural invariants:',
      cards: [
        {
          badge: 'NO FILE SYNC',
          wrong: 'NOT a file synchronizer or repo cloner',
          right: 'Zero cloning, zero rsync, zero file mutation',
          desc: 'The plugin never copies, mirrors, or modifies project files across machines. Source trees and build artifacts stay strictly on the machine that owns them.',
        },
        {
          badge: 'NO MERGED SESSIONS',
          wrong: 'NOT a global merged-session aggregator',
          right: 'Local sidebar stays 100% local; each machine owns its sessions',
          desc: 'Remote sessions are never injected into your local Session Controller. Each device tab runs its own authentic sidebar, model routing, terminal, and sandbox.',
        },
        {
          badge: 'ZERO REMOTE PLUGIN',
          wrong: 'NO remote plugin or background daemon required',
          right: 'Installed on the Controller Host only; stock dsh web on servers',
          desc: 'Remote Linux boxes, GPU nodes, and CI hosts run unmodified official dsh web. Disabling or removing the plugin leaves remote machines completely untouched.',
        },
        {
          badge: 'FAIL-CLOSED SECURITY',
          wrong: 'NO unsafe proxy exposure or silent fallbacks',
          right: 'Explicit diagnostics on unsupported topologies',
          desc: 'Enforces StrictHostKeyChecking=yes; clearly explains mixed-content HTTPS→HTTP, remote-browser loopback, or IPv6 parent constraints instead of exposing public ports.',
        },
      ],
    },
    install: {
      eyebrow: 'INSTALLATION & VERIFICATION · GET STARTED',
      title: 'Connect Your Machine Fleet in Three Minutes',
      subtitle:
        'Install from verified prebuilt GitHub Release .tgz assets — no git clone or local build needed. (Note: dsh-multi-device is not published to public npm; always paste the exact Release .tgz URL.)',
      tabs: [
        {
          id: 'manager',
          label: '1. Official Plugin Manager (Recommended)',
          note: 'Works inside DSH Desktop and DSH Web Host UI, automatically targeting the active Profile.',
          steps: [
            'Verify system OpenSSH and known_hosts on the Host machine: ssh -V && ssh -o StrictHostKeyChecking=yes <your-host-alias> true',
            'Start official dsh web on each remote server (keep default 127.0.0.1 loopback binding — no public port needed).',
            'Open Sidebar → Plugins → Add / Install third-party plugin, paste the full dsh-multi-device-vX.Y.Z.tgz URL from GitHub Releases, enable, and restart/refresh as prompted.',
          ],
          codeLabel: 'Exact Release .tgz Asset URL Pattern (copy verified version URL from GitHub Releases)',
          code: `https://github.com/IGNGserver/dsh-multi-device/releases/download/v0.3.6/dsh-multi-device-v0.3.6.tgz`,
        },
        {
          id: 'web-cli',
          label: '2. DSH Web Official CLI',
          note: 'Stop any running dsh web process using the same web Profile and back up profile data first.',
          steps: [
            'Verify the official dsh CLI version and environment.',
            'Run dsh plugin --profile web add with the exact Release .tgz URL (or SHA-256-verified local absolute path).',
            'Verify with --dump-config, start dsh web, and import hosts from ~/.ssh/config in Settings → Multi-Device.',
          ],
          codeLabel: 'DSH Web Profile CLI Installation',
          code: `# 1. Verify system OpenSSH & host key in known_hosts
ssh -V
ssh -o StrictHostKeyChecking=yes your-host-alias true

# 2. Stop active web Profile host, then install exact Release tarball
dsh --version
dsh plugin --profile web add "https://github.com/IGNGserver/dsh-multi-device/releases/download/v0.3.6/dsh-multi-device-v0.3.6.tgz"
dsh --profile web --dump-config
dsh web`,
        },
        {
          id: 'desktop-cli',
          label: '3. DSH Desktop CLI (Prerequisites)',
          note: 'In-app Plugin Manager is preferred for Desktop. For CLI, launch Desktop once to initialize its profile, quit completely (including tray), and use Desktop’s bundled dsh binary.',
          steps: [
            'Launch DSH Desktop once so it initializes the desktop Profile, then quit completely (including background tray).',
            'Invoke the official dsh binary bundled with DSH Desktop (do not use a separate npm-installed dsh CLI).',
            'Relaunch DSH Desktop and verify the persistent [This Device][device…] tab strip.',
          ],
          codeLabel: 'DSH Desktop Bundled CLI Installation',
          code: `# Prerequisite: Desktop initialized once & quit completely; use Desktop's bundled dsh binary
dsh plugin --profile desktop add "https://github.com/IGNGserver/dsh-multi-device/releases/download/v0.3.6/dsh-multi-device-v0.3.6.tgz"`,
        },
      ],
      copyBtn: 'Copy',
      copiedBtn: 'Copied',
      checklistTitle: 'Post-Install 4-Point Verification Checklist (Interactive)',
      checklist: [
        'Plugin Manager shows exact version & Release source; Settings → Multi-Device loads cleanly after restart',
        'ssh -V succeeds with verified known_hosts; devices connect via default system-ssh without native build scripts',
        'Persistent [This Device][device…] bar: local sidebar stays local-only, remote tabs keep full UI alive across switches',
        'Status capsules accurately reflect Amber (reply) / Blue (running) / Green (unread) and open target sessions on click',
      ],
    },
    footer: {
      summary: 'dsh-multi-device · Native persistent device tab strip & SSH tunnel workbench for DeepSeek Harness.',
      mit: 'MIT License · Atomic 0600 persistence & fail-closed loopback boundaries',
      links: {
        repo: 'GitHub Repository',
        releases: 'GitHub Releases',
        arch: 'NATIVE-ARCHITECTURE.md',
        issues: 'Issue Tracker',
      },
    },
  },
} as const

export function getCopy(locale: Locale) {
  return COPY[locale]
}

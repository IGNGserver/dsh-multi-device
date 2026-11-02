# dsh-multi-device — DeepSeek Harness (DSH) 多设备管理插件

面向拥有多台开发机、希望通过一个 **DSH Desktop / Web** 统一管理所有设备的用户。遵循 DSH **Everything is a Plugin (Cordis)** 扩展架构，零侵入核心代码，远端设备无需安装任何插件。

---

## 核心特性

### 1. 多设备连接与系统 SSH 深度复用
- **只提供 SSH 隧道**：远端 `dsh web` 保持默认环回监听（`127.0.0.1:3080`），无需暴露公网端口。插件自动在本地分配回环端口、建立隧道、探活保活并按指数退避 + 抖动自动重连。HTTP(S) direct 仅作为默认关闭的高级兼容开关保留，UI 不提供。
- **复用 `~/.ssh/config`**：
  - 内置常见指令解析器（`Include`、通配符、`!negation`、`HostName`、`User`、`Port`、`IdentityFile`、`ProxyJump`、`ProxyCommand`、`%h/%p/%r/%u`）。
  - UI 支持**一键从 `~/.ssh/config` 导入主机别名**，并从本机 `~/.ssh` 私钥列表中选择密钥。
  - 默认引擎是 `system-ssh`（系统 `ssh -N -L`，完整继承 `ProxyJump`、macOS Keychain、`SSH_AUTH_SOCK` / 1Password Agent）。隧道固定 `StrictHostKeyChecking=yes`，不沿用配置里的 `accept-new` 或 `no`。远端转发目标只允许 `127.0.0.1`、`localhost` 和 `::1`。`ssh2` 引擎仅作为回退，用 `ssh-keygen -F` 核对 known_hosts（含哈希主机行），且不支持 `ProxyJump`/`ProxyCommand`；遇到这两类配置会明确报错而不是静默降级。
- **自动鉴权与持久登录**：
  - **SSH 自动鉴权（Auto）**：默认只复用已经保存的 Cookie，或兑换用户粘贴的启动 Token。不会主动读取远端 `$DSH_HOME/.credentials.yaml`。只有把传输配置里的 `bootstrapFromRemoteCredentials` 设为 `true` 时，才会通过 SSH 只读该文件并在本地签发 Cookie；签发用的签名密钥不写入本机。
  - **Token / 启动链接兑换**：支持粘贴 `dsh web` 启动输出的 `http://127.0.0.1:3080/?token=...`，自动兑换并持久化签名 Cookie（`0600` 权限原子写入），跨远端重启持久有效。
  - 同时支持自定义 Cookie、Bearer Token 与无鉴权模式（兼容 DSH 0.1.x）。

### 2. 双模式界面（聚合模式 + 原生模式，互不依赖）
- **聚合模式（Aggregated Mode）**：
  - 将所有设备的逻辑工作区与会话无缝整合进 DSH 官方左侧边栏工作区树与官方对话区。
  - 原生支持跨设备新建会话、发送提示词、实时流式输出（`assistant-stream`）、工具调用卡片、取消生成、重命名、Fork、归档/取消归档、置顶、全文搜索，以及跨设备**工具越权审批（`approval/request`）**、**交互式提问（`user-questions/request`）**与**计划评审（`plan-review/request`）**。
  - 会话行显示设备徽标，悬停卡片展示所属设备、状态、目录路径与 Git 仓库，会话 `...` 菜单支持一键跳转至所属设备的原生模式。
- **原生模式（Native Mode）与页面保活（Keep-Alive）**：
  - 在 DSH Desktop / Web 内直接加载指定设备完整的远端 DSH Web 页面，保留远端自己的 DSH 版本、主题、已装插件与界面效果。
  - 每个设备拥有独立的本地环回反向代理（自动完成 `Host`/`Origin` 归一化、Cookie 注入、WebSocket `/api/remote.mux` 升级转发、一次性代理 token 与 `frame-ancestors` 本地白名单），同时适配 Electron Desktop `<webview>`（`dshDesktop.browser`）与标准 `<iframe>`。
  - **DOM 级后台保活**：已打开的设备页面在切换模式或切换设备时常驻 DOM（`display: none`），实现 **0ms 瞬时切换**，不丢失滚动位置、未发送草稿与实时流连接。
- **双向故障隔离**：
  - 聚合模式网关（`AggregatedGateway`）与原生模式代理/控制面（`NativeProxyManager` + `/multi-device/api`）完全解耦。即使远端 DSH 版本升级导致 `/api` 聚合接口不兼容，原生模式与设备管理中枢依然可用；反之亦然。
  - 支持右上角悬浮胶囊栏一键切换或快捷键 `Cmd/Ctrl + Shift + M` 快速切换。

### 3. Git Remote 自动工作区聚合
- **自动识别同一仓库**：默认读取本地与远端工作区的 Git remote（支持标准 `.git/config` 与 `git worktree` 的 `.git` 指针文件），将不同格式 URL（如 `git@github.com:org/repo.git`、`https://github.com/org/repo.git`、`ssh://git@.../org/repo`）归一化为统一仓库标识（`github.com/org/repo`），自动将多台设备上的对应目录合并为一个**逻辑工作区（Logical Workspace）**。
- **灵活的手动控制**：
  - 可随时关闭自动聚合，或将特定设备的目录从自动聚合中拆分/恢复。
  - 支持创建自定义手动聚合规则（将任意跨设备目录绑定为一个逻辑工作区）。
  - 支持为每个逻辑工作区指定点击 `+ 新建会话` 时的默认目标设备。
- **严格边界**：仅聚合工作区视图与会话列表，**绝不触碰、修改或同步任何项目文件**。

### 4. 设备独立性与跨版本兼容
- 每台远端设备独立运行自己的 `dsh web`，本插件不接管远端 Agent 循环、模型配置、工具执行或沙箱环境。
- 远端零插件要求。协议代次看响应里的版本字段，不能只凭 `items` 数组判断。**DSH 0.2.x** 走 `/api/<ns>/<method>` 和 `/api/remote.mux`。**DSH 0.1.x** 只刷新会话和工作区列表，不维持实时会话流。
- 开发基线为 DSH `0.2.0-rc.2`，并针对 `0.2.1-rc.5` 的 Host/Origin 校验、模型目录和原生代理行为补了回归测试；peer 版本允许 `0.2.x`。

### 5. 聚合模式的能力边界

- **原生模式**才是完整的远端环境：远端版本、主题、插件、设置、模型目录、文件上传、终端与文件浏览都来自远端。
- **聚合模式**是“会话与工作区聚合”：它会合并远端模型目录（同名 provider 按设备分开展示），并路由会话列表、创建、提示词、取消、重命名、Fork、队列、审批、问答与计划评审；但 `fileUploads`、`/api/session/uploadFileBinary`、终端、远端文件打开和全局设置仍属于本地 DSH 或原生模式。
- 需要附件、终端、远端设置或完整远端文件操作时，请切到原生模式；聚合模式不会伪装成完整远端客户端。
- 默认的 SSH 自动鉴权不会读取远端 `.credentials.yaml`。显式开启 `bootstrapFromRemoteCredentials` 后，本机只保存兑换出的 Cookie，不保存签名密钥。共享远端环境仍建议使用 Token 模式或原生模式手工登录。

---

## 安装与使用

### 1. 构建并安装到 DSH Profile

```bash
# 安装依赖并构建
pnpm install
pnpm run check

# 安装到 DSH web 或 desktop profile
dsh plugin --profile web add file:$(pwd)
# 若使用 DSH Desktop（先完全退出 Desktop 应用后执行）：
dsh plugin --profile desktop add file:$(pwd)
```

重启 `dsh web` 或重新打开 **DSH Desktop**。

### 2. 快速上手

1. **打开多设备设置**：
   - 打开左下角 **「设置 (Settings)」**（快捷键 `Cmd/Ctrl + ,`），在左侧导航选择 **「多设备 (Multi-Device)」**；也可在 **「插件 → 已安装 → dsh-multi-device」** 中打开配置页。
2. **添加远端设备**：
   - 点击 **「+ 添加设备」**。
   - 默认仅需填写 **SSH 主机**（支持 `~/.ssh/config` 主机别名、IP 或 `user@host:port`），可选填写显示名称与远端启动链接/Token；若本机已有 `~/.ssh/config`，可直接通过右上角下拉框一键导入。非默认端口、指定私钥与 ProxyJump 跳板机收纳在 **「高级连接选项」** 折叠区中。
   - 点击 **「测试连接」** 验证连通性、远端 DSH 版本与延迟，然后点击 **「保存」**。
3. **使用双模式与 Git 聚合**：
   - **聚合模式**：直接在官方左侧边栏查看自动按 Git 仓库聚合的逻辑工作区与跨机会话，点击任意会话即可在官方对话区流式对话、审批工具调用。
   - **原生模式**：在设置页切换为 **「原生模式」**、点击设备卡片上的 **「原生界面」**、点击右上角悬浮切换栏或按 `Cmd/Ctrl + Shift + M`，即刻切入该设备完整的远端 DSH 界面。

---

## 插件配置（`cordis.yml` / `cordis.patch.yml`）

所有配置项均可选，默认开箱即用：

```yaml
- id: dsh-multi-device
  name: dsh-multi-device
  config:
    # 设备与聚合规则持久化路径（默认 $DSH_HOME/plugins/dsh-multi-device.json）
    dataFile: ~/.dsh/plugins/dsh-multi-device.json
    # 鉴权凭据持久化路径（默认 $DSH_HOME/plugins/dsh-multi-device-secrets.json，权限 0600）
    secretsFile: ~/.dsh/plugins/dsh-multi-device-secrets.json
    features:
      aggregatedMode: true    # 启用聚合模式网关
      nativeMode: true        # 启用原生模式本地反向代理与保活视图
      sshTunnel: true         # 启用 SSH 隧道托管
      autoGitAggregate: true  # 默认开启 Git Remote 自动工作区聚合
      directTransport: false  # 高级兼容：HTTP(S) 直连；默认关闭，UI 不提供
```

---

## 目录结构

```text
├── cordis.patch.yml                 # DSH bundle 挂载声明
├── package.json                     # 插件包配置（导出 Host `.` 与 Browser `./client`）
├── build.mjs                        # esbuild + tsc 构建脚本
├── src/
│   ├── index.ts                     # Host 插件入口（Cordis apply）
│   ├── contract.ts                  # 前后端共享类型契约、碰撞安全 ID 编解码与 Git URL 归一化
│   ├── runtime.ts                   # 控制面 HTTP (/multi-device/api) 与实时 SSE (/multi-device/events)
│   ├── host/
│   │   ├── ssh-config.ts            # ~/.ssh/config 解析器、私钥发现与参数决议
│   │   ├── http-request.ts          # 保留 Host/Origin 的 Node HTTP(S) 载体
│   │   ├── tunnel.ts                # 双引擎 SSH 本地端口转发与退避重连 (system-ssh + ssh2)
│   │   ├── auth.ts                  # DSH 0.2/0.1 鉴权管理、Token 兑换与 SSH 自动密钥引导
│   │   ├── native-proxy.ts          # 原生模式独立本地反向代理（HTTP + WebSocket 升级转发）
│   │   ├── git-aggregator.ts        # Git Remote 自动探测（含 worktree）与逻辑工作区聚合引擎
│   │   ├── remote-client.ts         # 跨版本（0.2.x / 0.1.x）远端 DSH 客户端与多路复用流泵
│   │   ├── registry.ts              # 设备与工作区聚合注册表及持久化
│   │   └── gateway.ts               # 聚合模式 Host 服务桥接（Session / Workspace / $events Waterfall）
│   └── client/
│       ├── index.tsx                # Browser 插件入口（注册 Slots、快捷键与多语言）
│       ├── state.ts                 # 前端响应式状态存储、SSE 同步与保活 LRU 管理
│       ├── NativeViewport.tsx       # 原生模式 Keep-Alive 容器（支持 Electron <webview> 与 <iframe>）
│       ├── MultiDeviceHubPanel.tsx  # 多设备中枢主面板（设备管理 / Git 聚合 / 原生视图）
│       ├── ModeSwitcherOverlay.tsx  # 顶部悬浮模式切换器与侧边栏会话行增强组件
│       ├── locales.ts               # 中英双语词典
│       └── styles.ts                # 样式注入（卸载时自动清理）
└── tests/
    └── multi-device.spec.ts         # 单元与端到端集成测试套件
```

## 开发与测试

```bash
pnpm run typecheck   # TypeScript 严格类型检查
pnpm run build       # 构建 lib/index.js、lib/client.js、lib/contract.js 与 lib/types/
pnpm run test        # 运行 Vitest 单元与端到端集成测试
pnpm run check       # 依次执行 verify:version + build（含 tsc 类型检查）+ test
```

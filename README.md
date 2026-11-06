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
  - **SSH 自动鉴权（Auto）**：添加 SSH 设备时默认开启 `bootstrapFromRemoteCredentials`。隧道打通后通过 SSH 只读远端 `$DSH_HOME/.credentials.yaml`，在本地签发 Cookie，签名密钥不写入本机。取消勾选后只复用已保存的 Cookie，或兑换粘贴的启动 Token。读取失败会直接说明 SSH 已登录、缺的是远端凭据，而不是报成密钥 401。
  - **Token / 启动链接兑换**：支持粘贴 `dsh web` 启动输出的 `http://127.0.0.1:3080/?token=...`，自动兑换并持久化签名 Cookie（`0600` 权限原子写入），跨远端重启持久有效。
  - 同时支持自定义 Cookie、Bearer Token 与无鉴权模式（兼容 DSH 0.1.x）。

### 2. 双模式界面（聚合模式 + 原生模式，互不依赖）
- **模式切换**：打开 **设置 → 多设备 → 界面模式**，或直接点原生模式顶栏最右侧的 **「聚合模式」** 按钮切回聚合模式。聚合模式不提供左侧设备导航；侧栏底部不再常驻「多设备」按钮，会话 `...` 菜单也不再提供「在原生模式中打开」。远端会话默认在对话列内原生渲染，需要远端侧栏/设置时用窗格顶部的「完整远端界面」。
- **聚合模式（Aggregated Mode）**：
  - 将所有设备的逻辑工作区与会话无缝整合进 DSH 官方左侧边栏工作区树与官方对话区。
  - **远端会话默认原生渲染**：选中远端会话时，对话列会直接嵌入该设备的完整 DSH 页面（默认开启，可在「设置 → 多设备 → 聚合模式使用远端原生窗格」关闭）。聊天、模型目录、审批/提问、计划评审、附件上传、终端、文件面板和远端设置都由远端页面自己渲染，不再由本地组件代答。聚合侧栏仍然可用；对话列顶部的「完整远端界面」可切到该设备的原生标签页，恢复远端左侧栏。
  - **兼容回退**：如果远端版本内部结构变化、CSP 禁止注入或桥接未就绪，插件会自动回退到本地镜像渲染（会话列表、流式输出、审批与路由仍然可用），不会出现空白窗格或错误页。
  - 原生支持跨设备新建会话、发送提示词、实时流式输出（`assistant-stream`）、工具调用卡片、取消生成、重命名、Fork、归档/取消归档、置顶、全文搜索，以及跨设备**工具越权审批（`approval/request`）**、**交互式提问（`user-questions/request`）**与**计划评审（`plan-review/request`）**。
  - **会话归属可见**：打开任意会话后，右侧会话头显示设备芯片（本机会话显示「本机」，远端显示设备名 + 连接状态点），点开可看工作区、目录、Git 仓库、上次同步时间，并可直接重连或打开设置。悬停卡片同样展示设备与目录。聚合模式下会话行默认保持与本地一致，可在「设置 → 多设备」打开「在会话行显示设备标记」，用首字母 + 状态点标注归属。这些只是标识与运维入口，不提供左侧设备导航；远端侧栏专属能力请用窗格顶部的「完整远端界面」。
  - **新建会话可选设备**：空白会话的工作区行右侧新增设备芯片，可从该仓库的成员设备中选择承接设备；选中后会把偏好落盘并在目标设备重建空白会话。多设备工作区还会提供「在其它设备新建…」，按「设备 → 已有工作区」直接创建会话；原生窗格顶部的设备芯片保留同一入口。
  - **离线可用**：每台设备上次成功同步的会话/工作区会持久化，Host 重启后离线设备仍出现在侧栏（标注上次同步时间）；打开离线会话时最多等待 60 秒自动重连，期间显示本地化横幅与「立即重连」，连接恢复后自动加载。原生窗格在离线时显示设备状态页和重连按钮；发送、审批、归档等操作在离线时快速失败并给出可操作提示，而不是原始 503。
- **原生模式（Native Mode）与页面保活（Keep-Alive）**：
  - 顶栏始终显示 `[本机][设备1][设备2]…` 设备选项卡，最右侧固定一个 **「聚合模式」** 按钮，一键切回聚合模式（Host 侧同步恢复远端工作区/会话合并）。每个标签在设备名后显示该设备的未读数（绿色「N 未读」）与运行中数量；**本机** 标签同样显示本地未读数。
  - 最左侧 **本机** 标签显示正常的本地 DSH 页面，并且 Host 侧会按模式过滤：此标签下只显示本地工作区、会话与模型，不混入任何远端聚合数据，也不显示聚合模式的项目设备徽标。它不是 iframe，也不会丢失本地页面状态。
  - 其余设备标签在顶栏下方加载对应远端设备完整的 DSH Web 页面，保留远端自己的 DSH 版本、主题、已装插件与界面效果。
  - 每个设备拥有独立的本地环回反向代理（自动完成 `Host`/`Origin` 归一化、Cookie 注入、WebSocket `/api/remote.mux` 升级转发、一次性代理 token 与 `frame-ancestors` 本地白名单），同时适配 Electron Desktop `<webview>`（`dshDesktop.browser`）与标准 `<iframe>`。
  - **DOM 级后台保活**：已打开的设备页面在切换标签或切回聚合模式时常驻 DOM（`display: none`），实现 **0ms 瞬时切换**，不丢失滚动位置、未发送草稿与实时流连接。
  - **文件夹展开状态由 Host 记住**：原生页首次渲染前就把该设备上次的工作区展开/折叠状态注入 DSH 的 `uiWorkspace`，因此 Host/Desktop 重启、代理端口变化或 Electron 存储分区变化都不会让所有文件夹回到默认折叠；同一 Host 的多个客户端也会互相同步。首次打开保持 DSH 默认折叠，只记住之后的改动。
  - **代理 origin 稳定**：每台设备首次分配的回环端口会持久化，Host 重启后优先复用；只有端口被其它进程占用时才回退到随机端口并更新记录。这样远端页自己的 `localStorage`（当前会话、主题、侧栏/面板尺寸等）不会因为 Host 重启而丢失。
  - **复制始终写本机剪贴板**：原生页是跨源 iframe。插件在 iframe 上显式委托 `clipboard-write` / `clipboard-read`，并在 bridge 中为 `navigator.clipboard.writeText` 增加 `execCommand('copy')` 兜底。Electron `<webview>` 或远端响应限制了 Clipboard API 时，复制仍落到本机浏览器剪贴板，而不是远端机器。
  - **窗口/任务栏标题跟随当前会话**：bridge 把远端页自己的 `document.title` 通过 Host 快照报给本地外壳；原生模式下标题随当前设备标签的会话更新，聚合窗格可见时随窗格会话更新，切回本机后恢复 DSH 自己的本地标题。bridge 未就绪或设备离线时回退到设备名，不会显示上一个本机会话。
  - **模式切换保留上下文**：从聚合模式的远端会话切到原生模式会直接落到该设备标签并打开同一会话；从原生远端标签切回聚合模式会在目录刷新后重新打开刚才的远端会话。原生标签选择按浏览器持久化，刷新后仍回到上次设备。
  - **未读/已读跨客户端一致**：Host 观察本地与远端 `api-session/status` 的 `running → false`，统一维护未读集合，并在聚合侧栏与原生远端页面上覆盖 DSH 页面本地的「已完成」提醒。同一 Host 上任一端打开会话都会清掉其他端的提醒；刷新或重启后未读仍在。设备掉线不会被误判成「刚完成」。**只有实际可见的原生页/窗格才会清除未读**，后台保活页不会替你看过的页面消掉提醒。原生模式设备标签、聚合模式工作区行与设置页设备行都会显示未读数量；**已归档**与**子代理**会话没有独立侧栏行，不计入这些数字。原生标签还会显示远端待审批/待回答数量。
  - **可选跨 Host 共享**：仅当多台电脑各自运行 DSH Host 时，可在「设置 → 多设备 → 跨 DSH Host 同步未读状态」开启。届时通过现有 SSH 在远端 DSH 家目录写入一个只含 Session ID 与时间戳的 `read-state.json`；不安装远端插件，也不上传消息内容。默认关闭。
- **双向故障隔离**：
  - 聚合模式网关（`AggregatedGateway`）与原生模式代理/控制面（`NativeProxyManager` + `/multi-device/api`）完全解耦。即使远端 DSH 版本升级导致 `/api` 聚合接口不兼容，原生模式与设备管理中枢依然可用；反之亦然。
  - 模式状态由 Host 持久化，因此重启后本地页面仍按正确的聚合/本机边界渲染。

### 3. Git Remote 工作区聚合与手动跨设备匹配
- **已登记仓库自动分组（只读）**：对每台设备上**已经登记**的工作区读取 `remote.origin.url`（支持标准 `.git/config` 与 `git worktree` 的 `.git` 指针文件），把不同格式 URL（`git@github.com:org/repo.git`、`https://github.com/org/repo.git`、`ssh://git@.../org/repo`）归一化为 `github.com/org/repo`，同一仓库在多台设备上的目录合并为一个**逻辑工作区（Logical Workspace）**。这一步只读已登记路径，不扫描磁盘，也不会新建任何工作区。
- **手动跨设备匹配（唯一会扫盘的动作）**：在「设置 → 多设备」点击「开始匹配」后，插件才执行一次任务：
  1. 读取各设备已登记工作区的 `origin`，找出「至少一台设备有、另一台设备没有」的仓库；
  2. 在每台设备上按「用户主目录 + 已登记工作区的父目录」向下扫描（跳过隐藏目录、`node_modules`、构建产物；`.git` 是文件的 worktree 视为主项目的成员，不单独登记）；
  3. 找到同一 `origin` 且尚未登记时，调用该设备自己的 `workspace.create` 登记这个已有目录。
  - 扫描与匹配**永远不会自动触发**，也不会克隆、同步或修改任何项目文件；只登记磁盘上已有的目录。
  - 任务执行期间持续显示当前设备、当前项目与已处理数量，可随时停止；完成后的结果（新建 / 未找到 / 已有 / 失败原因）持久化，重启后仍会显示上次执行状态。
- **设备标识与未读数（仅聚合模式）**：项目标题不再带 `[设备名]` 前缀。聚合模式下，项目行右侧显示连接状态圆点（绿色已连接、黄色连接中、灰色离线）与设备标签：只有一台设备时显示设备名，多台时显示「N个设备」，悬停可看完整设备列表。工作区有未读会话时，标题旁还会显示「N 未读」，并**累计嵌套子工作区**的未读；计数与 DSH 的路径嵌套规则一致，已归档与子代理会话不计入。原生模式的「本机」页面不注入任何聚合设备徽标。
- **灵活的手动控制**：
  - 可关闭「相同 Git 仓库自动分组」（关闭后各设备工作区分别展示，不影响手动匹配出的登记结果）。
  - 可将特定设备的目录从分组中拆分/恢复。
  - 支持创建自定义手动聚合规则（将任意跨设备目录绑定为一个逻辑工作区）。
  - 支持为每个逻辑工作区指定点击 `+ 新建会话` 时的默认目标设备；设备离线时自动回退到本机或首个在线成员，并在设置页显示「将回退到 X」。
- **严格边界**：仅聚合工作区视图与会话列表，**绝不触碰、修改或同步任何项目文件**。

### 4. 设备独立性与跨版本兼容
- 每台远端设备独立运行自己的 `dsh web`，本插件不接管远端 Agent 循环、模型配置、工具执行或沙箱环境。
- 远端零插件要求。协议代次看响应里的版本字段，不能只凭 `items` 数组判断。**DSH 0.2.x** 走 `/api/<ns>/<method>` 和 `/api/remote.mux`。**DSH 0.1.x** 只刷新会话和工作区列表，不维持实时会话流。
- 开发基线为 DSH `0.2.0-rc.2`，并针对 `0.2.1-rc.5` 的 Host/Origin 校验、模型目录和原生代理行为补了回归测试；peer 版本允许 `0.2.x`。

### 5. 聚合模式的能力边界

- **原生窗格（默认）**：聚合模式的远端会话正文由该设备自己的 DSH 页面渲染。这意味着远端版本、主题、已装插件、模型目录、附件上传、终端、文件面板、设置和快捷键都来自远端；本地只负责聚合侧栏、工作区/会话列表、会话归属、创建/重命名/Fork/归档/置顶等导航与路由动作，以及**复制到本机剪贴板**和**窗口/任务栏标题**这两项跨源外壳能力。
- **本地镜像（回退）**：桥接不可用时，聚合模式退回“本地组件 + 远端数据”的镜像：会话列表、创建、提示词、取消、重命名、Fork、队列、审批、问答与计划评审按所属设备路由，模型目录严格按会话归属设备作用域。此时 `fileUploads`、`/api/session/uploadFileBinary`、终端、远端文件打开和全局设置仍属于本地 DSH；需要这些能力请用窗格顶部的「完整远端界面」切到原生标签页。
- **远端左侧栏**：原生窗格会隐藏远端页面的左侧工作区/会话栏，由本地聚合侧栏替代；需要远端侧栏里的插件面板或设置首页时，点「完整远端界面」即可在同一 iframe 内展开完整远端页面，侧栏会恢复。
- **桥接机制**：本地反向代理向远端页面注入一个很小的 bridge 脚本，拦截 DSH client 模块表并捕获 `uiWorkspace` 服务，通过同源 WebSocket 接收“打开某个会话 / 切换嵌入模式 / 刷新列表”的命令，并上报**当前会话、页面标题、可见性**。bridge 不可用时只影响窗格（标题回退设备名，复制仍由 iframe 权限委托保障），不影响设备管理、原生模式和聚合侧栏。
- SSH 自动鉴权默认读取远端 `.credentials.yaml`（兼容 Linux/macOS 与 Windows 远端）并只在本机保存签发出的 Cookie，不保存签名密钥。远端重启导致 Cookie 失效时，原生模式会提示“需要登录”，可粘贴启动 Token 或点“通过 SSH 自动修复”重新签发。共享远端环境仍建议改用 Token 模式或原生模式手工登录，并取消「通过 SSH 读取远端凭据」。

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
   - 默认仅需填写 **SSH 主机**（支持 `~/.ssh/config` 主机别名、IP 或 `user@host:port`），可选填写显示名称与远端启动链接/Token；若本机已有 `~/.ssh/config`，可直接通过表单顶部的下拉框一键导入。非默认端口、指定私钥与 ProxyJump 跳板机收纳在 **「高级连接选项」** 折叠区中。
   - 点击 **「测试连接」** 验证连通性、远端 DSH 版本与延迟，然后点击 **「保存」**。
3. **使用双模式与 Git 聚合**：
   - **聚合模式**：直接在官方左侧边栏查看自动按 Git 仓库聚合的逻辑工作区与跨机会话，点击任意会话即可在官方对话区流式对话、审批工具调用；这个页面没有进入单台设备的入口。
   - **进入原生模式**：在 **设置 → 多设备 → 界面模式** 选择 **「原生模式」**，默认落在最左侧的 **本机** 标签；也可以在设置里的设备卡片点击 **「原生界面」** 直接打开对应设备。
   - **原生模式内**：顶栏始终显示 `[本机][设备…]` 标签；点 **本机** 回到正常本地 DSH 页面，点设备标签切换远端页面。顶栏的 **「聚合模式」** 按钮可一键切回聚合模式，也仍可从设置切换；窗口太窄、或 Host 画框比视口更宽时，该按钮会移到标签栏最左侧（设置齿轮紧随其后），不会被裁出屏幕。没有 Esc 退出。

---

## 诊断与排障

侧栏里「工作区点开没有会话 / 看不到运行中·已完成计数」几乎都是**当前处于原生模式**：原生模式按设计只显示本机数据，远端工作区、会话与计数一律不合并（`displayMode` 由 Host 持久化，界面上没有必然的强提示）。先用 **设置 → 多设备 → 界面模式** 确认并切回聚合模式。

仍无法解释时，用 **设置 → 多设备 → 诊断信息 → 生成诊断** 导出一份快照（同时尝试复制到剪贴板）：

- `displayMode`：Host 权威的显示模式，是排查这类问题的第一现场；
- `hostStatus`：聚合网关与原生代理是否就绪，失败时会带 `aggregatedGatewayError`；
- 每台设备：`state`、`protocolVersion`、`remoteDshVersion`、`catalogStale`、`sessionCount`、`runningSessionCount`、`workspaceCount`、`lastError`；
- `client`：浏览器视口尺寸、原生标签栏的原始宽度与被裁后的宽度、是否已进入紧凑布局 —— 用来解释控件为什么被挤到屏幕外。

提交问题时附上这份 JSON，就不必靠截图猜界面状态了。

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
      autoGitAggregate: true  # 默认开启「已登记仓库」的只读分组（不扫盘）
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
│   │   ├── native-proxy.ts          # 原生模式/原生窗格独立本地反向代理（HTTP + WebSocket 升级转发 + HTML 注入）
│   │   ├── native-bridge.ts         # 注入远端页面的 bridge 脚本、Host 折叠/未读状态首屏前缀与 HTML 注入工具
│   │   ├── read-state.ts            # Host 侧未读/已读状态机（running 转换、跨 Host 合并、上限裁剪）
│   │   ├── shared-state.ts          # 可选的跨 Host `read-state.json` 序列化、合并与 SSH 读写命令
│   │   ├── git-aggregator.ts        # Git Remote 自动探测（含 worktree）与逻辑工作区聚合引擎
│   │   ├── remote-client.ts         # 跨版本（0.2.x / 0.1.x）远端 DSH 客户端与多路复用流泵
│   │   ├── registry.ts              # 设备/工作区注册表、Host 侧模式/折叠/未读持久化与聚合过滤
│   │   └── gateway.ts               # 聚合模式 Host 服务桥接；本地模式只透传本地 Session/Workspace
│   └── client/
│       ├── index.tsx                # Browser 插件入口（Slots、模式副作用、主动会话上报与多语言）
│       ├── readState.ts             # 聚合页 `uiSession.sessionStatus` 的未读覆盖层（仅远端 ID）
│       ├── state.ts                 # Host 模式镜像、SSE 同步、本机 tab、会话模型作用域与保活 LRU 管理
│       ├── NativeViewport.tsx       # 原生模式常驻 tab bar（含最右侧聚合模式按钮）、聚合窗格与 Keep-Alive 容器（<webview>/<iframe>）
│       ├── windowTitle.ts           # 远端页标题 → 窗口/任务栏标题（含 DSH 本地标题恢复）
│       ├── clipboard.ts             # 本机复制 helper（Clipboard API + execCommand 兜底）
│       ├── nativePane.ts            # 原生窗格可见性/目标会话的纯函数决策
│       ├── MultiDeviceHubPanel.tsx  # 设置页：设备管理 / Git 聚合 / 模式切换（与顶栏按钮等效）
│       ├── ModeSwitcherOverlay.tsx  # 顶栏占位、保活层、行悬停元数据与主动会话上报
│       ├── SessionDeviceChip.tsx    # 会话头/新会话行的设备芯片、设备切换与「在其它设备新建」
│       ├── OfflineDeviceBanner.tsx  # 离线设备横幅与立即重连
│       ├── SessionRowDeviceMarker.tsx # 可选的会话行设备首字母标记
│       ├── sessionDevice.ts         # 会话归属与可选设备解析（纯函数，可单测）
│       ├── clientServices.ts        # sessions / uiWorkspace 句柄与摘要 Hook
│       ├── AuthPanel.tsx            # 远端 401 时的应用内授权/SSH 修复面板
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

# dsh-multi-device — DSH 多设备管理插件

通过一个 **DeepSeek Harness（DSH）Desktop / Web Host** 管理多台运行 `dsh web` 的开发机。远端无需安装本插件；本插件不接管远端 Agent、模型配置或沙箱，也不克隆、同步或修改项目文件。`main` 是开发线，不等于已验证的发行版。

## 架构与支持范围

插件只提供一种界面：顶部常驻的设备标签页。`本机` 标签页就是未经改装的本地 DSH 页面，每台远端设备在自己的标签页里运行它自己的完整 DSH 页面。插件不向本地 Session Controller 注入远端会话，本地侧边栏始终只属于本机。目录重连使用 epoch、完整基线和拉取期间增量重放；鉴权与原生页面加载失败都有明确状态。详见 [架构与验证说明](NATIVE-ARCHITECTURE.md)。

原生内容支持本机 HTTP IPv4/localhost Web GUI 与已验证的 DSH Desktop guest。**远程浏览器、HTTPS→HTTP loopback、IPv6 parent 当前不具备安全完整的原生代理入口**，会明确提示原因，而不会回退到本机镜像。Windows SSH 使用平台适配命令；真实各平台 Desktop 验收与协议模拟测试是不同层级，不能混称已验证。

## 安装与升级（普通用户）

**使用 GitHub Release 的预构建 `.tgz`，不需要 clone、安装源码依赖或本地构建。** 当前公共 npm 注册表没有 `dsh-multi-device` 包，不要仅输入包名尝试安装；npm 发布只是未来维护路线，目前不发布。完整 bundle `.tar.gz` 用于检查/归档，不是管理器安装入口。

### 1. 首选 DSH 官方插件管理器

1. 在要安装的 **Desktop 应用内**或 **Web Host 页面**打开侧栏 **插件 → 添加插件 / 安装第三方插件**。这是第三方插件，不是 DSH 内置插件。
2. 从 [GitHub Releases](https://github.com/IGNGserver/dsh-multi-device/releases) 选择已验证版本，复制该版本 `dsh-multi-device-vX.Y.Z.tgz` 的**完整 Release 资产 URL**，粘贴到安装输入框；不要输入仓库地址、`main`、包名或 bundle 地址。
3. 查看包名、版本、来源及安装输出，安装后启用；按管理器提示重启 Host / Desktop，并刷新页面。安装成功不等于 Host 激活与 Browser 插件加载成功，见下方验收。

明确 URL 的历史示例（`v0.2.18` 是审计修复前基线，**不包含本轮修复，不作为修复版推荐**）：

```text
https://github.com/IGNGserver/dsh-multi-device/releases/download/v0.2.18/dsh-multi-device-v0.2.18.tgz
```

安装本轮修复时，必须改用实际完成官方安装 smoke、已发布且含对应校验文件的版本 URL；不能把尚未发布的版本写成可用下载。

> 下载 GitHub 资产失败时，更换 npm 镜像不能替代 GitHub 下载。可从可信 Release 下载 `.tgz` 与对应 `.sha256`，校验后使用 Host 上的本地绝对路径。路径含空格时，CLI 必须引用整个参数。

### 2. Web：官方 CLI 安装

先停止使用同一 `web` Profile 的 `dsh web` 进程，备份 Profile 的配置及插件数据，再执行。将 URL 替换为选定的已验证 Release；下面历史示例的限制同上。

```bash
dsh --version
dsh plugin --profile web add "https://github.com/IGNGserver/dsh-multi-device/releases/download/v0.2.18/dsh-multi-device-v0.2.18.tgz"
dsh --profile web --dump-config
dsh web
```

已下载资产也可以安装（把路径换成真实值，不要直接执行占位路径）：

```bash
dsh plugin --profile web add "/absolute/path/Release Assets/dsh-multi-device-vX.Y.Z.tgz"
```

CLI 使用 DSH 官方安装提供的 `dsh` 和其包管理环境；若报告缺少 pnpm，按该 DSH 版本官方安装说明补齐。普通用户无需运行本仓库的 `pnpm run build`。

### 3. Desktop：应用内优先，CLI 有前置条件

**优先使用 Desktop 应用内官方插件管理器**，由应用选择正确的 Profile、DSH 与包管理器。需要 CLI 时：

- 先正常启动 Desktop 一次，让**应用自己初始化** `desktop` Profile，然后**完全退出**（包括托盘/后台进程，不只是关窗口）。
- 使用 **Desktop 安装提供的 `dsh` 入口**，核实其来源和版本；若不能确认入口，请回到应用内管理器或查该平台 Desktop 官方说明。不能用另行通过 npm 安装的 DSH CLI 管理 Desktop Profile，也不能靠 npm CLI 初始化它。
- 选定正确入口后，使用与 Web 相同的 Release URL；不要猜测跨平台统一的应用安装路径：

```bash
# 此处 dsh 必须是 Desktop 安装提供的入口；应用已初始化且完全退出。
dsh plugin --profile desktop add "https://github.com/IGNGserver/dsh-multi-device/releases/download/v0.2.18/dsh-multi-device-v0.2.18.tgz"
```

重新打开 Desktop，检查插件已启用、配置页和客户端界面正常。自定义 `DSH_HOME` 必须与应用实际使用的目录一致，不能误写另一套 Profile。

### 4. 升级、回滚、停用与卸载

- **管理器升级/回滚**：本插件是第三方包。若提示 `already-installed`，先在已安装列表停用并卸载，再添加目标版本的精确 Release `.tgz` URL、启用并按提示重启/刷新；不能把重复“添加”当成版本升级。官方按需插件的“更新”入口不代表本插件也有该能力。不能在线卸载的启动型 Profile，使用下面的离线 CLI 路线。
- **CLI 升级/回滚**：先记录当前版本/来源并备份配置和数据，停止同一 Profile 的所有 Host 进程，再 `add` 指定的新版本或旧版本 URL。Web 命令如下；Desktop 仅在满足上一节条件时将 `web` 改为 `desktop`。

```bash
# 先停 Host；RELEASE_TGZ_URL 必须已设置为目标版本的完整 Release URL。
dsh plugin --profile web add "${RELEASE_TGZ_URL:?set exact target Release tgz URL}"
# 需要离线卸载时：
dsh plugin --profile web remove dsh-multi-device
```

- **停用**只停止插件贡献，保留安装与插件数据。**卸载**移除包/组合选择，不删除插件自己的设备、凭据、备份或诊断数据；重装可继续读取。本文不提供自动删除数据的命令。
- 包回滚不等于数据回滚；旧版本可能不理解新 schema。必要时停机后恢复升级前的**同一组配置、设备与秘密备份**，不要以空文件覆盖或让两个版本并发写同一路径。

## SSH 前置条件与快速上手

**基础安装唯一推荐 `system-ssh`**。本批修复的基础发行包不再携带 optional `ssh2`，不应为普通安装触发 `ssh2` / `cpu-features` 原生构建。已有旧版本资产是否仍携带它，以该版本清单为准。

1. 在 **DSH Host 所在机器**确认系统 OpenSSH 可用（不是仅浏览器设备可用）：

   ```bash
   ssh -V
   ssh -o StrictHostKeyChecking=yes your-host-alias true
   ```

   首次主机指纹需通过可信渠道核实并登记到 `known_hosts`，不要用 `StrictHostKeyChecking=no` 绕过。缺少 `ssh` 时安装系统 OpenSSH 客户端（Windows 启用 OpenSSH Client），确保 Host 进程的 PATH 能找到 `ssh` / `ssh-keygen`，配置 SSH agent，重启 Host 后再试；插件会报可操作错误，不会隐式安装/回退到 ssh2。
2. 在远端启动 `dsh web`，保持环回监听；本地插件经 SSH 隧道访问它，不需要暴露公网端口。
3. 打开 **设置 → 多设备**（或插件管理器中的本插件配置页），添加 SSH 设备；可导入 Host 的 `~/.ssh/config` 别名，填写 SSH 主机并测试连接。私钥、Agent、Keychain、ProxyJump / ProxyCommand 均由 Host 的系统 SSH 处理；隧道强制 `StrictHostKeyChecking=yes`，转发目标只允许远端 `127.0.0.1`、`localhost`、`::1`。
4. 默认开启“通过 SSH 读取远端凭据”：SSH 只读远端 `$DSH_HOME/.credentials.yaml`，本地只保存签发的 Cookie，不保存远端签名密钥。共享远端或不授权读取时关闭该项，改用启动 Token / 启动链接兑换或显式凭据。SSH 成功而凭据读取失败不是 SSH 密钥错误；旧缓存失效后可能需要重新认证。不要在 Issue 中粘贴启动链接或 Token。
5. 顶部会出现常驻的 `[本机][设备…]` 标签条：点设备标签即打开该机器的完整 DSH 页面，点 `本机` 回到本地页面。切换只隐藏不重载，保活不丢会话与草稿。

### 高级兼容：显式安装 ssh2（非默认、非自动回退）

仅在确有兼容需求、理解依赖脚本风险时使用；优先考虑系统 SSH + Agent。`ssh2` 不支持 ProxyJump / ProxyCommand，也仍需系统 `ssh-keygen` 核对 known_hosts。

停止目标 Profile 的 Host 后，通过官方 CLI 将它安装为 **plain dependency（普通依赖，不是插件组合包）**：

```bash
dsh plugin --profile web add ssh2
```

没有 `plain` 子命令/参数；不要在插件管理器中把 `ssh2` 当作组合包添加。Desktop 仍须使用 Desktop 自带入口并先完全退出。若 pnpm 拦截脚本，先审查输出中实际待审批的包、版本、来源及脚本；确需执行时，按该 DSH/pnpm 版本指引在**目标 Profile**的 `pnpm-workspace.yaml` 中仅批准明确审查过的 `allowBuilds` 键，再重试原命令。脚本以宿主用户权限执行；不自动 approve、不使用通配授权或关闭脚本保护。拒绝审批时继续使用 system-ssh，不承诺 ssh2 可用。完成后重启 Host，再显式选择 `ssh2` 引擎。

## 能力与支持边界

- **设备独立**：每台远端运行自己的 DSH 与模型/工具；0.2.x 使用对应 API 与实时流。0.1.x 仅有限列表兼容，不提供同等实时功能。开发基线为 `0.2.0-rc.2`，并有 `0.2.1-rc.5` 协议回归；peer 范围不是所有 0.2.x 版本/平台都已实测的承诺。
- **设备标签页**：顶部常驻 `[本机][设备…]`。点标签即切换界面；`本机` 是本地 DSH，其余标签是该设备的完整远端页面（模型、审批、终端、上传、文件、设置全部来自远端）。离线设备标签显示上次已知计数并给出重连入口。
- **Keep-Alive 保活**：切换标签只隐藏不卸载，WebSocket、会话、滚动位置与草稿保持不变。保活不保证零延迟或跨平台视觉一致。
- **会话归属**：远端会话只存在于它自己的设备页面中，本机永远不持有远端会话摘要；未读/已读与需回复计数由 Host 按设备汇总，供标签徽标展示。离线目录保留上次快照，变更操作需要连接。
- **IPv6 / 远程浏览器 / HTTPS**：原生代理仅监听 Host 的 `127.0.0.1`，不能伪造为 `[::1]`，远程浏览器自己的环回地址也不是 Host。HTTPS 父页面嵌入 HTTP 代理存在 mixed-content 限制。此类场景会在页面内给出明确原因，请在 Host 本地以 `http://127.0.0.1` / `http://localhost` 打开 DSH，或在有可信网络与认证的独立窗口中访问远端 DSH；不承诺远程浏览器原生嵌入可用，也不建议公开代理端口来绕过限制。非本地控制面访问同样有安全边界。
- **未读/已读**：Host 持久化本机与远端完成游标；读回执只消费页面已看到的那次完成，原生桥接使用幂等 ACK 和重试，隐藏保活不消费新提醒。跨 Host 默认关闭；开启后经 SSH 交换会话身份/游标，不上传消息正文。仅本连接代次亲见运行到完成、且能用官方只读分页确认真实 `turn/end` 的游标才提升为公共身份；恢复的旧已读、legacy 或不支持终态读取的会话不按墙钟强行清除另一 Host 的提醒。旧未读迁移为 `legacy:` 兼容游标并保留，成功完整目录才清理已删除孤儿。客户端 readState 使用 DSH 私有 `statusListeners` 兼容适配，若提示 notification bridge unavailable，需刷新页面使已有视图重新订阅。
- **界面状态（仅控制机安装）**：本机页与每个代页面板的折叠、分组、排序、归档过滤由 Host 持久化，先回灌再渲染；同一 Host 的任意浏览器标签看到同一份状态。多台控制机可开启「跨控制机同步界面状态」，每个控制机把自己的远端页面状态写进远端 `$DSH_HOME/plugins/dsh-multi-device/views/<hostId>.json`，其他控制机只读合并；远端不装插件、不跑守护进程，文件只含 workspace key、布尔值和模式枚举。远端主机自己直接打开的 DSH 页面不在这份同步范围内。
- **非公开接口依赖**：原生 bridge、嵌入与部分 UI 状态适配依赖 DSH 内部结构；DSH 升级后必须重新验证，自动化测试不能替代真实 Electron/浏览器视觉验收。

## 原生模式状态计数

- 本机与远端顶部使用同一个会话关注投影：**需回复 → 自身/子代理运行 → 完成未读**，主分类互斥；需回复按会话数统计，展开后另列请求数。
- 顶部标签在设备名右侧只挂**一个状态胶囊**，里面是纯数字、没有文字：按紧急度从左到右排列，**黄色＝待回复、蓝色＝运行中、绿色＝完成未读**。颜色是唯一可见的分类线索，所以类别文字保留在无障碍名称（`aria-label`）、悬浮提示与菜单分组标题里；数字位固定两位宽，`1 ↔ 9 ↔ 99` 不会挪动旁边的标签。
- 没有成员的类别不渲染数字，也就不占任何宽度：没有待处理事项的设备只有一个安静的标签。缓存或同步中的计数不是权威零值，胶囊会半透明加虚线；连数字都没有时收缩成一个空的虚线圈。
- 点击计数打开原生菜单：每个会话一行，显示原始会话 ID 与所属设备；点行会切到该设备标签并让远端页面打开该会话（本机行则用 DSH 自己的导航打开）。
- 点击数字打开官方 `Menu`：每行先显示会话真名，第二行显示 `工作区 · 设备 · 相对时间`，行悬浮提示保留完整 Session ID；在新版 Host 上点击即直接打开该会话（原生模式下会先切到所属设备标签，再由 Host 把导航下发给该设备的内嵌页面）。旧版 Host 只提供计数不提供成员 ID 时，菜单里显式说明，而不是显示空列表。
- 默认排除归档、独立子代理行及非当前空白；普通 fork 保留。折叠工作区、搜索和“显示更多”不改变设备总数，成员不截断到 50 行。
- 设置 → 多设备 → 全局偏好可开启**窗口标题显示任务汇总**（默认关闭）。开启后窗口/任务栏标题改为跨设备的紧凑计数，例如 `1跑 2待 3结`，口径与胶囊完全一致（跑＝运行中、待＝需回复、结＝完成未读）；零成员的类别不出现，全部为零时仍显示会话名。计数只来自 Host 的快照投影，不额外发起请求；离线设备按上次已知目录计入。DSH 未向插件暴露会话级失败，所以标题里没有“错误”类别。
- 诊断 JSON 的 `attentionByDevice` 提供同一集合；`barObstruction` 会记录实测遮挡尾部按钮的元素（`tag#id.class z=N`，无页面文本）。分享前脱敏，会话 ID 也属于隐私信息。
- “同步中 / 数据过期”与“上次已知”不是精确当前计数。目录请求失败不清空成员、不生成假完成；本机完整目录适配器发现 DSH 私有服务绑定未知时同样保守显示过期，不删除持久状态。
- 连接换代使旧 HTTP/事件失效；刷新期间重放事件；待回复由服务器在新连接权威重建，不自行复活旧请求。
- 自动回归含真实环回 mux/WebSocket 与 bridge VM、三个种子的**虚拟 24 小时**生命周期测试；这些不等于真实 SSH、Electron/WebView、浏览器长时视觉验收。安装后的目标平台仍须检查新建→运行→等待回复→完成→已读→删除、断线重连及保活切换。

## 原生模式标签条

- 标签条尺寸只从 Host 框架测量：`宽度 = min(框架宽, 视口宽 - 框架左边)`，与标签条自身渲染宽度无关。窗口反复放大缩小、跨显示器换 DPI、侧栏折叠、全屏切换都会重新测量，宽度不会“只能变窄”。背景色与标题栏相同、边框仅 0.5px，因此边界不可见，尺寸必须靠测量而不是靠肉眼。
- 标签条 portal 到 `body` 并以固定 z-index 渲染，脱离框架 `overflow: hidden` 与宿主 `shell.overlay` 的层叠上下文；层级预算为：宿主机框内其他控件 ≤30 ＜ 标签条 60 ＜ Tooltip/HoverCard 100 ＜ Modal 1000 ＜ Menu/Toast 1100。
- 设置齿轮与当前设备操作固定在尾部簇（`flex: none`），标签区单独收缩并横向滚动，不再把入口挤出可视区。宽度小于 720px 时齿轮移到左侧簇并图标化。
- 标签溢出时，鼠标停在标签条上会浮出一条 3px 滚动条：它是挂在标签条（bar）里的绝对定位覆盖层，不参与 `flex` 布局，也不在滚动容器内部，所以标签的宽高、位置与原来逐像素一致。可拖动拇指，滚轮落在标签条上会转成横向滚动（到两端后不再拦截）。触屏没有 hover，直接横向拖动即可，手势期间滚动条短暂出现；不设置 `touch-action`，竖向滑动仍照常滚动页面。系统原生滚动条保持隐藏，否则会吃掉固定 42px 条高的一部分并压扁胶囊。
- 运行时会用 `document.elementFromPoint` 探测尾部按钮中心，若被其他元素覆盖则写入 `data-obstructed` 并记录到诊断 JSON 的 `barObstruction`，便于定位是宿主的哪个层级把它挡住了。

## Profile 数据、迁移与恢复

默认使用当前 `$DSH_PROFILE_DIR/plugins/dsh-multi-device/` 下的 `devices.json` 与 `secrets.json`；正常 Web / Desktop Profile 分别位于 `$DSH_HOME/profiles/web` / `$DSH_HOME/profiles/desktop`。未提供 Profile 目录时按 `$DSH_HOME/profiles/$DSH_PROFILE`（独立运行缺省 `standalone`）解析。不要为了“迁移”手动让不同 Profile 共用路径。

- 从旧 `$DSH_HOME/plugins/dsh-multi-device.json` 与 `$DSH_HOME/plugins/dsh-multi-device-secrets.json` **仅在目标不存在时复制**，不 move、不删除原件。各 Profile 获得独立 `hostId`；迁移后数据不再自动互相同步。
- 旧版没有目标/凭据绑定的 Cookie 缓存安全失效，显式 credential / SSH passphrase 保留，首次升级可能需要重新认证。备份中也可能含敏感信息。
- 设备目录另存为版本化 `catalogs.json` v2，原始 Session/Workspace ID 不二次编码；旧 `devices.json` 内嵌目录先完整写入 v2，再删除 legacy 副本。目录异步写按文件串行并合并突发变化，Host 停用会等待最终 flush；`catalogPersistenceError` 表示持久化失败，不能把界面仍有缓存当作磁盘已保存。
- JSON 以 `0600` 临时文件、fsync、rename 原子替换（权限实际效果依操作系统），保留上一份有效 `.bak`。损坏主文件可从有效备份恢复并保留 `.corrupt-<id>`；没有有效备份、未来/不支持 schema 或文件不可读时拒写，不用空默认覆盖。这里只保证单文件原子性与尽力补偿，不承诺跨文件断电 ACID。
- 自定义同路径遇到 stale / “Storage changed outside this Host” 会拒绝陈旧覆盖；不自动合并配置。停止所有写入该路径的 Host，备份现场，解决路径共享后重启受影响 Host 读取最新状态；仅刷新浏览器不能重新读取 Host 的磁盘快照。
- 遇到 busy / `.lock` 先确认其他写入是否仍运行；锁只自动回收“结构完整、同一 hostname、PID 已退出”的残留，活跃、损坏、旧文本或其他主机锁均拒绝写入。不要在活跃写入时清理锁；仅在所有相关 Host 都已停止、已备份并确认锁为残留时再人工处理。
- 恢复失败时：停机 → 备份主文件、`.bak`、`.corrupt-*` 和对应配置 → 校验备份 JSON/schema 与版本兼容性 → 恢复同一次备份的设备及秘密文件 → 重启验证。不要删除损坏原件来“重置”；回滚参考安装章节。

### 配置示例

建议保留默认路径以获得 Profile 隔离；只有明确需要时覆盖 `dataFile` / `secretsFile`。DSH 注入的环境变量用于默认路径解析，YAML 不应假定自动展开 `$DSH_PROFILE_DIR`。

```yaml
- id: dsh-multi-device
  name: dsh-multi-device
  config:
    # 如需覆盖，请填真实绝对路径，并为不同 Profile 分开设置：
    # dataFile: "/absolute/path/Profile Data/devices.json"
    # secretsFile: "/absolute/path/Profile Data/secrets.json"
    features:
      sshTunnel: true
      directTransport: false  # 高级兼容，默认关闭，UI 不提供
```

## 诊断与验收

先确认顶部 `[本机][设备…]` 标签条出现，再检查 **设置 → 多设备** 里的设备连接/认证状态与客户端是否需要刷新。

在 **设置 → 多设备 → 诊断信息 → 生成诊断** 查看设备版本/状态、目录是否陈旧、会话计数及 `lastError`。**分享前人工审查并脱敏**：JSON、截图、控制台、启动日志和包管理诊断可能暴露主机/IP、用户名、绝对路径、仓库、会话标识、错误中的 URL/Token；不要上传秘密数据、Cookie、启动链接、私钥或未审查的 `.bak` / `.corrupt-*`。

普通用户安装后至少检查：

- [ ] 管理器显示目标版本与精确来源，包已启用；重启后无 Host 激活失败，配置页和客户端可加载。
- [ ] `ssh -V` 成功，已核实 known_hosts；添加设备、连接与认证正常，未隐式安装 ssh2 或批准脚本。
- [ ] 标签条正确：`本机` 显示本地 DSH，远端标签显示该设备完整页面，切换不重载；不受支持的访问方式明确给出原因，不把本地文件功能误作远端。
- [ ] 停用后界面贡献消失；卸载、重装后数据保留；升级/回滚使用精确版本 URL 并重验。

维护者的隔离安装、损坏恢复和发布门禁见 [RELEASE.md](<RELEASE.md>)。以上是**待执行验收项**，不代表已在所有平台通过。

## 开发与测试（非普通用户安装要求）

阅读 [AGENTS.md](<AGENTS.md>) 与 [AUDIT-REMEDIATION.md](<AUDIT-REMEDIATION.md>)。源码只在任务 worktree 编辑；依赖与本地快速验证仅在本机盘 `$BUILD_SCRATCH_ROOT`（默认 `~/.build`，先确认至少 20G 可用）的源码副本执行，不能落入项目卷。发行产物由 GitHub Actions CI 构建，不用本机临时包冒充 Release。

```bash
# 仅开发构建区，已同步源码且当前目录为构建副本：
pnpm install --frozen-lockfile --ignore-scripts
pnpm run verify:version
pnpm run typecheck
# 只有需要本地构建且满足仓库约束时；发行构建走 CI：
pnpm rebuild esbuild
pnpm run build
pnpm run test
# check = verify:version + build（含 tsc）+ test
pnpm run check
# CI/Release 另在 Git checkout 中检查 lib/** 零 drift 与 bundle 预算：
pnpm run verify:artifacts

# 仅开发调试：先停测试 Host，用完整引用保护含空格的构建路径。
dsh plugin --profile web add "file:$(pwd)"
```

主要入口为 [src/index.ts](<src/index.ts>)（Host）、[src/client/index.tsx](<src/client/index.tsx>)（Browser）、[cordis.patch.yml](<cordis.patch.yml>)（组合层）。单元/集成测试覆盖认证隔离、路由、原子持久化、生命周期与代理边界；源码 mock / React effect 回归不等于真实官方安装、Electron 视觉或全部操作系统兼容性。实际测试命令、矩阵、run 链接与未执行项应随交付记录，不能只写“CI 应该会过”。

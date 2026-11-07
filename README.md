# dsh-multi-device — DSH 多设备管理插件

通过一个 **DeepSeek Harness（DSH）Desktop / Web Host** 管理多台运行 `dsh web` 的开发机。远端无需安装本插件；本插件不接管远端 Agent、模型配置或沙箱，也不克隆、同步或修改项目文件。`main` 是开发线，不等于已验证的发行版。

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
5. 使用 **聚合模式**在官方侧栏查看跨设备工作区与会话；在设置切换 **原生模式**查看本机/设备标签，顶栏“聚合模式”可切回。本机标签只显示本机数据。

### 高级兼容：显式安装 ssh2（非默认、非自动回退）

仅在确有兼容需求、理解依赖脚本风险时使用；优先考虑系统 SSH + Agent。`ssh2` 不支持 ProxyJump / ProxyCommand，也仍需系统 `ssh-keygen` 核对 known_hosts。

停止目标 Profile 的 Host 后，通过官方 CLI 将它安装为 **plain dependency（普通依赖，不是插件组合包）**：

```bash
dsh plugin --profile web add ssh2
```

没有 `plain` 子命令/参数；不要在插件管理器中把 `ssh2` 当作组合包添加。Desktop 仍须使用 Desktop 自带入口并先完全退出。若 pnpm 拦截脚本，先审查输出中实际待审批的包、版本、来源及脚本；确需执行时，按该 DSH/pnpm 版本指引在**目标 Profile**的 `pnpm-workspace.yaml` 中仅批准明确审查过的 `allowBuilds` 键，再重试原命令。脚本以宿主用户权限执行；不自动 approve、不使用通配授权或关闭脚本保护。拒绝审批时继续使用 system-ssh，不承诺 ssh2 可用。完成后重启 Host，再显式选择 `ssh2` 引擎。

## 能力与支持边界

- **设备独立**：每台远端运行自己的 DSH 与模型/工具；0.2.x 使用对应 API 与实时流。0.1.x 仅有限列表兼容，不提供同等实时功能。开发基线为 `0.2.0-rc.2`，并有 `0.2.1-rc.5` 协议回归；peer 范围不是所有 0.2.x 版本/平台都已实测的承诺。
- **聚合**：已登记工作区按 Git `origin` 只读归一分组，支持 worktree、手动分组与目标设备选择。只有显式点击“开始匹配”才扫描主目录/已登记工作区父目录并登记找到的已有仓库；不自动扫描，不 clone 或同步文件。
- **会话路由**：列表、创建、提示词、取消、重命名/Fork、归档/置顶及审批、问答、计划评审按设备路由；模型目录按会话/客户端隔离。离线目录保留上次快照，变更操作需要连接。
- **原生页面**：在受支持的本地 Desktop / 本地 HTTP Web 中，独立 IPv4 环回代理尝试通过 Electron webview 或 iframe 加载远端页面，并保活已打开视图。页面内部主题、插件、上传、终端、文件与设置来自远端；桥接不就绪时聚合会话退回本地镜像。保活不保证零延迟、永久保留状态或跨平台视觉一致。
- **IPv6 / 远程浏览器 / HTTPS**：原生代理仅监听 Host 的 `127.0.0.1`，不能伪造为 `[::1]`，远程浏览器自己的环回地址也不是 Host。HTTPS 父页面嵌入 HTTP 代理存在 mixed-content 限制。此类场景使用聚合镜像，在 Host 本地以 `http://127.0.0.1` / `http://localhost` 打开 DSH，或在有可信网络与认证的独立窗口访问远端 DSH；不承诺远程浏览器原生嵌入可用，也不建议公开代理端口来绕过限制。非本地控制面访问同样有安全边界。
- **镜像能力有限**：本地镜像不等于完整远端页面；文件上传、终端、文件面板、全局设置等仍可能属于本地 DSH，不能当作远端功能使用。需要完整能力时回到受支持的本地原生页面或独立远端页面。
- **未读/已读**：Host 持久化本机与远端完成游标；读回执只消费页面已看到的那次完成，原生桥接使用幂等 ACK 和重试，隐藏保活不消费新提醒。跨 Host 默认关闭；开启后经 SSH 交换会话身份/游标，不上传消息正文。仅本连接代次亲见运行到完成、且能用官方只读分页确认真实 `turn/end` 的游标才提升为公共身份；恢复的旧已读、legacy 或不支持终态读取的会话不按墙钟强行清除另一 Host 的提醒。旧未读迁移为 `legacy:` 兼容游标并保留，成功完整目录才清理已删除孤儿。客户端 readState 使用 DSH 私有 `statusListeners` 兼容适配，若提示 notification bridge unavailable，需刷新页面使已有视图重新订阅。
- **非公开接口依赖**：原生 bridge、嵌入与部分 UI 状态适配依赖 DSH 内部结构；DSH 升级后必须重新验证，自动化测试不能替代真实 Electron/浏览器视觉验收。

## 原生模式状态计数

- 本机与远端顶部使用同一个会话关注投影：**需回复 → 自身/子代理运行 → 完成未读**，主分类互斥；需回复按会话数统计，展开后另列请求数。
- 默认排除归档、独立子代理行及非当前空白；普通 fork 保留。折叠工作区、搜索和“显示更多”不改变设备总数，成员不截断到 50 行。
- 点击每类数字展开全部参与统计的会话 ID、类别并复制。诊断 JSON 的 `attentionByDevice` 提供同一集合；分享前脱敏，会话 ID 也属于隐私信息。
- “同步中 / 数据过期”与“上次已知”不是精确当前计数。目录请求失败不清空成员、不生成假完成；本机完整目录适配器发现 DSH 私有服务绑定未知时同样保守显示过期，不删除持久状态。
- 连接换代使旧 HTTP/事件失效；刷新期间重放事件；待回复由服务器在新连接权威重建，不自行复活旧请求。
- 自动回归含真实环回 mux/WebSocket 与 bridge VM、三个种子的**虚拟 24 小时**生命周期测试；这些不等于真实 SSH、Electron/WebView、浏览器长时视觉验收。安装后的目标平台仍须检查新建→运行→等待回复→完成→已读→删除、断线重连及保活切换。

## Profile 数据、迁移与恢复

默认使用当前 `$DSH_PROFILE_DIR/plugins/dsh-multi-device/` 下的 `devices.json` 与 `secrets.json`；正常 Web / Desktop Profile 分别位于 `$DSH_HOME/profiles/web` / `$DSH_HOME/profiles/desktop`。未提供 Profile 目录时按 `$DSH_HOME/profiles/$DSH_PROFILE`（独立运行缺省 `standalone`）解析。不要为了“迁移”手动让不同 Profile 共用路径。

- 从旧 `$DSH_HOME/plugins/dsh-multi-device.json` 与 `$DSH_HOME/plugins/dsh-multi-device-secrets.json` **仅在目标不存在时复制**，不 move、不删除原件。各 Profile 获得独立 `hostId`；迁移后数据不再自动互相同步。
- 旧版没有目标/凭据绑定的 Cookie 缓存安全失效，显式 credential / SSH passphrase 保留，首次升级可能需要重新认证。备份中也可能含敏感信息。
- JSON 以 `0600` 临时文件、fsync、rename 原子替换（权限实际效果依操作系统），保留上一份有效 `.bak`。损坏主文件可从有效备份恢复并保留 `.corrupt-<id>`；没有有效备份、未来/不支持 schema 或文件不可读时拒写，不用空默认覆盖。这里只保证单文件原子性与尽力补偿，不承诺跨文件断电 ACID。
- 自定义同路径遇到 stale / “Storage changed outside this Host” 会拒绝陈旧覆盖；不自动合并配置。停止所有写入该路径的 Host，备份现场，解决路径共享后重启受影响 Host 读取最新状态；仅刷新浏览器不能重新读取 Host 的磁盘快照。
- 遇到 busy / `.lock` 先确认其他写入是否仍运行；不要在活跃写入时清理锁。仅在所有相关 Host 都已停止、已备份并确认锁为残留时再人工处理。
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
      aggregatedMode: true
      nativeMode: true
      sshTunnel: true
      autoGitAggregate: true
      directTransport: false  # 高级兼容，默认关闭，UI 不提供
```

## 诊断与验收

先确认 **设置 → 多设备 → 界面模式**：原生模式的“本机”按设计不合并远端。再检查设备连接/认证、Host 激活状态与客户端是否需要刷新。

在 **设置 → 多设备 → 诊断信息 → 生成诊断** 查看 `displayMode`、`hostStatus`、设备版本/状态、目录是否陈旧、会话/工作区计数及 `lastError`。**分享前人工审查并脱敏**：JSON、截图、控制台、启动日志和包管理诊断可能暴露主机/IP、用户名、绝对路径、仓库、会话标识、错误中的 URL/Token；不要上传秘密数据、Cookie、启动链接、私钥或未审查的 `.bak` / `.corrupt-*`。

普通用户安装后至少检查：

- [ ] 管理器显示目标版本与精确来源，包已启用；重启后无 Host 激活失败，配置页和客户端可加载。
- [ ] `ssh -V` 成功，已核实 known_hosts；添加设备、连接与认证正常，未隐式安装 ssh2 或批准脚本。
- [ ] 聚合/本机边界正确；选中远端会话后模型和审批发送给正确设备。原生不受支持的访问方式明确回退，不把本地文件功能误作远端。
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

# 仅开发调试：先停测试 Host，用完整引用保护含空格的构建路径。
dsh plugin --profile web add "file:$(pwd)"
```

主要入口为 [src/index.ts](<src/index.ts>)（Host）、[src/client/index.tsx](<src/client/index.tsx>)（Browser）、[cordis.patch.yml](<cordis.patch.yml>)（组合层）。单元/集成测试覆盖认证隔离、路由、原子持久化、生命周期与代理边界；源码 mock / React effect 回归不等于真实官方安装、Electron 视觉或全部操作系统兼容性。实际测试命令、矩阵、run 链接与未执行项应随交付记录，不能只写“CI 应该会过”。

# Release And Deployment Policy

`main` 是开发线，不是普通用户安装源。普通用户从 [GitHub Releases](https://github.com/IGNGserver/dsh-multi-device/releases) 选择预构建 `.tgz`，通过 DSH 官方插件管理器或对应安装提供的 `dsh plugin` 安装；完整 bundle 仅供检查/归档。详细安装、升级和数据恢复见 [README.md](<README.md>)。

**默认不发版、不部署。** 本批审计修复不更新版本、不打 tag、不创建 Release、不执行 npm publish，也不修改现用 Profile。以下发布步骤仅供用户另行明确授权“发布”时执行。

## 开发与构建去处

- 遵守 [AGENTS.md](<AGENTS.md>)：主目录是 `_anchor` 无代码锚点；从最新 `origin/main` 创建任务分支/worktree，正常集成经 PR / CI / Squash Merge。
- 依赖、缓存和本地快速验证只在本机盘 `$BUILD_SCRATCH_ROOT/DSH多设备插件/<slug>`（默认 `~/.build`）源码副本进行；先确认空间至少 20G，不在项目卷写 `node_modules` 或产物。
- **发行产物只由 GitHub Actions 构建**，不上传本机临时构建冒充正式资产。构建/单测通过不能代替真实官方安装验收。

## 发布前门禁与测试范围

本批需将**真实官方安装 smoke 加入 CI 和 release 工作流，失败即不得发布**。不能仅凭旧工作流的 typecheck/build/test 宣称已满足本门禁；以实际 workflow 内容、运行日志和 run 链接为证。运行目标应来自锁定版本的官方 DSH 安装，不以本仓库 stubs 或源码 mock 替代。

- [ ] 版本一致性：`pnpm run verify:version`；类型、构建、单元/集成：`pnpm run typecheck`、`pnpm run build`、`pnpm run test`，记录真实结果。
- [ ] 包结构：从 CI 构建结果 `npm pack` 得到实际 `.tgz`；检查 Host/Browser 入口、bundle patch、locale metadata、图标与声明资源确实随包分发并能解析。基础包不能安装 optional `ssh2` / `cpu-features`，不能为其申请原生构建脚本授权。
- [ ] 官方安装：隔离 `DSH_HOME`、路径含空格的资产，官方 `dsh plugin --profile web add <tgz>` → `--dump-config` 组合成功 → 启动 Host → 客户端入口可获取且真实加载 → 停用/卸载 → 数据仍保留。不能仅断言 pnpm 返回 0 或 patch 中有包名。
- [ ] 兼容矩阵：记录实际 DSH / Node / pnpm / OS 版本，覆盖声明的 DSH 下界及当前目标 DSH、所支持的 pnpm 主版本。只有实际通过的格子能标记通过；未覆盖的 Desktop / Windows / macOS 视觉与系统集成单列，不据 Linux smoke 外推“全平台可用”。
- [ ] 升级/回滚：精确旧/新版本资产、旧数据夹具、停 Host 后官方 CLI `add` 版本 URL；验证重启加载、数据隔离和认证缓存失效。管理器 `already-installed` 要走卸载→新 URL→启用，不能把重复添加当作更新。
- [ ] 安全/生命周期：迁移只复制、源文件保留、Profile 独立 `hostId`；credential/passphrase 保留而旧无绑定 Cookie 失效；单文件原子写、`.bak` / `.corrupt-*`、stale/busy 拒写、取消/停用无监听残留。
- [ ] 真实客户端人工验收：本地 Web iframe 与真实 Electron webview / iframe 回退、模式/设备切换、未读可见性、多客户端隔离、上传与审批路由。IPv6 父页面、HTTPS 和远程浏览器应有准确限制/聚合镜像退路，不能要求原生嵌入全部成功。私有 readState adapter 不可用时应提示 refresh。

单元/集成测试覆盖协议、状态和资源回收；React effect 回归不证明 Electron 视觉正确。HTTP 下载 Browser bundle 不证明浏览器已执行它。验收记录必须区分自动 smoke、浏览器执行证据和人工视觉测试，不把未跑项打勾。诊断、截图和日志分享前审查脱敏，不能附秘密数据及未经审查的备份。

### 自动化官方 smoke（CI 门禁入口）

[smoke-official-install.mjs](<scripts/smoke-official-install.mjs>) 要求 Node 24+、PATH 上为 pnpm 11。使用预构建 CI tarball 和精确官方 DSH 安装；以下变量必须替换为真实**绝对路径**，根目录须已存在且位于源码树外的本机盘/CI 临时区：

```bash
# 先设置三个绝对路径；CLI 是官方安装的 lib/bin.js，不是任意 shell 命令。
: "${DSH_SMOKE_ROOT:?set existing absolute scratch directory}"
: "${DSH_SMOKE_CLI:?set absolute official DSH lib/bin.js}"
: "${DSH_SMOKE_PACKAGE:?set absolute CI-built tgz path}"
export DSH_SMOKE_ROOT DSH_SMOKE_CLI DSH_SMOKE_PACKAGE
node scripts/smoke-official-install.mjs
```

脚本在根目录内创建自己的临时子目录，隔离 HOME、DSH_HOME、XDG、npm 配置/缓存等，过滤现用 DSH/凭据/SSH Agent 环境；只启动并停止自有环回随机端口子进程，结束时清理自有临时子目录，不删除传入的根目录或原始资产。它验证官方 add、组合、Host 激活、boot graph、实际 combo 的 **VM factory 注册**、控制面、启停、重启与卸载；VM 注册**不等于浏览器 materialization、组件挂载或视觉渲染**。A→合成 B→A 只验证安装器替换机制，不证明历史版本/真实数据兼容。当前脚本也不代替数据保留、真实升级/回滚、Desktop 与人工视觉验收。

### 手动隔离 Web 安装验收（不是 CI 安全隔离门禁）

以下流程只隔离 `DSH_HOME`，仍继承 shell 的 HOME/其他配置与环境，**不能替代上述脚本的完整环境隔离或作为 CI gate**。在新的专用测试 shell 中执行，**不改现用 Profile、不安装到 Desktop**。先准备可信 CI 产出的预构建 `.tgz`，或已发布的版本 URL；不需要为了安装插件 clone/build 源码。`dsh` 必须来自要验证的官方 Web CLI 安装。不要在现用 DSH 会话的启动环境中复用其 Profile 变量。

```bash
# 在新的测试 shell 中执行；先按仓库要求确认 scratch 可用空间 >=20G。
SCRATCH_ROOT="${BUILD_SCRATCH_ROOT:-$HOME/.build}"
mkdir -p "$SCRATCH_ROOT"
df -h "$SCRATCH_ROOT"
# 下两项由执行者设置成真实资产；URL/路径内不放凭据。
# export TEST_TGZ="/absolute/path/Release Assets/dsh-multi-device-vX.Y.Z.tgz"
# export TEST_TGZ="https://github.com/IGNGserver/dsh-multi-device/releases/download/vX.Y.Z/dsh-multi-device-vX.Y.Z.tgz"
: "${TEST_TGZ:?set exact CI tgz path or Release asset URL}"
export DSH_HOME
DSH_HOME="$(mktemp -d "$SCRATCH_ROOT/dsh-multi-device-smoke.XXXXXX")"
unset DSH_PROFILE_DIR DSH_PROFILE
printf 'Isolated test home: %s\n' "$DSH_HOME"
dsh --version
node --version
pnpm --version
dsh plugin --profile web add "$TEST_TGZ"
dsh --profile web --dump-config
# 仅环回监听且由系统分配空闲端口；启动输出含敏感 Token，不公开日志。
dsh web --host 127.0.0.1 --port 0 --no-open
```

打开启动输出指向的本地页面，按 [README.md 的用户验收](<README.md#诊断与验收>) 检查已启用版本、配置页、客户端加载和连接；记录 Host/Browser 激活证据。停止测试 Host（Ctrl-C，确认进程已退出）后，在**同一测试 shell**继续：

```bash
# 可选：停机后用另一个精确 URL/本地 tgz 验证升级或回滚，再启动复验。
# dsh plugin --profile web add "${OTHER_TEST_TGZ:?set exact upgrade or rollback asset}"
dsh plugin --profile web remove dsh-multi-device
# 手动核查隔离 Profile 的插件数据与备份仍在；本流程不删除 DSH_HOME。
```

停用本身应在管理器开关中验收；启动型 Profile 按提示重启。若需重装，将同一 `$TEST_TGZ` 再 `add` 并重启，确认没有“卸载顺便删除设备/秘密数据”。测试完保留隔离目录供核查，清理必须另行确认目标，不提供一键删除用户数据的命令。

### 数据与恢复专项（只在隔离副本）

1. 复制脱敏旧数据夹具到隔离 `$DSH_HOME/plugins/`，分别启动测试 Profile，确认新默认路径为 `$DSH_PROFILE_DIR/plugins/dsh-multi-device/{devices,secrets}.json`；legacy 原件仍在，Profile 的 `hostId` 不同。
2. 验证旧无绑定 Cookie 被拒绝，显式 credential / SSH passphrase 保留，必要时重新认证；默认跨 Host 已读同步仍关闭。
3. 保存两次形成 `.bak`，仅在测试副本故意损坏主文件，确认从有效备份恢复并保留 `.corrupt-*`。两份都坏或 schema 不支持时应拒写，不覆盖为空默认。
4. 用两个测试 Host 指向同一自定义数据路径：第二个陈旧写入应拒绝而非吞掉其他写入；停止双方、备份、重启读取最新状态后恢复。busy 残留锁只在确认无写入者后人工处理。
5. 模拟 IO 失败/取消，验证错误传播与资源清理；不把单文件原子性写成跨文件断电 ACID。全程不得用真实凭据或生产 Profile 做破坏性测试。

## 版本与正式发布步骤（仅明确授权后）

根 `VERSION` 是版本真源，[package.json](<package.json>) 必须同步；默认只递增 patch，未获明确授权不改版本。历史 tag、Release 与下载资产默认不可变，不覆盖旧版本。

1. 更新版本并通过 `pnpm run verify:version`；经 PR 合入 `origin/main`，等待 [ci.yml](<.github/workflows/ci.yml>) 的校验与官方安装 smoke 全部真实通过，记录 run 链接。
2. 在目标 `origin/main` 提交上创建并推送注释 tag（把 `X.Y.Z` 换成真实版本）：

   ```bash
   git fetch origin --prune
   git tag -a vX.Y.Z "origin/main" -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```

3. 等待 tag 触发的 [release.yml](<.github/workflows/release.yml>)：校验 tag 与 `VERSION` 相符、版本/类型/构建/测试通过、生成实际 npm tarball 与 bundle，**官方安装 smoke 通过后**才允许发布。不要在缺少门禁时先发布再补验收。
4. 核对 Release 渠道、目标提交、资产非空、SHA-256 校验文件匹配，抽验最终下载资产可通过官方安装路径加载。Release notes 必须给精确版本 `.tgz` URL、管理器优先、Desktop 内置入口和退出条件、数据/认证迁移及已知平台边界；不诱导裸包名 npm 安装或源码 build。

“发布 release”默认是测试渠道（`prerelease=true`、非 latest）。只有明确要求“正式发布”才在已验收 tag 上运行：

```bash
gh workflow run release.yml --ref vX.Y.Z -f channel=stable
```

`stable` 应为 `prerelease=false`、`make_latest=true`。workflow 失败、smoke 未通过、Release 未生成或资产/校验文件缺失时不能宣称发布完成。发布不等于向任何设备部署。

## Release 资产

每次授权发布生成四项：

| 资产 | 用途 |
| --- | --- |
| `dsh-multi-device-vX.Y.Z.tgz` | 预构建 DSH 插件包；管理器输入精确 Release URL，或停机后由官方 CLI `add`。 |
| `dsh-multi-device-vX.Y.Z.tgz.sha256` | 安装包 SHA-256。 |
| `dsh-multi-device-bundle-vX.Y.Z.tar.gz` | 含源码、预构建入口、组合声明与文档的完整归档，不是普通用户安装入口。 |
| `dsh-multi-device-bundle-vX.Y.Z.tar.gz.sha256` | 完整归档 SHA-256。 |

## npm 仅作为未来维护路线

当前 public npm 不存在 `dsh-multi-device`，本文没有可直接执行的包名安装或 publish 命令。若未来另获明确授权，需先确认名称/所有权、许可证与资源清单、访问策略、2FA/OIDC、版本不可变约束及供应链审批；用同一实际 tarball 做官方安装/升级/卸载 smoke 后，才能设计发布通道。不得把 GitHub 的 `npm pack`（只生成 `.tgz`）误写成已执行 npm publish。

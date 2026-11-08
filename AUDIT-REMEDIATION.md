# 审计修复执行清单

基线：2519fac / v0.2.18。用户授权按顺序实现全部三批，不发布、不部署、不修改现用 Profile。

## 批次一：认证与客户端隔离
- [x] #1 代理 Cookie 按 Host 实例/设备隔离，共享 Cookie jar 回归
- [x] #2 裸 Token 始终兑换，拒绝隐式签名 secret 猜测
- [x] #3 模型目录按请求会话/客户端隔离，每客户端序号
- [x] #4 bridge 导航及嵌入命令定向，客户端快照状态隔离
- [x] #6 仅真实可见 surface 标记已读
- [x] #8 目标/凭据变化使旧认证缓存失效
- [x] #15 bootstrap false 往返与权限意愿保持

## 批次二：持久化与生命周期
- [x] #5 真实 shell Git 扫描命令及错误传播
- [x] #7 Profile 数据归属、陈旧快照覆盖与迁移
- [x] #9 上下游 HTTP/SSE 取消联动
- [x] #10 启动中 stop/remove 清理监听
- [x] #11 活动会话上报失败/Host epoch 重试
- [x] #12 HMR 前置订阅的状态更新
- [x] #13 IPv6 URL 与实际监听地址一致
- [x] #14 Electron 回退/重载生命周期
- [x] #16 catalog 截断真实判定
- [x] #17 原子持久化与损坏备份/恢复
- [x] 核查共享读状态并发、Origin边界、冷启动可见性、过期模式导航风险

## 批次三：官方安装与验收
- [x] 普通用户先官方插件管理器/预构建 tgz，开发安装独立
- [x] Desktop 内置 dsh 来源及退出/初始化说明
- [x] 降低基础包 ssh2/cpu-features 构建脚本安装负担
- [x] 安装前 locale metadata、图标及实际打包资源
- [x] npm 发布仅说明/预备，不实际发布或暗示现有公共包
- [x] 隔离官方安装→组合→启动→客户端资源获取与factory注册（非UI渲染）→停用/卸载，升级/回滚验收
- [x] CI pnpm/DSH 兼容矩阵及回归，不仅源码mock

## 执行纪律
每批独立分支/worktree，从最新 origin/main 开始；依赖/测试仅 ~/.build；本地快速项，构建用PR CI；PR CI实际通过才Squash合入；不动现有diag-0216工作区；不更新VERSION、不tag、不Release、不部署。

## 批次一验证
本机盘隔离副本：verify:version、typecheck、178项测试通过（新增45项），2026-11-07。PR CI负责真实构建，结果链接在PR中记录。旧无绑定认证缓存安全失效，保留显式凭据；首次升级可能需要重新认证。#11上报重试同时修复并新增回归，第二批补Host epoch验证。

## 批次二设计与边界
- 默认数据位于 `$DSH_PROFILE_DIR/plugins/dsh-multi-device/`；旧 `$DSH_HOME/plugins/` 数据仅一次复制，源保留，各 Profile 独立 Host id。自定义同路径采用锁内摘要CAS拒绝陈旧写入，不自动合并配置；拒写需重启读取最新状态。
- JSON 0600临时文件、fsync、rename原子替换，保存上一份有效备份。损坏文档恢复保留corrupt副本；恢复失败/未来schema拒写，不覆盖空默认。确定性stale/busy预检；常规IO错误回滚及跨文件补偿，不宣称断电跨文件ACID。
- 跨Host已读状态写入独立`read-state.json.hosts/<hostId>.json`，分帧读取合并旧文档，避免read/merge/write竞争；默认关闭不变。
- DSH 0.2.x未公开已有Session状态源通知API，HMR兼容桥集中检查JS可见的`statusListeners`，通知去重；不兼容时诊断要求刷新，不伪造交互或轮询。官方API变化时需更新适配。
- IPv6或远程浏览器不能假定访问Host的IPv4回环代理，明确降级说明；不生成未监听地址。
- 认证管理器无AbortSignal，已启动的认证I/O仍受原超时限制；代理取消后其结果不会重建转发或复活服务。
- 整体验证：verify:version/typecheck/246 tests通过（相对批一新增68项），最终CI证据见PR。真实Electron视觉验收仍不能由React effect回归替代。

## 最终验证与集成证据
- 批次一：PR #51，merge `a32073b`；178 tests / typecheck / build通过。https://github.com/IGNGserver/dsh-multi-device/actions/runs/42342209372/job/128312154523
- 批次二：PR #52，merge `4ff671b`；246 tests / typecheck / build通过。https://github.com/IGNGserver/dsh-multi-device/actions/runs/42344160551/job/128318156192
- 批次三：PR #53；本机scratch版本/metadata/typecheck/249 tests、脚本syntax/helper self-test通过，CI同样构建并验证实际npm pack清单。https://github.com/IGNGserver/dsh-multi-device/actions/runs/42345365096/job/128321819471
- 官方真实安装：Node 24.22.2、pnpm 11.18.0，普通`dsh plugin add <CI tgz>`（没有ignore-scripts），验证Host active、boot graph、实际combo factory注册、空设备control-plane、插件与Bundle启停、A→合成B→A、卸载重启：
  - DSH 0.2.0-rc.2 PASS：https://github.com/IGNGserver/dsh-multi-device/actions/runs/42345365096/job/128321926397
  - DSH 0.2.1-rc.5 PASS：https://github.com/IGNGserver/dsh-multi-device/actions/runs/42345365096/job/128321926327
- 首轮smoke在npm pack阶段因stdout/stderr混合失败；读实际日志后修正通道分离并重新通过，不把失败记录当成功。
- 不发布、不tag、不改VERSION，不修改用户现用Profile；旧v0.2.18资产不含这些修复，用户需另行授权后才能发行修复版。

## 未被自动化结果证明的边界
真实浏览器UI materialization/slot渲染、Desktop视觉、Windows/macOS系统集成及真实历史包数据升级仍需对应环境人工或GUI验收；HTTP+VM仅证明资源注册。合成B复用本次CI字节，仅验证安装器版本替换机制。release smoke门禁已加入，但本任务未触发发布workflow。原生页面bridge及HMR通知仍有集中且受检查的私有DSH兼容依赖，不能外推所有未来0.2.x皆兼容。

## 全量质量重构（v0.2.21 开发线，本轮）

基线为 `origin/main@bf82be6`；继续保持版本 `0.2.21` 不变，不发布、不部署、不修改现用 Profile。以下均已有源码和自动回归，外部实机边界不因勾选而消失。

### 数据正确性、持久化与生命周期

- [x] 配置/秘密保留同步事务与跨文件补偿；catalog 独立为严格校验的 v2 codec，raw ID、Unicode、重复项、协议版本、cached row 与 reserved `md~` 前缀均有 fail-closed 检查。
- [x] legacy 内嵌 catalog 两阶段迁移、失败重试和重启 hydration；异步写 per-file 串行、dirty coalescing、有界重试、错误状态、显式 `flushPersistence()`。修复同步 `dispose()` 后未等待写重建已删目录的问题，并区分 pristine 空与删除最后设备后的有意空文档。
- [x] 新增 process-owned storage lock：完整 metadata fsync、同 hostname 死 PID 才恢复、owner 校验释放；活跃/malformed/legacy/remote lock 拒绝写入。异步写入在 lease 内重算 CAS，备份/损坏恢复不覆盖未知文档。
- [x] mount generation 与 isolated probe/client disposal；baseline single-flight、epoch fence、journal 有界重放、退役 snapshot response、restart 清理 `snapshotInFlight`，修复同 Session 更高 requestSeq 或本地选择仍命中旧缓存的问题。
- [x] 外部 store 在 client A→B 重绑；全局面板不错误清除 active Session/切到 local；旧 generation finally 不得清理新请求。

### 控制面、网络与 Native 隔离

- [x] HTTP parse 与 direct dispatch 共用字段 schema/admission/body/dispatch 限制，在副作用前拒绝类型强转和非法序号；保留合法空标题、空凭据、清选及可选 workspaceId。
- [x] caller disconnect 的 AbortSignal 贯通 runtime、本地与远端内容搜索及只读远端模型目录；aborted search 不转换成设备 partial error。deadline 对非幂等操作仍只表示结果未知。
- [x] system OpenSSH stdout/stderr 有界、超时和外部 AbortController 清理，子进程 SIGKILL；`IdentitiesOnly=yes`、bracketed IPv6 bind 与 Direct TLS 选项传递保持 fail-closed。
- [x] mux payload 上限、epoch-scoped auth recovery、结构化 multipart 错误；Fetch 保留 status/statusText，204/205/304 使用 null body；stream queue 改 O(1) head index。
- [x] Native proxy HTML 解压移出事件循环并限制解压/注入输出，失败返回 502；每客户端 navigation owner 与 ready 状态分离，旧 socket 不能提交选择/导航，替换 owner 关闭可提升仍存活的 ready socket，逻辑 selection 不被重叠重连误清。

### Git、搜索与前端复杂度

- [x] Git v2 NUL frame、分片、partial/truncated 显式状态、deadline/AbortSignal；本地扫描异步化。partial/truncated 结果不能声称完整，也不能把未命中 seed 归类为 missing。
- [x] unread ID 一次解码分组；Workspace 父路径索引与 slash boundary；Session cwd/raw parent Map 查找；聚合侧栏 model/Set/device choices 引用级 memoize。
- [x] 固定高度虚拟行使用 prefix offsets + binary search、上下 spacer 与 overscan；一个 tree ResizeObserver 和一个 latest-value scroll rAF；离屏键盘焦点按 index 恢复，不回到无界 DOM。

### CI、Release 与烟测门禁

- [x] CI/Release build 后检查 tracked/untracked `lib/**` 零 drift，Host/Browser/Contract bundle budget；实际 npm pack 的完整 `lib/**` 与构建输出精确一致。
- [x] Release 在官方安装 smoke 后、发布前以固定 commit 的 `actions/attest-build-provenance@96278af6caaf10aea03fd8d33a09a777ca52d62f` attesting 最终资产；notes 记录精确 source SHA、workflow run、attestations 和 test/stable 渠道。
- [x] smoke 保持隔离 HOME/Profile/端口、无真实凭据/模型调用、失败非零、SIGTERM→SIGKILL、finally 清理；两个入口的 SIGINT/SIGTERM 明确保留 130/143，预期中断不掩盖清理异常；redaction 覆盖 JSON/YAML 带引号 token、credential、passphrase，helper self-test 可独立运行。pnpm 11 使用 `pnpm_config_pm_on_fail=ignore` 防止 `packageManager` 静默切回 10，并断言实际版本。

### 本轮验证记录与保留边界

- 首轮全量 scratch：版本/typecheck/build 成功，32 个测试文件中 31 个通过；Native 同 client 替换 socket 回归暴露 selection/owner 恢复缺陷。修复后 Native isolation/lifecycle/navigation/read-ACK 4 文件 57 项通过。最终全量 32 文件 / 562 项测试、独立 typecheck、真实 build 全通过；scratch `lib/**` 已同步并与 worktree 逐文件一致，真实 `npm pack` 的实际清单校验通过。
- 最终官方安装 smoke 使用 Node 24.18.0、pnpm 11.18.0、DSH 0.2.1-rc.5 和本轮实际 tgz，安装/组合/Host/控制面/插件与 Bundle 启停/A→合成 B→A/卸载重启全部通过；合成 B 只证明版本替换机制，不证明历史版本兼容。
- 最终 Chromium E2E 使用两个隔离官方 Web 实例，统一侧栏、本地/双远端非空历史、Native 切换、刷新、重连、双标签独立选择和无插件官方 UI 对照全部通过；记录 2 条精确匹配的官方上游取消日志，不能称为 console 零错误。报告与截图位于本机 scratch，不上传秘密或发布资产。
- 两个 smoke 的真实 SIGTERM 测试最初均暴露 `main().catch` 把 130/143 覆盖为 1 的问题；修复后预期中断保留退出码、写 interrupted 状态并清理，清理异常仍退出 1。复测两入口均为 143，含凭据 runtime 无残留，最终成功路径也已重新通过。
- 保留限制：POSIX 中间 line-based Git 扫描仍不支持任意换行路径，PowerShell 批次可能受平台命令长度限制；最终 NUL wire protocol 不消除这两个上游边界。
- Windows/macOS Desktop、真实 Electron WebView/iframe 视觉与长时保活、IPv6 parent、HTTPS mixed-content、自签名 Direct 与真实 SSH/known_hosts/Keychain 仍需对应环境验收。协议模拟、Linux Web smoke 和单元测试不能替代；不支持的 Native parent 继续显式退回聚合镜像，不扩大监听或关闭 TLS/CSP。

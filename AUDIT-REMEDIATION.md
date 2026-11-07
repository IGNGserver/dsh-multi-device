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

# 聚合模式重构：独立目录与原生导航

## 数据边界

控制机只聚合导航元数据，不向本机 DSH Session Controller 注入远端摘要、不伪造本机工作区成员、不复制会话日志或项目文件。`DeviceCatalog` 是每设备唯一目录事实源；`AggregatedCatalogView` 与逻辑工作区在同一个控制平面快照中发布。侧栏直接读取该快照，不再等待两个官方流对齐，也不再依赖前端持续 `sessions.refresh()` 修复。

本机行仍交给本机官方导航。远端行只把原始会话身份发送到对应设备独立原生容器，由该设备的官方 DSH 加载历史、模型、工具、附件与人工交互。旧网关源码仅暂留为兼容测试参考，不在生产 Host 入口安装；它不是新模式的回退路径。

## 同步与恢复

- 每设备独立 epoch，过时代际的 HTTP、流和 Git 结果不得提交。
- WebSocket 打开不是目录就绪：0.2 必须等 `$events` ready、会话列表、工作区 baseline、control baseline 后才标记 connected。
- 先建立事件订阅，再取列表；同代列表 single-flight，拉取期间记录并重放增量。journal 有界，溢出显式失败并重新建基线。
- projection 使用每会话每 key 水位，允许同一事件不同 key 同序号；cached 标题不能覆盖更新的有序标题。
- 断线保留轻量目录与标题提示，运行状态视为陈旧而不是继续假装正在执行。目录不再裁至 2000 会话／300 工作区；未解析引用显示明确占位和诊断，不悄悄隐藏。
- 固定设备故障不阻塞其他设备；未知/移除设备的命令报错，不降级到本机执行。

## 原生导航事务

导航以客户端 ID、目标设备、原始会话 ID、请求序号归属。桥接 ready 仅表示服务契约存在，selection 仅表示已选中；只有目标 binding 的 `openState=open` 才确认成功（允许空历史）。错误、超时、快切和重连均显式处理，旧 socket 与旧 binding 回调不能确认新导航。

不同浏览器的选择独立。原生页面内部跳转会回传选择并重新确认历史；全局本机新会话仍可退出远端面板。同一行重复点击会重新确认，不因旧成功账本锁死。停止运行中会话并归档必须由用户确认后传 `stopActivity=true`。

## 平台与 Git 身份

origin-only，手工映射优先。本地 Git 从快照热路径移除，后台有界并发默认 3；缓存陈旧保留，权威读取变化后通知重算。远端 POSIX 与 PowerShell 分别安全编码，能力探测去重并缓存；Windows、WSL、Git Bash 路径空间不盲转。支持 worktree、gitconfig include、明确扫描根和 `.wt`；仍不遍历其他隐藏缓存。失败不伪装成“没有仓库”。

旧规范化保留仓库路径小写，以避免直接破坏现有 logical ID 与用户偏好；大小写敏感 Git 服务需使用明确手工映射，后续更换规范化必须带身份迁移。目录名包含 TAB/换行的扫描行协议尚不支持；超大 PowerShell 批次可能达到平台命令长度限制，均不应被解释成成功空结果。

## 浏览器入口能力边界

原生内容当前支持已验证的 DSH Desktop guest 与本机 HTTP IPv4/localhost Web GUI。HTTPS 页面、远程浏览器访问控制机 loopback、IPv6 parent 等返回明确不支持原因，不回退到本机镜像，也不生成不可达地址。

官方远端 runtime 使用根路径资源且没有完整的 prefix/opaque embedded 契约，因此本插件不把远端 HTML 挂到控制机同源路径：`<base>`、fetch 补丁、Host service worker 不能提供完整且隔离的替代。未来适配需要官方嵌入契约，或管理员配置每设备独立 HTTPS 入口并实现独立鉴权、短期设备/客户端 capability、服务端凭据与 Cookie 隔离。当前不宣称这些部署已支持，也不通过扩大监听或关闭 CSP 绕过限制。

## 验证与集成

快速验证：`pnpm run verify:version`、`pnpm run typecheck`、`pnpm run test`。构建与打包只在 CI 或隔离本机构建区，发行仍需用户明确要求。

真实官方浏览器烟测：`pnpm run test:aggregated-browser`。需要 Node 24+、pnpm 11、官方 DSH CLI、预构建 tgz、Playwright 和浏览器，环境变量见脚本顶部。它创建两个隔离官方实例、独立 Profile 和临时端口，通过官方 SDK seed 非空历史而不调用模型；验证侧栏、原生历史、切换、刷新、重连和多标签隔离。不会替换当前 GUI、使用真实用户凭据或部署测试包到真实 Profile。测试日志与截图保留，含凭据运行目录在 finally 中清理。

真实浏览器验收还发现官方 0.2.1-rc.5 右侧 SidebarSessionView 在历史打开尚未结算时被正常释放，会把 `Session reference … is released` 的取消 Promise 记成 `console.error`。烟测保留完整日志，仅对同时匹配精确消息及官方 `SidebarSessionView.dispose` / `ClientSessionReference.release` 栈的取消另列 `knownUpstreamCancellation`；其他 console.error、pageerror 和任何历史/选择失败仍使验收失败。通过含此记录的验收不能宣称“浏览器零错误”。插件不修改官方安装或全局 console 来抑制日志。

支持“可列出目录”和支持“可打开原生内容”是独立能力。0.1 明确为目录轮询兼容，不把缺失的 0.2 原生绑定契约冒充完整支持。官方版本矩阵与平台模拟测试不能替代真实 Windows/macOS Desktop 验收，未做的实机测试应在交付中明确列出。

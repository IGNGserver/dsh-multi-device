# 原生模式架构（0.3.x 起唯一模式）

## 定位

本插件只提供一种界面：顶部常驻的设备标签页。`本机` 标签页就是未经改装的本地 DSH 页面，每台远端设备在自己的标签页里运行它自己的完整 DSH Web 页面。插件不向本地 Session Controller 注入远端会话、不伪造本地工作区、不复制会话日志或项目文件。

远端数据只有两条通路：

1. **目录元数据**：`DeviceCatalog` 按设备维护会话/工作区身份与运行、待回复、归档、子代理等事实，只用于标签页徽标、诊断与离线"上次已知"计数。
2. **原生页面**：本地反向代理把远端 DSH 页面通过 loopback 送达浏览器，并在页面内注入桥接脚本，回传选择、标题、折叠状态与已读回执。

## 同步与恢复

- 每设备独立 epoch，过时代际的 HTTP、流与 Git 结果不得提交。
- WebSocket 打开不是目录就绪：必须等 `$events` ready、会话列表、工作区 baseline、control baseline 后才标记 connected。
- 先建立事件订阅，再取列表；同代列表 single-flight，拉取期间记录并重放增量。journal 有界，溢出显式失败并重新建基线。
- projection 使用每会话每 key 水位，允许同一事件不同 key 同序号；cached 标题不能覆盖更新的有序标题。
- 断线保留轻量目录与计数提示，运行状态视为陈旧而不是继续假装正在执行。目录不再裁至 2000 会话／300 工作区；未解析引用显示明确占位和诊断，不悄悄隐藏。
- 固定设备故障不阻塞其他设备；未知/移除设备的命令报错，不降级到本机执行。

## 持久化、取消与控制面边界

- `devices.json` / `secrets.json` 保留同步配置与凭据事务，因为 schema 预检、回滚和跨文件补偿 API 是同步的；目录快照独立写入版本化 `catalogs.json` v2，原始 Session/Workspace ID 不做二次命名空间编码。
- 目录异步写按文件串行、dirty-bit 合并突发变化，失败后保留 dirty 并有界退避。
- 同步 `dispose()` 只冻结状态；Host 生命周期随后显式等待 `flushPersistence()`。pristine 空 Registry 不创建无意义 catalog 文件。
- 每文件 process-owned lock 记录版本、PID、hostname、owner 和时间；只回收本机 hostname 且 PID 已退出且结构完整的 stale lock。malformed、legacy-text、远端 hostname 或活跃 PID 一律 fail-closed，release 校验 owner。
- HTTP 解析和 direct dispatch 共用字段级 schema，在 Registry 副作用前拒绝类型强转、非整数端口/序号和越界字段。控制面动作集只包含设备管理与已读状态；任何已下线动作按 `Unknown action` 拒绝。

## 前端投影与渲染预算

- 注意力投影（`attention.ts`）是标签徽标的唯一来源：**需回复 → 自身/子代理运行 → 完成未读**，主分类互斥；需回复按会话数统计，展开后另列请求数。
- 标签只呈现一个状态胶囊（`dsh-md-tab-status`），按上述顺序排列**黄色＝待回复、蓝色＝运行中、绿色＝完成未读**的纯数字；空类别不渲染、不占位，缓存态用半透明虚线与空圈表达，颜色从不作为唯一通道（位置、计数、`title`、`aria-label`、菜单分组标题同时给出语义）。
- 折叠工作区、归档与独立子代理行不改变设备计数；离线设备显示"上次已知"而不是精确当前值。
- 界面状态分 `local` 与 `remote:<transport>` 两个 scope：本机由 client 入口包 `uiWorkspace.view` 的 action 上报/回灌；远端由注入桥接上报/回灌。Host 用 HLC 按字段合并并持久化，同一 Host 的所有浏览器共享；跨控制机时只复制 `remote:` scope，写入被动远端文件，远端零插件。
- 一个 ResizeObserver 与 latest-value rAF 限制标签栏测量工作量；裁剪宽度保证设置入口始终可见。
- 快照缓存以 Host revision 为键；任何有效本地/远端选择、清选或 requestSeq 提升都必须 bump revision。

## 原生页面与桥接

- 桥接 ready 仅表示服务契约存在，selection 仅表示已选中；页面内部跳转由远端页面自己完成，Host 只镜像状态。
- 不同浏览器的状态独立；客户端身份随页面存储，两个标签页不能互相顶替。
- Keep-Alive 用 `display` 隐藏而不是卸载，因此切换标签页不丢 WebSocket、会话与草稿；隐藏页面不消费新提醒，可见时才清除。
- 已读回执使用幂等 ACK 与重试；只有连接代次亲见运行到完成、且能用官方只读分页确认 `turn/end` 的游标才提升为公共身份。

## 浏览器入口能力边界

原生内容当前支持已验证的 DSH Desktop guest 与本机 HTTP IPv4/localhost Web GUI。HTTPS 页面、远程浏览器访问控制机 loopback、IPv6 parent 等返回明确不支持原因，不回退到本机镜像，也不生成不可达地址。

官方远端 runtime 使用根路径资源且没有完整的 prefix/opaque embedded 契约，因此本插件不把远端 HTML 挂到控制机同源路径：`<base>`、fetch 补丁、Host service worker 不能提供完整且隔离的替代。当前不宣称这些部署已支持，也不通过扩大监听或关闭 CSP 绕过限制。

## 验证与集成

快速验证：`pnpm run verify:version`、`pnpm run typecheck`、`pnpm run test`。构建与打包只在 CI 或隔离本机构建区；CI/Release 在 build 后运行 `pnpm run verify:artifacts`，要求 `lib/**` 与提交零 drift 且 Host/Browser/Contract bundle 不超预算，实际 pack 的 `lib/**` 与构建输出精确一致。

真实官方浏览器烟测：`pnpm run test:device-browser`。需要 Node 24+、pnpm 11、官方 DSH CLI、预构建 tgz、Playwright 和浏览器，环境变量见脚本顶部。它创建两个隔离官方实例、独立 Profile 和临时端口，通过官方 SDK seed 非空历史而不调用模型；验证标签条渲染、设备页面加载、Keep-Alive 往返、刷新、重连和多标签身份隔离。不会替换当前 GUI、使用真实用户凭据或部署测试包到真实 Profile。

支持"可列出目录"和支持"可打开原生内容"是独立能力。官方版本矩阵与平台模拟测试不能替代真实 Windows/macOS Desktop 验收，未做的实机测试应在交付中明确列出。

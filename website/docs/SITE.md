# 官网定位与范围（SITE）

> 本文为后续开发者（含 AI 会话）提供站点上下文。产品能力或技术边界变更时须同步更新本文件。

## 是什么

**DSH Multi（`dsh-multi-device`）** 的产品官网与可交互多设备空间工作台演示站：如实呈现插件的架构原理、顶部常驻设备标签页体验、Keep-Alive 完整页面保活与三色会话关注胶囊，并提供官方插件安装指引与边界契约说明。站点源码位于主仓库 `website/`：

| 事项 | 归属 |
| --- | --- |
| 插件 Host / Client 运行时、版本、Release 资产、架构文档 | 主仓库 `IGNGserver/dsh-multi-device`（`website/` 之外） |
| 官网交互工作台、样式、静态资源、SEO 与托管文档 | `IGNGserver/dsh-multi-device/website/` |

## 产品事实边界（必须与主仓库文档严格一致）

站点文案与交互状态均对齐主仓库 [`README.md`](../../README.md) 与 [`NATIVE-ARCHITECTURE.md`](../../NATIVE-ARCHITECTURE.md)：

- **核心定位**：安装于本地 **DeepSeek Harness（DSH）Desktop / Web Host** 的 Cordis 插件，用于管理多台运行 `dsh web` 的远端开发机；
- **连接模型**：默认采用 `system-ssh` 系统 OpenSSH 环回隧道（`127.0.0.1` 动态分配转发端口 + Host 侧本地反向代理注入远端鉴权），自动复用 `~/.ssh/config` 与本机私钥；`HTTP(S) direct` 仅作为默认关闭的高级兼容开关；
- **界面与保活**：仅提供顶部常驻 `42px` 原生设备标签栏（`本机` 为未经改装的本地 DSH 页面，每台远端设备在独立标签页内运行完整原生 DSH 页面），切换标签使用 DOM Keep-Alive（`display: none; visibility: hidden`），不销毁 WebSocket、流式输出与输入框草稿；
- **关注状态胶囊**：遵循 `pending`（琥珀黄 `#f59e0b`）→ `running`（电光蓝 `#7aaaff`）→ `done`（翠绿 `#22c55e`）互斥计数与紧急度顺序，点击胶囊弹出官方毛玻璃 `<Menu>` 跳转对应会话并幂等清除未读（`read-ack`）；
- **明确不做的事（反误导红线）**：**远端无需安装任何插件**；**不克隆、同步或传输项目文件**；**不将远端会话混入本机侧边栏或全局会话池**；
- **分发方式**：仅通过主仓库 [GitHub Releases](https://github.com/IGNGserver/dsh-multi-device/releases) 的预构建 `dsh-multi-device-vX.Y.Z.tgz` 固定资产 URL 安装（当前不发布公共 npm 注册表，也不在官网托管安装包）。

## 当前状态（2026-11-14）

- **技术栈**：React 18 + Vite 6 + TypeScript + GSAP + CSS 3D（`preserve-3d` 空间透视与磁吸编排），零外部 CDN 依赖；
- **语言支持**：中 / 英双语即时切换（缺省中文 `zh-CN`）；
- **线上托管**：Cloudflare Pages 项目 `dsh-multi-website`（Direct Upload），正式域名 <https://dsh-multi.igng.net/>，由 `.github/workflows/website.yml` 自动校验并部署（详见 [`HOSTING.md`](HOSTING.md)）。

## 页面结构

| 区块 | 内容 |
| --- | --- |
| `#top` / `ConvergenceStage` | 首屏与四阶段 3D 多桌面空间汇聚舞台（`本机`、`ubuntu-dev`、`gpu-a100`、`macos-ci` 四窗口随滚动与 `01–04` 步进器对齐 SSH 环回导管、Z 轴层叠并磁吸合体为统一 Host 窗口） |
| `#workbench` / `InteractiveWorkbench` | 可真实交互的原生 DSH 多设备工作台：标签切换与 DOM Keep-Alive 草稿/流保活验证、3D Keep-Alive Stack X-Ray 透视剖面、三色胶囊点击跳会话与 `read-ack`、`gpu-a100` 工具审批状态流转、`Settings → Multi-Device` 从 `~/.ssh/config` 一键导入 `prod-arm64` |
| `#architecture` | 系统 OpenSSH 环回隧道、每设备本地反向代理、Epoch 目录基线与增量重放架构图解 |
| `#boundaries` | 严格边界契约矩阵（产品做什么 vs 明确不做什么，以及安全环回环境支持范围） |
| `#install` | DSH Desktop / Web 官方插件管理器与 CLI 安装步骤、精确 Release `.tgz` 规则与 SHA-256 校验说明 |
| `/404.html` | 深色空间风格 404 引导页（`noindex`） |

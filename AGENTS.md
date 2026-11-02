# DSH多设备插件（dsh-multi-device）· 项目 Agent 规范

只写本仓库与设备级规范的差异。Git 纪律、worktree、冲突处理见 `~/.qoder/coder-rules/global-rules.md`。

Collaboration: solo
Baseline: main
Default branch: main
Release: manual-on-explicit-request（不再每次开发自动发测试版）
Build: ci-first
Validation: `pnpm run verify:version`、`pnpm run typecheck`、`pnpm run build`、`pnpm run test`
Worktree: `~/项目/.wt/DSH多设备插件/<slug>`

## 这是什么

DeepSeek Harness（DSH）多设备管理插件：以 SSH 隧道连接远端 DSH（HTTP(S) direct 仅保留为默认关闭的高级兼容开关），复用系统 `~/.ssh/config` 与本机私钥，支持 Git Remote 自动工作区聚合，以及聚合模式与原生模式（Keep-Alive 保活）双模式切换。`main` 是开发线，不代表稳定版。

## 开工与工作区纪律（主目录无代码 + 从远端 `origin/main` 拉取）

1. **主目录无代码锚点**：主目录 `~/项目/DSH多设备插件` 长期冻结在 `_anchor` 分支，仅保留 `.git` 与本 `AGENTS.md` 锚点文件，**不存放源码，也禁止在主目录内 `checkout` / `switch` / 改文件 / 建提交**。
2. **任何任务必须从远端 `origin/main` 起分支**：
   ```bash
   git -C ~/项目/DSH多设备插件 fetch origin --prune
   BASE=$(git -C ~/项目/DSH多设备插件 symbolic-ref --quiet --short refs/remotes/origin/HEAD | sed 's|^origin/||')
   wt new DSH多设备插件 <任务slug>
   ```
   禁止使用 `git pull`，禁止从本地旧分支起新任务；所有源码读写只在 `~/项目/.wt/DSH多设备插件/<slug>/` 进行，合并后立即执行 `wt done DSH多设备插件 <slug>` 清理临时工作区。
3. **严禁在项目盘（`~/项目` NAS 卷）写入依赖或构建产物**：
   - `node_modules`、测试缓存、打包产物等高 IO 目录**一律禁止落在 `~/项目/DSH多设备插件` 或 `~/项目/.wt/DSH多设备插件/<slug>` 上**。
   - 本机需要运行依赖安装、编译或测试时，必须先检查本机盘构建区 `df -h "${BUILD_SCRATCH_ROOT:-$HOME/.build}"`（可用空间须 `>=20G`），将源码同步至 `$HOME/.build/DSH多设备插件/<slug>/` 内执行，只把干净源码同步回 worktree 提交。

## 验证命令（必须真实执行）

- 版本一致性：`pnpm run verify:version`
- 类型检查：`pnpm run typecheck`
- 构建：`pnpm run build`
- 单元与集成测试：`pnpm run test`
- 全量一键校验：`pnpm run check`（依次执行 `verify:version`、`build`、`test`；`build` 内部会跑 `tsc`，不再单独重复 `typecheck`）
- CI workflow：`.github/workflows/ci.yml`（在 push `main` 与 `pull_request` 时自动运行全套校验）。

## 与全局规范的差异（本仓库特有约束）

以下几条约束的是**手段与缺省行为**，不是拒绝用户授权的依据（见设备级规范第 0 节"授权语义"）：

- **交付物的构建、打包与 Release 资产生成一律走 GitHub Actions CI**：需要发行包时读取 GitHub Actions 的 run / Release 资产状态；本机内循环只在 `$BUILD_SCRATCH_ROOT`（`~/.build`）跑快速验证与单测，不向项目卷写入任何依赖或临时产物。
- 所有代码改动通过 `branch → push → PR → CI 验证 → Squash Merge` 集成进 `origin/main`。作为 `solo` 仓库，当本任务 PR 由当前 Agent 独立提交且 Validation / CI 全部真实通过时，Agent 可自行 `gh pr merge --squash` 并在合并后 `wt done` 清理 worktree。
- 不提交 `node_modules/`、`coverage/`、`*.log`、`*.tgz` 等临时文件。

## 发布（类比 guanlan-monitor 发布机制）

- **默认不发版。** 日常开发只做到：提交并通过 PR 合入 `origin/main` → `ci.yml` 跑校验。**不**自动递增版本号、**不**建 tag、**不**创建 GitHub Release。
- 只有用户明确要求"发布"时，才按 `RELEASE.md` 执行一次发布流程：
  1. 更新根 `VERSION` 文件并同步 `package.json` 的 `version`（运行 `pnpm run verify:version` 校验一致，默认仅递增第三位 patch）；
  2. 提交并合入 `origin/main`；
  3. 在 `origin/main` 目标提交上打标签并推送：`git tag -a vX.Y.Z "origin/main" -m "Release vX.Y.Z" && git push origin vX.Y.Z`；
  4. 等待 tag 触发的 `.github/workflows/release.yml` 跑完，核对生成的 GitHub Release、插件安装包资产（`dsh-multi-device-vX.Y.Z.tgz`、`dsh-multi-device-bundle-vX.Y.Z.tar.gz`）及其 `.sha256` 校验文件。
- 说"发布 release"默认指测试版（`test` 渠道，GitHub `prerelease=true`）；只有用户明确要求"正式发布"时才使用 `stable` 渠道（`gh workflow run release.yml --ref vX.Y.Z -f channel=stable`）将 Release 设为正式 latest。
- 发布链任一环节失败（workflow 失败、Release 未生成、资产或 `.sha256` 缺失）不得宣称完成，必须排查修复或明确报告阻塞原因。

## 环境事实（不含凭据）

- 远端仓库：`https://github.com/IGNGserver/dsh-multi-device`
- 运行方式：作为 Cordis 插件安装于本地 DSH Desktop（`$DSH_HOME/profiles/desktop`）或 DSH Web（`$DSH_HOME/profiles/web`）中，通过 SSH 隧道连接多台远端 `dsh web` 开发机（HTTP(S) direct 仅默认关闭的高级兼容）。
- CI/发布触发器：`ci.yml` 由 push `main` 与所有 PR 触发；`release.yml` 由 `v*.*.*` tag 推送触发（默认 `test` 渠道 prerelease），亦支持在 tag 上手动 `workflow_dispatch` 指定 `test` / `stable` 渠道。

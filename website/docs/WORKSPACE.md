# 工作区、分支与本机盘构建区（WORKSPACE）

官网源码位于主仓库 `website/`，不单独拆仓。Git 分支、worktree 与集成纪律遵循仓库根目录 [`AGENTS.md`](../../AGENTS.md) 与设备级全局规范；本文仅记录 `website/` 的开发与校验约定。

## 目录布局

```text
~/项目/DSH多设备插件/                    # 仓库 _anchor 空树锚点，禁止在此开发或切分支
~/项目/.wt/DSH多设备插件/<task-slug>/    # 任务 worktree，唯一源码编辑与提交位置
  └─ website/                            # 官网独立 package.json 与 pnpm-lock.yaml
```

`website/` 拥有独立的 `package.json` 与 `pnpm-lock.yaml`，**不并入**主仓库根目录插件包构建，也不会进入插件发布 `.tgz` 白名单（`package.json#files`）。

## 开工三步

```bash
REPO=~/项目/DSH多设备插件
git -C "$REPO" fetch origin --prune
BASE=$(git -C "$REPO" symbolic-ref --quiet --short refs/remotes/origin/HEAD | sed 's|^origin/||')
test "$BASE" = main
~/.local/bin/wt new DSH多设备插件 <task-slug>
```

## 本机盘构建区（严禁向项目卷写 `node_modules` 或 `dist`）

按设备级规范第 5c 与第 8 节，构建前先检查 `${BUILD_SCRATCH_ROOT:-$HOME/.build}` 可用空间 `>= 20G`，将 `website/` 同步至本机盘构建区执行安装、编译与真实无头浏览器验收：

```bash
WT=~/项目/.wt/DSH多设备插件/<task-slug>
SCR="${BUILD_SCRATCH_ROOT:-$HOME/.build}/DSH多设备插件/<task-slug>/website"
df -h "${BUILD_SCRATCH_ROOT:-$HOME/.build}"
mkdir -p "$SCR"
rsync -a --delete --exclude node_modules --exclude dist "$WT/website/" "$SCR/"

cd "$SCR"
pnpm install --frozen-lockfile --ignore-workspace
pnpm rebuild esbuild
SITE_URL="https://dsh-multi.igng.net/" pnpm run build
pnpm run verify
```

- 如需升级或新增官网依赖，在 `$SCR` 中执行后仅将 `package.json` 与 `pnpm-lock.yaml` 同步回 `$WT/website/`；
- `dist/`、`node_modules/` 与验收截图仅留在 `$BUILD_SCRATCH_ROOT`，绝不拷回 worktree；
- 任务合并并执行 `wt done DSH多设备插件 <task-slug>` 后，同步删除本次任务的临时目录 `${BUILD_SCRATCH_ROOT:-$HOME/.build}/DSH多设备插件/<task-slug>`（保留共享 `pnpm-store`）。

## 集成与自动上线

所有改动经 PR 验证通过后 Squash Merge 合入 `origin/main`。合并后 `.github/workflows/website.yml` 自动构建并发布至 Cloudflare Pages 项目 `dsh-multi-website`（<https://dsh-multi.igng.net/>），详见 [`HOSTING.md`](HOSTING.md)。

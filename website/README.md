# dsh-multi-device Official Website (`website/`)

> 正式线上站点：<https://dsh-multi.igng.net/>（Cloudflare Pages Direct Upload 项目 `dsh-multi-website`）· 站点文档见 [`docs/SITE.md`](./docs/SITE.md)、[`docs/HOSTING.md`](./docs/HOSTING.md)、[`docs/WORKSPACE.md`](./docs/WORKSPACE.md)。

Official spatial product showcase and interactive workbench documentation site for **`dsh-multi-device`** (Native Multi-Device Tab Strip & SSH Loopback Workbench for DeepSeek Harness).

## Highlights

1. **3D Multi-Desktop Spatial Convergence (`ConvergenceStage`)**:
   - Four independent DeepSeek Harness windows (`本机`, `ubuntu-dev`, `gpu-a100`, `macos-ci`) suspended in 3D perspective space.
   - Scroll-driven GSAP choreography (with clickable `01 / 02 / 03 / 04` phase navigation) aligns SSH loopback conduits, layers Keep-Alive frames in Z-depth, and magnetically snaps them into one unified Host window with the persistent `42px` native device tab strip.
2. **Hands-On Interactive Workbench (`InteractiveWorkbench`)**:
   - Authentic DeepSeek Harness `--dsw-*` dark theme surfaces, DeepSeek sidebar, trajectory/diff/terminal cards, and `24px`-radius composer.
   - **DOM Keep-Alive**: Switching tabs hides inactive device panes (`display: none; visibility: hidden`) without unmounting — preserving live background streams and per-device composer drafts.
   - **3D Keep-Alive Stack X-Ray**: Tilts the workbench into isometric 3D depth so visitors can inspect all mounted background device frames simultaneously.
   - **Exclusive 3-Tone Attention Capsules**: Strict `pending` (Amber `#f59e0b`) → `running` (Blue `#7aaaff`) → `done` (Green `#22c55e`) urgency order, `tabular-nums` cells, stale dashed ring state, and official translucent `<Menu>` navigation with idempotent unread acknowledgement.
   - **Interactive Approval Flow & Settings Modal**: Live tool approval (`pending` → `running` → `unread`/`idle`), window title summary (`3跑 1待 4结`), and one-click `~/.ssh/config` host import (`prod-arm64`).
3. **Architectural Honesty**:
   - Explicitly documents `system-ssh` loopback forwarding, per-device local reverse proxies, zero remote plugins, zero project file sync, and zero merged session soup.

## Local Scratch Build & Real-Browser Verification

Per device-level repository rules, never write `node_modules/` or `dist/` onto the project checkout. Sync `website/` into your local disk scratch directory (`${BUILD_SCRATCH_ROOT:-$HOME/.build}`) to build and run Playwright browser verification:

```bash
SCRATCH="${BUILD_SCRATCH_ROOT:-$HOME/.build}/DSH多设备插件/website-dev"
mkdir -p "$SCRATCH"
rsync -a --delete --exclude node_modules --exclude dist ./ "$SCRATCH/"
cd "$SCRATCH"

pnpm install --frozen-lockfile --ignore-workspace
pnpm rebuild esbuild
SITE_URL="https://dsh-multi.igng.net/" pnpm run build
pnpm run verify
```

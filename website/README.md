# dsh-multi-device Website

Official product showcase and interactive live workbench for the **dsh-multi-device** DeepSeek Harness (DSH) plugin, deployed at [dsh-multi.igng.net](https://dsh-multi.igng.net/).

## Highlights

- **Authentic DSH Light & Dark themes**: Synced with `@deepseek-ai/dsh-client-ui-theme` tokens, defaulting to system preference (`prefers-color-scheme`) with a `System / Light / Dark` top-bar switcher.
- **Interactive DSH Workbench**: Try multi-device tab switching, `pending / running / done` status capsules, attention popovers, inline command approvals, persistent unsent drafts (Keep-Alive), SSH discovery modal, and a clean 2D *Before vs. With Plugin* toggle.
- **Plain-language onboarding**: 3-step DSH Plugin Manager installation with collapsible CLI commands, troubleshooting checklist, and technical architecture details.

## Development & Verification

All commands should run in a local-disk scratch directory rather than an NAS-mounted worktree (see repository `AGENTS.md`).

```bash
pnpm install --frozen-lockfile --ignore-workspace
SITE_URL=https://dsh-multi.igng.net/ pnpm run build
pnpm run verify
```

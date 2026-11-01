# Release And Deployment Policy

This repository follows the same two-track release discipline as `guanlan-monitor`:

- `main` is the development track. It changes via validated Pull Requests and is not a direct production installation source.
- A version tag `vX.Y.Z` plus its GitHub Release is a verified release package built by GitHub Actions.
- Until the user explicitly requests a "formal stable release" (`stable` channel), a request to "publish a release" publishes a test release (`test` channel, marked as a GitHub `prerelease`).

## Normal Development & Workspace Discipline

1. **Main Directory is a Codeless Anchor (`_anchor`)**:
   - `~/项目/DSH多设备插件` stays on `_anchor` and holds only `.git` and the anchored `AGENTS.md`.
   - All development starts from `origin/main` in an isolated worktree under `~/项目/.wt/DSH多设备插件/<slug>`.
2. **No Build or Dependencies on the Project Volume (`~/项目`)**:
   - Never run `pnpm install` or leave `node_modules` / build artifacts inside `~/项目`.
   - Local inner-loop builds and tests run exclusively inside `$BUILD_SCRATCH_ROOT/DSH多设备插件/<slug>` (`~/.build`, local disk with `>=20G` free space gate).
   - Release artifacts are built and published exclusively by GitHub Actions.

## Version Rules

- The root `VERSION` file is the single source of truth for the release version.
- `package.json` must stay strictly synchronized with `VERSION`.
- `pnpm run verify:version` enforces that `VERSION` is valid SemVer and matches `package.json`.
- Unless explicitly authorized otherwise, only the patch number (`0.2.X`) is incremented.

## Release Steps

1. Update `VERSION` and `package.json` to `X.Y.Z`, and run `pnpm run verify:version`.
2. Merge the release preparation changes into `origin/main` and ensure `.github/workflows/ci.yml` passes.
3. Create and push the annotated version tag from `origin/main`:

   ```bash
   git fetch origin --prune
   git tag -a vX.Y.Z "origin/main" -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```

4. Wait for the tag-triggered `.github/workflows/release.yml` workflow to complete:
   - Verifies `GITHUB_REF_NAME == v$(cat VERSION)` and runs `pnpm run verify:version`.
   - Runs `pnpm run typecheck`, `pnpm run build`, and `pnpm run test`.
   - Packages the installable npm tarball `dsh-multi-device-vX.Y.Z.tgz` and full bundle `dsh-multi-device-bundle-vX.Y.Z.tar.gz` along with `.sha256` checksum files.
   - Publishes the GitHub Release (`prerelease=true` by default on the `test` channel).
5. Verify that the GitHub Release and all `.tgz` / `.tar.gz` / `.sha256` assets are published and non-empty.

## Formal Stable Release

To promote a tested tag `vX.Y.Z` to a formal stable release (`prerelease=false`, `make_latest=true`), dispatch the workflow at that tag:

```bash
gh workflow run "Build and publish release" --ref vX.Y.Z -f channel=stable
```

## Release Asset Names

Every release publishes:

- `dsh-multi-device-vX.Y.Z.tgz` — Standard DSH plugin package installable via `dsh plugin --profile desktop add <url-or-file>` or `dsh plugin --profile web add <url-or-file>`.
- `dsh-multi-device-vX.Y.Z.tgz.sha256` — SHA-256 checksum for the plugin package.
- `dsh-multi-device-bundle-vX.Y.Z.tar.gz` — Complete pre-built bundle archive including source, `lib/`, `cordis.patch.yml`, and documentation.
- `dsh-multi-device-bundle-vX.Y.Z.tar.gz.sha256` — SHA-256 checksum for the bundle archive.

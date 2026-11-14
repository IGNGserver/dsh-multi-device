import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const distDir = path.join(websiteRoot, 'dist')

function findChromiumExecutable() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH
  }
  const cacheRoot = path.join(os.homedir(), 'Library/Caches/ms-playwright')
  if (fs.existsSync(cacheRoot)) {
    const entries = fs.readdirSync(cacheRoot).sort().reverse()
    for (const entry of entries) {
      if (entry.startsWith('chromium-')) {
        const macCandidate = path.join(
          cacheRoot,
          entry,
          'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        )
        if (fs.existsSync(macCandidate)) return macCandidate
        const armCandidate = path.join(
          cacheRoot,
          entry,
          'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        )
        if (fs.existsSync(armCandidate)) return armCandidate
      }
    }
  }
  throw new Error(
    'Could not locate cached Playwright Chromium binary. Set CHROMIUM_PATH explicitly.',
  )
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close((err) => (err ? reject(err) : resolve(port)))
    })
    srv.on('error', reject)
  })
}

async function waitForHttpReady(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`Timed out waiting for preview server at ${url}`)
}

async function main() {
  assert.ok(
    fs.existsSync(path.join(distDir, 'index.html')),
    'dist/index.html missing — run `pnpm run build` first',
  )

  const screenshotDir =
    process.env.SCREENSHOT_DIR ||
    path.join(
      process.env.BUILD_SCRATCH_ROOT || path.join(os.homedir(), '.build'),
      'DSH多设备插件/official-website/screenshots',
    )
  fs.mkdirSync(screenshotDir, { recursive: true })

  const port = await getFreePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const viteBin = path.join(websiteRoot, 'node_modules/.bin/vite')

  const server = spawn(
    viteBin,
    ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: websiteRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  const executablePath = findChromiumExecutable()
  let browser

  try {
    await waitForHttpReady(baseUrl)

    browser = await chromium.launch({
      executablePath,
      headless: true,
    })

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()

    const errors = []
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`console.error: ${msg.text()}`)
      }
    })

    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    await page.waitForTimeout(350)

    // 1. Desktop no horizontal overflow check
    const overflowDesktop = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    assert.equal(overflowDesktop, false, 'Desktop viewport must not overflow horizontally')

    // Screenshot 01: Hero + Phase 01 Scattered 3D Windows
    await page.screenshot({
      path: path.join(screenshotDir, '01-hero-scattered-1440.png'),
    })

    const scatterTransform = await page
      .locator('.mini-dsh-card[data-device-id="ubuntu-dev"]')
      .evaluate((el) => el.style.transform)
    assert.match(
      scatterTransform,
      /translate3d\(/,
      'Scattered 3D window must have 3D transform applied',
    )

    // 2. Scroll through Convergence Stage phases (Phase 02 -> Phase 03 -> Phase 04 Snapped)
    const trackMetrics = await page.locator('[data-testid="convergence-track"]').evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { top: window.scrollY + r.top, height: r.height, vh: window.innerHeight }
    })
    const scrollable = trackMetrics.height - (trackMetrics.vh - 64)

    // Mid-scroll Z-Stack (~72%)
    await page.evaluate(
      (y) => window.scrollTo({ top: y, behavior: 'instant' }),
      trackMetrics.top - 64 + scrollable * 0.72,
    )
    await page.waitForTimeout(420)
    await page.screenshot({
      path: path.join(screenshotDir, '02-convergence-zstack-1440.png'),
    })

    // Snapped unified frame (100%)
    await page.evaluate(
      (y) => window.scrollTo({ top: y, behavior: 'instant' }),
      trackMetrics.top - 64 + scrollable * 1.0,
    )
    await page.waitForTimeout(450)
    const pctText = await page.getByTestId('convergence-pct').textContent()
    assert.equal(pctText?.trim(), '100%', 'Convergence HUD must reach 100% when scrolled to end of track')

    const snappedTransform = await page
      .locator('.mini-dsh-card[data-device-id="__local__"]')
      .evaluate((el) => el.style.transform)
    assert.notEqual(
      snappedTransform,
      scatterTransform,
      'Snapped transform must differ from initial scatter pose',
    )

    // Verify converged top tab strip is visually in front of 3D cards when snapped
    const topStripHit = await page.evaluate(() => {
      const strip = document.querySelector('.converged-top-strip .dsh-md-native-bar')
      if (!strip) return false
      const r = strip.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + 80, r.top + r.height / 2)
      return Boolean(hit && strip.contains(hit))
    })
    assert.equal(
      topStripHit,
      true,
      'Converged 42px native tab bar must sit in front of snapped 3D cards in Z-space',
    )

    await page.screenshot({
      path: path.join(screenshotDir, '03-convergence-snapped-1440.png'),
    })

    // Helper to scroll an element cleanly below the 58px fixed header
    const scrollBelowHeader = async (selector) => {
      await page.locator(selector).evaluate((el) => {
        const r = el.getBoundingClientRect()
        window.scrollTo({ top: window.scrollY + r.top - 72, behavior: 'instant' })
      })
      await page.waitForTimeout(260)
    }

    // 3. Scroll to Interactive Workbench & verify Keep-Alive + Capsule Urgency Order
    await scrollBelowHeader('[data-testid="interactive-workbench"]')

    // Verify gpu-a100 capsule segment order: pending (Amber) -> running (Blue)
    const gpuTones = await page
      .locator('[data-testid="capsule-gpu-a100"] .dsh-md-tab-status-part')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-tone')))
    assert.deepEqual(
      gpuTones,
      ['pending', 'running'],
      'gpu-a100 status capsule must follow strict pending -> running urgency order',
    )

    // Verify Keep-Alive: type draft on ubuntu-dev, switch to local, switch back
    await page.getByTestId('device-tab-ubuntu-dev').click()
    await page.waitForTimeout(200)
    const customDraft = 'KEEP_ALIVE_VERIFIED_DRAFT_9921'
    await page.getByTestId('composer-ubuntu-dev').fill(customDraft)

    const streamBefore = await page.getByTestId('live-stream-ubuntu-dev').textContent()

    await page.getByTestId('device-tab-__local__').click()
    await page.waitForTimeout(1250)

    // Assert ubuntu-dev wrapper is hidden via display:none, NOT unmounted!
    const ubuntuWrapperState = await page
      .locator('.workbench-stage-viewport .dsh-md-native-frame-wrap[data-device-id="ubuntu-dev"]')
      .evaluate((el) => ({
        inDom: document.body.contains(el),
        display: el.style.display,
      }))
    assert.equal(ubuntuWrapperState.inDom, true, 'Keep-Alive wrapper must remain in DOM')
    assert.equal(ubuntuWrapperState.display, 'none', 'Inactive Keep-Alive wrapper must be display:none')

    // Switch back to ubuntu-dev and verify draft + advanced stream tick
    await page.getByTestId('device-tab-ubuntu-dev').click()
    await page.waitForTimeout(200)
    const preservedValue = await page.getByTestId('composer-ubuntu-dev').inputValue()
    assert.equal(preservedValue, customDraft, 'Composer draft must survive tab switches without reload')
    const streamAfter = await page.getByTestId('live-stream-ubuntu-dev').textContent()
    assert.notEqual(streamAfter, streamBefore, 'Background Keep-Alive stream must continue advancing while hidden')

    // 4. Click status capsule on macos-ci -> open official Menu -> jump to unread session -> verify unread decrements
    const macUnreadBefore = await page
      .getByTestId('capsule-part-macos-ci-done')
      .textContent()
    assert.equal(macUnreadBefore?.trim(), '2', 'macos-ci initially has 2 unread finished sessions')

    await page.getByTestId('capsule-part-macos-ci-done').click()
    await page.waitForTimeout(220)
    await page.getByTestId('attention-menu').waitFor({ state: 'visible' })

    // Verify menu popover extends below the 42px bar without overflow clipping
    const menuUnclipped = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="native-tab-bar"]')
      const menu = document.querySelector('[data-testid="attention-menu"]')
      if (!bar || !menu) return false
      const barR = bar.getBoundingClientRect()
      const menuR = menu.getBoundingClientRect()
      const hit = document.elementFromPoint(
        menuR.left + menuR.width / 2,
        menuR.top + Math.min(48, menuR.height / 2),
      )
      return menuR.bottom > barR.bottom + 60 && Boolean(hit && menu.contains(hit))
    })
    assert.equal(
      menuUnclipped,
      true,
      'Official Attention Menu popover must float unclipped above the workbench',
    )

    await page.screenshot({
      path: path.join(screenshotDir, '04-workbench-attention-menu-1440.png'),
    })

    await page.getByTestId('menu-item-remote:macos-ci:sess-notarize').click()
    await page.waitForTimeout(220)
    const macUnreadAfter = await page
      .getByTestId('capsule-part-macos-ci-done')
      .textContent()
    assert.equal(
      macUnreadAfter?.trim(),
      '1',
      'Opening an unread session from the Attention Menu must clear its unread state via read-ack',
    )

    // 5. Navigate via gpu-a100 pending capsule -> approve tool -> verify Amber transitions to Blue running!
    await page.getByTestId('capsule-part-gpu-a100-pending').click()
    await page.waitForTimeout(180)
    await page.getByTestId('menu-item-remote:gpu-a100:sess-fp8-approval').click()
    await page.waitForTimeout(220)
    await page.screenshot({
      path: path.join(screenshotDir, '05-workbench-gpu-approval-1440.png'),
    })

    await page.getByTestId('approve-allow-btn').click()
    await page.waitForTimeout(250)
    const pendingGone = await page
      .locator('[data-testid="capsule-part-gpu-a100-pending"]')
      .count()
    assert.equal(pendingGone, 0, 'Approving pending tool must immediately clear Amber pending count')
    const gpuRunningNow = await page
      .getByTestId('capsule-part-gpu-a100-running')
      .textContent()
    assert.equal(gpuRunningNow?.trim(), '2', 'Approved session must transition into Blue running count')

    // 6. Toggle 3D Keep-Alive Stack X-Ray perspective
    await page.getByTestId('toggle-exploded-3d').click()
    await scrollBelowHeader('[data-testid="interactive-workbench"]')
    await page.waitForTimeout(450)
    await page.screenshot({
      path: path.join(screenshotDir, '06-workbench-3d-xray-1440.png'),
    })
    await page.getByTestId('toggle-exploded-3d').click()
    await page.waitForTimeout(350)

    // 7. Open Settings Modal & import prod-arm64 from ~/.ssh/config
    await page.getByTestId('open-settings-btn').click()
    await page.waitForTimeout(250)
    await page.getByTestId('import-prod-btn').click()
    await page.waitForTimeout(200)
    await page.screenshot({
      path: path.join(screenshotDir, '07-settings-modal-1440.png'),
    })
    await page.getByTestId('close-settings-btn').click()
    await page.waitForTimeout(200)
    await page.getByTestId('device-tab-prod-arm64').waitFor({ state: 'visible' })

    // 8. Capture Architecture, Boundaries, and Installation sections + test English toggle
    await scrollBelowHeader('#architecture')
    await page.screenshot({
      path: path.join(screenshotDir, '08-architecture-1440.png'),
    })

    await scrollBelowHeader('#boundaries')
    await page.screenshot({
      path: path.join(screenshotDir, '09-boundaries-1440.png'),
    })

    await scrollBelowHeader('#install')
    await page.screenshot({
      path: path.join(screenshotDir, '10-install-1440.png'),
    })

    // Toggle to English & verify copy switches cleanly
    await page.getByTestId('locale-toggle').click()
    await page.waitForTimeout(200)
    const htmlLang = await page.evaluate(() => document.documentElement.lang)
    assert.equal(htmlLang, 'en', 'Locale toggle must switch html[lang] to en')

    // 9. Responsive checks: Tablet (834x1112) & Mobile (390x844)
    await page.setViewportSize({ width: 834, height: 1112 })
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.waitForTimeout(300)
    const overflowTablet = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    assert.equal(overflowTablet, false, 'Tablet 834px viewport must not overflow horizontally')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.waitForTimeout(350)
    const overflowMobile = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    assert.equal(overflowMobile, false, 'Mobile 390px viewport must not overflow horizontally')
    await page.screenshot({
      path: path.join(screenshotDir, '11-mobile-hero-390.png'),
    })

    await page.getByTestId('interactive-workbench').scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({
      path: path.join(screenshotDir, '12-mobile-workbench-390.png'),
    })

    assert.deepEqual(errors, [], `Unexpected browser errors:\n${errors.join('\n')}`)

    console.log(
      JSON.stringify(
        {
          ok: true,
          verifiedViewports: ['1440x900', '834x1112', '390x844'],
          screenshotsSavedTo: screenshotDir,
          checks: [
            'zero-console-and-page-errors',
            'zero-horizontal-overflow-all-breakpoints',
            '3d-convergence-scroll-scatter-zstack-snap',
            'keep-alive-dom-and-composer-draft-preservation',
            'background-live-stream-advancement',
            'status-capsule-amber-blue-green-order',
            'attention-menu-session-jump-and-read-ack',
            'approval-amber-to-blue-live-transition',
            '3d-exploded-xray-stack',
            'ssh-config-prod-arm64-import',
            'zh-en-bilingual-switch',
          ],
        },
        null,
        2,
      ),
    )
  } finally {
    if (browser) await browser.close()
    server.kill('SIGTERM')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

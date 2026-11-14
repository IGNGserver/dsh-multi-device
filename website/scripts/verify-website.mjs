import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const DIST_DIR = path.join(ROOT_DIR, 'dist')
const SHOT_DIR =
  process.env.SCREENSHOT_DIR ||
  process.env.WEBSITE_VERIFY_SCREENSHOT_DIR ||
  path.join(os.tmpdir(), 'dsh-multi-website-verify-shots')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

function findChromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  }
  const bundled = chromium.executablePath()
  if (bundled && fs.existsSync(bundled)) {
    return bundled
  }

  const cacheDirs = [
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
    path.join(os.homedir(), '.cache', 'ms-playwright'),
    '/ms-playwright',
  ]
  for (const dir of cacheDirs) {
    if (!fs.existsSync(dir)) continue
    const entries = fs
      .readdirSync(dir)
      .filter((name) => name.startsWith('chromium'))
      .sort()
      .reverse()
    for (const entry of entries) {
      const candidates = [
        path.join(
          dir,
          entry,
          'chrome-mac-arm64',
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing',
        ),
        path.join(
          dir,
          entry,
          'chrome-mac-x64',
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing',
        ),
        path.join(dir, entry, 'chrome-linux64', 'chrome'),
        path.join(dir, entry, 'chrome-linux', 'chrome'),
      ]
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return candidate
        }
      }
    }
  }
  throw new Error('Could not locate a Playwright Chromium binary.')
}

function assertDistIntegrity() {
  const required = [
    'index.html',
    '404.html',
    'robots.txt',
    'sitemap.xml',
    'favicon.svg',
    'apple-touch-icon.png',
    path.join('og', 'og.png'),
  ]
  for (const rel of required) {
    const full = path.join(DIST_DIR, rel)
    assert.ok(fs.existsSync(full), `Missing build artifact: dist/${rel}`)
  }

  const indexHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8')
  assert.ok(
    indexHtml.includes('<meta name="msvalidate.01" content="B411826ACAE5C5CD20EA5574C3F8A6E4"'),
    'index.html must retain msvalidate.01 verification tag',
  )
  assert.ok(
    indexHtml.includes('<link rel="canonical" href="https://dsh-multi.igng.net/"'),
    'index.html must retain canonical URL',
  )
  assert.ok(
    indexHtml.includes('https://dsh-multi.igng.net/og/og.png'),
    'index.html must retain OpenGraph image URL',
  )
  assert.ok(
    !/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|unpkg\.com/.test(indexHtml),
    'index.html must not load external CDN fonts or scripts',
  )
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url || '/').split('?')[0]
      let target = path.join(DIST_DIR, reqPath === '/' ? 'index.html' : reqPath)
      if (!target.startsWith(DIST_DIR)) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }
      if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        target = path.join(DIST_DIR, 'index.html')
      }
      const ext = path.extname(target)
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
      fs.createReadStream(target).pipe(res)
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      assert.ok(addr && typeof addr === 'object')
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` })
    })
  })
}

async function main() {
  assertDistIntegrity()
  fs.mkdirSync(SHOT_DIR, { recursive: true })

  const { server, url } = await startStaticServer()
  const executablePath = findChromiumExecutable()
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    const consoleErrors = []
    const pageErrors = []

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
    })
    const page = await context.newPage()
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    page.on('pageerror', (err) => {
      pageErrors.push(err.message)
    })

    await page.goto(url, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="interactive-workbench"]').waitFor({ state: 'visible' })

    // 1. Verify default light theme follows system light
    const lightState = await page.evaluate(() => ({
      themeAttr: document.documentElement.dataset.theme,
      darkBodyAttr: document.body.getAttribute('data-ds-dark-theme'),
      bg: getComputedStyle(document.body).backgroundColor,
    }))
    assert.equal(lightState.themeAttr, 'light')
    assert.equal(lightState.darkBodyAttr, null)
    assert.equal(lightState.bg, 'rgb(255, 255, 255)')

    // Ensure all 3 disclosure panels default closed
    for (const id of ['details-cli', 'details-checklist', 'details-architecture']) {
      const expanded = await page.getAttribute(`[data-testid="${id}"]`, 'aria-expanded')
      assert.equal(expanded, 'false', `${id} must be closed by default`)
    }

    await page.screenshot({ path: path.join(SHOT_DIR, '01-light-desktop.png'), fullPage: false })
    await page.screenshot({ path: path.join(SHOT_DIR, '07-fullpage-light.png'), fullPage: true })

    // 2. Live OS dark mode follow test
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.theme === 'dark' &&
        getComputedStyle(document.body).backgroundColor === 'rgb(21, 21, 23)',
    )
    const darkState = await page.evaluate(() => ({
      themeAttr: document.documentElement.dataset.theme,
      darkBodyAttr: document.body.getAttribute('data-ds-dark-theme'),
      bg: getComputedStyle(document.body).backgroundColor,
    }))
    assert.equal(darkState.themeAttr, 'dark')
    assert.equal(darkState.darkBodyAttr, 'true')
    assert.equal(darkState.bg, 'rgb(21, 21, 23)')
    await page.screenshot({ path: path.join(SHOT_DIR, '02-dark-desktop.png'), fullPage: false })

    // 3. Explicit Light theme persistence across reload
    await page.click('[data-testid="theme-opt-light"]')
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.theme === 'light' &&
        getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)',
    )
    await page.reload({ waitUntil: 'networkidle' })
    const persistedTheme = await page.evaluate(() => ({
      stored: localStorage.getItem('dsh-md-site-theme'),
      themeAttr: document.documentElement.dataset.theme,
    }))
    assert.equal(persistedTheme.stored, 'light')
    assert.equal(persistedTheme.themeAttr, 'light')

    // Restore system mode (dark emulated right now) and back to light for interaction checks
    await page.click('[data-testid="theme-opt-system"]')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')

    // 4. Before vs After 2D mode switch + click-to-dock
    await page.click('[data-testid="mode-scattered"]')
    await page.locator('[data-testid="scattered-stage"]').waitFor({ state: 'visible' })
    await page.screenshot({ path: path.join(SHOT_DIR, '03-scattered-grid.png'), fullPage: false })
    await page.click('[data-testid="scattered-card-gpu-a100"]')
    await page.locator('[data-testid="interactive-workbench"]').waitFor({ state: 'visible' })
    assert.equal(
      await page.getAttribute('[data-testid="device-tab-gpu-a100"]', 'aria-selected'),
      'true',
    )

    // 5. Keep-Alive draft preservation + background stream completion
    await page.click('[data-testid="device-tab-ubuntu-dev"]')
    await page.fill('[data-testid="composer-ubuntu-dev"]', 'KeepAlive check text')
    await page.click('[data-testid="device-tab-__local__"]')
    assert.equal(
      await page.locator('[data-testid="composer-ubuntu-dev"]').count(),
      1,
      'ubuntu-dev composer should stay mounted in DOM while inactive',
    )
    await page.click('[data-testid="device-tab-ubuntu-dev"]')
    assert.equal(
      await page.inputValue('[data-testid="composer-ubuntu-dev"]'),
      'KeepAlive check text',
    )
    await page.fill('[data-testid="composer-ubuntu-dev"]', 'Run quick check')
    await page.press('[data-testid="composer-ubuntu-dev"]', 'Enter')
    await page.click('[data-testid="device-tab-__local__"]')
    await page.waitForTimeout(1000)
    await page.click('[data-testid="device-tab-ubuntu-dev"]')
    const streamText = await page.textContent('[data-testid="live-stream-ubuntu-dev"]')
    assert.ok(
      streamText && streamText.includes('检查完成'),
      'background stream should complete while tab was inactive',
    )

    // 6. Attention capsule & read-ack (macos-ci: 2 -> 1)
    assert.equal(
      await page.textContent('[data-testid="capsule-part-macos-ci-done"]'),
      '2',
    )
    await page.click('[data-testid="capsule-macos-ci"]')
    await page.locator('[data-testid="attention-menu"]').waitFor({ state: 'visible' })
    await page.click('[data-testid="menu-item-remote:macos-ci:sess-notarize"]')
    assert.equal(
      await page.getAttribute('[data-testid="device-tab-macos-ci"]', 'aria-selected'),
      'true',
    )
    assert.equal(
      await page.textContent('[data-testid="capsule-part-macos-ci-done"]'),
      '1',
    )

    // 7. Approval action on gpu-a100 (pending: 1, running: 1 -> pending: 0, running: 2)
    await page.click('[data-testid="device-tab-gpu-a100"]')
    assert.equal(
      await page.textContent('[data-testid="capsule-part-gpu-a100-pending"]'),
      '1',
    )
    assert.equal(
      await page.textContent('[data-testid="capsule-part-gpu-a100-running"]'),
      '1',
    )
    await page.click('[data-testid="approve-allow-btn"]')
    assert.equal(await page.locator('[data-testid="capsule-part-gpu-a100-pending"]').count(), 0)
    assert.equal(
      await page.textContent('[data-testid="capsule-part-gpu-a100-running"]'),
      '2',
    )

    // 8. Settings modal & import prod-arm64
    await page.click('[data-testid="open-settings-btn"]')
    await page.locator('[data-testid="settings-modal"]').waitFor({ state: 'visible' })
    await page.screenshot({ path: path.join(SHOT_DIR, '04-settings-modal.png'), fullPage: false })
    await page.click('[data-testid="import-prod-btn"]')
    await page.locator('[data-testid="device-tab-prod-arm64"]').waitFor({ state: 'visible' })
    await page.click('[data-testid="close-settings-btn"]')

    // 9. Disclosure panels open on demand & bilingual toggle
    for (const id of ['details-cli', 'details-checklist', 'details-architecture']) {
      await page.click(`[data-testid="${id}"]`)
      assert.equal(await page.getAttribute(`[data-testid="${id}"]`, 'aria-expanded'), 'true')
    }
    await page.click('[data-testid="locale-toggle"]')
    assert.equal(await page.getAttribute('html', 'lang'), 'en')
    const h1Text = await page.textContent('h1')
    assert.ok(h1Text && h1Text.includes('Manage every dev machine'))
    await page.click('[data-testid="locale-toggle"]')
    assert.equal(await page.getAttribute('html', 'lang'), 'zh-CN')

    // 10. Responsive viewports & zero horizontal overflow check
    const viewports = [
      { width: 1440, height: 900, name: 'desktop' },
      { width: 834, height: 1112, name: 'tablet' },
      { width: 390, height: 844, name: 'mobile' },
    ]
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      const overflow = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      }))
      assert.ok(
        overflow.scrollW <= overflow.innerW,
        `${vp.name} (${vp.width}px) has horizontal overflow: ${overflow.scrollW} > ${overflow.innerW}`,
      )
      if (vp.name === 'mobile') {
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({
          path: path.join(SHOT_DIR, '05-mobile-light.png'),
          fullPage: true,
        })
        await page.emulateMedia({ colorScheme: 'dark' })
        await page.waitForFunction(
          () =>
            document.documentElement.dataset.theme === 'dark' &&
            getComputedStyle(document.body).backgroundColor === 'rgb(21, 21, 23)',
        )
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({
          path: path.join(SHOT_DIR, '06-mobile-dark.png'),
          fullPage: true,
        })
      }
    }

    // 11. Zero runtime errors
    assert.deepEqual(pageErrors, [], `Uncaught page errors: ${pageErrors.join('; ')}`)
    assert.deepEqual(consoleErrors, [], `Console errors: ${consoleErrors.join('; ')}`)

    console.log(`Website verification passed. Screenshots written to: ${SHOT_DIR}`)
    await context.close()
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

/**
 * Cross-platform adaptation regression tests:
 * - macOS Plan A unified title/tab bar, Windows titlebar, Linux, and Web geometry
 * - Real DSH 0.2 `sidebar.settings` `entry.store` lookup & scrollable fallback modal
 * - Valid DSH CSS design tokens, pref-row alignment, drawer/leading/fullscreen offsets
 * - `DshSelect` viewport-aware upward flip, compact clamping, and keyboard navigation
 * - `setUiPreferences` end-to-end persistence of `maxKeepAlivePages` & `keepAliveIdleMinutes`
 * - macOS SSH `ControlPath` 104B `sun_path` safety + Windows `windowsHide: true` & key permissions
 * - Native bridge clipboard native-first ordering and proxy status page `md_theme` sync
 */
import { EventEmitter } from 'node:events'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import vm from 'node:vm'
import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceId } from '../src/contract.ts'
import {
  DARWIN_TRAFFIC_LIGHT_INSET_START,
  DEFAULT_BAR_INSET_START,
  NATIVE_BAR_HEIGHT,
  resolvePlatformBarChrome,
} from '../src/client/barMetrics.ts'
import { DshSelect, resolveSelectDropdownPosition } from '../src/client/DshSelect.tsx'
import { openSettingsSection, type ClientContextLike } from '../src/client/index.tsx'
import { zh, type MultiDeviceLocaleKey } from '../src/client/locales.ts'
import { NativeOverlay } from '../src/client/NativeOverlay.tsx'
import { clientStore } from '../src/client/state.ts'
import { DeviceAuthManager } from '../src/host/auth.ts'
import { NATIVE_BRIDGE_SCRIPT } from '../src/host/native-bridge.ts'
import { NativeDeviceProxy } from '../src/host/native-proxy.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import { listLocalSshKeys } from '../src/host/ssh-config.ts'
import {
  SSH_CONTROL_PATH_MAX_BYTES,
  execSshCommand,
  expandedSshControlPathBytes,
  resetSshControlPathCacheForTest,
  resolveSshControlPath,
  setSshSpawn,
  sshControlMultiplexArgs,
} from '../src/host/tunnel.ts'
import { MultiDeviceControlPlane } from '../src/runtime.ts'

const t = (key: MultiDeviceLocaleKey): string => (zh as Record<string, string>)[key] ?? key

const tempDirs: string[] = []
const disposers: (() => void)[] = []
const renderers: ReactTestRenderer[] = []

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const renderer of renderers.splice(0)) act(() => renderer.unmount())
  for (const dispose of disposers.splice(0).reverse()) dispose()
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  setSshSpawn(null)
  resetSshControlPathCacheForTest()
  clientStore.setSettingsModalOpen(false)
  vi.restoreAllMocks()
})

describe('1. Cross-platform device tab bar chrome solver (Plan A)', () => {
  it('places the 42px tab bar at y=0 with 80px traffic-light inset on windowed macOS Desktop', () => {
    const chrome = resolvePlatformBarChrome({
      platform: 'darwin',
      hasWindowsTitlebar: false,
      fullscreen: false,
      chromeTop: 0,
    })
    expect(chrome).toEqual({
      kind: 'darwin-windowed',
      barTop: 0,
      insetStart: DARWIN_TRAFFIC_LIGHT_INSET_START,
      frameReserveTop: NATIVE_BAR_HEIGHT,
      overlayTop: NATIVE_BAR_HEIGHT + 12,
      barDraggable: true,
    })
  })

  it('shrinks the macOS Desktop leading inset back to 12px in native fullscreen', () => {
    const chrome = resolvePlatformBarChrome({
      platform: 'darwin',
      hasWindowsTitlebar: false,
      fullscreen: true,
      chromeTop: 0,
    })
    expect(chrome).toEqual({
      kind: 'darwin-fullscreen',
      barTop: 0,
      insetStart: DEFAULT_BAR_INSET_START,
      frameReserveTop: NATIVE_BAR_HEIGHT,
      overlayTop: NATIVE_BAR_HEIGHT + 12,
      barDraggable: false,
    })
  })

  it('offsets the tab bar below the custom Windows titlebar while windowed and resets in fullscreen', () => {
    const windowed = resolvePlatformBarChrome({
      platform: 'win32',
      hasWindowsTitlebar: true,
      fullscreen: false,
      chromeTop: 36,
    })
    expect(windowed).toEqual({
      kind: 'windows-titlebar',
      barTop: 36,
      insetStart: DEFAULT_BAR_INSET_START,
      frameReserveTop: 78,
      overlayTop: 90,
      barDraggable: false,
    })

    const fullscreen = resolvePlatformBarChrome({
      platform: 'win32',
      hasWindowsTitlebar: true,
      fullscreen: true,
      chromeTop: 36,
    })
    expect(fullscreen).toEqual({
      kind: 'windows-fullscreen',
      barTop: 0,
      insetStart: DEFAULT_BAR_INSET_START,
      frameReserveTop: NATIVE_BAR_HEIGHT,
      overlayTop: NATIVE_BAR_HEIGHT + 12,
      barDraggable: false,
    })
  })

  it('keeps Linux Desktop and browser Web unified at y=0 with 12px leading inset', () => {
    for (const platform of [undefined, 'linux']) {
      const chrome = resolvePlatformBarChrome({
        platform,
        hasWindowsTitlebar: false,
        fullscreen: false,
        chromeTop: 0,
      })
      expect(chrome).toEqual({
        kind: 'standard',
        barTop: 0,
        insetStart: DEFAULT_BAR_INSET_START,
        frameReserveTop: NATIVE_BAR_HEIGHT,
        overlayTop: NATIVE_BAR_HEIGHT + 12,
        barDraggable: false,
      })
    }
  })
})

describe('2. Settings entry lookup and scrollable fallback modal', () => {
  it('opens native DSH Settings via real SlotCore entry.store.create().actions.openSection', () => {
    const opened: string[] = []
    const ctx = {
      effect: () => {},
      inject: () => {},
      locale: { register: () => () => {} },
      slots: {
        inject: () => () => {},
        register: () => () => {},
        entries: (name: string) =>
          name === 'sidebar.settings'
            ? [{ store: { create: () => ({ actions: { openSection: (id: string) => opened.push(id) } }) } }]
            : [],
      },
    } as unknown as ClientContextLike

    expect(openSettingsSection(ctx, 'multi-device')).toBe(true)
    expect(opened).toEqual(['multi-device'])
    expect(clientStore.getSnapshot().settingsModalOpen).toBe(false)
  })

  it('also supports direct entry.store.actions.openSection and falls back to modal when absent', () => {
    const opened: string[] = []
    const directCtx = {
      effect: () => {},
      inject: () => {},
      locale: { register: () => () => {} },
      slots: {
        inject: () => () => {},
        register: () => () => {},
        entries: (name: string) =>
          name === 'sidebar.settings'
            ? [{ store: { actions: { openSection: (id: string) => opened.push(id) } } }]
            : [],
      },
    } as unknown as ClientContextLike

    expect(openSettingsSection(directCtx)).toBe(true)
    expect(opened).toEqual(['multi-device'])

    const missingCtx = {
      ...directCtx,
      slots: { ...directCtx.slots, entries: () => [] },
    } as unknown as ClientContextLike
    expect(openSettingsSection(missingCtx)).toBe(false)
    expect(clientStore.getSnapshot().settingsModalOpen).toBe(true)
  })

  it('renders fallback Modal with bounded height class and scrollable contentClassName', () => {
    clientStore.setSettingsModalOpen(true)
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(<NativeOverlay t={t} onOpenSettings={() => {}} />)
    })
    renderers.push(renderer)

    const dialog = renderer.root.findByProps({ role: 'dialog' })
    expect(dialog.props.className).toBe('dsh-md-fallback-modal')
    const scrollContainer = dialog.findByProps({ className: 'dsh-md-fallback-modal-content' })
    expect(scrollContainer).toBeDefined()
  })
})

describe('3. Stylesheet token validity and cross-platform layout invariants', () => {
  const styles = readFileSync(join(process.cwd(), 'src/client/styles.ts'), 'utf8')

  it('uses only valid DSH tokens and eliminates all 5 non-existent token names', () => {
    for (const badToken of [
      '--dsw-alias-interactive-bg-selected',
      '--dsw-alias-bg-layer-4',
      '--dsw-font-family-mono',
      '--dsw-alias-state-success-label',
      '--dsw-alias-interactive-bg-hover-warning',
    ]) {
      expect(styles, `unexpected non-existent DSH token ${badToken}`).not.toContain(badToken)
    }
    expect(styles).toContain('--ds-font-family-code')
    expect(styles).toContain('--dsw-alias-interactive-bg-active')
    expect(styles).toContain('--dsw-alias-state-warn-tertiary')
    expect(styles).toContain('--dsw-alias-state-success-primary')
  })

  it('implements macOS Plan A topbar, overlay compensation, drawer/leading offsets, and scrollable fallback modal', () => {
    expect(styles).toContain("--dsh-md-native-bar-top: 0px;")
    expect(styles).toContain("--dsh-md-native-bar-inset-start: 80px;")
    expect(styles).not.toContain("--dsh-md-native-bar-top: var(--dsh-frame-top-clearance, 48px);")
    expect(styles).toContain("html.dsh-md-active")
    expect(styles).toContain("--dsh-frame-overlay-top: calc(var(--dsh-md-native-bar-top) + var(--dsh-md-native-bar-height) + 12px);")
    expect(styles).toContain(".dsh-md-frame-native[data-md-remote-active='true'] > [data-shell-leading]")
    expect(styles).toContain(".dsh-md-frame-native[data-sidebar-drawer] > [data-sidebar-mask]")
    expect(styles).toContain("--dsh-dockkit-strip-inline-start: 10px;")
    expect(styles).toMatch(/\.dsh-md-native-bar\s*\{[^}]*z-index:\s*80;/s)
    expect(styles).toMatch(/\.dsh-md-fallback-modal\s*\{[^}]*max-height:/s)
    expect(styles).toMatch(/\.dsh-md-fallback-modal-content\s*\{[^}]*overflow-y:\s*auto;/s)
    expect(styles).toMatch(/\.dsh-md-pref-text\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;/s)
  })
})

describe('4. DshSelect viewport placement and keyboard interaction', () => {
  it('opens downward when space permits and flips upward near the viewport bottom', () => {
    const downward = resolveSelectDropdownPosition({
      triggerRect: { left: 100, right: 260, top: 120, bottom: 152, width: 160 },
      viewportWidth: 1024,
      viewportHeight: 768,
      safeTop: 54,
      optionCount: 5,
    })
    expect(downward.placement).toBe('bottom')
    expect(downward.top).toBe(156)
    expect(downward.left).toBe(100)

    const upward = resolveSelectDropdownPosition({
      triggerRect: { left: 100, right: 260, top: 700, bottom: 732, width: 160 },
      viewportWidth: 1024,
      viewportHeight: 768,
      safeTop: 54,
      optionCount: 6,
    })
    expect(upward.placement).toBe('top')
    expect(upward.bottom).toBe(72)
    expect(upward.maxHeight).toBe(240)
  })

  it('right-aligns compact selects and clamps within narrow viewports', () => {
    const compactPos = resolveSelectDropdownPosition({
      triggerRect: { left: 260, right: 380, top: 200, bottom: 228, width: 120 },
      viewportWidth: 390,
      viewportHeight: 700,
      compact: true,
      optionCount: 3,
    })
    expect(compactPos.placement).toBe('bottom')
    expect(compactPos.right).toBe(12)
    expect(compactPos.left).toBeUndefined()
    expect(compactPos.minWidth).toBe(120)
  })

  it('supports ArrowDown/ArrowUp/Enter keyboard selection', () => {
    const changes: string[] = []
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <DshSelect
          value="a"
          options={[
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta', disabled: true },
            { value: 'c', label: 'Gamma' },
          ]}
          onChange={v => changes.push(v)}
          ariaLabel="Pick option"
        />,
      )
    })
    renderers.push(renderer)

    const trigger = renderer.root.findByProps({ role: 'combobox' })
    act(() => {
      trigger.props.onKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() })
    })
    expect(renderer.root.findByProps({ role: 'listbox' })).toBeDefined()

    // ArrowDown from 'a' skips disabled 'b' and highlights 'c'.
    act(() => {
      trigger.props.onKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() })
    })
    act(() => {
      trigger.props.onKeyDown({ key: 'Enter', preventDefault: vi.fn() })
    })

    expect(changes).toEqual(['c'])
    expect(renderer.root.findAllByProps({ role: 'listbox' })).toHaveLength(0)
  })
})

describe('5. setUiPreferences persists keep-alive settings end-to-end', () => {
  it('forwards maxKeepAlivePages and keepAliveIdleMinutes through runtime control-plane to disk', async () => {
    const dir = makeTempDir('dsh-md-prefs-')
    const dataFile = join(dir, 'data.json')
    const secretsFile = join(dir, 'secrets.json')
    const registry = new DeviceRegistry(
      dataFile,
      secretsFile,
      { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() },
      { enableNativeProxy: false, enableTunnels: false },
    )
    disposers.push(() => registry.dispose())
    const controlPlane = new MultiDeviceControlPlane(registry)

    const res = await controlPlane.dispatch({
      action: 'setUiPreferences',
      payload: { maxKeepAlivePages: 3, keepAliveIdleMinutes: 60 },
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      const snap = res.value as { ui?: { maxKeepAlivePages?: number; keepAliveIdleMinutes?: number } }
      expect(snap.ui?.maxKeepAlivePages).toBe(3)
      expect(snap.ui?.keepAliveIdleMinutes).toBe(60)
    }

    // Re-open from disk to prove persistence survived serialization.
    const reloaded = new DeviceRegistry(
      dataFile,
      secretsFile,
      { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() },
      { enableNativeProxy: false, enableTunnels: false },
    )
    disposers.push(() => reloaded.dispose())
    expect(reloaded.snapshot().ui?.maxKeepAlivePages).toBe(3)
    expect(reloaded.snapshot().ui?.keepAliveIdleMinutes).toBe(60)
  })
})

describe('6. Cross-platform SSH ControlPath, windowsHide, and key permission checks', () => {
  it('rejects macOS-length TMPDIR paths exceeding 104B sun_path and falls back to a short 0700 dir', () => {
    const longDarwinTmp = '/var/folders/br/kpj4m_vx6hjd_s9bwvmlzsmh0000gn/T'
    const badCandidate = join(longDarwinTmp, 'dsh-md-501', 'cm-%C')
    expect(expandedSshControlPathBytes(badCandidate)).toBeGreaterThan(SSH_CONTROL_PATH_MAX_BYTES)

    if (process.platform !== 'win32') {
      const resolved = resolveSshControlPath({ baseDirs: [longDarwinTmp, '/tmp'] })
      expect(resolved).not.toBeNull()
      expect(resolved!.startsWith('/tmp/')).toBe(true)
      expect(expandedSshControlPathBytes(resolved!)).toBeLessThanOrEqual(SSH_CONTROL_PATH_MAX_BYTES)
      expect(statSync(dirname(resolved!)).mode & 0o777).toBe(0o700)

      resetSshControlPathCacheForTest()
      const muxArgs = sshControlMultiplexArgs()
      const controlPathArg = muxArgs.find(arg => arg.startsWith('ControlPath='))
      expect(controlPathArg).toBeDefined()
      const template = controlPathArg!.slice('ControlPath='.length)
      expect(expandedSshControlPathBytes(template)).toBeLessThanOrEqual(SSH_CONTROL_PATH_MAX_BYTES)
    }
  })

  it('passes windowsHide: true when spawning system ssh', async () => {
    let seenOptions: { windowsHide?: boolean } | undefined
    setSshSpawn(((_cmd, _args, opts) => {
      seenOptions = opts
      const child = new EventEmitter() as any
      child.stdout = Object.assign(new EventEmitter(), { destroy: vi.fn() })
      child.stderr = Object.assign(new EventEmitter(), { destroy: vi.fn() })
      child.kill = vi.fn()
      setTimeout(() => {
        child.stdout.emit('data', Buffer.from('ok'))
        child.emit('exit', 0)
      }, 2)
      return child
    }) as any)

    const res = await execSshCommand({ kind: 'ssh', host: 'win-test', engine: 'system-ssh' }, 'echo ok', 2_000)
    expect(res).toEqual({ ok: true, stdout: 'ok' })
    expect(seenOptions?.windowsHide).toBe(true)
  })

  it('does not flag POSIX mode 0666 SSH keys as permissionsTooOpen on win32', () => {
    const fakeHome = makeTempDir('dsh-md-keys-')
    const sshDir = join(fakeHome, '.ssh')
    mkdirSync(sshDir, { recursive: true })
    const keyPath = join(sshDir, 'id_ed25519')
    writeFileSync(keyPath, '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----\n')
    if (process.platform !== 'win32') {
      chmodSync(keyPath, 0o644)
      const posixKeys = listLocalSshKeys(fakeHome, 'darwin')
      expect(posixKeys).toHaveLength(1)
      expect(posixKeys[0]!.permissionsTooOpen).toBe(true)
    }

    const winKeys = listLocalSshKeys(fakeHome, 'win32')
    expect(winKeys).toHaveLength(1)
    expect(winKeys[0]!.permissionsTooOpen).toBe(false)
  })
})

describe('7. Bridge clipboard fallback order and proxy status page theme sync', () => {
  it('tries native Clipboard.prototype.writeText before falling back to execCommand("copy")', async () => {
    const callOrder: string[] = []
    let nativeShouldReject = false

    class FakeClipboard {
      writeText(text: string): Promise<void> {
        callOrder.push(`native:${text}`)
        if (nativeShouldReject) return Promise.reject(new Error('NotAllowedError'))
        return Promise.resolve()
      }
    }

    const fakeDoc = {
      currentScript: { src: 'http://127.0.0.1:41234/__md/bridge.js?device=dev-1' },
      visibilityState: 'visible',
      title: 'DSH',
      body: {
        appendChild: () => {},
      },
      createElement: () => ({
        style: {},
        setAttribute: () => {},
        focus: () => {},
        select: () => {},
        setSelectionRange: () => {},
        remove: () => {},
      }),
      execCommand: (cmd: string) => {
        callOrder.push(`execCommand:${cmd}`)
        return true
      },
      addEventListener: () => {},
      querySelector: () => null,
      getSelection: () => null,
    }
    const sandbox: Record<string, unknown> = {
      window: undefined,
      self: undefined,
      document: fakeDoc,
      location: { protocol: 'http:', host: '127.0.0.1:41234', search: '?device=dev-1', href: 'http://127.0.0.1:41234/?device=dev-1' },
      navigator: { clipboard: new FakeClipboard() },
      Clipboard: FakeClipboard,
      URL,
      URLSearchParams,
      Promise,
      setTimeout: () => 0,
      clearTimeout: () => {},
      setInterval: () => 0,
      clearInterval: () => {},
      WebSocket: class { addEventListener() {} close() {} send() {} },
      MutationObserver: class { observe() {} disconnect() {} },
      IntersectionObserver: class { observe() {} disconnect() {} },
    }
    sandbox.window = sandbox
    sandbox.self = sandbox
    ;(sandbox as any).addEventListener = () => {}

    vm.runInNewContext(NATIVE_BRIDGE_SCRIPT, sandbox)
    const clip = (sandbox.navigator as { clipboard: FakeClipboard }).clipboard

    await clip.writeText('hello')
    expect(callOrder).toEqual(['native:hello'])

    callOrder.length = 0
    nativeShouldReject = true
    await clip.writeText('fallback-text')
    expect(callOrder).toEqual(['native:fallback-text', 'execCommand:copy'])
  })

  it('honors md_theme=dark|light query hint on proxy status pages and falls back to prefers-color-scheme', async () => {
    const proxy = new NativeDeviceProxy(
      {
        id: DeviceId('dev-theme'),
        name: 'theme-device',
        enabled: true,
        transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:1' },
        auth: { mode: 'none' },
      },
      () => undefined,
      new DeviceAuthManager(),
    )
    disposers.push(() => { void proxy.stop() })
    await proxy.start()
    const base = new URL(proxy.proxyUrl()!).origin

    const darkHtml = await (await fetch(`${base}/?md_theme=dark`)).text()
    expect(darkHtml).toContain('data-theme="dark"')
    expect(darkHtml).toContain('<meta name="color-scheme" content="dark" />')

    const lightHtml = await (await fetch(`${base}/?md_theme=light`)).text()
    expect(lightHtml).toContain('data-theme="light"')
    expect(lightHtml).toContain('<meta name="color-scheme" content="light" />')

    const autoHtml = await (await fetch(`${base}/`)).text()
    expect(autoHtml).toContain('<html lang="zh-CN">')
    expect(autoHtml).toContain('<meta name="color-scheme" content="light dark" />')
  })
})

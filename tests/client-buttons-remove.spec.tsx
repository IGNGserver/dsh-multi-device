/**
 * Regression tests for icon-only buttons (`size="icon"` CSS collapse) and
 * the device removal flow from both the device row and the expanded editor.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DeviceId,
  type DeviceView,
  type MultiDeviceSnapshot,
} from '../src/contract.ts'
import { zh, type MultiDeviceLocaleKey } from '../src/client/locales.ts'

const mock = vi.hoisted(() => ({
  state: {} as {
    snapshot: MultiDeviceSnapshot
    loading: boolean
    activeNativeDeviceId?: DeviceId
    keepAliveDeviceIds: readonly DeviceId[]
    reloadCounters: Readonly<Record<string, number>>
    settingsModalOpen: boolean
  },
  removeDevice: vi.fn(async () => ({ ok: true as const }) as { ok: boolean; error?: string }),
  releaseKeepAliveDevice: vi.fn(),
  reloadNativeDevice: vi.fn(),
  selectNativeDevice: vi.fn(async () => ({ ok: true })),
  selectLocalNativeTab: vi.fn(),
  reconnectDevice: vi.fn(async () => ({ ok: true })),
  markDeviceRead: vi.fn(async () => ({ ok: true, changed: 1 })),
  listSshKeys: vi.fn(async () => []),
  setUiPreferences: vi.fn(async () => ({ ok: true })),
}))

vi.mock('../src/client/state.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/state.ts')>()
  return {
    ...actual,
    useMultiDeviceState: () => mock.state,
    deviceStateToDotState: () => 'done' as const,
    clientStore: {
      getSnapshot: () => mock.state,
      removeDevice: mock.removeDevice,
      releaseKeepAliveDevice: mock.releaseKeepAliveDevice,
      reloadNativeDevice: mock.reloadNativeDevice,
      selectNativeDevice: mock.selectNativeDevice,
      selectLocalNativeTab: mock.selectLocalNativeTab,
      reconnectDevice: mock.reconnectDevice,
      markDeviceRead: mock.markDeviceRead,
      listSshKeys: mock.listSshKeys,
      setUiPreferences: mock.setUiPreferences,
    },
  }
})

vi.mock('../src/client/clientServices.ts', () => ({
  getClientServices: () => ({}),
  useSessionListSnapshot: () => ({ ids: [], byId: {} }),
}))

import { MultiDeviceHubPanel } from '../src/client/MultiDeviceHubPanel.tsx'
import { NativeTabBar } from '../src/client/NativeViewport.tsx'

const t = (key: MultiDeviceLocaleKey): string => (zh as Record<string, string>)[key] ?? key
const devId = DeviceId('dev-a')

function makeDevice(over: Partial<DeviceView> = {}): DeviceView {
  return {
    id: devId,
    name: 'ubuntu-dev',
    enabled: true,
    state: 'connected',
    transportKind: 'ssh',
    targetSummary: 'ssh://ubuntu-dev:3080',
    keepNativeAlive: true,
    protocolVersion: '0.2',
    realtime: true,
    reconnectAttempt: 0,
    sessionCount: 1,
    runningSessionCount: 0,
    pendingApprovalCount: 0,
    workspaceCount: 1,
    ssh: {
      host: 'ubuntu-dev',
      remotePort: 3080,
      bootstrapFromRemoteCredentials: true,
      engine: 'auto',
    },
    ...over,
  } as DeviceView
}

function makeSnapshot(devices: readonly DeviceView[], unreadSessionIds: readonly string[] = []): MultiDeviceSnapshot {
  return {
    revision: 2,
    devices,
    sshConfigHosts: [],
    unreadSessionIds,
    readCompletions: {},
    archivedSessionIds: [],
    subagentSessionIds: [],
    attentionByDevice: {},
  }
}

const renderers: ReactTestRenderer[] = []
const flush = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  const dev = makeDevice()
  mock.state = {
    snapshot: makeSnapshot([dev]),
    loading: false,
    activeNativeDeviceId: dev.id,
    keepAliveDeviceIds: [dev.id],
    reloadCounters: {},
    settingsModalOpen: false,
  }
  mock.removeDevice.mockReset()
  mock.removeDevice.mockResolvedValue({ ok: true })
  mock.listSshKeys.mockReset()
  mock.listSshKeys.mockResolvedValue([])
})

afterEach(() => {
  for (const renderer of renderers.splice(0)) act(() => renderer.unmount())
  vi.clearAllMocks()
})

function textOf(node: ReactTestInstance): string {
  return node.children
    .map(child => (typeof child === 'string' ? child : textOf(child)))
    .join('')
}

function mount(element: React.ReactElement): ReactTestRenderer {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(element)
  })
  renderers.push(renderer)
  return renderer
}

describe('icon-only buttons avoid DSH size="icon" SVG collapse', () => {
  it('never passes size="icon" in client components and keeps icon buttons sized and clickable', () => {
    const clientDir = join(process.cwd(), 'src/client')
    for (const file of readdirSync(clientDir)) {
      if (!file.endsWith('.tsx')) continue
      const source = readFileSync(join(clientDir, file), 'utf8')
      expect(source, `${file} must not pass size="icon"`).not.toMatch(/size\s*=\s*['"]icon['"]/)
    }

    const styles = readFileSync(join(clientDir, 'styles.ts'), 'utf8')
    expect(styles).toMatch(/\.dsh-md-icon-btn\s*\{[^}]*padding:\s*0;[^}]*flex:\s*none;/s)
    expect(styles).toMatch(/\.dsh-md-icon-btn\s+svg\s*\{[^}]*flex:\s*none;/s)
    expect(styles).toMatch(/\.dsh-md-tab-release\s*\{[^}]*opacity:\s*0\.6;[^}]*pointer-events:\s*auto;/s)
  })

  it('renders NativeTabBar action buttons with size="sm" + dsh-md-icon-btn and triggers releaseKeepAlive', () => {
    const renderer = mount(
      <NativeTabBar t={t} onOpenSettings={() => {}} />,
    )

    const buttons = renderer.root.findAllByType('button')
    expect(buttons.some(btn => btn.props['data-size'] === 'icon')).toBe(false)

    for (const label of [t('settingsSectionTitle'), t('releaseKeepAlive'), t('reloadPage')]) {
      const btn = buttons.find(candidate => candidate.props['aria-label'] === label)
      expect(btn, `expected button "${label}"`).toBeDefined()
      expect(btn!.props['data-size']).toBe('sm')
      expect(String(btn!.props.className)).toContain('dsh-md-icon-btn')
    }

    const releaseBtn = buttons.find(candidate => candidate.props['aria-label'] === t('releaseKeepAlive'))!
    act(() => {
      releaseBtn.props.onClick()
    })
    expect(mock.releaseKeepAliveDevice).toHaveBeenCalledWith(devId)
  })
})

describe('device removal flow in MultiDeviceHubPanel', () => {
  it('opens confirmation modal from row remove button and calls clientStore.removeDevice', async () => {
    const renderer = mount(<MultiDeviceHubPanel t={t} />)

    const buttons = renderer.root.findAllByType('button')
    expect(buttons.some(btn => btn.props['data-size'] === 'icon')).toBe(false)

    for (const label of [t('reconnect'), t('editDevice'), t('remove')]) {
      const btn = buttons.find(candidate => candidate.props['aria-label'] === label)
      expect(btn, `expected row button "${label}"`).toBeDefined()
      expect(btn!.props['data-size']).toBe('sm')
      expect(String(btn!.props.className)).toContain('dsh-md-icon-btn')
    }

    const removeBtn = buttons.find(candidate => candidate.props['aria-label'] === t('remove'))!
    act(() => {
      removeBtn.props.onClick()
    })

    const dialog = renderer.root.findByProps({ role: 'dialog' })
    expect(dialog.props['aria-label']).toBe(t('deleteTitle').replace('{name}', 'ubuntu-dev'))

    const confirmBtn = dialog
      .findAllByType('button')
      .find(btn => textOf(btn).trim() === t('deleteConfirm'))
    expect(confirmBtn).toBeDefined()

    await act(async () => {
      confirmBtn!.props.onClick()
      await flush()
    })

    expect(mock.removeDevice).toHaveBeenCalledWith(devId)
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
  })

  it('keeps modal open with error text on failure and exposes remove inside the expanded detail editor', async () => {
    mock.removeDevice.mockResolvedValueOnce({ ok: false, error: 'Storage is busy' })
    const renderer = mount(<MultiDeviceHubPanel t={t} />)

    const editBtn = renderer.root
      .findAllByType('button')
      .find(candidate => candidate.props['aria-label'] === t('editDevice'))!

    await act(async () => {
      editBtn.props.onClick()
      await flush()
    })

    const editorRemoveBtn = renderer.root
      .findAllByType('button')
      .find(btn => String(btn.props.className ?? '').includes('dsh-md-danger-action'))
    expect(editorRemoveBtn).toBeDefined()

    act(() => {
      editorRemoveBtn!.props.onClick()
    })

    const dialog = renderer.root.findByProps({ role: 'dialog' })
    const confirmBtn = dialog
      .findAllByType('button')
      .find(btn => textOf(btn).trim() === t('deleteConfirm'))!

    await act(async () => {
      confirmBtn.props.onClick()
      await flush()
    })

    expect(mock.removeDevice).toHaveBeenCalledWith(devId)
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1)
    const alert = dialog.findByProps({ role: 'alert' })
    expect(textOf(alert)).toContain('Storage is busy')
  })
})

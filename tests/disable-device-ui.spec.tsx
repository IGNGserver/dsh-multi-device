/**
 * UI tests for disabled devices in NativeTabBar, NativeViewport, and MultiDeviceHubPanel.
 */
import React from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DeviceId,
  encodeRemoteSessionId,
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
  setDeviceEnabled: vi.fn(async () => ({ ok: true as const }) as { ok: boolean; error?: string }),
  testDevice: vi.fn(async () => ({ ok: true as const, protocolVersion: '0.2', latencyMs: 5 })),
  upsertDevice: vi.fn(async () => ({ ok: true as const })),
  removeDevice: vi.fn(async () => ({ ok: true as const })),
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
    clientStore: {
      getSnapshot: () => mock.state,
      setDeviceEnabled: mock.setDeviceEnabled,
      testDevice: mock.testDevice,
      upsertDevice: mock.upsertDevice,
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
import { NativeTabBar, NativeViewport } from '../src/client/NativeViewport.tsx'

const t = (key: MultiDeviceLocaleKey): string => (zh as Record<string, string>)[key] ?? key
const devEnabled = DeviceId('dev-enabled')
const devDisabled = DeviceId('dev-disabled')

function makeDevice(over: Partial<DeviceView> = {}): DeviceView {
  return {
    id: devEnabled,
    name: 'ubuntu-dev',
    enabled: true,
    state: 'connected',
    transportKind: 'ssh',
    targetSummary: 'ssh://ubuntu-dev',
    sshTarget: 'ubuntu-dev',
    remotePort: 3080,
    ssh: { host: 'ubuntu-dev', remotePort: 3080 },
    keepNativeAlive: true,
    nativeProxyUrl: 'http://127.0.0.1:41000',
    protocolVersion: '0.2',
    realtime: true,
    latencyMs: 12,
    reconnectAttempt: 0,
    sessionCount: 0,
    runningSessionCount: 0,
    pendingApprovalCount: 0,
    workspaceCount: 0,
    ...over,
  }
}

const renderers: ReactTestRenderer[] = []

function mount(element: React.ReactElement): ReactTestRenderer {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(element)
  })
  renderers.push(renderer)
  return renderer
}

function textOf(instance: ReactTestInstance): string {
  const parts: string[] = []
  for (const child of instance.children) {
    parts.push(typeof child === 'string' ? child : textOf(child))
  }
  return parts.join('')
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.state = {
    snapshot: {
      revision: 1,
      devices: [
        makeDevice(),
        makeDevice({
          id: devDisabled,
          name: 'gpu-box',
          enabled: false,
          state: 'disabled',
          targetSummary: 'ssh://gpu-box',
          sshTarget: 'gpu-box',
          ssh: { host: 'gpu-box', remotePort: 3080 },
          nativeProxyUrl: undefined,
          latencyMs: undefined,
        }),
      ],
      sshConfigHosts: [],
      unreadSessionIds: [encodeRemoteSessionId(devEnabled, 's1')],
    },
    loading: false,
    activeNativeDeviceId: devEnabled,
    keepAliveDeviceIds: [devEnabled, devDisabled],
    reloadCounters: {},
    settingsModalOpen: false,
  }
})

afterEach(() => {
  for (const renderer of renderers.splice(0).reverse()) {
    act(() => renderer.unmount())
  }
  vi.unstubAllGlobals()
})

describe('NativeTabBar and NativeViewport hide disabled devices', () => {
  it('renders only 本机 and enabled devices in the tab strip and keeps disabled frames unmounted', () => {
    const bar = mount(<NativeTabBar t={t} onOpenSettings={() => {}} />)
    const tabs = bar.root.findAll(node => node.type === 'button' && node.props.role === 'tab')
    expect(tabs.map(tab => textOf(tab))).toEqual([t('nativeLocalTab'), 'ubuntu-dev'])
    expect(tabs.some(tab => textOf(tab).includes('gpu-box'))).toBe(false)

    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      location: { href: 'http://127.0.0.1:3080/' },
    })
    const viewport = mount(<NativeViewport t={t} onOpenSettings={() => {}} />)
    const frames = viewport.root.findAllByType('iframe')
    expect(frames).toHaveLength(1)
    expect(String(frames[0]!.props.title)).toBe('DSH Native - ubuntu-dev')
  })

  it('activates 本机 tab when activeNativeDeviceId points at a disabled device', () => {
    mock.state.activeNativeDeviceId = devDisabled
    const bar = mount(<NativeTabBar t={t} onOpenSettings={() => {}} />)
    const localTab = bar.root.findAll(node => node.type === 'button' && node.props.role === 'tab')[0]!
    expect(localTab.props['aria-selected']).toBe(true)

    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      location: { href: 'http://127.0.0.1:3080/' },
    })
    const viewport = mount(<NativeViewport t={t} onOpenSettings={() => {}} />)
    const stage = viewport.root.findByProps({ className: 'dsh-md-native-stage' })
    expect(stage.props['data-visible']).toBe('false')
  })
})

describe('MultiDeviceHubPanel disable/enable UX', () => {
  it('renders card Switch, hides live actions/status on disabled cards, and toggles via clientStore.setDeviceEnabled', async () => {
    const panel = mount(<MultiDeviceHubPanel t={t} />)
    const cards = panel.root.findAllByType('li')
    expect(cards).toHaveLength(2)

    const enabledCard = cards[0]!
    const disabledCard = cards[1]!

    expect(String(enabledCard.props.className)).toBe('dsh-md-card')
    expect(String(disabledCard.props.className)).toBe('dsh-md-card isDisabled')
    expect(textOf(disabledCard)).toContain(t('deviceDisabledTag'))

    // Disabled card hides Open, Clear unread, and Reconnect buttons; keeps Edit & Remove + Switch.
    const disabledButtons = disabledCard.findAllByType('button')
    expect(disabledButtons.find(btn => textOf(btn).trim() === t('openDevice'))).toBeUndefined()
    expect(disabledButtons.find(btn => btn.props['aria-label'] === t('reconnect'))).toBeUndefined()
    expect(disabledButtons.find(btn => btn.props['aria-label'] === t('editDevice'))).toBeDefined()
    expect(disabledButtons.find(btn => btn.props['aria-label'] === t('remove'))).toBeDefined()

    const enabledSwitch = enabledCard.findByProps({ role: 'switch' })
    const disabledSwitch = disabledCard.findByProps({ role: 'switch' })
    expect(enabledSwitch.props['aria-checked']).toBe(true)
    expect(disabledSwitch.props['aria-checked']).toBe(false)

    await act(async () => {
      enabledSwitch.props.onClick()
      await flush()
    })
    expect(mock.setDeviceEnabled).toHaveBeenCalledWith(devEnabled, false)

    await act(async () => {
      disabledSwitch.props.onClick()
      await flush()
    })
    expect(mock.setDeviceEnabled).toHaveBeenCalledWith(devDisabled, true)
  })

  it('skips testDevice preflight when saving a device as disabled in the editor form', async () => {
    const panel = mount(<MultiDeviceHubPanel t={t} />)
    const disabledCard = panel.root.findAllByType('li')[1]!
    const editBtn = disabledCard.findByProps({ 'aria-label': t('editDevice') })

    await act(async () => {
      editBtn.props.onClick()
      await flush()
    })

    const form = disabledCard.findByType('form')
    await act(async () => {
      form.props.onSubmit({ preventDefault: () => {} })
      await flush()
    })

    expect(mock.testDevice).not.toHaveBeenCalled()
    expect(mock.upsertDevice).toHaveBeenCalledWith(expect.objectContaining({
      id: devDisabled,
      enabled: false,
    }))
  })
})

/**
 * Interaction tests for the Native attention menu.
 *
 * The popover used to be a `<details>` element listing raw Session IDs; these
 * tests pin the behaviour that replaced it: the row names the conversation and
 * its workspace, and activating a row hands the Session to the Host in both
 * display modes.
 */
import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DeviceId,
  encodeRemoteSessionId,
  type DeviceView,
  type MultiDeviceSnapshot,
} from '../src/contract.ts'
import { AttentionDetails } from '../src/client/AttentionDetails.tsx'
import { zh, type MultiDeviceLocaleKey } from '../src/client/locales.ts'

const deviceId = DeviceId('dev-a')
const remoteSession = encodeRemoteSessionId(deviceId, 'raw-1')

const mock = vi.hoisted(() => ({
  state: {} as { snapshot: MultiDeviceSnapshot; displayMode: 'aggregated' | 'native' },
  openCatalogSession: vi.fn(async () => ({ ok: true })),
  selectNativeDevice: vi.fn(async () => ({ ok: true })),
  selectLocalNativeTab: vi.fn(),
}))

vi.mock('../src/client/state.ts', () => ({
  useMultiDeviceState: () => mock.state,
  deviceStateToDotState: () => 'idle',
  clientStore: {
    openCatalogSession: mock.openCatalogSession,
    selectNativeDevice: mock.selectNativeDevice,
    selectLocalNativeTab: mock.selectLocalNativeTab,
    getSnapshot: () => ({ displayMode: mock.state.displayMode, snapshot: mock.state.snapshot }),
  },
}))

const t = (key: MultiDeviceLocaleKey): string => (zh as Record<string, string>)[key] ?? key

const snapshot = {
  revision: 1,
  displayMode: 'aggregated',
  devices: [{ id: deviceId, name: 'ubuntu-dev', state: 'connected', enabled: true, latencyMs: 24 } as DeviceView],
  hostStatus: { aggregatedGatewayActive: true, nativeProxyActive: true },
  catalog: {
    schema: 1,
    revision: 1,
    issues: {},
    pinnedSessionIds: [],
    sessions: {
      [remoteSession]: {
        id: remoteSession,
        rawSessionId: 'raw-1',
        deviceId,
        title: '重构聚合模式后端',
        updatedAt: Date.now() - 5 * 60_000,
        running: true,
        blank: false,
        stale: false,
        cwd: '/home/me/DSH多设备插件',
      },
    },
  },
  logicalWorkspaces: [{
    logicalWorkspaceId: 'logical-1',
    title: 'DSH多设备插件',
    kind: 'git',
    targetDeviceId: deviceId,
    targetPath: '/home/me/DSH多设备插件',
    effectiveTargetDeviceId: deviceId,
    effectiveTargetPath: '/home/me/DSH多设备插件',
    effectiveTargetOnline: true,
    members: [],
    sessionIds: [remoteSession],
    createdAt: '',
    updatedAt: '',
  }],
  allPhysicalWorkspaces: [],
  sessionOrigins: {
    [remoteSession]: {
      namespacedSessionId: remoteSession,
      rawSessionId: 'raw-1',
      deviceId,
      deviceName: 'ubuntu-dev',
      deviceState: 'connected',
      cwd: '/home/me/DSH多设备插件',
      running: true,
    },
  },
  unreadSessionIds: [],
  readCompletions: [],
  archivedSessionIds: [],
  subagentSessionIds: [],
  sshConfigHosts: [],
  attentionByDevice: {},
} as unknown as MultiDeviceSnapshot

const running = {
  eligibleSessionIds: [remoteSession],
  runningSessionIds: [remoteSession],
  pendingSessionIds: [],
  unreadSessionIds: [],
  pendingRequestCount: 0,
  fresh: true,
}

const renderers: ReactTestRenderer[] = []

afterEach(() => {
  for (const renderer of renderers.splice(0)) act(() => renderer.unmount())
  vi.clearAllMocks()
  mock.state = { snapshot, displayMode: 'aggregated' }
})

function render(props: Record<string, unknown> = {}): ReactTestRenderer {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(React.createElement(AttentionDetails, {
      view: running,
      deviceName: 'ubuntu-dev',
      t,
      ...props,
    }))
  })
  renderers.push(renderer)
  return renderer
}

function chip(renderer: ReactTestRenderer) {
  const chips = renderer.root.findAll(
    node => node.type === 'button' && node.props.className === 'dsh-md-attention-chip',
  )
  return chips[0]!
}

async function openMenu(renderer: ReactTestRenderer): Promise<void> {
  await act(async () => {
    chip(renderer).props.onClick()
    await Promise.resolve()
  })
}

function menuItems(renderer: ReactTestRenderer) {
  return renderer.root.findAll(node => node.type === 'button' && node.props.role === 'menuitem')
}

/** Every string the rendered tree contains, including `title` attributes. */
function markupOf(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON())
}

describe('native attention menu', () => {
  it('lists the real title with workspace, device and age for a running Session', async () => {
    mock.state = { snapshot, displayMode: 'aggregated' }
    const renderer = render()
    expect(chip(renderer).props['aria-label']).toBe('ubuntu-dev: 1 运行中; 会话成员')
    await openMenu(renderer)
    const items = menuItems(renderer)
    expect(items).toHaveLength(1)
    const markup = markupOf(renderer)
    expect(markup).toContain('重构聚合模式后端')
    expect(markup).toContain('DSH多设备插件')
    expect(markup).toContain('ubuntu-dev')
    expect(markup).toContain('分钟前')
    // The ID is the tooltip, never the visible label.
    expect(markup).toContain(remoteSession)
    expect(markup).not.toContain('"isId"')
  })

  it('falls back to the raw ID, marked as an ID, when no title is known', async () => {
    mock.state = {
      snapshot: { ...snapshot, catalog: { schema: 1, revision: 1, sessions: {}, pinnedSessionIds: [], issues: {} } } as unknown as MultiDeviceSnapshot,
      displayMode: 'aggregated',
    }
    const renderer = render()
    await openMenu(renderer)
    const markup = markupOf(renderer)
    expect(markup).toContain('isId')
    expect(markup).toContain('raw-1')
  })

  it('opens the Session through the Host in Aggregated Mode', async () => {
    mock.state = { snapshot, displayMode: 'aggregated' }
    const renderer = render()
    await openMenu(renderer)
    await act(async () => {
      menuItems(renderer)[0]!.props.onClick()
      await Promise.resolve()
    })
    expect(mock.selectNativeDevice).not.toHaveBeenCalled()
    expect(mock.openCatalogSession).toHaveBeenCalledWith(remoteSession)
  })

  it('selects the owning device tab before navigating in Native Mode', async () => {
    mock.state = { snapshot, displayMode: 'native' }
    const renderer = render()
    await openMenu(renderer)
    await act(async () => {
      menuItems(renderer)[0]!.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mock.selectNativeDevice).toHaveBeenCalledWith(deviceId)
    expect(mock.openCatalogSession).toHaveBeenCalledWith(remoteSession)
    expect(mock.selectNativeDevice.mock.invocationCallOrder[0]!)
      .toBeLessThan(mock.openCatalogSession.mock.invocationCallOrder[0]!)
  })

  it('explains absent member IDs for an older Host instead of showing an empty list', async () => {
    mock.state = { snapshot, displayMode: 'aggregated' }
    const renderer = render({
      view: undefined,
      fallback: { runningCount: 2, pendingCount: 0, unreadSessionIds: [], fresh: true },
    })
    await openMenu(renderer)
    expect(markupOf(renderer)).toContain('旧版 Host 未提供成员 ID')
  })
})

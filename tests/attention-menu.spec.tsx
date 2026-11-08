/**
 * Interaction tests for the attention menu.
 *
 * The popover used to be a `<details>` element listing raw Session IDs; these
 * tests pin the behaviour that replaced it: activating a row switches to the
 * owning device tab and hands the Session to the Host, which is what makes that
 * device's framed page open the conversation.
 */
import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  state: {} as { snapshot: MultiDeviceSnapshot; activeNativeDeviceId?: string },
  sessionList: { ids: [] as string[], byId: {} as Record<string, { displayTitle?: string; title?: string }> },
  openSession: vi.fn(),
  setActiveSession: vi.fn(async () => {}),
  selectNativeDevice: vi.fn(async () => ({ ok: true })),
  selectLocalNativeTab: vi.fn(),
}))

vi.mock('../src/client/state.ts', () => ({
  useMultiDeviceState: () => mock.state,
  deviceStateToDotState: () => 'idle',
  clientStore: {
    setActiveSession: mock.setActiveSession,
    selectNativeDevice: mock.selectNativeDevice,
    selectLocalNativeTab: mock.selectLocalNativeTab,
    getSnapshot: () => mock.state,
  },
}))

vi.mock('../src/client/clientServices.ts', () => ({
  getClientServices: () => ({ uiWorkspace: { openSession: mock.openSession } }),
  useSessionListSnapshot: () => mock.sessionList,
}))

const t = (key: MultiDeviceLocaleKey): string => (zh as Record<string, string>)[key] ?? key

const snapshot = {
  revision: 1,
  devices: [{ id: deviceId, name: 'ubuntu-dev', state: 'connected', enabled: true, latencyMs: 24 } as DeviceView],
  unreadSessionIds: [],
  readCompletions: {},
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

beforeEach(() => {
  mock.state = { snapshot }
  mock.sessionList = { ids: [], byId: {} }
})

afterEach(() => {
  for (const renderer of renderers.splice(0)) act(() => renderer.unmount())
  vi.clearAllMocks()
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

function segments(renderer: ReactTestRenderer) {
  return renderer.root.findAll(
    node => node.type === 'button' && node.props.className === 'dsh-md-tab-status-seg',
  )
}

function chip(renderer: ReactTestRenderer) {
  return segments(renderer)[0]!
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

describe('attention menu', () => {
  it('falls back to the raw Session id when nothing knows a title', async () => {
    const renderer = render()
    expect(chip(renderer).props['aria-label']).toBe('ubuntu-dev: 1 运行中; 会话成员')
    await openMenu(renderer)
    expect(menuItems(renderer)).toHaveLength(1)
    const markup = markupOf(renderer)
    // Nothing resolves a title here: no local store row, no Host projection.
    expect(markup).toContain('raw-1')
    expect(markup).toContain('isId')
    expect(markup).toContain('ubuntu-dev')
    // The full namespaced ID stays available as the tooltip.
    expect(markup).toContain(remoteSession)
  })

  it('selects the owning device tab before publishing the Session to the Host', async () => {
    const renderer = render()
    await openMenu(renderer)
    await act(async () => {
      menuItems(renderer)[0]!.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mock.selectNativeDevice).toHaveBeenCalledWith(deviceId)
    expect(mock.setActiveSession).toHaveBeenCalledWith(remoteSession)
    expect(mock.selectNativeDevice.mock.invocationCallOrder[0]!)
      .toBeLessThan(mock.setActiveSession.mock.invocationCallOrder[0]!)
  })

  it('keeps local rows on the 本机 tab without switching devices', async () => {
    const localRunning = { ...running, eligibleSessionIds: ['local-1'], runningSessionIds: ['local-1'] }
    const renderer = render({ view: localRunning, deviceName: '本机' })
    await openMenu(renderer)
    await act(async () => {
      menuItems(renderer)[0]!.props.onClick()
      await Promise.resolve()
    })
    expect(mock.selectNativeDevice).not.toHaveBeenCalled()
    expect(mock.selectLocalNativeTab).toHaveBeenCalled()
    // The tab switch alone shows nothing: DSH's own navigation has to open it.
    expect(mock.openSession).toHaveBeenCalledWith('local-1')
    expect(mock.setActiveSession).toHaveBeenCalledWith('local-1')
  })

  it('names a remote conversation from the Host title projection', async () => {
    // The device page is cross-origin, so only the Host can name these rows.
    mock.state = {
      snapshot: { ...snapshot, sessionTitles: { [remoteSession]: '部署脚本排查' } } as unknown as MultiDeviceSnapshot,
    }
    const renderer = render()
    await openMenu(renderer)
    const markup = markupOf(renderer)
    expect(markup).toContain('部署脚本排查')
    expect(markup).not.toContain('isId')
    // The identity is still reachable as the row tooltip.
    expect(markup).toContain(remoteSession)
  })

  it('prefers the live local store title over the Host projection', async () => {
    const localRunning = { ...running, eligibleSessionIds: ['local-1'], runningSessionIds: ['local-1'] }
    mock.sessionList = { ids: ['local-1'], byId: { 'local-1': { displayTitle: '重构标签栏' } } }
    mock.state = {
      snapshot: { ...snapshot, sessionTitles: { 'local-1': '过期的 Host 标题' } } as unknown as MultiDeviceSnapshot,
    }
    const renderer = render({ view: localRunning, deviceName: '本机' })
    await openMenu(renderer)
    const markup = markupOf(renderer)
    expect(markup).toContain('重构标签栏')
    expect(markup).not.toContain('过期的 Host 标题')
  })

  it('orders the capsule by urgency and never renders an empty category', () => {
    // Needs-reply → running → finished-unread, colour-coded. An empty category
    // used to get a 30px invisible slot of its own; the capsule only carries
    // numbers that exist, so a quiet device reserves nothing at all.
    const busy = render({
      view: {
        ...running,
        pendingSessionIds: ['remote-pending'],
        runningSessionIds: [remoteSession],
        unreadSessionIds: ['remote-unread'],
      },
    })
    expect(segments(busy).map(node => String(node.props['data-tone'])))
      .toEqual(['pending', 'running', 'done'])
    expect(busy.root.findAll(node => node.props['data-attention-slot'] !== undefined)).toHaveLength(0)
    expect(busy.root.findAll(node => node.props.className === 'dsh-md-attention-slot')).toHaveLength(0)
  })

  it('renders no capsule at all when a device has nothing to report', () => {
    const idle = render({
      view: { ...running, eligibleSessionIds: [], runningSessionIds: [], unreadSessionIds: [] },
    })
    expect(segments(idle)).toHaveLength(0)
    expect(idle.root.findAll(node => node.props.className === 'dsh-md-tab-status')).toHaveLength(0)
  })

  it('states cached data on the capsule instead of adding a fifth marker', () => {
    // The amber freshness dot used the very same colour as "needs reply", so a
    // stale device read as a second pending reminder. The capsule dims and goes
    // dashed instead, and says so in its accessible name.
    const renderer = render({ view: { ...running, fresh: false } })
    const capsule = renderer.root
      .findAll(node => node.props.className === 'dsh-md-tab-status')[0]!
    expect(capsule.props['data-stale']).toBe('true')
    expect(renderer.root.findAll(node => node.props['data-attention-stale'] !== undefined)).toHaveLength(0)
    expect(markupOf(renderer)).toContain('同步中 / 数据过期')
  })

  it('explains absent member IDs for an older Host instead of showing an empty list', async () => {
    const renderer = render({
      view: undefined,
      fallback: { runningCount: 2, pendingCount: 0, unreadSessionIds: [], fresh: true },
    })
    await openMenu(renderer)
    expect(markupOf(renderer)).toContain('旧版 Host 未提供成员 ID')
  })
})

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
  getClientServices: () => ({ uiWorkspace: { openSession: vi.fn() } }),
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

describe('attention menu', () => {
  it('renders one row per Session with the raw id and owning device', async () => {
    const renderer = render()
    expect(chip(renderer).props['aria-label']).toBe('ubuntu-dev: 1 运行中; 会话成员')
    await openMenu(renderer)
    expect(menuItems(renderer)).toHaveLength(1)
    const markup = markupOf(renderer)
    // No cross-device catalog is projected any more, so the row is ID-first.
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
    expect(mock.setActiveSession).toHaveBeenCalledWith('local-1')
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

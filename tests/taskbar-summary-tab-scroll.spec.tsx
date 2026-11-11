/**
 * Taskbar summary and overlay scrollbar.
 *
 * Two opt-in surfaces that must stay honest about their inputs:
 *
 * - The title aggregate is the tab capsule's own three categories summed across
 *   devices. It may not invent a fourth ("failed") category DSH never exposes,
 *   and an all-zero tally must leave the title alone rather than paint an empty
 *   counter.
 * - The strip's scrollbar is a paint layer only. Its geometry is a pure
 *   function of the scroller, and the element is positioned outside the scroller
 *   so it cannot move a single pill.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it } from 'vitest'
import type { DeviceAttentionView } from '../src/attention.ts'
import { DeviceId, type DeviceView, type MultiDeviceSnapshot } from '../src/contract.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import { en, zh, type MultiDeviceLocaleKey } from '../src/client/locales.ts'
import { TabScrollIndicator, type TabScrollIndicatorProps } from '../src/client/TabScrollbar.tsx'
import {
  EMPTY_TALLY,
  formatTaskbarSummary,
  taskbarSegments,
  tallyTaskbarSessions,
} from '../src/client/taskbarSummary.ts'
import {
  EMPTY_TAB_SCROLL_METRICS,
  resolveTabScrollMetrics,
  resolveTabScrollWheel,
} from '../src/client/tabScroll.ts'
import { resolveTaskbarSummary, resolveWindowTitle } from '../src/client/windowTitle.ts'
import { parseControlPlaneRequest } from '../src/runtime.ts'

const zhT = (key: MultiDeviceLocaleKey): string => zh[key]
const enT = (key: MultiDeviceLocaleKey): string => en[key]

function attention(over: Partial<DeviceAttentionView>): DeviceAttentionView {
  return {
    eligibleSessionIds: [], runningSessionIds: [], pendingSessionIds: [], unreadSessionIds: [],
    pendingRequestCount: 0, fresh: true, ...over,
  }
}

function device(over: Partial<DeviceView>): DeviceView {
  return {
    id: DeviceId('dev-1'), name: 'dev-1', enabled: true, state: 'connected',
    transportKind: 'ssh', targetSummary: 'ssh://fixture', keepNativeAlive: true,
    protocolVersion: '0.2', realtime: true, reconnectAttempt: 0,
    sessionCount: 0, runningSessionCount: 0, pendingApprovalCount: 0, workspaceCount: 0,
    ...over,
  } as DeviceView
}

function snapshot(
  ui: MultiDeviceSnapshot['ui'],
  attentionByDevice?: Readonly<Record<string, DeviceAttentionView>>,
  unreadSessionIds: readonly string[] = [],
): MultiDeviceSnapshot {
  return {
    revision: 1,
    devices: [],
    sshConfigHosts: [],
    unreadSessionIds,
    ...(attentionByDevice === undefined ? {} : { attentionByDevice }),
    ...(ui === undefined ? {} : { ui }),
  }
}

const dirs: string[] = []
const registries: DeviceRegistry[] = []
afterEach(() => {
  for (const registry of registries.splice(0)) registry.dispose()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function registry(dir: string): DeviceRegistry {
  const value = new DeviceRegistry(join(dir, 'data.json'), join(dir, 'secrets.json'), {
    localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map(),
  }, { enableNativeProxy: false, enableTunnels: false })
  registries.push(value)
  return value
}

describe('taskbar summary follows the tab capsule', () => {
  it('sums the capsule categories across every device', () => {
    const tally = tallyTaskbarSessions({
      devices: [],
      attentionByDevice: {
        local: attention({ runningSessionIds: ['a'], unreadSessionIds: ['b'] }),
        'dev-1': attention({
          runningSessionIds: ['md~dev-1~r1', 'md~dev-1~r2'],
          pendingSessionIds: ['md~dev-1~p1'],
        }),
      },
      unreadSessionIds: ['b'],
    })
    expect(tally).toEqual({ running: 3, pending: 1, unread: 1 })
  })

  it('counts a Session once even if two device views claim it', () => {
    const tally = tallyTaskbarSessions({
      devices: [],
      attentionByDevice: {
        local: attention({ runningSessionIds: ['same'] }),
        'dev-1': attention({ runningSessionIds: ['same'] }),
      },
      unreadSessionIds: [],
    })
    expect(tally.running).toBe(1)
  })

  it('falls back to per-device counters when the Host predates the projection', () => {
    const tally = tallyTaskbarSessions({
      devices: [
        device({ runningSessionCount: 2, pendingApprovalCount: 1 }),
        device({ id: DeviceId('dev-2'), runningSessionCount: 1, pendingApprovalCount: 0 }),
      ],
      unreadSessionIds: ['u1', 'u2'],
      archivedSessionIds: ['u2'],
    })
    expect(tally).toEqual({ running: 3, pending: 1, unread: 1 })
    // An empty projection is not an authoritative zero either.
    expect(tallyTaskbarSessions({
      devices: [device({ runningSessionCount: 1 })],
      attentionByDevice: {},
      unreadSessionIds: [],
    }).running).toBe(1)
  })

  it('renders only non-zero categories, and nothing at all when quiet', () => {
    expect(formatTaskbarSummary({ running: 1, pending: 0, unread: 2 }, zhT)).toBe('1跑 2结')
    expect(formatTaskbarSummary({ running: 1, pending: 2, unread: 3 }, zhT)).toBe('1跑 2待 3结')
    expect(formatTaskbarSummary({ running: 1, pending: 0, unread: 2 }, enT)).toBe('1 run 2 done')
    expect(formatTaskbarSummary(EMPTY_TALLY, zhT)).toBeUndefined()
    expect(taskbarSegments(EMPTY_TALLY)).toEqual([])
    expect(taskbarSegments({ running: 0, pending: 4, unread: 0 })).toEqual([{ category: 'pending', count: 4 }])
  })
})

describe('window title', () => {
  const remoteTab = device({
    id: DeviceId('dev-1'), name: 'dev-1', state: 'connected', nativePaneTitle: '远端会话 — DSH',
  })

  it('lets the aggregate win over the active remote page title', () => {
    expect(resolveWindowTitle({
      activeNativeDeviceId: DeviceId('dev-1'), devices: [remoteTab], summary: '1跑 2结',
    })).toBe('1跑 2结')
    // 本机 tab: DSH owns the title when no aggregate is available.
    expect(resolveWindowTitle({ devices: [remoteTab] })).toBeUndefined()
    expect(resolveWindowTitle({ activeNativeDeviceId: DeviceId('dev-1'), devices: [remoteTab] }))
      .toBe('远端会话 — DSH')
  })

  it('is opt-in and silent while every category is empty', () => {
    const running = { local: attention({ runningSessionIds: ['a'] }) }
    expect(resolveTaskbarSummary(snapshot(undefined, running), zhT)).toBeUndefined()
    expect(resolveTaskbarSummary(snapshot({ crossHostReadState: false, taskbarSummary: false }, running), zhT))
      .toBeUndefined()
    expect(resolveTaskbarSummary(snapshot({ crossHostReadState: false, taskbarSummary: true }, running), zhT))
      .toBe('1跑')
    expect(resolveTaskbarSummary(
      snapshot({ crossHostReadState: false, taskbarSummary: true }, { local: attention({}) }),
      zhT,
    )).toBeUndefined()
  })
})

describe('Host preference plumbing', () => {
  it('defaults off, persists, and comes back after a reload', () => {
    const dir = mkdtempSync(join(tmpdir(), 'taskbar-summary-'))
    dirs.push(dir)
    const first = registry(dir)
    expect(first.ui().taskbarSummary).toBe(false)
    expect(first.snapshot().ui?.taskbarSummary).toBe(false)
    first.updateUiPreferences({ taskbarSummary: true })
    expect(first.ui()).toMatchObject({ taskbarSummary: true, crossHostReadState: false })
    expect(first.snapshot().ui?.taskbarSummary).toBe(true)
    first.dispose()
    const reloaded = registry(dir)
    expect(reloaded.ui().taskbarSummary).toBe(true)
  })

  it('rejects a non-boolean control-plane value', () => {
    expect(() => parseControlPlaneRequest({ action: 'setUiPreferences', payload: { taskbarSummary: 1 } }))
      .toThrow('taskbarSummary must be an optional boolean')
    expect(() => parseControlPlaneRequest({ action: 'setUiPreferences', payload: { taskbarSummary: true } }))
      .not.toThrow()
  })
})

describe('overlay scrollbar geometry', () => {
  it('stays absent while the strip fits', () => {
    expect(resolveTabScrollMetrics({ clientWidth: 600, scrollWidth: 600, scrollLeft: 0 }))
      .toBe(EMPTY_TAB_SCROLL_METRICS)
    // Sub-pixel layout noise is not scrollable content.
    expect(resolveTabScrollMetrics({ clientWidth: 600, scrollWidth: 600.5, scrollLeft: 0 }).scrollable).toBe(false)
    expect(resolveTabScrollMetrics({ clientWidth: 0, scrollWidth: 900, scrollLeft: 0 }).scrollable).toBe(false)
    expect(resolveTabScrollMetrics({ clientWidth: Number.NaN, scrollWidth: 900, scrollLeft: 0 }).scrollable).toBe(false)
  })

  it('sizes the thumb from the visible fraction', () => {
    const metrics = resolveTabScrollMetrics({ clientWidth: 400, scrollWidth: 1600, scrollLeft: 0 })
    expect(metrics.scrollable).toBe(true)
    expect(metrics.maxScrollLeft).toBe(1200)
    expect(metrics.thumbWidth).toBe(100)
    expect(metrics.thumbLeft).toBe(0)
  })

  it('never shrinks the thumb below a draggable minimum', () => {
    const metrics = resolveTabScrollMetrics({ clientWidth: 400, scrollWidth: 40_000, scrollLeft: 0 })
    expect(metrics.thumbWidth).toBe(24)
  })

  it('maps scrollLeft onto the track travel', () => {
    expect(resolveTabScrollMetrics({ clientWidth: 400, scrollWidth: 1600, scrollLeft: 600 }).thumbLeft).toBe(150)
    expect(resolveTabScrollMetrics({ clientWidth: 400, scrollWidth: 1600, scrollLeft: 1200 }).thumbLeft).toBe(300)
    // Overshoot past the end is clamped, not extrapolated.
    expect(resolveTabScrollMetrics({ clientWidth: 400, scrollWidth: 1600, scrollLeft: 99_999 }).thumbLeft).toBe(300)
  })
})

describe('wheel translation', () => {
  it('turns a vertical wheel into horizontal travel', () => {
    expect(resolveTabScrollWheel({ deltaX: 0, deltaY: 120, scrollLeft: 0, maxScrollLeft: 800 }))
      .toEqual({ delta: 120, consume: true })
    // Clamped at the end: the last pixel must not swallow the event forever.
    expect(resolveTabScrollWheel({ deltaX: 0, deltaY: 120, scrollLeft: 780, maxScrollLeft: 800 }))
      .toEqual({ delta: 20, consume: true })
    expect(resolveTabScrollWheel({ deltaX: 0, deltaY: 120, scrollLeft: 800, maxScrollLeft: 800 }))
      .toEqual({ delta: 0, consume: false })
  })

  it('leaves trackpad horizontal gestures and non-scrollable strips alone', () => {
    expect(resolveTabScrollWheel({ deltaX: 90, deltaY: 5, scrollLeft: 0, maxScrollLeft: 800 }).consume).toBe(false)
    expect(resolveTabScrollWheel({ deltaX: 0, deltaY: 120, scrollLeft: 0, maxScrollLeft: 0 }).consume).toBe(false)
    expect(resolveTabScrollWheel({ deltaX: 0, deltaY: 0, scrollLeft: 0, maxScrollLeft: 800 }).consume).toBe(false)
  })
})

function renderIndicator(props: Partial<TabScrollIndicatorProps>): ReturnType<typeof create> {
  let renderer: ReturnType<typeof create> | undefined
  act(() => {
    renderer = create(<TabScrollIndicator
      scrollable
      left={12}
      width={400}
      thumbWidth={100}
      thumbLeft={0}
      dragging={false}
      active={false}
      {...props}
    />)
  })
  return renderer!
}

describe('scrollbar indicator', () => {
  it('renders nothing when there is nothing to scroll', () => {
    expect(renderIndicator({ scrollable: false }).toJSON()).toBeNull()
    expect(renderIndicator({ width: 0 }).toJSON()).toBeNull()
    expect(renderIndicator({ thumbWidth: 0 }).toJSON()).toBeNull()
  })

  it('keeps the track and thumb boxes in the strip, out of its layout', () => {
    const json = renderIndicator({ thumbLeft: 150 }).toJSON() as {
      props: Record<string, unknown>
      children: { props: Record<string, unknown> }[]
    }
    expect(json.props.className).toBe('dsh-md-native-tab-scroll')
    expect(json.props.style).toEqual({ left: '12px', width: '400px' })
    expect(json.props['aria-hidden']).toBe('true')
    expect(json.children[0]!.props.style).toEqual({ width: '100px', transform: 'translateX(150px)' })
  })

  it('marks a drag so the thumb survives the pointer leaving the bar', () => {
    const json = renderIndicator({ dragging: true, active: true }).toJSON() as { props: Record<string, unknown> }
    expect(json.props['data-dragging']).toBe('true')
    expect(json.props['data-active']).toBe('true')
  })
})

describe('layout invariants', () => {
  it('keeps the native scrollbar hidden and draws an overlay instead', () => {
    const styles = readFileSync(new URL('../src/client/styles.ts', import.meta.url), 'utf8')
    const tabsStart = styles.indexOf('\n.dsh-md-native-tabs {')
    expect(tabsStart).toBeGreaterThan(-1)
    const tabs = styles.slice(tabsStart, styles.indexOf('}', tabsStart))
    expect(tabs).toContain('overflow-x: auto')
    expect(tabs).toContain('scrollbar-width: none')
    const overlayStart = styles.indexOf('\n.dsh-md-native-tab-scroll {')
    expect(overlayStart).toBeGreaterThan(-1)
    const overlay = styles.slice(overlayStart, styles.indexOf('}', overlayStart))
    // Absolute inside the fixed bar: no width, height or flex contribution.
    expect(overlay).toContain('position: absolute')
    expect(overlay).not.toContain('flex:')
    expect(overlay).not.toContain('display:')
  })

  it('mounts the overlay in the bar, beside the scroller', () => {
    const source = readFileSync(new URL('../src/client/NativeViewport.tsx', import.meta.url), 'utf8')
    expect(source).toContain('ref={tabsRef}')
    expect(source).toContain('<TabScrollbar scrollerRef={tabsRef} barRef={barRef} />')
  })
})

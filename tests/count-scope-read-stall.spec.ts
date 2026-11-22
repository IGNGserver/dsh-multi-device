/**
 * Regression suite for the count-scope/read/stall remediation.
 *
 * Three independent failures used to look like one "counter never drops":
 * a fleet-wide title read next to a per-device sidebar, an unread marker
 * consumed by a follow-up run the user never opened, and a Plugin SSE stream
 * that stayed OPEN while a hidden desktop window stopped reading it.
 */
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { selectDeviceAttention, type SessionAttentionFact } from '../src/attention.ts'
import { bindClientServices } from '../src/client/clientServices.ts'
import { activeWorkspaceSessionIds } from '../src/client/windowTitle.ts'
import { DeviceId, type MultiDeviceSnapshot } from '../src/contract.ts'
import { ReadStateTracker } from '../src/host/read-state.ts'
import type { DeviceRegistry } from '../src/host/registry.ts'
import {
  MultiDeviceControlPlane,
  readDiagnosticsClientReport,
  SSE_DRAIN_TIMEOUT_MS,
} from '../src/runtime.ts'
import { shouldRefetchStalledSnapshot } from '../src/client/state.ts'

const fact = (sessionId: string, extra: Partial<SessionAttentionFact> = {}): SessionAttentionFact => ({
  sessionId, deviceId: 'local', running: false, ...extra,
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('read state keeps an unopened completion across follow-up runs', () => {
  it('does not consume unread on running=true and mints a new completion on the next finish', () => {
    const tracker = new ReadStateTracker()
    tracker.observeRunning('s', true, 10)
    tracker.observeRunning('s', false, 20)
    const first = tracker.completionIds().s!
    expect(tracker.isUnread('s')).toBe(true)

    // A new run must not erase the previous result the user never opened.
    expect(tracker.observeRunning('s', true, 30)).toBe(false)
    expect(tracker.isUnread('s')).toBe(true)
    expect(tracker.completionIds().s).toBe(first)

    expect(tracker.observeRunning('s', false, 40)).toBe(true)
    expect(tracker.completionIds().s).not.toBe(first)
    expect(tracker.isUnread('s')).toBe(true)

    // Only an explicit read clears it.
    expect(tracker.markRead('s', 50)).toBe(true)
    expect(tracker.isUnread('s')).toBe(false)
  })

  it('still records a new completion when the previous result was read before the run', () => {
    const tracker = new ReadStateTracker()
    tracker.observeRunning('s', true, 10)
    tracker.observeRunning('s', false, 20)
    const first = tracker.completionIds().s!
    expect(tracker.readCompletion('s', first, 30)).toMatchObject({ accepted: true, unread: false })

    tracker.observeRunning('s', true, 40)
    expect(tracker.isUnread('s')).toBe(false)
    tracker.observeRunning('s', false, 50)
    expect(tracker.isUnread('s')).toBe(true)
    expect(tracker.completionIds().s).not.toBe(first)
  })
})

describe('running attribution', () => {
  it('publishes self vs subagent running for the menu and diagnostics', () => {
    const view = selectDeviceAttention([
      fact('self', { running: true }),
      fact('child', { runningSubagentCount: 2 }),
      fact('both', { running: true, runningSubagentCount: 1 }),
    ], new Set()).local
    expect(view.runningSessionIds).toEqual(['both', 'child', 'self'])
    expect(view.runningDetails).toEqual({
      both: { self: true, subagentCount: 1 },
      child: { self: false, subagentCount: 2 },
      self: { self: true, subagentCount: 0 },
    })
  })

  it('omits attribution when nothing runs', () => {
    expect(selectDeviceAttention([fact('idle')], new Set()).local.runningDetails).toBeUndefined()
  })

  it('publishes cwd only for the visible categories', () => {
    const view = selectDeviceAttention([
      fact('run', { running: true, cwd: '/work' }),
      fact('pending', { pendingRequestCount: 1, cwd: '/work' }),
      fact('unread', { cwd: '/work' }),
      fact('read', { cwd: '/work' }),
    ], new Set(['unread'])).local
    expect(view.cwdBySession).toEqual({ run: '/work', pending: '/work', unread: '/work' })
  })
})

describe('workspace scoping', () => {
  it('uses the local active session cwd and falls back when no cwd is known', () => {
    const dispose = bindClientServices({
      sessions: {
        list: {
          getSnapshot: () => ({
            ids: ['a', 'b', 'c'],
            byId: { a: { cwd: '/work' }, b: { cwd: '/work' }, c: { cwd: '/other' } },
          }),
        },
      },
    })
    try {
      const base = { snapshot: { revision: 1, devices: [], sshConfigHosts: [], unreadSessionIds: [] } as unknown as MultiDeviceSnapshot }
      expect(activeWorkspaceSessionIds({ ...base, activeSessionId: 'a' })).toEqual(new Set(['a', 'b']))
      expect(activeWorkspaceSessionIds({ ...base, activeSessionId: 'missing' })).toBeUndefined()
      expect(activeWorkspaceSessionIds({ ...base, activeNativeDeviceId: DeviceId('dev-a') })).toBeUndefined()
    } finally {
      dispose()
    }
  })

  it('maps a remote active session through its namespaced cwd metadata', () => {
    const raw = 'raw-1'
    const namespaced = `md~dev-a~${raw}`
    const snapshot = {
      revision: 1,
      devices: [{ id: DeviceId('dev-a'), name: 'dev-a', enabled: true, state: 'connected', nativePaneSessionId: raw }],
      sshConfigHosts: [],
      unreadSessionIds: [],
      attentionByDevice: {
        'dev-a': {
          eligibleSessionIds: [namespaced], runningSessionIds: [namespaced],
          pendingSessionIds: [], unreadSessionIds: [], pendingRequestCount: 0, fresh: true,
          cwdBySession: { [namespaced]: '/remote' },
        },
      },
    } as unknown as MultiDeviceSnapshot
    expect(activeWorkspaceSessionIds({ snapshot, activeNativeDeviceId: DeviceId('dev-a') })).toEqual(new Set([namespaced]))
  })
})

describe('client snapshot stall watchdog', () => {
  it('refetches only when visible, SSE-open, and the snapshot is older than the stall window', () => {
    const base = { now: 30_000, lastSnapshotAt: 1_000, lastRefetchAt: 0, visible: true, sseOpen: true }
    expect(shouldRefetchStalledSnapshot(base)).toBe(true)
    expect(shouldRefetchStalledSnapshot({ ...base, visible: false })).toBe(false)
    expect(shouldRefetchStalledSnapshot({ ...base, sseOpen: false })).toBe(false)
    expect(shouldRefetchStalledSnapshot({ ...base, lastSnapshotAt: 25_000 })).toBe(false)
    expect(shouldRefetchStalledSnapshot({ ...base, lastRefetchAt: 25_000 })).toBe(false)
    expect(shouldRefetchStalledSnapshot({ ...base, lastRefetchAt: 1_000 })).toBe(true)
  })

  it('carries the applied revision/age/SSE state into Diagnostics', () => {
    expect(readDiagnosticsClientReport({
      snapshotRevision: 7,
      snapshotAgeMs: 1_234,
      sseOpen: true,
      userAgent: 'fixture',
    })).toEqual({ snapshotRevision: 7, snapshotAgeMs: 1_234, sseOpen: true, userAgent: 'fixture' })
  })
})

describe('SSE backpressure recovery', () => {
  it('destroys a stream that never drains so EventSource can reconnect', async () => {
    vi.useFakeTimers()
    const snapshot = {
      revision: 1, devices: [], sshConfigHosts: [], unreadSessionIds: [],
    } as unknown as MultiDeviceSnapshot
    const registry = {
      snapshot: () => snapshot,
      onSnapshotChanged: () => () => {},
    } as unknown as DeviceRegistry
    const plane = new MultiDeviceControlPlane(registry, () => true)

    const req = new EventEmitter() as EventEmitter & { url: string; headers: Record<string, string> }
    req.url = '/multi-device/events?clientId=fixture'
    req.headers = { host: '127.0.0.1:3080' }
    const res = new EventEmitter() as EventEmitter & {
      writeHead: () => void
      write: () => boolean
      destroy: () => void
      destroyed: boolean
      writableNeedDrain: boolean
    }
    res.destroyed = false
    res.writableNeedDrain = false
    res.writeHead = vi.fn()
    res.write = vi.fn(() => false)
    res.destroy = vi.fn(() => {
      if (res.destroyed) return
      res.destroyed = true
      res.emit('close')
    })

    plane.handleEventsSse(req as never, res as never)
    await vi.advanceTimersByTimeAsync(SSE_DRAIN_TIMEOUT_MS)
    expect(res.destroy).toHaveBeenCalled()
    expect(res.destroyed).toBe(true)
  })
})

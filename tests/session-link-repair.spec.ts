/**
 * Regression tests for `client/sessionLinkRepair.ts`.
 *
 * The reported failure — a remote Workspace row that expands but shows no
 * conversations — is the sidebar skipping Session ids it has no summary for.
 * These tests pin the gap computation and the refetch loop that heals it
 * without a page reload.
 */
import { describe, expect, it } from 'vitest'
import { DeviceId, encodeRemoteSessionId } from '../src/contract.ts'
import {
  computeSessionLinkGap,
  SessionLinkRepair,
  type SessionLinkGap,
} from '../src/client/sessionLinkRepair.ts'
import { buildDiagnostics, readDiagnosticsSessionLink } from '../src/runtime.ts'
import type { MultiDeviceSnapshot } from '../src/contract.ts'

const UBUNTU = DeviceId('dev-ubuntu')
const MACOS = DeviceId('dev-macos')

function workspace(sessionIds: readonly string[]): { readonly sessionIds: readonly string[] } {
  return { sessionIds }
}

/** Deterministic timer harness: no real waiting, no global fake timers. */
function makeClock(): {
  readonly now: () => number
  readonly set: (fn: () => void, ms: number) => number
  readonly clear: (handle: unknown) => void
  readonly advance: (ms: number) => Promise<void>
} {
  let now = 0
  let nextId = 1
  const tasks = new Map<number, { at: number; fn: () => void }>()
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve()
  }
  return {
    now: () => now,
    set: (fn, ms) => {
      const id = nextId
      nextId += 1
      tasks.set(id, { at: now + ms, fn })
      return id
    },
    clear: (handle) => {
      tasks.delete(handle as number)
    },
    advance: async (ms) => {
      const target = now + ms
      for (;;) {
        const due = [...tasks.entries()]
          .filter(([, task]) => task.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0]
        if (due === undefined) break
        tasks.delete(due[0])
        now = due[1].at
        due[1].fn()
        await flush()
      }
      now = target
    },
  }
}

describe('computeSessionLinkGap', () => {
  it('counts ids the Session store cannot resolve, grouped by device', () => {
    const local = 'session-local-1'
    const remoteOne = encodeRemoteSessionId(UBUNTU, 'session-remote-1')
    const remoteTwo = encodeRemoteSessionId(MACOS, 'session-remote-2')
    const gap = computeSessionLinkGap(
      [workspace([local, remoteOne]), workspace([remoteTwo])],
      new Set([local]),
    )

    expect(gap.referenced).toBe(3)
    expect(gap.missing).toBe(2)
    expect(gap.byDevice).toEqual({ [String(UBUNTU)]: 1, [String(MACOS)]: 1 })
    expect(gap.sample).toEqual([remoteOne, remoteTwo])
  })

  it('reports no gap when every referenced id has a summary', () => {
    const ids = [encodeRemoteSessionId(UBUNTU, 'a'), encodeRemoteSessionId(UBUNTU, 'b')]
    const gap = computeSessionLinkGap([workspace(ids)], new Set(ids))
    expect(gap).toEqual({ referenced: 2, missing: 0, byDevice: {}, sample: [] })
  })

  it('ignores archived and subagent ids, which never render as own rows', () => {
    const archived = encodeRemoteSessionId(UBUNTU, 'archived')
    const subagent = encodeRemoteSessionId(UBUNTU, 'child')
    const live = encodeRemoteSessionId(UBUNTU, 'live')
    const gap = computeSessionLinkGap(
      [workspace([archived, subagent, live])],
      new Set<string>(),
      { excludedSessionIds: new Set([archived, subagent]) },
    )
    expect(gap.referenced).toBe(3)
    expect(gap.missing).toBe(1)
    expect(gap.sample).toEqual([live])
  })

  it('deduplicates an id shared by several merged members', () => {
    const shared = encodeRemoteSessionId(UBUNTU, 'shared')
    const gap = computeSessionLinkGap(
      [workspace([shared]), workspace([shared])],
      new Set<string>(),
    )
    expect(gap.referenced).toBe(1)
    expect(gap.missing).toBe(1)
  })
})

describe('SessionLinkRepair', () => {
  it('refetches session.list and stops once the store resolves every id', async () => {
    const clock = makeClock()
    const missing = encodeRemoteSessionId(UBUNTU, 'remote-1')
    const known = new Set<string>()
    let refreshes = 0

    const repair = new SessionLinkRepair(
      {
        computeGap: (): SessionLinkGap => computeSessionLinkGap([workspace([missing])], known),
        canRepair: () => ({ ok: true, connectedDevices: 1 }),
        refresh: async () => {
          refreshes += 1
          known.add(missing)
        },
      },
      { setTimeoutFn: clock.set, clearTimeoutFn: clock.clear, now: clock.now },
    )

    const first = repair.noteChange()
    expect(first?.missing).toBe(1)
    expect(refreshes).toBe(0)

    await clock.advance(400)
    expect(refreshes).toBe(1)
    expect(repair.report()?.resolved).toBe(true)
    expect(repair.report()?.attempts).toBe(1)

    // No further work is scheduled once the gap is closed.
    await clock.advance(60_000)
    expect(refreshes).toBe(1)
    repair.dispose()
  })

  it('keeps retrying persistently once the initial budget is spent', async () => {
    const clock = makeClock()
    const missing = encodeRemoteSessionId(UBUNTU, 'stuck')
    let refreshes = 0

    const repair = new SessionLinkRepair(
      {
        computeGap: () => computeSessionLinkGap([workspace([missing])], new Set<string>()),
        canRepair: () => ({ ok: true, connectedDevices: 1 }),
        refresh: async () => {
          refreshes += 1
        },
      },
      { setTimeoutFn: clock.set, clearTimeoutFn: clock.clear, now: clock.now },
    )

    repair.noteChange()
    // Fast backoff (400/1500/4000/10000/20000) then one persistent 60s retry
    // inside the 120s window; the loop must never give up silently.
    await clock.advance(120_000)

    expect(refreshes).toBe(6)
    expect(repair.report()?.missing).toBe(1)
    expect(repair.report()?.attempts).toBe(6)
    expect(repair.report()?.exhausted).toBe(true)

    // Persistent retries keep arriving every 60s until the gap heals.
    await clock.advance(60_000)
    expect(refreshes).toBe(7)
    repair.dispose()
  })

  it('heals a stuck gap during the persistent phase and stops', async () => {
    const clock = makeClock()
    const missing = encodeRemoteSessionId(UBUNTU, 'heals-late')
    const known = new Set<string>()
    let refreshes = 0

    const repair = new SessionLinkRepair(
      {
        computeGap: () => computeSessionLinkGap([workspace([missing])], known),
        canRepair: () => ({ ok: true, connectedDevices: 1 }),
        refresh: async () => {
          refreshes += 1
          // The Host finally projects the summary during the persistent phase.
          if (refreshes >= 6) known.add(missing)
        },
      },
      { setTimeoutFn: clock.set, clearTimeoutFn: clock.clear, now: clock.now },
    )

    repair.noteChange()
    await clock.advance(120_000)
    expect(refreshes).toBe(6)
    expect(repair.report()?.resolved).toBe(true)
    expect(repair.report()?.exhausted).toBe(false)
    await clock.advance(180_000)
    expect(refreshes).toBe(6)
    repair.dispose()
  })

  it('does not refresh while no device is connected', async () => {
    const clock = makeClock()
    const missing = encodeRemoteSessionId(UBUNTU, 'offline')
    let refreshes = 0
    let connected = 0

    const repair = new SessionLinkRepair(
      {
        computeGap: () => computeSessionLinkGap([workspace([missing])], new Set<string>()),
        canRepair: () => ({ ok: connected > 0, connectedDevices: connected }),
        refresh: async () => {
          refreshes += 1
        },
      },
      { setTimeoutFn: clock.set, clearTimeoutFn: clock.clear, now: clock.now },
    )

    expect(repair.noteChange()?.connectedDevices).toBe(0)
    await clock.advance(5_000)
    expect(refreshes).toBe(0)

    // The device finishes its handshake: the next change schedules a refresh.
    connected = 1
    repair.resetBudget()
    repair.noteChange()
    await clock.advance(400)
    expect(refreshes).toBe(1)
    repair.dispose()
  })

  it('re-arms after resetBudget so a later connection can heal a spent budget', async () => {
    const clock = makeClock()
    const missing = encodeRemoteSessionId(UBUNTU, 'late')
    const known = new Set<string>()
    let refreshes = 0

    const repair = new SessionLinkRepair(
      {
        computeGap: () => computeSessionLinkGap([workspace([missing])], known),
        canRepair: () => ({ ok: true, connectedDevices: 1 }),
        refresh: async () => {
          refreshes += 1
        },
      },
      { setTimeoutFn: clock.set, clearTimeoutFn: clock.clear, now: clock.now },
    )

    repair.noteChange()
    await clock.advance(120_000)
    expect(refreshes).toBe(6)

    // A device that connects later starts a fresh budget; this time the store
    // answers, which is the real-world recovery path.
    known.add(missing)
    repair.resetBudget()
    repair.noteChange()
    expect(repair.report()?.resolved).toBe(true)
    repair.dispose()
  })

  it('cancels a pending refresh when the generation is disposed', async () => {
    const clock = makeClock()
    let refreshes = 0
    const repair = new SessionLinkRepair(
      {
        computeGap: () => computeSessionLinkGap(
          [workspace([encodeRemoteSessionId(UBUNTU, 'x')])],
          new Set<string>(),
        ),
        canRepair: () => ({ ok: true, connectedDevices: 1 }),
        refresh: async () => {
          refreshes += 1
        },
      },
      { setTimeoutFn: clock.set, clearTimeoutFn: clock.clear, now: clock.now },
    )

    repair.noteChange()
    repair.dispose()
    await clock.advance(60_000)
    expect(refreshes).toBe(0)
  })
})

describe('diagnostics merge-failure evidence', () => {
  it('reports the device whose summaries were dropped from session.list', () => {
    const snapshot = {
      hostId: 'host-1',
      displayMode: 'aggregated',
      hostStatus: { aggregatedGatewayActive: true, nativeProxyActive: true },
      devices: [
        {
          id: UBUNTU,
          name: 'ubuntu-dev',
          enabled: true,
          state: 'connected',
          transportKind: 'ssh',
          protocolVersion: '0.2',
          realtime: true,
          reconnectAttempt: 0,
          sessionCount: 157,
          runningSessionCount: 0,
          pendingApprovalCount: 0,
          workspaceCount: 10,
          catalogStale: false,
          sessionListError: 'projection failed',
        },
      ],
      logicalWorkspaces: [],
      allPhysicalWorkspaces: [],
      unreadSessionIds: [],
    } as unknown as MultiDeviceSnapshot

    const report = buildDiagnostics(snapshot, undefined, 1_700_000_000_000)
    expect(report.devices).toHaveLength(1)
    expect(report.devices[0]?.sessionListError).toBe('projection failed')
  })
})

describe('readDiagnosticsSessionLink', () => {
  it('parses the browser link evidence and drops unknown fields', () => {
    const parsed = readDiagnosticsSessionLink({
      referenced: 12,
      missing: 3,
      byDevice: { [String(UBUNTU)]: 3, junk: 'x' },
      sample: ['a', 7, 'b'],
      connectedDevices: 2,
      attempts: 4,
      resolved: false,
      refreshedAt: 1_700_000_000_000,
      unexpected: 'ignored',
    })

    expect(parsed).toEqual({
      referenced: 12,
      missing: 3,
      byDevice: { [String(UBUNTU)]: 3 },
      sample: ['a', 'b'],
      connectedDevices: 2,
      attempts: 4,
      resolved: false,
      refreshedAt: 1_700_000_000_000,
    })
  })

  it('returns undefined for a missing report', () => {
    expect(readDiagnosticsSessionLink(undefined)).toBeUndefined()
    expect(readDiagnosticsSessionLink('nope')).toBeUndefined()
  })
})

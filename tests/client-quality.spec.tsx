import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceId, encodeRemoteSessionId, type DeviceView } from '../src/contract.ts'
import { bindClientServices, useSessionSummary, type SessionsServiceLike } from '../src/client/clientServices.ts'
import { MultiDeviceClientStore } from '../src/client/state.ts'

const cleanups: Array<() => void> = []
const renderers: ReactTestRenderer[] = []
afterEach(() => {
  act(() => { for (const renderer of renderers.splice(0)) renderer.unmount() })
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
function acceptedFetch() {
  return vi.fn(async (_url: unknown, _init: unknown) => ({ json: async () => ({ ok: true, value: { accepted: true } }) }))
}
const deviceId = DeviceId('state-remote')
const remoteId = encodeRemoteSessionId(deviceId, 'remote')

describe('local Native session scope', () => {
  it('clears a remote scope even when no local Session has been observed', async () => {
    const store = new MultiDeviceClientStore()
    const fetch = acceptedFetch()
    vi.stubGlobal('fetch', fetch)
    ;(store as any).state = {
      ...store.getSnapshot(), displayMode: 'native', activeNativeDeviceId: undefined, activeSessionId: remoteId,
      snapshot: { ...store.getSnapshot().snapshot, displayMode: 'native', devices: [{ id: deviceId, name: 'Remote', state: 'connected', enabled: true } as DeviceView] },
    }
    expect(store.effectiveSessionId()).toBeUndefined()
    store.selectLocalNativeTab()
    await flush()
    expect(store.getSnapshot().activeSessionId).toBeUndefined()
    const selections = fetch.mock.calls.map(call => JSON.parse((call[1] as any).body)).filter(request => request.action === 'setActiveSession')
    expect(selections.at(-1)?.payload.sessionId).toBe('')
  })

  it('restores the actual local Session after clearing the remote scope', async () => {
    const store = new MultiDeviceClientStore()
    vi.stubGlobal('fetch', acceptedFetch())
    ;(store as any).observedLocalMainSessionId = 'local-real'
    ;(store as any).state = { ...store.getSnapshot(), displayMode: 'native', activeNativeDeviceId: deviceId, activeSessionId: remoteId }
    store.selectLocalNativeTab()
    await flush()
    expect(store.getSnapshot().activeSessionId).toBe('local-real')
    expect(store.effectiveSessionId()).toBe('local-real')
  })
})

describe('navigation and snapshot request lifecycles', () => {
  it('does not let an older local refresh navigate after a newer click', async () => {
    const store = new MultiDeviceClientStore()
    vi.stubGlobal('fetch', acceptedFetch())
    const first = deferred<void>()
    const second = deferred<void>()
    const openSession = vi.fn()
    const refresh = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const unbind = bindClientServices({ sessions: { list: { getSnapshot: () => ({ ids: [], byId: {} }) }, refresh }, uiWorkspace: { openSession } })
    cleanups.push(unbind)
    const oldNavigation = store.openCatalogSession('local-old')
    const newNavigation = store.openCatalogSession('local-new')
    second.resolve()
    await newNavigation
    first.resolve()
    await oldNavigation
    expect(openSession.mock.calls).toEqual([['local-new']])
    expect(store.getSnapshot().activeSessionId).toBe('local-new')
  })

  it('coalesces snapshot requests and aborts an outstanding request on stop', async () => {
    const store = new MultiDeviceClientStore()
    const response = deferred<{ json: () => Promise<unknown> }>()
    let snapshotSignal: AbortSignal | undefined
    let snapshots = 0
    vi.stubGlobal('fetch', vi.fn((_url: unknown, init: any) => {
      const request = JSON.parse(init.body)
      if (request.action !== 'snapshot') return Promise.resolve({ json: async () => ({ ok: true, value: { accepted: true } }) })
      snapshots += 1
      snapshotSignal = init.signal
      return response.promise
    }))
    const first = store.refreshSnapshot()
    const second = store.refreshSnapshot()
    expect(snapshots).toBe(1)
    store.stop()
    expect(snapshotSignal?.aborted).toBe(true)
    response.resolve({ json: async () => ({ ok: true, value: store.getSnapshot().snapshot }) })
    await Promise.all([first, second])
  })

  it('does not start overlapping snapshots when a poll takes longer than the interval', async () => {
    vi.useFakeTimers()
    const store = new MultiDeviceClientStore()
    const response = deferred<{ json: () => Promise<unknown> }>()
    let snapshots = 0
    vi.stubGlobal('fetch', vi.fn((_url: unknown, init: any) => {
      if (JSON.parse(init.body).action !== 'snapshot') return Promise.resolve({ json: async () => ({ ok: true, value: { accepted: true } }) })
      snapshots += 1
      return response.promise
    }))
    store.start()
    await vi.advanceTimersByTimeAsync(6_000)
    expect(snapshots).toBe(1)
    store.stop()
    response.resolve({ json: async () => ({ ok: true, value: store.getSnapshot().snapshot }) })
    await flush()
  })
})

describe('rebindable client services', () => {
  function service(title: string): SessionsServiceLike & { listeners: Set<() => void> } {
    const listeners = new Set<() => void>()
    const snapshot = { ids: ['s'], byId: { s: { cwd: title } } }
    return {
      listeners,
      list: {
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
      },
    }
  }
  function Row() {
    return React.createElement('span', {}, useSessionSummary('s')?.cwd ?? 'none')
  }

  it('moves an already mounted hook from service A to B and unsubscribes A', async () => {
    const a = service('A')
    const b = service('B')
    const unbindA = bindClientServices({ sessions: a })
    cleanups.push(unbindA)
    let renderer!: ReactTestRenderer
    await act(async () => { renderer = create(React.createElement(Row)); await flush() })
    renderers.push(renderer)
    expect(renderer.root.findByType('span').children).toEqual(['A'])
    expect(a.listeners.size).toBe(1)
    const unbindB = bindClientServices({ sessions: b })
    cleanups.push(unbindB)
    await act(async () => { await flush() })
    expect(renderer.root.findByType('span').children).toEqual(['B'])
    expect(a.listeners.size).toBe(0)
    expect(b.listeners.size).toBe(1)
    unbindA()
    expect(renderer.root.findByType('span').children).toEqual(['B'])
  })
})

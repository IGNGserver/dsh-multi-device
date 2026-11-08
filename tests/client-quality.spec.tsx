import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceId } from '../src/contract.ts'
import { MultiDeviceClientStore } from '../src/client/state.ts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('local Session scope follows the device tab', () => {
  it('reports no local Session while a remote device tab is active', () => {
    const store = new MultiDeviceClientStore()
    ;(store as any).state = {
      ...store.getSnapshot(),
      activeNativeDeviceId: DeviceId('state-remote'),
      activeSessionId: 'local-session',
    }
    expect(store.effectiveSessionId()).toBeUndefined()
  })

  it('restores the observed local Session when 本机 becomes active again', async () => {
    const store = new MultiDeviceClientStore()
    vi.stubGlobal('fetch', acceptedFetch())
    ;(store as any).observedLocalMainSessionId = 'local-real'
    ;(store as any).state = {
      ...store.getSnapshot(),
      activeNativeDeviceId: DeviceId('state-remote'),
      activeSessionId: 'local-session',
    }
    store.selectLocalNativeTab()
    await flush()
    expect(store.getSnapshot().activeSessionId).toBe('local-real')
    expect(store.effectiveSessionId()).toBe('local-real')
  })
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
describe('navigation and snapshot request lifecycles', () => {
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

import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceId, encodeRemoteSessionId, type DeviceView } from '../src/contract.ts'
import { existingSessionStatusNotifier, installReadStateOverlay } from '../src/client/readState.ts'
import { nativeProxyEmbeddingError, resolveSameSiteProxyUrl } from '../src/client/nativePane.ts'
import { clientStore, MultiDeviceClientStore } from '../src/client/state.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const React = await import('react')
  const component = ({ children }: { children?: React.ReactNode }) => React.createElement('span', {}, children)
  return { Button: component, Input: component, StateDot: component, IconChevronLeftOutlineRegular: component,
    IconRefreshOutlineRegular: component, IconSettingsOutlineRegular: component, IconWarningOutlineRegular: component,
    IconCloseOutlineRegular: component, IconGlobeOutlineRegular: component, IconRightUpOutlineRegular: component,
    Pill: component, Toast: component, Tooltip: component }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
const renderers: ReactTestRenderer[] = []
const cleanups: (() => void)[] = []
afterEach(() => {
  act(() => { for (const renderer of renderers.splice(0)) renderer.unmount() })
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

class ElementMock {
  readonly events = new Map<string, () => void>()
  readonly children: ElementMock[] = []
  readonly attributes = new Map<string, string>()
  className = ''
  focus = vi.fn()
  remove = vi.fn()
  setAttribute(key: string, value: string) { this.attributes.set(key, value) }
  appendChild(value: ElementMock) { this.children.push(value) }
  executeJavaScript = vi.fn(async (_code: string) => undefined)
  addEventListener(name: string, callback: () => void) {
    const previous = this.events.get(name)
    this.events.set(name, () => { previous?.(); callback() })
  }
  querySelector() { return null }
}
const device = { id: DeviceId('dev-a'), name: 'Device A', nativeProxyUrl: 'http://127.0.0.1:42100/?md_token=t', authState: 'authenticated', state: 'connected' } as DeviceView

async function frameHarness(acquire: ReturnType<typeof vi.fn>) {
  vi.useFakeTimers()
  const release = vi.fn(async () => {})
  const guests: ElementMock[] = []
  vi.stubGlobal('dshDesktop', { protocolVersion: 1, browser: { acquire, release } })
  vi.stubGlobal('window', { location: { hostname: '127.0.0.1', protocol: 'http:', href: 'http://127.0.0.1:3080/' }, setTimeout, clearTimeout })
  vi.stubGlobal('document', { createElement: () => { const guest = new ElementMock(); guests.push(guest); return guest } })
  const { KeepAliveDeviceFrame } = await import('../src/client/NativeViewport.tsx')
  const props = { device, active: false, reloadCount: 0, t: (key: string) => key, onOpenSettings() {} }
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(React.createElement(KeepAliveDeviceFrame, props), { createNodeMock: () => new ElementMock() })
    await flush()
  })
  renderers.push(renderer)
  return { renderer, guests, release, update: async (patch: Partial<typeof props>) => {
    Object.assign(props, patch)
    await act(async () => { renderer.update(React.createElement(KeepAliveDeviceFrame, props)); await flush() })
  } }
}

describe('mounted Electron frame lifecycle (real React effects)', () => {
  it('reacquires after acquire failure / iframe fallback / reload', async () => {
    const acquire = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({ lease: 'lease-2', partition: 'p' })
    const h = await frameHarness(acquire)
    expect(h.renderer.root.findAllByType('iframe')).toHaveLength(1)
    await h.update({ reloadCount: 1 })
    expect(acquire).toHaveBeenCalledTimes(2)
    expect(h.renderer.root.findAllByType('iframe')).toHaveLength(0)
    expect(h.guests).toHaveLength(1)
    act(() => h.renderer.unmount())
    expect(h.release).toHaveBeenCalledExactlyOnceWith('lease-2')
  })

  it('releases did-fail-load guest immediately and reloads using a new container', async () => {
    const acquire = vi.fn().mockResolvedValueOnce({ lease: 'a', partition: 'p' }).mockResolvedValueOnce({ lease: 'b', partition: 'p' })
    const h = await frameHarness(acquire)
    await act(async () => { h.guests[0].events.get('did-fail-load')?.(); await flush() })
    expect(h.release).toHaveBeenCalledExactlyOnceWith('a')
    expect(h.renderer.root.findAllByType('iframe')).toHaveLength(1)
    await h.update({ reloadCount: 1 })
    expect(h.guests).toHaveLength(2)
    expect(acquire).toHaveBeenCalledTimes(2)
    act(() => h.renderer.unmount())
    expect(h.release.mock.calls.map(([lease]) => lease)).toEqual(['a', 'b'])
  })

  it('releases a late acquisition once without attaching after unmount', async () => {
    const pending = deferred<{ lease: string; partition: string }>()
    const h = await frameHarness(vi.fn(() => pending.promise))
    act(() => h.renderer.unmount())
    await act(async () => { pending.resolve({ lease: 'late', partition: 'p' }); await flush() })
    expect(h.guests).toHaveLength(0)
    expect(h.release).toHaveBeenCalledExactlyOnceWith('late')
  })

  it('does not reacquire on visibility changes and releases on auth/container teardown', async () => {
    const acquire = vi.fn().mockResolvedValue({ lease: 'a', partition: 'p' })
    const h = await frameHarness(acquire)
    await h.update({ active: true })
    expect(acquire).toHaveBeenCalledTimes(1)
    await h.update({ device: { ...device, authState: 'required' } })
    expect(h.release).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('posts latest visibility after cold guest readiness and load completion, including hidden reloads', async () => {
    const h = await frameHarness(vi.fn().mockResolvedValue({ lease: 'a', partition: 'p' }))
    const loaded = deferred<void>()
    Object.assign(h.guests[0], { getURL: () => 'about:blank#a', loadURL: () => loaded.promise })
    await act(async () => { h.guests[0].events.get('dom-ready')?.(); await flush() })
    expect(h.guests[0].executeJavaScript.mock.calls.at(-1)?.[0]).toContain('"visible":false')
    await h.update({ active: true })
    await act(async () => { loaded.resolve(); await flush() })
    expect(h.guests[0].executeJavaScript.mock.calls.at(-1)?.[0]).toContain('"visible":true')
    await h.update({ active: false, reloadCount: 1 })
    await act(async () => { h.guests[1].events.get('dom-ready')?.(); await flush() })
    expect(h.guests[1].executeJavaScript.mock.calls.at(-1)?.[0]).toContain('"visible":false')
  })

  it('handles rejected loadURL without an unhandled promise and falls back', async () => {
    const h = await frameHarness(vi.fn().mockResolvedValue({ lease: 'a', partition: 'p' }))
    Object.assign(h.guests[0], { getURL: () => 'about:blank#a', loadURL: () => Promise.reject(new Error('load')) })
    await act(async () => { h.guests[0].events.get('dom-ready')?.(); await flush() })
    expect(h.renderer.root.findAllByType('iframe')).toHaveLength(1)
    expect(h.release).toHaveBeenCalledExactlyOnceWith('a')
  })
})

describe('IPv4-only proxy policy', () => {
  it.each(['127.0.0.1', 'localhost'])('matches supported parent %s', hostname => {
    vi.stubGlobal('window', { location: { hostname } })
    expect(new URL(resolveSameSiteProxyUrl(device.nativeProxyUrl)!).hostname).toBe(hostname)
    expect(nativeProxyEmbeddingError(device.nativeProxyUrl)).toBeUndefined()
  })
  it('explains remote browsers and HTTPS mixed content but permits Desktop app protocol', () => {
    vi.stubGlobal('window', { location: { hostname: 'remote.example', protocol: 'https:' } })
    expect(nativeProxyEmbeddingError(device.nativeProxyUrl)).toContain('Host loopback')
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol: 'https:' } })
    expect(nativeProxyEmbeddingError(device.nativeProxyUrl)).toContain('mixed content')
    vi.stubGlobal('window', { location: { hostname: 'app', protocol: 'dsh-app:' } })
    expect(nativeProxyEmbeddingError(device.nativeProxyUrl)).toBeUndefined()
  })
  it('never rewrites a proxy to unbound IPv6 and explicitly degrades embedding', () => {
    vi.stubGlobal('window', { location: { hostname: '[::1]' } })
    expect(resolveSameSiteProxyUrl(device.nativeProxyUrl)).toBe(device.nativeProxyUrl)
    expect(nativeProxyEmbeddingError(device.nativeProxyUrl)).toContain('IPv4-only')
  })
})

describe('pre-HMR Session status subscribers', () => {
  it('notifies real existing and new subscribers once for Host-only changes and restores base', () => {
    // Separate sets are essential: a shared fake notifier would hide the bug.
    const statusListeners = new Set<() => void>()
    const readListeners = new Set<() => void>()
    const base = new Map([['s', { completionUnread: false }]])
    const source = { getSnapshot: () => base, subscribe: (fn: () => void) => { statusListeners.add(fn); return () => { statusListeners.delete(fn) } } }
    const old = vi.fn(() => source.getSnapshot())
    const newer = vi.fn(() => source.getSnapshot())
    source.subscribe(old)
    let unread = new Set<string>()
    const dispose = installReadStateOverlay({ source, getUnread: () => unread, shouldOverride: () => true,
      subscribeReadState: fn => { readListeners.add(fn); return () => { readListeners.delete(fn) } },
      notifyExistingSubscribers: existingSessionStatusNotifier({ statusListeners }),
    })
    const offNew = source.subscribe(newer)
    old.mockClear()
    unread = new Set(['s'])
    for (const fn of readListeners) fn()
    expect(old).toHaveBeenCalledTimes(1)
    expect(newer).toHaveBeenCalledTimes(1)
    expect(old.mock.results[0].value.get('s').completionUnread).toBe(true)
    dispose()
    expect(old).toHaveBeenCalledTimes(2)
    expect(newer).toHaveBeenCalledTimes(2)
    expect(source.getSnapshot()).toBe(base)
    dispose()
    expect(old).toHaveBeenCalledTimes(2)
    offNew()
    expect(statusListeners.size).toBe(1)
    expect(readListeners.size).toBe(0)
  })
  it('reports unsupported private adapter instead of claiming hot activation works', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(existingSessionStatusNotifier({})).toBeUndefined()
    expect(existingSessionStatusNotifier({ statusListeners: new Set([123]) })).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0][0]).toContain('reload')
  })
})

function setClientMode(mode: 'native' | 'aggregated', patch = {}) {
  // Drive the real store subscription; only transport ingestion is bypassed.
  ;(clientStore as any).setState({ displayMode: mode, ...patch })
}
async function modeHarness(refresh: () => Promise<void>) {
  const { installModeSideEffects } = await import('../src/client/index.tsx')
  const remote = encodeRemoteSessionId(DeviceId('dev-a'), 'r')
  const openSession = vi.fn()
  const openWorkspace = vi.fn(async () => {})
  vi.spyOn(clientStore, 'setActiveSession').mockResolvedValue()
  const dispose = installModeSideEffects({ sessions: { list: { getSnapshot: () => ({ ids: [remote, 'local'], byId: { [remote]: { retainedBy: { mainView: 1 } }, local: {} } }) }, refresh }, uiWorkspace: { openSession, openWorkspace } } as any)
  cleanups.push(dispose)
  return { openSession, dispose }
}

describe('asynchronous mode reconciliation cancellation', () => {
  it('ignores refresh resolved after disposal', async () => {
    setClientMode('native')
    const pending = deferred<void>()
    const h = await modeHarness(() => pending.promise)
    h.dispose()
    pending.resolve()
    await flush()
    expect(h.openSession).not.toHaveBeenCalled()
  })
  it('does not let old native reconciliation navigate after a newer aggregated transition', async () => {
    setClientMode('native')
    const pending = deferred<void>()
    const refresh = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined)
    const h = await modeHarness(refresh)
    setClientMode('aggregated')
    await flush()
    pending.resolve()
    await flush()
    expect(h.openSession).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledTimes(2)
  })
  it('cancels aggregated retry timers on dispose', async () => {
    vi.useFakeTimers()
    setClientMode('native')
    const h = await modeHarness(async () => {})
    await flush()
    h.openSession.mockClear()
    setClientMode('aggregated', { pendingAggregatedSessionId: 'missing-remote' })
    await flush()
    expect(vi.getTimerCount()).toBe(1)
    h.dispose()
    await vi.runAllTimersAsync()
    expect(h.openSession).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('active Session Host epoch re-report', () => {
  it('retries failures and ignores an acknowledgement from the previous Host epoch', async () => {
    const store = new MultiDeviceClientStore()
    const old = deferred<any>()
    const calls: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body)
      calls.push(request)
      if (calls.length === 1) return old.promise
      return { json: async () => ({ ok: true, value: { accepted: true } }) }
    }))
    const first = store.setActiveSession('s')
    ;(store as any).applyIncomingSnapshot({ ...store.getSnapshot().snapshot, revision: 1, hostEpoch: 'new-host' })
    await flush()
    expect(calls).toHaveLength(2)
    old.resolve({ json: async () => ({ ok: true, value: { accepted: true } }) })
    await first
    await store.setActiveSession('s')
    expect(calls).toHaveLength(2)
    expect(calls[1].payload.requestSeq).toBeGreaterThan(calls[0].payload.requestSeq)
  })
  it('reports an empty scope on epoch change and permits same-selection failure retry', async () => {
    const store = new MultiDeviceClientStore()
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ json: async () => ({ ok: true, value: { accepted: true } }) })
    vi.stubGlobal('fetch', fetch)
    await store.setActiveSession('s')
    await store.setActiveSession('s')
    expect(fetch).toHaveBeenCalledTimes(2)
    await store.setActiveSession(undefined)
    ;(store as any).applyIncomingSnapshot({ ...store.getSnapshot().snapshot, revision: 1, hostEpoch: 'restarted' })
    await flush()
    expect(fetch).toHaveBeenCalledTimes(4)
  })
})

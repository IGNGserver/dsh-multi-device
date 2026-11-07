import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply, type ClientContextLike } from '../src/client/index.tsx'
import { getClientServices } from '../src/client/clientServices.ts'
import { clientStore, MultiDeviceClientStore } from '../src/client/state.ts'

// Keep apply(), both dependency-scoped effects, service binding and navigation
// real. Presentation-only imports are irrelevant to the Cordis activation bug.
vi.mock('../src/client/ModeSwitcherOverlay.tsx', () => ({ ActiveSessionReporter: () => null, ModeSwitcherOverlay: () => null, SessionRowHoverDeviceSection: () => null }))
vi.mock('../src/client/MultiDeviceHubPanel.tsx', () => ({ MultiDeviceHubPanel: () => null }))
vi.mock('../src/client/AggregatedSidebar.tsx', () => ({ AggregatedSidebar: () => null }))
vi.mock('../src/client/OfflineDeviceBanner.tsx', () => ({ OfflineDeviceBanner: () => null }))
vi.mock('../src/client/SessionDeviceChip.tsx', () => ({ SessionDeviceChip: () => null }))
vi.mock('../src/client/SessionLinkBanner.tsx', () => ({ SessionLinkBanner: () => null }))
vi.mock('../src/client/SessionRowDeviceMarker.tsx', () => ({ SessionRowDeviceMarker: () => null }))
vi.mock('../src/client/styles.ts', () => ({ adoptMultiDeviceStyles: () => {} }))
vi.mock('../src/client/windowTitle.ts', () => ({ installWindowTitle: () => () => {} }))
vi.mock('../src/client/projectBadges.ts', () => ({ installProjectDeviceBadges: () => () => {} }))
vi.mock('../src/client/readState.ts', () => ({ installReadStateOverlay: () => () => {}, existingSessionStatusNotifier: () => undefined }))

function observable<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    publish: (next: T) => { value = next; for (const listener of [...listeners]) listener() },
    listeners,
  }
}
function serviceGeneration(id: string) {
  const list = observable({ ids: [id], byId: { [id]: { cwd: '/local', retainedBy: { mainView: 1 } } } })
  const sessions = { list, refresh: vi.fn(async () => {}) }
  const uiWorkspace = { openSession: vi.fn(), openWorkspace: vi.fn(async () => {}) }
  const panelInfo = observable<{ activePanelId: string | null }>({ activePanelId: null })
  const layout = { panelInfo, selectPanel: vi.fn() }
  return { sessions, uiWorkspace, layout }
}
type Generation = ReturnType<typeof serviceGeneration>
interface Scope {
  readonly deps: readonly string[]
  readonly context: ClientContextLike
  dispose(): void
}
interface Injection { readonly deps: readonly string[]; readonly callback: (ctx: ClientContextLike) => void; readonly scopes: Scope[] }

/**
 * Unlike the old permissive test fixture, an injected child cannot access a
 * service unless ctx.inject declared it. Effects execute immediately, including
 * their actual property reads. This reproduces Cordis childinactive failures.
 */
function strictCordis(initial: Generation) {
  const injections: Injection[] = []
  const rootDisposers: (() => void)[] = []
  const effects: string[] = []
  let generation = initial
  const slots = {
    inject: (_name: string, callback: () => (() => void) | void) => {
      const dispose = callback()
      if (dispose) rootDisposers.push(dispose)
      return dispose ?? (() => {})
    },
    register: vi.fn(() => () => {}), entries: () => [],
  }
  const locale = { register: () => () => {}, bind: () => (key: string) => key }
  const activate = (injection: Injection, next: Generation = generation): Scope => {
    generation = next
    const cleanups: (() => void)[] = []
    const allowed = new Set([...injection.deps, 'slots', 'locale'])
    const services: Record<string, unknown> = { ...next, slots, locale, modelDirectories: { catalog: { refresh: vi.fn() } }, uiSession: {} }
    const resolve = (key: string): unknown => {
      if (!allowed.has(key)) throw new Error(`Cordis childinactive: undeclared service "${key}" (injected: ${injection.deps.join(', ')})`)
      return services[key]
    }
    const methods = {
      effect: (fn: () => (() => void) | void, label = '') => {
        effects.push(label)
        const dispose = fn()
        if (dispose) cleanups.push(dispose)
      },
      get: resolve,
      inject: (_deps: readonly string[], _callback: (ctx: ClientContextLike) => void) => { throw new Error('Unexpected nested injection') },
    }
    const context = new Proxy(methods, {
      get(target, key, receiver) {
        if (typeof key === 'symbol') return Reflect.get(target, key, receiver)
        if (key in target) return Reflect.get(target, key, receiver)
        return resolve(key)
      },
    }) as unknown as ClientContextLike
    const scope: Scope = { deps: injection.deps, context, dispose: () => { for (const cleanup of [...cleanups].reverse()) cleanup() } }
    injection.scopes.push(scope)
    injection.callback(context)
    return scope
  }
  const root: ClientContextLike = {
    locale, slots,
    effect(fn, label = '') { effects.push(label); const dispose = fn(); if (dispose) rootDisposers.push(dispose) },
    inject(deps, callback) { const injection = { deps, callback, scopes: [] }; injections.push(injection); activate(injection) },
    get(key) { if (key === 'layout') return generation.layout; if (key === 'modelDirectories') return undefined; throw new Error(`Unexpected root get ${key}`) },
  }
  return { root, effects, injections, activate,
    modeInjection: () => injections.find(injection => injection.deps.includes('sessions'))!,
    dispose: () => {
      for (const injection of [...injections].reverse()) for (const scope of [...injection.scopes].reverse()) scope.dispose()
      for (const dispose of [...rootDisposers].reverse()) dispose()
    },
  }
}
const cleanups: (() => void)[] = []
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
beforeEach(() => {
  vi.spyOn(clientStore, 'start').mockReturnValue(() => {})
  // apply's real mode effect reports retained local main views over this boundary.
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ ok: true, value: { accepted: true } }) })))
})
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('strict Cordis injection activates real client service handles', () => {
  it('executes apply effects with declared services and actually opens a local session through bound uiWorkspace', async () => {
    const generation = serviceGeneration('local-a')
    const h = strictCordis(generation)
    cleanups.push(h.dispose)
    expect(() => apply(h.root)).not.toThrow()
    expect(h.effects).toContain('dsh-multi-device: native local surface')
    expect(h.effects).toContain('dsh-multi-device: client service handles')
    expect(getClientServices().sessions).toBe(generation.sessions)
    expect(getClientServices().uiWorkspace).toBe(generation.uiWorkspace)
    const store = new MultiDeviceClientStore()
    expect(await store.openCatalogSession('local-a')).toEqual({ ok: true })
    expect(generation.sessions.refresh).toHaveBeenCalledOnce()
    expect(generation.uiWorkspace.openSession).toHaveBeenCalledExactlyOnceWith('local-a')
    expect(generation.layout.selectPanel).toHaveBeenCalledExactlyOnceWith(null)
    await flush()
    expect(generation.sessions.list.listeners.size).toBe(1)
    expect(generation.layout.panelInfo.listeners.size).toBe(1)
  })

  it('rejects undeclared direct property and get() access rather than silently allowing a bad child context', () => {
    const h = strictCordis(serviceGeneration('local-a'))
    cleanups.push(h.dispose)
    expect(() => h.root.inject(['sessions', 'uiWorkspace'], child => {
      child.effect(() => { void child.layout })
    })).toThrow('undeclared service "layout"')
    expect(() => h.root.inject(['sessions', 'uiWorkspace'], child => {
      child.effect(() => { void child.get?.('layout') })
    })).toThrow('undeclared service "layout"')
  })

  it('revives handles after dependency disposal and binds replacement service instances', async () => {
    const old = serviceGeneration('old-local')
    const h = strictCordis(old)
    cleanups.push(h.dispose)
    apply(h.root)
    const injection = h.modeInjection()
    injection.scopes[0]!.dispose()
    expect(getClientServices()).toEqual({})
    expect(old.sessions.list.listeners.size).toBe(0)
    expect(old.layout.panelInfo.listeners.size).toBe(0)
    const next = serviceGeneration('new-local')
    const scope = h.activate(injection, next)
    expect(getClientServices().sessions).toBe(next.sessions)
    const store = new MultiDeviceClientStore()
    expect(await store.openCatalogSession('new-local')).toEqual({ ok: true })
    expect(next.uiWorkspace.openSession).toHaveBeenCalledExactlyOnceWith('new-local')
    expect(old.uiWorkspace.openSession).not.toHaveBeenCalled()
    scope.dispose()
    expect(getClientServices()).toEqual({})
    expect(next.sessions.list.listeners.size).toBe(0)
  })

  it('an old generation cleanup cannot clear newer bound handles or their navigation/subscription services', async () => {
    const old = serviceGeneration('old-local')
    const h = strictCordis(old)
    cleanups.push(h.dispose)
    apply(h.root)
    const injection = h.modeInjection()
    const oldScope = injection.scopes[0]!
    const next = serviceGeneration('new-local')
    const newScope = h.activate(injection, next)
    oldScope.dispose()
    expect(getClientServices().sessions).toBe(next.sessions)
    expect(getClientServices().uiWorkspace).toBe(next.uiWorkspace)
    expect(next.sessions.list.listeners.size).toBe(1)
    expect(next.layout.panelInfo.listeners.size).toBe(1)
    expect(old.sessions.list.listeners.size).toBe(0)
    const store = new MultiDeviceClientStore()
    expect(await store.openCatalogSession('new-local')).toEqual({ ok: true })
    expect(next.sessions.refresh).toHaveBeenCalledOnce()
    expect(next.uiWorkspace.openSession).toHaveBeenCalledExactlyOnceWith('new-local')
    expect(next.layout.selectPanel).toHaveBeenCalledExactlyOnceWith(null)
    expect(old.layout.selectPanel).not.toHaveBeenCalled()
    newScope.dispose()
    expect(getClientServices()).toEqual({})
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply, type ClientContextLike } from '../src/client/index.tsx'
import { getClientServices } from '../src/client/clientServices.ts'
import { clientStore } from '../src/client/state.ts'

// Keep apply(), both dependency-scoped effects and slot registration real;
// presentation-only imports are irrelevant to the Cordis activation contract.
vi.mock('../src/client/NativeOverlay.tsx', () => ({ NativeOverlay: () => null }))
vi.mock('../src/client/MultiDeviceHubPanel.tsx', () => ({ MultiDeviceHubPanel: () => null }))
vi.mock('../src/client/styles.ts', () => ({ adoptMultiDeviceStyles: () => {} }))
vi.mock('../src/client/windowTitle.ts', () => ({ installWindowTitle: () => () => {} }))
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
  const panelInfo = observable<{ activePanelId: string | null }>({ activePanelId: null })
  const layout = { panelInfo, selectPanel: vi.fn() }
  const sessions = {
    list: observable({ ids: [id], byId: { [id]: { cwd: '/local', retainedBy: { mainView: 1 } } } }),
    refresh: vi.fn(async () => {}),
  }
  const uiWorkspace = { openSession: vi.fn(), startSession: vi.fn() }
  return { sessions, layout, uiWorkspace }
}
type Generation = ReturnType<typeof serviceGeneration>
interface Scope {
  readonly deps: readonly string[]
  readonly context: ClientContextLike
  dispose(): void
}
interface Injection { readonly deps: readonly string[]; readonly callback: (ctx: ClientContextLike) => void; readonly scopes: Scope[] }

/**
 * Unlike a permissive fixture, an injected child cannot access a service unless
 * ctx.inject declared it. Effects execute immediately, including their actual
 * property reads. This reproduces Cordis childinactive failures.
 */
function strictCordis(initial: Generation) {
  const injections: Injection[] = []
  const rootDisposers: (() => void)[] = []
  const effects: string[] = []
  const registered: string[] = []
  let generation = initial
  const slots = {
    inject: (slotName: string, callback: () => (() => void) | void) => {
      registered.push(slotName)
      const dispose = callback()
      if (dispose) rootDisposers.push(dispose)
      return dispose ?? (() => {})
    },
    register: (options: Record<string, unknown>) => {
      registered.push(String(options.name ?? ''))
      return () => {}
    },
    entries: () => [],
  }
  const locale = { register: () => () => {}, bind: () => (key: string) => key }
  const activate = (injection: Injection, next: Generation = generation): Scope => {
    generation = next
    const cleanups: (() => void)[] = []
    const allowed = new Set([...injection.deps, 'slots', 'locale'])
    const services: Record<string, unknown> = { ...next, slots, locale, uiSession: {} }
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
    get(key) { if (key === 'layout') return generation.layout; throw new Error(`Unexpected root get ${key}`) },
  }
  return { root, effects, injections, activate, registered,
    // Two injections share `sessions`; the tracking one also injects `layout`.
    sessionInjection: () => injections.find(injection => injection.deps.includes('sessions') && injection.deps.includes('layout'))!,
    servicesInjection: () => injections.find(injection => injection.deps.includes('uiWorkspace'))!,
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
  // The local main-view effect reports the active Session over this boundary.
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ ok: true, value: { accepted: true } }) })))
})
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('strict Cordis injection activates the client entry', () => {
  it('executes apply effects with declared services and reports the local main Session', async () => {
    const generation = serviceGeneration('local-a')
    const h = strictCordis(generation)
    cleanups.push(h.dispose)
    expect(() => apply(h.root)).not.toThrow()
    expect(h.effects).toContain('dsh-multi-device: local session tracking')
    expect(h.effects).toContain('dsh-multi-device: device unread overlay')
    await flush()
    expect(generation.sessions.list.listeners.size).toBe(1)
    expect(generation.layout.panelInfo.listeners.size).toBe(1)
    expect(clientStore.getSnapshot().activeSessionId).toBe('local-a')
  })

  it('rejects undeclared direct property and get() access rather than silently allowing a bad child context', () => {
    const h = strictCordis(serviceGeneration('local-a'))
    cleanups.push(h.dispose)
    expect(() => h.root.inject(['sessions'], child => {
      child.effect(() => { void child.layout })
    })).toThrow('undeclared service "layout"')
    expect(() => h.root.inject(['sessions'], child => {
      child.effect(() => { void child.get?.('layout') })
    })).toThrow('undeclared service "layout"')
  })

  it('revives listeners after dependency disposal and binds replacement service instances', async () => {
    const old = serviceGeneration('old-local')
    const h = strictCordis(old)
    cleanups.push(h.dispose)
    apply(h.root)
    const injection = h.sessionInjection()
    injection.scopes[0]!.dispose()
    expect(old.sessions.list.listeners.size).toBe(0)
    expect(old.layout.panelInfo.listeners.size).toBe(0)
    const next = serviceGeneration('new-local')
    const scope = h.activate(injection, next)
    await flush()
    expect(next.sessions.list.listeners.size).toBe(1)
    expect(next.layout.panelInfo.listeners.size).toBe(1)
    expect(clientStore.getSnapshot().activeSessionId).toBe('new-local')
    scope.dispose()
    expect(next.sessions.list.listeners.size).toBe(0)
  })

  it('binds the Session store and navigation surface so attention rows can act', () => {
    // The device UI renders from a slot component, so it can only reach these
    // services through the binding. Without it a click on a local Session had
    // nothing to call, which is what "the menu does nothing" actually was.
    const generation = serviceGeneration('local-a')
    const h = strictCordis(generation)
    cleanups.push(h.dispose)
    apply(h.root)
    expect(h.effects).toContain('dsh-multi-device: client services')
    expect(getClientServices().sessions).toBe(generation.sessions)
    expect(getClientServices().uiWorkspace).toBe(generation.uiWorkspace)

    h.servicesInjection().scopes[0]!.dispose()
    expect(getClientServices().uiWorkspace).toBeUndefined()
  })

  it('contributes only the native surfaces and never replaces official sidebar rows', () => {
    const h = strictCordis(serviceGeneration('local-a'))
    cleanups.push(h.dispose)
    apply(h.root)
    expect(h.registered).toEqual(expect.arrayContaining(['settings.section', 'plugins.bundle.config', 'shell.overlay']))
    // Aggregated mode used to replace the official sidebar and decorate its
    // rows; nothing may take over DSH's own workspace/session rows any more.
    for (const slot of [
      'sidebar.workspaces',
      'conversation.input.right',
      'conversation.input.dock',
      'sidebar.session.row.leading',
      'sidebar.session.row.hover',
      'conversation.session.header.utilities',
      'conversation.hero.options',
    ]) {
      expect(h.registered).not.toContain(slot)
    }
  })
})

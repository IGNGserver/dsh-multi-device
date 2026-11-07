import { describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { readLocalAttentionCatalog } from '../src/host/local-attention.ts'

interface Session {
  id: string
  seq?: number
  header?: { origin?: string }
}
interface RecordRow { header: { id: string; origin?: string } }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
function fixture(records: readonly RecordRow[] = [], live: readonly Session[] = []) {
  const persistence = {}
  const listSessions = vi.fn(async (_signal?: AbortSignal): Promise<readonly RecordRow[]> => records)
  const query = { _persistence: persistence as unknown, listSessions }
  const sessions = { list: vi.fn(() => live), attach: vi.fn(), get: vi.fn() }
  const agents = { list: vi.fn((): readonly { id: string; status: string }[] => []), attach: vi.fn(), get: vi.fn() }
  const projections = { snapshot: vi.fn((_session: Session, _keys: string[]): { values: Record<string, unknown> } => ({ values: {} })) }
  const services: Record<string, unknown> = {
    sessionQuery: query, sessionPersistence: persistence, sessions, agents, sessionProjections: projections,
  }
  return { services, query, sessions, agents, projections, resolve: (key: string) => services[key] }
}

const row = (id: string, origin?: string): RecordRow => ({ header: { id, origin } })

describe('readLocalAttentionCatalog complete local baseline', () => {
  it.each(['sessionQuery', 'sessionPersistence', 'sessions', 'agents'])(
    'fails closed before querying when %s is missing', async key => {
      const h = fixture()
      delete h.services[key]
      expect(await readLocalAttentionCatalog(h.resolve)).toBeUndefined()
      expect(h.query.listSessions).not.toHaveBeenCalled()
    },
  )

  it.each(['sessionQuery', 'sessions', 'agents'])(
    'does not accept an unknown %s service shape as an authoritative empty baseline', async key => {
      const h = fixture()
      h.services[key] = {}
      expect(await readLocalAttentionCatalog(h.resolve)).toBeUndefined()
      expect(h.query.listSessions).not.toHaveBeenCalled()
    },
  )

  it.each([undefined, null, {}])('requires the actual private persistence binding, not %s', async binding => {
    const h = fixture()
    h.query._persistence = binding
    expect(await readLocalAttentionCatalog(h.resolve)).toBeUndefined()
    expect(h.query.listSessions).not.toHaveBeenCalled()
  })

  it('accepts an empty catalog only after a successful query with all stable services', async () => {
    const h = fixture()
    expect(await readLocalAttentionCatalog(h.resolve)).toEqual([])
    expect(h.query.listSessions).toHaveBeenCalledOnce()
    expect(h.sessions.list).toHaveBeenCalledOnce()
    expect(h.agents.list).toHaveBeenCalledOnce()
  })

  it.each(['sessionQuery', 'sessionPersistence', 'sessions', 'agents'])(
    'rejects a %s service generation replacement during the query', async key => {
      const h = fixture()
      const pending = deferred<readonly RecordRow[]>()
      h.query.listSessions.mockReturnValueOnce(pending.promise)
      const read = readLocalAttentionCatalog(h.resolve)
      h.services[key] = {}
      pending.resolve([])
      expect(await read).toBeUndefined()
      expect(h.sessions.list).not.toHaveBeenCalled()
      expect(h.agents.list).not.toHaveBeenCalled()
    },
  )

  it('rejects a persistence rebind on the same query object during the query', async () => {
    const h = fixture()
    const pending = deferred<readonly RecordRow[]>()
    h.query.listSessions.mockReturnValueOnce(pending.promise)
    const read = readLocalAttentionCatalog(h.resolve)
    h.query._persistence = {}
    pending.resolve([])
    expect(await read).toBeUndefined()
  })

  it('accepts rc.5 corpus binding and different context views of the same providers', async () => {
    const h = fixture()
    const original = Symbol.for('cordis.original')
    const view = <T extends object>(target: T): T => new Proxy(target, {
      get(value, key, receiver) {
        if (key === original) return value
        const item = Reflect.get(value, key, receiver)
        // Like Cordis, method access and service lookup need not be ===.
        return typeof item === 'function' ? new Proxy(item, {}) : item
      },
    })
    const persistence = h.services.sessionPersistence as object
    const query = { _corpus: { _persistence: view(persistence) }, listSessions: h.query.listSessions }
    h.services.sessionQuery = query
    const resolve = (key: string): unknown => {
      const value = h.services[key]
      return value !== null && typeof value === 'object' ? view(value) : value
    }
    expect(await readLocalAttentionCatalog(resolve)).toEqual([])
    expect(h.query.listSessions).toHaveBeenCalledOnce()
  })

  it.each(['missing-binding', 'different-binding', 'unknown-corpus'])(
    'rejects rc.5 corpus that is not bound to current persistence: %s', async mode => {
      const h = fixture()
      h.services.sessionQuery = {
        listSessions: h.query.listSessions,
        _corpus: mode === 'missing-binding' ? {} : mode === 'different-binding' ? { _persistence: {} } : null,
      }
      expect(await readLocalAttentionCatalog(h.resolve)).toBeUndefined()
      expect(h.query.listSessions).not.toHaveBeenCalled()
    },
  )

  it('rejects an rc.5 corpus replacement even when its persistence is unchanged', async () => {
    const h = fixture()
    const pending = deferred<readonly RecordRow[]>()
    h.query.listSessions.mockReturnValueOnce(pending.promise)
    const query = { _corpus: { _persistence: h.services.sessionPersistence }, listSessions: h.query.listSessions }
    h.services.sessionQuery = query
    const read = readLocalAttentionCatalog(h.resolve)
    query._corpus = { _persistence: h.services.sessionPersistence }
    pending.resolve([])
    expect(await read).toBeUndefined()
  })

  it('checks service identities again after collecting live facts', async () => {
    const h = fixture([row('parent')], [{ id: 'parent', seq: 1 }])
    h.projections.snapshot.mockImplementation(() => {
      h.services.agents = {}
      return { values: {} }
    })
    expect(await readLocalAttentionCatalog(h.resolve)).toBeUndefined()
  })

  it('uses metadata blank overrides and counts running catalog children on persisted and live-only parents', async () => {
    const persisted = { id: 'persisted', seq: 0 }
    const added = { id: 'added', seq: 4 }
    const h = fixture([row('persisted'), row('cold', 'subagent')], [persisted, added])
    h.agents.list.mockReturnValue([
      { id: 'child-running', status: 'running' }, { id: 'child-idle', status: 'idle' },
      { id: 'added', status: 'running' },
    ])
    h.projections.snapshot.mockImplementation(session => ({ values: {
      sessionListMetadata: { blank: session.id === 'added' },
      subagentCatalog: [{ id: 'child-running' }, { id: 'child-idle' }, { id: 'missing' }, {}, null],
    } }))
    expect(await readLocalAttentionCatalog(h.resolve)).toEqual([
      { sessionId: 'persisted', deviceId: 'local', running: false, blank: false, origin: undefined, runningSubagentCount: 1 },
      { sessionId: 'cold', deviceId: 'local', running: false, blank: false, origin: 'subagent', runningSubagentCount: 0 },
      { sessionId: 'added', deviceId: 'local', running: true, blank: true, origin: undefined, runningSubagentCount: 1 },
    ])
    expect(h.projections.snapshot).toHaveBeenCalledWith(persisted, ['sessionListMetadata', 'subagentCatalog'])
    expect(h.projections.snapshot).toHaveBeenCalledWith(added, ['sessionListMetadata', 'subagentCatalog'])
  })

  it('unions cold and live sessions without activating agents or duplicating shared IDs', async () => {
    const live = [{ id: 'shared', seq: 1 }, { id: 'new-child', seq: 0, header: { origin: 'subagent' } }]
    const h = fixture([row('shared'), row('cold')], live)
    delete h.services.sessionProjections
    const before = structuredClone(live)
    expect(await readLocalAttentionCatalog(h.resolve)).toEqual([
      { sessionId: 'shared', deviceId: 'local', running: false, blank: false, origin: undefined, runningSubagentCount: 0 },
      { sessionId: 'cold', deviceId: 'local', running: false, blank: false, origin: undefined, runningSubagentCount: 0 },
      { sessionId: 'new-child', deviceId: 'local', running: false, blank: true, origin: 'subagent', runningSubagentCount: 0 },
    ])
    expect(h.sessions.attach).not.toHaveBeenCalled()
    expect(h.sessions.get).not.toHaveBeenCalled()
    expect(h.agents.attach).not.toHaveBeenCalled()
    expect(h.agents.get).not.toHaveBeenCalled()
    expect(live).toEqual(before)
  })

  it('preserves this bindings for the query and read-only list APIs', async () => {
    const h = fixture()
    h.query.listSessions.mockImplementation(async function (this: unknown) {
      expect(this).toBe(h.query)
      return []
    })
    h.sessions.list.mockImplementation(function (this: unknown) { expect(this).toBe(h.sessions); return [] })
    h.agents.list.mockImplementation(function (this: unknown) { expect(this).toBe(h.agents); return [] })
    expect(await readLocalAttentionCatalog(h.resolve)).toEqual([])
  })

  it('propagates query failure instead of manufacturing an empty baseline', async () => {
    const h = fixture()
    const failure = new Error('persistence unavailable')
    h.query.listSessions.mockRejectedValueOnce(failure)
    await expect(readLocalAttentionCatalog(h.resolve)).rejects.toBe(failure)
  })

  it('passes the signal and propagates abort after an uncooperative query resolves', async () => {
    const h = fixture()
    const pending = deferred<readonly RecordRow[]>()
    h.query.listSessions.mockReturnValueOnce(pending.promise)
    const controller = new AbortController()
    const failure = new Error('query retired')
    const read = readLocalAttentionCatalog(h.resolve, controller.signal)
    expect(h.query.listSessions).toHaveBeenCalledWith(controller.signal)
    controller.abort(failure)
    pending.resolve([])
    await expect(read).rejects.toBe(failure)
    expect(h.sessions.list).not.toHaveBeenCalled()
  })

  it('throws an existing abort before querying', async () => {
    const h = fixture()
    const controller = new AbortController()
    const failure = new Error('stopped')
    controller.abort(failure)
    await expect(readLocalAttentionCatalog(h.resolve, controller.signal)).rejects.toBe(failure)
    expect(h.query.listSessions).not.toHaveBeenCalled()
  })

  const cordisPath = process.env.DSH_CORDIS_MODULE ?? [
    '/home/lvziw/.local/node-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js',
    '/home/lvziw/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js',
    '/Users/lvziw/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js',
  ].find(path => existsSync(path))
  it.skipIf(cordisPath === undefined)('reads through real Cordis context-bound views of one provider', async () => {
    interface TestContext {
      plugin(plugin: { apply(ctx: TestContext): void }): Promise<unknown>
      get(key: string): unknown
    }
    const { Context, Service } = await import(cordisPath!) as {
      Context: new () => TestContext
      Service: new (ctx: TestContext, name: string) => object
    }
    const root = new Context()
    let boundPersistence: unknown
    let consumer: TestContext | undefined
    class Persistence extends Service {
      constructor(ctx: TestContext) { super(ctx, 'sessionPersistence') }
    }
    class Sessions extends Service {
      constructor(ctx: TestContext) { super(ctx, 'sessions') }
      list() { return [] }
    }
    class Agents extends Service {
      constructor(ctx: TestContext) { super(ctx, 'agents') }
      list() { return [] }
    }
    class Query extends Service {
      readonly _corpus: { _persistence: unknown }
      constructor(ctx: TestContext) {
        super(ctx, 'sessionQuery')
        boundPersistence = ctx.get('sessionPersistence')
        this._corpus = { _persistence: boundPersistence }
      }
      async listSessions() {
        expect(this._corpus._persistence).toBe(boundPersistence)
        return []
      }
    }
    await root.plugin({ apply(ctx) { new Persistence(ctx); new Sessions(ctx); new Agents(ctx) } })
    await root.plugin({ apply(ctx) { new Query(ctx) } })
    await root.plugin({ apply(ctx) { consumer = ctx } })
    expect(consumer).toBeDefined()
    expect(consumer!.get('sessionPersistence')).not.toBe(boundPersistence)
    expect(await readLocalAttentionCatalog(key => consumer!.get(key))).toEqual([])
  })

  it('lets resolver and projection failures reach registry error handling', async () => {
    const failure = new Error('service failed')
    await expect(readLocalAttentionCatalog(() => { throw failure })).rejects.toBe(failure)
    const h = fixture([row('live')], [{ id: 'live' }])
    h.projections.snapshot.mockImplementation(() => { throw failure })
    await expect(readLocalAttentionCatalog(h.resolve)).rejects.toBe(failure)
  })
})

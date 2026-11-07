import type { SessionAttentionFact } from '../attention.ts'

interface CatalogRecord {
  readonly header: { readonly id: string; readonly origin?: string }
}
interface LocalSession {
  readonly id: string
  readonly seq?: number
  readonly header?: { readonly origin?: string }
}
interface SessionQuery {
  readonly _persistence?: unknown
  readonly _corpus?: { readonly _persistence?: unknown }
  listSessions(signal?: AbortSignal): Promise<readonly CatalogRecord[]>
}
interface LocalSessions {
  list(): readonly LocalSession[]
}
interface LocalAgents {
  list(): readonly { readonly id: string; readonly status?: string }[]
}
interface LocalProjections {
  snapshot?(session: LocalSession, keys: string[]): { readonly values: Record<string, unknown> }
}

const originalService = Symbol.for('cordis.original')
function identity(value: unknown): unknown {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value
  const original = (value as Record<symbol, unknown>)[originalService]
  return original !== null && (typeof original === 'object' || typeof original === 'function') ? original : value
}
function persistenceBinding(query: SessionQuery): unknown {
  // rc.5 stores the optional-service binding in SessionCorpus, not the engine.
  // Prefer that verified shape; direct bindings support older adapters only.
  return query._corpus === undefined ? query._persistence : query._corpus?._persistence
}

/**
 * Read a complete local attention baseline without attaching Sessions or Agents.
 *
 * `undefined` means unavailable/non-authoritative, never an empty deletion
 * baseline. In installed DSH 0.2.1-rc.5, sessionQuery can silently return only
 * live Sessions when its optional persistence binding is absent. `_persistence`
 * is a private, version-scoped compatibility guard: unknown future internals
 * deliberately fail closed until their completeness contract is verified.
 * Query/abort errors intentionally propagate to the Registry's retry handling.
 */
export async function readLocalAttentionCatalog(
  resolve: (key: string) => unknown,
  signal?: AbortSignal,
): Promise<readonly SessionAttentionFact[] | undefined> {
  signal?.throwIfAborted()
  const query = resolve('sessionQuery') as SessionQuery | undefined
  const persistence = resolve('sessionPersistence')
  const sessions = resolve('sessions') as LocalSessions | undefined
  const agents = resolve('agents') as LocalAgents | undefined
  if (
    typeof query?.listSessions !== 'function' || persistence == null ||
    identity(persistenceBinding(query)) !== identity(persistence) ||
    typeof sessions?.list !== 'function' || typeof agents?.list !== 'function'
  ) return undefined

  const listSessions = query.listSessions
  const listLive = sessions.list
  const listAgents = agents.list
  const queryIdentity = identity(query)
  const persistenceIdentity = identity(persistence)
  const sessionsIdentity = identity(sessions)
  const agentsIdentity = identity(agents)
  const corpusIdentity = identity(query._corpus)
  // Cordis creates fresh method/context proxies on access. Compare original
  // provider objects, not view or method ===, while invoking the captured view.
  const sameServices = (): boolean =>
    identity(resolve('sessionQuery')) === queryIdentity &&
    identity(resolve('sessionPersistence')) === persistenceIdentity &&
    identity(resolve('sessions')) === sessionsIdentity &&
    identity(resolve('agents')) === agentsIdentity &&
    identity(query._corpus) === corpusIdentity &&
    identity(persistenceBinding(query)) === persistenceIdentity

  // Capture all services before the await: resolving only the live services
  // afterwards would combine a retired query baseline with a new generation.
  if (!sameServices()) return undefined
  const records = await listSessions.call(query, signal)
  signal?.throwIfAborted()
  if (!sameServices()) return undefined

  const live = new Map(listLive.call(sessions).map(session => [String(session.id), session]))
  const running = new Set(listAgents.call(agents)
    .filter(agent => agent.status === 'running').map(agent => String(agent.id)))
  const projection = resolve('sessionProjections') as LocalProjections | undefined
  const factFor = (id: string, origin?: string): SessionAttentionFact => {
    const session = live.get(id)
    const values = session === undefined ? undefined : projection?.snapshot?.(
      session, ['sessionListMetadata', 'subagentCatalog'],
    ).values
    const metadata = values?.sessionListMetadata as { blank?: boolean } | undefined
    const children = values?.subagentCatalog
    const runningSubagentCount = Array.isArray(children)
      ? children.filter(child => typeof child?.id === 'string' && running.has(child.id)).length
      : 0
    return {
      sessionId: id, deviceId: 'local', running: running.has(id), origin,
      blank: session === undefined ? false : metadata?.blank ?? session.seq === 0,
      runningSubagentCount,
    }
  }

  const facts = new Map<string, SessionAttentionFact>()
  for (const record of records) {
    const id = String(record.header.id)
    facts.set(id, factFor(id, record.header.origin))
  }
  // Include Sessions created after the persistence query sampled its catalog;
  // apply the same metadata/child projection to these new parent rows as well.
  for (const [id, session] of live) {
    if (!facts.has(id)) facts.set(id, factFor(id, session.header?.origin))
  }
  signal?.throwIfAborted()
  return sameServices() ? [...facts.values()] : undefined
}

import { isNamespacedSessionId, isNamespacedWorkspaceId, type DeviceCatalogCache } from '../contract.ts'
import type { RemoteSessionSummary, RemoteWorkspaceItem } from './remote-client.ts'

export function isCatalogRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const sequence = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value) && value >= -1
const sessionId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && !isNamespacedSessionId(value)
const workspaceId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && !isNamespacedWorkspaceId(value)
export function catalogSessionIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter(sessionId))] : []
}

/** Validate rows independently; never coerce a remote identity or truthy running flag. */
export function parseSessionSummary(value: unknown, legacy = false): RemoteSessionSummary | undefined {
  if (!isCatalogRecord(value) || !sessionId(value.sessionId)) return undefined
  if (!legacy && (!finite(value.updatedAt) || typeof value.agentAvailable !== 'boolean' ||
    typeof value.running !== 'boolean' || typeof value.blank !== 'boolean')) return undefined
  if (value.updatedAt !== undefined && !finite(value.updatedAt)) return undefined
  if (value.running !== undefined && typeof value.running !== 'boolean') return undefined
  if (value.blank !== undefined && typeof value.blank !== 'boolean') return undefined
  if (value.parentSessionId !== undefined && !sessionId(value.parentSessionId)) return undefined
  if (value.origin !== undefined && value.origin !== 'subagent') return undefined
  if (value.cwd !== undefined && typeof value.cwd !== 'string') return undefined
  const projection = value.projections
  return {
    sessionId: value.sessionId,
    updatedAt: finite(value.updatedAt) ? value.updatedAt : 0,
    agentAvailable: typeof value.agentAvailable === 'boolean' ? value.agentAvailable : false,
    running: value.running === true,
    blank: value.blank === true,
    ...(typeof value.parentSessionId === 'string' ? { parentSessionId: value.parentSessionId } : {}),
    ...(value.origin === 'subagent' ? { origin: 'subagent' as const } : {}),
    ...(typeof value.cwd === 'string' ? { cwd: value.cwd } : {}),
    ...(isCatalogRecord(projection) && sequence(projection.asOfSeq) && isCatalogRecord(projection.values) &&
      (projection.kind === 'cached' || projection.kind === 'sequenced' || legacy)
      ? { projections: { kind: projection.kind === 'sequenced' ? 'sequenced' as const : 'cached' as const,
          asOfSeq: projection.asOfSeq, values: { ...projection.values } } } : {}),
  }
}

export function parseWorkspace(value: unknown, legacy = false): RemoteWorkspaceItem | undefined {
  if (!isCatalogRecord(value) || !workspaceId(value.workspaceId) || typeof value.path !== 'string') return undefined
  if (!legacy && (typeof value.title !== 'string' || typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' || !Array.isArray(value.sessionIds))) return undefined
  return {
    workspaceId: value.workspaceId, path: value.path,
    title: typeof value.title === 'string' ? value.title : value.path,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    sessionIds: catalogSessionIds(value.sessionIds),
  }
}

type SessionDelta =
  | { type: 'upsert'; summary: RemoteSessionSummary }
  | { type: 'remove'; id: string }
  | { type: 'status'; id: string; running: boolean }
  | { type: 'activity'; id: string; updatedAt: number }
type Projection = { asOfSeq: number; values: Record<string, unknown> }
export interface CatalogProjectionUpdate { sessionId: string; key: string; value: unknown; seq: number }
interface ListFlight { epoch: number; request: number; journal: SessionDelta[]; overflow: boolean; promise: Promise<boolean> }

/** Per-device facts/reducer. Transport owns IO/callbacks, never directory arrays. */
export class DeviceCatalog {
  private generation = 0
  private request = 0
  private flight: ListFlight | undefined
  private rows: RemoteSessionSummary[] = []
  private workspaceRows: RemoteWorkspaceItem[] = []
  private archived: string[] = []
  private pinned: string[] = []
  private readonly projections = new Map<string, Projection>()
  private readonly projectionSequences = new Map<string, Map<string, number>>()
  private readonly projectionBaselines = new Map<string, number>()
  private readyParts = new Set<'events' | 'sessions' | 'workspace' | 'control'>()
  private staleValue = false
  private syncedAtValue: number | undefined

  get epoch(): number { return this.generation }
  get stale(): boolean { return this.staleValue }
  get syncedAt(): number | undefined { return this.syncedAtValue }
  get sessions(): readonly RemoteSessionSummary[] { return this.rows }
  get workspaces(): readonly RemoteWorkspaceItem[] { return this.workspaceRows }
  get archivedIds(): readonly string[] { return this.archived }
  get pinnedIds(): readonly string[] { return this.pinned }
  get controlProjections(): ReadonlyMap<string, Projection> { return this.projections }
  get ready(): boolean { return this.readyParts.size === 4 }
  get eventsReady(): boolean { return this.readyParts.has('events') }
  isCurrent(epoch: number): boolean { return epoch === this.generation }

  beginEpoch(): number {
    this.generation += 1
    this.request += 1
    this.flight = undefined
    this.readyParts.clear()
    this.projections.clear()
    this.projectionSequences.clear()
    this.projectionBaselines.clear()
    this.staleValue = true
    return this.generation
  }
  disconnect(): void { this.beginEpoch() }
  markEventsReady(epoch: number): void { if (this.isCurrent(epoch)) this.readyParts.add('events') }
  markLive(epoch: number, legacy = false): boolean {
    if (!this.isCurrent(epoch) || (legacy
      ? !this.readyParts.has('sessions') || !this.readyParts.has('workspace')
      : !this.ready)) return false
    this.staleValue = false
    this.syncedAtValue = Date.now()
    return true
  }
  visibleSessions(): readonly RemoteSessionSummary[] {
    return this.staleValue ? this.rows.map(row => ({ ...row, running: false, agentAvailable: false })) : this.rows
  }
  hydrate(cache: DeviceCatalogCache): boolean {
    if (this.rows.length || this.workspaceRows.length || this.readyParts.size) return false
    this.rows = cache.sessions.map(row => parseSessionSummary({ ...row,
      ...(typeof row.title === 'string' ? { projections: { kind: 'cached', asOfSeq: 0, values: { title: row.title } } } : {}),
    })).filter((row): row is RemoteSessionSummary => row !== undefined)
    this.workspaceRows = cache.workspaces.map(row => parseWorkspace(row)).filter((row): row is RemoteWorkspaceItem => row !== undefined)
    this.setArchivedIds(cache.archivedSessionIds)
    this.setPinnedIds(cache.pinnedSessionIds)
    this.syncedAtValue = cache.syncedAt
    this.staleValue = true
    return true
  }
  setArchivedIds(ids: readonly string[]): void { this.archived = catalogSessionIds(ids) }
  setPinnedIds(ids: readonly string[]): void { this.pinned = catalogSessionIds(ids) }

  /** Replace validated facts without introducing a second transport-side table. */
  replaceSessions(items: readonly unknown[]): void {
    this.rows = items.map(item => parseSessionSummary(item)).filter((row): row is RemoteSessionSummary => row !== undefined)
  }

  /** Explicit freshness override for hydration/test adapters; readiness stays independent. */
  setStale(stale: boolean): void { this.staleValue = stale }

  /** Single flight per epoch; an individual caller cannot cancel another caller's flight. */
  refreshSessions(epoch: number, load: () => Promise<unknown>, legacy = false,
    signal?: AbortSignal, onBeforeCommit?: () => void): Promise<boolean> {
    if (!this.isCurrent(epoch)) return Promise.resolve(false)
    if (this.flight?.epoch === epoch) return this.flight.promise
    const request = ++this.request
    const flight: ListFlight = { epoch, request, journal: [], overflow: false, promise: Promise.resolve(false) }
    this.flight = flight
    flight.promise = Promise.resolve().then(() => {
      if (signal?.aborted || !this.isCurrent(epoch) || this.flight !== flight) return undefined
      return load()
    }).then(value => {
      if (signal?.aborted || !this.isCurrent(epoch) || this.flight !== flight || request !== this.request) return false
      if (!isCatalogRecord(value) || !Array.isArray(value.items)) throw new Error('Invalid remote session/list baseline')
      if (flight.overflow) throw new Error('Remote catalog changed too quickly during baseline; reconnect required')
      const rows = value.items.map(row => parseSessionSummary(row, legacy)).filter((row): row is RemoteSessionSummary => row !== undefined)
      onBeforeCommit?.()
      this.rows = [...new Map(rows.map(row => [row.sessionId, this.withControlHints(row, true)])).values()]
      for (const delta of flight.journal) this.reduceSession(delta)
      const present = new Set(this.rows.map(row => row.sessionId))
      for (const id of this.projections.keys()) if (!present.has(id)) {
        this.projections.delete(id)
        this.projectionSequences.delete(id)
        this.projectionBaselines.delete(id)
      }
      this.readyParts.add('sessions')
      if (!this.staleValue) this.syncedAtValue = Date.now()
      return true
    }).finally(() => { if (this.flight === flight) this.flight = undefined })
    return flight.promise
  }

  applySessionEvent(epoch: number, event: string, args: readonly unknown[]): boolean {
    if (!this.isCurrent(epoch)) return false
    const [id, value] = args
    let delta: SessionDelta
    if (event === 'api-session/added') {
      const summary = parseSessionSummary(id)
      if (summary === undefined) return false
      delta = { type: 'upsert', summary }
    } else {
      if (!sessionId(id)) return false
      if (event === 'api-session/removed') delta = { type: 'remove', id }
      else if (event === 'api-session/status' && typeof value === 'boolean') delta = { type: 'status', id, running: value }
      else if (event === 'api-session/activity' && finite(value)) delta = { type: 'activity', id, updatedAt: value }
      else return false
    }
    const flight = this.flight
    if (flight?.epoch === epoch) {
      if (flight.journal.length >= 10_000) flight.overflow = true
      else flight.journal.push(delta)
    }
    this.reduceSession(delta)
    return true
  }
  private withControlHints(row: RemoteSessionSummary, incoming = false): RemoteSessionSummary {
    if (incoming && row.projections?.kind === 'sequenced') {
      const block = this.projections.get(row.sessionId)
      const sequences = this.projectionSequences.get(row.sessionId) ?? new Map<string, number>()
      const values = { ...block?.values }
      let changed = false
      for (const key of ['title', 'sessionListMetadata']) {
        if (!Object.hasOwn(row.projections.values, key)) continue
        const watermark = sequences.get(key) ?? this.projectionBaselines.get(row.sessionId) ?? -Infinity
        if (row.projections.asOfSeq <= watermark) continue
        values[key] = row.projections.values[key]
        sequences.set(key, row.projections.asOfSeq)
        changed = true
      }
      if (changed) {
        this.projectionSequences.set(row.sessionId, sequences)
        this.projections.set(row.sessionId, { asOfSeq: Math.max(block?.asOfSeq ?? -1, row.projections.asOfSeq), values })
      }
    }
    const control = this.projections.get(row.sessionId)
    if (control === undefined || (!Object.hasOwn(control.values, 'title') &&
      !Object.hasOwn(control.values, 'sessionListMetadata'))) return row
    const values = { ...row.projections?.values }
    for (const [key, value] of Object.entries(control.values)) {
      if (key !== 'title' && key !== 'sessionListMetadata') continue
      // The control reducer already enforced the per-key live watermark.
      values[key] = value
    }
    const metadata = control.values.sessionListMetadata
    return { ...row,
      ...(isCatalogRecord(metadata) && typeof metadata.blank === 'boolean' ? { blank: metadata.blank } : {}),
      projections: { kind: 'sequenced',
      asOfSeq: Math.max(row.projections?.asOfSeq ?? -1, control.asOfSeq), values } }
  }

  private syncControlHints(): void {
    this.rows = this.rows.map(row => this.withControlHints(row))
  }

  private reduceSession(delta: SessionDelta): void {
    if (delta.type === 'upsert') {
      const summary = this.withControlHints(delta.summary, true)
      const index = this.rows.findIndex(row => row.sessionId === summary.sessionId)
      this.rows = index < 0 ? [summary, ...this.rows] : this.rows.map((row, i) => i === index ? summary : row)
    } else if (delta.type === 'remove') {
      this.rows = this.rows.filter(row => row.sessionId !== delta.id)
      this.projections.delete(delta.id)
      this.projectionSequences.delete(delta.id)
      this.projectionBaselines.delete(delta.id)
    } else {
      this.rows = this.rows.map(row => row.sessionId !== delta.id ? row : delta.type === 'status'
        ? { ...row, running: delta.running, agentAvailable: true }
        : { ...row, updatedAt: Math.max(row.updatedAt, delta.updatedAt) })
    }
  }

  applyWorkspaceFrame(epoch: number, frame: unknown, legacy = false): boolean {
    if (!this.isCurrent(epoch) || !isCatalogRecord(frame)) return false
    if ((frame.type === 'baseline' || frame.type === 'replace') && isCatalogRecord(frame.value) && Array.isArray(frame.value.items)) {
      this.workspaceRows = frame.value.items.map(row => parseWorkspace(row, legacy)).filter((row): row is RemoteWorkspaceItem => row !== undefined)
      this.setArchivedIds(catalogSessionIds(frame.value.archivedSessionIds))
      this.setPinnedIds(catalogSessionIds(frame.value.pinnedSessionIds))
      this.readyParts.add('workspace')
    } else if (frame.type === 'upsert') {
      const row = parseWorkspace(frame.workspace, legacy)
      if (row === undefined) return false
      const index = this.workspaceRows.findIndex(existing => existing.workspaceId === row.workspaceId)
      this.workspaceRows = index < 0 ? [row, ...this.workspaceRows] : this.workspaceRows.map((existing, i) => i === index ? row : existing)
    } else if (frame.type === 'remove' && workspaceId(frame.workspaceId)) {
      this.workspaceRows = this.workspaceRows.filter(row => row.workspaceId !== frame.workspaceId)
    } else if (frame.type === 'order' && Array.isArray(frame.workspaceIds)) {
      const rank = new Map(frame.workspaceIds.filter(workspaceId).map((id, i) => [id, i]))
      this.workspaceRows = [...this.workspaceRows].sort((a, b) => (rank.get(a.workspaceId) ?? Infinity) - (rank.get(b.workspaceId) ?? Infinity))
    } else if (frame.type === 'archived' && Array.isArray(frame.archivedSessionIds)) this.setArchivedIds(catalogSessionIds(frame.archivedSessionIds))
    else if (frame.type === 'pinned' && Array.isArray(frame.pinnedSessionIds)) this.setPinnedIds(catalogSessionIds(frame.pinnedSessionIds))
    else return false
    return true
  }

  applyControlFrame(epoch: number, frame: unknown, namespace: (key: string, value: unknown) => unknown): CatalogProjectionUpdate[] | undefined {
    if (!this.isCurrent(epoch) || !isCatalogRecord(frame)) return undefined
    const updates: CatalogProjectionUpdate[] = []
    if (frame.type === 'baseline' && isCatalogRecord(frame.value) && isCatalogRecord(frame.value.projections)) {
      // beginEpoch already cleared old projections; even the first baseline cannot rewind deltas.
      for (const [id, block] of Object.entries(frame.value.projections)) {
        if (!sessionId(id) || !isCatalogRecord(block) || !sequence(block.asOfSeq) || !isCatalogRecord(block.values)) continue
        const existing = this.projections.get(id)
        if ((this.projectionBaselines.get(id) ?? -Infinity) >= block.asOfSeq) continue
        const sequences = this.projectionSequences.get(id) ?? new Map<string, number>()
        const values: Record<string, unknown> = { ...existing?.values }
        // A baseline is a complete cut, except for keys already advanced past that cut.
        for (const key of Object.keys(values)) {
          if (!Object.hasOwn(block.values, key) && (sequences.get(key) ?? -1) <= block.asOfSeq) {
            delete values[key]
            sequences.delete(key)
          }
        }
        for (const [key, raw] of Object.entries(block.values)) {
          if ((sequences.get(key) ?? -Infinity) > block.asOfSeq) continue
          const value = namespace(key, raw)
          values[key] = value
          sequences.set(key, block.asOfSeq)
          updates.push({ sessionId: id, key, value, seq: Math.max(0, block.asOfSeq) })
        }
        this.projections.set(id, { asOfSeq: Math.max(existing?.asOfSeq ?? -1, block.asOfSeq), values })
        this.projectionBaselines.set(id, block.asOfSeq)
        this.projectionSequences.set(id, sequences)
      }
      this.readyParts.add('control')
      this.syncControlHints()
      return updates
    }
    if (frame.type !== 'projection' || !sessionId(frame.sessionId) || typeof frame.key !== 'string' || !sequence(frame.seq) || frame.seq < 0) return undefined
    const existing = this.projections.get(frame.sessionId)
    const sequences = this.projectionSequences.get(frame.sessionId) ?? new Map<string, number>()
    const watermark = sequences.get(frame.key) ?? this.projectionBaselines.get(frame.sessionId) ?? -1
    if (frame.seq <= watermark) return undefined
    const value = namespace(frame.key, frame.value)
    sequences.set(frame.key, frame.seq)
    this.projectionSequences.set(frame.sessionId, sequences)
    this.projections.set(frame.sessionId, { asOfSeq: Math.max(existing?.asOfSeq ?? -1, frame.seq), values: { ...existing?.values, [frame.key]: value } })
    if (frame.key === 'title' || frame.key === 'sessionListMetadata') this.syncControlHints()
    return [{ sessionId: frame.sessionId, key: frame.key, value, seq: frame.seq }]
  }
}

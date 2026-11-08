import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeviceId, encodeRemoteSessionId } from '../src/contract.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import type { RemoteSessionSummary } from '../src/host/remote-client.ts'
import type { ReadStateTracker } from '../src/host/read-state.ts'

const mocks = vi.hoisted(() => ({ identity: vi.fn(), exec: vi.fn() }))
vi.mock('../src/host/completion-identity.ts', () => ({ readRemoteCompletionIdentity: mocks.identity }))
vi.mock('../src/host/tunnel.ts', () => ({ execSshCommand: mocks.exec, probeSshTunnel: vi.fn(), SshTunnel: class {} }))
const registries: DeviceRegistry[] = []
afterEach(() => { for (const registry of registries.splice(0)) registry.dispose(); vi.useRealTimers(); vi.clearAllMocks() })
interface Internals {
  clients: Map<string, unknown>
  readTracker: ReadStateTracker
  observeRemoteFrame(id: string, frame: unknown): void
  promoteSharedCompletions(id: string): Promise<void>
  pushSharedReadState(id: string): Promise<void>
  scheduleSharedReadStatePush(id: string, delay?: number): void
  sharedReadStateTarget(id: string): unknown
  sharedReadStateDirty: Set<string>
  sharedReadStatePushTimers: Map<string, unknown>
  sharedReadStateInFlight: Set<string>
}
function setup(count = 1) {
  const dir = mkdtempSync(join(tmpdir(), 'shared-attention-'))
  const registry = new DeviceRegistry(join(dir, 'state.json'), join(dir, 'secrets.json'), {
    localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map(),
  }, { enableNativeProxy: false, enableTunnels: false })
  registries.push(registry)
  registry.updateUiPreferences({ crossHostReadState: true })
  const internal = registry as unknown as Internals
  let generation = 1
  const rows: RemoteSessionSummary[] = Array.from({ length: count }, (_, index) => ({
    sessionId: `s${index}`, updatedAt: 1, agentAvailable: true, running: false, blank: false,
  }))
  const client = { id: 'dev', get connectionGeneration() { return generation }, catalogFresh: true,
    isConnected: () => true, sessionSummaries: () => rows,
    pendingInteractionList: () => [], archivedIds: () => [], pinnedIds: () => [], workspaceItems: () => [],
    namespaceSummary: (row: RemoteSessionSummary) => ({ ...row, sessionId: encodeRemoteSessionId(DeviceId('dev'), row.sessionId) }),
    toView: () => ({ id: 'dev', state: 'connected', remoteHome: '/home/test' }),
    catalogSnapshot: () => ({ syncedAt: 0, sessions: [], workspaces: [] }), stop() {},
    deviceConfig: { transport: { kind: 'ssh', host: 'fixture' } },
  }
  internal.clients.set('dev', client)
  internal.sharedReadStateTarget = () => ({ transport: { kind: 'ssh', host: 'fixture' }, path: '/state' })
  const finish = (index: number) => {
    const id = encodeRemoteSessionId(DeviceId('dev'), `s${index}`)
    internal.observeRemoteFrame('dev', { type: 'emit', event: 'api-session/status', args: [id, true] })
    internal.observeRemoteFrame('dev', { type: 'emit', event: 'api-session/status', args: [id, false] })
    return id
  }
  return { registry, internal, rows, finish, nextGeneration: () => { generation++ } }
}

describe('shared completion causal binding and delivery', () => {
  it('never promotes a restored/legacy old read to a newer terminal merely because idle', async () => {
    const { registry, internal } = setup()
    const id = encodeRemoteSessionId(DeviceId('dev'), 's0')
    internal.readTracker.hydrate({ [id]: { unread: false, at: 1, completionId: 'old-read', readCompletionId: 'old-read' } })
    mocks.identity.mockResolvedValue('turn:99:2')
    await internal.promoteSharedCompletions('dev')
    expect(mocks.identity).not.toHaveBeenCalled()
    expect(registry.snapshot().readCompletions?.[id]).toBe('old-read')
  })

  it('only binds an observed same-generation completion and preserves a read made before promotion', async () => {
    const { registry, internal, finish } = setup()
    const id = finish(0)
    const observed = registry.snapshot().readCompletions![id]!
    registry.markSessionRead(id, observed)
    mocks.identity.mockResolvedValue('turn:9:1')
    await internal.promoteSharedCompletions('dev')
    expect(registry.snapshot().readCompletions?.[id]).toBe('turn:9:1')
    expect(registry.snapshot().unreadSessionIds).not.toContain(id)
  })

  it('does not bind prior-generation evidence after reconnect', async () => {
    const { internal, finish, nextGeneration } = setup()
    finish(0)
    nextGeneration()
    await internal.promoteSharedCompletions('dev')
    expect(mocks.identity).not.toHaveBeenCalled()
  })

  it('round-robins past unsupported first-eight candidates instead of starving later completions', async () => {
    const { registry, internal, finish } = setup(9)
    for (let index = 0; index < 9; index++) finish(index)
    mocks.identity.mockImplementation(async (_client, id) => id === 's8' ? 'turn:99:3' : undefined)
    await internal.promoteSharedCompletions('dev')
    await internal.promoteSharedCompletions('dev')
    expect(registry.snapshot().readCompletions?.[encodeRemoteSessionId(DeviceId('dev'), 's8')]).toBe('turn:99:3')
  })

  it('rejects an identity resolved after a newer completion replaced its observed token', async () => {
    const { registry, internal, finish } = setup()
    const id = finish(0)
    let resolve!: (value: string) => void
    mocks.identity.mockReturnValue(new Promise<string>(done => { resolve = done }))
    const promotion = internal.promoteSharedCompletions('dev')
    finish(0)
    const newer = registry.snapshot().readCompletions![id]
    resolve('turn:9:1')
    await promotion
    expect(registry.snapshot().readCompletions![id]).toBe(newer)
    expect(registry.snapshot().unreadSessionIds).toContain(id)
  })

  it('requeues dirty read state changed after a shared document was serialized', async () => {
    vi.useFakeTimers()
    const { registry, internal, finish } = setup()
    const id = finish(0)
    for (const timer of internal.sharedReadStatePushTimers.values()) clearTimeout(timer as ReturnType<typeof setTimeout>)
    internal.sharedReadStatePushTimers.clear()
    mocks.identity.mockResolvedValue('turn:9:1')
    let release!: () => void
    let started!: () => void
    const writing = new Promise<void>(resolve => { started = resolve })
    const waiting = new Promise<void>(resolve => { release = resolve })
    mocks.exec.mockResolvedValueOnce({ ok: true, stdout: '' }).mockImplementationOnce(async () => { started(); await waiting; return { ok: true, stdout: '' } })
    const push = internal.pushSharedReadState('dev')
    await writing
    registry.markSessionRead(id, registry.snapshot().readCompletions![id])
    expect(internal.sharedReadStateDirty.has('dev')).toBe(true)
    release()
    await push
    expect(internal.sharedReadStateInFlight.has('dev')).toBe(false)
    expect(internal.sharedReadStateDirty.has('dev')).toBe(false)
    expect(internal.sharedReadStatePushTimers.has('dev')).toBe(true)
    mocks.exec.mockResolvedValueOnce({ ok: true, stdout: '' }).mockResolvedValueOnce({ ok: true, stdout: '' })
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.exec).toHaveBeenCalledTimes(4)
    const command = String(mocks.exec.mock.calls[3]![1])
    const payload = command.match(/[A-Za-z0-9+/=]{80,}/)?.[0]
    expect(payload).toBeDefined()
    const document = JSON.parse(Buffer.from(payload!, 'base64').toString('utf8'))
    const section = Object.values(document.hosts)[0] as { sessions: Record<string, { unread: boolean; completionId?: string; readCompletionId?: string }> }
    expect(section.sessions.s0).toMatchObject({ unread: false, completionId: 'turn:9:1', readCompletionId: 'turn:9:1' })
  })

  it('retries a failed shared write even when no new read-state event arrives', async () => {
    vi.useFakeTimers()
    const { internal } = setup()
    for (const timer of internal.sharedReadStatePushTimers.values()) clearTimeout(timer as ReturnType<typeof setTimeout>)
    internal.sharedReadStatePushTimers.clear()
    mocks.exec
      .mockResolvedValueOnce({ ok: true, stdout: '' })
      .mockResolvedValueOnce({ ok: false, error: 'remote disk full' })
    await internal.pushSharedReadState('dev')
    expect(internal.sharedReadStateInFlight.has('dev')).toBe(false)
    expect(internal.sharedReadStatePushTimers.has('dev')).toBe(true)
    expect(mocks.exec).toHaveBeenCalledTimes(2)
    mocks.exec.mockResolvedValue({ ok: true, stdout: '' })
    await vi.advanceTimersByTimeAsync(999)
    expect(mocks.exec).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.exec).toHaveBeenCalledTimes(4)
    expect(internal.sharedReadStatePushTimers.has('dev')).toBe(false)
    expect(internal.sharedReadStateDirty.has('dev')).toBe(false)
  })
})

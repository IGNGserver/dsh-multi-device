import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeviceRegistry, type LocalHostProvider } from '../src/host/registry.ts'
import type { SessionAttentionFact } from '../src/attention.ts'
import { MultiDeviceControlPlane } from '../src/runtime.ts'

const registries: DeviceRegistry[] = []
afterEach(() => { for (const registry of registries.splice(0)) registry.dispose() })
function make(provider: Partial<LocalHostProvider> = {}, dir = mkdtempSync(join(tmpdir(), 'attention-registry-'))) {
  const registry = new DeviceRegistry(join(dir, 'state.json'), join(dir, 'secrets.json'), {
    localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map(), ...provider,
  }, { enableNativeProxy: false, enableTunnels: false })
  registries.push(registry)
  return { registry, dir }
}
const fact = (id: string, running = false): SessionAttentionFact => ({ sessionId: id, deviceId: 'local', running })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('registry authoritative attention integration', () => {
  it('prunes a persisted deleted local unread only after a successful complete query', async () => {
    const first = make()
    first.registry.observeLocalSessionStatus('gone', true)
    first.registry.observeLocalSessionStatus('gone', false)
    first.registry.saveToDisk()
    first.registry.dispose()
    let available = false
    const next = make({ localSessionCatalog: async () => available ? [] : undefined }, first.dir).registry
    expect(next.snapshot().unreadSessionIds).toContain('gone')
    await next.refreshLocalCatalog()
    expect(next.snapshot().unreadSessionIds).toContain('gone')
    expect(next.snapshot().attentionByDevice?.local.fresh).toBe(false)
    available = true
    await next.refreshLocalCatalog()
    expect(next.snapshot().unreadSessionIds).not.toContain('gone')
    expect(next.snapshot().attentionByDevice?.local.fresh).toBe(true)
    next.saveToDisk()
    const restored = make({}, first.dir).registry
    expect(restored.snapshot().unreadSessionIds).not.toContain('gone')
  })

  it('replays status and removal arriving during a local full query', async () => {
    const pending = deferred<readonly SessionAttentionFact[]>()
    const registry = make({ localSessionCatalog: () => pending.promise }).registry
    const query = registry.refreshLocalCatalog()
    registry.observeLocalSessionStatus('s', true)
    registry.forgetLocalSession('gone')
    pending.resolve([fact('s'), fact('gone', true)])
    await query
    expect(registry.snapshot().attentionByDevice?.local.runningSessionIds).toEqual(['s'])
    expect(registry.snapshot().attentionByDevice?.local.eligibleSessionIds).toEqual(['s'])
  })

  it('rejects late local catalog writes after disposal', async () => {
    const pending = deferred<readonly SessionAttentionFact[]>()
    const registry = make({ localSessionCatalog: () => pending.promise }).registry
    const query = registry.refreshLocalCatalog()
    registry.dispose()
    pending.resolve([fact('late', true)])
    await query
    expect(registry.snapshot().attentionByDevice?.local.fresh).toBe(false)
    expect(registry.snapshot().attentionByDevice?.local.eligibleSessionIds).toEqual([])
  })

  it('classifies each sidebar member once, while keeping request count separate', async () => {
    const registry = make({ localSessionCatalog: async () => [fact('wait', true), fact('run', true), fact('done'),
      { ...fact('child', true), origin: 'subagent' }, { ...fact('blank', true), blank: true }], localArchivedSessionIds: () => ['archived'] }).registry
    await registry.refreshLocalCatalog()
    registry.observeLocalSessionStatus('done', true)
    registry.observeLocalSessionStatus('done', false)
    registry.observeLocalPending([{ eventId: 'e1', sessionId: 'wait', kind: 'question' }, { eventId: 'e2', sessionId: 'wait', kind: 'approval' }])
    const view = registry.snapshot().attentionByDevice!.local
    expect(view.pendingSessionIds).toEqual(['wait'])
    expect(view.pendingRequestCount).toBe(2)
    expect(view.runningSessionIds).toEqual(['run'])
    expect(view.unreadSessionIds).toEqual(['done'])
    registry.setActiveSession('blank', 1, 'browser')
    expect(registry.snapshot('browser').attentionByDevice!.local.runningSessionIds).toEqual(['blank', 'run'])
    registry.forgetLocalSession('wait')
    expect(registry.snapshot().attentionByDevice!.local.pendingRequestCount).toBe(0)
  })

  it('retains known members but marks failed subsequent catalogs stale', async () => {
    let unavailable = false
    const registry = make({ localSessionCatalog: async () => unavailable ? undefined : [fact('s', true)] }).registry
    await registry.refreshLocalCatalog()
    expect(registry.snapshot().attentionByDevice!.local.fresh).toBe(true)
    unavailable = true
    await registry.refreshLocalCatalog()
    expect(registry.snapshot().attentionByDevice!.local.fresh).toBe(false)
    expect(registry.snapshot().attentionByDevice!.local.runningSessionIds).toEqual(['s'])
    expect(registry.snapshot().unreadSessionIds).toEqual([])
  })

  it('counts a local parent row once when only its child is active', async () => {
    const registry = make({ localSessionCatalog: async () => [
      { ...fact('parent'), runningSubagentCount: 1 }, { ...fact('child', true), origin: 'subagent' },
    ] }).registry
    await registry.refreshLocalCatalog()
    expect(registry.snapshot().attentionByDevice!.local.runningSessionIds).toEqual(['parent'])
  })

  it('control-plane stale read cannot consume a newer completion', async () => {
    const registry = make({ localSessionCatalog: async () => [fact('s')] }).registry
    await registry.refreshLocalCatalog()
    registry.observeLocalSessionStatus('s', true)
    registry.observeLocalSessionStatus('s', false)
    const old = registry.snapshot().readCompletions!.s
    registry.observeLocalSessionStatus('s', true)
    registry.observeLocalSessionStatus('s', false)
    const current = registry.snapshot().readCompletions!.s
    expect(current).not.toBe(old)
    const plane = new MultiDeviceControlPlane(registry, () => true)
    await plane.dispatch({ action: 'markSessionRead', payload: { sessionId: 's', expectedCompletionId: old } })
    expect(registry.snapshot().unreadSessionIds).toContain('s')
    await plane.dispatch({ action: 'markSessionRead', payload: { sessionId: 's', expectedCompletionId: current } })
    expect(registry.snapshot().unreadSessionIds).not.toContain('s')
  })
})

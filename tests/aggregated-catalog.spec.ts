import { describe, expect, it, vi } from 'vitest'
import { buildAggregatedCatalog, catalogRow } from '../src/host/aggregated-catalog.ts'
import { DeviceId, encodeRemoteSessionId } from '../src/contract.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import { MultiDeviceControlPlane } from '../src/runtime.ts'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const device = DeviceId('device-a')
const workspace = (ids: string[]) => ({ logicalWorkspaceId: 'project', title: 'Project', kind: 'single' as const,
  targetDeviceId: device, targetPath: '/repo', effectiveTargetDeviceId: device, effectiveTargetPath: '/repo', effectiveTargetOnline: false,
  members: [], sessionIds: ids, createdAt: '', updatedAt: '' })
const summary = (id: string) => ({ sessionId: id, updatedAt: 10, running: false, blank: false, agentAvailable: false, projections: { kind: 'cached' as const, asOfSeq: 1, values: { title: `Title ${id}` } } })

describe('independent aggregated catalog', () => {
  it('publishes rows and references together, keeping incomplete caches visible as explicit placeholders', () => {
    const id = encodeRemoteSessionId(device, 's1'), missing = encodeRemoteSessionId(device, 's2')
    const row = catalogRow(id, device, summary('s1'), true)
    const catalog = buildAggregatedCatalog(8, { [id]: row }, [workspace([id, missing])], [id, id])
    expect(catalog.sessions[id].title).toBe('Title s1')
    expect(catalog.sessions[missing]).toMatchObject({ rawSessionId: 's2', deviceId: device, missing: true, stale: true })
    expect(catalog.issues[device]).toBeTruthy()
    expect(catalog.pinnedSessionIds).toEqual([id])
  })

  it('retains more than 2000 lightweight session rows and 300 workspaces in the durable catalog', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-catalog-'))
    const registry = new DeviceRegistry(join(root, 'state.json'), join(root, 'secrets.json'), {
      localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map(),
    }, { enableNativeProxy: false })
    try {
      const sessions = Array.from({ length: 2501 }, (_, i) => summary(`s${i}`))
      const workspaces = Array.from({ length: 350 }, (_, i) => ({ workspaceId: `w${i}`, title: 'P', path: `/p${i}`, sessionIds: ['s2500'], createdAt: '', updatedAt: '' }))
      registry.setDeviceCatalog({ deviceId: device, protocolVersion: '0.2', syncedAt: 1, sessions, workspaces, archivedSessionIds: [], pinnedSessionIds: [] })
      expect(registry.deviceCatalog(device)?.sessions).toHaveLength(2501)
      expect(registry.deviceCatalog(device)?.workspaces).toHaveLength(350)
      expect(registry.deviceCatalog(device)?.catalogTruncated).toBe(false)
    } finally { registry.dispose() }
  })

  it('routes remote commands with raw IDs and exact official request envelopes, and never falls back to local', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-catalog-'))
    const registry = new DeviceRegistry(join(root, 'state.json'), join(root, 'secrets.json'), {
      localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map(),
    }, { enableNativeProxy: false })
    const invokeUnary = vi.fn(async (namespace: string, method: string) => method === 'pinSession' ? { pinnedSessionIds: ['s1'] } : method === 'fork' ? { sessionId: 'new' } : {})
    const client = { id: device, deviceConfig: { name: 'A' }, isConnected: () => true, invokeUnary,
      refreshSessionCatalog: vi.fn(async () => {}), setArchivedIds: vi.fn(), setPinnedIds: vi.fn() }
    ;(registry as any).clients.set(device, client)
    vi.spyOn(registry, 'refreshWorkspaceView').mockImplementation(() => {})
    try {
      const id = encodeRemoteSessionId(device, 's1')
      await registry.catalogSessionAction(id, 'rename', 'New title')
      expect(invokeUnary).toHaveBeenCalledWith('session', 'rename', { request: { sessionId: 's1', title: 'New title' } })
      await registry.catalogSessionAction(id, 'pin')
      expect(invokeUnary).toHaveBeenCalledWith('workspace', 'pinSession', { request: { sessionId: 's1' } })
      expect(client.setPinnedIds).toHaveBeenCalledWith(['s1'])
      expect(await registry.catalogSessionAction(id, 'fork')).toEqual({ sessionId: encodeRemoteSessionId(device, 'new') })
      ;(registry as any).clients.clear()
      await expect(registry.catalogSessionAction(id, 'rename', 'Missing')).rejects.toThrow('removed')
    } finally { (registry as any).clients.clear(); registry.dispose() }
  })

  it('rejects unknown control-plane operations instead of dispatching arbitrary remote methods', async () => {
    const action = vi.fn()
    const plane = new MultiDeviceControlPlane({ catalogSessionAction: action } as any)
    expect(await plane.dispatch({ action: 'catalogSessionAction', payload: { operation: 'prompt', sessionId: 's1' } })).toEqual({ ok: false, error: 'Invalid session operation' })
    expect(action).not.toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeviceId, type DeviceCatalogCache } from '../src/contract.ts'
import { decodeCatalogDocument, encodeCatalogDocument } from '../src/host/catalog-codec.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import { JsonSnapshotFile } from '../src/host/storage.ts'

const dirs: string[] = []
const registries: DeviceRegistry[] = []
function dir(): string { const value = mkdtempSync(join(tmpdir(), 'dsh-catalog-codec-')); dirs.push(value); return value }
const cache: DeviceCatalogCache = {
  deviceId: DeviceId('dev-cache'), syncedAt: 1_760_000_000_000, protocolVersion: '0.2',
  sessions: [{ sessionId: 'session~%/~雪', title: 'Retained title', updatedAt: 42, agentAvailable: true, running: false, blank: false, cwd: '/tmp/project' }],
  workspaces: [{ workspaceId: 'workspace~%雪', path: '/tmp/project', title: 'Project', sessionIds: ['session~%/~雪'], createdAt: 'a', updatedAt: 'b' }],
  archivedSessionIds: ['archived~%雪'], pinnedSessionIds: ['session~%/~雪'],
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const registry of registries.splice(0)) { registry.dispose(); await registry.flushPersistence().catch(() => {}) }
  for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('versioned raw catalog persistence', () => {
  it('round-trips lossy-looking raw IDs without namespacing or dropping titles', () => {
    const encoded = encodeCatalogDocument(new Map([[cache.deviceId, cache]]))
    expect(encoded.version).toBe(2)
    expect(decodeCatalogDocument(encoded).get(cache.deviceId)).toEqual(cache)
    expect(decodeCatalogDocument(JSON.parse(JSON.stringify(encoded))).get(cache.deviceId)).toEqual(cache)
    const invalid = { ...cache, sessions: [{ ...cache.sessions[0], sessionId: 'md~other~nested' }] }
    expect(() => encodeCatalogDocument(new Map([[cache.deviceId, invalid]]))).toThrow('Invalid catalog document')
  })

  it('does not create an empty catalog file for a pristine registry or after synchronous dispose', async () => {
    const root = dir(), data = join(root, 'devices.json'), secrets = join(root, 'secrets.json')
    const registry = new DeviceRegistry(data, secrets,
      { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() },
      { enableNativeProxy: false, enableTunnels: false })
    registries.push(registry)
    registry.dispose()
    await registry.flushPersistence()
    expect(existsSync(join(root, 'catalogs.json'))).toBe(false)
    registry.setDeviceCatalog(cache)
    await registry.flushPersistence()
    expect(JSON.parse(readFileSync(join(root, 'catalogs.json'), 'utf8')).version).toBe(2)
  })

  it('persists an intentionally empty v2 catalog after removing the final device', async () => {
    const root = dir(), data = join(root, 'devices.json'), secrets = join(root, 'secrets.json')
    new JsonSnapshotFile(data).write({ version: 1, hostId: 'fixture-host-123', devices: [{
      id: cache.deviceId, name: 'Cache', enabled: false,
      transport: { kind: 'direct', baseUrl: 'http://fixture.invalid:3081' }, auth: { mode: 'none' },
    }] })
    const registry = new DeviceRegistry(data, secrets,
      { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() },
      { enableNativeProxy: false, enableTunnels: false, allowDirectTransport: true })
    registries.push(registry)
    registry.setDeviceCatalog(cache)
    await registry.flushPersistence()
    expect(registry.removeDevice(cache.deviceId)).toBe(true)
    await registry.flushPersistence()
    expect(JSON.parse(readFileSync(join(root, 'catalogs.json'), 'utf8'))).toMatchObject({ version: 2, catalogs: {} })
  })

  it('writes v2 before removing legacy catalogs and retries a failed main-document cleanup', async () => {
    const root = dir(), data = join(root, 'devices.json'), secrets = join(root, 'secrets.json')
    const storage = new JsonSnapshotFile(data)
    storage.write({ version: 1, hostId: 'fixture-host-123', devices: [{
      id: cache.deviceId, name: 'Cache', enabled: false,
      transport: { kind: 'direct', baseUrl: 'http://fixture.invalid:3081' }, auth: { mode: 'none' },
    }], catalogs: { [cache.deviceId]: cache } })
    const registry = new DeviceRegistry(data, secrets,
      { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() },
      { enableNativeProxy: false, allowDirectTransport: true })
    registries.push(registry)
    const save = vi.spyOn(registry, 'saveToDisk').mockImplementationOnce(() => { throw new Error('synthetic main cleanup failure') })
    await expect(registry.flushPersistence()).rejects.toThrow('synthetic main cleanup failure')
    expect(JSON.parse(readFileSync(data, 'utf8')).catalogs[cache.deviceId].syncedAt).toBe(cache.syncedAt)
    expect(JSON.parse(readFileSync(join(root, 'catalogs.json'), 'utf8')).version).toBe(2)
    expect(registry.snapshot().hostStatus.catalogPersistenceError).toContain('synthetic main cleanup failure')
    save.mockRestore()
    await registry.flushPersistence()
    expect(JSON.parse(readFileSync(data, 'utf8')).catalogs).toBeUndefined()
    expect(registry.snapshot().hostStatus.catalogPersistenceError).toBeUndefined()

    const restored = new DeviceRegistry(data, secrets,
      { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() },
      { enableNativeProxy: false, allowDirectTransport: true })
    registries.push(restored)
    expect(restored.deviceCatalog(cache.deviceId)).toEqual(cache)
  })
})

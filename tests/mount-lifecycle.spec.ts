import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceId, type UpsertDeviceInput } from '../src/contract.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import { RemoteDeviceClient } from '../src/host/remote-client.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.restoreAllMocks()
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function makeRegistry() {
  vi.spyOn(RemoteDeviceClient.prototype, 'start').mockImplementation(() => {})
  const directory = mkdtempSync(join(process.cwd(), '.quality-mount-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  const registry = new DeviceRegistry(join(directory, 'state.json'), join(directory, 'secrets.json'), {
    localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map(),
  }, { enableTunnels: false, allowDirectTransport: true })
  cleanups.push(() => registry.dispose())
  return registry
}
function input(name: string): UpsertDeviceInput {
  return {
    id: 'mount-fixture', name, enabled: true,
    transport: { kind: 'direct', baseUrl: 'http://192.0.2.1:3080' },
    auth: { mode: 'none' },
  }
}

describe('deferred Native proxy mount lifecycle', () => {
  it('does not resurrect a removed client when proxy setup finishes', async () => {
    const registry = makeRegistry()
    const pending = deferred<string | undefined>()
    vi.spyOn(registry.nativeProxyManager, 'ensureProxy').mockReturnValue(pending.promise)
    const mounting = registry.upsertDevice(input('A'))
    await vi.waitFor(() => expect(registry.client(DeviceId('mount-fixture'))).toBeDefined())
    expect(registry.removeDevice(DeviceId('mount-fixture'))).toBe(true)
    pending.resolve('http://127.0.0.1:41000')
    await mounting
    expect(registry.client(DeviceId('mount-fixture'))).toBeUndefined()
    expect(registry.snapshot().devices).toHaveLength(0)
  })

  it('keeps the newest A→B configuration and proxy result', async () => {
    const registry = makeRegistry()
    const first = deferred<string | undefined>()
    const second = deferred<string | undefined>()
    vi.spyOn(registry.nativeProxyManager, 'ensureProxy')
      .mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const mountingA = registry.upsertDevice(input('A'))
    await vi.waitFor(() => expect(registry.client(DeviceId('mount-fixture'))).toBeDefined())
    const mountingB = registry.upsertDevice(input('B'))
    second.resolve('http://127.0.0.1:42002')
    await mountingB
    first.resolve('http://127.0.0.1:42001')
    await mountingA
    const current = registry.client(DeviceId('mount-fixture'))
    expect(current?.deviceConfig.name).toBe('B')
    expect(current?.toView().nativeProxyUrl).toBe('http://127.0.0.1:42002')
  })

  it('does not restart a client after registry disposal', async () => {
    const registry = makeRegistry()
    const pending = deferred<string | undefined>()
    vi.spyOn(registry.nativeProxyManager, 'ensureProxy').mockReturnValue(pending.promise)
    const mounting = registry.upsertDevice(input('A'))
    await vi.waitFor(() => expect(registry.client(DeviceId('mount-fixture'))).toBeDefined())
    registry.dispose()
    pending.resolve('http://127.0.0.1:43000')
    await mounting
    expect(registry.client(DeviceId('mount-fixture'))).toBeUndefined()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DeviceId } from '../src/contract.ts'
import { DeviceAuthManager } from '../src/host/auth.ts'
import { DeviceRegistry } from '../src/host/registry.ts'

const ID = DeviceId('transaction-fixture')
const dirs: string[] = []
const registries: DeviceRegistry[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const registry of registries.splice(0)) registry.dispose()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function paths() {
  const dir = mkdtempSync(join(process.cwd(), '.storage-transactions-'))
  dirs.push(dir)
  return { data: join(dir, 'data.json'), secrets: join(dir, 'secrets.json') }
}
function registry(path: ReturnType<typeof paths>) {
  const value = new DeviceRegistry(path.data, path.secrets,
    { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() },
    { enableNativeProxy: false, enableTunnels: true, allowDirectTransport: true })
  registries.push(value)
  return value
}
const input = { id: ID, name: 'Original', enabled: false,
  transport: { kind: 'direct' as const, baseUrl: 'http://fixture.invalid:3081' },
  auth: { mode: 'none' as const } }

describe('refused writes preserve live transaction state', () => {
  it('rejects stale mode/UI/upsert/remove before mutating a second registry', async () => {
    const path = paths()
    const a = registry(path)
    await a.upsertDevice(input)
    const b = registry(path)
    a.updateUiPreferences({ sessionRowDeviceDot: true })
    const original = b.deviceConfig(ID)
    const ui = b.ui()
    expect(() => b.setDisplayMode('native')).toThrow('reload before saving')
    expect(b.getDisplayMode()).toBe('aggregated')
    expect(() => b.updateUiPreferences({ nativePane: false })).toThrow('reload before saving')
    expect(b.ui()).toBe(ui)
    await expect(b.upsertDevice({ ...input, name: 'Rejected' })).rejects.toThrow('reload before saving')
    expect(b.deviceConfig(ID)).toBe(original)
    expect(() => b.removeDevice(ID)).toThrow('reload before saving')
    expect(b.deviceConfig(ID)).toBe(original)
    expect(JSON.parse(readFileSync(path.data, 'utf8')).devices[0].name).toBe('Original')
  })

  it('refuses busy writes before registry side effects', async () => {
    const path = paths(), value = registry(path)
    await value.upsertDevice(input)
    const stop = vi.spyOn(value.client(ID)!, 'stop')
    writeFileSync(`${path.data}.lock`, 'fixture-lock')
    expect(() => value.removeDevice(ID)).toThrow('Storage is busy')
    expect(stop).not.toHaveBeenCalled()
    expect(value.deviceConfig(ID)?.name).toBe('Original')
    expect(() => value.setDisplayMode('native')).toThrow('Storage is busy')
    expect(value.getDisplayMode()).toBe('aggregated')
  })

  it('rolls back mode/UI changes on an IO failure after preflight', () => {
    const path = paths(), value = registry(path)
    const ui = value.ui()
    vi.spyOn(value, 'saveToDisk').mockImplementation(() => { throw new Error('synthetic IO failure') })
    expect(() => value.setDisplayMode('native')).toThrow('synthetic IO failure')
    expect(value.getDisplayMode()).toBe('aggregated')
    expect(() => value.updateUiPreferences({ nativePane: false })).toThrow('synthetic IO failure')
    expect(value.ui()).toBe(ui)
  })

  it('restores aggregation config after an IO failure and rejects stale config before mutation', async () => {
    const path = paths(), value = registry(path)
    await value.upsertDevice(input)
    const other = registry(path)
    value.updateAggregationConfig({ autoGitAggregate: false })
    expect(() => other.updateAggregationConfig({ prefixUnmatchedWithDevice: true })).toThrow('reload before saving')
    expect(other.aggregator.getConfig().prefixUnmatchedWithDevice).toBe(false)
    const before = value.aggregator.getConfig()
    vi.spyOn(value, 'saveToDisk').mockImplementation(() => { throw new Error('synthetic IO failure') })
    expect(() => value.mutateAggregation(() => value.aggregator.setCustomTitle('example', 'Rejected'))).toThrow('synthetic IO failure')
    expect(value.aggregator.getConfig()).toEqual(before)
  })

  it('keeps device configuration and live clients when the config save fails after preflight', async () => {
    const path = paths(), value = registry(path)
    await value.upsertDevice(input)
    const original = value.deviceConfig(ID)
    const stop = vi.spyOn(value.client(ID)!, 'stop')
    vi.spyOn(value, 'saveToDisk').mockImplementation(() => { throw new Error('synthetic IO failure') })
    await expect(value.upsertDevice({ ...input, name: 'Rejected' })).rejects.toThrow('synthetic IO failure')
    expect(value.deviceConfig(ID)).toBe(original)
    expect(() => value.removeDevice(ID)).toThrow('synthetic IO failure')
    expect(value.deviceConfig(ID)).toBe(original)
    expect(stop).not.toHaveBeenCalled()
  })

  it('checks the secrets lock before a registry removal changes clients', async () => {
    const path = paths(), value = registry(path)
    await value.upsertDevice(input)
    const stop = vi.spyOn(value.client(ID)!, 'stop')
    writeFileSync(`${path.secrets}.lock`, 'synthetic-lock')
    expect(() => value.removeDevice(ID)).toThrow('Storage is busy')
    expect(value.deviceConfig(ID)?.name).toBe('Original')
    expect(stop).not.toHaveBeenCalled()
  })

  it('rolls back a rejected credential/passphrase update, invalidation, and removal', () => {
    const path = paths(), a = new DeviceAuthManager(path.secrets)
    a.setAuthCredential(ID, 'original-synthetic-credential')
    a.setSshPassphrase(ID, 'original-synthetic-passphrase')
    const b = new DeviceAuthManager(path.secrets)
    const original = b.storedSecret(ID)
    a.setAuthCredential(ID, 'other-host-synthetic-credential')
    expect(() => b.setAuthCredential(ID, 'rejected-credential')).toThrow('reload before saving')
    expect(b.storedSecret(ID)).toBe(original)
    expect(() => b.setSshPassphrase(ID, 'rejected-passphrase')).toThrow('reload before saving')
    expect(b.storedSecret(ID)).toBe(original)
    expect(() => b.invalidate(ID)).toThrow('reload before saving')
    expect(b.storedSecret(ID)).toBe(original)
    expect(() => b.removeDevice(ID)).toThrow('reload before saving')
    expect(b.storedSecret(ID)).toBe(original)
  })

  it.each(['upsert', 'remove'] as const)('restores durable credentials after %s config save failure', async action => {
    const path = paths(), value = registry(path)
    await value.upsertDevice({ ...input, auth: { mode: 'bearer', credential: 'original-fixture' } })
    const original = JSON.parse(readFileSync(path.secrets, 'utf8')).secrets[ID]
    vi.spyOn(value, 'saveToDisk').mockImplementation(() => { throw new Error('synthetic config failure') })
    if (action === 'upsert') {
      await expect(value.upsertDevice({ ...input, auth: { mode: 'bearer', credential: 'rejected-fixture' } })).rejects.toThrow('synthetic config failure')
    } else expect(() => value.removeDevice(ID)).toThrow('synthetic config failure')
    expect(JSON.parse(readFileSync(path.secrets, 'utf8')).secrets[ID]).toEqual(original)
    expect(value.deviceConfig(ID)?.name).toBe('Original')
  })

  it('restores the credential when the later passphrase setter fails', async () => {
    const path = paths(), value = registry(path)
    await value.upsertDevice({ ...input, auth: { mode: 'bearer', credential: 'original-fixture' } })
    const original = JSON.parse(readFileSync(path.secrets, 'utf8')).secrets[ID]
    vi.spyOn(DeviceAuthManager.prototype, 'setSshPassphrase').mockImplementation(() => { throw new Error('synthetic second setter failure') })
    await expect(value.upsertDevice({ ...input,
      transport: { kind: 'ssh', host: 'fixture.invalid', passphrase: 'rejected-passphrase' },
      auth: { mode: 'auto', credential: 'rejected-fixture' },
    })).rejects.toThrow('synthetic second setter failure')
    expect(JSON.parse(readFileSync(path.secrets, 'utf8')).secrets[ID]).toEqual(original)
    expect(value.deviceConfig(ID)?.transport.kind).toBe('direct')
  })

  it('preserves the primary error and exposes a failed compensation as AggregateError', async () => {
    const path = paths(), value = registry(path)
    await value.upsertDevice({ ...input, auth: { mode: 'bearer', credential: 'original-fixture' } })
    const originalError = new Error('synthetic primary failure')
    const rollbackError = new Error('synthetic compensation failure')
    vi.spyOn(value, 'saveToDisk').mockImplementation(() => { throw originalError })
    vi.spyOn(DeviceAuthManager.prototype, 'restoreDevice').mockImplementation(() => { throw rollbackError })
    let rejected: unknown
    try { await value.upsertDevice({ ...input, auth: { mode: 'bearer', credential: 'replacement-fixture' } }) }
    catch (error) { rejected = error }
    expect(rejected).toBeInstanceOf(AggregateError)
    expect((rejected as AggregateError).errors).toEqual([originalError, rollbackError])
    expect((rejected as AggregateError).cause).toBe(originalError)
    expect((rejected as Error).message).toContain('synthetic primary failure')
    expect(value.deviceConfig(ID)?.name).toBe('Original')
  })

  it('blocks incompatible object schemas rather than replacing them with default state', () => {
    for (const document of [{}, { version: 2, devices: [], secrets: {} }]) {
      const path = paths(), text = JSON.stringify(document)
      writeFileSync(path.data, text)
      writeFileSync(path.secrets, text)
      const value = registry(path)
      const auth = new DeviceAuthManager(path.secrets)
      expect(() => value.setDisplayMode('native')).toThrow('Cannot overwrite')
      expect(() => auth.setAuthCredential(ID, 'synthetic')).toThrow('Cannot overwrite')
      expect(auth.storedSecret(ID)).toBeUndefined()
      expect(readFileSync(path.data, 'utf8')).toBe(text)
      expect(readFileSync(path.secrets, 'utf8')).toBe(text)
    }
  })
})

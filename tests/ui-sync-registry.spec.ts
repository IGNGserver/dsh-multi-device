import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeviceId } from '../src/contract.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import { HlcClock, patchUiScope } from '../src/host/ui-state.ts'

const mocks = vi.hoisted(() => ({ exec: vi.fn() }))
vi.mock('../src/host/tunnel.ts', () => ({
  execSshCommand: mocks.exec,
  probeSshTunnel: vi.fn(),
  SshTunnel: class {},
}))

const registries: DeviceRegistry[] = []
afterEach(() => {
  for (const registry of registries.splice(0)) registry.dispose()
  vi.clearAllMocks()
})

interface Internals {
  clients: Map<string, unknown>
  configs: Map<string, unknown>
  pullUiSync(id: string): Promise<void>
  pushUiSync(id: string): Promise<void>
  uiStateForDevice(id: string): unknown
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'ui-sync-registry-'))
  const registry = new DeviceRegistry(join(dir, 'state.json'), join(dir, 'secrets.json'), {
    localPort: () => 3080,
    localWorkspaces: () => [],
    localSessionUpdatedAt: () => new Map(),
  }, { enableTunnels: false, enableNativeProxy: false } as never)
  registries.push(registry)
  registry.updateUiPreferences({ crossHostUiState: true })
  const internal = registry as unknown as Internals
  const client = {
    id: 'dev', connectionGeneration: 1, catalogFresh: true,
    isConnected: () => true, sessionSummaries: () => [],
    pendingInteractionList: () => [], archivedIds: () => [], pinnedIds: () => [],
    workspaceItems: () => [], stop() {},
    namespaceSummary: (row: unknown) => row,
    toView: () => ({ id: 'dev', state: 'connected', remoteHome: '/home/me' }),
    catalogSnapshot: () => ({ syncedAt: 0, sessions: [], workspaces: [] }),
    deviceConfig: { transport: { kind: 'ssh', host: 'ubuntu-dev', username: 'lvziw', port: 22 } },
  }
  internal.clients.set('dev', client)
  internal.configs.set(DeviceId('dev'), {
    id: DeviceId('dev'), name: 'dev', enabled: true,
    transport: { kind: 'ssh', host: 'ubuntu-dev', username: 'lvziw', port: 22 },
    auth: { mode: 'none' },
  })
  return { registry, internal }
}

describe('Controller-to-Controller view state', () => {
  it('merges a peer document into the device scope and keeps it out of the local snapshot', async () => {
    const { registry, internal } = setup()
    const peer = new HlcClock('peer-host')
    const scopes = {
      'remote:ssh:lvziw@ubuntu-dev:22': patchUiScope(undefined, { groups: { ws1: true }, groupBy: 'flat' }, peer),
    }
    mocks.exec.mockResolvedValue({
      ok: true,
      stdout: `${JSON.stringify({ version: 1, hostId: 'peer-host', updatedAt: 1, scopes })}\u001e`,
    })
    await internal.pullUiSync('dev')
    expect(internal.uiStateForDevice(DeviceId('dev'))).toEqual({ groups: { ws1: true }, groupBy: 'flat' })
    expect(registry.snapshot().uiState).toBeUndefined()
  })

  it('writes this Controller file under the remote DSH home, not the OS home', async () => {
    const { internal } = setup()
    mocks.exec.mockResolvedValue({ ok: true, stdout: '' })
    await internal.pushUiSync('dev')
    const [, command] = mocks.exec.mock.calls[0]!
    expect(String(command)).toContain('/home/me/.dsh/plugins/dsh-multi-device/views')
    expect(String(command)).not.toContain('/home/me/plugins/dsh-multi-device')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeviceId, sanitizeWorkspaceViewState } from '../src/contract.ts'
import {
  formatHlc,
  HlcClock,
  mergeUiScope,
  parseUiStateDocument,
  patchUiScope,
  remoteUiScopeKey,
  uiScopeState,
} from '../src/host/ui-state.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import { buildNativeBridgeScript } from '../src/host/native-bridge.ts'
import { installLocalUiStateSync } from '../src/client/uiState.ts'

const registries: DeviceRegistry[] = []
afterEach(() => {
  for (const registry of registries.splice(0)) registry.dispose()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function registry(file?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'ui-state-'))
  const stateFile = file ?? join(dir, 'state.json')
  const instance = new DeviceRegistry(stateFile, join(dir, 'secrets.json'), {
    localPort: () => 3080,
    localWorkspaces: () => [],
    localSessionUpdatedAt: () => new Map(),
  }, { enableTunnels: false, enableNativeProxy: false } as never)
  registries.push(instance)
  return { instance, stateFile }
}

describe('HLC and per-field merge', () => {
  it('is monotonic within one Host and observes a remote clock', () => {
    const clock = new HlcClock('host-a')
    const first = clock.next(1_000)
    const second = clock.next(1_000)
    expect(first < second).toBe(true)
    const remote = formatHlc(9_000, 3, 'host-b')
    clock.observe(remote)
    expect(clock.next(1_000) > remote).toBe(true)
  })

  it('merges different workspaces and lets a newer field win without dropping the other keys', () => {
    const clockA = new HlcClock('host-a')
    const clockB = new HlcClock('host-b')
    const a = patchUiScope(undefined, { groups: { ws1: true }, groupBy: 'workspace' }, clockA)
    const b = patchUiScope(undefined, { groups: { ws2: false }, groupBy: 'flat' }, clockB)
    const merged = mergeUiScope(a, b)!
    expect(uiScopeState(merged)?.groups).toEqual({ ws1: true, ws2: false })
    expect(uiScopeState(merged)?.groupBy).toBe('flat')
    const newer = patchUiScope(merged, { groups: { ws1: false } }, clockB)
    expect(uiScopeState(newer)?.groups.ws1).toBe(false)
    expect(uiScopeState(newer)?.groups.ws2).toBe(false)
  })

  it('ignores malformed persisted records and unknown modes', () => {
    expect(parseUiStateDocument({ version: 1, scopes: { local: { groups: { a: { value: true, at: 'x' } } } } })).toEqual({ version: 1, scopes: {} })
    expect(sanitizeWorkspaceViewState({ groups: { a: true }, groupBy: 'nope' })).toEqual({ groups: { a: true } })
    expect(parseUiStateDocument({ version: 2, scopes: {} })).toBeUndefined()
  })

  it('keys one remote page by transport identity, not by a Controller-local device id', () => {
    expect(remoteUiScopeKey({ kind: 'ssh', host: 'Ubuntu-Dev', username: 'lvziw', port: 22 }))
      .toBe('remote:ssh:lvziw@ubuntu-dev:22')
    expect(remoteUiScopeKey({ kind: 'ssh', host: 'ubuntu-dev', username: 'lvziw' }))
      .toBe('remote:ssh:lvziw@ubuntu-dev:22')
    expect(remoteUiScopeKey({ kind: 'direct', baseUrl: 'https://Example.com:3080/' }))
      .toBe('remote:http:https://example.com:3080')
  })
})

describe('registry-owned local view state', () => {
  it('publishes one local snapshot and reloads the same fold/group state', () => {
    const first = registry()
    expect(first.instance.patchLocalUiState({ groups: { ws1: true }, groupBy: 'workspace', archivedFilter: 'default' }).ok).toBe(true)
    expect(first.instance.snapshot().uiState).toEqual({ groups: { ws1: true }, groupBy: 'workspace', archivedFilter: 'default' })
    first.instance.saveToDisk()
    const second = registry(first.stateFile).instance
    expect(second.snapshot().uiState).toEqual({ groups: { ws1: true }, groupBy: 'workspace', archivedFilter: 'default' })
  })

  it('gives every browser the same snapshot after a second fold change', () => {
    const instance = registry().instance
    instance.patchLocalUiState({ groups: { ws1: true } })
    const one = instance.snapshot('client-a').uiState
    instance.patchLocalUiState({ groups: { ws1: false, ws2: true } })
    const two = instance.snapshot('client-b').uiState
    expect(one).toEqual({ groups: { ws1: true } })
    expect(two).toEqual({ groups: { ws1: false, ws2: true } })
  })
})

describe('client local bridge', () => {
  it('reports baseline changes and applies Host state through the original actions', async () => {
    vi.useFakeTimers()
    const values = new Map<string, string>([[
      'dsh.workspace.view.v5',
      JSON.stringify({ groupExpansion: { ws1: true }, groupBy: 'workspace', orderBy: 'updated', archivedFilter: 'default' }),
    ]])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size },
      clear: () => values.clear(),
    })
    const calls: { name: string; args: unknown[] }[] = []
    const view = {
      setGroupExpanded: (key: string, expanded: boolean) => { calls.push({ name: 'group', args: [key, expanded] }) },
      retainAccountKeys: () => {},
      setGroupBy: (mode: string) => { calls.push({ name: 'groupBy', args: [mode] }) },
      setOrderBy: (mode: string) => { calls.push({ name: 'orderBy', args: [mode] }) },
      setArchivedFilter: (filter: string) => { calls.push({ name: 'archived', args: [filter] }) },
    }
    const reports: unknown[] = []
    let hostState: ReturnType<typeof sanitizeWorkspaceViewState> | undefined
    let notify: (() => void) | undefined
    const dispose = installLocalUiStateSync({
      uiWorkspace: { openSession: () => {}, view },
      getHostState: () => hostState,
      subscribeHostState: listener => { notify = listener; return () => { notify = undefined } },
      report: state => { reports.push(state) },
    })
    await vi.advanceTimersByTimeAsync(250)
    expect(reports[0]).toMatchObject({ groups: { ws1: true }, groupBy: 'workspace' })

    view.setGroupExpanded('ws2', true)
    await vi.advanceTimersByTimeAsync(250)
    expect(reports.at(-1)).toMatchObject({ groups: { ws1: true, ws2: true } })

    calls.length = 0
    hostState = { groups: { ws1: false } }
    notify?.()
    expect(calls).toContainEqual({ name: 'group', args: ['ws1', false] })
    dispose()
  })
})

describe('bridge wire contract', () => {
  it('serves the initial full state and listens for the full frame', () => {
    const script = buildNativeBridgeScript({ uiState: { groups: { ws1: true }, groupBy: 'flat' }, unread: [] })
    expect(script).toContain('__DSH_MD_UI_STATE__')
    expect(script).toContain('"groupBy":"flat"')
    expect(script).toContain("type: 'ui-state'")
    expect(script).toContain("data.type === 'ui-state'")
  })
})

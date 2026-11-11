import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HlcClock, patchUiScope, uiScopeState } from '../src/host/ui-state.ts'
import {
  buildReadUiSyncCommand,
  buildWriteUiSyncCommand,
  collectRemoteScopes,
  parseUiSyncDocument,
  uiSyncDir,
} from '../src/host/ui-sync.ts'

describe('controller view-state files', () => {
  it('builds the directory under the remote DSH home', () => {
    expect(uiSyncDir('/home/me/.dsh/')).toBe('/home/me/.dsh/plugins/dsh-multi-device/views')
  })

  it('only publishes remote scopes, never the local page', () => {
    const clock = new HlcClock('host-a')
    const local = patchUiScope(undefined, { groups: { ws1: true } }, clock)
    const remote = patchUiScope(undefined, { groups: { ws2: false } }, clock)
    const collected = collectRemoteScopes(new Map([['local', local], ['remote:ssh:me@dev:22', remote]]))
    expect(Object.keys(collected)).toEqual(['remote:ssh:me@dev:22'])
  })

  it('parses only well-formed Controller documents', () => {
    const clock = new HlcClock('host-a')
    const scopes = { 'remote:ssh:me@dev:22': patchUiScope(undefined, { groups: { ws1: true } }, clock) }
    expect(parseUiSyncDocument({ version: 1, hostId: 'host-a', updatedAt: 1, scopes })?.hostId).toBe('host-a')
    expect(parseUiSyncDocument({ version: 1, hostId: '../escape', scopes })).toBeUndefined()
    expect(parseUiSyncDocument({ version: 2, hostId: 'host-a', scopes })).toBeUndefined()
  })

  it('round-trips one atomic file through the generated shell command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ui-sync-'))
    const clock = new HlcClock('host-a')
    const scopes = { 'remote:ssh:me@dev:22': patchUiScope(undefined, { groups: { ws1: true }, groupBy: 'flat' }, clock) }
    execFileSync('sh', ['-c', buildWriteUiSyncCommand(dir, 'host-a', scopes)], { stdio: 'pipe' })
    const file = join(dir, 'host-a.json')
    const parsed = parseUiSyncDocument(JSON.parse(readFileSync(file, 'utf8')))
    expect(parsed?.hostId).toBe('host-a')
    expect(uiScopeState(parsed?.scopes['remote:ssh:me@dev:22'])).toEqual({ groups: { ws1: true }, groupBy: 'flat' })

    const second = parseUiSyncDocument(JSON.parse(JSON.stringify({ version: 1, hostId: 'host-b', updatedAt: 2, scopes })))
    writeFileSync(join(dir, 'host-b.json'), JSON.stringify(second))
    const read = execFileSync('sh', ['-c', buildReadUiSyncCommand(dir)], { encoding: 'utf8' })
    expect(read.split('\u001e').filter(part => part.trim() !== '')).toHaveLength(2)
  })
})

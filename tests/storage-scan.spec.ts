import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir, hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { JsonSnapshotFile, resolvePluginStorage } from '../src/host/storage.ts'
import { buildGitScanScript, parseGitScanOutput, parseGitScanProjection } from '../src/host/git-scan.ts'
import { buildReadSharedStateCommand, buildWriteSharedStateCommand, parseSharedReadDocument } from '../src/host/shared-state.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
import { DeviceId } from '../src/contract.ts'

const dirs: string[] = []
function temp(): string { const dir = mkdtempSync(join(tmpdir(), 'dsh-storage-')); dirs.push(dir); return dir }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('durable profile-local snapshots', () => {
  it('atomically saves JSON and a valid backup without temporary residues', () => {
    const dir = temp(), path = join(dir, 'data.json'), file = new JsonSnapshotFile(path)
    expect(file.read()).toBeUndefined()
    file.write({ value: 1 }); file.write({ value: 2 })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ value: 2 })
    expect(JSON.parse(readFileSync(`${path}.bak`, 'utf8'))).toEqual({ value: 1 })
    expect(readdirSync(dir).sort()).toEqual(['data.json', 'data.json.bak'])
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  it('rejects a stale writer rather than silently overwriting accepted changes', () => {
    const path = join(temp(), 'data.json'), a = new JsonSnapshotFile(path), b = new JsonSnapshotFile(path)
    a.read(); b.read(); a.write({ mode: 'native' })
    expect(() => b.write({ mode: 'aggregated' })).toThrow('reload before saving')
    expect(JSON.parse(readFileSync(path, 'utf8')).mode).toBe('native')
    b.read(); b.write({ mode: 'aggregated' })
  })

  it('restores a valid backup and preserves corrupt bytes', () => {
    const dir = temp(), path = join(dir, 'data.json'), file = new JsonSnapshotFile(path)
    file.read(); file.write({ value: 1 }); file.write({ value: 2 })
    writeFileSync(path, '{broken')
    expect(new JsonSnapshotFile(path).read()).toEqual({ value: 1 })
    expect(readdirSync(dir).some(name => name.includes('.corrupt-'))).toBe(true)
  })

  it('never overwrites unreadable JSON without a valid recovery copy', () => {
    const path = join(temp(), 'data.json'); writeFileSync(path, '{broken')
    const file = new JsonSnapshotFile(path)
    expect(() => file.read()).toThrow('Invalid JSON')
    expect(() => file.write({})).toThrow('Cannot overwrite')
    expect(readFileSync(path, 'utf8')).toBe('{broken')
  })

  it.each(['null', '[]', '"scalar"'])('never rotates invalid document %s over the valid backup', invalid => {
    const path = join(temp(), 'data.json')
    writeFileSync(path, invalid); writeFileSync(`${path}.bak`, '{"safe":true}')
    expect(new JsonSnapshotFile(path).read()).toEqual({ safe: true })
    expect(JSON.parse(readFileSync(`${path}.bak`, 'utf8'))).toEqual({ safe: true })
    writeFileSync(path, '{broken'); writeFileSync(`${path}.bak`, invalid)
    const file = new JsonSnapshotFile(path)
    expect(() => file.read()).toThrow('Invalid JSON and backup')
    expect(() => file.write({})).toThrow('Cannot overwrite')
  })

  it('keeps recovery blocked if its write failed even after the lock disappears', () => {
    const path = join(temp(), 'data.json')
    writeFileSync(path, '{broken'); writeFileSync(`${path}.bak`, '{"safe":true}'); writeFileSync(`${path}.lock`, 'fixture')
    const file = new JsonSnapshotFile(path)
    expect(() => file.read()).toThrow('Storage is busy')
    rmSync(`${path}.lock`)
    expect(() => file.write({})).toThrow('Cannot overwrite')
    expect(readFileSync(path, 'utf8')).toBe('{broken')
  })

  it('fails closed on another writer lock, leaving primary bytes intact', () => {
    const path = join(temp(), 'data.json'), file = new JsonSnapshotFile(path)
    file.read(); file.write({ value: 1 }); writeFileSync(`${path}.lock`, 'fixture')
    expect(() => file.write({ value: 2 })).toThrow('Storage is busy')
    expect(JSON.parse(readFileSync(path, 'utf8')).value).toBe(1)
  })

  it('recovers only a complete lock owned by a dead local process', () => {
    const path = join(temp(), 'data.json'), file = new JsonSnapshotFile(path)
    file.write({ value: 1 })
    const child = spawnSync(process.execPath, ['-e', ''], { stdio: 'ignore' })
    expect(child.status).toBe(0)
    expect(child.pid).toBeTypeOf('number')
    writeFileSync(`${path}.lock`, JSON.stringify({ version: 1, pid: child.pid, hostname: hostname(), owner: 'dead-owner-fixture', createdAt: Date.now() }))
    file.write({ value: 2 })
    expect(file.read()).toEqual({ value: 2 })
    expect(existsSync(`${path}.lock`)).toBe(false)
    expect(existsSync(`${path}.lock.recovery`)).toBe(false)
  })

  it.each(['alive', 'remote', 'invalid'])('never steals a %s lock', kind => {
    const path = join(temp(), 'data.json'), file = new JsonSnapshotFile(path)
    file.write({ value: 1 })
    const lock = kind === 'invalid' ? 'legacy fixture' : JSON.stringify({
      version: 1, pid: kind === 'alive' ? process.pid : 999999,
      hostname: kind === 'alive' ? hostname() : 'another-host.invalid', owner: 'protected-owner-fixture', createdAt: Date.now(),
    })
    writeFileSync(`${path}.lock`, lock)
    expect(() => file.write({ value: 2 })).toThrow('Storage is busy')
    expect(readFileSync(`${path}.lock`, 'utf8')).toBe(lock)
    expect(file.read()).toEqual({ value: 1 })
  })

  it('serializes async writes and retains async stale-writer CAS', async () => {
    const path = join(temp(), 'data.json'), file = new JsonSnapshotFile(path)
    await file.writeAsync({ value: 0 })
    await Promise.all([file.writeAsync({ value: 1 }), file.writeAsync({ value: 2 })])
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ value: 2 })
    expect(JSON.parse(readFileSync(`${path}.bak`, 'utf8'))).toEqual({ value: 1 })
    expect(readdirSync(dirname(path)).sort()).toEqual(['data.json', 'data.json.bak'])
    const stale = new JsonSnapshotFile(path)
    const current = new JsonSnapshotFile(path)
    await stale.readAsync(); await current.readAsync()
    await current.writeAsync({ value: 3 })
    await expect(stale.writeAsync({ value: 4 })).rejects.toThrow('reload before saving')
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ value: 3 })
  })

  it('copies legacy state once into independent Profile storage, preserving originals', () => {
    const home = temp(), legacy = join(home, 'plugins'); mkdirSync(legacy)
    writeFileSync(join(legacy, 'dsh-multi-device.json'), JSON.stringify({ version: 1, hostId: 'legacy-host', devices: [] }))
    writeFileSync(join(legacy, 'dsh-multi-device-secrets.json'), JSON.stringify({ version: 1, secrets: {} }))
    const web = resolvePluginStorage(home, join(home, 'profiles/web'))
    const desktop = resolvePluginStorage(home, join(home, 'profiles/desktop'))
    expect(web.dataFile).not.toBe(desktop.dataFile)
    const w = new JsonSnapshotFile(web.dataFile), d = new JsonSnapshotFile(desktop.dataFile)
    const original = w.read<any>(); const other = d.read<any>()
    expect(original.hostId).not.toBe(other.hostId)
    w.write({ ...original, displayMode: 'native' })
    expect(d.read<any>().displayMode).toBeUndefined()
    expect(resolvePluginStorage(home, join(home, 'profiles/web'))).toEqual(web)
    expect(w.read<any>().displayMode).toBe('native')
    expect(existsSync(join(legacy, 'dsh-multi-device.json'))).toBe(true)
  })

  it('marks only genuinely truncated catalog arrays', () => {
    const dir = temp(); const registry = new DeviceRegistry(join(dir, 'data.json'), join(dir, 'secrets.json'),
      { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() }, { enableNativeProxy: false })
    const base = { deviceId: DeviceId('dev-a'), syncedAt: 1, sessions: [], workspaces: [], archivedSessionIds: [], pinnedSessionIds: [] }
    try {
      registry.setDeviceCatalog(base)
      expect(registry.deviceCatalog(base.deviceId)?.catalogTruncated).toBe(false)
      registry.setDeviceCatalog({ ...base, pinnedSessionIds: Array.from({ length: 5000 }, (_, i) => `${i}`) })
      expect(registry.deviceCatalog(base.deviceId)?.catalogTruncated).toBe(false)
      registry.setDeviceCatalog({ ...base, pinnedSessionIds: Array.from({ length: 5001 }, (_, i) => `${i}`) })
      expect(registry.deviceCatalog(base.deviceId)?.catalogTruncated).toBe(true)
    } finally { registry.dispose() }
  })
})

describe.skipIf(process.platform === 'win32')('real POSIX scanning and shared-state writes', () => {
  it('executes one complete find expression, including worktrees but excluding caches and hidden state', () => {
    const dir = temp()
    for (const name of ['visible repo', 'node_modules/pkg', '.hidden/repo']) {
      const repo = join(dir, name)
      mkdirSync(repo, { recursive: true })
      execFileSync('git', ['init', '-q', repo])
      execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'https://github.com/example/repo.git'])
    }
    const main = join(dir, 'visible repo'), worktree = join(dir, '.wt', 'worktree')
    execFileSync('git', ['-C', main, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'])
    mkdirSync(join(dir, '.wt'), { recursive: true })
    execFileSync('git', ['-C', main, 'worktree', 'add', '-qb', 'scan-fixture', worktree])
    const output = execFileSync('sh', ['-c', buildGitScanScript([dir])], { encoding: 'utf8' })
    expect(parseGitScanOutput(output).map(repo => repo.path).sort()).toEqual([main, worktree].sort())
  })

  it('parses framed origins containing delimiters and reports truncation explicitly', () => {
    const output = ['__DSH_REPO_V2__', '/tmp/repo\twith delimiters', 'https://example.com/org/repo.git\n', '__DSH_SCAN_TRUNCATED_V2__', '__DSH_SCAN_DONE_V2__', ''].join('\0')
    const parsed = parseGitScanProjection(output)
    expect(parsed.complete).toBe(true)
    expect(parsed.truncated).toBe(true)
    expect(parsed.repos).toEqual([{ path: '/tmp/repo\twith delimiters', rawOrigin: 'https://example.com/org/repo.git', gitRemote: 'example.com/org/repo' }])
  })

  it('caps candidate processing without mistaking a partial scan for completion', () => {
    const dir = temp()
    for (const name of ['one', 'two']) {
      const repo = join(dir, name)
      mkdirSync(repo, { recursive: true })
      execFileSync('git', ['init', '-q', repo])
      execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', `https://example.com/org/${name}.git`])
    }
    const parsed = parseGitScanProjection(execFileSync('sh', ['-c', buildGitScanScript([dir], 4, 1)], { encoding: 'utf8' }))
    expect(parsed.complete).toBe(true)
    expect(parsed.truncated).toBe(true)
    expect(parsed.repos).toHaveLength(1)
  })

  it('reports broken worktree metadata instead of a successful empty scan', () => {
    const root = temp()
    writeFileSync(join(root, '.git'), 'gitdir: missing-worktree-metadata')
    expect(() => execFileSync('sh', ['-c', buildGitScanScript([root])], { stdio: 'pipe' })).toThrow()
  })

  it('bounds the merged Host count even when many shard files are present', () => {
    const frames = Array.from({ length: 25 }, (_, index) => JSON.stringify({ version: 1, hosts: {
      [`host-${index}`]: { updatedAt: index, sessions: {} },
    } })).join('\u001e')
    expect(Object.keys(parseSharedReadDocument(frames)?.hosts ?? {})).toHaveLength(20)
  })

  it('propagates find failure instead of reporting an empty successful scan', () => {
    expect(() => execFileSync('sh', ['-c', `find() { return 19; }; ${buildGitScanScript([temp()])}`], { stdio: 'pipe' })).toThrow()
  })

  it('preserves a pretty-printed legacy document alongside new Host shards', () => {
    const path = join(temp(), 'read-state.json')
    writeFileSync(path, JSON.stringify({ version: 1, hosts: { legacy: { updatedAt: 1, sessions: { old: { at: 1, unread: true } } } } }, null, 2))
    execFileSync('sh', ['-c', buildWriteSharedStateCommand(path, { version: 1, hosts: {
      newer: { updatedAt: 2, sessions: {} },
    } }, 'newer')])
    const output = execFileSync('sh', ['-c', buildReadSharedStateCommand(path)], { encoding: 'utf8' })
    expect(Object.keys(parseSharedReadDocument(output)?.hosts ?? {}).sort()).toEqual(['legacy', 'newer'])
  })

  it('preserves both concurrent Host sections without read-modify-write races', async () => {
    const path = join(temp(), "space ' dir", 'read-state.json')
    const run = (id: string) => new Promise<void>((resolve, reject) => {
      const child = spawn('sh', ['-c', buildWriteSharedStateCommand(path, { version: 1, hosts: {
        [id]: { updatedAt: 1, sessions: { [id]: { at: 1, unread: true } } },
      } }, id)])
      let stderr = ''; child.stderr.on('data', data => { stderr += data })
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(stderr)))
    })
    await Promise.all([run('host-a'), run('host-b')])
    const output = execFileSync('sh', ['-c', buildReadSharedStateCommand(path)], { encoding: 'utf8' })
    expect(Object.keys(parseSharedReadDocument(output)?.hosts ?? {}).sort()).toEqual(['host-a', 'host-b'])
    expect(readdirSync(`${path}.hosts`).sort()).toEqual(['host-a.json', 'host-b.json'])
  })
})

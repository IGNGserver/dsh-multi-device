import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceId, LOCAL_DEVICE_ID, type SshTransportConfig } from '../src/contract.ts'
import { buildGitOriginScript, discoverLocalGitRemote, discoverRemoteGitRemotesViaSsh, parseGitConfigRemoteUrl, WorkspaceAggregator } from '../src/host/git-aggregator.ts'
import { assertGitPathNamespace, encodeGitScript, encodePowerShell, GitPlatformProbe, gitPlatformProbe, quotePowerShell, type GitRemotePlatform } from '../src/host/git-platform.ts'
import { buildGitScanScript, buildPowerShellGitScanScript, deriveScanRoots, parseGitScanOutput, scanLocalGitRepos, scanRemoteGitRepos } from '../src/host/git-scan.ts'
import { execSshCommand } from '../src/host/tunnel.ts'

vi.mock('../src/host/tunnel.ts', () => ({ execSshCommand: vi.fn() }))
const transport: SshTransportConfig = { kind: 'ssh', host: 'git-test' }
const posix: GitRemotePlatform = { shell: 'posix', namespace: 'posix', launcher: 'sh' }
const windows: GitRemotePlatform = { shell: 'powershell', namespace: 'windows', launcher: 'powershell' }
const dirs: string[] = []
function temp(): string { const path = mkdtempSync(join(tmpdir(), 'dsh-git-platform-')); dirs.push(path); return path }
function git(...args: string[]): string { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
function repo(path: string): void {
  mkdirSync(path, { recursive: true }); git('init', '-q', path)
  git('-C', path, 'remote', 'add', 'origin', 'https://example.com/Team/CaseSensitive.git')
}
beforeEach(() => {
  const config = join(temp(), 'global.gitconfig'); writeFileSync(config, '')
  vi.stubEnv('GIT_CONFIG_GLOBAL', config); vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks(); vi.mocked(execSshCommand).mockReset(); gitPlatformProbe.invalidate()
  for (const dir of dirs.splice(0)) {
    const target = resolve(dir)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('dsh-git-platform-')) {
      throw new Error(`Refusing cleanup of unexpected test directory: ${target}`)
    }
    rmSync(target, { recursive: true, force: true })
  }
})

describe('Git shell capabilities', () => {
  it('deduplicates probes, expires positives and permits explicit invalidation', async () => {
    let now = 0
    const exec = vi.fn(async () => ({ ok: true as const, stdout: '__DSH_POSIX__\nLinux\n' }))
    const probe = new GitPlatformProbe(exec, () => now, 100)
    const [a, b] = await Promise.all([probe.detect(transport), probe.detect(transport)])
    expect(a).toEqual(posix); expect(b).toEqual(posix); expect(exec).toHaveBeenCalledTimes(1)
    now = 99; await probe.detect(transport); expect(exec).toHaveBeenCalledTimes(1)
    now = 100; await probe.detect(transport); expect(exec).toHaveBeenCalledTimes(2)
    probe.invalidate(transport); await probe.detect(transport); expect(exec).toHaveBeenCalledTimes(3)
  })

  it('detects Windows cmd default shell using an encoded PowerShell probe', async () => {
    const exec = vi.fn().mockResolvedValueOnce({ ok: false, error: 'sh is not recognized' })
      .mockResolvedValueOnce({ ok: true, stdout: '__DSH_WINDOWS__\r\n' })
    const probe = new GitPlatformProbe(exec)
    expect(await probe.detect(transport)).toEqual(windows)
    expect(exec.mock.calls[1]?.[1]).toMatch(/^powershell .* -EncodedCommand [A-Za-z0-9+/=]+$/)
  })

  it('rejects Git Bash namespace guessing and falls back to pwsh', async () => {
    const exec = vi.fn().mockResolvedValueOnce({ ok: true, stdout: '__DSH_POSIX__\nMINGW64_NT\n' })
      .mockResolvedValueOnce({ ok: false, error: 'powershell missing' })
      .mockResolvedValueOnce({ ok: true, stdout: '__DSH_WINDOWS__\n' })
    expect(await new GitPlatformProbe(exec).detect(transport)).toEqual({ ...windows, launcher: 'pwsh' })
  })

  it('does not cache failures or mistake shell banner text for capability', async () => {
    const exec = vi.fn(async () => ({ ok: true as const, stdout: 'welcome to Windows' }))
    const probe = new GitPlatformProbe(exec)
    await expect(probe.detect(transport)).rejects.toThrow('Unable to probe')
    await expect(probe.detect(transport)).rejects.toThrow('Unable to probe')
    expect(exec).toHaveBeenCalledTimes(6)
  })

  it('retains WSL / Windows / UNC namespaces instead of translating them', () => {
    expect(() => assertGitPathNamespace('/mnt/c/项目/repo', posix)).not.toThrow()
    expect(() => assertGitPathNamespace('C:\\项目\\repo', posix)).toThrow('namespace')
    expect(() => assertGitPathNamespace('/mnt/c/项目/repo', windows)).toThrow('namespace')
    expect(() => assertGitPathNamespace('C:\\项目\\repo', windows)).not.toThrow()
    expect(() => assertGitPathNamespace('\\\\server\\share\\repo', windows)).not.toThrow()
    expect(() => assertGitPathNamespace('/repo\nother', posix)).toThrow('line separators')
    expect(deriveScanRoots('C:\\Users\\甲', ['D:\\项目\\repo'])).toEqual(['C:\\Users\\甲', 'D:\\项目'])
  })
})

describe('safe origin-only Git commands', () => {
  it('encodes Unicode, quotes and cmd metacharacters outside the default shell', () => {
    const path = "C:\\项目 空间\\o'brien & %TEMP% ! ` $() ; repo"
    const script = buildGitOriginScript([path], windows)
    const command = encodeGitScript(windows, script)
    expect(command).not.toContain(path); expect(command).not.toContain('%TEMP%')
    const decoded = Buffer.from(command.split(' ').at(-1)!, 'base64').toString('utf16le')
    expect(decoded).toBe(script); expect(decoded).toContain(quotePowerShell(path))
    expect(decoded).toContain('config --includes --get remote.origin.url')
    expect(encodePowerShell('中文')).toMatch(/-EncodedCommand [A-Za-z0-9+/=]+$/)
  })

  it('never falls back to backup remotes, even when explicitly passed old options', () => {
    const config = '[remote "nas"]\nurl = ssh://nas/backup.git\n'
    expect(parseGitConfigRemoteUrl(config)).toBeUndefined()
    expect(parseGitConfigRemoteUrl(config, { originOnly: false })).toBeUndefined()
  })

  it('propagates SSH, malformed output and namespace errors, not empty discovery', async () => {
    vi.spyOn(gitPlatformProbe, 'detect').mockResolvedValue(posix)
    vi.mocked(execSshCommand).mockResolvedValueOnce({ ok: false, error: 'permission denied' })
    await expect(discoverRemoteGitRemotesViaSsh(transport, ['/repo'])).rejects.toThrow('permission denied')
    vi.mocked(execSshCommand).mockResolvedValueOnce({ ok: true, stdout: 'banner only' })
    await expect(discoverRemoteGitRemotesViaSsh(transport, ['/repo'])).rejects.toThrow('Incomplete')
    await expect(discoverRemoteGitRemotesViaSsh(transport, ['C:\\repo'])).rejects.toThrow('namespace')
  })

  it('returns original path spelling and ignores a genuinely absent origin', async () => {
    vi.spyOn(gitPlatformProbe, 'detect').mockResolvedValue(windows)
    vi.mocked(execSshCommand).mockResolvedValue({ ok: true, stdout: '__DSH_GIT_0__\thttps://example.com/Team/Case.git\r\n__DSH_GIT_1__\t\r\n__DSH_GIT_DONE__\r\n' })
    const path = "C:\\项目 空间\\o'brien"
    const found = await discoverRemoteGitRemotesViaSsh(transport, [path, 'C:\\no-origin'])
    expect([...found]).toEqual([[path, 'https://example.com/Team/Case.git']])
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function flushDiscovery(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

describe('bounded asynchronous Git metadata caches', () => {
  it('retains remote positives past TTL until refreshed, with targeted explicit invalidation', () => {
    let now = 0
    const cache = new WorkspaceAggregator({}, { now: () => now, positiveTtlMs: 100 })
    const a = DeviceId('a'); const b = DeviceId('b')
    cache.noteGitRemote(a, '/repo', 'https://example.com/old.git')
    now = 99; expect(cache.getCachedGitRemote(a, '/repo')).toContain('old')
    now = 100; expect(cache.getCachedGitRemote(a, '/repo')).toContain('old')
    cache.noteGitRemote(a, '/repo', 'new'); cache.noteGitRemote(a, '/other', 'other'); cache.noteGitRemote(b, '/repo', 'b')
    cache.invalidateGitRemote(a, '/repo'); expect(cache.getCachedGitRemote(a, '/repo')).toBeUndefined()
    expect(cache.getCachedGitRemote(a, '/other')).toBe('other')
    cache.invalidateGitRemote(a); expect(cache.getCachedGitRemote(a, '/other')).toBeUndefined()
    expect(cache.getCachedGitRemote(b, '/repo')).toBe('b')
    cache.invalidateGitRemote(); expect(cache.getCachedGitRemote(b, '/repo')).toBeUndefined()
  })

  it('returns immediately without invoking a probe inline, then notifies accepted metadata', async () => {
    const pending = deferred<string | undefined>()
    const localProbe = vi.fn(() => pending.promise), onCacheChanged = vi.fn()
    const cache = new WorkspaceAggregator({}, { localProbe, onCacheChanged })
    const snapshot = cache.aggregate([{
      deviceId: LOCAL_DEVICE_ID, deviceName: 'local', workspaceId: 'local-ws', path: '/repo', title: 'repo',
      sessionIds: [], runningSessionCount: 0, createdAt: '', updatedAt: '',
    }])
    expect(snapshot.logicalWorkspaces).toHaveLength(1)
    expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBeUndefined()
    expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBeUndefined()
    expect(localProbe).not.toHaveBeenCalled(); expect(onCacheChanged).not.toHaveBeenCalled()
    await flushDiscovery(); expect(localProbe).toHaveBeenCalledTimes(1)
    pending.resolve('https://example.com/new.git'); await flushDiscovery()
    expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBe('https://example.com/new.git')
    expect(onCacheChanged).toHaveBeenCalledExactlyOnceWith(LOCAL_DEVICE_ID, '/repo', 'https://example.com/new.git')
  })

  it('uses negative TTL and stale-while-revalidate positives without splitting groups', async () => {
    let now = 0
    const refresh = deferred<string | undefined>()
    const localProbe = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce('new').mockImplementationOnce(() => refresh.promise)
    const onCacheChanged = vi.fn()
    const cache = new WorkspaceAggregator({}, { now: () => now, localProbe, onCacheChanged, negativeTtlMs: 100, positiveTtlMs: 200 })
    expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBeUndefined(); await flushDiscovery()
    now = 99; expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBeUndefined(); await flushDiscovery()
    expect(localProbe).toHaveBeenCalledTimes(1)
    now = 100; expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBeUndefined(); await flushDiscovery()
    expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBe('new')
    now = 299; expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBe('new'); await flushDiscovery()
    expect(localProbe).toHaveBeenCalledTimes(2)
    now = 300; expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBe('new'); await flushDiscovery()
    expect(localProbe).toHaveBeenCalledTimes(3)
    refresh.resolve('changed'); await flushDiscovery()
    expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBe('changed')
    expect(onCacheChanged.mock.calls.map(call => call[2])).toEqual(['new', 'changed'])
  })

  it('keeps stale positives on transient probe failures with bounded retry backoff', async () => {
    let now = 0
    const localProbe = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(undefined)
    const onCacheChanged = vi.fn()
    const cache = new WorkspaceAggregator({}, { now: () => now, localProbe, onCacheChanged, positiveTtlMs: 10, negativeTtlMs: 100 })
    cache.noteGitRemote(LOCAL_DEVICE_ID, '/repo', 'old')
    now = 10; expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBe('old'); await flushDiscovery()
    now = 109; expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBe('old'); await flushDiscovery()
    expect(localProbe).toHaveBeenCalledTimes(1); expect(onCacheChanged).not.toHaveBeenCalled()
    now = 110; expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBe('old'); await flushDiscovery()
    expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBeUndefined()
    expect(onCacheChanged).toHaveBeenCalledExactlyOnceWith(LOCAL_DEVICE_ID, '/repo', undefined)
  })

  it('fences stale in-flight and queued results after invalidation or newer explicit notes', async () => {
    const old = deferred<string | undefined>(), fresh = deferred<string | undefined>()
    const localProbe = vi.fn().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => fresh.promise)
    const onCacheChanged = vi.fn()
    const cache = new WorkspaceAggregator({}, { localProbe, onCacheChanged })
    cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo'); await flushDiscovery()
    cache.invalidateGitRemote(LOCAL_DEVICE_ID, '/repo')
    cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo'); await flushDiscovery()
    old.resolve('obsolete'); await flushDiscovery()
    expect(onCacheChanged).not.toHaveBeenCalled()
    cache.noteGitRemote(LOCAL_DEVICE_ID, '/repo', 'manual-newer')
    fresh.resolve('also-obsolete'); await flushDiscovery()
    expect(cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/repo')).toBe('manual-newer')
    expect(onCacheChanged).not.toHaveBeenCalled()
    cache.getCachedGitRemote(LOCAL_DEVICE_ID, '/queued')
    cache.invalidateGitRemote(); await flushDiscovery()
    expect(localProbe).toHaveBeenCalledTimes(2)
  })

  it('bounds concurrent paths, deduplicates queue entries and skips invalidated queued jobs', async () => {
    let active = 0, peak = 0
    const requests: { path: string; pending: ReturnType<typeof deferred<string | undefined>> }[] = []
    const localProbe = vi.fn((path: string) => {
      active += 1; peak = Math.max(peak, active)
      const pending = deferred<string | undefined>(); requests.push({ path, pending })
      return pending.promise.finally(() => { active -= 1 })
    })
    const cache = new WorkspaceAggregator({}, { localProbe, localConcurrency: 2 })
    for (let index = 0; index < 5; index += 1) {
      cache.getCachedGitRemote(LOCAL_DEVICE_ID, `/repo-${index}`)
      cache.getCachedGitRemote(LOCAL_DEVICE_ID, `/repo-${index}`)
    }
    expect(localProbe).not.toHaveBeenCalled(); await flushDiscovery()
    expect(requests.map(request => request.path)).toEqual(['/repo-0', '/repo-1'])
    cache.invalidateGitRemote(LOCAL_DEVICE_ID, '/repo-2')
    requests[0]!.pending.resolve('zero'); await flushDiscovery()
    expect(requests.map(request => request.path)).toEqual(['/repo-0', '/repo-1', '/repo-3'])
    requests[1]!.pending.resolve('one'); await flushDiscovery()
    expect(requests.map(request => request.path)).toEqual(['/repo-0', '/repo-1', '/repo-3', '/repo-4'])
    for (const request of requests.slice(2)) request.pending.resolve('done')
    await flushDiscovery(); expect(peak).toBe(2); expect(active).toBe(0)
  })
})

describe.skipIf(process.platform === 'win32')('real POSIX origin / worktree scans', () => {
  it('reads gitconfig includes and registered hidden worktrees using Git', () => {
    const root = temp(); const main = join(root, 'main'); repo(main)
    const include = join(root, 'origin config')
    writeFileSync(include, '[remote "origin"]\nurl = https://example.com/Included/Case.git\n')
    git('-C', main, 'remote', 'remove', 'origin'); git('-C', main, 'config', 'include.path', include)
    git('-C', main, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'initial')
    const worktree = join(root, '.wt', '项目', 'feature'); mkdirSync(join(root, '.wt', '项目'), { recursive: true })
    git('-C', main, 'worktree', 'add', '-qb', 'feature', worktree)
    expect(discoverLocalGitRemote(main)).toBe('https://example.com/Included/Case.git')
    expect(discoverLocalGitRemote(worktree)).toBe('https://example.com/Included/Case.git')
    expect(scanLocalGitRepos([root]).map(r => r.path)).toEqual(expect.arrayContaining([main, worktree]))
    const output = execFileSync('sh', ['-c', buildGitScanScript([root])], { encoding: 'utf8' })
    expect(parseGitScanOutput(output).map(r => r.path)).toEqual(expect.arrayContaining([main, worktree]))
  })

  it('preserves quotes/spaces/Chinese without executing shell metacharacters', () => {
    const root = temp(); const path = join(root, "中文 空间 o'brien $(false); & repo"); repo(path)
    const command = encodeGitScript(posix, buildGitOriginScript([path], posix))
    const output = execFileSync('sh', ['-c', command], { encoding: 'utf8' })
    expect(output).toContain('__DSH_GIT_0__\thttps://example.com/Team/CaseSensitive.git')
    expect(output).toContain('__DSH_GIT_DONE__')
    const scan = execFileSync('sh', ['-c', buildGitScanScript([root])], { encoding: 'utf8' })
    expect(parseGitScanOutput(scan).map(r => r.path)).toEqual([path])
  })

  it('prunes caches/hidden state, but honors explicitly selected hidden roots', () => {
    const root = temp(); repo(join(root, 'visible')); repo(join(root, '.cache', 'hidden')); repo(join(root, 'node_modules', 'dep'))
    expect(scanLocalGitRepos([root]).map(r => r.path)).toEqual([join(root, 'visible')])
    expect(scanLocalGitRepos([join(root, '.cache')]).map(r => r.path)).toEqual([join(root, '.cache', 'hidden')])
    const deep = join(root, 'a', 'b', 'c'); repo(join(deep, 'leaf'))
    expect(scanLocalGitRepos([root, deep], { maxDepth: 2 }).map(r => r.path)).toContain(join(deep, 'leaf'))
  })

  it('does not turn inaccessible roots or Git failures into successful empty scans', () => {
    const root = join(temp(), 'missing')
    expect(() => scanLocalGitRepos([root])).toThrow('Unable to scan root')
    expect(() => execFileSync('sh', ['-c', buildGitScanScript([root])], { stdio: 'pipe' })).toThrow()
    expect(() => execFileSync('sh', ['-c', buildGitOriginScript([root], posix)], { stdio: 'pipe' })).toThrow()
    const broken = temp(); writeFileSync(join(broken, '.git'), 'gitdir: nowhere')
    expect(() => execFileSync('sh', ['-c', buildGitScanScript([broken])], { stdio: 'pipe' })).toThrow()
  })
})

describe('remote scan failures', () => {
  it('builds literal PowerShell scans for cmd and PowerShell defaults', () => {
    const path = "C:\\项目 空间\\o'brien & %TEMP%"
    const script = buildPowerShellGitScanScript([path], Number.NaN)
    expect(script).toContain(`-LiteralPath ${quotePowerShell(path)}`)
    expect(script).toContain("$entry.Name -ne '.wt'")
    expect(script).not.toContain('NaN'); expect(script).toContain('$maxDepth = 4')
    expect(encodeGitScript(windows, script)).not.toContain('%TEMP%')
  })

  it('rejects failed execution, incomplete output, and wrong path namespaces', async () => {
    vi.spyOn(gitPlatformProbe, 'detect').mockResolvedValue(windows)
    vi.mocked(execSshCommand).mockResolvedValueOnce({ ok: false, error: 'access denied' })
    expect(await scanRemoteGitRepos(transport, ['C:\\repo'])).toEqual({ ok: false, error: 'access denied' })
    vi.mocked(execSshCommand).mockResolvedValueOnce({ ok: true, stdout: '' })
    expect(await scanRemoteGitRepos(transport, ['C:\\repo'])).toEqual({ ok: false, error: 'Incomplete Git scan response' })
    expect(await scanRemoteGitRepos(transport, ['/mnt/c/repo'])).toMatchObject({ ok: false })
  })
})

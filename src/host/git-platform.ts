/** SSH exec uses the login shell, not necessarily POSIX. Probe before scripts. */
import { type SshTransportConfig } from '../contract.ts'
import { execSshCommand } from './tunnel.ts'

export type GitSshExecutor = typeof execSshCommand
export interface GitRemotePlatform {
  readonly shell: 'posix' | 'powershell'
  readonly namespace: 'posix' | 'windows'
  readonly launcher: 'sh' | 'powershell' | 'pwsh'
}
export const GIT_PLATFORM_TTL_MS = 5 * 60_000

export function quotePosix(value: string): string {
  if (value.includes('\0')) throw new Error('NUL is not valid in a Git path')
  return `'${value.replaceAll("'", "'\\''")}'`
}
export function quotePowerShell(value: string): string {
  if (value.includes('\0')) throw new Error('NUL is not valid in a Git path')
  return `'${value.replaceAll("'", "''")}'`
}
export function encodePowerShell(script: string, launcher = 'powershell'): string {
  // Only ASCII flags and base64 reach cmd.exe / the SSH default shell. Dynamic
  // %, !, &, quotes, Unicode and newlines cannot expand in that outer shell.
  return `${launcher} -NoLogo -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`
}
export function encodeGitScript(platform: GitRemotePlatform, script: string): string {
  return platform.shell === 'posix' ? `sh -c ${quotePosix(script)}` : encodePowerShell(script, platform.launcher)
}

/** C:\\foo, /mnt/c/foo and /c/foo are not interchangeable namespaces. */
export function assertGitPathNamespace(path: string, platform: GitRemotePlatform): void {
  if (/[\0\r\n\t]/.test(path)) throw new Error('Git paths containing NUL or line separators are unsupported')
  const windows = /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\')
  if (platform.namespace === 'windows' ? !windows : (!path.startsWith('/') || windows)) {
    throw new Error(`Git path namespace does not match remote ${platform.namespace} shell: ${path}`)
  }
}

function transportKey(t: SshTransportConfig): string {
  return JSON.stringify([t.host, t.port, t.username, t.privateKeyPath, t.proxyJump, t.engine])
}

export class GitPlatformProbe {
  private readonly cache = new Map<string, { at: number; value: GitRemotePlatform }>()
  private readonly pending = new Map<string, Promise<GitRemotePlatform>>()
  constructor(
    private readonly exec: GitSshExecutor = execSshCommand,
    private readonly now: () => number = Date.now,
    private readonly ttlMs = GIT_PLATFORM_TTL_MS,
  ) {}

  invalidate(transport?: SshTransportConfig): void {
    if (transport === undefined) { this.cache.clear(); this.pending.clear() }
    else { this.cache.delete(transportKey(transport)); this.pending.delete(transportKey(transport)) }
  }

  async detect(transport: SshTransportConfig): Promise<GitRemotePlatform> {
    const key = transportKey(transport)
    const cached = this.cache.get(key)
    if (cached !== undefined && this.now() - cached.at < this.ttlMs) return cached.value
    const pending = this.pending.get(key)
    if (pending !== undefined) return pending
    const request = this.probe(transport)
    this.pending.set(key, request)
    try {
      const value = await request
      if (this.pending.get(key) === request) this.cache.set(key, { at: this.now(), value })
      return value
    } finally {
      if (this.pending.get(key) === request) this.pending.delete(key)
    }
  }

  private async probe(transport: SshTransportConfig): Promise<GitRemotePlatform> {
    const posix = await this.exec(transport, `sh -c 'printf "__DSH_POSIX__\\n"; uname -s'`, 8_000)
    if (posix.ok && /^__DSH_POSIX__\r?$/m.test(posix.stdout) && !/MINGW|MSYS|CYGWIN/i.test(posix.stdout)) {
      return { shell: 'posix', namespace: 'posix', launcher: 'sh' }
    }
    let lastError = posix.ok ? 'POSIX capability marker missing or Windows compatibility shell' : posix.error
    for (const launcher of ['powershell', 'pwsh'] as const) {
      const res = await this.exec(transport, encodePowerShell(`$ErrorActionPreference='Stop'; if ($env:OS -eq 'Windows_NT') { Write-Output '__DSH_WINDOWS__' } else { Write-Output '__DSH_PS_POSIX__' }`, launcher), 8_000)
      if (res.ok && /^__DSH_WINDOWS__\r?$/m.test(res.stdout)) return { shell: 'powershell', namespace: 'windows', launcher }
      if (res.ok && /^__DSH_PS_POSIX__\r?$/m.test(res.stdout)) return { shell: 'powershell', namespace: 'posix', launcher }
      lastError = res.ok ? 'PowerShell capability marker missing' : res.error
    }
    throw new Error(`Unable to probe remote Git shell: ${lastError}`)
  }
}

export const gitPlatformProbe = new GitPlatformProbe()
export function invalidateGitPlatform(transport?: SshTransportConfig): void {
  gitPlatformProbe.invalidate(transport)
}

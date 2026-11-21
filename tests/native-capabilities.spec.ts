import { describe, expect, it } from 'vitest'
import {
  NATIVE_CANARY_AGENT_TEAM_PLUGIN,
  compareDshRelease,
  nativeAgentTeamCanaryMissing,
  nativeAgentTeamExpected,
  nativePageCapabilityGaps,
  nativePageVersionDrift,
  parseDshRelease,
  sameDshRelease,
  type DeviceView,
  type NativePageCapabilities,
} from '../src/contract.ts'
import { sanitizeNativePageCapabilities } from '../src/host/native-bridge.ts'
import { nativePageWarnings } from '../src/runtime.ts'

function capabilities(overrides: Partial<NativePageCapabilities> = {}): NativePageCapabilities {
  return {
    clientPlugins: [NATIVE_CANARY_AGENT_TEAM_PLUGIN],
    runtimeCaptured: true,
    runtime: { agentTeams: true, session: true },
    reportedAt: 1_700_000_000_000,
    ...overrides,
  }
}

function device(overrides: Partial<DeviceView>): DeviceView {
  return {
    id: 'dev-a',
    name: 'Device A',
    enabled: true,
    state: 'connected',
    transportKind: 'ssh',
    protocolVersion: '0.2',
    realtime: true,
    sessionCount: 0,
    runningSessionCount: 0,
    pendingApprovalCount: 0,
    workspaceCount: 0,
    keepNativeAlive: true,
    ...overrides,
  } as unknown as DeviceView
}

describe('sanitizeNativePageCapabilities', () => {
  it('normalizes a well-formed page report', () => {
    const result = sanitizeNativePageCapabilities({
      boot: {
        release: { version: '0.2.2-rc.5', commit: '3f85d88' },
        entries: ['@deepseek-ai/dsh-client-ui-agent-team', '@deepseek-ai/dsh-client-ui-agent-team', ' @deepseek-ai/dsh-api-remotes '],
      },
      access: { owner: true },
      runtimeCaptured: true,
      runtime: { agentTeams: true, session: null },
    }, 123)
    expect(result).toEqual({
      release: { version: '0.2.2-rc.5', commit: '3f85d88' },
      clientPlugins: ['@deepseek-ai/dsh-client-ui-agent-team', '@deepseek-ai/dsh-api-remotes'],
      access: { owner: true },
      runtimeCaptured: true,
      runtime: { agentTeams: true, session: null },
      reportedAt: 123,
    })
  })

  it('rejects junk fields instead of widening them into the Host snapshot', () => {
    const result = sanitizeNativePageCapabilities({
      boot: {
        release: { version: '0.2.2\r\nSpoofed', commit: 'x'.repeat(200) },
        entries: ['ok-plugin', 'bad id\nwith newline', '', 42, null, 'x'.repeat(300)],
      },
      access: { owner: 'yes' },
      runtimeCaptured: 'true',
      runtime: { agentTeams: 'yes', session: false },
    })
    expect(result?.release).toBeUndefined()
    expect(result?.clientPlugins).toEqual(['ok-plugin'])
    expect(result?.access).toBeUndefined()
    expect(result?.runtimeCaptured).toBe(false)
    expect(result?.runtime).toEqual({ session: false })
  })

  it('returns undefined for non-object frames', () => {
    expect(sanitizeNativePageCapabilities(undefined)).toBeUndefined()
    expect(sanitizeNativePageCapabilities('capabilities')).toBeUndefined()
    expect(sanitizeNativePageCapabilities(null)).toBeUndefined()
  })

  it('bounds the client plugin list', () => {
    const entries = Array.from({ length: 500 }, (_, index) => `plugin-${index}`)
    const result = sanitizeNativePageCapabilities({ boot: { entries }, runtimeCaptured: true })
    expect(result?.clientPlugins).toHaveLength(400)
    expect(result?.clientPlugins[0]).toBe('plugin-0')
    expect(result?.clientPlugins[399]).toBe('plugin-399')
  })
})

describe('nativePageCapabilityGaps', () => {
  it('names a page that cannot show the Agent Team toggle', () => {
    const gaps = nativePageCapabilityGaps(capabilities({
      clientPlugins: ['@deepseek-ai/dsh-api-remotes'],
      runtime: { agentTeams: false },
    }))
    expect(gaps).toHaveLength(2)
    expect(gaps.join('\n')).toContain(NATIVE_CANARY_AGENT_TEAM_PLUGIN)
    expect(gaps.join('\n')).toContain('remote.agentTeams')
  })

  it('treats an unreported surface as no finding of its own', () => {
    expect(nativePageCapabilityGaps(undefined)).toEqual([])
    expect(nativePageCapabilityGaps(capabilities())).toEqual([])
  })
})

describe('DSH release comparison', () => {
  it('parses releases with prerelease identifiers', () => {
    expect(parseDshRelease('v0.2.2-rc.5')).toEqual({ major: 0, minor: 2, patch: 2, prerelease: ['rc', 5] })
    expect(parseDshRelease('0.2.1-rc.5')).toEqual({ major: 0, minor: 2, patch: 1, prerelease: ['rc', 5] })
    expect(parseDshRelease('0.2.2')).toEqual({ major: 0, minor: 2, patch: 2, prerelease: [] })
    expect(parseDshRelease('0.2.x')).toBeUndefined()
    expect(parseDshRelease(undefined)).toBeUndefined()
  })

  it('orders prereleases before their release and numbers numerically', () => {
    const compare = (left: string, right: string): number =>
      compareDshRelease(parseDshRelease(left)!, parseDshRelease(right)!)
    expect(compare('0.2.1-rc.5', '0.2.2-rc.5')).toBeLessThan(0)
    expect(compare('0.2.2', '0.2.2-rc.5')).toBeGreaterThan(0)
    expect(compare('0.2.2-rc.5', '0.2.2-rc.10')).toBeLessThan(0)
    expect(compare('v0.2.2-rc.5', '0.2.2-rc.5')).toBe(0)
  })

  it('compares version strings only when both parse', () => {
    expect(sameDshRelease('0.2.2-rc.5', 'v0.2.2-rc.5')).toBe(true)
    expect(sameDshRelease('0.2.1-rc.5', '0.2.2-rc.5')).toBe(false)
    expect(sameDshRelease('0.2.x', '0.2.2-rc.5')).toBeUndefined()
    expect(sameDshRelease(undefined, '0.2.2-rc.5')).toBeUndefined()
  })
})

describe('Agent Team canary expectation', () => {
  it('expects the canary from the 0.2.2 prerelease line onward', () => {
    expect(nativeAgentTeamExpected('0.2.2-rc.1')).toBe(false)
    expect(nativeAgentTeamExpected('0.2.2-rc.2')).toBe(true)
    expect(nativeAgentTeamExpected('0.2.2-rc.5')).toBe(true)
    expect(nativeAgentTeamExpected('0.2.2')).toBe(true)
    expect(nativeAgentTeamExpected('0.2.3-rc.1')).toBe(true)
    expect(nativeAgentTeamExpected('0.2.1-rc.5')).toBe(false)
    expect(nativeAgentTeamExpected('0.2.0-rc.2')).toBe(false)
    expect(nativeAgentTeamExpected(undefined)).toBe(false)
    expect(nativeAgentTeamExpected('0.2.x')).toBe(false)
  })

  it('only reports a missing canary when the page release should ship it', () => {
    const missing = { clientPlugins: [] as string[], runtime: { agentTeams: false } }
    expect(nativeAgentTeamCanaryMissing(device({
      nativePageCapabilities: capabilities({ release: { version: '0.2.2-rc.5' }, ...missing }),
    }))).toBe(true)
    expect(nativeAgentTeamCanaryMissing(device({
      nativePageCapabilities: capabilities({ release: { version: '0.2.1-rc.5' }, ...missing }),
    }))).toBe(false)
    expect(nativeAgentTeamCanaryMissing(device({ nativePageCapabilities: capabilities() }))).toBe(false)
    expect(nativeAgentTeamCanaryMissing(device({}))).toBe(false)
  })
})

describe('nativePageVersionDrift', () => {
  it('flags a kept-alive page older than the remote it speaks to', () => {
    const drift = nativePageVersionDrift(device({
      remoteDshVersion: '0.2.2-rc.5',
      nativePageCapabilities: capabilities({ release: { version: '0.2.1-rc.5' } }),
    }))
    expect(drift).toEqual({ pageVersion: '0.2.1-rc.5', remoteVersion: '0.2.2-rc.5' })
  })

  it('stays quiet when releases match or either side is unknown', () => {
    expect(nativePageVersionDrift(device({
      remoteDshVersion: '0.2.2-rc.5',
      nativePageCapabilities: capabilities({ release: { version: '0.2.2-rc.5' } }),
    }))).toBeUndefined()
    expect(nativePageVersionDrift(device({ remoteDshVersion: '0.2.x' }))).toBeUndefined()
    expect(nativePageVersionDrift(device({ nativePageCapabilities: capabilities() }))).toBeUndefined()
  })
})

describe('nativePageWarnings', () => {
  it('explains a bridge failure', () => {
    const warnings = nativePageWarnings(device({ nativePaneState: 'failed', nativePaneError: 'CSP' }))
    expect(warnings.join('\n')).toContain('CSP')
  })

  it('explains a stale page and a real canary regression', () => {
    const warnings = nativePageWarnings(device({
      remoteDshVersion: '0.2.2-rc.5',
      nativePaneState: 'ready',
      nativePageCapabilities: capabilities({
        release: { version: '0.2.2-rc.4' },
        clientPlugins: ['@deepseek-ai/dsh-api-remotes'],
        runtime: { agentTeams: false },
      }),
    }))
    const text = warnings.join('\n')
    expect(text).toContain('0.2.2-rc.4 differs from the remote release 0.2.2-rc.5')
    expect(text).toContain(NATIVE_CANARY_AGENT_TEAM_PLUGIN)
    expect(text).toContain('remote.agentTeams')
  })

  it('does not blame an older remote DSH for a feature it never shipped', () => {
    const warnings = nativePageWarnings(device({
      remoteDshVersion: '0.2.1-rc.5',
      nativePaneState: 'ready',
      nativePageCapabilities: capabilities({
        release: { version: '0.2.1-rc.5' },
        clientPlugins: ['@deepseek-ai/dsh-api-remotes'],
        runtime: { agentTeams: false },
      }),
    }))
    expect(warnings).toEqual([])
  })

  it('notes a ready page that predates capability reporting', () => {
    const warnings = nativePageWarnings(device({ nativePaneState: 'ready' }))
    expect(warnings.join('\n')).toContain('reported no client capability snapshot')
  })

  it('is empty for a healthy page', () => {
    expect(nativePageWarnings(device({
      remoteDshVersion: '0.2.2-rc.5',
      nativePaneState: 'ready',
      nativePageCapabilities: capabilities({ release: { version: '0.2.2-rc.5' } }),
    }))).toEqual([])
  })
})

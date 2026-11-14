/**
 * Unit and integration tests for the Native-Mode-only `dsh-multi-device`:
 * 1. Deterministic Session/Event identity mapping.
 * 2. System `~/.ssh/config` parser (`Host` wildcards, negation `!`, `Include`, `%h`/`%p`/`%r` tokens, CLI arg builder).
 * 3. Persistent authentication (`dshCookieName`, `mintDshBrowserCookie`, launch token exchange, `.credentials.yaml` parser).
 * 4. `RemoteDeviceClient` handshake, live WebSocket `/api/remote.mux` streams, and offline catalog retention.
 * 5. `NativeDeviceProxy` authenticated HTTP + WebSocket reverse proxy, bridge injection and read acknowledgements.
 * 6. Host-owned attention/read state and the device tab strip's projections.
 */
import { execSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import {
  decodeSessionId,
  DeviceId,
  encodeRemoteEventId,
  encodeRemoteSessionId,
  type DeviceConnectionState,
  type DeviceView,
  isNamespacedEventId,
  isNamespacedSessionId,
  LOCAL_DEVICE_ID,
  type MultiDeviceSnapshot,
} from '../src/contract.ts'
import {
  DeviceAuthManager,
  dshCookieName,
  extractLaunchToken,
  buildRemoteCredentialsCatCommand,
  mintDshBrowserCookie,
  parseSigningSecretFromCredentialsYaml,
  readRemoteCredentials,
  remoteCredentialsPathForPowerShell,
  resolveRemoteAuthority,
  resolveRemoteCookieAuthority,
  resolveRemoteScheme,
} from '../src/host/auth.ts'
import {
  buildNativeBridgeScript,
  injectNativeBridge,
  NATIVE_BRIDGE_SCRIPT,
  NATIVE_BRIDGE_SCRIPT_PATH,
  sanitizeGroupState,
} from '../src/host/native-bridge.ts'
import { requestRemote } from '../src/host/http-request.ts'
import { NativeDeviceProxy, sanitizeBridgeTitle } from '../src/host/native-proxy.ts'
import { ReadStateTracker } from '../src/host/read-state.ts'
import {
  buildReadSharedStateCommand,
  buildSharedReadDocument,
  buildWriteSharedStateCommand,
  isPosixRemoteHome,
  mergeSharedReadEntries,
  parseSharedReadDocument,
  sharedReadStatePath,
} from '../src/host/shared-state.ts'
import { describeProbeFailure, DeviceRegistry } from '../src/host/registry.ts'
import { installReadStateOverlay, mergeSessionStatus } from '../src/client/readState.ts'
import { shouldApplySnapshot } from '../src/client/state.ts'
import { resolveWindowTitle } from '../src/client/windowTitle.ts'
import { countableUnreadIds, groupUnreadSessionIds, unreadCountForDevice } from '../src/client/unreadCounts.ts'
import {
  listLocalSshKeys,
  parseSshConfigText,
  parseSshTargetSpec,
  resolveSshConfigForTransport,
  resolveUserIncludePattern,
} from '../src/host/ssh-config.ts'
import {
  assertLoopbackForward,
  buildSystemSshArgs as buildTunnelSshArgs,
  execSshCommand,
  hostKeyMatchesKnownHostsLine,
  setSshSpawn,
} from '../src/host/tunnel.ts'
import {
  classifyRemoteProtocol,
  countVisibleSessions,
  pendingInteractionKind,
  protocolGeneration,
  RemoteDeviceClient,
  resolveProbedProtocol,
} from '../src/host/remote-client.ts'
import { BoundedStreamQueue } from '../src/host/stream-queue.ts'
import { buildForwardHeaders } from '../src/host/native-proxy.ts'
import {
  admitControlPlaneRequest,
  admitMultiDeviceRequest,
  buildDiagnostics,
  connectionRequestRejection,
  MultiDeviceControlPlane,
  readDiagnosticsClientReport,
  type MultiDeviceDiagnostics,
} from '../src/runtime.ts'
import {
  barIsClipped,
  COMPACT_BAR_WIDTH,
  describeObstruction,
  measureNativeBar,
  readNativeBarObstruction,
  recordNativeBarObstruction,
  resolveBarLayout,
} from '../src/client/barMetrics.ts'

const tempDirs: string[] = []
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }
})

describe('0b. Host-owned read state and native page state', () => {
  it('marks only a real running-to-finished transition unread', () => {
    const tracker = new ReadStateTracker()
    tracker.observeRunning('s1', false)
    expect(tracker.isUnread('s1')).toBe(false)

    tracker.observeRunning('s1', true)
    expect(tracker.observeRunning('s1', false)).toBe(true)
    expect(tracker.isUnread('s1')).toBe(true)

    expect(tracker.observeRunning('s1', true)).toBe(true)
    expect(tracker.isUnread('s1')).toBe(false)
  })

  it('merges peer Host entries by timestamp and lets read win an equal one', () => {
    const tracker = new ReadStateTracker()
    tracker.markUnread('s1', 100)
    expect(tracker.mergeEntry('s1', { unread: false, at: 90 })).toBe(false)
    expect(tracker.isUnread('s1')).toBe(true)
    expect(tracker.mergeEntry('s1', { unread: false, at: 100 })).toBe(true)
    expect(tracker.isUnread('s1')).toBe(false)
    tracker.markUnread('s2', 200)
    expect(tracker.mergeEntry('s2', { unread: true, at: 200 })).toBe(false)
    expect(tracker.isUnread('s2')).toBe(true)
  })

  it('clears one Session without touching another and survives hydration', () => {
    const tracker = new ReadStateTracker()
    tracker.observeRunning('a', true)
    tracker.observeRunning('a', false)
    tracker.observeRunning('b', true)
    tracker.observeRunning('b', false)
    expect(tracker.unreadIds()).toEqual(['a', 'b'])

    expect(tracker.markRead('a')).toBe(true)
    expect(tracker.unreadIds()).toEqual(['b'])
    expect(tracker.markRead('a')).toBe(false)

    const restored = new ReadStateTracker()
    restored.hydrate(tracker.entriesSnapshot())
    expect(restored.unreadIds()).toEqual(['b'])
    expect(restored.isUnread('a')).toBe(false)
  })

  it('prunes entries for Sessions that no longer exist and notifies once', () => {
    const changes: Array<{ id: string; unreadChanged: boolean }> = []
    const tracker = new ReadStateTracker((sessionId, _state, unreadChanged) => {
      changes.push({ id: sessionId, unreadChanged })
    })
    tracker.markUnread('gone', 100)
    tracker.markUnread('kept', 101)
    changes.length = 0

    expect(tracker.prune(sessionId => sessionId === 'kept')).toBe(1)
    expect(tracker.unreadIds()).toEqual(['kept'])
    expect(changes).toEqual([{ id: 'gone', unreadChanged: true }])

    // A read-only entry disappears silently: no client-visible change.
    tracker.markRead('kept', 102)
    changes.length = 0
    expect(tracker.prune(() => false)).toBe(0)
    expect(changes).toEqual([])
    expect(tracker.unreadIds()).toEqual([])
  })

  it('clears a whole device in one unread transition', () => {
    const changes: Array<{ id: string; unreadChanged: boolean }> = []
    const tracker = new ReadStateTracker((sessionId, _state, unreadChanged) => {
      changes.push({ id: sessionId, unreadChanged })
    })
    tracker.markUnread('a', 1)
    tracker.markUnread('b', 2)
    tracker.markUnread('c', 3)
    changes.length = 0

    expect(tracker.markManyRead(sessionId => sessionId !== 'c')).toEqual(['a', 'b'])
    expect(tracker.unreadIds()).toEqual(['c'])
    expect(changes).toHaveLength(1)
    expect(changes[0]?.unreadChanged).toBe(true)
  })

  it('counts only unread Sessions a catalog can still resolve', () => {
    const known = encodeRemoteSessionId(DeviceId('dev-a'), 's1')
    const gone = encodeRemoteSessionId(DeviceId('dev-a'), 's2')
    const local = 'local-1'
    const unread = countableUnreadIds(
      [known, gone, local],
      [],
      [],
      sessionId => sessionId === known,
    )
    expect([...unread]).toEqual([known, local])
  })

  it('splits visible Session counts from the raw catalog totals', () => {
    const summaries = [
      { sessionId: 's-main', updatedAt: 1, agentAvailable: true, running: true, blank: false },
      { sessionId: 's-idle', updatedAt: 2, agentAvailable: true, running: false, blank: false },
      { sessionId: 's-sub', updatedAt: 3, agentAvailable: true, running: true, blank: false, origin: 'subagent' as const },
      { sessionId: 's-arch', updatedAt: 4, agentAvailable: true, running: true, blank: false },
    ]
    expect(countVisibleSessions(summaries, ['s-arch'])).toEqual({
      sessionCount: 2,
      runningSessionCount: 1,
      allSessionCount: 4,
      allRunningSessionCount: 3,
    })
  })

  it('overlays every Host-owned Session ID and keeps a stable snapshot identity', () => {
    const remoteId = encodeRemoteSessionId(DeviceId('dev-a'), 'r1')
    const base = new Map([
      [remoteId, { running: false, completionUnread: false }],
      ['local-1', { running: false, completionUnread: true }],
    ])
    expect(mergeSessionStatus(base, undefined, () => true).get('local-1')).toBe(base.get('local-1'))
    const unread = new Set([remoteId, 'local-1'])
    const merged = mergeSessionStatus(base, unread, () => true)
    expect(merged.get(remoteId)?.completionUnread).toBe(true)
    expect(merged.get('local-1')?.completionUnread).toBe(true)

    const listeners = new Set<() => void>()
    let unreadNow = new Set<string>()
    const source = {
      getSnapshot: () => base,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    }
    const dispose = installReadStateOverlay({
      source,
      getUnread: () => unreadNow,
      subscribeReadState: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      shouldOverride: () => true,
    })
    try {
      const first = source.getSnapshot()
      expect(first.get(remoteId)?.completionUnread).toBe(false)
      expect(first.get('local-1')?.completionUnread).toBe(false)
      expect(source.getSnapshot()).toBe(first)

      unreadNow = new Set([remoteId, 'local-1'])
      for (const listener of listeners) listener()
      const second = source.getSnapshot()
      expect(second.get(remoteId)?.completionUnread).toBe(true)
      expect(second.get('local-1')?.completionUnread).toBe(true)
    } finally {
      dispose()
    }
  })

  it('builds the bridge prefix with bounded fold and unread state', () => {
    expect(sanitizeGroupState({ a: true, b: 'yes', c: false })).toEqual({ a: true, c: false })
    const script = buildNativeBridgeScript({
      groups: { 'ws-1': true, 'ws-2': false },
      unread: ['s-1', 's-2'],
    })
    expect(script).toContain('window.__DSH_MD_GROUPS__')
    expect(script).toContain('"ws-1":true')
    expect(script).toContain('"ws-2":false')
    expect(script).toContain('window.__DSH_MD_UNREAD__')
    expect(script.indexOf('window.__DSH_MD_GROUPS__')).toBeLessThan(script.indexOf('(function ()'))
  })

  it('restores Host fold/unread state from the registry document and clears it again', async () => {
    const dir = makeTempDir('dsh-md-read-')
    const dataFile = join(dir, 'devices.json')
    const secretsFile = join(dir, 'secrets.json')
    const remoteId = encodeRemoteSessionId(DeviceId('dev-a'), 's1')
    const remoteId2 = encodeRemoteSessionId(DeviceId('dev-a'), 's2')
    writeFileSync(dataFile, JSON.stringify({
      version: 1,
      devices: [{
        id: 'dev-a',
        name: 'A',
        enabled: true,
        transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:9' },
        auth: { mode: 'none' },
      }],
      // Keys from the retired Aggregated Mode: old documents must still load,
      // and none of them may come back to life.
      displayMode: 'aggregated',
      aggregation: { autoGitAggregate: true },
      gitMatch: { lastResult: { status: 'ok', matches: [] } },
      nativeGroups: { 'dev-a': { 'ws-1': true, 'ws-2': false } },
      readState: {
        entries: {
          [remoteId]: { unread: true, at: 100 },
          [remoteId2]: { unread: true, at: 101 },
        },
      },
    }))
    const registry = new DeviceRegistry(
      dataFile,
      secretsFile,
      { localPort: () => 3080 },
      { allowDirectTransport: true },
    )
    try {
      expect(registry.snapshot().unreadSessionIds).toEqual([remoteId, remoteId2])
      expect(registry.nativeGroupState(DeviceId('dev-a'))).toEqual({ 'ws-1': true, 'ws-2': false })
      // Selection is not presence; a visible client explicitly acknowledges read.
      registry.setActiveSession(remoteId, 1)
      expect(registry.snapshot().unreadSessionIds).toEqual([remoteId, remoteId2])
      registry.markSessionRead(remoteId)
      expect(registry.snapshot().unreadSessionIds).toEqual([remoteId2])
      const plane = new MultiDeviceControlPlane(registry, () => true)
      const cleared = await plane.dispatch({
        action: 'markSessionRead',
        payload: { sessionId: remoteId2 },
      })
      expect(cleared.ok).toBe(true)
      expect(registry.snapshot().unreadSessionIds).toEqual([])

      // Local Sessions share the same Host-owned set.
      registry.observeLocalSessionStatus('local-1', true)
      registry.observeLocalSessionStatus('local-1', false)
      expect(registry.snapshot().unreadSessionIds).toEqual(['local-1'])
      registry.setActiveSession('local-1', 2)
      expect(registry.snapshot().unreadSessionIds).toEqual(['local-1'])
      registry.markSessionRead('local-1')
      expect(registry.snapshot().unreadSessionIds).toEqual([])
    } finally {
      registry.dispose()
    }
    const saved = JSON.parse(readFileSync(dataFile, 'utf8')) as {
      readState?: { entries?: Record<string, { unread?: boolean }> }
    }
    expect(saved.readState?.entries?.[remoteId]?.unread).toBe(false)
  })

  it('clears one device at a time and forgets deleted local Sessions', () => {
    const dir = makeTempDir('dsh-md-read-device-')
    const dataFile = join(dir, 'devices.json')
    const secretsFile = join(dir, 'secrets.json')
    const remoteA1 = encodeRemoteSessionId(DeviceId('dev-a'), 's1')
    const remoteA2 = encodeRemoteSessionId(DeviceId('dev-a'), 's2')
    const remoteB = encodeRemoteSessionId(DeviceId('dev-b'), 's3')
    writeFileSync(dataFile, JSON.stringify({
      version: 1,
      devices: [
        { id: 'dev-a', name: 'A', enabled: true, transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:9' }, auth: { mode: 'none' } },
        { id: 'dev-b', name: 'B', enabled: true, transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:9' }, auth: { mode: 'none' } },
      ],
      // Retired Aggregated Mode keys: still readable, never revived.
      displayMode: 'aggregated',
      aggregation: { autoGitAggregate: true },
      readState: {
        entries: {
          [remoteA1]: { unread: true, at: 100 },
          [remoteA2]: { unread: true, at: 101 },
          [remoteB]: { unread: true, at: 102 },
          'local-1': { unread: true, at: 103 },
        },
      },
    }))
    const registry = new DeviceRegistry(
      dataFile,
      secretsFile,
      { localPort: () => 3080 },
      { allowDirectTransport: true },
    )
    try {
      expect(typeof registry.snapshot().hostEpoch).toBe('string')
      expect(registry.markDeviceRead(DeviceId('dev-a'))).toBe(2)
      expect(registry.snapshot().unreadSessionIds).toEqual(['local-1', remoteB])
      expect(registry.markDeviceRead(LOCAL_DEVICE_ID)).toBe(1)
      expect(registry.snapshot().unreadSessionIds).toEqual([remoteB])

      // Remote ids are owned by the device stream, not the local removal hook.
      registry.forgetLocalSession(remoteB)
      expect(registry.snapshot().unreadSessionIds).toEqual([remoteB])

      registry.observeLocalSessionStatus('local-2', true)
      registry.observeLocalSessionStatus('local-2', false)
      expect(registry.snapshot().unreadSessionIds).toEqual(['local-2', remoteB])
      registry.forgetLocalSession('local-2')
      expect(registry.snapshot().unreadSessionIds).toEqual([remoteB])
    } finally {
      registry.dispose()
    }
  })
})

describe('0f. Snapshot acceptance across Host restarts', () => {
  it('accepts a lower revision when the Host epoch changed', () => {
    const current = { revision: 900, hostEpoch: 'epoch-a' }
    expect(shouldApplySnapshot(current, { revision: 901, hostEpoch: 'epoch-a' })).toBe(true)
    expect(shouldApplySnapshot(current, { revision: 900, hostEpoch: 'epoch-a' })).toBe(false)
    expect(shouldApplySnapshot(current, { revision: 899, hostEpoch: 'epoch-a' })).toBe(false)
    expect(shouldApplySnapshot(current, { revision: 1, hostEpoch: 'epoch-b' })).toBe(true)
    // Older Hosts omit the epoch: the plain revision rule still applies.
    expect(shouldApplySnapshot(current, { revision: 899 })).toBe(false)
    expect(shouldApplySnapshot(current, { revision: 900 }, true)).toBe(true)
  })
})

describe('0c. Optional cross-Host read state file', () => {  it('merges Host sections by newest timestamp and lets a tie read win', () => {
    const local = {
      s1: { unread: true, at: 10 },
      s2: { unread: true, at: 20 },
    }
    const doc = parseSharedReadDocument(JSON.stringify({
      version: 1,
      hosts: {
        a: { updatedAt: 1, sessions: { s1: { unread: false, at: 11 } } },
        b: { updatedAt: 2, sessions: { s2: { unread: false, at: 20 } } },
      },
    }))!
    const merged = mergeSharedReadEntries(local, doc)
    expect(merged.s1).toEqual({ unread: false, at: 11 })
    expect(merged.s2).toEqual({ unread: false, at: 20 })
  })

  it('replaces only this Host section and bounds the written entries', () => {
    const existing = parseSharedReadDocument(JSON.stringify({
      version: 1,
      hosts: { other: { updatedAt: 5, sessions: { keep: { unread: true, at: 5 } } } },
    }))!
    const sessions = Object.fromEntries(
      Array.from({ length: 350 }, (_, index) => [`s-${String(index)}`, { unread: index % 2 === 0, at: index }]),
    )
    const doc = buildSharedReadDocument(existing, 'me', sessions, 999)
    expect(doc.hosts.other?.sessions.keep).toEqual({ unread: true, at: 5 })
    expect(doc.hosts.me?.updatedAt).toBe(999)
    expect(Object.keys(doc.hosts.me?.sessions ?? {})).toHaveLength(300)
    expect(doc.hosts.me?.sessions['s-349']).toEqual({ unread: false, at: 349 })
    expect(doc.hosts.me?.sessions['s-0']).toBeUndefined()
  })

  it('rejects malformed files and only targets POSIX DSH homes', () => {
    expect(parseSharedReadDocument('')).toBeUndefined()
    expect(parseSharedReadDocument('{')).toBeUndefined()
    expect(parseSharedReadDocument(JSON.stringify({ version: 2, hosts: {} }))).toBeUndefined()
    expect(isPosixRemoteHome('/home/me/.dsh')).toBe(true)
    expect(isPosixRemoteHome('C:\\Users\\me\\.dsh')).toBe(false)
    expect(isPosixRemoteHome('\\\\server\\share')).toBe(false)
    expect(isPosixRemoteHome(undefined)).toBe(false)
    expect(sharedReadStatePath('/home/me/.dsh/')).toBe('/home/me/.dsh/plugins/dsh-multi-device/read-state.json')
  })

  it('writes and reads a bounded state file with the generated shell command', () => {
    const dir = makeTempDir('dsh-md-shared-')
    const path = join(dir, 'nested', 'read-state.json')
    const write = buildWriteSharedStateCommand(path, {
      version: 1,
      hosts: { me: { updatedAt: 1, sessions: { s1: { unread: true, at: 2 } } } },
    })
    expect(write).toContain('umask 077')
    expect(write).toContain('mkdir -p')
    expect(write).toContain('base64 -d')
    expect(write).toContain('base64 -D')
    expect(write).toContain('mv -f')
    execSync(write, { stdio: 'pipe' })
    const read = execSync(buildReadSharedStateCommand(path), { encoding: 'utf8' })
    expect(parseSharedReadDocument(read)?.hosts.me?.sessions.s1).toEqual({ unread: true, at: 2 })
  })
})

describe('1. Identity Mapping & Git Remote URL Normalization', () => {
  it('losslessly encodes and decodes remote SessionIds and EventIds', () => {
    const devId = DeviceId('ubuntu~gpu%1')
    const rawSid = 'session-9f8e7d6c-1234'
    const encodedSid = encodeRemoteSessionId(devId, rawSid)
    expect(encodedSid).toBe('md~ubuntu%7Egpu%251~session-9f8e7d6c-1234')

    const decodedSid = decodeSessionId(encodedSid)
    expect(decodedSid).toEqual({
      deviceId: devId,
      rawSessionId: rawSid,
      isRemote: true,
    })

    expect(decodeSessionId('session-local-123')).toEqual({
      deviceId: LOCAL_DEVICE_ID,
      rawSessionId: 'session-local-123',
      isRemote: false,
    })

    const encodedEv = encodeRemoteEventId(devId, 'ev-42')
    expect(encodedEv).toBe('md-ev~ubuntu%7Egpu%251~ev-42')
    expect(isNamespacedEventId(encodedEv)).toBe(true)
  })

})

describe('2. System ~/.ssh/config Parser & Tunnel Argument Builder', () => {
  it('parses Host blocks, wildcards, negated patterns, tokens, and resolves first-match-wins', () => {
    const sampleConfig = `
# Global defaults
Host gpu-* !gpu-deprecated
  User ubuntu
  Port 2222
  ProxyJump bastion.internal

Host gpu-node1
  HostName 10.20.30.40
  IdentityFile ~/.ssh/id_%r_%h

Host *
  User defaultuser
  Port 22
  ServerAliveInterval 20
`
    const blocks = parseSshConfigText(sampleConfig, '/home/test/.ssh/config')
    const resolved1 = resolveSshConfigForTransport(
      { kind: 'ssh', host: 'gpu-node1', remotePort: 3080 },
      blocks,
      '/home/test',
    )
    expect(resolved1.hostName).toBe('10.20.30.40')
    expect(resolved1.user).toBe('ubuntu')
    expect(resolved1.port).toBe(2222)
    expect(resolved1.proxyJump).toBe('bastion.internal')
    expect(resolved1.identityFiles[0]).toBe('/home/test/.ssh/id_ubuntu_10.20.30.40')
    expect(resolved1.serverAliveInterval).toBe(20)

    const resolvedDeprecated = resolveSshConfigForTransport(
      { kind: 'ssh', host: 'gpu-deprecated' },
      blocks,
      '/home/test',
    )
    expect(resolvedDeprecated.user).toBe('defaultuser')
    expect(resolvedDeprecated.port).toBe(22)

    const cliArgs = buildTunnelSshArgs(
      { kind: 'ssh', host: 'gpu-node1', remotePort: 3080 },
      resolved1,
      54321,
    )
    expect(cliArgs).toContain('-L')
    expect(cliArgs).toContain('127.0.0.1:54321:127.0.0.1:3080')
    expect(cliArgs).toContain('StrictHostKeyChecking=yes')
    expect(cliArgs.join(' ')).not.toContain('accept-new')
    expect(cliArgs.at(-1)).toBe('gpu-node1')
  })

  it('parses user@host:port and ssh:// shorthand specs', () => {
    expect(parseSshTargetSpec('root@192.168.1.50:22022')).toEqual({
      username: 'root',
      host: '192.168.1.50',
      port: 22022,
    })
    expect(parseSshTargetSpec('ssh://dev@10.0.0.8:2222')).toEqual({
      username: 'dev',
      host: '10.0.0.8',
      port: 2222,
    })
  })
})

describe('3. Persistent Authentication & Cookie Minting', () => {
  it('extracts launch tokens, parses .credentials.yaml, and mints valid DSH 0.2 signed cookies', () => {
    expect(extractLaunchToken('http://127.0.0.1:3080/?token=my_launch_token_123')).toBe(
      'my_launch_token_123',
    )
    expect(extractLaunchToken('plain_token_xyz')).toBe('plain_token_xyz')

    const sampleYaml = `
version: 1
records:
  client-connection/browser-session:
    kind: grant
    payload:
      version: 1
      secret: Lmbm2Ybqc9aKKkxPULPgyA0SbQBUlKtboujV41nWgJw
`
    const secret = parseSigningSecretFromCredentialsYaml(sampleYaml)
    expect(secret).toBe('Lmbm2Ybqc9aKKkxPULPgyA0SbQBUlKtboujV41nWgJw')

    const cookie = mintDshBrowserCookie('127.0.0.1:3080', secret!)
    expect(cookie).toBeDefined()
    expect(cookie!.startsWith(`${dshCookieName('127.0.0.1:3080')}=v1.`)).toBe(true)
  })

  it('keeps entered credentials in the secrets file, never the device document', async () => {
    const dir = makeTempDir('dsh-md-secrets-')
    const dataFile = join(dir, 'devices.json')
    const secretsFile = join(dir, 'secrets.json')
    const registry = new DeviceRegistry(
      dataFile,
      secretsFile,
      { localPort: () => 3080 },
      { allowDirectTransport: true },
    )
    try {
      const added = await registry.upsertDevice({
        name: 'secret-check',
        enabled: false,
        transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:9' },
        auth: { mode: 'bearer', credential: 'super-secret-token' },
      })
      expect(added.ok).toBe(true)
      expect(readFileSync(dataFile, 'utf8')).not.toContain('super-secret-token')
      expect(readFileSync(secretsFile, 'utf8')).toContain('super-secret-token')
    } finally {
      registry.dispose()
    }
  })
})

describe('3b. Node-native Remote HTTP Carrier', () => {
  it('preserves a caller-supplied Host and Origin over a non-matching URL authority', async () => {
    let seenHost = ''
    let seenOrigin = ''
    const server = createServer((req, res) => {
      seenHost = req.headers.host ?? ''
      seenOrigin = req.headers.origin ?? ''
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{}')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
    const port = (server.address() as { port: number }).port
    try {
      const response = await requestRemote(`http://127.0.0.1:${port}/api/probe`, {
        method: 'POST',
        headers: {
          Host: '127.0.0.1:3080',
          Origin: 'http://127.0.0.1:3080',
          'content-type': 'application/json',
        },
        body: '{}',
      })
      expect(response.status).toBe(200)
      expect(seenHost).toBe('127.0.0.1:3080')
      expect(seenOrigin).toBe('http://127.0.0.1:3080')
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('keeps the signed-cookie window within DSH maxAgeSeconds', () => {
    const sampleYaml = `
version: 1
records:
  client-connection/browser-session:
    kind: grant
    payload:
      version: 1
      secret: Lmbm2Ybqc9aKKkxPULPgyA0SbQBUlKtboujV41nWgJw
`
    const secret = parseSigningSecretFromCredentialsYaml(sampleYaml)!
    const now = Date.now()
    const cookie = mintDshBrowserCookie('127.0.0.1:3080', secret, now)!
    const body = cookie.split('.')[1]!
    const payload = JSON.parse(
      Buffer.from(body.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8'),
    ) as { issuedAt: number; expiresAt: number }
    expect(payload.issuedAt).toBeLessThanOrEqual(now)
    expect(payload.expiresAt).toBeGreaterThan(now)
    expect(payload.expiresAt - payload.issuedAt).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000)
  })

  it('separates HTTP Host authority from TLS cookie authority', () => {
    const direct = {
      id: DeviceId('direct-https'),
      name: 'direct',
      enabled: true,
      transport: { kind: 'direct' as const, baseUrl: 'https://dev.example.com:8443' },
      auth: { mode: 'auto' as const },
    }
    expect(resolveRemoteAuthority(direct)).toBe('dev.example.com:8443')
    expect(resolveRemoteCookieAuthority(direct)).toBe('https://dev.example.com:8443')
    expect(resolveRemoteScheme(direct)).toBe('https')
    const ssh = {
      id: DeviceId('ssh'),
      name: 'ssh',
      enabled: true,
      transport: { kind: 'ssh' as const, host: 'dev', remotePort: 3080 },
      auth: { mode: 'auto' as const },
    }
    expect(resolveRemoteAuthority(ssh)).toBe('127.0.0.1:3080')
    expect(resolveRemoteCookieAuthority(ssh)).toBe('127.0.0.1:3080')
    expect(resolveRemoteScheme(ssh)).toBe('http')
  })

  it('discovers local private keys for the picker while skipping public/config files', () => {
    const home = makeTempDir('dsh-md-keys-')
    mkdirSync(join(home, '.ssh'), { recursive: true })
    const privateKey = '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n'
    writeFileSync(join(home, '.ssh', 'id_ed25519'), privateKey)
    writeFileSync(join(home, '.ssh', 'id_ed25519.pub'), 'ssh-ed25519 AAAA')
    writeFileSync(join(home, '.ssh', 'config'), 'Host example\n')
    const keys = listLocalSshKeys(home)
    expect(keys.map(key => key.name)).toEqual(['id_ed25519'])
    expect(keys[0]?.publicKeyPath).toBe(join(home, '.ssh', 'id_ed25519.pub'))
  })
})

describe('4d. Offline catalog cache & reconnect waiting', () => {
  function silentCallbacks(): ConstructorParameters<typeof RemoteDeviceClient>[2] {
    return {
      onStateChanged: () => {},
      onRemoteEventFrame: () => {},
      onControlProjectionFrame: () => {},
      onWorkspacesChanged: () => {},
      onGitRemotesDiscovered: () => {},
      onModelCatalogChanged: () => {},
    }
  }

  function directConfig(id: string): ConstructorParameters<typeof RemoteDeviceClient>[0] {
    return {
      id: DeviceId(id),
      name: id,
      enabled: false,
      transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:9' },
      auth: { mode: 'none' },
    }
  }

  const cachedCatalog = {
    deviceId: DeviceId('dev-cache'),
    syncedAt: 1_760_000_000_000,
    protocolVersion: '0.2' as const,
    sessions: [
      { sessionId: 's-1', updatedAt: 10, agentAvailable: true, running: false, blank: false, cwd: '/srv/app' },
      { sessionId: 's-2', updatedAt: 20, agentAvailable: true, running: true, blank: true },
    ],
    workspaces: [
      {
        workspaceId: 'ws-1',
        path: '/srv/app',
        title: 'app',
        sessionIds: ['s-1'],
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-02T00:00:00.000Z',
      },
    ],
    archivedSessionIds: ['s-old'],
    pinnedSessionIds: ['s-1'],
  }

  it('hydrates an offline client from the persisted catalog and reports it as stale', async () => {
    const auth = new DeviceAuthManager(join(makeTempDir('dsh-md-cache-'), 'secrets.json'))
    const client = new RemoteDeviceClient(directConfig('dev-cache'), auth, silentCallbacks())
    client.hydrateCatalog(cachedCatalog)

    expect(client.sessionSummaries().map(session => session.sessionId)).toEqual(['s-1', 's-2'])
    // A persisted running flag is not a live claim: the stale view must stop
    // the spinner until a real baseline arrives.
    expect(client.sessionSummaries().find(session => session.sessionId === 's-2')?.running).toBe(false)
    expect(client.workspaceItems().map(workspace => workspace.workspaceId)).toEqual(['ws-1'])
    expect(client.archivedIds()).toEqual(['s-old'])
    expect(client.pinnedIds()).toEqual(['s-1'])

    const view = client.toView()
    expect(view.lastSyncedAt).toBe(cachedCatalog.syncedAt)
    expect(view.catalogStale).toBe(true)
    expect(view.sessionCount).toBe(2)
    expect(view.workspaceCount).toBe(1)

    // Round-trips through the durable shape (projections never survive).
    const snapshot = client.catalogSnapshot()
    expect(snapshot.sessions).toEqual(cachedCatalog.sessions)
    expect(snapshot.workspaces).toEqual(cachedCatalog.workspaces)
    expect(snapshot.syncedAt).toBe(cachedCatalog.syncedAt)

    const controller = new AbortController()
    await expect(client.waitForConnected(controller.signal, 30)).resolves.toBe(false)
  })

  it('persists catalogs across a registry restart and keeps cached sessions in the snapshot', async () => {
    const dir = makeTempDir('dsh-md-registry-cache-')
    const dataFile = join(dir, 'registry.json')
    const secretsFile = join(dir, 'secrets.json')
    const localHost = { localPort: () => 3080 }
    const options = { allowDirectTransport: true }

    const startSpy = vi.spyOn(RemoteDeviceClient.prototype, 'start').mockImplementation(() => {})
    try {
      const first = new DeviceRegistry(dataFile, secretsFile, localHost, options)
      const added = await first.upsertDevice({
        id: 'dev-cache',
        name: 'cache-dev',
        enabled: true,
        transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:9' },
        auth: { mode: 'none' },
      })
      expect(added.ok).toBe(true)
      first.setDeviceCatalog(cachedCatalog)
      first.saveToDisk()
      first.dispose()
      await first.flushPersistence()

      const persisted = JSON.parse(readFileSync(dataFile, 'utf8')) as {
        catalogs?: Record<string, { syncedAt: number }>
      }
      const persistedCatalogs = JSON.parse(readFileSync(join(dir, 'catalogs.json'), 'utf8')) as {
        version: number
        catalogs: Record<string, { syncedAt: number }>
      }
      expect(persisted.catalogs).toBeUndefined()
      expect(persistedCatalogs.version).toBe(2)
      expect(persistedCatalogs.catalogs['dev-cache']?.syncedAt).toBe(cachedCatalog.syncedAt)

      const second = new DeviceRegistry(dataFile, secretsFile, localHost, options)
      expect(second.deviceCatalog(DeviceId('dev-cache'))?.sessions).toHaveLength(2)
      second.startAll()
      const client = second.client(DeviceId('dev-cache'))!
      expect(client.toView().lastSyncedAt).toBe(cachedCatalog.syncedAt)
      expect(client.toView().catalogStale).toBe(true)

      // The offline device keeps last-known counts for its tab instead of
      // pretending to have none, and reports them as stale.
      const snapshot = second.snapshot()
      expect(snapshot.devices[0]?.name).toBe('cache-dev')
      expect(snapshot.attentionByDevice?.['dev-cache']?.fresh).toBe(false)
      expect(snapshot.attentionByDevice?.['dev-cache']?.unreadSessionIds).toEqual([])
      second.dispose()
      await second.flushPersistence()
    } finally {
      startSpy.mockRestore()
    }
  })

  it('stops stale spinners when a running device goes offline', () => {
    const events: Record<string, unknown>[] = []
    const callbacks = silentCallbacks()
    callbacks.onRemoteEventFrame = (_id, frame) => {
      events.push(frame as unknown as Record<string, unknown>)
    }
    const client = new RemoteDeviceClient(
      { ...directConfig('dev-offline'), enabled: true },
      new DeviceAuthManager(join(makeTempDir('dsh-md-offline-'), 'secrets.json')),
      callbacks,
    )
    client.hydrateCatalog({
      ...cachedCatalog,
      deviceId: DeviceId('dev-offline'),
      sessions: [
        { sessionId: 's-running', updatedAt: 10, agentAvailable: true, running: true, blank: false },
      ],
    })
    expect(client.toView().runningSessionCount).toBe(0)
    client.stop()
    const status = events.find(frame =>
      frame.type === 'emit' &&
      frame.event === 'api-session/status' &&
      Array.isArray(frame.args) &&
      frame.args[1] === false,
    )
    expect(status).toBeUndefined()
    expect(client.sessionSummaries().find(summary => summary.sessionId === 's-running')?.running).toBe(false)
    expect(client.toView().runningSessionCount).toBe(0)
    expect(client.toView().catalogStale).toBe(true)
  })

})

describe('6. Stability guards', () => {
  it('refuses to forward an SSH tunnel anywhere but the remote loopback', () => {
    expect(assertLoopbackForward({ kind: 'ssh', host: 'gpu', remoteBindHost: 'localhost', remotePort: 3080 })).toEqual({
      host: 'localhost',
      port: 3080,
    })
    expect(() => assertLoopbackForward({ kind: 'ssh', host: 'gpu', remoteBindHost: '10.0.0.8' })).toThrow(/loopback/)
  })

  it('trusts a hashed known_hosts line only when the presented key matches', () => {
    const key = Buffer.from('ssh-ed25519-test-key')
    const hashed = `|1|salt|hash ssh-ed25519 ${key.toString('base64')}`
    expect(hostKeyMatchesKnownHostsLine(`# Host gpu found: line 3`, key)).toBe(false)
    expect(hostKeyMatchesKnownHostsLine(hashed, key)).toBe(true)
    expect(hostKeyMatchesKnownHostsLine(hashed, Buffer.from('different-key-material'))).toBe(false)
  })

  it('does not treat an items array as DSH 0.2 when host.describe says 0.1', () => {
    expect(classifyRemoteProtocol({ items: [] })).toBe('unknown')
    expect(classifyRemoteProtocol({ version: '0.1.8', items: [] })).toBe('0.1')
    expect(protocolGeneration('0.2.1')).toBe('0.2')
    expect(protocolGeneration('0.1.0')).toBe('0.1')
    expect(resolveProbedProtocol({ items: [{ sessionId: 's' }] }, {})).toEqual({ protocol: '0.2' })
    expect(resolveProbedProtocol({ items: [{ sessionId: 's' }] }, { version: '0.1.8', cwd: '/root' })).toEqual({
      protocol: '0.1',
      version: '0.1.8',
    })
    expect(resolveProbedProtocol(undefined, { version: '0.1.0-rc.6', cwd: '/root' })).toEqual({
      protocol: '0.1',
      version: '0.1.0-rc.6',
    })
  })

  it('tells a 401 apart from an SSH key failure', () => {
    const ssh = { kind: 'ssh' as const, host: 'macos-dev', remotePort: 3080 }
    expect(describeProbeFailure(undefined, {
      name: 'macos-dev',
      transport: ssh,
      auth: { mode: 'auto' },
    })).toMatch(/Could not reach/)
    expect(describeProbeFailure(401, {
      name: 'macos-dev',
      transport: ssh,
      auth: { mode: 'auto' },
    })).toMatch(/did not read the remote credentials/)
    expect(describeProbeFailure(401, {
      name: 'macos-dev',
      transport: { ...ssh, bootstrapFromRemoteCredentials: true },
      auth: { mode: 'auto' },
    })).toMatch(/rejected the minted cookie/)
    expect(describeProbeFailure(401, {
      name: 'macos-dev',
      transport: ssh,
      auth: { mode: 'token', credential: 'launch' },
    })).toMatch(/authentication token or DSH port/)
    expect(describeProbeFailure(502, {
      name: 'macos-dev',
      transport: ssh,
    })).toMatch(/HTTP 502/)
  })

  it('mints a cookie from a remote credentials file and never stores the signing secret', async () => {
    const dir = makeTempDir('dsh-md-bootstrap-')
    const auth = new DeviceAuthManager(join(dir, 'secrets.json'))
    const secret = 'Lmbm2Ybqc9aKKkxPULPgyA0SbQBUlKtboujV41nWgJw'
    const yaml = `client-connection/browser-session:\n  payload:\n    secret: ${secret}\n`
    let spawnCalls = 0
    setSshSpawn(() => {
      spawnCalls += 1
      const stdout = new EventEmitter()
      const stderr = new EventEmitter()
      const proc = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter
        stderr: EventEmitter
        stdin: null
        kill: () => boolean
      }
      proc.stdout = stdout
      proc.stderr = stderr
      proc.stdin = null
      proc.kill = () => true
      queueMicrotask(() => {
        stdout.emit('data', Buffer.from(yaml))
        proc.emit('close', 0)
      })
      return proc as never
    })
    const device = {
      id: DeviceId('macos-dev'),
      name: 'macos-dev',
      enabled: true,
      transport: {
        kind: 'ssh' as const,
        host: 'macos-dev',
        remotePort: 3080,
        bootstrapFromRemoteCredentials: true,
      },
      auth: { mode: 'auto' as const },
    }
    try {
      const minted = await auth.ensureAuthenticated(device, 'http://127.0.0.1:9', true)
      expect(minted).toEqual({ ok: true })
      const stored = auth.storedSecret(device.id)
      expect(stored?.cookie?.startsWith(`${dshCookieName('127.0.0.1:3080')}=v1.`)).toBe(true)
      expect(stored?.signingSecret).toBeUndefined()
      expect(readFileSync(join(dir, 'secrets.json'), 'utf8')).not.toContain(secret)
      expect(auth.getAuthHeaders(device).Cookie).toBe(stored?.cookie)
      expect(spawnCalls).toBe(1)

      const skipped = new DeviceAuthManager(join(dir, 'skipped.json'))
      const withoutBootstrap = {
        ...device,
        id: DeviceId('no-bootstrap'),
        transport: { kind: 'ssh' as const, host: 'macos-dev', remotePort: 3080 },
      }
      const callsBeforeSkip = spawnCalls
      const plain = await skipped.ensureAuthenticated(withoutBootstrap, 'http://127.0.0.1:9', true)
      expect(plain).toEqual({ ok: true })
      expect(spawnCalls).toBe(callsBeforeSkip)
      expect(skipped.getAuthHeaders(withoutBootstrap).Cookie).toBeUndefined()
    } finally {
      setSshSpawn(null)
    }
  })

  it('keeps a stored SSH passphrase when the edit form sends an empty value', () => {
    const dir = makeTempDir('dsh-md-pass-')
    const auth = new DeviceAuthManager(join(dir, 'secrets.json'))
    auth.setSshPassphrase(DeviceId('dev-a'), 'correct horse')
    auth.setSshPassphrase(DeviceId('dev-a'), '')
    auth.setSshPassphrase(DeviceId('dev-a'), undefined)
    expect(auth.storedSecret(DeviceId('dev-a'))?.sshPassphrase).toBe('correct horse')
    auth.setSshPassphrase(DeviceId('dev-a'), null)
    expect(auth.storedSecret(DeviceId('dev-a'))?.sshPassphrase).toBeUndefined()
  })

  it('rejects a non-loopback control-plane request even when the host hook is missing', () => {
    expect(admitControlPlaneRequest({ host: '127.0.0.1:3080' })).toBe(true)
    expect(admitControlPlaneRequest({ host: '[::1]:3080', origin: 'http://[::1]:3080' })).toBe(true)
    expect(admitControlPlaneRequest({ host: '10.0.0.8:3080' })).toBe(false)
    expect(admitControlPlaneRequest(
      { host: '127.0.0.1:3080' },
      () => 403,
    )).toBe(false)
  })

  it('calls connection.requestRejection as a method on the Cordis proxy', async () => {
    // Cordis is a host peer, not a plugin dependency. CI has no copy; a local
    // DSH install (or DSH_CORDIS_MODULE) runs the real proxy regression.
    const cordisPath = process.env.DSH_CORDIS_MODULE
      ?? [
        '/Users/lvziw/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js',
        '/home/lvziw/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js',
      ].find((candidate) => existsSync(candidate))
    if (cordisPath === undefined || !existsSync(cordisPath)) return
    const cordis = await import(cordisPath) as {
      Context: new () => {
        plugin(plugin: object): Promise<unknown>
        get(name: string): ConnectionFence
      }
      Service: new (ctx: object, name: string) => object
    }
    const { Context, Service } = cordis

    class ConnectionFence extends Service {
      constructor(ctx: object) {
        super(ctx, 'connection')
      }
      requestRejection(request: { headers: { host?: string } }): number | undefined {
        return this.admit(request)
      }
      admit(request: { headers: { host?: string } }): number | undefined {
        if (request.headers.host === 'boom.example') throw new Error('connection fence failed')
        if (request.headers.host === 'denied.example') return 401
        return undefined
      }
    }

    const root = new Context()
    let consumer: { get(name: string): ConnectionFence } | undefined
    await root.plugin({
      apply(ctx: object) {
        new ConnectionFence(ctx)
      },
    })
    await root.plugin({
      apply(ctx: { get(name: string): ConnectionFence }) {
        consumer = ctx
      },
    })
    if (consumer === undefined) throw new Error('consumer plugin did not run')

    const connection = consumer.get('connection')
    const headers = { host: '127.0.0.1:3080' }
    const detached = connection.requestRejection
    expect(() => detached({ headers })).toThrow(/reading 'admit'/)

    expect(connectionRequestRejection(consumer as never, headers)).toBeUndefined()

    const denied = { host: 'denied.example' }
    expect(connectionRequestRejection(consumer as never, denied)).toBe(401)
    expect(admitMultiDeviceRequest(consumer as never, { headers: denied } as IncomingMessage)).toBe(false)

    const admitted = { headers } as IncomingMessage
    expect(admitMultiDeviceRequest(consumer as never, admitted)).toBe(true)
    expect(admitMultiDeviceRequest(consumer as never, {
      headers: { host: '10.0.0.8:3080' },
    } as IncomingMessage)).toBe(false)

    const boom = { host: 'boom.example' }
    expect(connectionRequestRejection(consumer as never, boom)).toBe(403)
    expect(admitMultiDeviceRequest(consumer as never, { headers: boom } as IncomingMessage)).toBe(false)
  })

  it('does not forward the browser cookie or authorization to the upstream', () => {
    const headers = buildForwardHeaders(
      {
        host: '127.0.0.1:1',
        cookie: 'session=from-browser',
        authorization: 'Bearer from-browser',
        'x-forwarded-for': '1.2.3.4',
        accept: 'text/html',
      },
      { host: '127.0.0.1:3080', cookie: 'dsh-auth=plugin', authorization: 'Bearer plugin' },
    )
    expect(headers['cookie']).toBe('dsh-auth=plugin')
    expect(headers['authorization']).toBe('Bearer plugin')
    expect(headers['accept']).toBe('text/html')
    expect(headers['x-forwarded-for']).toBeUndefined()
    expect(JSON.stringify(headers)).not.toContain('from-browser')
  })
})

describe('6b. Native-mode authentication recovery', () => {
  const SECRET = 'Lmbm2Ybqc9aKKkxPULPgyA0SbQBUlKtboujV41nWgJw'
  const credentialsYaml = `client-connection/browser-session:\n  payload:\n    secret: ${SECRET}\n`

  afterEach(() => {
    setSshSpawn(null)
  })

  it('falls back to PowerShell when a Windows remote cannot run cat', async () => {
    const commands: string[] = []
    setSshSpawn((_command, args) => {
      const remoteCommand = String(args[args.length - 1] ?? '')
      commands.push(remoteCommand)
      const proc = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter
        stderr: EventEmitter
        stdin: null
        kill: () => boolean
      }
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      proc.stdin = null
      proc.kill = () => true
      queueMicrotask(() => {
        // cmd.exe rejects `cat`; only the PowerShell probe yields the secret.
        if (remoteCommand.includes('powershell')) {
          proc.stdout.emit('data', Buffer.from(credentialsYaml))
          proc.emit('close', 0)
        } else {
          proc.stderr.emit('data', Buffer.from("'cat' is not recognized"))
          proc.emit('close', 1)
        }
      })
      return proc as never
    })

    const transport = {
      kind: 'ssh' as const,
      host: 'windows-remote',
      remotePort: 3080,
      bootstrapFromRemoteCredentials: true,
    }
    const read = await readRemoteCredentials(transport, '~/.dsh')
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.text).toContain(SECRET)
    expect(commands.length).toBe(2)
    expect(commands[1]).toContain('powershell')
    expect(commands[1]).toContain('$env:USERPROFILE')
  })

  it('expands ~ via $HOME instead of quoting it into a literal directory', () => {
    expect(buildRemoteCredentialsCatCommand('~/.dsh')).toBe(
      'cat "$HOME/.dsh/.credentials.yaml" 2>/dev/null || true',
    )
    expect(buildRemoteCredentialsCatCommand('~')).toBe(
      'cat "$HOME/.credentials.yaml" 2>/dev/null || true',
    )
    expect(buildRemoteCredentialsCatCommand('~/.config/dsh')).toBe(
      'cat "$HOME/.config/dsh/.credentials.yaml" 2>/dev/null || true',
    )
    expect(buildRemoteCredentialsCatCommand('/home/dev/.dsh')).toBe(
      "cat '/home/dev/.dsh/.credentials.yaml' 2>/dev/null || true",
    )
  })

  it('maps ~/.dsh and absolute Windows DSH homes to PowerShell paths', () => {
    expect(remoteCredentialsPathForPowerShell('~/.dsh')).toBe('$env:USERPROFILE\\.dsh')
    expect(remoteCredentialsPathForPowerShell('~/.config/dsh')).toBe(
      '$env:USERPROFILE\\.config\\dsh',
    )
    expect(remoteCredentialsPathForPowerShell('C:/Users/dev/.dsh')).toBe("'C:\\Users\\dev\\.dsh'")
  })

  it('drops a rejected cookie but keeps the user credential for a forced re-auth', async () => {
    const dir = makeTempDir('dsh-md-invalidate-')
    const auth = new DeviceAuthManager(join(dir, 'secrets.json'))
    const deviceId = DeviceId('dev-invalidate')
    auth.setAuthCredential(deviceId, 'http://127.0.0.1:3080/?token=abc')

    const server = createServer((_req, res) => {
      res.writeHead(303, {
        'set-cookie': `${dshCookieName('127.0.0.1:3080')}=v1.payload.signature; Path=/; HttpOnly`,
        location: '/',
      })
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    try {
      const exchanged = await auth.exchangeLaunchToken(
        deviceId,
        `http://127.0.0.1:${String(port)}`,
        '127.0.0.1:3080',
        '127.0.0.1:3080',
        'abc',
      )
      expect(exchanged).toEqual({ ok: true })
      expect(auth.storedSecret(deviceId)?.cookie).toBeDefined()
      expect(auth.storedSecret(deviceId)?.authCredential).toBe(
        'http://127.0.0.1:3080/?token=abc',
      )

      auth.invalidate(deviceId)
      expect(auth.storedSecret(deviceId)?.cookie).toBeUndefined()
      expect(auth.storedSecret(deviceId)?.authCredential).toBe(
        'http://127.0.0.1:3080/?token=abc',
      )
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('preserves Vite ?? batch request targets through the native proxy', async () => {
    let seenTarget = ''
    const upstream = createServer((req, res) => {
      seenTarget = req.url ?? ''
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
      res.end('export const ok = true')
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    const address = upstream.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    const proxy = new NativeDeviceProxy(
      {
        id: DeviceId('dev-batch'),
        name: 'batch-device',
        enabled: true,
        transport: { kind: 'direct', baseUrl: `http://127.0.0.1:${String(port)}` },
        auth: { mode: 'none' },
      },
      () => `http://127.0.0.1:${String(port)}`,
      new DeviceAuthManager(),
    )
    try {
      await proxy.start()
      const url = proxy.proxyUrl()!
      const bootstrap = await fetch(url, { redirect: 'manual' })
      const cookie = bootstrap.headers.get('set-cookie')?.split(';')[0]
      expect(cookie).toBeTruthy()

      const target = '/plugins/??@deepseek-ai/dsh-client-modules/client.js&rev=abc123'
      const response = await fetch(new URL(url).origin + target, {
        headers: { cookie: cookie! },
      })
      expect(response.status).toBe(200)
      expect(seenTarget).toBe(target)
    } finally {
      proxy.stop()
      await new Promise<void>((resolve) => upstream.close(() => resolve()))
    }
  })

  it('serves a recovery page instead of leaking the remote 401 one-liner', async () => {
    const upstream = createServer((_req, res) => {
      res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh web authentication required; reopen the URL printed by dsh web.')
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    const address = upstream.address()
    const upstreamPort = typeof address === 'object' && address !== null ? address.port : 0

    const states: string[] = []
    const proxy = new NativeDeviceProxy(
      {
        id: DeviceId('dev-401'),
        name: 'ubuntu-dev',
        enabled: true,
        transport: { kind: 'direct', baseUrl: `http://127.0.0.1:${String(upstreamPort)}` },
        auth: { mode: 'none' },
      },
      () => `http://127.0.0.1:${String(upstreamPort)}`,
      new DeviceAuthManager(),
      undefined,
      {
        onAuthState: (_id, state) => {
          states.push(state)
        },
      },
    )
    try {
      await proxy.start()
      const url = proxy.proxyUrl()
      expect(url).toBeDefined()
      const first = await fetch(url!, { redirect: 'manual' })
      expect(first.status).toBe(302)
      const cookie = first.headers.get('set-cookie')?.split(';')[0]
      expect(cookie).toBeTruthy()

      const second = await fetch(new URL(url!).origin + '/', {
        headers: { cookie: cookie! },
      })
      expect(second.status).toBe(200)
      expect(second.headers.get('x-dsh-md-auth-required')).toBe('1')
      const body = await second.text()
      expect(body).toContain('需要登录')
      expect(body).toContain('多设备')
      expect(body).not.toContain('reopen the URL printed by dsh web')
      expect(states).toContain('required')
    } finally {
      proxy.stop()
      await new Promise<void>((resolve) => upstream.close(() => resolve()))
    }
  })
})

describe('7. P2 boundary guards', () => {
  it('tracks plan-review waterfalls alongside approval and questions', () => {
    expect(pendingInteractionKind('approval/request')).toBe('approval')
    expect(pendingInteractionKind('user-questions/request')).toBe('question')
    expect(pendingInteractionKind('plan-review/request')).toBe('plan-review')
    expect(pendingInteractionKind('other/request')).toBeUndefined()
  })

  it('caps a stalled stream queue instead of growing without bound', () => {
    const queue = new BoundedStreamQueue<number>(2)
    queue.push(1)
    queue.push(2)
    queue.push(3)
    expect(queue.overflow).toBe(true)
    expect(queue.shift()).toBe(1)
    expect(queue.shift()).toBe(2)
    expect(queue.shift()).toBeUndefined()
  })

  it('resolves relative Include patterns under ~/.ssh like OpenSSH', () => {
    expect(resolveUserIncludePattern('conf.d/*.conf').endsWith('/.ssh/conf.d/*.conf')).toBe(true)
    expect(resolveUserIncludePattern('/etc/ssh/ssh_config.d/*.conf')).toBe(
      '/etc/ssh/ssh_config.d/*.conf',
    )
    expect(resolveUserIncludePattern('~/custom/*.conf')).toBeDefined()
    expect(resolveUserIncludePattern('~/custom/*.conf').endsWith('/custom/*.conf')).toBe(true)
  })
})

describe('8. Native Settings UI & Streamlined Client State Helpers', () => {
  it('parses shorthand SSH host inputs and maps connection states to native StateDot states', async () => {
    const { deviceStateToDotState, parseSshHostInput } = await import('../src/client/state.ts')

    expect(parseSshHostInput('ubuntu-gpu')).toEqual({ host: 'ubuntu-gpu' })
    expect(parseSshHostInput('root@10.0.0.12:2202')).toEqual({
      host: '10.0.0.12',
      username: 'root',
      port: 2202,
    })
    expect(parseSshHostInput('ssh://dev@example.internal:2222')).toEqual({
      host: 'example.internal',
      username: 'dev',
      port: 2222,
    })
    expect(parseSshHostInput('[::1]:2222')).toEqual({
      host: '::1',
      port: 2222,
    })

    expect(deviceStateToDotState('connected')).toBe('done')
    expect(deviceStateToDotState('connecting')).toBe('ongoing')
    expect(deviceStateToDotState('reconnecting')).toBe('ongoing')
    expect(deviceStateToDotState('error')).toBe('error')
    expect(deviceStateToDotState('disabled')).toBe('idle')
  })

  it('registers settings.section and plugins.bundle.config without polluting sidebar.panellist or settings.plugins.tab, and renders native primitives cleanly', async () => {
    vi.doMock('@deepseek-ai/dsh-client-ui-primitives', async () => {
      const React = await import('react')
      const icon = (name: string) =>
        function MockIcon({ size = 16 }: { size?: number }) {
          return React.createElement('svg', { 'data-icon': name, width: size, height: size })
        }
      return {
        Button: React.forwardRef(function MockButton(
          { children, icon: ic, variant = 'ghost', size = 'md', ...rest }: Record<string, unknown>,
          ref: React.ForwardedRef<HTMLButtonElement>,
        ) {
          return React.createElement(
            'button',
            { ref, type: 'button', 'data-primitive': 'Button', 'data-variant': variant, 'data-size': size, ...rest },
            ic as React.ReactNode,
            children as React.ReactNode,
          )
        }),
        Input: React.forwardRef(function MockInput(
          { icon: _ic, ...rest }: Record<string, unknown>,
          ref: React.ForwardedRef<HTMLInputElement>,
        ) {
          return React.createElement('input', { ref, 'data-primitive': 'Input', ...rest })
        }),
        Switch: ({ checked, label, disabled }: { checked: boolean; label: string; disabled?: boolean }) =>
          React.createElement('button', {
            type: 'button',
            role: 'switch',
            'data-primitive': 'Switch',
            'aria-checked': checked,
            'aria-label': label,
            disabled,
          }),
        SegmentedControl: ({
          value,
          options,
          label,
        }: {
          value: string
          options: readonly { value: string; label: React.ReactNode; disabled?: boolean }[]
          label: string
        }) =>
          React.createElement(
            'div',
            { role: 'tablist', 'aria-label': label, 'data-primitive': 'SegmentedControl' },
            options.map(opt =>
              React.createElement(
                'button',
                {
                  key: opt.value,
                  type: 'button',
                  role: 'tab',
                  'aria-selected': opt.value === value,
                  disabled: opt.disabled,
                },
                opt.label,
              ),
            ),
          ),
        StateDot: ({ state }: { state: string }) =>
          React.createElement('span', { 'data-primitive': 'StateDot', 'data-state': state }),
        Tag: ({ children }: { children?: React.ReactNode }) =>
          React.createElement('span', { 'data-primitive': 'Tag' }, children),
        Pill: ({ active, children }: { active?: boolean; children?: React.ReactNode }) =>
          React.createElement('button', { type: 'button', 'data-primitive': 'Pill', 'data-active': Boolean(active) }, children),
        DisclosureRow: ({
          title,
          open,
          children,
        }: {
          title: React.ReactNode
          open: boolean
          children?: React.ReactNode
        }) =>
          React.createElement(
            'div',
            { 'data-primitive': 'DisclosureRow', 'data-open': open },
            React.createElement('div', null, title),
            open ? children : null,
          ),
        Modal: ({ open, title, children, footer }: { open: boolean; title?: string; children?: React.ReactNode; footer?: React.ReactNode }) =>
          open
            ? React.createElement('div', { role: 'dialog', 'aria-label': title, 'data-primitive': 'Modal' }, children, footer)
            : null,
        Toast: ({ text }: { text: string }) =>
          React.createElement('div', { role: 'alert', 'data-primitive': 'Toast' }, text),
        Tooltip: ({ children }: { children: React.ReactElement }) => children,
        MenuItemButton: ({ icon: ic, children }: { icon?: React.ReactNode; children: React.ReactNode }) =>
          React.createElement('button', { type: 'button', role: 'menuitem', 'data-primitive': 'MenuItemButton' }, ic, children),
        IconPlusOutlineRegular: icon('plus'),
        IconRefreshOutlineRegular: icon('refresh'),
        IconEditOutlineRegular: icon('edit'),
        IconTrashOutlineRegular: icon('trash'),
        IconSettingsOutlineRegular: icon('settings'),
        IconSettingsOutlineMedium: icon('settings-md'),
        IconRightUpOutlineRegular: icon('right-up'),
        IconChevronLeftOutlineRegular: icon('chevron-left'),
        IconChevronDownOutlineRegular: icon('chevron-down'),
        IconChevronRightOutlineRegular: icon('chevron-right'),
        IconCloseOutlineRegular: icon('close'),
        IconWarningOutlineRegular: icon('warning'),
        IconCheckCircleFillRegular: icon('check'),
        IconGlobeOutlineRegular: icon('globe'),
      }
    })

    const React = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const clientEntry = await import('../src/client/index.tsx')
    const { zh, en } = await import('../src/client/locales.ts')
    const { clientStore } = await import('../src/client/state.ts')

    const injectedSlots: string[] = []
    const registeredSlots = new Map<string, { options: Record<string, unknown>; component: (props: any) => React.ReactNode }>()
    const openedSections: string[] = []
    const disposers: Array<() => void> = []

    const mockCtx: import('../src/client/index.tsx').ClientContextLike = {
      effect(fn) {
        const dispose = fn()
        if (typeof dispose === 'function') disposers.push(dispose)
      },
      inject(_deps, fn) {
        fn(mockCtx)
      },
      locale: {
        register: () => () => {},
        bind: () => (k) => zh[k],
      },
      slots: {
        inject(slotName, fn) {
          injectedSlots.push(slotName)
          const dispose = fn()
          return typeof dispose === 'function' ? dispose : () => {}
        },
        register(options, component) {
          const key = `${String(options.name)}:${String(options.id ?? options.key ?? '')}`
          registeredSlots.set(key, { options, component })
          return () => {
            registeredSlots.delete(key)
          }
        },
        entries(slotName) {
          if (slotName === 'sidebar.settings') {
            return [
              {
                options: {
                  store: {
                    create: () => ({
                      actions: {
                        openSection: (id: string) => {
                          openedSections.push(id)
                        },
                      },
                    }),
                  },
                },
              },
            ]
          }
          return []
        },
      },
    }

    try {
      clientEntry.apply(mockCtx)

      // Must register native settings.section & plugins.bundle.config, and NEVER sidebar.panellist / main / settings.plugins.tab
      expect(injectedSlots).toContain('settings.section')
      expect(injectedSlots).toContain('plugins.bundle.config')
      expect(injectedSlots).toContain('shell.overlay')
      expect(injectedSlots).not.toContain('sidebar.panellist')
      expect(injectedSlots).not.toContain('main')
      expect(injectedSlots).not.toContain('settings.plugins.tab')
      // The device UI owns no official-sidebar entry points: no footer action
      // and no Session context-menu jump into a device tab.
      expect(injectedSlots).not.toContain('sidebar.footer.action')
      expect(injectedSlots).not.toContain('sidebar.workspaces.session.menu.item')

      // openSettingsSection routes straight to sidebar.settings shellStore when available
      expect(clientEntry.openSettingsSection(mockCtx)).toBe(true)
      expect(openedSections).toEqual(['multi-device'])

      // Fallback when sidebar.settings is absent opens owned native Modal
      const fallbackCtx = {
        ...mockCtx,
        slots: { ...mockCtx.slots, entries: () => [] },
      }
      clientStore.setSettingsModalOpen(false)
      expect(clientEntry.openSettingsSection(fallbackCtx)).toBe(false)
      expect(clientStore.getSnapshot().settingsModalOpen).toBe(true)
      clientStore.setSettingsModalOpen(false)

      // Render settings.section and verify streamlined native markup
      const settingsReg = registeredSlots.get('settings.section:multi-device')
      expect(settingsReg).toBeDefined()
      const settingsHtml = renderToStaticMarkup(
        React.createElement(settingsReg!.component as React.ComponentType<any>, { t: (k: keyof typeof zh) => zh[k] }),
      )
      // No display-mode switch survives: the plugin only has one mode.
      expect(settingsHtml).not.toContain('data-primitive="SegmentedControl"')
      expect(settingsHtml).not.toContain('界面模式')
      expect(settingsHtml).toContain('data-primitive="Switch"')
      expect(settingsHtml).toContain('data-primitive="Button"')
      expect(settingsHtml).toContain(zh.devicesHeading)
      expect(settingsHtml).not.toContain('sshEngine')
      expect(settingsHtml).not.toContain('manualRule')

      // Plugin bundle summary view returns concise one-liner
      const bundleReg = registeredSlots.get('plugins.bundle.config:dsh-multi-device')
      expect(bundleReg).toBeDefined()
      expect(bundleReg!.component({ view: 'summary', t: (k: keyof typeof zh) => zh[k] })).toBe(zh.pluginSummary)

      // The overlay always renders the persistent [本机][device] strip.
      const overlayReg = registeredSlots.get('shell.overlay:multi-device-switcher')
      expect(overlayReg).toBeDefined()
      const baseSnapshot = clientStore.getSnapshot().snapshot
      const nativeSnapshot = {
        ...baseSnapshot,
        revision: baseSnapshot.revision + 10,
        devices: [
          {
            id: DeviceId('dev-a'),
            name: 'Dev A',
            enabled: true,
            state: 'connected' as const,
            transportKind: 'ssh' as const,
            targetSummary: 'ssh://dev-a',
            keepNativeAlive: true,
            protocolVersion: '0.2' as const,
            realtime: true,
            runningSessionCount: 0,
            pendingApprovalCount: 0,
          },
        ],
      }
      ;(clientStore as unknown as { applyIncomingSnapshot: (s: unknown) => void }).applyIncomingSnapshot(nativeSnapshot)
      const nativeHtml = renderToStaticMarkup(
        React.createElement(overlayReg!.component as React.ComponentType<any>, { t: (k: keyof typeof zh) => zh[k] }),
      )
      expect(nativeHtml).toContain('dsh-md-native-bar')
      expect(nativeHtml).toContain(zh.nativeLocalTab)
      expect(nativeHtml).toContain('Dev A')
      // No mode switch anywhere in the strip.
      expect(nativeHtml).not.toContain('dsh-md-native-mode-switch')

      // DshSelect renders compliant trigger and options
      const { DshSelect } = await import('../src/client/DshSelect.tsx')
      const selectHtml = renderToStaticMarkup(
        React.createElement(DshSelect, {
          value: 'val-1',
          options: [
            { value: 'val-1', label: 'Item 1', description: '/path/1' },
            { value: 'val-2', label: 'Item 2', description: '/path/2' },
          ],
          onChange: () => {},
          placeholder: 'Pick one',
        }),
      )
      expect(selectHtml).toContain('dsh-md-select-container')
      expect(selectHtml).toContain('Item 1')
      // Locale dictionaries must stay in lockstep: every key exists in both.
      expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    } finally {
      for (const dispose of disposers) dispose()
      vi.unstubAllGlobals()
      vi.doUnmock('@deepseek-ai/dsh-client-ui-primitives')
    }
  })
})

describe('10. Native Pane bridge, injection and view decisions', () => {
  it('injects the bridge as the first head child and is idempotent', () => {
    const html = '<!doctype html><html><head><title>t</title></head><body></body></html>'
    const once = injectNativeBridge(html, { deviceId: 'dev-1' })
    expect(once).toContain('data-dsh-md-native-bridge="1"')
    expect(once).toContain(`${NATIVE_BRIDGE_SCRIPT_PATH}?device=dev-1`)
    expect(once.indexOf('data-dsh-md-native-bridge')).toBeLessThan(once.indexOf('<title>'))
    expect(injectNativeBridge(once, { deviceId: 'dev-1' })).toBe(once)
    expect(NATIVE_BRIDGE_SCRIPT).toContain('__ModuleLoader__')
    expect(NATIVE_BRIDGE_SCRIPT).toContain('open-session')
    expect(NATIVE_BRIDGE_SCRIPT).toContain('selection')
  })

  it('injects HTML through the proxy, serves the bridge script and routes bridge commands', async () => {
    const upstream = createServer((_req, res) => {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-encoding': 'gzip',
        'x-frame-options': 'DENY',
      })
      res.end(gzipSync(Buffer.from(
        '<!doctype html><html><head><title>remote</title></head><body>remote body</body></html>',
      )))
    })
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
    const address = upstream.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0

    const states: string[] = []
    const selections: (string | undefined)[] = []
    const titles: (string | undefined)[] = []
    const visibilities: boolean[] = []
    const groupReports: Record<string, boolean>[] = []
    const readReports: string[] = []
    const proxy = new NativeDeviceProxy(
      {
        id: DeviceId('dev-bridge'),
        name: 'bridge-device',
        enabled: true,
        transport: { kind: 'direct', baseUrl: `http://127.0.0.1:${String(port)}` },
        auth: { mode: 'none' },
      },
      () => `http://127.0.0.1:${String(port)}`,
      new DeviceAuthManager(),
      undefined,
      {
        onBridgeState: (_id, state) => { states.push(state) },
        onBridgeSelection: (_id, sessionId) => { selections.push(sessionId) },
        onBridgeTitle: (_id, title) => { titles.push(title) },
        onBridgeVisibility: (_id, visible) => { visibilities.push(visible) },
        getGroupState: () => ({ 'ws-1': true }),
        getUnreadState: () => ['rsess-9'],
        onGroupState: (_id, groups) => { groupReports.push(groups) },
        onBridgeRead: (_id, sessionId) => { readReports.push(sessionId) },
      },
    )
    let ws: WebSocket | undefined
    try {
      await proxy.start()
      const url = proxy.proxyUrl()!
      const origin = new URL(url).origin
      const bootstrap = await fetch(url, { redirect: 'manual' })
      const cookie = bootstrap.headers.get('set-cookie')?.split(';')[0]
      expect(cookie).toBeTruthy()

      const page = await fetch(`${origin}/`, {
        headers: { cookie: cookie!, 'sec-fetch-dest': 'document', 'accept': 'text/html' },
      })
      expect(page.status).toBe(200)
      expect(page.headers.get('content-encoding')).toBeNull()
      const html = await page.text()
      expect(html).toContain('data-dsh-md-native-bridge="1"')
      expect(html).toContain('/__md/bridge.js?device=dev-bridge')
      expect(html).toContain('<title>remote</title>')
      expect(states).toContain('loading')

      const script = await fetch(`${origin}${NATIVE_BRIDGE_SCRIPT_PATH}`, {
        headers: { cookie: cookie! },
      })
      expect(script.status).toBe(200)
      expect(script.headers.get('content-type')).toContain('application/javascript')
      const scriptText = await script.text()
      expect(scriptText).toContain('__ModuleLoader__')
      expect(scriptText).toContain('"ws-1":true')
      expect(scriptText).toContain('"rsess-9"')
      expect(scriptText).toContain('__dshMdClipboard')
      expect(scriptText).toContain('__dshMdVisibility')
      expect(scriptText).toContain("type: 'title'")
      expect(scriptText).toContain("type: 'visibility'")

      const messages: { type?: string; sessionId?: string; enabled?: boolean; unreadSessionIds?: string[]; groups?: Record<string, boolean> }[] = []
      ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/__md/bridge?device=dev-bridge`, {
        headers: { cookie: cookie! },
      })
      mockBridgeMessages(ws, messages)
      await new Promise<void>((resolve, reject) => {
        ws!.once('open', resolve)
        ws!.once('error', reject)
      })
      ws.send(JSON.stringify({ type: 'ready' }))
      await waitForCondition(() => states.includes('ready'))
      await waitForCondition(() => messages.some(message => message.type === 'set-embedded' && message.enabled === false))
      await waitForCondition(() => messages.some(
        message => message.type === 'read-state' && message.unreadSessionIds?.includes('rsess-9') === true,
      ))
      ws.send(JSON.stringify({ type: 'group-expansion', groups: { 'ws-2': true } }))
      await waitForCondition(() => groupReports.some(groups => groups['ws-2'] === true))
      ws.send(JSON.stringify({ type: 'read', sessionId: 'rsess-9' }))
      await waitForCondition(() => readReports.includes('rsess-9'))
      proxy.setGroupState({ 'ws-2': true })
      await waitForCondition(() => messages.some(
        message => message.type === 'group-expansion' && message.groups?.['ws-2'] === true,
      ))
      proxy.setUnreadState(['rsess-10'])
      await waitForCondition(() => messages.some(
        message => message.type === 'read-state' && message.unreadSessionIds?.includes('rsess-10') === true,
      ))
      proxy.setEmbedded(true)
      await waitForCondition(() => messages.some(message => message.type === 'set-embedded' && message.enabled === true))
      ws.send(JSON.stringify({ type: 'selection', sessionId: 'rsess-1' }))
      await waitForCondition(() => selections.at(-1) === 'rsess-1')
      ws.send(JSON.stringify({ type: 'title', title: 'Fix login — DSH' }))
      await waitForCondition(() => titles.at(-1) === 'Fix login — DSH')
      ws.send(JSON.stringify({ type: 'visibility', visible: true }))
      await waitForCondition(() => visibilities.at(-1) === true)
      ws.send(JSON.stringify({ type: 'visibility', visible: false }))
      await waitForCondition(() => visibilities.at(-1) === false)

      proxy.openSession('rsess-2')
      await waitForCondition(() => messages.some(message => message.type === 'open-session' && message.sessionId === 'rsess-2'))
    } finally {
      ws?.close()
      proxy.stop()
      await new Promise<void>(resolve => upstream.close(() => resolve()))
    }
  })

  it('reuses a persisted native proxy port so the framed page keeps its origin', async () => {
    const upstream = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<html><head><title>upstream</title></head><body>ok</body></html>')
    })
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
    const address = upstream.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    const base = `http://127.0.0.1:${String(port)}`
    const makeProxy = (allocated: number[]): NativeDeviceProxy => new NativeDeviceProxy(
      {
        id: DeviceId('dev-stable-port'),
        name: 'stable-port',
        enabled: true,
        transport: { kind: 'direct', baseUrl: base },
        auth: { mode: 'none' },
      },
      () => base,
      new DeviceAuthManager(),
      undefined,
      {
        onPortAllocated: (_id, boundPort) => { allocated.push(boundPort) },
      },
    )

    const firstAllocated: number[] = []
    const first = makeProxy(firstAllocated)
    try {
      await first.start()
      const bound = first.port()
      expect(bound).toBeGreaterThan(0)
      first.stop()
      await new Promise<void>(resolve => setTimeout(resolve, 30))

      const secondAllocated: number[] = []
      const second = makeProxy(secondAllocated)
      try {
        await second.start(bound)
        expect(second.port()).toBe(bound)
        expect(secondAllocated.at(-1)).toBe(bound)
        second.stop()
      } finally {
        second.stop()
      }
    } finally {
      first.stop()
      await new Promise<void>(resolve => upstream.close(() => resolve()))
    }
  })

  it('overrides document.title and restores the latest DSH-written title', async () => {
    const proto = {}
    Object.defineProperty(proto, 'title', {
      configurable: true,
      get() { return (this as { __title?: string }).__title ?? '' },
      set(value: string) { (this as { __title?: string }).__title = String(value) },
    })
    const fakeDocument = Object.create(proto) as Record<string, unknown> & { title: string }
    fakeDocument.__title = 'DSH'
    fakeDocument.head = {}
    vi.stubGlobal('document', fakeDocument)
    try {
      const { DocumentTitleController } = await import('../src/client/windowTitle.ts')
      const controller = new DocumentTitleController()
      expect(controller.install()).toBe(true)
      fakeDocument.title = 'Local — DSH'
      expect(fakeDocument.title).toBe('Local — DSH')
      controller.apply('Remote — DSH')
      expect(fakeDocument.title).toBe('Remote — DSH')
      // DSH keeps writing the local Session title while the remote tab owns the
      // window; the latest write must win when the override is removed.
      fakeDocument.title = 'New local — DSH'
      expect(fakeDocument.title).toBe('Remote — DSH')
      controller.apply(undefined)
      expect(fakeDocument.title).toBe('New local — DSH')
      controller.dispose()
      expect(fakeDocument.title).toBe('New local — DSH')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('copies local text with an execCommand fallback', async () => {
    const area = {
      value: '',
      style: {} as Record<string, string>,
      setAttribute: () => {},
      select: () => {},
      remove: () => {},
    }
    const fakeDocument = {
      createElement: () => area,
      body: { appendChild: () => {} },
      getSelection: () => null,
      execCommand: (command: string) => command === 'copy',
    }
    vi.stubGlobal('document', fakeDocument)
    vi.stubGlobal('navigator', {})
    try {
      const { copyText, fallbackCopyText } = await import('../src/client/clipboard.ts')
      expect(fallbackCopyText('diagnostics')).toBe(true)
      expect(area.value).toBe('diagnostics')
      await expect(copyText('diagnostics-2')).resolves.toBe(true)
      expect(area.value).toBe('diagnostics-2')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('falls back to another loopback port when the persisted one is occupied', async () => {
    const blocker = createServer((_req, res) => { res.end('occupied') })
    await new Promise<void>(resolve => blocker.listen(0, '127.0.0.1', resolve))
    const blockedAddress = blocker.address()
    const blockedPort = typeof blockedAddress === 'object' && blockedAddress !== null ? blockedAddress.port : 0
    const allocated: number[] = []
    const proxy = new NativeDeviceProxy(
      {
        id: DeviceId('dev-port-fallback'),
        name: 'port-fallback',
        enabled: true,
        transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:1' },
        auth: { mode: 'none' },
      },
      () => undefined,
      new DeviceAuthManager(),
      undefined,
      { onPortAllocated: (_id, port) => { allocated.push(port) } },
    )
    try {
      await proxy.start(blockedPort)
      expect(proxy.port()).toBeGreaterThan(0)
      expect(proxy.port()).not.toBe(blockedPort)
      expect(allocated.at(-1)).toBe(proxy.port())
      proxy.stop()
    } finally {
      proxy.stop()
      await new Promise<void>(resolve => blocker.close(() => resolve()))
    }
  })

  it('wires bridge readiness, selection and group state into the Host snapshot', async () => {
    const dir = makeTempDir('dsh-md-pane-')
    const registry = new DeviceRegistry(
      join(dir, 'devices.json'),
      join(dir, 'secrets.json'),
      { localPort: () => 3080 },
      { allowDirectTransport: true },
    )
    const deviceId = DeviceId('dev-pane')
    let ws: WebSocket | undefined
    try {
      const added = await registry.upsertDevice({
        id: 'dev-pane',
        name: 'pane-device',
        transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:1' },
        auth: { mode: 'none' },
      })
      expect(added.ok).toBe(true)
      const proxyUrl = registry.nativeProxyManager.proxyUrl(deviceId)
      expect(proxyUrl).toBeDefined()
      const origin = new URL(proxyUrl!).origin
      const bootstrap = await fetch(proxyUrl!, { redirect: 'manual' })
      const cookie = bootstrap.headers.get('set-cookie')?.split(';')[0]
      expect(cookie).toBeTruthy()

      const messages: { type?: string; sessionId?: string; enabled?: boolean; groups?: Record<string, boolean> }[] = []
      ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/__md/bridge?device=dev-pane`, {
        headers: { cookie: cookie! },
      })
      mockBridgeMessages(ws, messages)
      await new Promise<void>((resolve, reject) => {
        ws!.once('open', resolve)
        ws!.once('error', reject)
      })
      ws.send(JSON.stringify({ type: 'ready' }))
      await waitForCondition(
        () => registry.snapshot().devices.find(device => device.id === deviceId)?.nativePaneState === 'ready',
      )

      ws.send(JSON.stringify({ type: 'selection', sessionId: 'rsess-1' }))
      await waitForCondition(
        () => registry.snapshot().devices.find(device => device.id === deviceId)?.nativePaneSessionId === 'rsess-1',
      )
      ws.send(JSON.stringify({ type: 'group-expansion', groups: { 'ws-1': true, 'ws-2': false } }))
      await waitForCondition(
        () => messages.some(message => message.type === 'group-expansion' && message.groups?.['ws-1'] === true),
      )

    } finally {
      ws?.close()
      registry.dispose()
    }
    const saved = JSON.parse(readFileSync(join(dir, 'devices.json'), 'utf8')) as {
      nativeGroups?: Record<string, Record<string, boolean>>
    }
    expect(saved.nativeGroups?.['dev-pane']).toEqual({ 'ws-1': true, 'ws-2': false })
  })

})

/** Capture parsed bridge commands on a test WebSocket. */
function mockBridgeMessages(
  ws: WebSocket,
  target: { type?: string; sessionId?: string; enabled?: boolean }[],
): void {
  ws.on('message', (raw) => {
    try {
      target.push(JSON.parse(raw.toString()) as { type?: string; sessionId?: string; enabled?: boolean })
    } catch {
      // Ignore non-JSON test frames.
    }
  })
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('condition was not met before the test deadline')
}

describe('11. Bridge runtime loader capture', () => {
  it('rewrites pending and post-create workspace registrations and drives the remote UI', async () => {
    class FakeSocket {
      static instances: FakeSocket[] = []
      readyState = 1
      readonly sent: string[] = []
      private readonly listeners = new Map<string, ((event: unknown) => void)[]>()
      constructor(_url: string) {
        FakeSocket.instances.push(this)
      }
      addEventListener(type: string, listener: (event: unknown) => void): void {
        const list = this.listeners.get(type) ?? []
        list.push(listener)
        this.listeners.set(type, list)
      }
      send(data: string): void {
        this.sent.push(data)
      }
      close(): void {
        this.readyState = 3
        this.emit('close', {})
      }
      emit(type: string, event: unknown): void {
        for (const listener of this.listeners.get(type) ?? []) listener(event)
      }
    }

    const opened: string[] = []
    const groupCalls: { key: string; expanded: boolean }[] = []
    const statusListeners = new Set<() => void>()
    const statusSource = {
      getSnapshot: () => new Map([
        ['rsess-1', { running: false, completionUnread: false }],
        ['rsess-2', { running: false, completionUnread: false }],
        ['local-1', { running: false, completionUnread: true }],
      ]),
      subscribe: (listener: () => void) => {
        statusListeners.add(listener)
        return () => { statusListeners.delete(listener) }
      },
    }
    const selection = {
      getSnapshot: () => ({ sessionId: 'rsess-1' }),
      subscribe: () => () => {},
    }
    // Official 0.2.1-rc.5 separates catalog/selection from the borrowed
    // observable Session binding. Keep history loading here: this test drives
    // workspace UI and unread overlays, not a history-open acknowledgement.
    const sessionFaces = new Map(['rsess-1', 'rsess-2'].map(sessionId => [sessionId, {
      getSnapshot: () => ({ sessionId, openState: 'loading', openError: null }),
      subscribe: (_listener: () => void) => () => {},
    }]))
    const sessions = {
      list: {
        getSnapshot: () => ({ byId: { 'rsess-1': {}, 'rsess-2': {} } }),
        subscribe: () => () => {},
      },
      binding: (sessionId: string) => {
        const session = sessionFaces.get(sessionId)
        return session === undefined ? undefined : { session }
      },
      refresh: () => Promise.resolve(),
    }
    const view = {
      setGroupExpanded: (key: string, expanded: boolean) => { groupCalls.push({ key, expanded }) },
      retainAccountKeys: () => {},
    }
    const context = {
      uiWorkspace: {
        selection,
        view,
        openSession: (sessionId: string) => { opened.push(sessionId) },
      },
      uiSession: { sessionStatus: statusSource },
      sessions,
    }

    const sandbox = {
      window: {} as Record<string, unknown>,
      document: {
        currentScript: { src: 'http://127.0.0.1:1/__md/bridge.js?device=dev-x' },
        documentElement: {},
        querySelector: () => null,
      },
      location: { protocol: 'http:', host: '127.0.0.1:1' },
      WebSocket: FakeSocket,
      MutationObserver: class { observe(): void {} disconnect(): void {} },
      URL,
      URLSearchParams,
      JSON,
      Object,
      Array,
      Map,
      Promise,
      console,
      setTimeout: () => 0,
      clearTimeout: () => {},
      setInterval: () => 0,
      clearInterval: () => {},
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      getComputedStyle: () => ({ gridTemplateColumns: '' }),
    }
    sandbox.window = sandbox as unknown as Record<string, unknown>

    runInNewContext(buildNativeBridgeScript({
      groups: { 'ws-1': true },
      unread: ['rsess-2'],
    }), sandbox, { timeout: 2_000 })

    const live: { factory: (require: unknown) => { apply: (ctx: unknown) => void } }[] = []
    const pending: { factory: (require: unknown) => { apply: (ctx: unknown) => void } }[] = []
    const queue = {
      mode: 'queue',
      pendingQueue: pending,
      load(registration: { factory: (require: unknown) => { apply: (ctx: unknown) => void } }) {
        pending.push(registration)
      },
      create() {
        const queued = pending.splice(0)
        this.mode = 'live'
        this.load = (registration: { factory: (require: unknown) => { apply: (ctx: unknown) => void } }) => {
          live.push(registration)
        }
        for (const registration of queued) this.load(registration)
        return { live: true }
      },
    }
    sandbox.window.__ModuleLoader__ = queue

    const makeRecord = () => {
      const exports = { apply: (ctx: unknown) => { void ctx } }
      const factory = () => exports
      return { id: '@deepseek-ai/dsh-client-ui-workspace', factory, exports }
    }
    const first = makeRecord()
    queue.load(first)
    queue.create()
    const second = makeRecord()
    queue.load(second)

    expect(live).toHaveLength(2)
    expect(live[0]!.factory).not.toBe(first.factory)
    expect(live[1]!.factory).not.toBe(second.factory)

    // Materialize the first rewritten factory and apply it: the bridge should
    // capture the context, report ready and the persisted selection.
    const materialized = live[0]!.factory(() => { throw new Error('no externals') })
    expect(typeof materialized.apply).toBe('function')
    materialized.apply(context)
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    const socket = FakeSocket.instances[0]!
    const sentMessages = (): { type?: string; sessionId?: string; enabled?: boolean }[] =>
      socket.sent.map(raw => JSON.parse(raw) as { type?: string; sessionId?: string; enabled?: boolean })
    expect(sentMessages().some(message => message.type === 'ready')).toBe(true)
    expect(sentMessages().some(message => message.type === 'selection' && message.sessionId === 'rsess-1')).toBe(true)
    expect(groupCalls).toContainEqual({ key: 'ws-1', expanded: true })
    expect(statusSource.getSnapshot().get('rsess-2')?.completionUnread).toBe(true)
    // A native page only contains the owning device's Sessions, so the Host
    // set is authoritative for every row in that page.
    expect(statusSource.getSnapshot().get('local-1')?.completionUnread).toBe(false)

    socket.emit('message', { data: JSON.stringify({ type: 'open-session', sessionId: 'rsess-2' }) })
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(opened).toContain('rsess-2')
    expect(socket.sent.map(raw => JSON.parse(raw))).toContainEqual({
      type: 'navigation', sessionId: 'rsess-2', requestSeq: 1, openState: 'loading',
    })
    expect(socket.sent.map(raw => JSON.parse(raw)).some(message =>
      message.type === 'navigation' && message.openState === 'open')).toBe(false)

    socket.emit('message', { data: JSON.stringify({ type: 'read-state', unreadSessionIds: ['rsess-1'] }) })
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(sentMessages().some(message => message.type === 'read' && message.sessionId === 'rsess-1')).toBe(true)
    expect(statusSource.getSnapshot().get('rsess-1')?.completionUnread).toBe(false)

    groupCalls.length = 0
    socket.emit('message', { data: JSON.stringify({ type: 'group-expansion', groups: { 'ws-2': true } }) })
    expect(groupCalls).toContainEqual({ key: 'ws-2', expanded: true })

    expect(() => socket.emit('message', { data: JSON.stringify({ type: 'set-embedded', enabled: true }) })).not.toThrow()
  })

  it('installs a clipboard fallback and reports title/visibility from the bridge', async () => {
    class FakeSocket {
      static instances: FakeSocket[] = []
      readyState = 1
      readonly sent: string[] = []
      private readonly listeners = new Map<string, ((event: unknown) => void)[]>()
      constructor(_url: string) {
        FakeSocket.instances.push(this)
      }
      addEventListener(type: string, listener: (event: unknown) => void): void {
        const list = this.listeners.get(type) ?? []
        list.push(listener)
        this.listeners.set(type, list)
      }
      send(data: string): void {
        this.sent.push(data)
      }
      close(): void {
        this.readyState = 3
      }
      emit(type: string, event: unknown): void {
        for (const listener of this.listeners.get(type) ?? []) listener(event)
      }
    }

    const copied: string[] = []
    const area = {
      value: '',
      style: {} as Record<string, string>,
      setAttribute: () => {},
      select: () => {},
      remove: () => {},
    }
    let titleObserverCallback: (() => void) | undefined
    const windowListeners = new Map<string, ((event: unknown) => void)[]>()
    const sandbox: Record<string, any> = {
      document: {
        currentScript: { src: 'http://127.0.0.1:1/__md/bridge.js?device=dev-clip' },
        documentElement: {},
        head: {},
        title: 'DSH',
        visibilityState: 'visible',
        body: { appendChild: () => {} },
        createElement: () => area,
        execCommand: (command: string) => {
          if (command !== 'copy') return false
          copied.push(area.value)
          return true
        },
        getSelection: () => null,
        addEventListener: () => {},
        querySelector: () => null,
      },
      navigator: {
        clipboard: {
          writeText: () => Promise.reject(new Error('clipboard denied')),
        },
      },
      location: { protocol: 'http:', host: '127.0.0.1:1' },
      WebSocket: FakeSocket,
      MutationObserver: class {
        constructor(callback: () => void) { titleObserverCallback = callback }
        observe(): void {}
        disconnect(): void {}
      },
      URL,
      URLSearchParams,
      JSON,
      Object,
      Array,
      Map,
      Promise,
      console,
      setTimeout: () => 0,
      clearTimeout: () => {},
      setInterval: () => 0,
      clearInterval: () => {},
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      getComputedStyle: () => ({ gridTemplateColumns: '' }),
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        const list = windowListeners.get(type) ?? []
        list.push(listener)
        windowListeners.set(type, list)
      },
    }
    sandbox.window = sandbox

    runInNewContext(buildNativeBridgeScript(), sandbox, { timeout: 2_000 })
    const socket = FakeSocket.instances[0]!
    socket.emit('open', {})
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    await expect(sandbox.navigator.clipboard.writeText('hello')).resolves.toBeUndefined()
    expect(copied).toContain('hello')

    sandbox.document.title = 'Fix login — DSH'
    titleObserverCallback?.()
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    const messages = (): { type?: string; title?: string; visible?: boolean }[] =>
      socket.sent.map(raw => JSON.parse(raw) as { type?: string; title?: string; visible?: boolean })
    expect(messages().some(message => message.type === 'title' && message.title === 'Fix login — DSH')).toBe(true)

    const messageListener = windowListeners.get('message')?.[0]
    expect(messageListener).toBeDefined()
    messageListener?.({ data: { __dshMdVisibility: true, visible: false } })
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(messages().some(message => message.type === 'visibility' && message.visible === false)).toBe(true)
  })

  it('keeps the sidebar grid item while embedding so the conversation track survives', () => {
    class FakeSocket {
      static instances: FakeSocket[] = []
      readyState = 1
      private readonly listeners = new Map<string, ((event: unknown) => void)[]>()
      constructor(_url: string) {
        FakeSocket.instances.push(this)
      }
      addEventListener(type: string, listener: (event: unknown) => void): void {
        const list = this.listeners.get(type) ?? []
        list.push(listener)
        this.listeners.set(type, list)
      }
      send(): void {}
      close(): void {
        this.readyState = 3
      }
      emit(type: string, event: unknown): void {
        for (const listener of this.listeners.get(type) ?? []) listener(event)
      }
    }

    const sidebarStyle = { display: 'block', visibility: '', pointerEvents: '' }
    const frameStyle = { gridTemplateColumns: '280px 1200px 0px' }
    const attributes = new Map<string, string>()
    const frame = {
      style: frameStyle,
      getAttribute: (name: string): string | null => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string): void => { attributes.set(name, value) },
      removeAttribute: (name: string): void => { attributes.delete(name) },
    }
    const sidebar = { parentElement: frame, style: sidebarStyle }

    const sandbox = {
      window: {} as Record<string, unknown>,
      document: {
        currentScript: { src: 'http://127.0.0.1:1/__md/bridge.js?device=dev-x' },
        documentElement: {},
        querySelector: (selector: string) => selector.includes('>') ? sidebar : null,
      },
      location: { protocol: 'http:', host: '127.0.0.1:1' },
      WebSocket: FakeSocket,
      MutationObserver: class { observe(): void {} disconnect(): void {} },
      URL,
      URLSearchParams,
      JSON,
      Object,
      Array,
      Promise,
      console,
      setTimeout: () => 0,
      clearTimeout: () => {},
      setInterval: () => 0,
      clearInterval: () => {},
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      getComputedStyle: (element: unknown) => element === frame
        ? { gridTemplateColumns: '280px 1200px 0px' }
        : { display: sidebarStyle.display },
    }
    sandbox.window = sandbox as unknown as Record<string, unknown>

    runInNewContext(NATIVE_BRIDGE_SCRIPT, sandbox, { timeout: 2_000 })

    const socket = FakeSocket.instances[0]!
    socket.emit('message', { data: JSON.stringify({ type: 'set-embedded', enabled: true }) })

    // The first grid track is collapsed, but the sidebar must remain a grid
    // item; `display:none` would shift the centre conversation into 0px.
    expect(frameStyle.gridTemplateColumns).toBe('0px 1200px 0px')
    expect(sidebarStyle.display).toBe('block')
    expect(sidebarStyle.visibility).toBe('hidden')
    expect(sidebarStyle.pointerEvents).toBe('none')
    expect(attributes.get('data-dsh-md-native-pane')).toBe('1')

    socket.emit('message', { data: JSON.stringify({ type: 'set-embedded', enabled: false }) })

    expect(frameStyle.gridTemplateColumns).toBe('280px 1200px 0px')
    expect(sidebarStyle.display).toBe('block')
    expect(sidebarStyle.visibility).toBe('')
    expect(sidebarStyle.pointerEvents).toBe('')
    expect(attributes.has('data-dsh-md-native-pane')).toBe(false)
  })
})

describe('12. Audit regressions: multi-device loop prevention, userQuestions routing, loopback proxy, and state integrity', () => {
  it('classifies plan-review intent inside user-questions/request waterfalls', () => {
    expect(
      pendingInteractionKind('user-questions/request', {
        questions: [
          {
            id: 'plan-review',
            question: 'Approve this plan?',
            detail: '# Plan',
            intent: { kind: 'plan-review', approve: 'Approve' },
          },
        ],
      }),
    ).toBe('plan-review')
    expect(
      pendingInteractionKind('user-questions/request', {
        questions: [{ id: 'q1', question: 'Which port?' }],
      }),
    ).toBe('question')
  })

  it('retains local session unread entries across a DeviceRegistry restart', () => {
    const dir = makeTempDir('dsh-md-local-unread-')
    const dataFile = join(dir, 'registry.json')
    const secretsFile = join(dir, 'secrets.json')
    const hostProvider = {
      localPort: () => 3080,
      localWorkspaces: () => [],
      localSessionUpdatedAt: () => new Map<string, number>(),
    }
    const reg1 = new DeviceRegistry(dataFile, secretsFile, hostProvider, {
      enableTunnels: false,
      enableNativeProxy: false,
    })
    reg1.observeLocalSessionStatus('local-sess-1', true)
    reg1.observeLocalSessionStatus('local-sess-1', false)
    expect(reg1.snapshot().unreadSessionIds).toContain('local-sess-1')
    reg1.dispose()

    const reg2 = new DeviceRegistry(dataFile, secretsFile, hostProvider, {
      enableTunnels: false,
      enableNativeProxy: false,
    })
    expect(reg2.snapshot().unreadSessionIds).toContain('local-sess-1')
    reg2.dispose()
  })

  it('does not pass -i or IdentitiesOnly=yes in execSshCommand unless privateKeyPath is explicitly configured', async () => {
    const calls: string[][] = []
    setSshSpawn((_cmd, args) => {
      calls.push([...args])
      const proc = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter
        stderr: EventEmitter
        stdin: null
        kill: () => boolean
      }
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      proc.stdin = null
      proc.kill = () => true
      queueMicrotask(() => proc.emit('close', 0))
      return proc as never
    })
    try {
      await execSshCommand({ kind: 'ssh', host: 'dev-box' }, 'true', 1000)
      expect(calls[0]).toBeDefined()
      expect(calls[0]).not.toContain('-i')
      expect(calls[0]).not.toContain('IdentitiesOnly=yes')
    } finally {
      setSshSpawn(null)
    }
  })

  it('namespaces subagentCatalog entries in session summaries and projections', () => {
    const devId = DeviceId('dev-sub')
    const client = new RemoteDeviceClient(
      {
        id: devId,
        name: 'sub-host',
        enabled: false,
        transport: { kind: 'ssh', host: 'sub-host' },
        auth: { mode: 'auto' },
      },
      new DeviceAuthManager(),
      {
        onStateChanged: () => {},
        onRemoteEventFrame: () => {},
        onControlProjectionFrame: () => {},
        onWorkspacesChanged: () => {},
        onGitRemotesDiscovered: () => {},
        onModelCatalogChanged: () => {},
      },
    )
    const namespaced = client.namespaceSummary({
      sessionId: 'parent-1',
      updatedAt: 100,
      agentAvailable: true,
      running: false,
      blank: false,
      projections: {
        kind: 'sequenced',
        asOfSeq: 5,
        values: {
          subagentCatalog: [
            { id: 'child-1', parentSessionId: 'parent-1', label: 'worker' },
          ],
        },
      },
    })
    expect(namespaced.sessionId).toBe(encodeRemoteSessionId(devId, 'parent-1'))
    const catalog = namespaced.projections?.values.subagentCatalog as { id: string; parentSessionId: string }[]
    expect(catalog[0]?.id).toBe(encodeRemoteSessionId(devId, 'child-1'))
    expect(catalog[0]?.parentSessionId).toBe(encodeRemoteSessionId(devId, 'parent-1'))
  })

})


describe('0d. Unread counters for the device tab strip', () => {
  it('drops archived and subagent completions from the countable unread set', () => {
    const remoteArchived = encodeRemoteSessionId(DeviceId('dev-a'), 's-archived')
    const remoteSubagent = encodeRemoteSessionId(DeviceId('dev-a'), 's-sub')
    const unread = countableUnreadIds(
      ['local-1', 'local-2', remoteArchived, remoteSubagent],
      ['local-1', remoteArchived],
      [remoteSubagent],
    )
    expect([...unread]).toEqual(['local-2'])

    // A Host that predates the visibility fields hides nothing.
    expect([...countableUnreadIds(['local-1', 'local-2'])]).toEqual(['local-1', 'local-2'])

    // Duplicate IDs cannot inflate a count.
    expect([...countableUnreadIds(['local-1', 'local-1'])]).toEqual(['local-1'])
  })

  it('attributes unread Sessions to the owning device, local IDs included', () => {
    const spacedDevice = encodeRemoteSessionId(DeviceId('dev a~b'), 's-1')
    const unread = new Set([
      'local-1',
      'local-2',
      encodeRemoteSessionId(DeviceId('dev-a'), 's-1'),
      spacedDevice,
    ])
    expect(unreadCountForDevice(unread, LOCAL_DEVICE_ID)).toBe(2)
    expect(unreadCountForDevice(unread, DeviceId('dev-a'))).toBe(1)
    expect(unreadCountForDevice(unread, DeviceId('dev a~b'))).toBe(1)
    expect(unreadCountForDevice(unread, DeviceId('dev-b'))).toBe(0)
    const grouped = groupUnreadSessionIds(unread)
    expect(grouped.get(LOCAL_DEVICE_ID)).toEqual(['local-1', 'local-2'])
    expect(grouped.get(DeviceId('dev-a'))).toHaveLength(1)
    expect(grouped.get(DeviceId('dev a~b'))).toEqual([spacedDevice])
    expect(grouped.has(DeviceId('dev-b'))).toBe(false)
  })

})

describe('0e. Snapshot visibility inputs for unread counters', () => {
  it('publishes archived and subagent Session IDs with local and remote namespaces', () => {
    const dir = makeTempDir('dsh-md-visibility-')
    const dataFile = join(dir, 'devices.json')
    const secretsFile = join(dir, 'secrets.json')
    writeFileSync(dataFile, JSON.stringify({
      version: 1,
      devices: [{
        id: 'dev-a',
        name: 'A',
        enabled: true,
        transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:9' },
        auth: { mode: 'none' },
      }],
      aggregation: { autoGitAggregate: true },
      catalogs: {
        'dev-a': {
          deviceId: 'dev-a',
          syncedAt: 100,
          protocolVersion: '0.2',
          sessions: [
            { sessionId: 's-archived', updatedAt: 1, agentAvailable: true, running: false, blank: false },
            { sessionId: 's-sub', updatedAt: 2, agentAvailable: true, running: false, blank: false, origin: 'subagent' },
            { sessionId: 's-normal', updatedAt: 3, agentAvailable: true, running: false, blank: false },
          ],
          workspaces: [],
          archivedSessionIds: ['s-archived'],
          pinnedSessionIds: [],
        },
      },
    }))

    const startSpy = vi.spyOn(RemoteDeviceClient.prototype, 'start').mockImplementation(() => {})
    const registry = new DeviceRegistry(
      dataFile,
      secretsFile,
      {
        localPort: () => 3080,
        localWorkspaces: () => [],
        localSessionUpdatedAt: () => new Map(),
        localArchivedSessionIds: () => ['local-archived'],
        localSubagentSessionIds: () => ['local-sub'],
      },
      { allowDirectTransport: true },
    )
    registry.startAll()
    try {
      const snapshot = registry.snapshot()
      expect(snapshot.archivedSessionIds).toEqual([
        encodeRemoteSessionId(DeviceId('dev-a'), 's-archived'),
        'local-archived',
      ].sort())
      expect(snapshot.subagentSessionIds).toEqual([
        encodeRemoteSessionId(DeviceId('dev-a'), 's-sub'),
        'local-sub',
      ].sort())
    } finally {
      registry.dispose()
      startSpy.mockRestore()
    }
  })

  it('treats a failing local visibility provider as "nothing hidden"', () => {
    const dir = makeTempDir('dsh-md-visibility-bad-')
    const registry = new DeviceRegistry(
      join(dir, 'devices.json'),
      join(dir, 'secrets.json'),
      {
        localPort: () => 3080,
        localWorkspaces: () => [],
        localSessionUpdatedAt: () => new Map(),
        localArchivedSessionIds: () => { throw new Error('archived unavailable') },
        localSubagentSessionIds: () => { throw new Error('sessions unavailable') },
      },
      { allowDirectTransport: true },
    )
    try {
      expect(registry.snapshot().archivedSessionIds).toEqual([])
      expect(registry.snapshot().subagentSessionIds).toEqual([])
    } finally {
      registry.dispose()
    }
  })
})

describe('0c. Native bar geometry & diagnostics', () => {
  it('grows back after the window shrinks — the bar box never ratchets', () => {
    // The regression: the bar used to feed its own rendered width back in, so a
    // window that went 1400 -> 800 -> 1400 left the strip pinned at 800 with a
    // dead band on the right. The layout is now a pure function of the frame.
    const wide = resolveBarLayout({ frameLeft: 0, frameTop: 0, frameWidth: 1400, viewportWidth: 1400, chromeTop: 48 })
    expect(wide.width).toBe(1400)
    expect(wide.top).toBe(48)
    expect(wide.compact).toBe(false)
    const narrow = resolveBarLayout({ frameLeft: 0, frameTop: 0, frameWidth: 800, viewportWidth: 800, chromeTop: 48 })
    expect(narrow.width).toBe(800)
    const again = resolveBarLayout({ frameLeft: 0, frameTop: 0, frameWidth: 1400, viewportWidth: 1400, chromeTop: 48 })
    expect(again.width).toBe(1400)
    expect(again).toEqual(wide)
  })

  it('clamps to the visible viewport when the frame is wider or offset', () => {
    const embedded = resolveBarLayout({ frameLeft: 0, frameTop: 0, frameWidth: 2000, viewportWidth: 1240, chromeTop: 0 })
    expect(embedded.width).toBe(1240)
    expect(embedded.clipped).toBe(true)
    const offset = resolveBarLayout({ frameLeft: 40, frameTop: 10, frameWidth: 2000, viewportWidth: 1240, chromeTop: 32 })
    expect(offset.width).toBe(1200)
    expect(offset.left).toBe(40)
    expect(offset.top).toBe(42)
  })

  it('switches to the compact layout from the resolved width, not the viewport alone', () => {
    const narrow = resolveBarLayout({ frameLeft: 0, frameTop: 0, frameWidth: 600, viewportWidth: 1600, chromeTop: 0 })
    expect(narrow.compact).toBe(true)
    const boundary = resolveBarLayout({ frameLeft: 0, frameTop: 0, frameWidth: COMPACT_BAR_WIDTH, viewportWidth: 1600, chromeTop: 0 })
    expect(boundary.compact).toBe(false)
    // Headless: no frame box yet, fall back to what the viewport allows.
    const headless = resolveBarLayout({ frameLeft: 0, frameTop: 0, frameWidth: 0, viewportWidth: 900, chromeTop: 0 })
    expect(headless.width).toBe(900)
    expect(headless.compact).toBe(false)
  })

  it('describes an occlusion probe result without leaking page text', () => {
    expect(describeObstruction(undefined)).toBeUndefined()
    const element = {
      tagName: 'DIV',
      id: '',
      classList: ['pI_x6G_leadingSeat', 'dsh-md-native-tabs'],
    } as unknown as Element
    expect(describeObstruction(element)).toBe('div.pI_x6G_leadingSeat')
  })

  it('records and clears the last obstruction for Diagnostics', () => {
    recordNativeBarObstruction({ detail: 'div.seat z=25', updatedAt: 1 })
    expect(readNativeBarObstruction()?.detail).toBe('div.seat z=25')
    recordNativeBarObstruction(undefined)
    expect(readNativeBarObstruction()).toBeUndefined()
  })

  it('clamps a Host frame that is wider than the viewport', () => {
    const metrics = measureNativeBar({ innerWidth: 1240, innerHeight: 800, left: 0, width: 2000, now: 1 })
    expect(metrics.barWidth).toBe(2000)
    expect(metrics.clampedWidth).toBe(1240)
    expect(metrics.compact).toBe(false)
    expect(barIsClipped(metrics)).toBe(true)
  })

  it('switches to the compact layout below the switch-width threshold', () => {
    const narrow = measureNativeBar({ innerWidth: 600, innerHeight: 700, left: 0, width: 600, now: 1 })
    expect(narrow.compact).toBe(true)
    const boundary = measureNativeBar({ innerWidth: COMPACT_BAR_WIDTH, innerHeight: 700, left: 0, width: COMPACT_BAR_WIDTH, now: 1 })
    expect(boundary.compact).toBe(false)
    expect(barIsClipped(boundary)).toBe(false)
    const clipped = measureNativeBar({ innerWidth: COMPACT_BAR_WIDTH, innerHeight: 700, left: 0, width: 900, now: 1 })
    expect(clipped.clampedWidth).toBe(COMPACT_BAR_WIDTH)
    expect(barIsClipped(clipped)).toBe(true)
  })

  it('keeps the frame width when the viewport is unknown (headless render)', () => {
    const metrics = measureNativeBar({ innerWidth: 0, innerHeight: 0, left: 0, width: 900, now: 1 })
    expect(metrics.clampedWidth).toBe(900)
    expect(metrics.compact).toBe(false)
  })

  it('parses only known client report fields', () => {
    expect(readDiagnosticsClientReport(undefined)).toBeUndefined()
    expect(readDiagnosticsClientReport('nope')).toBeUndefined()
    expect(readDiagnosticsClientReport({})).toBeUndefined()
    const report = readDiagnosticsClientReport({
      innerWidth: 1240,
      barWidth: 2000,
      barClampedWidth: 1240,
      compact: false,
      userAgent: 'test',
      secret: 'ignored',
    })
    expect(report).toEqual({
      innerWidth: 1240,
      barWidth: 2000,
      barClampedWidth: 1240,
      compact: false,
      userAgent: 'test',
    })
  })

  it('reports per-device staging', () => {
    const devices = [
      {
        id: DeviceId('dev-a'),
        name: 'ubuntu-dev',
        enabled: true,
        state: 'connected',
        transportKind: 'ssh',
        targetSummary: 'ssh://ubuntu-dev → 127.0.0.1:3080',
        keepNativeAlive: true,
        protocolVersion: '0.2',
        realtime: true,
        remoteDshVersion: '0.2.1-rc.5',
        reconnectAttempt: 0,
        sessionCount: 148,
        runningSessionCount: 3,
        allSessionCount: 200,
        allRunningSessionCount: 5,
        pendingApprovalCount: 1,
        workspaceCount: 10,
      },
      {
        id: DeviceId('dev-b'),
        name: 'macos-dev',
        enabled: true,
        state: 'error',
        transportKind: 'ssh',
        targetSummary: 'ssh://macos-dev → 127.0.0.1:3080',
        keepNativeAlive: true,
        protocolVersion: '0.2',
        realtime: false,
        reconnectAttempt: 2,
        sessionCount: 22,
        runningSessionCount: 0,
        allSessionCount: 30,
        allRunningSessionCount: 0,
        pendingApprovalCount: 0,
        workspaceCount: 2,
        catalogStale: true,
        lastError: 'ssh: connect to host macos-dev port 22: Connection refused',
      },
    ] as unknown as DeviceView[]
    const snapshot = {
      revision: 7,
      hostId: 'host-1',
      devices,
    } as unknown as MultiDeviceSnapshot
    const diagnostics = buildDiagnostics(
      snapshot,
      { innerWidth: 1240, barWidth: 2000, barClampedWidth: 1240, compact: false },
      42,
    )
    expect(diagnostics.kind).toBe('dsh-multi-device/diagnostics')
    expect(diagnostics.generatedAt).toBe(42)
    expect(diagnostics.counts).toEqual({
      devices: 2,
      connectedDevices: 1,
      staleDevices: 1,
      runningSessions: 3,
      allRunningSessions: 5,
    })
    expect(diagnostics.devices[0]?.allSessionCount).toBe(200)
    expect(diagnostics.devices[1]?.allRunningSessionCount).toBe(0)
    expect(diagnostics.devices[1]?.lastError).toContain('Connection refused')
    expect(diagnostics.devices[0]?.catalogStale).toBe(false)
    expect(diagnostics.client?.barClampedWidth).toBe(1240)
  })

  it('echoes a diagnostics request through the control plane', async () => {
    const dir = makeTempDir('dsh-md-diagnostics-')
    const registry = new DeviceRegistry(
      join(dir, 'devices.json'),
      join(dir, 'secrets.json'),
      {
        localPort: () => 3080,
        localArchivedSessionIds: () => [],
        localSubagentSessionIds: () => [],
      },
      { allowDirectTransport: true },
    )
    try {
      const plane = new MultiDeviceControlPlane(registry)
      const result = await plane.dispatch({
        action: 'diagnostics',
        payload: { client: { innerWidth: 1240, compact: true } },
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const value = result.value as MultiDeviceDiagnostics
      expect(value.kind).toBe('dsh-multi-device/diagnostics')
      // Aggregated Mode is gone: diagnostics reports devices and client state,
      // never a display mode or a merged workspace view.
      expect(value.devices).toHaveLength(0)
      expect(value).not.toHaveProperty('displayMode')
      expect(value).not.toHaveProperty('logicalWorkspaces')
      expect(value.client?.innerWidth).toBe(1240)
      expect(value.client?.compact).toBe(true)
    } finally {
      registry.dispose()
    }
  })
})

/**
 * Comprehensive unit and integration tests for `dsh-multi-device`:
 * 1. Deterministic identity mapping (`SessionId`, `WorkspaceId`, `LogicalWorkspaceId`, `EventId`) & Git URL normalization.
 * 2. System `~/.ssh/config` parser (`Host` wildcards, negation `!`, `Include`, `%h`/`%p`/`%r` tokens, CLI arg builder).
 * 3. Persistent authentication (`dshCookieName`, `mintDshBrowserCookie`, launch token exchange, `.credentials.yaml` parser).
 * 4. Git Remote Auto-Discovery (`.git/config` + worktree `.git` gitdir pointers) & `WorkspaceAggregator`
 *    (auto Git aggregation, manual merge rules, member exclusion/splitting, preferred target device).
 * 5. End-to-end integration with simulated remote DSH 0.2 & DSH 0.1 servers:
 *    - `RemoteDeviceClient` handshake, live WebSocket `/api/remote.mux` (`workspace/follow`, `session/control`, `$events`),
 *      session list/history/prompt/cancel/rename/fork, and `approval/request` waterfall round-trip.
 *    - `NativeDeviceProxy` authenticated HTTP + WebSocket reverse proxy (header rewriting, X-Frame-Options stripping).
 *    - `AggregatedGateway` + `MultiDeviceControlPlane` mode independence & fallback verification.
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
  decodeLogicalWorkspaceId,
  decodeRemoteEventId,
  decodeRemoteWorkspaceId,
  decodeSessionId,
  DeviceId,
  encodeLogicalWorkspaceId,
  encodeRemoteEventId,
  encodeRemoteSessionId,
  encodeRemoteWorkspaceId,
  type DeviceConnectionState,
  type DeviceView,
  type GitMatchRun,
  isNamespacedEventId,
  isNamespacedSessionId,
  isNamespacedWorkspaceId,
  LOCAL_DEVICE_ID,
  type LogicalWorkspaceView,
  type MultiDeviceSnapshot,
  normalizeGitRemote,
  normalizeWorkspacePath,
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
  discoverLocalGitRemote,
  parseGitConfigRemoteUrl,
  WorkspaceAggregator,
} from '../src/host/git-aggregator.ts'
import {
  buildGitScanScript,
  deriveScanRoots,
  parseGitScanOutput,
  primaryRepoByOrigin,
  type ScannedRepository,
  scanLocalGitRepos,
} from '../src/host/git-scan.ts'
import {
  createIdleGitMatch,
  GitMatchRunner,
  type GitMatchContext,
  titleFromPath,
} from '../src/host/git-match.ts'
import {
  deviceOfflineError,
  installAggregatedGateway02,
  isSameDeviceChildSession,
  reusableSessionIdFor,
  shouldEndFollowStream,
  supportsWorkspaceReplaceFrames,
  unavailableRemoteCatalog,
  type SessionControllerLike,
  type TypertGatewayLike,
  type WorkspaceControllerLike,
} from '../src/host/gateway.ts'
import { nativePaneTarget, resolveSameSiteProxyUrl, shouldShowNativePane } from '../src/client/nativePane.ts'
import { shouldDecorateProjectRows } from '../src/client/projectBadges.ts'
import {
  countableUnreadIds,
  unreadCountForDevice,
  unreadCountInSessions,
  workspaceUnreadCounts,
} from '../src/client/unreadCounts.ts'
import {
  deviceTargetsForWorkspace,
  effectiveTargetOf,
  resolveSessionDevice,
  resolveSessionLogicalWorkspace,
} from '../src/client/sessionDevice.ts'
import {
  buildNativeBridgeScript,
  injectNativeBridge,
  NATIVE_BRIDGE_SCRIPT,
  NATIVE_BRIDGE_SCRIPT_PATH,
  sanitizeGroupState,
} from '../src/host/native-bridge.ts'
import { requestRemote } from '../src/host/http-request.ts'
import { NativeDeviceProxy } from '../src/host/native-proxy.ts'
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
  connectionRequestRejection,
  MultiDeviceControlPlane,
} from '../src/runtime.ts'

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

describe('0. Mode/chrome regressions', () => {
  it('only decorates workspace rows in aggregated mode', () => {
    expect(shouldDecorateProjectRows('aggregated')).toBe(true)
    expect(shouldDecorateProjectRows('native')).toBe(false)
    expect(shouldDecorateProjectRows(undefined)).toBe(false)
  })

  it('enables incremental workspace replace frames only on clients that support them', () => {
    expect(supportsWorkspaceReplaceFrames(undefined)).toBe(false)
    expect(supportsWorkspaceReplaceFrames('0.2.0-rc.2')).toBe(false)
    expect(supportsWorkspaceReplaceFrames('0.2.1-alpha.5')).toBe(false)
    expect(supportsWorkspaceReplaceFrames('0.2.1-rc.0')).toBe(false)
    expect(supportsWorkspaceReplaceFrames('0.2.1-rc.1')).toBe(true)
    expect(supportsWorkspaceReplaceFrames('0.2.1-rc.5')).toBe(true)
    expect(supportsWorkspaceReplaceFrames('0.2.1')).toBe(true)
    expect(supportsWorkspaceReplaceFrames('0.2.2-rc.1')).toBe(true)
    expect(supportsWorkspaceReplaceFrames('v0.3.0')).toBe(true)
  })
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
        enabled: false,
        transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:9' },
        auth: { mode: 'none' },
      }],
      aggregation: { autoGitAggregate: true },
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
      { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() },
      { allowDirectTransport: true, enableNativeProxy: false },
    )
    try {
      expect(registry.snapshot().unreadSessionIds).toEqual([remoteId, remoteId2])
      expect(registry.nativeGroupState(DeviceId('dev-a'))).toEqual({ 'ws-1': true, 'ws-2': false })
      // Opening a remote Session through the aggregated page clears exactly it.
      registry.setActiveSession(remoteId, 1)
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
      expect(registry.snapshot().unreadSessionIds).toEqual([])
    } finally {
      registry.dispose()
    }
    const saved = JSON.parse(readFileSync(dataFile, 'utf8')) as {
      readState?: { entries?: Record<string, { unread?: boolean }> }
    }
    expect(saved.readState?.entries?.[remoteId]?.unread).toBe(false)
  })
})

describe('0c. Optional cross-Host read state file', () => {
  it('merges Host sections by newest timestamp and lets a tie read win', () => {
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
  it('losslessly encodes and decodes remote SessionIds, WorkspaceIds, LogicalWorkspaceIds, and EventIds', () => {
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

    const encodedWs = encodeRemoteWorkspaceId(devId, 'ws-abc')
    expect(decodeRemoteWorkspaceId(encodedWs)).toEqual({
      deviceId: devId,
      rawWorkspaceId: 'ws-abc',
      isRemote: true,
    })

    const encodedLogical = encodeLogicalWorkspaceId('git', 'github.com/deepseek-ai/deepseek-harness')
    expect(decodeLogicalWorkspaceId(encodedLogical)).toEqual({
      kind: 'git',
      key: 'github.com/deepseek-ai/deepseek-harness',
    })

    const encodedEv = encodeRemoteEventId(devId, 'ev-42')
    expect(decodeRemoteEventId(encodedEv)).toEqual({
      deviceId: devId,
      remoteEventId: 'ev-42',
    })
  })

  it('normalizes SSH, SCP, HTTPS, and custom-port Git remote URLs to a canonical repo key', () => {
    const expected = 'github.com/deepseek-ai/deepseek-harness'
    expect(normalizeGitRemote('git@github.com:deepseek-ai/deepseek-harness.git')).toBe(expected)
    expect(normalizeGitRemote('https://github.com/DeepSeek-AI/DeepSeek-Harness.git')).toBe(expected)
    expect(normalizeGitRemote('https://token@github.com/deepseek-ai/deepseek-harness/')).toBe(expected)
    expect(normalizeGitRemote('ssh://git@github.com:22/deepseek-ai/deepseek-harness.git')).toBe(expected)
    expect(normalizeGitRemote('ssh://git@github.com:2222/deepseek-ai/deepseek-harness.git')).toBe(
      'github.com:2222/deepseek-ai/deepseek-harness',
    )
    expect(normalizeGitRemote('git://github.com/deepseek-ai/deepseek-harness')).toBe(expected)
    expect(normalizeGitRemote('C:\\Users\\me\\repo')).toBeUndefined()
    expect(normalizeGitRemote('')).toBeUndefined()
  })

  it('normalizes POSIX and Windows workspace paths consistently', () => {
    expect(normalizeWorkspacePath('/Users/lvziw/project///')).toBe('/Users/lvziw/project')
    expect(normalizeWorkspacePath('C:\\Users\\Dev\\Project\\')).toBe('c:/users/dev/project')
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
      { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() },
      { allowDirectTransport: true, enableNativeProxy: false },
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

describe('4. Git Remote Discovery & WorkspaceAggregator', () => {
  it('discovers Git remotes from both standard .git/config and worktree .git pointer files', () => {
    const root = makeTempDir('dsh-md-git-')
    const repoDir = join(root, 'main-repo')
    mkdirSync(join(repoDir, '.git', 'worktrees', 'feat-1'), { recursive: true })
    writeFileSync(
      join(repoDir, '.git', 'config'),
      `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = git@github.com:acme/platform.git\n`,
    )
    expect(discoverLocalGitRemote(repoDir)).toBe('git@github.com:acme/platform.git')

    const wtDir = join(root, 'wt-feat-1')
    mkdirSync(wtDir, { recursive: true })
    writeFileSync(join(wtDir, '.git'), `gitdir: ${join(repoDir, '.git', 'worktrees', 'feat-1')}\n`)
    writeFileSync(join(repoDir, '.git', 'worktrees', 'feat-1', 'commondir'), '../..\n')
    expect(discoverLocalGitRemote(wtDir)).toBe('git@github.com:acme/platform.git')
  })

  it('aggregates workspaces sharing a Git remote across devices, and honors manual rules & exclusions', () => {
    const agg = new WorkspaceAggregator({ autoGitAggregate: true, prefixUnmatchedWithDevice: true })
    const devUbuntu = DeviceId('dev-ubuntu')
    const devMac = DeviceId('dev-mac')

    agg.noteGitRemote(LOCAL_DEVICE_ID, '/Users/me/platform', 'https://github.com/acme/platform.git')
    agg.noteGitRemote(devUbuntu, '/home/ubuntu/platform', 'git@github.com:acme/platform.git')
    agg.noteGitRemote(devMac, '/Users/mac/other-tool', 'git@github.com:acme/other-tool.git')

    const { logicalWorkspaces } = agg.aggregate(
      [
        {
          deviceId: LOCAL_DEVICE_ID,
          deviceName: 'Local',
          workspaceId: 'ws-local-1',
          path: '/Users/me/platform',
          title: 'platform',
          sessionIds: ['s-local-1'],
          runningSessionCount: 0,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z',
        },
        {
          deviceId: devUbuntu,
          deviceName: 'ubuntu-gpu',
          workspaceId: 'ws-rem-1',
          path: '/home/ubuntu/platform',
          title: 'platform-ubuntu',
          sessionIds: ['s-rem-1'],
          runningSessionCount: 1,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-03T00:00:00.000Z',
        },
        {
          deviceId: devMac,
          deviceName: 'mac-mini',
          workspaceId: 'ws-rem-2',
          path: '/Users/mac/other-tool',
          title: 'other-tool',
          sessionIds: ['s-rem-2'],
          runningSessionCount: 0,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      new Map([
        ['s-local-1', 100],
        [encodeRemoteSessionId(devUbuntu, 's-rem-1'), 200],
      ]),
    )

    expect(logicalWorkspaces).toHaveLength(2)
    const mergedPlatform = logicalWorkspaces.find(w => w.kind === 'git')!
    expect(mergedPlatform).toBeDefined()
    expect(mergedPlatform.gitRemote).toBe('github.com/acme/platform')
    expect(mergedPlatform.members).toHaveLength(2)
    expect(mergedPlatform.sessionIds).toEqual([
      encodeRemoteSessionId(devUbuntu, 's-rem-1'),
      's-local-1',
    ])

    const singleMac = logicalWorkspaces.find(w => w.kind === 'single')!
    // Device identity is a badge now, never a title prefix.
    expect(singleMac.title).toBe('other-tool')

    // Excluding a member splits the auto-merged workspace back into single workspaces
    agg.setMemberExcluded(`${devUbuntu}:/home/ubuntu/platform`, true)
    const afterSplit = agg.aggregate([
      {
        deviceId: LOCAL_DEVICE_ID,
        deviceName: 'Local',
        workspaceId: 'ws-local-1',
        path: '/Users/me/platform',
        title: 'platform',
        sessionIds: ['s-local-1'],
        runningSessionCount: 0,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-02T00:00:00.000Z',
      },
      {
        deviceId: devUbuntu,
        deviceName: 'ubuntu-gpu',
        workspaceId: 'ws-rem-1',
        path: '/home/ubuntu/platform',
        title: 'platform-ubuntu',
        sessionIds: ['s-rem-1'],
        runningSessionCount: 1,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-03T00:00:00.000Z',
      },
    ])
    expect(afterSplit.logicalWorkspaces).toHaveLength(2)
    expect(afterSplit.logicalWorkspaces.every(w => w.kind === 'single')).toBe(true)
  })
})

describe('4b. Offline-aware target selection & session ownership', () => {
  const ubuntu = DeviceId('dev-ubuntu')
  const mac = DeviceId('dev-mac')

  const localPlatform = {
    deviceId: LOCAL_DEVICE_ID,
    deviceName: 'Local',
    workspaceId: 'ws-local',
    path: '/home/me/platform',
    title: 'platform',
    sessionIds: ['s-local'],
    runningSessionCount: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
  }
  const ubuntuPlatform = {
    deviceId: ubuntu,
    deviceName: 'ubuntu-dev',
    workspaceId: 'ws-ubuntu',
    path: '/srv/platform',
    title: 'platform',
    sessionIds: ['s-ubuntu'],
    runningSessionCount: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
  }
  const macPlatform = {
    deviceId: mac,
    deviceName: 'mac-mini',
    workspaceId: 'ws-mac',
    path: '/Users/mac/platform',
    title: 'platform',
    sessionIds: ['s-mac'],
    runningSessionCount: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  }
  const preferredState = (deviceId: DeviceId): Partial<Record<string, DeviceId>> => ({
    [encodeLogicalWorkspaceId('git', 'github.com/acme/platform')]: deviceId,
  })

  function deviceView(id: DeviceId, name: string, state: DeviceConnectionState): DeviceView {
    return {
      id,
      name,
      enabled: true,
      state,
      transportKind: 'ssh',
      targetSummary: `ssh://${name}`,
      keepNativeAlive: true,
      protocolVersion: '0.2',
      realtime: true,
      reconnectAttempt: 0,
      sessionCount: 1,
      runningSessionCount: 0,
      pendingApprovalCount: 0,
      workspaceCount: 1,
    }
  }

  function snapshotFixture(patch: Partial<MultiDeviceSnapshot> = {}): MultiDeviceSnapshot {
    return {
      revision: 1,
      displayMode: 'aggregated',
      hostStatus: { aggregatedGatewayActive: true, nativeProxyActive: true },
      devices: [],
      sshConfigHosts: [],
      aggregationConfig: {
        autoGitAggregate: true,
        prefixUnmatchedWithDevice: false,
        excludedMemberKeys: [],
        preferredDeviceByLogicalId: {},
        customTitleByLogicalId: {},
        workspaceOrder: [],
        manualRules: [],
      },
      logicalWorkspaces: [],
      allPhysicalWorkspaces: [],
      sessionOrigins: {},
      unreadSessionIds: [],
      gitMatch: createIdleGitMatch(),
      ...patch,
    }
  }

  it('keeps the preferred device while online and falls back to the local member while offline', () => {
    const agg = new WorkspaceAggregator({
      autoGitAggregate: true,
      preferredDeviceByLogicalId: preferredState(ubuntu) as Record<string, DeviceId>,
    })
    agg.noteGitRemote(LOCAL_DEVICE_ID, localPlatform.path, 'git@github.com:acme/platform.git')
    agg.noteGitRemote(ubuntu, ubuntuPlatform.path, 'git@github.com:acme/platform.git')

    const online = agg.aggregate(
      [localPlatform, ubuntuPlatform],
      new Map(),
      new Map<DeviceId, DeviceConnectionState>([[ubuntu, 'connected']]),
    ).logicalWorkspaces.find(workspace => workspace.kind === 'git')!
    expect(online.targetDeviceId).toBe(ubuntu)
    expect(online.effectiveTargetDeviceId).toBe(ubuntu)
    expect(online.effectiveTargetPath).toBe('/srv/platform')
    expect(online.effectiveTargetOnline).toBe(true)

    const offline = agg.aggregate(
      [localPlatform, ubuntuPlatform],
      new Map(),
      new Map<DeviceId, DeviceConnectionState>([[ubuntu, 'error']]),
    ).logicalWorkspaces.find(workspace => workspace.kind === 'git')!
    expect(offline.targetDeviceId).toBe(ubuntu)
    expect(offline.targetPath).toBe('/srv/platform')
    expect(offline.effectiveTargetDeviceId).toBe(LOCAL_DEVICE_ID)
    expect(offline.effectiveTargetPath).toBe(localPlatform.path)
    expect(offline.effectiveTargetOnline).toBe(true)
  })

  it('falls back to another reachable member and reports an all-offline workspace', () => {
    const agg = new WorkspaceAggregator({ autoGitAggregate: true, ...preferredState(mac) })
    agg.setPreferredDevice(encodeLogicalWorkspaceId('git', 'github.com/acme/platform'), mac)
    agg.noteGitRemote(ubuntu, ubuntuPlatform.path, 'git@github.com:acme/platform.git')
    agg.noteGitRemote(mac, macPlatform.path, 'git@github.com:acme/platform.git')

    const fallback = agg.aggregate(
      [ubuntuPlatform, macPlatform],
      new Map(),
      new Map<DeviceId, DeviceConnectionState>([[mac, 'error'], [ubuntu, 'connected']]),
    ).logicalWorkspaces.find(workspace => workspace.kind === 'git')!
    expect(fallback.targetDeviceId).toBe(mac)
    expect(fallback.effectiveTargetDeviceId).toBe(ubuntu)
    expect(fallback.effectiveTargetOnline).toBe(true)

    const allOffline = agg.aggregate(
      [ubuntuPlatform, macPlatform],
      new Map(),
      new Map<DeviceId, DeviceConnectionState>([[mac, 'error'], [ubuntu, 'disabled']]),
    ).logicalWorkspaces.find(workspace => workspace.kind === 'git')!
    expect(allOffline.effectiveTargetDeviceId).toBe(mac)
    expect(allOffline.effectiveTargetOnline).toBe(false)
  })

  it('treats an unmerged single workspace as online only while its device is reachable', () => {
    const agg = new WorkspaceAggregator({ autoGitAggregate: false })
    const online = agg.aggregate(
      [ubuntuPlatform],
      new Map(),
      new Map<DeviceId, DeviceConnectionState>([[ubuntu, 'connected']]),
    ).logicalWorkspaces[0]!
    expect(online.kind).toBe('single')
    expect(online.effectiveTargetOnline).toBe(true)

    const offline = agg.aggregate(
      [ubuntuPlatform],
      new Map(),
      new Map<DeviceId, DeviceConnectionState>([[ubuntu, 'error']]),
    ).logicalWorkspaces[0]!
    expect(offline.effectiveTargetOnline).toBe(false)
  })

  it('resolves Session ownership and logical workspace for local and remote conversations', () => {
    const lws = {
      logicalWorkspaceId: encodeLogicalWorkspaceId('git', 'github.com/acme/platform'),
      title: 'platform',
      kind: 'git' as const,
      gitRemote: 'github.com/acme/platform',
      targetDeviceId: ubuntu,
      targetPath: '/srv/platform',
      effectiveTargetDeviceId: ubuntu,
      effectiveTargetPath: '/srv/platform',
      effectiveTargetOnline: true,
      members: [
        {
          deviceId: LOCAL_DEVICE_ID,
          deviceName: 'Local',
          remoteWorkspaceId: 'ws-local',
          path: '/home/me/platform',
          title: 'platform',
          sessionCount: 1,
          runningSessionCount: 0,
        },
        {
          deviceId: ubuntu,
          deviceName: 'ubuntu-dev',
          remoteWorkspaceId: 'ws-ubuntu',
          path: '/srv/platform',
          title: 'platform',
          sessionCount: 1,
          runningSessionCount: 0,
        },
      ],
      sessionIds: [encodeRemoteSessionId(ubuntu, 's-ubuntu'), 's-local'],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z',
    }
    const remoteId = encodeRemoteSessionId(ubuntu, 's-ubuntu')
    const snapshot = snapshotFixture({
      devices: [deviceView(ubuntu, 'ubuntu-dev', 'error')],
      logicalWorkspaces: [lws],
      allPhysicalWorkspaces: lws.members,
      sessionOrigins: {
        [remoteId]: {
          namespacedSessionId: remoteId,
          rawSessionId: 's-ubuntu',
          deviceId: ubuntu,
          deviceName: 'ubuntu-dev',
          deviceState: 'error',
          cwd: '/srv/platform',
          running: false,
        },
      },
    })

    const local = resolveSessionDevice(snapshot, 's-local', '本机')
    expect(local.isLocal).toBe(true)
    expect(local.name).toBe('本机')
    expect(local.state).toBe('connected')

    const remote = resolveSessionDevice(snapshot, remoteId, '本机')
    expect(remote.isLocal).toBe(false)
    expect(remote.name).toBe('ubuntu-dev')
    expect(remote.state).toBe('error')

    // Unknown remote device ids still render instead of throwing.
    const gone = resolveSessionDevice(snapshot, encodeRemoteSessionId(DeviceId('dev-gone'), 's-x'), '本机')
    expect(gone.name).toBe('dev-gone')
    expect(gone.state).toBe('disabled')

    expect(resolveSessionLogicalWorkspace(snapshot, remoteId)?.logicalWorkspaceId)
      .toBe(lws.logicalWorkspaceId)
    expect(resolveSessionLogicalWorkspace(snapshot, 's-local')?.logicalWorkspaceId)
      .toBe(lws.logicalWorkspaceId)
    // cwd fallback covers the moment right after create, before list frames land.
    expect(resolveSessionLogicalWorkspace(snapshot, 'md~never-seen', '/srv/platform')?.logicalWorkspaceId)
      .toBe(lws.logicalWorkspaceId)

    const targets = deviceTargetsForWorkspace(snapshot, lws, '本机')
    expect(targets.map(target => target.name)).toEqual(['本机', 'ubuntu-dev'])
    expect(targets.find(target => target.isLocal)?.online).toBe(true)
    expect(targets.find(target => !target.isLocal)?.online).toBe(false)
    expect(targets.find(target => target.deviceId === ubuntu)?.preferred).toBe(true)
    expect(effectiveTargetOf(snapshot, lws)?.deviceId).toBe(ubuntu)
  })

  it('describes which devices can host a new Session in a merged workspace', () => {
    const lws = {
      logicalWorkspaceId: encodeLogicalWorkspaceId('manual', 'rule-1'),
      title: 'platform',
      kind: 'manual' as const,
      targetDeviceId: LOCAL_DEVICE_ID,
      targetPath: '/home/me/platform',
      effectiveTargetDeviceId: LOCAL_DEVICE_ID,
      effectiveTargetPath: '/home/me/platform',
      effectiveTargetOnline: true,
      members: [
        {
          deviceId: LOCAL_DEVICE_ID,
          deviceName: 'Local',
          remoteWorkspaceId: 'ws-local',
          path: '/home/me/platform',
          title: 'platform',
          sessionCount: 0,
          runningSessionCount: 0,
        },
        {
          deviceId: ubuntu,
          deviceName: 'ubuntu-dev',
          remoteWorkspaceId: 'ws-ubuntu',
          path: '/srv/platform',
          title: 'platform',
          sessionCount: 0,
          runningSessionCount: 0,
        },
      ],
      sessionIds: [],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z',
    }
    const snapshot = snapshotFixture({
      devices: [deviceView(ubuntu, 'ubuntu-dev', 'reconnecting')],
      logicalWorkspaces: [lws],
      allPhysicalWorkspaces: lws.members,
    })
    const targets = deviceTargetsForWorkspace(snapshot, lws, '本机')
    expect(targets).toHaveLength(2)
    expect(targets[1]?.state).toBe('reconnecting')
    expect(targets[1]?.online).toBe(false)
    expect(targets[0]?.preferred).toBe(true)
  })
})

describe('4c. New Session device switching', () => {
  it('persists the chosen target device and restarts the New Session on it', async () => {
    const { clientStore } = await import('../src/client/state.ts')
    const calls: Array<string | undefined> = []
    const ui = { startSession: (workspaceId?: string): void => { calls.push(workspaceId) } }
    const originalFetch = globalThis.fetch
    const snapshot = clientStore.getSnapshot().snapshot
    const requested: unknown[] = []
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requested.push(init?.body === undefined ? undefined : JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ ok: true, value: snapshot }), { status: 200 })
    }) as typeof fetch
    try {
      const logicalId = encodeLogicalWorkspaceId('git', 'github.com/acme/platform')
      const result = await clientStore.switchNewSessionDevice(ui, logicalId, DeviceId('dev-ubuntu'))
      expect(result.ok).toBe(true)
      expect(calls).toEqual([logicalId])
      expect(requested).toContainEqual({
        action: 'setPreferredDevice',
        payload: { logicalWorkspaceId: logicalId, deviceId: 'dev-ubuntu' },
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('reports an unavailable startSession instead of pretending the switch happened', async () => {
    const { clientStore } = await import('../src/client/state.ts')
    const originalFetch = globalThis.fetch
    const snapshot = clientStore.getSnapshot().snapshot
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, value: snapshot }), { status: 200 })) as typeof fetch
    try {
      const result = await clientStore.switchNewSessionDevice(
        undefined,
        encodeLogicalWorkspaceId('git', 'github.com/acme/other'),
        DeviceId('dev-mac'),
      )
      expect(result.ok).toBe(false)
      expect(result.error).toBe('startSession-unavailable')
    } finally {
      globalThis.fetch = originalFetch
    }
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
    const localHost = {
      localPort: () => 3080,
      localWorkspaces: () => [],
      localSessionUpdatedAt: () => new Map<string, number>(),
    }
    const options = { allowDirectTransport: true, enableNativeProxy: false as const }

    const first = new DeviceRegistry(dataFile, secretsFile, localHost, options)
    const added = await first.upsertDevice({
      id: 'dev-cache',
      name: 'cache-dev',
      enabled: false,
      transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:9' },
      auth: { mode: 'none' },
    })
    expect(added.ok).toBe(true)
    first.setDeviceCatalog(cachedCatalog)
    first.saveToDisk()
    first.dispose()

    const persisted = JSON.parse(readFileSync(dataFile, 'utf8')) as {
      catalogs?: Record<string, { syncedAt: number }>
    }
    expect(persisted.catalogs?.['dev-cache']?.syncedAt).toBe(cachedCatalog.syncedAt)

    const second = new DeviceRegistry(dataFile, secretsFile, localHost, options)
    expect(second.deviceCatalog(DeviceId('dev-cache'))?.sessions).toHaveLength(2)
    second.startAll()
    const client = second.client(DeviceId('dev-cache'))!
    expect(client.toView().lastSyncedAt).toBe(cachedCatalog.syncedAt)
    expect(client.toView().catalogStale).toBe(true)

    const snapshot = second.snapshot()
    expect(snapshot.logicalWorkspaces.length).toBeGreaterThan(0)
    expect(snapshot.sessionOrigins[encodeRemoteSessionId(DeviceId('dev-cache'), 's-1')]?.deviceName)
      .toBe('cache-dev')
    expect(snapshot.sessionOrigins[encodeRemoteSessionId(DeviceId('dev-cache'), 's-1')]?.deviceState)
      .not.toBe('connected')
    second.dispose()
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
    expect(status).toBeDefined()
    expect(client.sessionSummaries().find(summary => summary.sessionId === 's-running')?.running).toBe(false)
    expect(client.toView().runningSessionCount).toBe(0)
    expect(client.toView().catalogStale).toBe(true)
  })

  it('builds a wire-compatible offline failure and refuses to wait on an unconfigured device', async () => {
    const error = deviceOfflineError('ubuntu-dev', 'reconnect attempt 3') as Error & {
      code: string
      details: Record<string, unknown>
      isDSHRemoteError: boolean
    }
    expect(error.isDSHRemoteError).toBe(true)
    expect(error.code).toBe('dsh-md/device-offline')
    expect(error.message).toContain('ubuntu-dev')
    expect(error.details).toEqual({ deviceName: 'ubuntu-dev' })

    const dir = makeTempDir('dsh-md-registry-wait-')
    const registry = new DeviceRegistry(
      join(dir, 'registry.json'),
      join(dir, 'secrets.json'),
      { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() },
      { allowDirectTransport: true, enableNativeProxy: false },
    )
    const controller = new AbortController()
    await expect(registry.waitForDeviceConnected(LOCAL_DEVICE_ID, controller.signal, 10)).resolves.toBe(true)
    await expect(registry.waitForDeviceConnected(DeviceId('missing'), controller.signal, 10)).resolves.toBe(false)
    registry.dispose()
  })
})

describe('4e. Display preferences for session rows', () => {
  it('defaults the row device marker off, persists a change, and restores it after a restart', async () => {
    const dir = makeTempDir('dsh-md-ui-prefs-')
    const dataFile = join(dir, 'registry.json')
    const secretsFile = join(dir, 'secrets.json')
    const localHost = {
      localPort: () => 3080,
      localWorkspaces: () => [],
      localSessionUpdatedAt: () => new Map<string, number>(),
    }
    const options = { allowDirectTransport: true, enableNativeProxy: false as const }

    const registry = new DeviceRegistry(dataFile, secretsFile, localHost, options)
    expect(registry.snapshot().ui?.sessionRowDeviceDot).toBe(false)

    const plane = new MultiDeviceControlPlane(registry, () => true)
    const toggled = await plane.dispatch({ action: 'setUiPreferences', payload: { sessionRowDeviceDot: true } })
    expect(toggled.ok).toBe(true)
    expect(registry.ui().sessionRowDeviceDot).toBe(true)
    expect((toggled as { value: { ui?: { sessionRowDeviceDot: boolean } } }).value.ui?.sessionRowDeviceDot)
      .toBe(true)
    const crossHost = await plane.dispatch({
      action: 'setUiPreferences',
      payload: { crossHostReadState: true },
    })
    expect(crossHost.ok).toBe(true)
    expect(registry.ui().crossHostReadState).toBe(true)
    registry.dispose()

    const second = new DeviceRegistry(dataFile, secretsFile, localHost, options)
    expect(second.ui().sessionRowDeviceDot).toBe(true)
    expect(second.snapshot().ui?.sessionRowDeviceDot).toBe(true)

    // Explicit false must stick too (not "undefined means false" twice).
    second.updateUiPreferences({ sessionRowDeviceDot: false })
    second.dispose()
    const third = new DeviceRegistry(dataFile, secretsFile, localHost, options)
    expect(third.ui().sessionRowDeviceDot).toBe(false)
    third.dispose()
  })

  it('treats a malformed preference document as the default instead of throwing', () => {
    const dir = makeTempDir('dsh-md-ui-prefs-bad-')
    const dataFile = join(dir, 'registry.json')
    writeFileSync(dataFile, JSON.stringify({ version: 1, devices: [], ui: { sessionRowDeviceDot: 'yes' } }))
    const registry = new DeviceRegistry(
      dataFile,
      join(dir, 'secrets.json'),
      { localPort: () => 3080, localWorkspaces: () => [], localSessionUpdatedAt: () => new Map() },
      { allowDirectTransport: true, enableNativeProxy: false },
    )
    expect(registry.ui().sessionRowDeviceDot).toBe(false)
    registry.dispose()
  })
})

describe('5. End-to-End Integration: Remote DSH 0.2 Server, Aggregated Gateway, & Native Proxy', () => {
  it('connects to a simulated remote DSH 0.2 server, aggregates sessions & workspaces, routes prompts/approvals, and serves Native Mode via reverse proxy', async () => {
    const dir = makeTempDir('dsh-md-e2e-')

    // Spin up a mock remote DSH 0.2 HTTP + WebSocket server
    const remotePrompts: unknown[] = []
    const remoteApprovalResults: unknown[] = []
    let pushRemoteEvent: ((frame: unknown) => void) | undefined
    let pushRemoteWorkspaceFrame: ((frame: unknown) => void) | undefined

    const wss = new WebSocketServer({ noServer: true })
    wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as {
          type: string
          streamId: string
          endpoint?: string
          payload?: { args?: Record<string, unknown> }
        }
        if (msg.type === 'open') {
          if (msg.endpoint === '$events') {
            ws.send(
              JSON.stringify({
                type: 'item',
                streamId: msg.streamId,
                value: {
                  type: 'ready',
                  clientId: 'remote-client-1',
                  host: { home: '/home/remoteuser' },
                },
              }),
            )
            pushRemoteEvent = (frame) => {
              ws.send(JSON.stringify({ type: 'item', streamId: msg.streamId, value: frame }))
            }
          } else if (msg.endpoint === 'workspace/follow') {
            ws.send(
              JSON.stringify({
                type: 'item',
                streamId: msg.streamId,
                value: {
                  type: 'baseline',
                  value: {
                    items: [
                      {
                        workspaceId: 'rws-1',
                        path: '/home/remoteuser/shared-repo',
                        title: 'shared-repo',
                        // Deliberately empty: a workspace registered by manual
                        // matching must still adopt pre-existing Sessions by cwd.
                        sessionIds: [],
                        createdAt: '2026-10-01T00:00:00.000Z',
                        updatedAt: '2026-10-02T00:00:00.000Z',
                      },
                    ],
                    archivedSessionIds: [],
                    pinnedSessionIds: [],
                  },
                },
              }),
            )
            pushRemoteWorkspaceFrame = (frame) => {
              ws.send(JSON.stringify({ type: 'item', streamId: msg.streamId, value: frame }))
            }
          } else if (msg.endpoint === 'session/control') {
            ws.send(
              JSON.stringify({
                type: 'item',
                streamId: msg.streamId,
                value: {
                  type: 'baseline',
                  value: {
                    projections: {
                      'rsess-1': {
                        asOfSeq: 2,
                        values: { title: 'Remote Task 1' },
                      },
                    },
                  },
                },
              }),
            )
          } else if (msg.endpoint === 'session/follow') {
            ws.send(
              JSON.stringify({
                type: 'item',
                streamId: msg.streamId,
                value: {
                  type: 'snapshot',
                  header: { version: 2, id: 'rsess-1', createdAt: 1000, cwd: '/home/remoteuser/shared-repo', isSeeded: false },
                  cursor: 1,
                  records: [],
                  hasMore: false,
                  projections: { asOfSeq: 1, values: { title: 'Remote Task 1' } },
                  assistantStream: { revision: 0 },
                },
              }),
            )
          }
        }
      })
    })

    const remoteServer: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.url === '/' && req.method === 'GET') {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'x-frame-options': 'DENY',
          'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
        })
        res.end('<html><body>Remote DSH Native Web UI</body></html>')
        return
      }

      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        rpcId: string
        method: string
        payload: { args: Record<string, unknown> }
      }

      const reply = (value: unknown): void => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            type: 'server-response',
            rpcId: body.rpcId,
            result: { ok: true, value },
          }),
        )
      }

      if (body.method === 'session/list') {
        reply({
          items: [
            {
              sessionId: 'rsess-1',
              updatedAt: 5000,
              agentAvailable: true,
              running: true,
              blank: false,
              cwd: '/home/remoteuser/shared-repo',
              projections: { kind: 'sequenced', asOfSeq: 2, values: { title: 'Remote Task 1' } },
            },
          ],
        })
        return
      }

      if (body.method === 'session/modelCatalog') {
        reply({
          default: { provider: 'remote-provider', model: 'remote-default' },
          routableProviders: ['remote-provider'],
          groups: [
            {
              id: 'remote-provider',
              name: 'Remote Provider',
              models: [{ id: 'remote-only-model', name: 'Remote Only' }],
            },
          ],
          failures: [],
        })
        return
      }

      if (body.method === 'session/create') {
        reply({ sessionId: 'rsess-created', agentPreset: 'remote-preset' })
        return
      }

      if (body.method === 'workspace/create') {
        reply({
          workspace: {
            workspaceId: 'rws-created',
            path: '/home/remoteuser/new-repo',
            title: 'new-repo',
            sessionIds: [],
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
          created: true,
        })
        return
      }

      if (body.method === 'session/prompt') {
        remotePrompts.push(body.payload.args.request)
        reply({ accepted: true })
        return
      }

      if (body.method === '$events/result') {
        remoteApprovalResults.push(body.payload.args)
        reply(undefined)
        return
      }

      reply({})
    })

    remoteServer.on('upgrade', (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    })

    await new Promise<void>(r => remoteServer.listen(0, '127.0.0.1', () => r()))
    const remotePort = (remoteServer.address() as { port: number }).port
    const remoteBaseUrl = `http://127.0.0.1:${remotePort}`

    try {
      const registry = new DeviceRegistry(
        join(dir, 'devices.json'),
        join(dir, 'secrets.json'),
        {
          localPort: () => 3080,
          localWorkspaces: () => [
            {
              deviceId: LOCAL_DEVICE_ID,
              deviceName: 'Local',
              workspaceId: 'lws-1',
              path: '/Users/local/shared-repo',
              title: 'shared-repo',
              sessionIds: ['lsess-1'],
              runningSessionCount: 0,
              createdAt: '2026-10-01T00:00:00.000Z',
              updatedAt: '2026-10-01T00:00:00.000Z',
            },
          ],
          localSessionUpdatedAt: () => new Map([['lsess-1', 1000]]),
        },
        { allowDirectTransport: true },
      )

      // Add the remote device
      const added = await registry.upsertDevice({
        id: 'dev-remote1',
        name: 'remote-box',
        transport: { kind: 'direct', baseUrl: remoteBaseUrl },
        auth: { mode: 'none' },
      })
      expect(added.ok).toBe(true)

      // Wait for RemoteDeviceClient to connect and receive workspace/follow + session/control baselines
      for (let i = 0; i < 40; i++) {
        const view = registry.client(DeviceId('dev-remote1'))?.toView()
        if (view?.state === 'connected' && view.workspaceCount > 0) break
        await new Promise(r => setTimeout(r, 50))
      }

      const devId = DeviceId('dev-remote1')
      registry.aggregator.noteGitRemote(LOCAL_DEVICE_ID, '/Users/local/shared-repo', 'git@github.com:org/shared-repo.git')
      registry.aggregator.noteGitRemote(devId, '/home/remoteuser/shared-repo', 'https://github.com/org/shared-repo.git')

      // Verify Git Auto-Aggregation merges local and remote workspaces into one Logical Workspace
      const snap = registry.snapshot()
      expect(snap.logicalWorkspaces).toHaveLength(1)
      expect(snap.logicalWorkspaces[0]?.kind).toBe('git')
      expect(snap.logicalWorkspaces[0]?.gitRemote).toBe('github.com/org/shared-repo')
      expect(snap.logicalWorkspaces[0]?.sessionIds).toEqual([
        encodeRemoteSessionId(devId, 'rsess-1'),
        'lsess-1',
      ])
      expect(
        snap.allPhysicalWorkspaces.find(member => member.deviceId === devId)?.sessionCount,
      ).toBe(1)

      // DSH 0.2.2 replaces the complete workspace projection when remote-access
      // visibility changes. The plugin's RemoteDeviceClient must treat that as
      // authoritative instead of ignoring the frame.
      pushRemoteWorkspaceFrame?.({
        type: 'replace',
        value: {
          items: [{
            workspaceId: 'rws-1',
            path: '/home/remoteuser/shared-repo',
            title: 'shared-repo-replaced',
            sessionIds: ['rsess-1'],
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-03T00:00:00.000Z',
          }],
          archivedSessionIds: [],
          pinnedSessionIds: [],
        },
      })
      for (let i = 0; i < 40; i++) {
        if (registry.client(devId)?.workspaceItems()[0]?.title === 'shared-repo-replaced') break
        await new Promise(r => setTimeout(r, 25))
      }
      expect(registry.client(devId)?.workspaceItems()[0]?.title).toBe('shared-repo-replaced')

      // Verify Native Mode Reverse Proxy serves remote HTML and strips X-Frame-Options & CSP frame-ancestors
      const proxyUrl = snap.devices[0]?.nativeProxyUrl
      expect(proxyUrl).toBeDefined()
      const proxyBase = new URL(proxyUrl!)
      const proxyWithoutToken = new URL('/', proxyBase).href
      const tokenless = await fetch(proxyWithoutToken, { redirect: 'manual' })
      expect(tokenless.status).toBe(403)
      const tokenRedirect = await fetch(proxyBase, { redirect: 'manual' })
      expect(tokenRedirect.status).toBe(302)
      const proxyCookie = tokenRedirect.headers.get('set-cookie')?.split(';')[0]
      expect(proxyCookie).toContain('dsh-md-native=')
      const proxyRes = await fetch(proxyWithoutToken, {
        headers: { cookie: proxyCookie! },
      })
      expect(proxyRes.status).toBe(200)
      expect(proxyRes.headers.get('x-frame-options')).toBeNull()
      expect(proxyRes.headers.get('content-security-policy') ?? '').not.toContain('frame-ancestors')
      const html = await proxyRes.text()
      expect(html).toContain('Remote DSH Native Web UI')

      // Path traversal / protocol-relative targets must never become an open proxy.
      const ssrf = await fetch(`${proxyBase.origin}//evil.example/steal`, {
        headers: { cookie: proxyCookie! },
        redirect: 'manual',
      })
      expect(ssrf.status).toBe(400)

      // Install AggregatedGateway over mock local controllers and test session.list, session.prompt, and approval waterfall
      const mockSessionController: SessionControllerLike = {
        list: async () => ({
          items: [
            {
              sessionId: 'lsess-1',
              updatedAt: 1000,
              agentAvailable: true,
              running: false,
              blank: false,
              cwd: '/Users/local/shared-repo',
            },
          ],
        }),
        search: async () => ({ items: [], hasMore: false }),
        create: async () => ({ sessionId: 'lsess-new' }),
        selectModel: async () => ({ selected: {} }),
        modelCatalog: async () => ({
          default: { provider: 'local-provider', model: 'local-default' },
          routableProviders: ['local-provider'],
          groups: [
            {
              id: 'local-provider',
              name: 'Local Provider',
              models: [{ id: 'local-model', name: 'Local Model' }],
            },
          ],
          failures: [],
        }),
        rename: async () => ({ title: 'renamed', seq: 1 }),
        fork: async () => ({ sessionId: 'lsess-fork' }),
        prompt: async () => ({ accepted: true }),
        attachment: async () => ({}),
        updateQueue: async () => ({ accepted: true }),
        cancel: () => ({ accepted: true }),
        page: async () => ({ records: [], hasMore: false }),
        follow: async function* () {},
        projections: async () => null,
        control: async function* () {
          yield { type: 'baseline', value: { projections: {} } }
        },
      }

      const mockWorkspaceController: WorkspaceControllerLike = {
        create: async () => ({ workspace: {}, created: true }),
        rename: async () => ({ workspace: {} }),
        delete: async () => ({ deleted: true }),
        insertBefore: async () => ({ workspaceIds: [] }),
        insertSessionBefore: async () => ({ workspace: {} }),
        archiveSession: async () => ({ archivedSessionIds: [] }),
        unarchiveSession: async () => ({ archivedSessionIds: [] }),
        pinSession: async () => ({ pinnedSessionIds: [] }),
        unpinSession: async () => ({ pinnedSessionIds: [] }),
        follow: async function* () {
          yield {
            type: 'baseline',
            value: { items: [], archivedSessionIds: [], pinnedSessionIds: [] },
          }
        },
      }

      const mockGateway: TypertGatewayLike = {
        wireStream: {
          open: async () =>
            (async function* () {
              yield { type: 'ready', clientId: 'local-client-1', host: { home: '/Users/local' } }
            })(),
          failure: () => ({ code: 'internal', message: 'err', details: {} }),
        },
        dispatchRpc: async () => ({ ok: true, value: undefined }),
      }

      const mockWorkspaceRegistry = {
        list: () => [
          {
            id: 'lws-1',
            path: '/Users/local/shared-repo',
            title: 'shared-repo',
            sessionIds: ['lsess-1'],
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        archivedSessionIds: [],
        pinnedSessionIds: [],
      }

      const disposeGateway = installAggregatedGateway02(
        registry,
        mockSessionController,
        mockWorkspaceController,
        mockGateway,
        mockWorkspaceRegistry,
        { workspaceReplaceFrames: true },
      )

      // 1) Merged session.list
      const listed = await mockSessionController.list({}, new AbortController().signal)
      expect(listed.items.map(i => i.sessionId)).toEqual([
        encodeRemoteSessionId(devId, 'rsess-1'),
        'lsess-1',
      ])

      // 1b) A remote Session sees exactly the remote catalog, never local groups.
      const remoteSessionId = encodeRemoteSessionId(devId, 'rsess-1')
      expect(registry.setActiveSession(remoteSessionId, 1)).toBe(true)
      const remoteCatalog = (await mockSessionController.modelCatalog()) as {
        groups: { id: string; models: { id: string }[] }[]
        routableProviders: string[]
      }
      expect(remoteCatalog.groups.map(group => group.id)).toEqual(['remote-provider'])
      expect(remoteCatalog.groups[0]?.models.map(model => model.id)).toEqual(['remote-only-model'])
      expect(remoteCatalog.routableProviders).toEqual(['remote-provider'])

      // 1c) A local Session sees exactly the local catalog.
      expect(registry.setActiveSession('lsess-1', 2)).toBe(true)
      const localCatalog = (await mockSessionController.modelCatalog()) as {
        groups: { id: string; models: { id: string }[] }[]
      }
      expect(localCatalog.groups.map(group => group.id)).toEqual(['local-provider'])

      // 1d) An older control-plane request cannot move the scope backwards.
      expect(registry.setActiveSession(remoteSessionId, 3)).toBe(true)
      expect(registry.setActiveSession('lsess-1', 2)).toBe(false)
      expect(registry.activeSessionScope()).toMatchObject({ kind: 'remote', deviceId: devId })

      // 1e) The browser event generation receives remote Sessions that loaded
      // after its initial `session.list`, otherwise their workspace rows vanish.
      const eventsAbort = new AbortController()
      const eventsTimer = setTimeout(() => eventsAbort.abort(), 1_500)
      const replayStream = await mockGateway.wireStream.open(
        '$events',
        {},
        (async function* () {})(),
        undefined,
        eventsAbort.signal,
      )
      const replayed: Record<string, unknown>[] = []
      try {
        for await (const rawFrame of replayStream) {
          if (typeof rawFrame !== 'object' || rawFrame === null || Array.isArray(rawFrame)) continue
          const frame = rawFrame as Record<string, unknown>
          replayed.push(frame)
          if (frame.type === 'emit' && frame.event === 'api-session/added') break
        }
      } catch {
        // Abort after the expected frame.
      } finally {
        clearTimeout(eventsTimer)
        eventsAbort.abort()
      }
      expect(replayed.some(frame =>
        frame.type === 'emit' &&
        frame.event === 'api-session/added' &&
        Array.isArray(frame.args) &&
        (frame.args[0] as { sessionId?: string } | undefined)?.sessionId === remoteSessionId,
      )).toBe(true)

      // 1c) Explicit per-session device selection creates on the chosen device.
      const created = await registry.createRemoteSession({
        deviceId: devId,
        workspaceId: 'rws-1',
      })
      expect(created.ok).toBe(true)
      if (created.ok) {
        expect(created.sessionId).toBe(encodeRemoteSessionId(devId, 'rsess-created'))
      }

      // 1d) Remote workspace registration is available without a remote plugin.
      const remoteWorkspace = await registry.createRemoteWorkspace({
        deviceId: devId,
        path: '/home/remoteuser/new-repo',
      })
      expect(remoteWorkspace.ok).toBe(true)

      // 2) Routed session.prompt to remote device
      await mockSessionController.prompt(
        {
          requestId: 'req-1',
          sessionId: encodeRemoteSessionId(devId, 'rsess-1'),
          mode: 'queue',
          content: [{ type: 'text', text: 'Hello remote DSH' }],
        },
        new AbortController().signal,
      )
      expect(remotePrompts).toHaveLength(1)
      expect((remotePrompts[0] as { sessionId: string }).sessionId).toBe('rsess-1')

      // 3) Remote approval waterfall -> answered via $events/result
      pushRemoteEvent?.({
        type: 'waterfall',
        event: 'approval/request',
        eventId: 'rem-ev-99',
        agentId: 'rsess-1',
        request: { toolName: 'bash', reason: 'Run build' },
      })
      await new Promise(r => setTimeout(r, 60))

      const namespacedEvId = encodeRemoteEventId(devId, 'rem-ev-99')
      const resultRes = await mockGateway.dispatchRpc!(
        '$events/result',
        {
          args: {
            clientId: 'local-client-1',
            eventId: namespacedEvId,
            outcome: { kind: 'result', value: 'allowed-once' },
          },
        },
        new AbortController().signal,
        undefined,
      )
      expect(resultRes.ok).toBe(true)
      expect(remoteApprovalResults).toHaveLength(1)
      expect((remoteApprovalResults[0] as { eventId: string }).eventId).toBe('rem-ev-99')

      // The long-lived follow stream below is the important shape: a real
      // browser keeps this generation open across mode switches. Opening a
      // fresh stream after the switch (as older tests did) always receives a
      // baseline and cannot catch a `remove` that tombstoned an id.
      const liveAbort = new AbortController()
      const liveFrames = mockWorkspaceController.follow(liveAbort.signal)[Symbol.asyncIterator]()
      const liveBaseline = await liveFrames.next()
      expect(liveBaseline.done).toBe(false)
      expect(liveBaseline.value.type).toBe('baseline')

      // 4) Native Mode makes the local tab strictly local on the Host side.
      const controlPlane = new MultiDeviceControlPlane(registry)
      const nativeMode = await controlPlane.dispatch({
        action: 'setDisplayMode',
        payload: { displayMode: 'native' },
      })
      expect(nativeMode.ok).toBe(true)
      expect(registry.snapshot().displayMode).toBe('native')

      const nativeReplace = await liveFrames.next()
      expect(nativeReplace.done).toBe(false)
      expect(nativeReplace.value.type).toBe('replace')
      expect((nativeReplace.value.value as { items: { workspaceId: string }[] }).items)
        .toEqual([expect.objectContaining({ workspaceId: 'lws-1' })])

      const nativeListed = await mockSessionController.list({}, new AbortController().signal)
      expect(nativeListed.items.map(item => item.sessionId)).toEqual(['lsess-1'])

      const nativeCatalog = (await mockSessionController.modelCatalog()) as {
        groups: { id: string }[]
        routableProviders: string[]
      }
      expect(nativeCatalog.groups.map(group => group.id)).toEqual(['local-provider'])
      expect(nativeCatalog.routableProviders).toEqual(['local-provider'])

      const nativeCreate = await mockSessionController.create({
        sessionId: encodeRemoteSessionId(devId, 'rsess-1'),
      })
      expect(nativeCreate.sessionId).toBe('lsess-new')

      const promptsBeforeNative = remotePrompts.length
      await mockSessionController.prompt(
        {
          requestId: 'req-native',
          sessionId: encodeRemoteSessionId(devId, 'rsess-1'),
          mode: 'queue',
          content: [{ type: 'text', text: 'must not leave the machine' }],
        },
        new AbortController().signal,
      )
      expect(remotePrompts).toHaveLength(promptsBeforeNative)

      const nativeDispatch = await mockGateway.dispatchRpc!(
        '$events/result',
        {
          args: {
            clientId: 'local-client-1',
            eventId: encodeRemoteEventId(devId, 'rem-ev-100'),
            outcome: { kind: 'result', value: 'allowed-once' },
          },
        },
        new AbortController().signal,
        undefined,
      )
      expect(nativeDispatch.ok).toBe(true)
      expect(remoteApprovalResults).toHaveLength(1)

      const readBaseline = async (
        stream: AsyncIterable<Record<string, unknown>>,
      ): Promise<Record<string, unknown>> => {
        for await (const frame of stream) return frame
        throw new Error('workspace follow ended without a baseline')
      }

      const nativeAbort = new AbortController()
      const nativeBaseline = await readBaseline(mockWorkspaceController.follow(nativeAbort.signal))
      nativeAbort.abort()
      expect(nativeBaseline.type).toBe('baseline')
      expect((nativeBaseline.value as { items: { workspaceId: string }[] }).items)
        .toEqual([expect.objectContaining({ workspaceId: 'lws-1' })])

      // 5) Returning to Aggregated Mode restores the merged view for the same
      // connected client; no page reload is required.
      const aggregatedMode = await controlPlane.dispatch({
        action: 'setDisplayMode',
        payload: { displayMode: 'aggregated' },
      })
      expect(aggregatedMode.ok).toBe(true)

      const aggregatedReplace = await liveFrames.next()
      expect(aggregatedReplace.done).toBe(false)
      expect(aggregatedReplace.value.type).toBe('replace')
      expect((aggregatedReplace.value.value as { items: { workspaceId: string }[] }).items)
        .toEqual([expect.objectContaining({ workspaceId: snap.logicalWorkspaces[0]?.logicalWorkspaceId })])
      liveAbort.abort()

      const restored = await mockSessionController.list({}, new AbortController().signal)
      expect(restored.items.map(item => item.sessionId)).toEqual([
        encodeRemoteSessionId(devId, 'rsess-1'),
        'lsess-1',
      ])

      const aggregatedAbort = new AbortController()
      const aggregatedBaseline = await readBaseline(mockWorkspaceController.follow(aggregatedAbort.signal))
      aggregatedAbort.abort()
      expect((aggregatedBaseline.value as { items: { workspaceId: string }[] }).items)
        .toEqual([expect.objectContaining({ workspaceId: snap.logicalWorkspaces[0]?.logicalWorkspaceId })])

      // Deleting a merged logical Workspace only splits aggregation. The unary
      // reply removes the old row in the Client immediately, so the Host must
      // publish the replacement single rows on the same follow stream.
      const splitAbort = new AbortController()
      const splitFrames = mockWorkspaceController.follow(splitAbort.signal)[Symbol.asyncIterator]()
      const splitBaseline = await splitFrames.next()
      expect(splitBaseline.value.type).toBe('baseline')
      const logicalId = snap.logicalWorkspaces[0]!.logicalWorkspaceId
      const deleted = await mockWorkspaceController.delete({ workspaceId: logicalId })
      expect(deleted.deleted).toBe(true)
      const splitReplace = await splitFrames.next()
      expect(splitReplace.value.type).toBe('replace')
      const splitIds = (splitReplace.value.value as { items: { workspaceId: string }[] }).items
        .map(item => item.workspaceId)
      const expectedSplit = registry.snapshot().logicalWorkspaces.map(workspace => workspace.logicalWorkspaceId)
      expect(expectedSplit).toHaveLength(2)
      expect(new Set(splitIds)).toEqual(new Set(expectedSplit))
      splitAbort.abort()

      disposeGateway()
      registry.dispose()
    } finally {
      for (const client of wss.clients) client.terminate()
      wss.close()
      remoteServer.closeAllConnections()
      await new Promise<void>(r => remoteServer.close(() => r()))
    }
  })

  it('supports DSH 0.1.x legacy protocol servers, WebSocket native proxy upgrades, self-loop protection, and mode independence', async () => {
    const dir = makeTempDir('dsh-md-compat-')

    // Simulated DSH 0.1.x server + WebSocket echo for Native Proxy test
    const wss01 = new WebSocketServer({ noServer: true })
    let wsUpgradeHeaders: Record<string, unknown> = {}
    wss01.on('connection', (ws, req) => {
      wsUpgradeHeaders = req.headers
      ws.on('message', (data) => {
        ws.send(`echo:${data.toString()}`)
      })
    })

    const server01 = createServer(async (req, res) => {
      if (req.url?.startsWith('/?token=')) {
        res.writeHead(303, {
          'location': './',
          'set-cookie': `${dshCookieName(req.headers.host ?? '127.0.0.1')}=v1.mockcookie; Path=/; HttpOnly; SameSite=Strict`,
        })
        res.end()
        return
      }

      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as {
        rpcId?: string
        method?: string
        payload?: Record<string, unknown>
      }

      const reply = (ok: boolean, valueOrErr: unknown): void => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            type: 'server-response',
            rpcId: body.rpcId ?? '1',
            result: ok ? { ok: true, value: valueOrErr } : { ok: false, error: valueOrErr },
          }),
        )
      }

      if (req.url === '/api/session/list') {
        res.writeHead(404)
        res.end('not found')
        return
      }
      if (req.url === '/api/host.describe') {
        reply(true, { version: '0.1.0-rc.6', cwd: '/root/legacy' })
        return
      }
      if (req.url === '/api/session.list') {
        reply(true, {
          items: [
            {
              sessionId: 'legacy-s1',
              updatedAt: 3000,
              running: false,
              blank: false,
              cwd: '/root/legacy/app',
            },
          ],
        })
        return
      }
      if (req.url === '/api/workspace.list') {
        reply(true, {
          items: [
            {
              workspaceId: 'legacy-ws1',
              path: '/root/legacy/app',
              title: 'legacy-app',
              sessionIds: ['legacy-s1'],
              createdAt: '2026-08-01T00:00:00.000Z',
              updatedAt: '2026-08-01T00:00:00.000Z',
            },
          ],
          archivedSessionIds: ['legacy-archived-1'],
        })
        return
      }
      if (req.url === '/api/session.history') {
        reply(true, {
          events: [{ type: 'event', event: { type: 'user/message', seq: 0, time: 1000, data: {} } }],
          hasMore: false,
        })
        return
      }
      reply(true, {})
    })

    server01.on('upgrade', (req, socket, head) => {
      wss01.handleUpgrade(req, socket, head, (ws) => {
        wss01.emit('connection', ws, req)
      })
    })

    await new Promise<void>(r => server01.listen(0, '127.0.0.1', () => r()))
    const port01 = (server01.address() as { port: number }).port
    const url01 = `http://127.0.0.1:${port01}`

    try {
      const registry = new DeviceRegistry(
        join(dir, 'devices.json'),
        join(dir, 'secrets.json'),
        {
          localPort: () => 4080,
          localWorkspaces: () => [],
          localSessionUpdatedAt: () => new Map(),
        },
        { allowDirectTransport: true },
      )

      // 1) Self-loop rejection check
      const selfLoopRes = await registry.upsertDevice({
        name: 'self-host',
        transport: { kind: 'direct', baseUrl: 'http://127.0.0.1:4080' },
      })
      expect(selfLoopRes.ok).toBe(false)
      if (!selfLoopRes.ok) {
        expect(selfLoopRes.error).toContain('Self-loop')
      }

      // 2) Add DSH 0.1.x server with launch token URL exchange
      const added01 = await registry.upsertDevice({
        id: 'dev-legacy',
        name: 'legacy-node',
        transport: { kind: 'direct', baseUrl: url01 },
        auth: { mode: 'token', credential: `${url01}/?token=secret_launch_tok` },
      })
      expect(added01.ok).toBe(true)

      for (let i = 0; i < 40; i++) {
        const v = registry.client(DeviceId('dev-legacy'))?.toView()
        if (v?.state === 'connected' && v.workspaceCount > 0) break
        await new Promise(r => setTimeout(r, 50))
      }

      const legacyClient = registry.client(DeviceId('dev-legacy'))!
      expect(legacyClient.toView().protocolVersion).toBe('0.1')
      expect(legacyClient.toView().remoteDshVersion).toBe('0.1.0-rc.6')
      expect(legacyClient.sessionSummaries()).toHaveLength(1)

      // 3) Mode Independence: Simulate Aggregated Gateway failure; verify ControlPlane & Native Proxy WS still work!
      registry.setGatewayStatus(false, 'Simulated schema mismatch')
      const cp = new MultiDeviceControlPlane(registry, () => true)
      const cpSnap = await cp.dispatch({ action: 'snapshot' })
      expect(cpSnap.ok).toBe(true)

      const nativeProxyUrl = legacyClient.toView().nativeProxyUrl!
      expect(nativeProxyUrl).toBeDefined()
      const nativeProxyBase = new URL(nativeProxyUrl)
      const tokenRedirect = await fetch(nativeProxyBase, { redirect: 'manual' })
      const nativeCookie = tokenRedirect.headers.get('set-cookie')?.split(';')[0]
      expect(nativeCookie).toContain('dsh-md-native=')
      const wsProxyUrl = new URL('/api/events.mux', nativeProxyBase).href.replace(/^http:/, 'ws:')
      const wsClient = new WebSocket(wsProxyUrl, { headers: { cookie: nativeCookie! } })
      const echoed = await new Promise<string>((resolve, reject) => {
        wsClient.once('open', () => wsClient.send('ping-native'))
        wsClient.once('message', d => resolve(d.toString()))
        wsClient.once('error', reject)
      })
      expect(echoed).toBe('echo:ping-native')
      // Verify Native Proxy injected the exchanged cookie and rewrote Host authority on WebSocket upgrade
      expect(wsUpgradeHeaders.host).toBe(`127.0.0.1:${port01}`)
      expect(String(wsUpgradeHeaders.cookie ?? '')).toContain('v1.mockcookie')
      wsClient.close()

      // 4) Persistence reload check
      registry.dispose()
      const reloadedRegistry = new DeviceRegistry(
        join(dir, 'devices.json'),
        join(dir, 'secrets.json'),
        {
          localPort: () => 4080,
          localWorkspaces: () => [],
          localSessionUpdatedAt: () => new Map(),
        },
        { allowDirectTransport: true },
      )
      expect(reloadedRegistry.deviceConfig(DeviceId('dev-legacy'))?.name).toBe('legacy-node')
      reloadedRegistry.dispose()
    } finally {
      for (const client of wss01.clients) client.terminate()
      wss01.close()
      server01.closeAllConnections()
      await new Promise<void>(r => server01.close(() => r()))
    }
  })
})

describe('6. Stability guards', () => {
  it('keeps a non-default Git port and still drops the default ssh port', () => {
    expect(normalizeGitRemote('ssh://git@gitlab.example.com:2222/group/repo.git')).toBe(
      'gitlab.example.com:2222/group/repo',
    )
    expect(normalizeGitRemote('https://github.com/org/repo.git')).toBe('github.com/org/repo')
  })

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
  it('rejects a nested remote event id instead of routing it to another device', () => {
    const eventId = encodeRemoteEventId(DeviceId('dev-a'), 'event-1')
    expect(decodeRemoteEventId(eventId)).toEqual({
      deviceId: DeviceId('dev-a'),
      remoteEventId: 'event-1',
    })
    expect(
      decodeRemoteEventId(encodeRemoteEventId(DeviceId('dev-a'), 'md-ev~dev-b~event-2')),
    ).toBeUndefined()
  })

  it('routes a subagent address only when the child belongs to the same device', () => {
    const parent = DeviceId('dev-a')
    expect(isSameDeviceChildSession(parent, encodeRemoteSessionId(parent, 'child-1'))).toBe(true)
    expect(isSameDeviceChildSession(parent, 'local-child')).toBe(false)
    expect(
      isSameDeviceChildSession(parent, encodeRemoteSessionId(DeviceId('dev-b'), 'child-1')),
    ).toBe(false)
  })

  it('tracks plan-review waterfalls alongside approval and questions', () => {
    expect(pendingInteractionKind('approval/request')).toBe('approval')
    expect(pendingInteractionKind('user-questions/request')).toBe('question')
    expect(pendingInteractionKind('plan-review/request')).toBe('plan-review')
    expect(pendingInteractionKind('other/request')).toBeUndefined()
  })

  it('returns an empty remote catalog with a failure instead of local models', () => {
    const catalog = unavailableRemoteCatalog('macos-dev', 'remote device is not connected')
    expect(catalog.groups).toEqual([])
    expect(catalog.routableProviders).toEqual([])
    expect(catalog.failures).toEqual([
      { id: 'remote:macos-dev', name: 'macos-dev', message: 'remote device is not connected' },
    ])
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
      // Aggregated Mode has no device navigation: neither a sidebar footer
      // entry nor a Session context-menu jump into Native Mode.
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
      expect(settingsHtml).toContain('data-primitive="SegmentedControl"')
      expect(settingsHtml).toContain('data-primitive="Switch"')
      expect(settingsHtml).toContain('data-primitive="Button"')
      expect(settingsHtml).toContain(zh.devicesHeading)
      expect(settingsHtml).not.toContain('sshEngine')
      expect(settingsHtml).not.toContain('manualRule')

      // Plugin bundle summary view returns concise one-liner
      const bundleReg = registeredSlots.get('plugins.bundle.config:dsh-multi-device')
      expect(bundleReg).toBeDefined()
      expect(bundleReg!.component({ view: 'summary', t: (k: keyof typeof zh) => zh[k] })).toBe(zh.pluginSummary)

      // Overlay renders no device chrome in Aggregated Mode.
      const overlayReg = registeredSlots.get('shell.overlay:multi-device-switcher')
      expect(overlayReg).toBeDefined()
      const overlayEmptyHtml = renderToStaticMarkup(
        React.createElement(overlayReg!.component as React.ComponentType<any>, { t: (k: keyof typeof zh) => zh[k] }),
      )
      expect(overlayEmptyHtml).not.toContain('dsh-md-overlay-bar')
      expect(overlayEmptyHtml).not.toContain('dsh-md-native-bar')

      // Native Mode has a persistent [本机][device] strip whose rightmost
      // action switches back to Aggregated Mode (the Host still owns the mode).
      const baseSnapshot = clientStore.getSnapshot().snapshot
      const nativeSnapshot = {
        ...baseSnapshot,
        revision: baseSnapshot.revision + 10,
        displayMode: 'native' as const,
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
      let nextSnapshot: typeof nativeSnapshot = nativeSnapshot
      const fetchMock = vi.fn(async () => ({
        json: async () => ({ ok: true, value: { snapshot: nextSnapshot } }),
      }))
      vi.stubGlobal('fetch', fetchMock)
      await clientStore.setDisplayMode('native')
      const nativeHtml = renderToStaticMarkup(
        React.createElement(overlayReg!.component as React.ComponentType<any>, { t: (k: keyof typeof zh) => zh[k] }),
      )
      expect(nativeHtml).toContain('dsh-md-native-bar')
      expect(nativeHtml).toContain(zh.nativeLocalTab)
      expect(nativeHtml).toContain('Dev A')
      expect(nativeHtml).toContain('dsh-md-native-mode-switch')
      expect(nativeHtml).toContain(zh.modeAggregated)
      expect(nativeHtml).toContain(zh.switchToAggregated)
      nextSnapshot = { ...nativeSnapshot, revision: nativeSnapshot.revision + 1, displayMode: 'aggregated' }
      // The rightmost button drives the same Host RPC as the Settings switch:
      // Aggregated Mode clears the selected device tab and restores merger rows.
      await clientStore.setDisplayMode('aggregated')
      expect(clientStore.getSnapshot().displayMode).toBe('aggregated')
      expect(clientStore.getSnapshot().activeNativeDeviceId).toBeUndefined()

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
      expect(zh.targetDeviceSubDesc).toBeDefined()
      expect(en.targetDeviceSubDesc).toBeDefined()
    } finally {
      for (const dispose of disposers) dispose()
      vi.unstubAllGlobals()
      vi.doUnmock('@deepseek-ai/dsh-client-ui-primitives')
    }
  })
})

describe('9. Manual Git match: scan, register, and never run on its own', () => {
  const sshTransport = { kind: 'ssh' as const, host: 'example.invalid', remotePort: 3080 }

  it('builds a scan script that prunes caches and hidden dirs and reads origin only', () => {
    const script = buildGitScanScript(['/home/dev', "/home/o'brien"], 4)
    expect(script).toContain("'/home/dev'")
    expect(script).toContain("'/home/o'\\''brien'")
    expect(script).toContain('-maxdepth 5')
    expect(script).toContain("-name 'node_modules'")
    expect(script).toContain("-name '.*' ! -name '.git' -prune")
    expect(script).toContain("-type d -name '.git' -print")
    expect(script).toContain('remote.origin.url')
    // No first-remote fallback: a `nas` backup remote must never define identity.
    expect(script).not.toContain('get-regexp')
  })

  it('derives scan roots from the home plus registered workspace parents', () => {
    const roots = deriveScanRoots('/home/u', ['/home/u/dev/组A/repo', '/home/u/dev/repo-two'])
    expect(roots).toEqual([
      '/home/u',
      '/home/u/dev',
      '/home/u/dev/组A',
    ])
  })

  it('parses remote scan output into normalized repositories', () => {
    const stdout = [
      '__DSH_REPO__\t/home/u/dev/组A/repo-one\tgit@github.com:ORG/Repo-One.git',
      '__DSH_REPO__\t/home/u/dev/repo-two\thttps://github.com/org/repo-two',
      'unstamped noise',
      '__DSH_REPO__\t\t',
      '__DSH_REPO__\t/home/u/dev/local-only\tfile:///tmp/not-a-remote',
    ].join('\n')
    const repos = parseGitScanOutput(stdout)
    const byRemote = new Map(repos.map(repo => [repo.gitRemote, repo]))
    expect(byRemote.get('github.com/org/repo-one')?.path).toBe('/home/u/dev/组A/repo-one')
    expect(byRemote.get('github.com/org/repo-two')?.path).toBe('/home/u/dev/repo-two')
    expect(byRemote.size).toBe(2)
  })

  it('scans grouped repositories, skips worktrees, hidden dirs and node_modules', () => {
    const root = makeTempDir('dsh-md-scan-')
    const writeRepo = (relative: string, origin: string): void => {
      const repo = join(root, relative)
      mkdirSync(join(repo, '.git'), { recursive: true })
      writeFileSync(join(repo, '.git', 'config'), `[remote "origin"]\n\turl = ${origin}\n`)
    }

    writeRepo('组A/repo-one', 'git@github.com:org/repo-one.git')
    writeRepo('组B/repo-two', 'https://github.com/org/repo-two')
    // A nested dependency repository must never be a project.
    writeRepo('组A/repo-one/node_modules/dep', 'git@github.com:dep/dep.git')
    // A worktree pointer is a member of its main project, not a project.
    mkdirSync(join(root, 'repo-one-wt'), { recursive: true })
    writeFileSync(join(root, 'repo-one-wt', '.git'), 'gitdir: /tmp/main/.git/worktrees/wt\n')
    // Hidden directories are tool state (`.wt`, caches), never projects.
    writeRepo('.hidden/repo-four', 'git@github.com:org/repo-four.git')

    const repos = scanLocalGitRepos([root], { maxDepth: 4 })
    expect(repos.map(repo => repo.gitRemote).sort()).toEqual([
      'github.com/org/repo-one',
      'github.com/org/repo-two',
    ])
  })

  it('keeps the shortest path per origin', () => {
    const repos: ScannedRepository[] = [
      { path: '/a/dev/deep/repo', rawOrigin: 'git@github.com:org/repo.git', gitRemote: 'github.com/org/repo' },
      { path: '/a/dev/repo', rawOrigin: 'https://github.com/org/repo.git', gitRemote: 'github.com/org/repo' },
    ]
    expect(primaryRepoByOrigin(repos).get('github.com/org/repo')?.path).toBe('/a/dev/repo')
  })

  it('registers seeds on devices that were missing them and reports the rest', async () => {
    const created: { deviceId: string; path: string }[] = []
    const noted: { deviceId: string; path: string; raw: string }[] = []
    const progress: GitMatchRun[] = []
    const localRepo = makeTempDir('dsh-md-match-')

    const runner = new GitMatchRunner({
      devices: () => [
        {
          deviceId: LOCAL_DEVICE_ID,
          deviceName: 'Local',
          state: 'connected',
          local: true,
          home: localRepo,
          workspacePaths: [],
        },
        {
          deviceId: DeviceId('dev-a'),
          deviceName: 'ubuntu-dev',
          state: 'connected',
          local: false,
          home: '/home/a',
          workspacePaths: ['/home/a/dev/proj-one'],
        },
        {
          deviceId: DeviceId('dev-b'),
          deviceName: 'macos-dev',
          state: 'connected',
          local: false,
          home: '/Users/b',
          workspacePaths: ['/Users/b/dev/proj-two'],
        },
      ],
      discoverRemoteOrigins: async (deviceId) => new Map(
        deviceId === 'dev-a'
          ? [['/home/a/dev/proj-one', 'git@github.com:org/proj-one.git']]
          : [['/Users/b/dev/proj-two', 'https://github.com/org/proj-two.git']],
      ),
      scanRemoteRepos: async (deviceId) => ({
        ok: true,
        repos: deviceId === 'dev-a'
          ? [{ path: '/home/a/dev/proj-two', rawOrigin: 'git@github.com:org/proj-two.git', gitRemote: 'github.com/org/proj-two' }]
          : [{ path: '/Users/b/dev/proj-one', rawOrigin: 'https://github.com/org/proj-one.git', gitRemote: 'github.com/org/proj-one' }],
      }),
      scanLocalRepos: () => [],
      createLocalWorkspace: async () => ({ ok: true }),
      createRemoteWorkspace: async (deviceId, path) => {
        created.push({ deviceId, path })
        return { ok: true }
      },
      noteOrigin: (deviceId, path, raw) => {
        noted.push({ deviceId, path, raw })
      },
      localHome: () => localRepo,
      onProgress: run => {
        progress.push(run)
      },
    })

    const final = await runner.execute()
    expect(final.status).toBe('completed')
    expect(final.createdCount).toBe(2)
    expect(final.alreadyTrackedCount).toBe(2)
    expect(final.notFoundCount).toBe(2)
    expect(final.reports).toHaveLength(3)
    expect(created).toEqual(expect.arrayContaining([
      { deviceId: 'dev-a', path: '/home/a/dev/proj-two' },
      { deviceId: 'dev-b', path: '/Users/b/dev/proj-one' },
    ]))
    expect(noted).toEqual(expect.arrayContaining([
      { deviceId: 'dev-b', path: '/Users/b/dev/proj-one', raw: 'https://github.com/org/proj-one.git' },
    ]))
    expect(progress[0]?.status).toBe('running')
    expect(progress.some(run => run.phase === 'scanning')).toBe(true)
    expect(progress.at(-1)?.phase).toBe('finished')
    expect(final.finishedAt).toBeTypeOf('number')
    expect(runner.running).toBe(false)
  })

  it('reports an unreachable device instead of pretending the scan succeeded', async () => {
    const progress: GitMatchRun[] = []
    const runner = new GitMatchRunner({
      devices: () => [
        {
          deviceId: LOCAL_DEVICE_ID,
          deviceName: 'Local',
          state: 'connected',
          local: true,
          home: '/home/u',
          workspacePaths: ['/home/u/dev/repo'],
        },
        {
          deviceId: DeviceId('dev-offline'),
          deviceName: 'arch-dev',
          state: 'error',
          local: false,
          workspacePaths: [],
        },
      ],
      discoverRemoteOrigins: async () => new Map(),
      scanRemoteRepos: async () => ({ ok: false, error: 'ssh: connect to host arch-dev: No route to host' }),
      scanLocalRepos: () => [],
      createLocalWorkspace: async () => ({ ok: true }),
      createRemoteWorkspace: async () => ({ ok: true }),
      noteOrigin: () => {},
      localHome: () => '/home/u',
      onProgress: run => {
        progress.push(run)
      },
      now: () => 1_700_000_000_000,
    })

    const final = await runner.execute()
    expect(final.status).toBe('completed')
    expect(final.createdCount).toBe(0)
    const offline = final.reports.find(report => report.deviceId === 'dev-offline')
    expect(offline?.error).toContain('Device is not connected')
    expect(progress.length).toBeGreaterThan(0)
  })

  it('stops between steps when cancelled', async () => {
    let runner: GitMatchRunner
    const progress: GitMatchRun[] = []
    runner = new GitMatchRunner({
      devices: () => [
        { deviceId: LOCAL_DEVICE_ID, deviceName: 'Local', state: 'connected', local: true, home: '/home/u', workspacePaths: [] },
        { deviceId: DeviceId('dev-a'), deviceName: 'ubuntu-dev', state: 'connected', local: false, workspacePaths: [] },
      ],
      discoverRemoteOrigins: async () => new Map(),
      scanRemoteRepos: async () => ({ ok: true, repos: [] }),
      scanLocalRepos: () => [],
      createLocalWorkspace: async () => ({ ok: true }),
      createRemoteWorkspace: async () => ({ ok: true }),
      noteOrigin: () => {},
      localHome: () => '/home/u',
      onProgress: run => {
        progress.push(run)
        if (run.phase === 'scanning') runner.cancel()
      },
    })

    const final = await runner.execute()
    expect(final.status).toBe('cancelled')
    expect(final.phase).toBe('finished')
    expect(progress.at(-1)?.status).toBe('cancelled')
  })

  it('starts idle so nothing scans or registers before the user clicks', () => {
    expect(createIdleGitMatch()).toMatchObject({
      status: 'idle',
      createdCount: 0,
      totalDevices: 0,
      totalProjects: 0,
      reports: [],
    })
    expect(titleFromPath('/home/u/dev/组A/repo-one')).toBe('repo-one')
  })

  it('passes the resolved identity to one-shot SSH commands', async () => {
    const calls: { command: string; args: string[] }[] = []
    setSshSpawn((command, args) => {
      calls.push({ command, args: [...args] })
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
        stdout.emit('data', Buffer.from('__DSH_GIT_0__\tgit@github.com:org/repo.git\n'))
        proc.emit('close', 0)
      })
      return proc as never
    })
    try {
      const res = await execSshCommand(
        { ...sshTransport, host: 'macos-dev', privateKeyPath: '~/.ssh/macos-dev' },
        'git -C /Users/b/dev/repo config --get remote.origin.url',
        1000,
      )
      expect(res.ok).toBe(true)
      const args = calls[0]?.args ?? []
      expect(args).toContain('-i')
      expect(args).toContain('IdentitiesOnly=yes')
      expect(args.at(-1)).toContain('remote.origin.url')
    } finally {
      setSshSpawn(null)
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

  it('decides pane visibility conservatively and never covers a local session', () => {
    const base = {
      id: DeviceId('dev-a'),
      name: 'device A',
      enabled: true,
      state: 'connected',
      transportKind: 'ssh',
      targetSummary: 'ssh://a',
      keepNativeAlive: true,
      protocolVersion: '0.2',
      realtime: true,
      reconnectAttempt: 0,
      sessionCount: 1,
      runningSessionCount: 0,
      pendingApprovalCount: 0,
      workspaceCount: 1,
    } as DeviceView
    const target = nativePaneTarget('aggregated', encodeRemoteSessionId(DeviceId('dev-a'), 'rsess-1'))
    expect(target).toEqual({ deviceId: 'dev-a', rawSessionId: 'rsess-1' })
    expect(nativePaneTarget('native', encodeRemoteSessionId(DeviceId('dev-a'), 'rsess-1'))).toBeUndefined()
    expect(nativePaneTarget('aggregated', 'lsess-1')).toBeUndefined()

    const ready = { ...base, nativePaneState: 'ready', nativePaneSessionId: 'rsess-1' } as DeviceView
    expect(shouldShowNativePane({ enabled: true, target, device: ready, geometryReady: true })).toBe(true)
    expect(shouldShowNativePane({ enabled: false, target, device: ready, geometryReady: true })).toBe(false)
    expect(shouldShowNativePane({ enabled: true, target, device: ready, geometryReady: false })).toBe(false)
    expect(shouldShowNativePane({
      enabled: true,
      target,
      device: { ...ready, nativePaneSessionId: 'other' },
      geometryReady: true,
    })).toBe(false)
    expect(shouldShowNativePane({
      enabled: true,
      target,
      device: { ...ready, state: 'error', nativePaneState: 'failed' },
      geometryReady: true,
    })).toBe(true)
    expect(shouldShowNativePane({
      enabled: true,
      target,
      device: { ...base, state: 'error' },
      geometryReady: true,
    })).toBe(true)
    expect(shouldShowNativePane({
      enabled: true,
      target,
      device: { ...ready, state: 'connected', nativePaneState: 'failed' },
      geometryReady: true,
    })).toBe(false)
    expect(shouldShowNativePane({
      enabled: true,
      target,
      device: { ...ready, authState: 'required', nativePaneState: 'idle' },
      geometryReady: true,
    })).toBe(true)
  })

  it('ends a follow stream normally only after the opening frame', () => {
    expect(shouldEndFollowStream(new Error('closed'), false, false)).toBe(false)
    expect(shouldEndFollowStream(new Error('closed'), true, false)).toBe(true)
    expect(shouldEndFollowStream(
      Object.assign(new Error('cancelled'), { code: 'gateway/cancelled' }),
      true,
      true,
    )).toBe(true)
    expect(shouldEndFollowStream(
      Object.assign(new Error('not found'), { code: 'session/not-found' }),
      true,
      true,
    )).toBe(false)
  })

  it('reuses a blank only on the device that owns it', () => {
    const devA = DeviceId('dev-a')
    const devB = DeviceId('dev-b')
    expect(reusableSessionIdFor(encodeRemoteSessionId(devA, 'rsess-1'), devA)).toBe('rsess-1')
    expect(reusableSessionIdFor(encodeRemoteSessionId(devA, 'rsess-1'), devB)).toBeUndefined()
    expect(reusableSessionIdFor('lsess-1', LOCAL_DEVICE_ID)).toBe('lsess-1')
    expect(reusableSessionIdFor(undefined, devA)).toBeUndefined()
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

      proxy.openSession('rsess-2')
      await waitForCondition(() => messages.some(message => message.type === 'open-session' && message.sessionId === 'rsess-2'))
    } finally {
      ws?.close()
      proxy.stop()
      await new Promise<void>(resolve => upstream.close(() => resolve()))
    }
  })

  it('wires bridge readiness, selection and open commands into the Host snapshot', async () => {
    const dir = makeTempDir('dsh-md-pane-')
    const registry = new DeviceRegistry(
      join(dir, 'devices.json'),
      join(dir, 'secrets.json'),
      {
        localPort: () => 3080,
        localWorkspaces: () => [],
        localSessionUpdatedAt: () => new Map(),
      },
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

      const namespaced = encodeRemoteSessionId(deviceId, 'rsess-1')
      registry.setActiveSession(namespaced, 1)
      await waitForCondition(
        () => messages.some(message => message.type === 'open-session' && message.sessionId === 'rsess-1'),
      )
      await waitForCondition(
        () => messages.some(message => message.type === 'set-embedded' && message.enabled === true),
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

  it('persists the nativePane preference with a true default', async () => {
    const dir = makeTempDir('dsh-md-pane-pref-')
    const dataFile = join(dir, 'devices.json')
    const first = new DeviceRegistry(
      dataFile,
      join(dir, 'secrets.json'),
      {
        localPort: () => 3080,
        localWorkspaces: () => [],
        localSessionUpdatedAt: () => new Map(),
      },
      { allowDirectTransport: true },
    )
    expect(first.ui().nativePane).toBe(true)
    const plane = new MultiDeviceControlPlane(first)
    const toggled = await plane.dispatch({
      action: 'setUiPreferences',
      payload: { nativePane: false },
    })
    expect(toggled.ok).toBe(true)
    expect((toggled as { value: MultiDeviceSnapshot }).value.ui?.nativePane).toBe(false)
    first.dispose()

    const second = new DeviceRegistry(
      dataFile,
      join(dir, 'secrets.json'),
      {
        localPort: () => 3080,
        localWorkspaces: () => [],
        localSessionUpdatedAt: () => new Map(),
      },
      { allowDirectTransport: true },
    )
    try {
      expect(second.ui().nativePane).toBe(false)
    } finally {
      second.dispose()
    }
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
    const sessions = {
      list: {
        getSnapshot: () => ({ byId: {} }),
        subscribe: () => () => {},
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

    socket.emit('message', { data: JSON.stringify({ type: 'read-state', unreadSessionIds: ['rsess-1'] }) })
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    expect(sentMessages().some(message => message.type === 'read' && message.sessionId === 'rsess-1')).toBe(true)
    expect(statusSource.getSnapshot().get('rsess-1')?.completionUnread).toBe(false)

    groupCalls.length = 0
    socket.emit('message', { data: JSON.stringify({ type: 'group-expansion', groups: { 'ws-2': true } }) })
    expect(groupCalls).toContainEqual({ key: 'ws-2', expanded: true })

    expect(() => socket.emit('message', { data: JSON.stringify({ type: 'set-embedded', enabled: true }) })).not.toThrow()
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
  it('prevents double-namespacing and rejects already-namespaced session/workspace/event IDs', () => {
    const devA = DeviceId('dev-a')
    const devB = DeviceId('dev-b')
    const onceSession = encodeRemoteSessionId(devA, 'sess-1')
    expect(isNamespacedSessionId(onceSession)).toBe(true)
    expect(isNamespacedSessionId('sess-1')).toBe(false)
    // Encoding an already-namespaced session ID is a no-op (never creates md~dev-b~md~dev-a~sess-1)
    expect(encodeRemoteSessionId(devB, onceSession)).toBe(onceSession)
    // Double-prefixed session IDs are rejected by decodeSessionId
    expect(decodeSessionId(`md~dev-b~${onceSession}`).isRemote).toBe(false)

    const onceWs = encodeRemoteWorkspaceId(devA, 'ws-1')
    const logicalWs = encodeLogicalWorkspaceId('git', 'github.com/org/repo')
    expect(isNamespacedWorkspaceId(onceWs)).toBe(true)
    expect(isNamespacedWorkspaceId(logicalWs)).toBe(true)
    expect(encodeRemoteWorkspaceId(devB, onceWs)).toBe(onceWs)
    expect(decodeRemoteWorkspaceId(`md-ws~dev-b~${onceWs}`).isRemote).toBe(false)

    const onceEv = encodeRemoteEventId(devA, 'ev-1')
    expect(isNamespacedEventId(onceEv)).toBe(true)
  })

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

  it('aligns loopback proxy URLs to the current page hostname (localhost vs 127.0.0.1)', () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost' } })
    try {
      expect(resolveSameSiteProxyUrl('http://127.0.0.1:41234/?md_token=abc')).toBe(
        'http://localhost:41234/?md_token=abc',
      )
      vi.stubGlobal('window', { location: { hostname: '127.0.0.1' } })
      expect(resolveSameSiteProxyUrl('http://localhost:41234/?md_token=abc')).toBe(
        'http://127.0.0.1:41234/?md_token=abc',
      )
    } finally {
      vi.unstubAllGlobals()
    }
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

  it('normalizes remote POSIX scan roots without corrupting them on Windows-style path inputs', () => {
    const roots = deriveScanRoots('/home/dev', ['/home/dev/work/proj-a', '/home/dev/work/proj-b'])
    expect(roots).toEqual(['/home/dev', '/home/dev/work'])
    const winRoots = deriveScanRoots('C:\\Users\\dev', ['C:\\Users\\dev\\work\\proj-a'])
    expect(winRoots).toEqual(['C:\\Users\\dev', 'C:\\Users\\dev\\work'])
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

  it('routes userQuestions/attachWait and userQuestions/answer and downgrades local session/not-found waterfall errors to next', async () => {
    const dir = makeTempDir('dsh-md-uq-')
    const reg = new DeviceRegistry(
      join(dir, 'reg.json'),
      join(dir, 'sec.json'),
      {
        localPort: () => 3080,
        localWorkspaces: () => [],
        localSessionUpdatedAt: () => new Map(),
      },
      { enableTunnels: false, enableNativeProxy: false },
    )
    const devId = DeviceId('dev-q')
    const fakeClient = {
      id: devId,
      deviceConfig: { id: devId, name: 'QHost', enabled: true, transport: { kind: 'ssh', host: 'q' }, auth: { mode: 'auto' } },
      isConnected: () => true,
      toView: () => ({ id: devId, name: 'QHost', state: 'connected', reconnectAttempt: 0 }),
      sessionSummaries: () => [],
      workspaceItems: () => [],
      archivedIds: () => [],
      pinnedIds: () => [],
      controlProjections: () => new Map(),
      pendingInteractionList: () => [],
      openStream: async function* (endpoint: string, args: Record<string, unknown>) {
        yield { endpoint, args, remainingMs: 120_000 }
      },
      invokeUnary: async (ns: string, method: string, args: Record<string, unknown>) => ({
        ns,
        method,
        args,
        accepted: true,
      }),
      respondWaterfall: vi.fn(async () => ({ ok: true })),
      catalogSnapshot: () => ({
        deviceId: devId,
        syncedAt: 0,
        protocolVersion: '0.2',
        sessions: [],
        workspaces: [],
        archivedSessionIds: [],
        pinnedSessionIds: [],
      }),
      stop: () => {},
    }
    ;(reg as unknown as { clients: Map<DeviceId, unknown> }).clients.set(devId, fakeClient)

    const sessionCtrl: SessionControllerLike = {
      list: async () => ({ items: [] }),
      search: async () => ({ items: [], hasMore: false }),
      create: async () => ({ sessionId: 'l-1' }),
      selectModel: async () => ({ selected: {} }),
      modelCatalog: async () => ({}),
      rename: async () => ({ title: 't', seq: 1 }),
      fork: async () => ({ sessionId: 'l-2' }),
      prompt: async () => ({ accepted: true }),
      attachment: async () => ({}),
      updateQueue: async () => ({ accepted: true }),
      cancel: () => ({ accepted: true }),
      page: async () => ({ records: [], hasMore: false }),
      follow: async function* () {},
      projections: async () => null,
      control: async function* () {},
    }
    const wsCtrl: WorkspaceControllerLike = {
      create: async () => ({ workspace: {}, created: true }),
      rename: async () => ({ workspace: {} }),
      delete: async () => ({ deleted: true }),
      insertBefore: async () => ({ workspaceIds: [] }),
      insertSessionBefore: async () => ({ workspace: {} }),
      archiveSession: async () => ({ archivedSessionIds: [] }),
      unarchiveSession: async () => ({ archivedSessionIds: [] }),
      pinSession: async () => ({ pinnedSessionIds: [] }),
      unpinSession: async () => ({ pinnedSessionIds: [] }),
      follow: async function* () {},
    }
    const gw: TypertGatewayLike = {
      wireStream: {
        open: async () => (async function* () {})(),
        failure: () => ({ code: 'err', message: 'err', details: {} }),
      },
      dispatchRpc: async () => ({ ok: true, value: 'local' }),
    }

    const dispose = installAggregatedGateway02(reg, sessionCtrl, wsCtrl, gw)
    try {
      const waitStream = await gw.wireStream.open(
        'userQuestions/attachWait',
        { args: { agent: encodeRemoteSessionId(devId, 'raw-sess-9'), callId: 'call-1' } },
        (async function* () {})(),
        undefined,
        new AbortController().signal,
      )
      const waitFrames: unknown[] = []
      for await (const f of waitStream) waitFrames.push(f)
      expect(waitFrames).toEqual([
        {
          endpoint: 'userQuestions/attachWait',
          args: { agent: 'raw-sess-9', callId: 'call-1' },
          remainingMs: 120_000,
        },
      ])

      const ansRes = await gw.dispatchRpc!(
        'userQuestions/answer',
        { args: { agent: encodeRemoteSessionId(devId, 'raw-sess-9'), callId: 'call-1', answers: [] } },
        new AbortController().signal,
        undefined,
      )
      expect(ansRes.ok).toBe(true)
      expect(ansRes.value).toMatchObject({
        ns: 'userQuestions',
        method: 'answer',
        args: { agent: 'raw-sess-9', callId: 'call-1', answers: [] },
      })

      // Local mirror `session/not-found` rejection must be downgraded to `{ kind: 'next' }`
      const wfRes = await gw.dispatchRpc!(
        '$events/result',
        {
          args: {
            clientId: 'c1',
            eventId: encodeRemoteEventId(devId, 'ev-77'),
            outcome: {
              kind: 'rejected',
              error: { name: 'RemoteError', code: 'session/not-found', message: 'not found' },
            },
          },
        },
        new AbortController().signal,
        undefined,
      )
      expect(wfRes.ok).toBe(true)
      expect(fakeClient.respondWaterfall).toHaveBeenCalledWith(
        'ev-77',
        { kind: 'next' },
        expect.anything(),
      )
    } finally {
      dispose()
      reg.dispose()
    }
  })

  it('notifies workspace listeners on setPreferredDevice, setMemberExcluded, setCustomTitle, and manual rules', async () => {
    const dir = makeTempDir('dsh-md-cp-wake-')
    const reg = new DeviceRegistry(
      join(dir, 'reg.json'),
      join(dir, 'sec.json'),
      {
        localPort: () => 3080,
        localWorkspaces: () => [],
        localSessionUpdatedAt: () => new Map(),
      },
      { enableTunnels: false, enableNativeProxy: false },
    )
    let workspaceWakes = 0
    reg.onWorkspacesChanged(() => { workspaceWakes += 1 })
    const cp = new MultiDeviceControlPlane(reg)
    try {
      await cp.dispatch({
        action: 'setPreferredDevice',
        payload: { logicalWorkspaceId: 'md-lws~git~github.com/org/repo', deviceId: 'dev-1' },
      })
      expect(workspaceWakes).toBe(1)
      await cp.dispatch({
        action: 'setMemberExcluded',
        payload: { memberKey: 'dev-1:/repo', excluded: true },
      })
      expect(workspaceWakes).toBe(2)
      await cp.dispatch({
        action: 'setCustomTitle',
        payload: { logicalWorkspaceId: 'md-lws~git~github.com/org/repo', title: 'Custom' },
      })
      expect(workspaceWakes).toBe(3)
      await cp.dispatch({
        action: 'upsertManualRule',
        payload: { id: 'r1', title: 'Rule 1', memberKeys: ['dev-1:/repo'] },
      })
      expect(workspaceWakes).toBe(4)
      await cp.dispatch({
        action: 'removeManualRule',
        payload: { ruleId: 'r1' },
      })
      expect(workspaceWakes).toBe(5)
    } finally {
      reg.dispose()
    }
  })
})


describe('0d. Unread counters for Native tabs and Aggregated rows', () => {
  /** Minimal logical workspace fixture; nesting only depends on path + sessionIds. */
  function logicalWorkspace(
    id: string,
    path: string,
    sessionIds: readonly string[],
  ): LogicalWorkspaceView {
    return {
      logicalWorkspaceId: id,
      title: id,
      kind: 'single',
      targetDeviceId: DeviceId('dev-a'),
      targetPath: path,
      effectiveTargetDeviceId: DeviceId('dev-a'),
      effectiveTargetPath: path,
      effectiveTargetOnline: true,
      members: [],
      sessionIds,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
  }

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
    expect(unreadCountForDevice(new Set(), LOCAL_DEVICE_ID)).toBe(0)
  })

  it('counts only Session IDs that belong to a workspace', () => {
    const unread = new Set(['s-1', 's-2', 's-9'])
    expect(unreadCountInSessions(unread, ['s-1', 's-3'])).toBe(1)
    expect(unreadCountInSessions(unread, [])).toBe(0)
    expect(unreadCountInSessions(new Set(), ['s-1'])).toBe(0)
  })

  it('rolls unread counts up through nested workspaces', () => {
    const workspaces = [
      logicalWorkspace('ws-parent', '/srv/repo', ['s-parent']),
      logicalWorkspace('ws-child', '/srv/repo/packages/app', ['s-child']),
      logicalWorkspace('ws-grandchild', '/srv/repo/packages/app/tests', ['s-grandchild']),
      logicalWorkspace('ws-lookalike', '/srv/repo-2', ['s-lookalike']),
    ]
    const unread = new Set(['s-child', 's-grandchild', 's-lookalike'])
    const counts = workspaceUnreadCounts(workspaces, unread)
    expect(counts.get('ws-parent')).toBe(2)
    expect(counts.get('ws-child')).toBe(2)
    expect(counts.get('ws-grandchild')).toBe(1)
    // `/srv/repo-2` is a sibling directory, not a descendant of `/srv/repo`.
    expect(counts.get('ws-lookalike')).toBe(1)
  })

  it('matches DSH folder semantics for trailing separators and Windows paths', () => {
    const workspaces = [
      logicalWorkspace('ws-root', 'C:\\work\\repo\\', ['s-root']),
      logicalWorkspace('ws-app', 'C:/work/repo/app', ['s-app']),
      logicalWorkspace('ws-posix', '/home/dev/repo/', ['s-posix']),
      logicalWorkspace('ws-posix-app', '/home/dev/repo/app', ['s-posix-app']),
    ]
    const counts = workspaceUnreadCounts(workspaces, new Set(['s-app', 's-posix', 's-posix-app']))
    expect(counts.get('ws-root')).toBe(1)
    expect(counts.get('ws-app')).toBe(1)
    expect(counts.get('ws-posix')).toBe(2)
    expect(counts.get('ws-posix-app')).toBe(1)
  })

  it('returns an empty rollup when nothing is unread', () => {
    const workspaces = [logicalWorkspace('ws-1', '/srv/repo', ['s-1'])]
    expect(workspaceUnreadCounts(workspaces, new Set()).size).toBe(0)
    expect(workspaceUnreadCounts([], new Set(['s-1'])).size).toBe(0)
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
        enabled: false,
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
      { allowDirectTransport: true, enableNativeProxy: false },
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
      { allowDirectTransport: true, enableNativeProxy: false },
    )
    try {
      expect(registry.snapshot().archivedSessionIds).toEqual([])
      expect(registry.snapshot().subagentSessionIds).toEqual([])
    } finally {
      registry.dispose()
    }
  })
})

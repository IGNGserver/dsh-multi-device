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
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  LOCAL_DEVICE_ID,
  normalizeGitRemote,
  normalizeWorkspacePath,
} from '../src/contract.ts'
import {
  DeviceAuthManager,
  dshCookieName,
  extractLaunchToken,
  mintDshBrowserCookie,
  parseSigningSecretFromCredentialsYaml,
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
  deviceCatalogGroupId,
  installAggregatedGateway02,
  isSameDeviceChildSession,
  mergeModelCatalog,
  type ModelCatalogLike,
  stripDeviceCatalogPrefix,
  type SessionControllerLike,
  type TypertGatewayLike,
  type WorkspaceControllerLike,
} from '../src/host/gateway.ts'
import { requestRemote } from '../src/host/http-request.ts'
import { NativeDeviceProxy } from '../src/host/native-proxy.ts'
import { DeviceRegistry } from '../src/host/registry.ts'
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
  hostKeyMatchesKnownHostsLine,
} from '../src/host/tunnel.ts'
import {
  classifyRemoteProtocol,
  pendingInteractionKind,
  protocolGeneration,
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
    expect(singleMac.title).toBe('[mac-mini] other-tool')

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

describe('5. End-to-End Integration: Remote DSH 0.2 Server, Aggregated Gateway, & Native Proxy', () => {
  it('connects to a simulated remote DSH 0.2 server, aggregates sessions & workspaces, routes prompts/approvals, and serves Native Mode via reverse proxy', async () => {
    const dir = makeTempDir('dsh-md-e2e-')

    // Spin up a mock remote DSH 0.2 HTTP + WebSocket server
    const remotePrompts: unknown[] = []
    const remoteApprovalResults: unknown[] = []
    let pushRemoteEvent: ((frame: unknown) => void) | undefined

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
                        sessionIds: ['rsess-1'],
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

      const disposeGateway = installAggregatedGateway02(
        registry,
        mockSessionController,
        mockWorkspaceController,
        mockGateway,
      )

      // 1) Merged session.list
      const listed = await mockSessionController.list({}, new AbortController().signal)
      expect(listed.items.map(i => i.sessionId)).toEqual([
        encodeRemoteSessionId(devId, 'rsess-1'),
        'lsess-1',
      ])

      // 1b) The model catalog exposes remote-only models alongside local ones.
      const catalog = (await mockSessionController.modelCatalog()) as {
        groups: { id: string; models: { id: string }[] }[]
        routableProviders: string[]
      }
      const remoteGroupId = deviceCatalogGroupId(devId, 'remote-provider')
      expect(catalog.groups.map(group => group.id)).toContain(remoteGroupId)
      expect(catalog.groups.find(group => group.id === remoteGroupId)?.models.map(m => m.id))
        .toContain('remote-only-model')
      expect(catalog.routableProviders).toContain(remoteGroupId)

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

  it('keeps same-named providers from different devices separate', () => {
    const catalog = (model: string): ModelCatalogLike => ({
      default: {},
      routableProviders: ['openai'],
      groups: [{ id: 'openai', name: 'OpenAI', models: [{ id: model, name: model }] }],
      failures: [],
    })
    const merged = mergeModelCatalog(catalog('local-model'), [
      { deviceId: DeviceId('dev-a'), deviceName: 'Device A', catalog: catalog('a-model') },
      { deviceId: DeviceId('dev-b'), deviceName: 'Device B', catalog: catalog('b-model') },
    ])
    expect(merged.groups.map(group => group.id)).toEqual([
      'openai',
      deviceCatalogGroupId(DeviceId('dev-a'), 'openai'),
      deviceCatalogGroupId(DeviceId('dev-b'), 'openai'),
    ])
    expect(merged.groups[1]?.models.map(model => model.id)).toEqual(['a-model'])
    expect(merged.groups[2]?.models.map(model => model.id)).toEqual(['b-model'])
    expect(merged.routableProviders).toContain(deviceCatalogGroupId(DeviceId('dev-a'), 'openai'))
    expect(merged.routableProviders).toContain(deviceCatalogGroupId(DeviceId('dev-b'), 'openai'))
    expect(
      stripDeviceCatalogPrefix(deviceCatalogGroupId(DeviceId('dev-a'), 'openai'), DeviceId('dev-a')),
    ).toBe('openai')
    expect(stripDeviceCatalogPrefix('openai', DeviceId('dev-a'))).toBe('openai')
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
    const { zh } = await import('../src/client/locales.ts')
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

      // Overlay bar stays hidden when 0 devices are configured in Aggregated Mode
      const overlayReg = registeredSlots.get('shell.overlay:multi-device-switcher')
      expect(overlayReg).toBeDefined()
      const overlayEmptyHtml = renderToStaticMarkup(
        React.createElement(overlayReg!.component as React.ComponentType<any>, { t: (k: keyof typeof zh) => zh[k] }),
      )
      expect(overlayEmptyHtml).not.toContain('dsh-md-overlay-bar')

      // Context menu item renders official MenuItemButton
      const menuReg = registeredSlots.get('sidebar.workspaces.session.menu.item:multi-device-open-native')
      expect(menuReg).toBeDefined()
      const menuHtml = renderToStaticMarkup(
        React.createElement(menuReg!.component as React.ComponentType<any>, {
          sessionId: encodeRemoteSessionId(DeviceId('dev-a'), 'sess-1'),
          useMenuOpenState: () => [true, () => {}] as const,
          t: (k: keyof typeof zh) => zh[k],
        }),
      )
      expect(menuHtml).toContain('data-primitive="MenuItemButton"')
    } finally {
      for (const dispose of disposers) dispose()
      vi.doUnmock('@deepseek-ai/dsh-client-ui-primitives')
    }
  })
})


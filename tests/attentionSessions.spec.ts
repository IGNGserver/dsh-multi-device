/**
 * Pure joins behind the attention menu: a Session ID becomes a readable row
 * without the Host sending titles, and every lookup degrades on its own.
 */
import { describe, expect, it } from 'vitest'
import {
  DeviceId,
  encodeRemoteSessionId,
  LOCAL_DEVICE_ID,
  type MultiDeviceSnapshot,
} from '../src/contract.ts'
import {
  pathBasename,
  relativeAge,
  resolveAttentionSession,
  resolveAttentionSessions,
} from '../src/client/attentionSessions.ts'

const deviceId = DeviceId('dev-a')
const remoteId = encodeRemoteSessionId(deviceId, 'raw-1')

function snapshot(patch: Partial<Record<string, unknown>> = {}): MultiDeviceSnapshot {
  return {
    revision: 1,
    devices: [{ id: deviceId, name: 'ubuntu-dev', state: 'connected' }],
    catalog: { schema: 1, revision: 1, issues: {}, pinnedSessionIds: [], sessions: {} },
    logicalWorkspaces: [],
    allPhysicalWorkspaces: [],
    sessionOrigins: {},
    unreadSessionIds: [],
    readCompletions: [],
    archivedSessionIds: [],
    subagentSessionIds: [],
    sshConfigHosts: [],
    attentionByDevice: {},
    ...patch,
  } as unknown as MultiDeviceSnapshot
}

const options = { localDeviceName: '本机', now: 1_000_000 }

describe('attention Session join', () => {
  it('prefers the Host catalog title, then the live store, then nothing', () => {
    const withCatalog = snapshot({
      catalog: {
        schema: 1, revision: 1, issues: {}, pinnedSessionIds: [],
        sessions: { [remoteId]: { id: remoteId, rawSessionId: 'raw-1', deviceId, title: ' 重构聚合后端 ', updatedAt: 1, running: true, blank: false, stale: false } },
      },
    })
    expect(resolveAttentionSession(remoteId, withCatalog, options).title).toBe('重构聚合后端')

    const storeTitle = (id: string): string | undefined => (id === remoteId ? '来自会话库' : undefined)
    expect(resolveAttentionSession(remoteId, snapshot(), { ...options, title: storeTitle }).title).toBe('来自会话库')

    const unknown = resolveAttentionSession(remoteId, snapshot(), options)
    expect(unknown.title).toBe('')
    expect(unknown.rawSessionId).toBe('raw-1')
  })

  it('names the workspace from the aggregated projection, then the path basename', () => {
    const workspace = {
      logicalWorkspaceId: 'logical-1', title: 'DSH多设备插件', kind: 'git', targetDeviceId: deviceId,
      targetPath: '/p', effectiveTargetDeviceId: deviceId, effectiveTargetPath: '/p',
      effectiveTargetOnline: true, members: [], sessionIds: [remoteId], createdAt: '', updatedAt: '',
    }
    const withWorkspace = snapshot({ logicalWorkspaces: [workspace] })
    expect(resolveAttentionSession(remoteId, withWorkspace, options).workspace).toBe('DSH多设备插件')

    const fromPath = snapshot({
      catalog: {
        schema: 1, revision: 1, issues: {}, pinnedSessionIds: [],
        sessions: { [remoteId]: { id: remoteId, rawSessionId: 'raw-1', deviceId, title: 't', updatedAt: 1, running: false, blank: false, stale: false, cwd: '/home/me/other-project' } },
      },
    })
    expect(resolveAttentionSession(remoteId, fromPath, options).workspace).toBe('other-project')
  })

  it('reports the owning device and keeps local Sessions on this machine', () => {
    const withOrigin = snapshot({
      sessionOrigins: {
        [remoteId]: {
          namespacedSessionId: remoteId, rawSessionId: 'raw-1', deviceId,
          deviceName: 'ubuntu-dev', deviceState: 'connected', running: true,
        },
      },
    })
    const remote = resolveAttentionSession(remoteId, withOrigin, options)
    expect(remote.deviceName).toBe('ubuntu-dev')
    expect(remote.deviceId).toBe(deviceId)

    const local = resolveAttentionSession('local-session', withOrigin, options)
    expect(local.deviceId).toBe(LOCAL_DEVICE_ID)
    expect(local.deviceName).toBe('本机')
    expect(local.rawSessionId).toBe('local-session')
  })

  it('never throws away a row whose device disappeared', () => {
    const rows = resolveAttentionSessions([remoteId, 'local-session'], snapshot(), options)
    expect(rows.map(row => row.sessionId)).toEqual([remoteId, 'local-session'])
    expect(rows[0]?.deviceName).toBe('本机')
  })

  it('derives a coarse relative age', () => {
    const now = 10 * 86_400_000
    expect(relativeAge(undefined, now)).toBeUndefined()
    expect(relativeAge(now - 1_000, now)).toEqual({ unit: 'now' })
    expect(relativeAge(now - 5 * 60_000, now)).toEqual({ unit: 'minutes', n: 5 })
    expect(relativeAge(now - 3 * 3_600_000, now)).toEqual({ unit: 'hours', n: 3 })
    expect(relativeAge(now - 2 * 86_400_000, now)).toEqual({ unit: 'days', n: 2 })
  })

  it('reads the last path segment for both separators', () => {
    expect(pathBasename('/home/me/project/')).toBe('project')
    expect(pathBasename('C:\\work\\project')).toBe('project')
    expect(pathBasename('/')).toBeUndefined()
    expect(pathBasename(undefined)).toBeUndefined()
  })
})

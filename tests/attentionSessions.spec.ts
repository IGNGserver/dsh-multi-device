/**
 * Pure joins behind the attention menu: a Session ID becomes a readable row
 * without the Host sending titles, and every lookup degrades on its own.
 *
 * Since 0.3.0 the Host projects no cross-device catalog into the local
 * snapshot, so this join only knows identity plus whatever the browser's own
 * Session store can resolve.
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
  resolveAttentionSession,
  resolveAttentionSessions,
  resolveAttentionTitle,
} from '../src/client/attentionSessions.ts'

const deviceId = DeviceId('dev-a')
const remoteId = encodeRemoteSessionId(deviceId, 'raw-1')

function snapshot(patch: Partial<Record<string, unknown>> = {}): MultiDeviceSnapshot {
  return {
    revision: 1,
    devices: [{ id: deviceId, name: 'ubuntu-dev', state: 'connected' }],
    unreadSessionIds: [],
    readCompletions: {},
    archivedSessionIds: [],
    subagentSessionIds: [],
    sshConfigHosts: [],
    attentionByDevice: {},
    ...patch,
  } as unknown as MultiDeviceSnapshot
}

const options = { localDeviceName: '本机', owningDeviceName: 'ubuntu-dev' }

describe('attention Session join', () => {
  it('uses a live title when the browser has one and degrades to the raw id otherwise', () => {
    const storeTitle = (id: string): string | undefined => (id === remoteId ? '来自会话库' : undefined)
    expect(resolveAttentionSession(remoteId, snapshot(), { ...options, title: storeTitle }).title).toBe('来自会话库')

    const unknown = resolveAttentionSession(remoteId, snapshot(), options)
    expect(unknown.title).toBe('')
    expect(unknown.rawSessionId).toBe('raw-1')
    expect(unknown.sessionId).toBe(remoteId)
  })

  it('reports the owning device and keeps local Sessions on this machine', () => {
    const remote = resolveAttentionSession(remoteId, snapshot(), options)
    expect(remote.deviceName).toBe('ubuntu-dev')
    expect(remote.deviceId).toBe(deviceId)

    const local = resolveAttentionSession('local-session', snapshot(), options)
    expect(local.deviceId).toBe(LOCAL_DEVICE_ID)
    expect(local.deviceName).toBe('本机')
    expect(local.rawSessionId).toBe('local-session')
  })

  it('never throws away a row whose device disappeared', () => {
    const rows = resolveAttentionSessions([remoteId, 'local-session'], snapshot({ devices: [] }), options)
    expect(rows.map(row => row.sessionId)).toEqual([remoteId, 'local-session'])
    // The tab that renders the menu already knows which device it belongs to.
    expect(rows[0]?.deviceName).toBe('ubuntu-dev')
    expect(rows[1]?.deviceName).toBe('本机')
  })

  it('reads the last path segment for both separators', () => {
    expect(pathBasename('/home/me/project/')).toBe('project')
    expect(pathBasename('C:\\work\\project')).toBe('project')
    expect(pathBasename('/')).toBeUndefined()
    expect(pathBasename(undefined)).toBeUndefined()
  })
})

describe('attention title resolution', () => {
  it('prefers the live local label, then the durable title, then the Host map', () => {
    const id = remoteId
    expect(resolveAttentionTitle(id, { displayTitle: '本机标签', title: 'durable' }, { [id]: 'host' })).toBe('本机标签')
    expect(resolveAttentionTitle(id, { displayTitle: '   ', title: 'durable' }, { [id]: 'host' })).toBe('durable')
    expect(resolveAttentionTitle(id, undefined, { [id]: ' host ' })).toBe('host')
    expect(resolveAttentionTitle(id, undefined, undefined)).toBeUndefined()
    expect(resolveAttentionTitle(id, {}, { [id]: '   ' })).toBeUndefined()
  })
})

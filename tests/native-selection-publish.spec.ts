/**
 * A selected remote Session has to reach that device's framed page.
 *
 * 0.3.0 retired Aggregated Mode and removed every caller of
 * `publishNativePaneSession` while leaving the method behind. The Host still
 * recorded the selection, so the tab switched and the attention menu looked
 * like it had worked — but no `open-session` command ever reached the device
 * page, so the conversation never opened. These tests pin the wiring rather
 * than the intent.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeviceId, encodeRemoteSessionId } from '../src/contract.ts'
import { collectAttentionSessionTitles, DeviceRegistry } from '../src/host/registry.ts'
import { NativeProxyManager } from '../src/host/native-proxy.ts'

const registries: DeviceRegistry[] = []
afterEach(() => {
  for (const registry of registries.splice(0)) registry.dispose()
  vi.restoreAllMocks()
})

function make(): DeviceRegistry {
  const dir = mkdtempSync(join(tmpdir(), 'native-selection-publish-'))
  const registry = new DeviceRegistry(join(dir, 'state.json'), join(dir, 'secrets.json'), {
    localPort: () => 3080,
    localWorkspaces: () => [],
    localSessionUpdatedAt: () => new Map(),
  }, { enableNativeProxy: false, enableTunnels: false })
  registries.push(registry)
  return registry
}

describe('remote selection publishing', () => {
  it('forwards a changed remote selection to the owning device page', () => {
    const registry = make()
    const openSession = vi.spyOn(NativeProxyManager.prototype, 'openSession')
    const deviceId = DeviceId('dev-a')
    const sessionId = encodeRemoteSessionId(deviceId, 'raw-1')

    expect(registry.setActiveSession(sessionId, 1, 'browser-1')).toBe(true)
    expect(openSession).toHaveBeenCalledWith(deviceId, 'raw-1', 'browser-1', 1)
  })

  it('does not re-publish the selection every snapshot poll', () => {
    const registry = make()
    // The Client reports its current Session again on every poll; replaying
    // `open-session` each time restarts the remote navigation.
    registry.setActiveSession(encodeRemoteSessionId(DeviceId('dev-a'), 'raw-1'), 1, 'browser-1')
    const openSession = vi.spyOn(NativeProxyManager.prototype, 'openSession')

    expect(registry.setActiveSession(encodeRemoteSessionId(DeviceId('dev-a'), 'raw-1'), 2, 'browser-1')).toBe(false)
    expect(openSession).not.toHaveBeenCalled()
  })

  it('keeps a local selection away from every device page', () => {
    const registry = make()
    const openSession = vi.spyOn(NativeProxyManager.prototype, 'openSession')

    expect(registry.setActiveSession('local-1', 1, 'browser-1')).toBe(true)
    expect(openSession).not.toHaveBeenCalled()
  })

  it('drops the left device queued target when the selection moves to another device', () => {
    const registry = make()
    const clearPending = vi.spyOn(NativeProxyManager.prototype, 'clearPendingSession')
    const left = DeviceId('dev-a')

    registry.setActiveSession(encodeRemoteSessionId(left, 'raw-1'), 1, 'browser-1')
    registry.setActiveSession(encodeRemoteSessionId(DeviceId('dev-b'), 'raw-2'), 2, 'browser-1')
    expect(clearPending).toHaveBeenCalledWith(left, 'browser-1')
  })
})

describe('attention Session titles', () => {
  it('collects only remote titles for the Sessions an attention menu can show', () => {
    const deviceA = DeviceId('dev-a')
    const deviceB = DeviceId('dev-b')
    const remoteA = encodeRemoteSessionId(deviceA, 'raw-1')
    const remoteB = encodeRemoteSessionId(deviceB, 'raw-9')

    const titles = collectAttentionSessionTitles({
      local: { runningSessionIds: ['local-1'], pendingSessionIds: [], unreadSessionIds: [] },
      'dev-a': { runningSessionIds: [remoteA], pendingSessionIds: [remoteA], unreadSessionIds: [] },
      'dev-b': { runningSessionIds: [], pendingSessionIds: [], unreadSessionIds: [remoteB] },
    }, deviceId => (String(deviceId) === 'dev-a' ? new Map([['raw-1', '  部署脚本排查  ']]) : undefined))

    // Local conversations are named by the browser store, and a device with no
    // catalog title contributes nothing rather than an empty string.
    expect(titles).toEqual({ [remoteA]: '部署脚本排查' })
  })

  it('asks for one device catalog at most once', () => {
    const lookups: string[] = []
    const remote = encodeRemoteSessionId(DeviceId('dev-a'), 'raw-1')
    collectAttentionSessionTitles({
      'dev-a': { runningSessionIds: [remote], pendingSessionIds: [], unreadSessionIds: [remote] },
    }, (deviceId) => {
      lookups.push(String(deviceId))
      return new Map([['raw-1', 't']])
    })
    expect(lookups).toEqual(['dev-a'])
  })
})

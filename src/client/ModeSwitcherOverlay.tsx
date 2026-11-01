/**
 * Floating Mode Switcher & Sidebar Session Row Enhancements.
 *
 * 1. `ModeSwitcherOverlay`: Mounted in `shell.overlay` (`id: 'multi-device-switcher'`).
 *    - Displays a compact top-right pill bar for 1-click switching between
 *      **Aggregated Mode (聚合模式)** and **Native Mode (原生模式)** plus per-device status dots.
 *    - Always keeps the `NativeViewport` mounted in the DOM (hidden via `display: none` while in
 *      Aggregated Mode) so Native Mode keep-alive pages are NEVER unmounted when switching modes!
 * 2. `SessionRowLeadingBadge`, `SessionRowHoverDeviceSection`, `SessionMenuOpenInNativeItem`:
 *    - Official DSH 0.2 slot contributions for `sidebar.session.row.leading`,
 *      `sidebar.session.row.hover`, and `sidebar.workspaces.session.menu.item`.
 *
 * @module dsh-multi-device/client/ModeSwitcherOverlay
 */
import React from 'react'
import { decodeSessionId } from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { NativeViewport } from './NativeViewport.tsx'
import { clientStore, useMultiDeviceState } from './state.ts'

export function ModeSwitcherOverlay({
  t,
  onOpenHubPanel,
}: {
  t: (key: MultiDeviceLocaleKey) => string
  onOpenHubPanel: () => void
}): React.ReactElement {
  const state = useMultiDeviceState()
  const { devices } = state.snapshot
  const isNative = state.displayMode === 'native'

  return (
    <>
      <div className="dsh-md-overlay-bar">
        <div className="dsh-md-mode-seg">
          <button
            type="button"
            className="dsh-md-mode-btn"
            data-active={!isNative ? 'true' : 'false'}
            onClick={() => clientStore.setDisplayMode('aggregated')}
          >
            {t('modeAggregated')}
          </button>
          <button
            type="button"
            className="dsh-md-mode-btn"
            data-active={isNative ? 'true' : 'false'}
            onClick={() => clientStore.setDisplayMode('native')}
          >
            {t('modeNative')}
          </button>
        </div>

        {!state.overlayCollapsed &&
          devices.map((dev) => (
            <button
              key={dev.id}
              type="button"
              className="dsh-md-device-pill"
              data-active={isNative && state.activeNativeDeviceId === dev.id ? 'true' : 'false'}
              title={`${dev.name} (${dev.targetSummary})`}
              onClick={() => clientStore.selectNativeDevice(dev.id)}
            >
              <span className="dsh-md-dot" data-state={dev.state} />
              <span>{dev.name}</span>
              {dev.runningSessionCount > 0 && (
                <span style={{ color: '#60a5fa', fontWeight: 600 }}>{dev.runningSessionCount}</span>
              )}
              {dev.pendingApprovalCount > 0 && (
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>!{dev.pendingApprovalCount}</span>
              )}
            </button>
          ))}

        <button
          type="button"
          className="dsh-md-device-pill"
          title={t('panelTitle')}
          onClick={() => {
            clientStore.setDisplayMode('aggregated')
            onOpenHubPanel()
          }}
        >
          ⚙
        </button>
      </div>

      {/* Persistent Native Mode container: kept in DOM with display:none when in Aggregated Mode for Keep-Alive */}
      {(isNative || state.keepAliveDeviceIds.length > 0) && (
        <div
          className="dsh-md-native-fullscreen"
          style={{
            display: isNative ? 'flex' : 'none',
            pointerEvents: isNative ? 'auto' : 'none',
          }}
        >
          <NativeViewport
            t={t}
            onOpenSettings={() => {
              clientStore.setDisplayMode('aggregated')
              onOpenHubPanel()
            }}
          />
        </div>
      )}
    </>
  )
}

/** Leading badge inside the 16px idle slot of a remote Session row (`sidebar.session.row.leading`). */
export function SessionRowLeadingBadge({ sessionId }: { sessionId: string }): React.ReactElement | null {
  const decoded = decodeSessionId(sessionId)
  const state = useMultiDeviceState()
  if (!decoded.isRemote) return null
  const origin = state.snapshot.sessionOrigins[sessionId]
  const label = (origin?.deviceName ?? decoded.deviceId).slice(0, 2).toUpperCase()
  return (
    <span
      className="dsh-md-row-leading-tag"
      title={origin?.deviceName ?? decoded.deviceId}
    >
      {label}
    </span>
  )
}

/** Device & Git repo metadata inside the Session row HoverCard (`sidebar.session.row.hover`). */
export function SessionRowHoverDeviceSection({
  sessionId,
  t,
}: {
  sessionId: string
  t: (key: MultiDeviceLocaleKey) => string
}): React.ReactElement | null {
  const decoded = decodeSessionId(sessionId)
  const state = useMultiDeviceState()
  if (!decoded.isRemote) return null
  const origin = state.snapshot.sessionOrigins[sessionId]
  const devName = origin?.deviceName ?? decoded.deviceId
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, paddingTop: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="dsh-md-dot" data-state={origin?.deviceState ?? 'connected'} />
        <span>
          {t('hoverDeviceLabel')}: <strong>{devName}</strong>
        </span>
      </div>
      {origin?.gitRemote !== undefined && (
        <div style={{ color: 'var(--dsw-alias-label-tertiary, #9ca3af)' }}>
          {t('hoverGitRepoLabel')}: {origin.gitRemote}
        </div>
      )}
    </div>
  )
}

/** Context menu item in a Session's `...` menu (`sidebar.workspaces.session.menu.item`). */
export function SessionMenuOpenInNativeItem({
  sessionId,
  useMenuOpenState,
  t,
}: {
  sessionId: string
  useMenuOpenState: () => readonly [boolean, (open: boolean) => void]
  t: (key: MultiDeviceLocaleKey) => string
}): React.ReactElement | null {
  const [, setMenuOpen] = useMenuOpenState()
  const decoded = decodeSessionId(sessionId)
  if (!decoded.isRemote) return null
  return (
    <button
      type="button"
      role="menuitem"
      className="dsh-md-btn"
      style={{
        width: '100%',
        justifyContent: 'flex-start',
        border: 'none',
        background: 'transparent',
        height: 28,
        padding: '0 8px',
      }}
      onClick={() => {
        setMenuOpen(false)
        clientStore.selectNativeDevice(decoded.deviceId)
      }}
    >
      🖥 {t('menuOpenInNative')}
    </button>
  )
}

/**
 * Persistent Native Mode viewport & sidebar session row enhancements.
 *
 * 1. `ModeSwitcherOverlay`: Mounted in `shell.overlay` (`id: 'multi-device-switcher'`).
 *    - Keeps `NativeViewport` mounted in the DOM (`display: none` while in Aggregated Mode)
 *      so Native Mode keep-alive pages are never unmounted across mode switches.
 *    - The mode/device toggle lives in the native `sidebar.footer.action` entry
 *      (`SidebarEntry.tsx`), never in a floating bar over shell chrome.
 * 2. `SessionHeaderDeviceBadge`, `ActiveSessionReporter`, `SessionRowHoverDeviceSection`,
 *    `SessionMenuOpenInNativeItem`:
 *    - Official DSH 0.2 slot contributions for `conversation.session.header.utilities`,
 *      `conversation.input.right`, `sidebar.session.row.hover`, and
 *      `sidebar.workspaces.session.menu.item`.
 *    - Device identity is shown only after a Session is opened (right side of the
 *      conversation header); Session rows stay visually identical to local rows.
 *
 * @module dsh-multi-device/client/ModeSwitcherOverlay
 */
import {
  IconRightUpOutlineRegular,
  MenuItemButton,
  Modal,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React from 'react'
import { decodeSessionId } from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { MultiDeviceHubPanel } from './MultiDeviceHubPanel.tsx'
import { NativeViewport } from './NativeViewport.tsx'
import { clientStore, deviceStateToDotState, useMultiDeviceState } from './state.ts'

export function ModeSwitcherOverlay({
  t,
  onOpenSettings,
}: {
  t: (key: MultiDeviceLocaleKey) => string
  onOpenSettings: () => void
}): React.ReactElement {
  const state = useMultiDeviceState()
  const isNative = state.displayMode === 'native'

  return (
    <>
      {/* Persistent Native Mode container: kept in DOM with display:none when in Aggregated Mode for Keep-Alive */}
      {(isNative || state.keepAliveDeviceIds.length > 0) && (
        <div
          className="dsh-md-native-fullscreen"
          style={{
            display: isNative ? 'flex' : 'none',
            pointerEvents: isNative ? 'auto' : 'none',
          }}
        >
          <NativeViewport t={t} onOpenSettings={onOpenSettings} />
        </div>
      )}

      {/* Fallback Settings Modal when host shell does not expose sidebar.settings store */}
      <Modal
        open={state.settingsModalOpen}
        onClose={() => clientStore.setSettingsModalOpen(false)}
        title={t('settingsSectionTitle')}
        closeLabel={t('close')}
        className="dsh-md-fallback-modal"
      >
        <MultiDeviceHubPanel
          t={t}
          hideHeader
          onCloseSettings={() => clientStore.setSettingsModalOpen(false)}
        />
      </Modal>
    </>
  )
}

/**
 * Report the Session currently rendered in the conversation pane. Mounted in
 * `conversation.input.right` because that Session-scoped slot also renders for
 * a brand-new blank Session, where the header chrome is hidden.
 */
export function ActiveSessionReporter({
  sessionId,
  onScopeReported,
}: {
  sessionId: string
  onScopeReported?: () => void
}): null {
  React.useEffect(() => {
    let cancelled = false
    void clientStore.setActiveSession(sessionId).then(() => {
      if (!cancelled) onScopeReported?.()
    })
    return () => {
      cancelled = true
      clientStore.clearActiveSession(sessionId)
    }
  }, [onScopeReported, sessionId])
  return null
}

/**
 * Device identity on the right side of an opened Session header
 * (`conversation.session.header.utilities`). Local Sessions show nothing, so
 * only remote conversations carry a device label.
 */
export function SessionHeaderDeviceBadge({
  sessionId,
  t,
}: {
  sessionId: string
  t?: (key: MultiDeviceLocaleKey) => string
}): React.ReactElement | null {
  const decoded = decodeSessionId(sessionId)
  const state = useMultiDeviceState()
  if (!decoded.isRemote) return null
  const origin = state.snapshot.sessionOrigins[sessionId]
  const deviceName = origin?.deviceName ?? decoded.deviceId
  const label = t?.('hoverDeviceLabel') ?? 'Device'
  return (
    <span className="dsh-md-session-device" title={`${label}: ${deviceName}`}>
      <StateDot state={deviceStateToDotState(origin?.deviceState ?? 'connected')} size={8} />
      <span className="dsh-md-session-device-name">{deviceName}</span>
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
        <StateDot state={deviceStateToDotState(origin?.deviceState ?? 'connected')} size={8} />
        <span>
          {t('hoverDeviceLabel')}: <strong>{devName}</strong>
        </span>
      </div>
      {origin?.gitRemote !== undefined && (
        <div style={{ color: 'var(--dsw-alias-label-tertiary)' }}>
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
    <MenuItemButton
      icon={<IconRightUpOutlineRegular size={14} />}
      onSelect={() => {
        setMenuOpen(false)
        clientStore.selectNativeDevice(decoded.deviceId)
      }}
    >
      {t('menuOpenInNative')}
    </MenuItemButton>
  )
}

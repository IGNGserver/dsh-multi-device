/**
 * Floating Mode Switcher & Sidebar Session Row Enhancements.
 *
 * 1. `ModeSwitcherOverlay`: Mounted in `shell.overlay` (`id: 'multi-device-switcher'`).
 *    - Displays a compact top-right native bar when remote devices are configured so the user
 *      can switch between **Aggregated Mode** and **Native Mode** or open Multi-Device Settings.
 *    - Stays hidden when no remote devices are configured in Aggregated Mode, and defers to
 *      `NativeViewport`'s top toolbar while in Native Mode so controls never overlap.
 *    - Always keeps `NativeViewport` mounted in the DOM (`display: none` while in Aggregated Mode)
 *      so Native Mode keep-alive pages are never unmounted across mode switches.
 * 2. `SessionRowLeadingBadge`, `SessionRowHoverDeviceSection`, `SessionMenuOpenInNativeItem`:
 *    - Official DSH 0.2 slot contributions for `sidebar.session.row.leading`,
 *      `sidebar.session.row.hover`, and `sidebar.workspaces.session.menu.item`.
 *
 * @module dsh-multi-device/client/ModeSwitcherOverlay
 */
import {
  Button,
  IconRightUpOutlineRegular,
  IconSettingsOutlineRegular,
  MenuItemButton,
  Modal,
  Pill,
  SegmentedControl,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React from 'react'
import { type DisplayMode, decodeSessionId } from '../contract.ts'
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
  const { devices } = state.snapshot
  const isNative = state.displayMode === 'native'

  return (
    <>
      {!isNative && devices.length > 0 && (
        <div className="dsh-md-overlay-bar">
          <SegmentedControl<DisplayMode>
            label={t('modeRowTitle')}
            value={state.displayMode}
            options={[
              { value: 'aggregated', label: t('modeAggregated') },
              { value: 'native', label: t('modeNative') },
            ]}
            onChange={(next) => clientStore.setDisplayMode(next)}
          />

          {!state.overlayCollapsed &&
            devices.map((dev) => (
              <Tooltip key={dev.id} label={`${dev.name} (${dev.targetSummary})`} side="bottom">
                <Pill
                  active={false}
                  onClick={() => clientStore.selectNativeDevice(dev.id)}
                >
                  <span className="dsh-md-pill-inner">
                    <StateDot state={deviceStateToDotState(dev.state)} size={8} />
                    <span>{dev.name}</span>
                    {dev.pendingApprovalCount > 0 ? (
                      <span className="dsh-md-muted">!{dev.pendingApprovalCount}</span>
                    ) : dev.runningSessionCount > 0 ? (
                      <span className="dsh-md-muted">{dev.runningSessionCount}</span>
                    ) : null}
                  </span>
                </Pill>
              </Tooltip>
            ))}

          <Tooltip label={t('settingsSectionTitle')} side="bottom">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('settingsSectionTitle')}
              onClick={onOpenSettings}
            >
              <IconSettingsOutlineRegular size={14} />
            </Button>
          </Tooltip>
        </div>
      )}

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

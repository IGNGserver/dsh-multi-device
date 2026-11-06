/**
 * Persistent Native Mode tab bar, keep-alive viewports, and sidebar metadata.
 *
 * 1. `ModeSwitcherOverlay`: Mounted in `shell.overlay` (`id: 'multi-device-switcher'`).
 *    - In Native Mode it reserves a top strip and renders the always-visible
 *      `[本机][device…]` bar plus the remote keep-alive viewports.
 *    - In Aggregated Mode it renders no chrome and no device navigation; remote
 *      viewports may stay mounted but hidden so Keep-Alive survives a switch.
 *    - The mode itself is switched only from Settings. There is no sidebar
 *      entry and no "back to aggregated" control here.
 * 2. `ActiveSessionReporter` and `SessionRowHoverDeviceSection`:
 *    - Official DSH 0.2 slot contributions for `conversation.input.right` and
 *      `sidebar.session.row.hover`.
 *    - The active Session is reported so the Host can scope the model catalog;
 *      the owning device lives on the conversation-page chip
 *      (`SessionDeviceChip`), not here. Session rows stay visually identical to
 *      local rows.
 *
 * @module dsh-multi-device/client/ModeSwitcherOverlay
 */
import { Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { decodeSessionId } from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { MultiDeviceHubPanel } from './MultiDeviceHubPanel.tsx'
import { nativePaneTarget } from './nativePane.ts'
import { NativeTabBar, NativeViewport } from './NativeViewport.tsx'
import { clientStore, deviceStateToDotState, useMultiDeviceState } from './state.ts'

const FRAME_NATIVE_CLASS = 'dsh-md-frame-native'
const FRAME_DESKTOP_CLASS = 'dsh-md-frame-desktop'
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function isDesktopRuntime(): boolean {
  const desktop = (globalThis as { dshDesktop?: { protocolVersion?: number } }).dshDesktop
  return desktop?.protocolVersion === 1
}

export function ModeSwitcherOverlay({
  t,
  onOpenSettings,
}: {
  t: (key: MultiDeviceLocaleKey) => string
  onOpenSettings: () => void
}): React.ReactElement {
  const state = useMultiDeviceState()
  const isNative = state.displayMode === 'native'
  const paneTarget = state.snapshot.ui?.nativePane === false || !state.snapshot.hostStatus.nativeProxyActive
    ? undefined
    : nativePaneTarget(state.displayMode, state.activeSessionId)
  const layerRef = useRef<HTMLDivElement | null>(null)

  // Reserve the 42px strip *inside the host frame* so the tab bar never covers
  // the local sidebar brand row or the session header. The class is removed on
  // unmount and when returning to Aggregated Mode.
  useBrowserLayoutEffect(() => {
    const frame = layerRef.current?.closest('[data-shell-overlay]')?.parentElement
    if (!(frame instanceof HTMLElement)) return
    frame.classList.toggle(FRAME_NATIVE_CLASS, isNative)
    frame.classList.toggle(FRAME_DESKTOP_CLASS, isDesktopRuntime())
    return () => {
      frame.classList.remove(FRAME_NATIVE_CLASS)
      frame.classList.remove(FRAME_DESKTOP_CLASS)
    }
  }, [isNative])

  return (
    <>
      <div ref={layerRef} className="dsh-md-native-layer" data-native={isNative ? 'true' : 'false'}>
        {isNative && <NativeTabBar t={t} onOpenSettings={onOpenSettings} />}
        {(isNative || state.keepAliveDeviceIds.length > 0 || paneTarget !== undefined) && (
          <NativeViewport t={t} onOpenSettings={onOpenSettings} />
        )}
      </div>

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
      {origin?.deviceState === 'error' || origin?.deviceState === 'disabled' ? (
        <div style={{ color: 'var(--dsw-alias-state-warn-primary)' }}>
          {t('deviceOfflineShort')}
        </div>
      ) : null}
    </div>
  )
}

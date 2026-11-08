/**
 * The `shell.overlay` contribution: device tab strip, keep-alive viewports and
 * the fallback Settings modal.
 *
 * The tab strip is the plugin's only navigation surface. It reserves a top
 * strip inside the host frame so it never covers the local sidebar brand row or
 * the session header.
 *
 * @module dsh-multi-device/client/NativeOverlay
 */
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useEffect, useLayoutEffect, useRef } from 'react'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { MultiDeviceHubPanel } from './MultiDeviceHubPanel.tsx'
import { NativeTabBar, NativeViewport } from './NativeViewport.tsx'
import { clientStore, useMultiDeviceState } from './state.ts'

const FRAME_NATIVE_CLASS = 'dsh-md-frame-native'
const FRAME_DESKTOP_CLASS = 'dsh-md-frame-desktop'
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function isDesktopRuntime(): boolean {
  const desktop = (globalThis as { dshDesktop?: { protocolVersion?: number } }).dshDesktop
  return desktop?.protocolVersion === 1
}

export function NativeOverlay({
  t,
  onOpenSettings,
}: {
  t: (key: MultiDeviceLocaleKey) => string
  onOpenSettings: () => void
}): React.ReactElement {
  const state = useMultiDeviceState()
  const layerRef = useRef<HTMLDivElement | null>(null)

  // Reserve the 42px strip *inside the host frame* so the tab bar never covers
  // the local sidebar brand row or the session header.
  useBrowserLayoutEffect(() => {
    const frame = layerRef.current?.closest('[data-shell-overlay]')?.parentElement
    if (!(frame instanceof HTMLElement)) return
    frame.classList.add(FRAME_NATIVE_CLASS)
    frame.classList.toggle(FRAME_DESKTOP_CLASS, isDesktopRuntime())
    return () => {
      frame.classList.remove(FRAME_NATIVE_CLASS)
      frame.classList.remove(FRAME_DESKTOP_CLASS)
    }
  }, [])

  return (
    <>
      <div ref={layerRef} className="dsh-md-native-layer" data-native="true">
        <NativeTabBar t={t} onOpenSettings={onOpenSettings} />
        <NativeViewport t={t} onOpenSettings={onOpenSettings} />
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

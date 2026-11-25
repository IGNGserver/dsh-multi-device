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
const ROOT_ACTIVE_CLASS = 'dsh-md-active'
const FRAME_REMOTE_ACTIVE_ATTR = 'data-md-remote-active'
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
  const remoteActive = state.snapshot.devices.some(
    device => device.enabled !== false && device.id === state.activeNativeDeviceId,
  )

  // Reserve the 42px strip *inside the host frame* so the tab bar never covers
  // the local sidebar brand row or the session header, and mark the document
  // root so portalled DSH overlays (Settings, Menu, popovers) clear the strip.
  useBrowserLayoutEffect(() => {
    const root = typeof document === 'undefined' ? undefined : document.documentElement
    root?.classList.add(ROOT_ACTIVE_CLASS)
    const rawFrame = layerRef.current?.closest?.('[data-shell-overlay]')?.parentElement
    const frame = typeof HTMLElement !== 'undefined' && rawFrame instanceof HTMLElement ? rawFrame : undefined
    if (frame !== undefined) {
      frame.classList.add(FRAME_NATIVE_CLASS)
      frame.classList.toggle(FRAME_DESKTOP_CLASS, isDesktopRuntime())
    }
    return () => {
      root?.classList.remove(ROOT_ACTIVE_CLASS)
      if (frame !== undefined) {
        frame.classList.remove(FRAME_NATIVE_CLASS)
        frame.classList.remove(FRAME_DESKTOP_CLASS)
        frame.removeAttribute(FRAME_REMOTE_ACTIVE_ATTR)
      }
    }
  }, [])

  // Hide local frame leading controls while a remote device fills the stage so
  // the local collapsed-sidebar opener never floats over the remote page.
  useBrowserLayoutEffect(() => {
    const rawFrame = layerRef.current?.closest?.('[data-shell-overlay]')?.parentElement
    if (typeof HTMLElement === 'undefined' || !(rawFrame instanceof HTMLElement)) return
    if (remoteActive) rawFrame.setAttribute(FRAME_REMOTE_ACTIVE_ATTR, 'true')
    else rawFrame.removeAttribute(FRAME_REMOTE_ACTIVE_ATTR)
  }, [remoteActive])

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
        contentClassName="dsh-md-fallback-modal-content"
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

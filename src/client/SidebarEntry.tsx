/**
 * Native `sidebar.footer.action` entry for Multi-Device.
 *
 * The previous floating `shell.overlay` switcher sat on top of DSH's session header
 * (and the plugin's own settings header), and on Windows its top edge competed with
 * the caption drag region. The sidebar footer is a native list slot that already
 * owns its layout, so this entry never covers shell chrome.
 *
 * Clicking the entry opens a compact, anchored popover with:
 * - one row per device (switches Native Mode to that device),
 * - a settings action (native DSH Settings → Multi-Device),
 * - a refresh action.
 *
 * The popover is rendered in place with `position: fixed`; it closes on outside
 * press, Escape, resize, or scroll.
 *
 * @module dsh-multi-device/client/SidebarEntry
 */
import {
  IconRefreshOutlineRegular,
  IconSettingsOutlineRegular,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useEffect, useRef, useState } from 'react'
import type { DeviceView } from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { clientStore, deviceStateToDotState, useMultiDeviceState } from './state.ts'

const POPOVER_WIDTH = 272
const POPOVER_GAP = 8
const POPOVER_MARGIN = 8

function DevicesIcon({ size = 18 }: { size?: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      aria-hidden="true"
    >
      <rect x="1.6" y="2.4" width="8" height="5.6" rx="1.1" />
      <rect x="6.4" y="8" width="8" height="5.6" rx="1.1" />
      <path d="M4 8v1.6M12 8V4" strokeLinecap="round" />
    </svg>
  )
}

function deviceStatusLabel(
  device: DeviceView,
  t: (key: MultiDeviceLocaleKey) => string,
): { text: string; warn: boolean } {
  if (device.authState === 'required') return { text: t('authRequired'), warn: true }
  if (device.state === 'connected') return { text: t('statusConnected'), warn: false }
  if (device.state === 'connecting') return { text: t('statusConnecting'), warn: false }
  if (device.state === 'reconnecting') return { text: t('statusReconnecting'), warn: false }
  if (device.state === 'error') return { text: t('statusError'), warn: true }
  return { text: t('statusDisabled'), warn: false }
}

interface PopoverPosition {
  readonly left: number
  readonly top: number
}

function computePopoverPosition(anchor: HTMLElement): PopoverPosition {
  const rect = anchor.getBoundingClientRect()
  const maxLeft = Math.max(POPOVER_MARGIN, window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN)
  const left = Math.min(Math.max(POPOVER_MARGIN, rect.left), maxLeft)
  const openUp = rect.top > 360
  const top = openUp
    ? Math.max(POPOVER_MARGIN, rect.top - POPOVER_GAP)
    : Math.min(window.innerHeight - 120, rect.bottom + POPOVER_GAP)
  return { left, top }
}

export function MultiDeviceSidebarEntry({
  wide,
  t,
  onOpenSettings,
}: {
  wide: boolean
  t: (key: MultiDeviceLocaleKey) => string
  onOpenSettings: () => void
}): React.ReactElement {
  const state = useMultiDeviceState()
  const devices = state.snapshot.devices
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PopoverPosition>({ left: POPOVER_MARGIN, top: POPOVER_MARGIN })
  const [openUp, setOpenUp] = useState(true)
  const entryRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  const close = (): void => setOpen(false)

  const toggle = (): void => {
    if (open) {
      close()
      return
    }
    const anchor = entryRef.current
    if (anchor === null) return
    const next = computePopoverPosition(anchor)
    setPosition(next)
    setOpenUp(anchor.getBoundingClientRect().top > 360)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (popoverRef.current?.contains(target) === true) return
      if (entryRef.current?.contains(target) === true) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    const onViewportChange = (): void => {
      const anchor = entryRef.current
      if (anchor === null) return
      setPosition(computePopoverPosition(anchor))
      setOpenUp(anchor.getBoundingClientRect().top > 360)
    }
    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open])

  const openDevice = (deviceId: DeviceView['id']): void => {
    clientStore.selectNativeDevice(deviceId)
    close()
  }

  const openSettings = (): void => {
    close()
    onOpenSettings()
  }

  return (
    <div
      ref={entryRef}
      className={`dsh-md-sidebar-entry${wide ? ' isWide' : ' isRail'}${open ? ' isOpen' : ''}`}
    >
      <button
        type="button"
        className="dsh-md-sidebar-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('sidebarEntryTitle')}
        onClick={toggle}
      >
        <DevicesIcon size={wide ? 16 : 18} />
        {wide && <span className="dsh-md-sidebar-label">{t('sidebarEntryLabel')}</span>}
        {devices.length > 0 && <span className="dsh-md-sidebar-count">{devices.length}</span>}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="dsh-md-device-popover"
          role="dialog"
          aria-label={t('sidebarEntryTitle')}
          style={{
            left: position.left,
            top: position.top,
            ...(openUp ? { transform: 'translateY(-100%)' } : {}),
          }}
        >
          <div className="dsh-md-device-popover-title">{t('popoverDevices')}</div>

          {devices.length === 0 ? (
            <div className="dsh-md-device-popover-empty">{t('popoverEmpty')}</div>
          ) : (
            devices.map((device) => {
              const status = deviceStatusLabel(device, t)
              return (
                <button
                  key={device.id}
                  type="button"
                  className="dsh-md-device-popover-row"
                  title={`${device.name} (${device.targetSummary})`}
                  onClick={() => openDevice(device.id)}
                >
                  <StateDot state={deviceStateToDotState(device.state)} size={8} />
                  <span className="dsh-md-device-popover-name">{device.name}</span>
                  <span className={`dsh-md-device-popover-state${status.warn ? ' isWarn' : ''}`}>
                    {status.text}
                  </span>
                </button>
              )
            })
          )}

          <div className="dsh-md-device-popover-sep" />

          <button type="button" className="dsh-md-device-popover-action" onClick={openSettings}>
            <IconSettingsOutlineRegular size={14} />
            {t('popoverSettings')}
          </button>
          <button
            type="button"
            className="dsh-md-device-popover-action"
            onClick={() => { void clientStore.refreshSnapshot() }}
          >
            <IconRefreshOutlineRegular size={14} />
            {t('popoverRefresh')}
          </button>
        </div>
      )}
    </div>
  )
}

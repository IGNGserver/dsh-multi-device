/**
 * Owning-device chip on the conversation page.
 *
 * Rendered from `conversation.session.header.utilities` (existing Sessions) and,
 * from P2 on, from `conversation.hero.options` (the blank New Session row). The
 * chip always names the device that owns the conversation — 本机 included, so
 * aggregated mode stops being silent about local sessions — and exposes a
 * details popover with the connection state, paths, and a reconnect action.
 *
 * @module dsh-multi-device/client/SessionDeviceChip
 */
import {
  IconChevronDownOutlineRegular,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSessionSummary } from './clientServices.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import {
  deviceTargetsForWorkspace,
  resolveSessionDevice,
  resolveSessionLogicalWorkspace,
} from './sessionDevice.ts'
import { clientStore, deviceStateToDotState, useMultiDeviceState } from './state.ts'

type Translate = (key: MultiDeviceLocaleKey) => string

interface PopoverPosition {
  readonly top: number
  readonly right: number
}

function stateLabelKey(state: string): MultiDeviceLocaleKey {
  switch (state) {
    case 'connected':
      return 'statusConnected'
    case 'connecting':
      return 'statusConnecting'
    case 'reconnecting':
      return 'statusReconnecting'
    case 'disabled':
      return 'statusDisabled'
    default:
      return 'statusError'
  }
}

export function SessionDeviceChip({
  sessionId,
  t,
  onOpenSettings,
  variant = 'header',
}: {
  readonly sessionId: string
  readonly t: Translate
  readonly onOpenSettings: () => void
  /** `header` sits in the session header; `hero` sits in the New Session options row. */
  readonly variant?: 'header' | 'hero'
}): React.ReactElement | null {
  const state = useMultiDeviceState()
  const snapshot = state.snapshot
  const summary = useSessionSummary(sessionId)
  const device = useMemo(
    () => resolveSessionDevice(snapshot, sessionId, t('nativeLocalTab')),
    [snapshot, sessionId, t],
  )
  const workspace = useMemo(
    () => resolveSessionLogicalWorkspace(snapshot, sessionId, summary?.cwd),
    [snapshot, sessionId, summary?.cwd],
  )
  const targets = useMemo(
    () => (workspace === undefined ? [] : deviceTargetsForWorkspace(snapshot, workspace, t('nativeLocalTab'))),
    [snapshot, workspace, t],
  )
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PopoverPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    // Any layout change moves the anchor; closing is cheaper and less janky
    // than chasing it in a fixed-position popover.
    const close = (): void => setOpen(false)
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const online = device.state === 'connected'
  const offline = !device.isLocal && !online
  const stateBadge = device.isLocal || online
    ? undefined
    : device.state === 'reconnecting'
      ? t('statusReconnecting')
      : device.state === 'connecting'
        ? undefined
        : t('deviceOfflineShort')
  const showSwitchHint = variant === 'hero' && online === false && targets.some(target => target.online)
  const aria = `${t('deviceChipAria')}: ${device.name}`

  const toggle = (): void => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    setPosition({
      top: Math.round(rect.bottom + 6),
      right: Math.max(8, Math.round(window.innerWidth - rect.right)),
    })
    setOpen(true)
  }

  return (
    <span className="dsh-md-device-chip-wrap" data-variant={variant}>
      <button
        ref={buttonRef}
        type="button"
        className="dsh-md-device-chip"
        data-state={device.state}
        data-local={device.isLocal ? 'true' : 'false'}
        aria-label={aria}
        aria-expanded={open}
        title={aria}
        onClick={toggle}
      >
        <StateDot state={deviceStateToDotState(device.state)} size={8} />
        <span className="dsh-md-device-chip-name">{device.name}</span>
        {stateBadge !== undefined && <span className="dsh-md-device-chip-offline">{stateBadge}</span>}
        <IconChevronDownOutlineRegular size={12} className="dsh-md-device-chip-chevron" />
      </button>

      {open && position !== null && (
        <>
          <div className="dsh-md-device-chip-backdrop" onClick={() => setOpen(false)} />
          <div
            className="dsh-md-device-popover"
            role="dialog"
            aria-label={aria}
            style={{ top: position.top, right: position.right }}
          >
            <div className="dsh-md-device-popover-head">
              <StateDot state={deviceStateToDotState(device.state)} size={8} />
              <span className="dsh-md-device-popover-name">{device.name}</span>
              <span className="dsh-md-device-popover-state">{t(stateLabelKey(device.state))}</span>
            </div>

            <dl className="dsh-md-device-popover-rows">
              {workspace !== undefined && (
                <>
                  <dt>{t('deviceChipWorkspace')}</dt>
                  <dd title={workspace.title}>{workspace.title}</dd>
                </>
              )}
              {device.origin?.cwd !== undefined && (
                <>
                  <dt>{t('deviceChipCwd')}</dt>
                  <dd title={device.origin.cwd}>{device.origin.cwd}</dd>
                </>
              )}
              {device.origin?.gitRemote !== undefined && (
                <>
                  <dt>{t('hoverGitRepoLabel')}</dt>
                  <dd title={device.origin.gitRemote}>{device.origin.gitRemote}</dd>
                </>
              )}
            </dl>

            {offline && device.origin === undefined && (
              <p className="dsh-md-device-popover-error">{t('deviceChipOfflineHint')}</p>
            )}
            {showSwitchHint && (
              <p className="dsh-md-device-popover-hint">{t('deviceChipSwitchHint')}</p>
            )}

            <div className="dsh-md-device-popover-actions">
              {!device.isLocal && !online && (
                <button
                  type="button"
                  className="dsh-md-device-popover-action"
                  onClick={() => {
                    void clientStore.reconnectDevice(device.deviceId)
                    setOpen(false)
                  }}
                >
                  {t('reconnect')}
                </button>
              )}
              <button
                type="button"
                className="dsh-md-device-popover-action"
                onClick={() => {
                  setOpen(false)
                  onOpenSettings()
                }}
              >
                {t('deviceChipOpenSettings')}
              </button>
            </div>
          </div>
        </>
      )}
    </span>
  )
}

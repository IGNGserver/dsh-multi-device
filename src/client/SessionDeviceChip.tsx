/**
 * Owning-device chip on the conversation page.
 *
 * Two placements, one component:
 * - `header` (`conversation.session.header.utilities`): names the device that
 *   owns the open conversation (本机 included) and opens a details popover with
 *   the connection state, paths, and a reconnect action.
 * - `hero` (`conversation.hero.options`): sits in the New Session row. For a
 *   logical workspace with several member devices it opens a device picker;
 *   choosing one persists the preference and restarts the blank conversation on
 *   that device through DSH's own `startSession`.
 *
 * @module dsh-multi-device/client/SessionDeviceChip
 */
import {
  IconChevronDownOutlineRegular,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { DeviceId, DeviceConnectionState } from '../contract.ts'
import { getClientServices, useSessionSummary } from './clientServices.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import {
  deviceTargetsForWorkspace,
  type DeviceTargetOption,
  resolveSessionDevice,
  resolveSessionLogicalWorkspace,
} from './sessionDevice.ts'
import { clientStore, deviceStateToDotState, useMultiDeviceState } from './state.ts'

type Translate = (key: MultiDeviceLocaleKey) => string

interface PopoverPosition {
  readonly top: number
  readonly right: number
}

function stateLabelKey(state: DeviceConnectionState): MultiDeviceLocaleKey {
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

/** Short badge for a device that cannot host work right now. */
function stateBadgeOf(state: DeviceConnectionState, t: Translate): string | undefined {
  if (state === 'connected' || state === 'connecting') return undefined
  if (state === 'reconnecting') return t('statusReconnecting')
  return t('deviceOfflineShort')
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
  const [pendingTarget, setPendingTarget] = useState<DeviceId | undefined>(undefined)
  const [switchError, setSwitchError] = useState<string | undefined>(undefined)
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
  const stateBadge = device.isLocal ? undefined : stateBadgeOf(device.state, t)
  const canSwitchDevice =
    variant === 'hero' &&
    workspace !== undefined &&
    targets.length > 1 &&
    summary?.blank !== false
  const offlineTargets = targets.filter(target => !target.online)
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
    setSwitchError(undefined)
    setOpen(true)
  }

  const selectTarget = async (target: DeviceTargetOption): Promise<void> => {
    if (workspace === undefined) return
    setPendingTarget(target.deviceId)
    setSwitchError(undefined)
    try {
      const result = await clientStore.switchNewSessionDevice(
        getClientServices().uiWorkspace,
        workspace.logicalWorkspaceId,
        target.deviceId,
      )
      if (!result.ok) {
        setSwitchError(
          result.error === 'startSession-unavailable'
            ? t('deviceSwitchUnavailable')
            : result.error ?? t('actionFailed'),
        )
        return
      }
      setOpen(false)
    } finally {
      setPendingTarget(undefined)
    }
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
        {variant === 'hero' && (
          <span className="dsh-md-device-chip-label">{t('deviceHeroChipLabel')}</span>
        )}
        <span className="dsh-md-device-chip-name">{device.name}</span>
        {stateBadge !== undefined && <span className="dsh-md-device-chip-offline">{stateBadge}</span>}
        <IconChevronDownOutlineRegular size={12} className="dsh-md-device-chip-chevron" />
      </button>

      {open && position !== null && (
        <>
          <div className="dsh-md-device-chip-backdrop" onClick={() => setOpen(false)} />
          {canSwitchDevice && workspace !== undefined ? (
            <div
              className="dsh-md-device-popover dsh-md-device-menu"
              role="dialog"
              aria-label={aria}
              style={{ top: position.top, right: position.right }}
            >
              <div className="dsh-md-device-popover-head">
                <span className="dsh-md-device-popover-name">{t('deviceTargetTitle')}</span>
              </div>
              <p className="dsh-md-device-popover-hint">{t('deviceTargetSubtitle')}</p>

              <ul className="dsh-md-device-target-list" role="menu">
                {targets.map((target) => {
                  const current = target.deviceId === workspace.targetDeviceId
                  const pending = pendingTarget === target.deviceId
                  return (
                    <li key={target.deviceId}>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={current}
                        className="dsh-md-device-target"
                        data-current={current ? 'true' : 'false'}
                        data-online={target.online ? 'true' : 'false'}
                        disabled={!target.online || pendingTarget !== undefined}
                        onClick={() => {
                          void selectTarget(target)
                        }}
                      >
                        <StateDot state={deviceStateToDotState(target.state)} size={8} />
                        <span className="dsh-md-device-target-name">{target.name}</span>
                        <span className="dsh-md-device-target-path" title={target.path}>
                          {target.path}
                        </span>
                        <span className="dsh-md-device-target-meta">
                          {pending
                            ? t('deviceSwitchPending')
                            : target.online
                              ? current
                                ? '✓'
                                : ''
                              : t('deviceOfflineShort')}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              {switchError !== undefined && (
                <p className="dsh-md-device-popover-error" role="alert">
                  {switchError}
                </p>
              )}
              <p className="dsh-md-device-popover-hint">{t('deviceSwitchKeepsBlank')}</p>

              <div className="dsh-md-device-popover-actions">
                {offlineTargets.length > 0 && (
                  <button
                    type="button"
                    className="dsh-md-device-popover-action"
                    onClick={() => {
                      for (const target of offlineTargets) {
                        void clientStore.reconnectDevice(target.deviceId)
                      }
                    }}
                  >
                    {t('deviceReconnectOffline')}
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
          ) : (
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
              {variant === 'hero' && workspace === undefined && (
                <p className="dsh-md-device-popover-hint">{t('deviceTargetNeedsWorkspace')}</p>
              )}
              {variant === 'hero' && workspace !== undefined && targets.length <= 1 && (
                <p className="dsh-md-device-popover-hint">{t('deviceTargetSingleDevice')}</p>
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
          )}
        </>
      )}
    </span>
  )
}

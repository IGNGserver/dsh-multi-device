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
 *   that device through DSH's own `startSession`. A secondary panel can start a
 *   session on any *other* device that already has a workspace, which covers
 *   "device first, directory second".
 *
 * @module dsh-multi-device/client/SessionDeviceChip
 */
import {
  IconChevronDownOutlineRegular,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { DeviceConnectionState, DeviceId } from '../contract.ts'
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

/** One remote device plus the workspaces a device-first session can start in. */
interface OtherDeviceGroup {
  readonly deviceId: DeviceId
  readonly name: string
  readonly state: DeviceConnectionState
  readonly workspaces: readonly { readonly workspaceId: string; readonly title: string; readonly path: string }[]
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
  const otherDevices = useMemo<readonly OtherDeviceGroup[]>(() => {
    if (variant !== 'hero') return []
    return snapshot.devices
      .filter(candidate => candidate.enabled && candidate.id !== device.deviceId)
      .map(candidate => ({
        deviceId: candidate.id,
        name: candidate.name,
        state: candidate.state,
        workspaces: snapshot.allPhysicalWorkspaces
          .filter(member => member.deviceId === candidate.id)
          .map(member => ({
            workspaceId: member.remoteWorkspaceId,
            title: member.title,
            path: member.path,
          })),
      }))
      .filter(group => group.workspaces.length > 0)
  }, [snapshot, variant, device.deviceId])

  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<'target' | 'other'>('target')
  const [position, setPosition] = useState<PopoverPosition | null>(null)
  const [pendingTarget, setPendingTarget] = useState<DeviceId | undefined>(undefined)
  const [actionError, setActionError] = useState<string | undefined>(undefined)
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
  const showOtherPanel = variant === 'hero' && otherDevices.length > 0
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
    setActionError(undefined)
    setPanel('target')
    setOpen(true)
  }

  const selectTarget = async (target: DeviceTargetOption): Promise<void> => {
    if (workspace === undefined) return
    setPendingTarget(target.deviceId)
    setActionError(undefined)
    try {
      const result = await clientStore.switchNewSessionDevice(
        getClientServices().uiWorkspace,
        workspace.logicalWorkspaceId,
        target.deviceId,
      )
      if (!result.ok) {
        setActionError(
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

  /** Device-first creation: a remote workspace that already exists on that box. */
  const createOnOtherDevice = async (deviceId: DeviceId, workspaceId: string): Promise<void> => {
    setPendingTarget(deviceId)
    setActionError(undefined)
    try {
      const result = await clientStore.createRemoteSession({ deviceId, workspaceId })
      if (!result.ok || result.sessionId === undefined) {
        setActionError(result.error ?? t('actionFailed'))
        return
      }
      const services = getClientServices()
      services.uiWorkspace?.openSession(result.sessionId)
      void services.sessions?.refresh?.().catch(() => {})
      setOpen(false)
    } finally {
      setPendingTarget(undefined)
    }
  }

  const otherPanel = (
    <div className="dsh-md-device-other">
      <div className="dsh-md-device-other-head">
        <span className="dsh-md-device-popover-name">{t('newOnOtherDeviceTitle')}</span>
        <button
          type="button"
          className="dsh-md-device-other-back"
          onClick={() => {
            setActionError(undefined)
            setPanel('target')
          }}
        >
          {t('back')}
        </button>
      </div>
      <p className="dsh-md-device-popover-hint">{t('newOnOtherDeviceDesc')}</p>
      <div className="dsh-md-device-other-list">
        {otherDevices.map((group) => (
          <div key={group.deviceId} className="dsh-md-device-other-group">
            <div className="dsh-md-device-other-device">
              <StateDot state={deviceStateToDotState(group.state)} size={8} />
              <span className="dsh-md-device-other-name">{group.name}</span>
              {group.state !== 'connected' && (
                <span className="dsh-md-device-other-state">{t('deviceOfflineShort')}</span>
              )}
            </div>
            {group.workspaces.map(target => (
              <button
                key={`${group.deviceId}:${target.workspaceId}`}
                type="button"
                className="dsh-md-device-other-workspace"
                disabled={group.state !== 'connected' || pendingTarget !== undefined}
                onClick={() => {
                  void createOnOtherDevice(group.deviceId, target.workspaceId)
                }}
              >
                <span className="dsh-md-device-other-title" title={target.path}>{target.title}</span>
                <span className="dsh-md-device-other-path" title={target.path}>{target.path}</span>
                {pendingTarget === group.deviceId && (
                  <span className="dsh-md-device-other-state">{t('deviceSwitchPending')}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
      {actionError !== undefined && (
        <p className="dsh-md-device-popover-error" role="alert">{actionError}</p>
      )}
    </div>
  )

  const footer = (
    <div className="dsh-md-device-popover-actions">
      {panel === 'target' && showOtherPanel && (
        <button
          type="button"
          className="dsh-md-device-popover-action"
          onClick={() => {
            setActionError(undefined)
            setPanel('other')
          }}
        >
          {t('newOnOtherDevice')}
        </button>
      )}
      {panel === 'target' && offlineTargets.length > 0 && (
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
  )

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
          {panel === 'other' ? (
            <div
              className="dsh-md-device-popover dsh-md-device-menu"
              role="dialog"
              aria-label={aria}
              style={{ top: position.top, right: position.right }}
            >
              {otherPanel}
              {footer}
            </div>
          ) : canSwitchDevice && workspace !== undefined ? (
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

              {actionError !== undefined && (
                <p className="dsh-md-device-popover-error" role="alert">
                  {actionError}
                </p>
              )}
              <p className="dsh-md-device-popover-hint">{t('deviceSwitchKeepsBlank')}</p>
              {footer}
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
                {device.lastSyncedAt !== undefined && (
                  <>
                    <dt>{t('deviceChipLastSynced')}</dt>
                    <dd>{new Date(device.lastSyncedAt).toLocaleString()}</dd>
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
              {actionError !== undefined && (
                <p className="dsh-md-device-popover-error" role="alert">{actionError}</p>
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
                {showOtherPanel && (
                  <button
                    type="button"
                    className="dsh-md-device-popover-action"
                    onClick={() => {
                      setActionError(undefined)
                      setPanel('other')
                    }}
                  >
                    {t('newOnOtherDevice')}
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

/**
 * Offline-device banner for the opened conversation.
 *
 * Mounted in `conversation.input.dock`, which stays rendered even when the
 * Session history failed to load. The Host holds `session.page/follow` open for
 * a reconnecting device, so this banner is the honest explanation while the
 * skeleton spins, and it offers an immediate reconnect instead of a raw
 * transport error.
 *
 * @module dsh-multi-device/client/OfflineDeviceBanner
 */
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useEffect, useMemo } from 'react'
import type { DeviceId } from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { resolveSessionDevice } from './sessionDevice.ts'
import { clientStore, deviceStateToDotState, useMultiDeviceState } from './state.ts'

type Translate = (key: MultiDeviceLocaleKey) => string

/** Reconnect nudges are cheap but not free: one per device per 15s. */
const NUDGE_INTERVAL_MS = 15_000
const lastNudgeAt = new Map<string, number>()

function nudgeReconnect(deviceId: DeviceId): void {
  const now = Date.now()
  const previous = lastNudgeAt.get(deviceId) ?? 0
  if (now - previous < NUDGE_INTERVAL_MS) return
  lastNudgeAt.set(deviceId, now)
  void clientStore.reconnectDevice(deviceId)
}

export function OfflineDeviceBanner({
  sessionId,
  t,
  onOpenSettings,
}: {
  readonly sessionId: string | undefined
  readonly t: Translate
  readonly onOpenSettings: () => void
}): React.ReactElement | null {
  const state = useMultiDeviceState()
  const snapshot = state.snapshot
  const device = useMemo(
    () => (sessionId === undefined
      ? undefined
      : resolveSessionDevice(snapshot, sessionId, t('nativeLocalTab'))),
    [snapshot, sessionId, t],
  )
  const offline = device !== undefined && !device.isLocal && device.state !== 'connected' && device.state !== 'disabled'

  // The supervisor already backs off; this just accelerates the first attempt
  // when the user lands on an offline conversation and expects it to come back.
  useEffect(() => {
    if (!offline || device === undefined || device.state !== 'error') return
    nudgeReconnect(device.deviceId)
  }, [device, offline])

  if (state.displayMode !== 'aggregated' || !offline || device === undefined) return null

  const attempt = device.reconnectAttempt ?? 0
  const detail = device.state === 'reconnecting' && attempt > 0
    ? t('offlineBannerReconnecting').replace('{count}', String(attempt))
    : t('offlineBannerHint')
  const error = snapshot.devices.find(candidate => candidate.id === device.deviceId)?.lastError

  return (
    <div className="dsh-md-offline-banner" role="status" data-state={device.state}>
      <StateDot state={deviceStateToDotState(device.state)} size={10} />
      <div className="dsh-md-offline-banner-text">
        <span className="dsh-md-offline-banner-title">
          {t('offlineBannerTitle').replace('{name}', device.name)}
        </span>
        <span className="dsh-md-offline-banner-desc">{detail}</span>
        {error !== undefined && error !== '' && (
          <span className="dsh-md-offline-banner-error" title={error}>
            {t('offlineBannerError').replace('{error}', error)}
          </span>
        )}
      </div>
      <div className="dsh-md-offline-banner-actions">
        <button
          type="button"
          className="dsh-md-offline-banner-action"
          onClick={() => {
            void clientStore.reconnectDevice(device.deviceId)
          }}
        >
          {t('offlineBannerRetry')}
        </button>
        <button
          type="button"
          className="dsh-md-offline-banner-action"
          onClick={onOpenSettings}
        >
          {t('offlineBannerSettings')}
        </button>
      </div>
    </div>
  )
}

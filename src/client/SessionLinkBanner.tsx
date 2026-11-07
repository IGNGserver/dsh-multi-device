/**
 * Session-link repair banner.
 *
 * Rendered in `shell.overlay` so it is visible even when the symptom it
 * describes — aggregated Workspaces expanded but empty — means no conversation
 * is open at all. It reports how many referenced Sessions have no summary in
 * the browser store (the "expanded but empty" root cause), whether the repair
 * loop is still in its fast backoff or already retrying persistently, and
 * offers a manual repair (a `sessions.refresh()`, which the Host patches to
 * merge every device).
 *
 * @module dsh-multi-device/client/SessionLinkBanner
 */
import React from 'react'
import { getClientServices } from './clientServices.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { useMultiDeviceState } from './state.ts'

type Translate = (key: MultiDeviceLocaleKey) => string

export function SessionLinkBanner({
  t,
  onOpenSettings,
}: {
  readonly t: Translate
  readonly onOpenSettings: () => void
}): React.ReactElement | null {
  const state = useMultiDeviceState()
  const status = state.sessionLinkStatus
  if (state.displayMode !== 'aggregated' || status === undefined || status.missing <= 0) {
    return null
  }

  const detail = status.lastError !== undefined && status.lastError !== ''
    ? t('sessionLinkBannerError').replace('{error}', status.lastError)
    : status.exhausted
      ? t('sessionLinkBannerExhausted')
      : t('sessionLinkBannerRetrying')

  return (
    <div className="dsh-md-session-link-banner" role="status" data-exhausted={status.exhausted}>
      <div className="dsh-md-offline-banner-text">
        <span className="dsh-md-offline-banner-title">
          {t('sessionLinkBannerTitle').replace('{count}', String(status.missing))}
        </span>
        <span className="dsh-md-offline-banner-desc">{detail}</span>
      </div>
      <div className="dsh-md-offline-banner-actions">
        <button
          type="button"
          className="dsh-md-offline-banner-action"
          onClick={() => void getClientServices().sessions?.refresh?.()}
        >
          {t('sessionLinkBannerRetry')}
        </button>
        <button
          type="button"
          className="dsh-md-offline-banner-action"
          onClick={onOpenSettings}
        >
          {t('sessionLinkBannerSettings')}
        </button>
      </div>
    </div>
  )
}

/**
 * In-app authorization panel for Native Mode.
 *
 * The remote DSH may reject the cookie minted at add-device time (rotated
 * signing secret, restarted server, changed DSH_HOME, Windows remote, …). The
 * old behavior framed the remote's plain-text `401` response, which looked like
 * a blank page with a single line and could not be recovered from inside the
 * iframe: the native proxy strips browser cookies, so signing in there can never
 * persist. This panel keeps the recovery flow on the host side.
 *
 * @module dsh-multi-device/client/AuthPanel
 */
import {
  Button,
  IconChevronLeftOutlineRegular,
  IconRefreshOutlineRegular,
  IconSettingsOutlineRegular,
  Input,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useState } from 'react'
import type { DeviceView } from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { clientStore } from './state.ts'

export function AuthRequiredPanel({
  device,
  t,
  onOpenSettings,
}: {
  device: DeviceView
  t: (key: MultiDeviceLocaleKey) => string
  onOpenSettings: () => void
}): React.ReactElement {
  const [credential, setCredential] = useState('')
  const [busy, setBusy] = useState<'token' | 'ssh' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (viaToken: boolean): Promise<void> => {
    if (busy !== null) return
    if (viaToken && credential.trim() === '') {
      setError(t('authCredentialLabel'))
      return
    }
    setBusy(viaToken ? 'token' : 'ssh')
    setError(null)
    const res = await clientStore.authenticateDevice(
      device.id,
      viaToken ? credential.trim() : undefined,
    )
    setBusy(null)
    if (!res.ok) {
      setError(res.error ?? t('authFailed'))
      return
    }
    setCredential('')
    clientStore.reloadNativeDevice(device.id)
  }

  return (
    <div className="dsh-md-auth-stage">
      <div className="dsh-md-auth-card" role="region" aria-label={t('authPanelTitle')}>
        <div className="dsh-md-auth-badge">
          <StateDot state="error" size={8} />
          {t('authRequired')}
        </div>
        <h3 className="dsh-md-auth-title">{t('authPanelTitle')}</h3>
        <p className="dsh-md-auth-desc">{t('authPanelDesc')}</p>
        {error === null && device.authError !== undefined && device.authError !== '' && (
          <p className="dsh-md-error-text" role="status">
            {device.authError}
          </p>
        )}

        <label className="dsh-md-field-label" htmlFor={`dsh-md-auth-${device.id}`}>
          {t('authCredentialLabel')}
        </label>
        <Input
          id={`dsh-md-auth-${device.id}`}
          value={credential}
          placeholder={t('authTokenPlaceholder')}
          disabled={busy !== null}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setCredential(event.currentTarget.value)}
        />

        {error !== null && (
          <p className="dsh-md-error-text" role="alert">
            {error}
          </p>
        )}

        <div className="dsh-md-auth-actions">
          <Button
            variant="primary"
            size="sm"
            disabled={busy !== null || credential.trim() === ''}
            icon={busy === 'token' ? <StateDot state="ongoing" size={12} /> : undefined}
            onClick={() => { void run(true) }}
          >
            {busy === 'token' ? t('authChecking') : t('authSubmit')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            icon={busy === 'ssh' ? <StateDot state="ongoing" size={12} /> : <IconRefreshOutlineRegular size={13} />}
            onClick={() => { void run(false) }}
          >
            {busy === 'ssh' ? t('authChecking') : t('authUseSsh')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            icon={<IconChevronLeftOutlineRegular size={13} />}
            onClick={() => clientStore.selectLocalNativeTab()}
          >
            {t('authBackLocal')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<IconSettingsOutlineRegular size={13} />}
            onClick={onOpenSettings}
          >
            {t('authOpenSettings')}
          </Button>
        </div>

        <p className="dsh-md-auth-hint">{t('authHint')}</p>
      </div>
    </div>
  )
}

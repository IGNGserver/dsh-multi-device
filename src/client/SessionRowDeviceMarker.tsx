/**
 * Optional device marker in a Session row's leading cell.
 *
 * The official `sidebar.session.row.leading` seat is 16px wide and is only
 * mounted while the row's primary state is idle (a running/approval row shows
 * its own status dot there). That makes it a good place for a *quiet* identity
 * hint, never a replacement for the status dot: the letter identifies the
 * device, the badge in the corner reports offline/reconnecting.
 *
 * Disabled by default (`ui.sessionRowDeviceDot`); aggregated mode only, so the
 * local Native Mode page keeps rows byte-for-byte identical to stock DSH.
 *
 * @module dsh-multi-device/client/SessionRowDeviceMarker
 */
import React from 'react'
import { decodeSessionId } from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { resolveSessionDevice } from './sessionDevice.ts'
import { useMultiDeviceState } from './state.ts'

type Translate = (key: MultiDeviceLocaleKey) => string

function initialOf(name: string): string {
  const chars = Array.from(name.trim())
  return chars.length === 0 ? '?' : chars[0]!.toUpperCase()
}

export function SessionRowDeviceMarker({
  sessionId,
  t,
}: {
  readonly sessionId: string
  readonly t: Translate
}): React.ReactElement | null {
  const state = useMultiDeviceState()
  if (state.displayMode !== 'aggregated') return null
  if (state.snapshot.ui?.sessionRowDeviceDot !== true) return null
  if (!decodeSessionId(sessionId).isRemote) return null

  const device = resolveSessionDevice(state.snapshot, sessionId, t('nativeLocalTab'))
  const label = `${t('hoverDeviceLabel')}: ${device.name}`
  return (
    <span
      className="dsh-md-row-device"
      data-state={device.state}
      title={label}
      aria-label={label}
      role="img"
    >
      <span className="dsh-md-row-device-letter">{initialOf(device.name)}</span>
      {device.state !== 'connected' && <span className="dsh-md-row-device-badge" />}
    </span>
  )
}

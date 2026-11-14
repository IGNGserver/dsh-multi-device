import type { SiteCopy } from '../data/copy'
import type { DeviceRecord, Locale } from '../types'
import { summarizeDeviceAttention } from '../utils/attention'
import { LaptopIcon, ServerIcon } from './Icons'

interface MiniDshWindowProps {
  readonly device: DeviceRecord
  readonly locale: Locale
  readonly copy: SiteCopy
  readonly onDockDevice: (deviceId: string) => void
}

export function MiniDshWindow({
  device,
  locale,
  copy,
  onDockDevice,
}: MiniDshWindowProps) {
  const attention = summarizeDeviceAttention(device)
  const activeSession =
    device.sessions.find((s) => s.id === device.activeSessionId) ?? device.sessions[0]
  const latestBlock = activeSession?.blocks[activeSession.blocks.length - 1]
  const workspace = device.workspaces[0]

  return (
    <button
      type="button"
      className="scattered-card"
      data-testid={`scattered-card-${device.id}`}
      onClick={() => onDockDevice(device.id)}
      aria-label={`${device.name} — ${copy.hero.dockThisWindow}`}
    >
      <div className="scattered-card__chrome">
        <div className="scattered-card__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="scattered-card__host">{device.sshSummary}</span>
        <span className="scattered-card__os">{device.osLabel}</span>
      </div>

      <div className="scattered-card__body">
        <div className="scattered-card__header">
          <span className="scattered-card__title">
            {device.isLocal ? <LaptopIcon /> : <ServerIcon />}
            <span>{device.name}</span>
          </span>
          {attention.segments.length > 0 && (
            <span className="scattered-card__pills">
              {attention.segments.map((seg) => (
                <span
                  key={seg.tone}
                  className={`scattered-card__pill scattered-card__pill--${seg.tone}`}
                >
                  {seg.count}
                </span>
              ))}
            </span>
          )}
        </div>

        <div className="scattered-card__meta">
          <span className="scattered-card__workspace">{workspace?.name ?? 'workspace'}</span>
          <span>·</span>
          <span className="scattered-card__session">
            {activeSession ? activeSession.title[locale] : ''}
          </span>
        </div>

        {latestBlock && (
          <p className="scattered-card__preview">
            {latestBlock.content[locale]}
          </p>
        )}

        <div className="scattered-card__footer">
          <span className="scattered-card__pain">{device.scatteredNote[locale]}</span>
          <span className="scattered-card__cta">{copy.hero.dockThisWindow} →</span>
        </div>
      </div>
    </button>
  )
}

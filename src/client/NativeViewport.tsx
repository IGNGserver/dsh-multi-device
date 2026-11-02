/**
 * Native Mode Keep-Alive Viewport (`NativeViewport`).
 *
 * Loads the complete DSH Web UI of any configured remote device inside DSH Desktop / Web,
 * preserving the remote device's DSH version, theme, installed plugins, and live WebSocket state.
 *
 * Keep-Alive Mechanism:
 * - Every device in `keepAliveDeviceIds` stays mounted in the DOM simultaneously.
 * - Inactive devices or backgrounded Native Mode use `display: none` + `visibility: hidden`
 *   instead of unmounting, so switching between devices or toggling between Aggregated Mode
 *   and Native Mode takes 0ms and never drops active conversations or composer drafts.
 * - Supports Electron Desktop's `<webview>` guest bridge (`globalThis.dshDesktop?.browser`)
 *   as well as standard `<iframe>` pointed at the pre-authenticated local `nativeProxyUrl`.
 *
 * @module dsh-multi-device/client/NativeViewport
 */
import React, { useEffect, useRef, useState } from 'react'
import type { DeviceId, DeviceView } from '../contract.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { clientStore, useMultiDeviceState } from './state.ts'

interface DesktopBrowserBridgeLike {
  acquire(workspace: string): Promise<{ lease: string; partition: string }>
  release(lease: string): Promise<void>
}

function getDesktopBrowserBridge(): DesktopBrowserBridgeLike | undefined {
  const desktop = (globalThis as unknown as {
    dshDesktop?: { protocolVersion?: number; browser?: DesktopBrowserBridgeLike }
  }).dshDesktop
  return desktop?.protocolVersion === 1 ? desktop.browser : undefined
}

/**
 * Single device's persistent frame (Electron `<webview>` when available and permitted,
 * or standard authenticated `<iframe>`).
 */
function KeepAliveDeviceFrame({
  device,
  active,
  reloadCount,
}: {
  device: DeviceView
  active: boolean
  reloadCount: number
}): React.ReactElement {
  const targetUrl = device.nativeProxyUrl ?? device.effectiveBaseUrl
  const containerRef = useRef<HTMLDivElement | null>(null)
  const webviewLeaseRef = useRef<string | undefined>(undefined)
  const [webviewFailed, setWebviewFailed] = useState(false)

  useEffect(() => {
    setWebviewFailed(false)
    const bridge = getDesktopBrowserBridge()
    const container = containerRef.current
    if (bridge === undefined || container === null || targetUrl === undefined) return

    let cancelled = false
    let currentEl: HTMLElement | undefined

    void bridge
      .acquire(`multi-device:${device.id}`)
      .then((reservation) => {
        if (cancelled || containerRef.current === null) {
          void bridge.release(reservation.lease)
          return
        }
        webviewLeaseRef.current = reservation.lease
        const webview = document.createElement('webview')
        webview.className = 'dsh-md-native-iframe'
        webview.setAttribute('name', reservation.lease)
        webview.setAttribute('partition', reservation.partition)
        webview.setAttribute('allowpopups', '')
        webview.setAttribute('src', `about:blank#${reservation.lease}`)
        webview.addEventListener('did-fail-load', () => {
          if (!cancelled) setWebviewFailed(true)
        }, { once: true })
        webview.addEventListener(
          'dom-ready',
          () => {
            try {
              const wv = webview as unknown as { getURL?: () => string; loadURL?: (u: string) => Promise<void> }
              if (wv.getURL?.().startsWith('about:blank#')) {
                void wv.loadURL?.(targetUrl)
              }
            } catch {
              if (!cancelled) setWebviewFailed(true)
            }
          },
          { once: true },
        )
        currentEl = webview
        container.innerHTML = ''
        container.appendChild(webview)
      })
      .catch(() => {
        // Fall back to the standard authenticated iframe below.
        if (!cancelled) setWebviewFailed(true)
      })

    return () => {
      cancelled = true
      currentEl?.remove()
      const lease = webviewLeaseRef.current
      webviewLeaseRef.current = undefined
      if (lease !== undefined) {
        void bridge.release(lease).catch(() => {})
      }
    }
  }, [device.id, targetUrl, reloadCount])

  const useDesktopWebview = getDesktopBrowserBridge() !== undefined && !webviewFailed

  return (
    <div
      className="dsh-md-native-frame-wrap"
      style={{
        display: active ? 'flex' : 'none',
        visibility: active ? 'visible' : 'hidden',
      }}
      data-device-id={device.id}
      data-active={active ? 'true' : 'false'}
    >
      {targetUrl === undefined ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: 24,
          }}
        >
          <span className="dsh-md-dot" data-state={device.state} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>{device.name}</div>
          <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #9ca3af)' }}>
            {device.lastError ?? device.targetSummary}
          </div>
          <button
            type="button"
            className="dsh-md-btn dsh-md-btn-primary"
            onClick={() => {
              void clientStore.reconnectDevice(device.id)
            }}
          >
            Reconnect
          </button>
        </div>
      ) : useDesktopWebview ? (
        <div ref={containerRef} className="dsh-md-native-iframe" />
      ) : (
        <iframe
          key={`${device.id}:${reloadCount}`}
          className="dsh-md-native-iframe"
          src={targetUrl}
          title={`DSH Native - ${device.name}`}
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  )
}

export function NativeViewport({
  t,
  embedded = false,
  onOpenSettings,
}: {
  t: (key: MultiDeviceLocaleKey) => string
  embedded?: boolean
  onOpenSettings?: () => void
}): React.ReactElement {
  const state = useMultiDeviceState()
  const { devices } = state.snapshot
  const activeDevice =
    devices.find(d => d.id === state.activeNativeDeviceId) ?? devices[0]

  // Keep all keep-alive devices plus the currently selected device mounted
  const mountedDeviceIds = new Set<DeviceId>(state.keepAliveDeviceIds)
  if (activeDevice !== undefined) mountedDeviceIds.add(activeDevice.id)
  const mountedDevices = devices.filter(d => mountedDeviceIds.has(d.id))

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: embedded ? 480 : 0,
        height: '100%',
      }}
    >
      <div className="dsh-md-native-toolbar" style={embedded ? { paddingLeft: 12 } : undefined}>
        {!embedded && (
          <button
            type="button"
            className="dsh-md-btn dsh-md-btn-primary"
            onClick={() => clientStore.setDisplayMode('aggregated')}
          >
            ← {t('switchToAggregated')}
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, overflowX: 'auto' }}>
          {devices.map((dev) => {
            const isSelected = dev.id === activeDevice?.id
            const isKeptAlive = state.keepAliveDeviceIds.includes(dev.id)
            return (
              <div
                key={dev.id}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
              >
                <button
                  type="button"
                  className="dsh-md-device-pill"
                  data-active={isSelected ? 'true' : 'false'}
                  onClick={() => clientStore.selectNativeDevice(dev.id)}
                >
                  <span className="dsh-md-dot" data-state={dev.state} />
                  <span>{dev.name}</span>
                  {dev.runningSessionCount > 0 && (
                    <span className="dsh-md-badge" style={{ color: '#60a5fa' }}>
                      {dev.runningSessionCount} run
                    </span>
                  )}
                  {dev.latencyMs !== undefined && (
                    <span style={{ opacity: 0.65 }}>{dev.latencyMs}ms</span>
                  )}
                  {isKeptAlive && (
                    <span title={t('keepAliveActive')} style={{ color: '#10b981', fontSize: 10 }}>
                      ●
                    </span>
                  )}
                </button>
                {isKeptAlive && (
                  <button
                    type="button"
                    title={t('releaseKeepAlive')}
                    onClick={() => clientStore.releaseKeepAliveDevice(dev.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--dsw-alias-label-tertiary, #9ca3af)',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: '0 3px',
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {activeDevice !== undefined && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="dsh-md-btn"
              title={t('reloadPage')}
              onClick={() => clientStore.reloadNativeDevice(activeDevice.id)}
            >
              ↻ {t('reloadPage')}
            </button>
            {(activeDevice.nativeProxyUrl ?? activeDevice.effectiveBaseUrl) !== undefined && (
              <button
                type="button"
                className="dsh-md-btn"
                title={t('openExternal')}
                onClick={() => {
                  const url = activeDevice.nativeProxyUrl ?? activeDevice.effectiveBaseUrl
                  if (url !== undefined) window.open(url, '_blank', 'noopener,noreferrer')
                }}
              >
                ↗ {t('openExternal')}
              </button>
            )}
          </div>
        )}

        {onOpenSettings !== undefined && (
          <button type="button" className="dsh-md-btn" onClick={onOpenSettings}>
            ⚙ {t('tabDevices')}
          </button>
        )}
      </div>

      <div className="dsh-md-native-stage">
        {devices.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: 32,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600 }}>{t('noDevicesTitle')}</div>
            <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary, #9ca3af)', maxWidth: 420, textAlign: 'center' }}>
              {t('noDevicesDesc')}
            </div>
            {onOpenSettings !== undefined && (
              <button type="button" className="dsh-md-btn dsh-md-btn-primary" onClick={onOpenSettings}>
                + {t('addDevice')}
              </button>
            )}
          </div>
        ) : (
          mountedDevices.map((dev) => (
            <KeepAliveDeviceFrame
              key={dev.id}
              device={dev}
              active={dev.id === activeDevice?.id}
              reloadCount={state.reloadCounters[dev.id] ?? 0}
            />
          ))
        )}
      </div>
    </div>
  )
}

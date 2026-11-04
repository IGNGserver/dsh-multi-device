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
 *   and Native Mode preserves the live WebSocket, conversations, and composer drafts.
 *   Chromium may throttle timers/rendering in hidden frames; state is kept, but background
 *   pages are not guaranteed to paint or poll at full speed.
 * - Supports Electron Desktop's `<webview>` guest bridge (`globalThis.dshDesktop?.browser`)
 *   as well as standard `<iframe>` pointed at the pre-authenticated local `nativeProxyUrl`.
 *
 * @module dsh-multi-device/client/NativeViewport
 */
import {
  Button,
  IconChevronLeftOutlineRegular,
  IconCloseOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconRightUpOutlineRegular,
  IconSettingsOutlineRegular,
  Pill,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useEffect, useRef, useState } from 'react'
import type { DeviceId, DeviceView } from '../contract.ts'
import { AuthRequiredPanel } from './AuthPanel.tsx'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { clientStore, deviceStateToDotState, useMultiDeviceState } from './state.ts'

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
  t,
  onOpenSettings,
}: {
  device: DeviceView
  active: boolean
  reloadCount: number
  t: (key: MultiDeviceLocaleKey) => string
  onOpenSettings: () => void
}): React.ReactElement {
  const targetUrl = device.nativeProxyUrl ?? device.effectiveBaseUrl
  const authRequired = device.authState === 'required' || device.authState === 'error'
  const containerRef = useRef<HTMLDivElement | null>(null)
  const webviewLeaseRef = useRef<string | undefined>(undefined)
  const [webviewFailed, setWebviewFailed] = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)

  useEffect(() => {
    setWebviewFailed(false)
    if (authRequired) return
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
  }, [device.id, targetUrl, reloadCount, authRequired])

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
      {authRequired ? (
        <AuthRequiredPanel device={device} t={t} onOpenSettings={onOpenSettings} />
      ) : targetUrl === undefined ? (
        <div className="dsh-md-native-placeholder">
          <StateDot state={deviceStateToDotState(device.state)} size={12} />
          <div className="dsh-md-row-name">{device.name}</div>
          <div className="dsh-md-pref-desc">
            {reconnectError ?? device.lastError ?? device.targetSummary}
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<IconRefreshOutlineRegular size={13} />}
            onClick={() => {
              void clientStore.reconnectDevice(device.id).then((res) => {
                setReconnectError(res.ok ? null : res.error ?? t('actionFailed'))
              })
            }}
          >
            {t('reconnect')}
          </Button>
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
  const isNative = state.displayMode === 'native'
  const exitButtonRef = useRef<HTMLButtonElement | null>(null)
  const activeDevice =
    devices.find(d => d.id === state.activeNativeDeviceId) ?? devices[0]

  // Esc is the universal escape hatch: the toolbar is the only chrome in Native
  // Mode, so a keyboard fallback must never depend on focus staying on the host.
  useEffect(() => {
    if (!isNative) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      clientStore.setDisplayMode('aggregated')
    }
    window.addEventListener('keydown', onKeyDown, true)
    const focusTimer = window.setTimeout(() => exitButtonRef.current?.focus(), 60)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.clearTimeout(focusTimer)
    }
  }, [isNative])

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
          <Button
            ref={exitButtonRef}
            variant="outline"
            size="sm"
            className="dsh-md-native-exit"
            title={t('nativeExitHint')}
            icon={<IconChevronLeftOutlineRegular size={14} />}
            onClick={() => clientStore.setDisplayMode('aggregated')}
          >
            {t('switchToAggregated')}
          </Button>
        )}

        <div className="dsh-md-native-tabs">
          {devices.map((dev) => {
            const isSelected = dev.id === activeDevice?.id
            const isKeptAlive = state.keepAliveDeviceIds.includes(dev.id)
            return (
              <div key={dev.id} className="dsh-md-native-tab-item">
                <Pill
                  active={isSelected}
                  onClick={() => clientStore.selectNativeDevice(dev.id)}
                >
                  <span className="dsh-md-pill-inner">
                    <StateDot state={deviceStateToDotState(dev.state)} size={8} />
                    <span>{dev.name}</span>
                    {dev.runningSessionCount > 0 && (
                      <span className="dsh-md-muted">
                        {t('runningCount').replace('{count}', String(dev.runningSessionCount))}
                      </span>
                    )}
                    {dev.latencyMs !== undefined && (
                      <span className="dsh-md-muted">{dev.latencyMs}ms</span>
                    )}
                  </span>
                </Pill>
                {isKeptAlive && (
                  <Tooltip label={t('releaseKeepAlive')} side="bottom">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('releaseKeepAlive')}
                      onClick={() => clientStore.releaseKeepAliveDevice(dev.id)}
                    >
                      <IconCloseOutlineRegular size={12} />
                    </Button>
                  </Tooltip>
                )}
              </div>
            )
          })}
        </div>

        {activeDevice !== undefined && (
          <div className="dsh-md-native-tab-item">
            <Tooltip label={t('reloadPage')} side="bottom">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('reloadPage')}
                onClick={() => clientStore.reloadNativeDevice(activeDevice.id)}
              >
                <IconRefreshOutlineRegular size={14} />
              </Button>
            </Tooltip>
            {(activeDevice.nativeProxyUrl ?? activeDevice.effectiveBaseUrl) !== undefined && (
              <Tooltip label={t('openExternal')} side="bottom">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('openExternal')}
                  onClick={() => {
                    const url = activeDevice.nativeProxyUrl ?? activeDevice.effectiveBaseUrl
                    if (url !== undefined) window.open(url, '_blank', 'noopener,noreferrer')
                  }}
                >
                  <IconRightUpOutlineRegular size={14} />
                </Button>
              </Tooltip>
            )}
          </div>
        )}

        {onOpenSettings !== undefined && (
          <Tooltip label={t('settingsSectionTitle')} side="bottom">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('settingsSectionTitle')}
              onClick={onOpenSettings}
            >
              <IconSettingsOutlineRegular size={14} />
            </Button>
          </Tooltip>
        )}
      </div>

      <div className="dsh-md-native-stage">
        {devices.length === 0 ? (
          <div className="dsh-md-native-placeholder">
            <div className="dsh-md-row-name">{t('noDevicesTitle')}</div>
            <div className="dsh-md-pref-desc" style={{ maxWidth: 420 }}>
              {t('noDevicesDesc')}
            </div>
            {onOpenSettings !== undefined && (
              <Button
                variant="primary"
                size="sm"
                icon={<IconPlusOutlineRegular size={13} />}
                onClick={onOpenSettings}
              >
                {t('addDevice')}
              </Button>
            )}
          </div>
        ) : (
          mountedDevices.map((dev) => (
            <KeepAliveDeviceFrame
              key={dev.id}
              device={dev}
              active={dev.id === activeDevice?.id}
              reloadCount={state.reloadCounters[dev.id] ?? 0}
              t={t}
              onOpenSettings={onOpenSettings ?? (() => {})}
            />
          ))
        )}
      </div>
    </div>
  )
}

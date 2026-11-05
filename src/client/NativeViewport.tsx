/**
 * Native Mode tab bar and keep-alive viewport.
 *
 * Native Mode is a tab strip that never disappears:
 * - 本机 (leftmost) reveals the unmodified local DSH page; it is not an iframe.
 * - Every configured remote device opens its complete remote DSH Web UI below
 *   the same strip. There is deliberately no "Back to Aggregated" control;
 *   the mode is switched from Settings.
 *
 * Keep-Alive:
 * - Every device in `keepAliveDeviceIds` stays mounted in the DOM.
 * - Inactive devices are hidden with `display: none` instead of unmounting, so
 *   switching tabs or entering Aggregated Mode preserves live WebSocket state,
 *   conversations, and composer drafts.
 * - Supports Electron Desktop's `<webview>` guest bridge
 *   (`globalThis.dshDesktop?.browser`) and a standard authenticated `<iframe>`.
 *
 * @module dsh-multi-device/client/NativeViewport
 */
import {
  Button,
  IconCloseOutlineRegular,
  IconGlobeOutlineRegular,
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

/**
 * Always-visible Native Mode tab strip. 本机 is the first tab and the stable
 * fallback when no remote device is selected.
 */
export function NativeTabBar({
  t,
  onOpenSettings,
}: {
  t: (key: MultiDeviceLocaleKey) => string
  onOpenSettings: () => void
}): React.ReactElement | null {
  const state = useMultiDeviceState()
  const { devices } = state.snapshot
  if (state.displayMode !== 'native') return null

  const activeDevice = devices.find(device => device.id === state.activeNativeDeviceId)
  const localActive = activeDevice === undefined

  return (
    <div className="dsh-md-native-bar">
      <div className="dsh-md-native-tabs" role="tablist" aria-label={t('nativeTabsLabel')}>
        <div className="dsh-md-native-tab-item">
          <Pill
            active={localActive}
            role="tab"
            aria-selected={localActive}
            onClick={() => clientStore.selectLocalNativeTab()}
          >
            <span className="dsh-md-pill-inner">
              <IconGlobeOutlineRegular size={13} />
              <span>{t('nativeLocalTab')}</span>
            </span>
          </Pill>
        </div>

        {devices.map((dev) => {
          const isSelected = dev.id === state.activeNativeDeviceId
          const isKeptAlive = state.keepAliveDeviceIds.includes(dev.id)
          return (
            <div key={dev.id} className="dsh-md-native-tab-item">
              <Pill
                active={isSelected}
                role="tab"
                aria-selected={isSelected}
                onClick={() => { void clientStore.selectNativeDevice(dev.id) }}
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
        <div className="dsh-md-native-bar-actions">
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
    </div>
  )
}

/**
 * Keep-Alive remote viewports below the tab bar. The local DSH page is never
 * rendered here: when 本机 is active this stage is hidden and the host frame
 * underneath remains visible and interactive.
 */
export function NativeViewport({
  t,
  onOpenSettings,
}: {
  t: (key: MultiDeviceLocaleKey) => string
  onOpenSettings: () => void
}): React.ReactElement {
  const state = useMultiDeviceState()
  const { devices } = state.snapshot
  const isNative = state.displayMode === 'native'
  const activeDevice = devices.find(device => device.id === state.activeNativeDeviceId)

  // Keep all keep-alive devices plus the currently selected device mounted.
  const mountedDeviceIds = new Set<DeviceId>(state.keepAliveDeviceIds)
  if (activeDevice !== undefined) mountedDeviceIds.add(activeDevice.id)
  const mountedDevices = devices.filter(device => mountedDeviceIds.has(device.id))
  const visible = isNative && activeDevice !== undefined

  return (
    <div
      className="dsh-md-native-stage"
      data-visible={visible ? 'true' : 'false'}
      aria-hidden={!visible}
    >
      {mountedDevices.map((device) => (
        <KeepAliveDeviceFrame
          key={device.id}
          device={device}
          active={visible && device.id === activeDevice?.id}
          reloadCount={state.reloadCounters[device.id] ?? 0}
          t={t}
          onOpenSettings={onOpenSettings}
        />
      ))}
    </div>
  )
}

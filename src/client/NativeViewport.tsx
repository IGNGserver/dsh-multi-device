/**
 * The device tab strip and its keep-alive viewports.
 *
 * The strip never disappears:
 * - 本机 (leftmost) reveals the unmodified local DSH page; it is not an iframe.
 * - Every configured remote device opens its complete remote DSH Web UI below
 *   the same strip.
 * - Each tab carries its owner's unread completion count (本机 included), so a
 *   finished conversation on another device stays visible without switching.
 *   Archived and subagent Sessions never get a standalone row and are excluded.
 *
 * Keep-Alive:
 * - Every device in `keepAliveDeviceIds` stays mounted in the DOM.
 * - Inactive devices are hidden with `display: none` instead of unmounting, so
 *   switching tabs preserves live WebSocket state, conversations and drafts.
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
  IconWarningOutlineRegular,
  Pill,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LOCAL_DEVICE_ID, type DeviceId, type DeviceView } from '../contract.ts'
import { AuthRequiredPanel } from './AuthPanel.tsx'
import {
  type NativeBarMetrics,
  measureNativeBar,
  recordNativeBarMetrics,
} from './barMetrics.ts'
import { attentionUnreadIds } from '../attention.ts'
import { AttentionDetails } from './AttentionDetails.tsx'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { assessBrowserNativeAccess } from '../host/browser-relay.ts'
import { clientStore, deviceStateToDotState, useMultiDeviceState } from './state.ts'
import { countableUnreadIds, EMPTY_UNREAD_SESSION_IDS, groupUnreadSessionIds } from './unreadCounts.ts'

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

function postWebviewVisibility(webview: HTMLElement, visible: boolean): void {
  try {
    const pending = (webview as HTMLElement & {
      executeJavaScript?: (code: string) => Promise<unknown>
    }).executeJavaScript?.(
      `window.postMessage(${JSON.stringify({ __dshMdVisibility: true, visible })}, '*')`,
    )
    if (pending !== undefined) void pending.catch(() => { /* guest not ready */ })
  } catch { /* guest may not be attached yet */ }
}

/**
 * Single device's persistent frame (Electron `<webview>` when available and permitted,
 * or standard authenticated `<iframe>`).
 */
export function KeepAliveDeviceFrame({
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
  const access = assessBrowserNativeAccess({
    pageUrl: typeof window === 'undefined' ? 'http://127.0.0.1:3080/' : window.location.href ?? `${window.location.protocol}//${window.location.hostname}:3080/`,
    proxyUrl: device.nativeProxyUrl,
    desktopGuest: getDesktopBrowserBridge() !== undefined,
  })
  const embeddingError = access.status === 'available' ? undefined : access.message
  const proxyUrl = access.status === 'available' ? access.url : undefined
  const targetUrl = proxyUrl === undefined ? undefined : (() => {
    try {
      const url = new URL(proxyUrl)
      url.searchParams.set('md_client', clientStore.clientId)
      return url.href
    } catch {
      return proxyUrl
    }
  })()
  const authRequired = device.authState === 'required' || device.authState === 'error'
  const containerRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef(active)
  const attemptKey = `${device.id}:${targetUrl ?? ''}:${reloadCount}`
  const [failedAttempt, setFailedAttempt] = useState<string | undefined>(undefined)
  const useDesktopWebview = getDesktopBrowserBridge() !== undefined && failedAttempt !== attemptKey
  const [reconnectError, setReconnectError] = useState<string | null>(null)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  // The frame is cross-origin, so the shell tells it whether its tab/pane is
  // currently displayed. The bridge uses this signal to gate unread clearing;
  // IntersectionObserver remains the fallback when the guest cannot be reached.
  useEffect(() => {
    if (targetUrl === undefined) return
    const message = { __dshMdVisibility: true, visible: active }
    const postVisibility = (): void => {
      const wrapper = frameRef.current
      if (wrapper === null) return
      const iframe = wrapper.querySelector('iframe')
      if (iframe !== null) {
        let origin = '*'
        try { origin = new URL(targetUrl).origin } catch { /* keep wildcard */ }
        try {
          iframe.contentWindow?.postMessage(message, origin)
        } catch { /* frame may be navigating */ }
        return
      }
      // Electron `<webview>` guests expose no `contentWindow`; post the same
      // message from inside the guest so a desktop tab does not depend on the
      // in-page IntersectionObserver alone to report visibility.
      const webview = wrapper.querySelector<HTMLElement>('webview')
      if (webview !== null) postWebviewVisibility(webview, active)
    }
    postVisibility()
    const first = window.setTimeout(postVisibility, 150)
    // A cold `<webview>` can finish loading its guest after the first probe.
    const second = window.setTimeout(postVisibility, 800)
    return () => {
      window.clearTimeout(first)
      window.clearTimeout(second)
    }
  }, [active, targetUrl, reloadCount, useDesktopWebview])

  // Switching a tab changes visibility, but does not move DOM focus. Without a
  // deliberate handoff, keystrokes and Ctrl/Cmd+C can stay in the previous
  // hidden frame. Focus the newly active page once it is rendered.
  useEffect(() => {
    if (!active) return
    const focusFrame = (): void => {
      const wrapper = frameRef.current
      if (wrapper === null) return
      const webview = wrapper.querySelector('webview') as HTMLElement | null
      if (webview !== null) {
        try { webview.focus() } catch { /* webview may not be attached yet */ }
        return
      }
      const iframe = wrapper.querySelector('iframe')
      try { iframe?.contentWindow?.focus() } catch { /* cross-origin focus is best-effort */ }
    }
    focusFrame()
    const timer = window.setTimeout(focusFrame, 120)
    return () => window.clearTimeout(timer)
  }, [active])

  useEffect(() => {
    if (authRequired || !useDesktopWebview) return
    const bridge = getDesktopBrowserBridge()
    const container = containerRef.current
    if (bridge === undefined || container === null || targetUrl === undefined) return

    let cancelled = false
    let currentEl: HTMLElement | undefined
    let lease: string | undefined
    const release = (): void => {
      const owned = lease
      lease = undefined
      if (owned !== undefined) void bridge.release(owned).catch(() => {})
    }
    const fail = (): void => {
      if (!cancelled) setFailedAttempt(attemptKey)
    }

    void bridge.acquire(`multi-device:${device.id}`).then((reservation) => {
      lease = reservation.lease
      if (cancelled || containerRef.current !== container) {
        release()
        return
      }
      const webview = document.createElement('webview')
      currentEl = webview
      webview.className = 'dsh-md-native-iframe'
      webview.setAttribute('name', reservation.lease)
      webview.setAttribute('partition', reservation.partition)
      webview.setAttribute('allowpopups', '')
      webview.setAttribute('src', `about:blank#${reservation.lease}`)
      webview.addEventListener('did-fail-load', fail, { once: true })
      webview.addEventListener('dom-ready', () => {
        if (!cancelled) postWebviewVisibility(webview, activeRef.current)
      })
      webview.addEventListener('dom-ready', () => {
        if (cancelled) return
        try {
          if (activeRef.current) webview.focus()
        } catch { /* focus is best-effort */ }
        try {
          const wv = webview as unknown as { getURL?: () => string; loadURL?: (u: string) => Promise<void> }
          if (wv.getURL?.().startsWith('about:blank#')) {
            void wv.loadURL?.(targetUrl)?.then(() => {
              if (!cancelled) postWebviewVisibility(webview, activeRef.current)
            }).catch(fail)
          }
        } catch { fail() }
      }, { once: true })
      container.appendChild(webview)
    }).catch(fail)

    return () => {
      cancelled = true
      currentEl?.remove()
      release()
    }
    // A failed attempt renders an iframe. Retrying changes attemptKey during
    // render, so the container exists BEFORE this effect reacquires a lease.
    // Each effect owns its lease, including late acquire results after unmount.
  }, [device.id, targetUrl, attemptKey, authRequired, useDesktopWebview])

  return (
    <div
      ref={frameRef}
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
            {embeddingError !== undefined ? embeddingError : reconnectError ?? device.lastError ?? device.targetSummary}
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
          allow="clipboard-write; clipboard-read; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
          onLoad={(event) => {
            if (targetUrl === undefined) return
            let origin = '*'
            try { origin = new URL(targetUrl).origin } catch { /* keep wildcard */ }
            try {
              event.currentTarget.contentWindow?.postMessage(
                { __dshMdVisibility: true, visible: active },
                origin,
              )
              if (active) event.currentTarget.contentWindow?.focus()
            } catch { /* frame may be navigating */ }
          }}
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
  const [bar, setBar] = useState<NativeBarMetrics | undefined>(undefined)
  const barRef = useRef<HTMLDivElement | null>(null)

  // Clamp the strip to what the viewport can actually show. A frame wider than
  // the window (a Desktop shell that is wider than the viewport) would
  // otherwise push the right-aligned Settings gear off-screen.
  useEffect(() => {
    const measure = (): void => {
      if (typeof window === 'undefined') return
      const rect = barRef.current?.getBoundingClientRect()
      const metrics = measureNativeBar({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        left: rect?.left ?? 0,
        width: rect?.width ?? 0,
      })
      recordNativeBarMetrics(metrics)
      setBar(previous =>
        previous !== undefined
        && previous.clampedWidth === metrics.clampedWidth
        && previous.compact === metrics.compact
        && previous.barLeft === metrics.barLeft
          ? previous
          : metrics)
    }
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    if (observer !== undefined && barRef.current !== null) observer.observe(barRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
      recordNativeBarMetrics(undefined)
    }
  }, [])

  // Count only unread Sessions that DSH can actually show as rows: archived
  // completions and subagent children never appear in the sidebar, and a
  // remote ID that is no longer in any catalog is a deleted Session whose
  // persisted marker must not keep the badge alive.
  const attentionByDevice = state.snapshot.attentionByDevice
  const unread = attentionByDevice !== undefined
    ? attentionUnreadIds(attentionByDevice)
    : countableUnreadIds(
        state.snapshot.unreadSessionIds,
        state.snapshot.archivedSessionIds,
        state.snapshot.subagentSessionIds,
      )
  const unreadByDevice = groupUnreadSessionIds(unread)

  const activeDevice = devices.find(device => device.id === state.activeNativeDeviceId)
  const localActive = activeDevice === undefined

  const compact = bar?.compact === true
  const clipped = bar === undefined ? false : bar.barWidth > bar.clampedWidth + 1

  const settingsButton = (
    <Tooltip label={t('settingsSectionTitle')} side="bottom" align={compact ? 'start' : 'end'}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('settingsSectionTitle')}
        onClick={onOpenSettings}
      >
        <IconSettingsOutlineRegular size={14} />
      </Button>
    </Tooltip>
  )

  return (
    <div
      className="dsh-md-native-bar"
      ref={barRef}
      data-compact={compact ? 'true' : 'false'}
      data-clipped={clipped ? 'true' : 'false'}
      data-mode="native"
      style={bar !== undefined && bar.clampedWidth > 0 ? { maxWidth: bar.clampedWidth } : undefined}
    >
      {compact && <div className="dsh-md-native-bar-leading">{settingsButton}</div>}

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
          <AttentionDetails
            view={attentionByDevice?.[LOCAL_DEVICE_ID]}
            deviceName={t('nativeLocalTab')}
            t={t}
            nativeBar
            fallback={{ unreadSessionIds: unreadByDevice.get(LOCAL_DEVICE_ID) ?? EMPTY_UNREAD_SESSION_IDS, fresh: attentionByDevice === undefined }}
          />
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

                  {dev.latencyMs !== undefined && (
                    <span className="dsh-md-muted">{dev.latencyMs}ms</span>
                  )}
                </span>
              </Pill>
              <AttentionDetails
                view={attentionByDevice?.[dev.id]}
                deviceName={dev.name}
                t={t}
                nativeBar
                fallback={{
                  runningCount: attentionByDevice === undefined ? dev.runningSessionCount : undefined,
                  pendingCount: attentionByDevice === undefined ? dev.pendingApprovalCount : undefined,
                  unreadSessionIds: unreadByDevice.get(dev.id) ?? EMPTY_UNREAD_SESSION_IDS,
                  fresh: attentionByDevice === undefined && dev.state === 'connected' && dev.catalogStale !== true,
                }}
              />
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
                  const access = assessBrowserNativeAccess({ pageUrl: window.location.href, proxyUrl: activeDevice.nativeProxyUrl, desktopGuest: getDesktopBrowserBridge() !== undefined })
                  if (access.status === 'available') window.open(access.url, '_blank', 'noopener,noreferrer')
                }}
              >
                <IconRightUpOutlineRegular size={14} />
              </Button>
            </Tooltip>
          )}
        </div>
      )}

      {!compact && <span className="dsh-md-native-bar-sep" aria-hidden="true" />}

      {!compact && settingsButton}
    </div>
  )
}

/**
 * Remote device viewports: one full frame per mounted device, directly below
 * the tab strip. Inactive devices stay mounted but hidden so Keep-Alive keeps
 * their live WebSocket state, conversations and drafts.
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
  const activeDevice = devices.find(device => device.id === state.activeNativeDeviceId)
  const stageRef = useRef<HTMLDivElement | null>(null)

  // A framed status page cannot recover on its own when the tunnel returns.
  // Reload exactly once on any mounted device's non-connected -> connected edge.
  const previousStates = useRef<Map<DeviceId, DeviceView['state']>>(new Map())
  useEffect(() => {
    const prevMap = previousStates.current
    const nextMap = new Map<DeviceId, DeviceView['state']>()
    for (const dev of devices) {
      nextMap.set(dev.id, dev.state)
      const prevState = prevMap.get(dev.id)
      if (
        prevState !== undefined &&
        prevState !== 'connected' &&
        dev.state === 'connected' &&
        (dev.nativePaneState === 'idle' || dev.nativePaneState === 'failed' || dev.nativePaneState === undefined) &&
        (state.keepAliveDeviceIds.includes(dev.id) || activeDevice?.id === dev.id)
      ) {
        clientStore.reloadNativeDevice(dev.id)
      }
    }
    previousStates.current = nextMap
  }, [devices, state.keepAliveDeviceIds, activeDevice?.id])

  // Every keep-alive device and the active tab stay mounted.
  const mountedDeviceIds = new Set<DeviceId>(state.keepAliveDeviceIds)
  if (activeDevice !== undefined) mountedDeviceIds.add(activeDevice.id)
  const mountedDevices = devices.filter(device => mountedDeviceIds.has(device.id))
  const stageVisible = activeDevice !== undefined

  return (
    <div
      ref={stageRef}
      className="dsh-md-native-stage"
      data-visible={stageVisible ? 'true' : 'false'}
      data-bridge={activeDevice?.nativePaneState ?? 'idle'}
      aria-hidden={!stageVisible}
    >
      {activeDevice !== undefined && activeDevice.nativePaneState === 'failed' && (
        <div className="dsh-md-bridge-failed" role="status">
          <IconWarningOutlineRegular size={16} />
          <div className="dsh-md-bridge-failed-text">
            <span className="dsh-md-bridge-failed-title">
              {t('bridgeFailedTitle').replace('{name}', activeDevice.name)}
            </span>
            {activeDevice.nativePaneError !== undefined && activeDevice.nativePaneError !== '' && (
              <span className="dsh-md-bridge-failed-error" title={activeDevice.nativePaneError}>
                {t('bridgeFailedError').replace('{error}', activeDevice.nativePaneError)}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={<IconRefreshOutlineRegular size={14} />}
            onClick={() => clientStore.reloadNativeDevice(activeDevice.id)}
          >
            {t('bridgeFailedReload')}
          </Button>
        </div>
      )}
      <div className="dsh-md-native-stage-body">
        {mountedDevices.map((device) => (
          <KeepAliveDeviceFrame
            key={device.id}
            device={device}
            active={stageVisible && device.id === activeDevice?.id}
            reloadCount={state.reloadCounters[device.id] ?? 0}
            t={t}
            onOpenSettings={onOpenSettings}
          />
        ))}
      </div>
    </div>
  )
}

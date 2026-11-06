/**
 * Native Mode tab bar and keep-alive viewport.
 *
 * Native Mode is a tab strip that never disappears:
 * - 本机 (leftmost) reveals the unmodified local DSH page; it is not an iframe.
 * - Every configured remote device opens its complete remote DSH Web UI below
 *   the same strip.
 * - The rightmost action switches back to Aggregated Mode, so the two surfaces
 *   stay one click apart without opening Settings. The Host still owns the mode.
 *   The switch moves into the leading cluster when the visible bar is narrow or
 *   when the Host frame is wider than the viewport (Windows Desktop), so the way
 *   back to Aggregated Mode can never be clipped off-screen.
 * - Each tab carries its owner's unread completion count (本机 included), so a
 *   finished conversation on another device stays visible without switching.
 *   Archived and subagent Sessions never get a standalone row and are excluded.
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
  IconChevronLeftOutlineRegular,
  IconCloseOutlineRegular,
  IconGlobeOutlineRegular,
  IconRefreshOutlineRegular,
  IconRightUpOutlineRegular,
  IconSettingsOutlineRegular,
  IconWarningOutlineRegular,
  Pill,
  StateDot,
  Toast,
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
import { UnreadCountBadge } from './UnreadCountBadge.tsx'
import { useSessionSummary } from './clientServices.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { SessionDeviceChip } from './SessionDeviceChip.tsx'
import { nativePaneTarget, resolveSameSiteProxyUrl, shouldShowNativePane } from './nativePane.ts'
import { clientStore, deviceStateToDotState, useMultiDeviceState } from './state.ts'
import { countableUnreadIds, unreadCountForDevice } from './unreadCounts.ts'

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
  const targetUrl = resolveSameSiteProxyUrl(device.nativeProxyUrl)
  const authRequired = device.authState === 'required' || device.authState === 'error'
  const containerRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef(active)
  const webviewLeaseRef = useRef<string | undefined>(undefined)
  const [webviewFailed, setWebviewFailed] = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  // The frame is cross-origin, so the shell tells it whether its tab/pane is
  // currently displayed. The bridge uses this signal to gate unread clearing;
  // IntersectionObserver remains the fallback for Electron guests.
  useEffect(() => {
    if (targetUrl === undefined) return
    const postVisibility = (): void => {
      const iframe = frameRef.current?.querySelector('iframe')
      if (iframe === null || iframe === undefined) return
      let origin = '*'
      try { origin = new URL(targetUrl).origin } catch { /* keep wildcard */ }
      try {
        iframe.contentWindow?.postMessage({ __dshMdVisibility: true, visible: active }, origin)
      } catch { /* frame may be navigating */ }
    }
    postVisibility()
    const timer = window.setTimeout(postVisibility, 150)
    return () => window.clearTimeout(timer)
  }, [active, targetUrl])

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
              if (activeRef.current) webview.focus()
            } catch { /* focus is best-effort */ }
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
  const [switching, setSwitching] = useState(false)
  const [switchFailure, setSwitchFailure] = useState<{ seq: number; message: string } | null>(null)
  const [bar, setBar] = useState<NativeBarMetrics | undefined>(undefined)
  const failureSeq = useRef(0)
  const barRef = useRef<HTMLDivElement | null>(null)

  // Clamp the strip to what the viewport can actually show. A frame wider than
  // the window (embedded remote page) would otherwise push the right-aligned
  // Settings gear and mode switch off-screen, leaving Native Mode with no way
  // back to Aggregated Mode.
  useEffect(() => {
    if (state.displayMode !== 'native') return
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
  }, [state.displayMode])

  if (state.displayMode !== 'native') return null

  // Count only unread Sessions that DSH can actually show as rows: archived
  // completions and subagent children never appear in the sidebar.
  const unread = countableUnreadIds(
    state.snapshot.unreadSessionIds,
    state.snapshot.archivedSessionIds,
    state.snapshot.subagentSessionIds,
  )
  const localUnread = unreadCountForDevice(unread, LOCAL_DEVICE_ID)

  const activeDevice = devices.find(device => device.id === state.activeNativeDeviceId)
  const localActive = activeDevice === undefined

  // The Host owns the mode; this only asks it to stop merging and applies the
  // snapshot it returns. A failed RPC is surfaced instead of leaving the user
  // in Native Mode with no visible reaction to the click.
  const switchToAggregated = (): void => {
    if (switching) return
    setSwitching(true)
    void clientStore.setDisplayMode('aggregated').then((res) => {
      setSwitching(false)
      if (res.ok) return
      failureSeq.current += 1
      setSwitchFailure({
        seq: failureSeq.current,
        message: `${t('actionFailed')}: ${res.error ?? ''}`,
      })
    })
  }

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

  // The way back to Aggregated Mode. Rightmost while there is room; the leading
  // cluster when the bar is narrow or clipped, so it can never be pushed
  // off-screen by a Host frame that is wider than the viewport.
  const aggregatedSwitch = (
    <Tooltip label={t('switchToAggregated')} side="bottom" align={compact ? 'start' : 'end'}>
      <Button
        variant="outline"
        size="sm"
        className="dsh-md-native-mode-switch"
        icon={<IconChevronLeftOutlineRegular size={12} />}
        aria-label={t('switchToAggregated')}
        aria-busy={switching || undefined}
        disabled={switching}
        onClick={switchToAggregated}
      >
        {compact ? null : t('modeAggregated')}
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
      {compact && (
        <div className="dsh-md-native-bar-leading">
          {aggregatedSwitch}
          {settingsButton}
        </div>
      )}

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
              <UnreadCountBadge count={localUnread} t={t} />
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
                  <UnreadCountBadge count={unreadCountForDevice(unread, dev.id)} t={t} />
                  {dev.runningSessionCount > 0 && (
                    <span className="dsh-md-muted">
                      {t('runningCount').replace('{count}', String(dev.runningSessionCount))}
                    </span>
                  )}
                  {dev.pendingApprovalCount > 0 && (
                    <span
                      className="dsh-md-pending"
                      title={t('pendingCount').replace('{count}', String(dev.pendingApprovalCount))}
                      aria-label={t('pendingCount').replace('{count}', String(dev.pendingApprovalCount))}
                    >
                      <IconWarningOutlineRegular size={11} />
                      <span>{dev.pendingApprovalCount}</span>
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
                  const url = resolveSameSiteProxyUrl(activeDevice.nativeProxyUrl) ?? activeDevice.effectiveBaseUrl
                  if (url !== undefined) window.open(url, '_blank', 'noopener,noreferrer')
                }}
              >
                <IconRightUpOutlineRegular size={14} />
              </Button>
            </Tooltip>
          )}
        </div>
      )}

      {!compact && settingsButton}

      {!compact && <span className="dsh-md-native-bar-sep" aria-hidden="true" />}

      {/* Rightmost action while there is room: Aggregated Mode is one click
          away, never buried in Settings. The Host persists the switch and
          re-merges remote rows. Compact/clipped bars render it first instead. */}
      {!compact && aggregatedSwitch}

      {switchFailure !== null && (
        <Toast
          key={switchFailure.seq}
          text={switchFailure.message}
          tone="error"
          onDone={() => setSwitchFailure(null)}
        />
      )}
    </div>
  )
}

/**
 * Measure the local conversation column (centre + right track) so the
 * aggregated pane covers exactly the local conversation, never the aggregated
 * sidebar. Re-measured on frame resize, sidebar drag, right-panel toggle and
 * layout mutations; a zero/invalid box hides the pane instead of covering the
 * whole window.
 */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function usePaneGeometry(
  stageRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
): React.CSSProperties | undefined {
  const [style, setStyle] = useState<React.CSSProperties | undefined>(undefined)

  useBrowserLayoutEffect(() => {
    if (!enabled) {
      setStyle(undefined)
      return
    }
    const stage = stageRef.current
    const frame = stage?.closest('[data-shell-overlay]')?.parentElement
    if (!(frame instanceof HTMLElement)) {
      setStyle(undefined)
      return
    }

    let frameId = 0
    const measure = (): void => {
      frameId = 0
      const center = frame.querySelector('[class*="_centerCol"]')
      if (!(center instanceof HTMLElement)) {
        setStyle(undefined)
        return
      }
      const frameRect = frame.getBoundingClientRect()
      const centerRect = center.getBoundingClientRect()
      const left = Math.max(0, Math.round(centerRect.left - frameRect.left))
      const top = Math.max(0, Math.round(centerRect.top - frameRect.top))
      const width = Math.max(0, Math.round(frameRect.right - centerRect.left))
      // Stop at the conversation column's bottom edge so the local shell's
      // bottom status row (if any) stays visible; the right track is covered
      // horizontally because it lives in the same grid row.
      const height = Math.max(0, Math.round(centerRect.height))
      if (width < 160 || height < 120) {
        setStyle(undefined)
        return
      }
      setStyle({ left, top, width, height, right: 'auto', bottom: 'auto' })
    }
    const schedule = (): void => {
      if (frameId !== 0 || typeof requestAnimationFrame !== 'function') return
      frameId = requestAnimationFrame(measure)
    }

    measure()
    const ResizeObserverCtor = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    const resizeObserver = ResizeObserverCtor === undefined ? undefined : new ResizeObserverCtor(schedule)
    resizeObserver?.observe(frame)
    const center = frame.querySelector('[class*="_centerCol"]')
    if (center instanceof HTMLElement) resizeObserver?.observe(center)
    const mutationObserver = typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(schedule)
    mutationObserver?.observe(frame, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-sidebar-collapsed', 'data-dragging'],
    })
    window.addEventListener('resize', schedule)

    return () => {
      if (frameId !== 0) cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [enabled, stageRef])

  return style
}

/** Slim local strip above the framed page: device identity + full-UI handoff. */
function NativePaneBar({
  device,
  sessionId,
  t,
  onOpenSettings,
}: {
  device: DeviceView
  sessionId: string
  t: (key: MultiDeviceLocaleKey) => string
  onOpenSettings: () => void
}): React.ReactElement {
  // A blank remote conversation uses the same device picker as the local hero,
  // so "start on another device" survives the native pane covering the hero.
  const summary = useSessionSummary(sessionId)
  const blank = summary?.blank === true
  return (
    <div className="dsh-md-pane-bar" data-state={device.state}>
      <span className="dsh-md-pane-identity">
        <SessionDeviceChip
          sessionId={sessionId}
          variant={blank ? 'hero' : 'header'}
          t={t}
          onOpenSettings={onOpenSettings}
        />
        <span className="dsh-md-pane-mode">{t('nativePaneLabel')}</span>
      </span>
      <span className="dsh-md-pane-actions">
        {device.state !== 'connected' && device.state !== 'disabled' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { void clientStore.reconnectDevice(device.id) }}
          >
            {t('reconnect')}
          </Button>
        )}
        <Tooltip label={t('reloadPage')} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('reloadPage')}
            onClick={() => clientStore.reloadNativeDevice(device.id)}
          >
            <IconRefreshOutlineRegular size={14} />
          </Button>
        </Tooltip>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { void clientStore.selectNativeDevice(device.id) }}
        >
          {t('nativePaneOpenFull')}
        </Button>
      </span>
    </div>
  )
}

/**
 * Remote viewports for both modes:
 * - Native Mode: full frame below the tab bar.
 * - Aggregated Mode: a pane covering only the local conversation column while
 *   a remote Session is selected; the aggregated sidebar stays interactive.
 *
 * The pane is visible only after the injected bridge reports the selected raw
 * Session (see `shouldShowNativePane`). Until then the local mirror remains
 * visible, so a slow bridge or a version mismatch never shows a blank pane.
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
  const paneEnabled = state.snapshot.ui?.nativePane !== false && state.snapshot.hostStatus.nativeProxyActive
  const target = paneEnabled
    ? nativePaneTarget(state.displayMode, state.activeSessionId)
    : undefined
  const paneDevice = target === undefined
    ? undefined
    : devices.find(device => device.id === target.deviceId)
  const stageRef = useRef<HTMLDivElement | null>(null)
  // Measure whenever a pane target exists or a kept-alive frame is mounted, so
  // the hidden frame keeps a realistic width and does not reflow when shown.
  const measureStage = !isNative && (target !== undefined || state.keepAliveDeviceIds.length > 0)
  const geometry = usePaneGeometry(stageRef, measureStage)
  const paneVisible = shouldShowNativePane({
    enabled: paneEnabled,
    target,
    device: paneDevice,
    geometryReady: geometry !== undefined,
  })

  // The framed page visually covers the local conversation, but the local DOM
  // would still be tabbable underneath. Make the covered columns inert so a
  // keyboard user cannot operate the hidden mirror through the pane.
  useEffect(() => {
    if (isNative) return
    const stage = stageRef.current
    const frame = stage?.closest('[data-shell-overlay]')?.parentElement
    if (!(frame instanceof HTMLElement)) return
    const targets: HTMLElement[] = []
    for (const selector of ['[class*="_centerCol"]', '[class*="_rightbarCol"]']) {
      const element = frame.querySelector(selector)
      if (element instanceof HTMLElement) targets.push(element)
    }
    for (const element of targets) {
      if (paneVisible) element.setAttribute('inert', '')
      else element.removeAttribute('inert')
    }
    return () => {
      for (const element of targets) element.removeAttribute('inert')
    }
  }, [isNative, paneVisible])

  useEffect(() => {
    if (target !== undefined) clientStore.ensureKeepAliveDevice(target.deviceId)
  }, [target?.deviceId])

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
        (state.keepAliveDeviceIds.includes(dev.id) || activeDevice?.id === dev.id || paneDevice?.id === dev.id)
      ) {
        clientStore.reloadNativeDevice(dev.id)
      }
    }
    previousStates.current = nextMap
  }, [devices, state.keepAliveDeviceIds, activeDevice?.id, paneDevice?.id])

  // Keep every keep-alive device, the native tab and the pane's device mounted.
  const mountedDeviceIds = new Set<DeviceId>(state.keepAliveDeviceIds)
  if (activeDevice !== undefined) mountedDeviceIds.add(activeDevice.id)
  if (paneDevice !== undefined) mountedDeviceIds.add(paneDevice.id)
  const mountedDevices = devices.filter(device => mountedDeviceIds.has(device.id))

  const stageVisible = isNative ? activeDevice !== undefined : paneVisible
  const paneStyle = isNative
    ? undefined
    : (geometry ?? { left: 0, top: 0, width: 0, height: 0, right: 'auto', bottom: 'auto' })

  return (
    <div
      ref={stageRef}
      className="dsh-md-native-stage"
      data-scope={isNative ? 'full' : 'pane'}
      data-visible={stageVisible ? 'true' : 'false'}
      data-bridge={paneDevice?.nativePaneState ?? 'idle'}
      style={paneStyle}
      aria-hidden={!stageVisible}
    >
      {!isNative && paneDevice !== undefined && paneVisible && state.activeSessionId !== undefined && (
        <NativePaneBar
          device={paneDevice}
          sessionId={state.activeSessionId}
          t={t}
          onOpenSettings={onOpenSettings}
        />
      )}
      <div className="dsh-md-native-stage-body">
        {mountedDevices.map((device) => (
          <KeepAliveDeviceFrame
            key={device.id}
            device={device}
            active={isNative
              ? stageVisible && device.id === activeDevice?.id
              // The aggregated pane can keep the frame mounted while its
              // geometry is not ready or the bridge is still loading; the
              // stage is hidden then, so the frame must not report visible.
              : stageVisible && device.id === paneDevice?.id}
            reloadCount={state.reloadCounters[device.id] ?? 0}
            t={t}
            onOpenSettings={onOpenSettings}
          />
        ))}
      </div>
    </div>
  )
}

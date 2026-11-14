/**
 * The device tab bar and its keep-alive viewports. This is the plugin's only
 * navigation surface.
 *
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
import { createPortal } from 'react-dom'
import { LOCAL_DEVICE_ID, type DeviceId, type DeviceView } from '../contract.ts'
import { AuthRequiredPanel } from './AuthPanel.tsx'
import {
  type BarLayout,
  describeObstruction,
  measureNativeBar,
  recordNativeBarMetrics,
  recordNativeBarObstruction,
  resolveBarLayout,
} from './barMetrics.ts'
import { attentionUnreadIds } from '../attention.ts'
import { AttentionDetails } from './AttentionDetails.tsx'
import type { MultiDeviceLocaleKey } from './locales.ts'
import { assessBrowserNativeAccess } from '../host/browser-relay.ts'
import { clientStore, deviceStateToDotState, useMultiDeviceState } from './state.ts'
import { TabScrollbar } from './TabScrollbar.tsx'
import { countableUnreadIds, EMPTY_UNREAD_SESSION_IDS, groupUnreadSessionIds } from './unreadCounts.ts'

/** Layout effect in the browser, plain effect during a server render. */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

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
 *
 * Two properties keep the strip honest at every window size:
 * - Its box is measured from the **Host frame**, never from the bar itself. The
 *   previous version fed the bar's own rect back in and pinned it as
 *   `max-width`, so the strip could shrink and never grow again — the mode
 *   switch stayed parked mid-window with a same-coloured dead band on its right.
 * - It renders through a portal onto `<body>` with an explicit z-index, because
 *   the Host's own `shell.overlay` seat is a stacking context (`z-index: 20`)
 *   and in-frame chrome (`[data-shell-leading]` at 25, the sidebar toggle at 30)
 *   paints above it. Portalled, the strip is clipped by nothing and loses no
 *   clicks; a runtime probe reports whatever still covers the switch.
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
  const visibleDevices = devices.filter(device => device.enabled !== false)
  const [layout, setLayout] = useState<BarLayout | undefined>(undefined)
  const [obstructed, setObstructed] = useState<string | undefined>(undefined)
  const barRef = useRef<HTMLDivElement | null>(null)
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const trailingRef = useRef<HTMLDivElement | null>(null)

  // Measure the frame (and only the frame). The result depends solely on the
  // frame box and the viewport, so growing the window back after shrinking it
  // restores the full width on the very next measurement.
  //
  // A layout effect, not an effect: the CSS fallback box is the full viewport,
  // so measuring after paint painted the strip at x=0 for one frame and then
  // jumped it to the frame's left edge (the sidebar width) — the tab cards
  // appeared to "move by themselves" on every load.
  useBrowserLayoutEffect(() => {
    if (typeof window === 'undefined') return
    let frame: HTMLElement | undefined
    let frameObserver: ResizeObserver | undefined

    const resolveFrame = (): HTMLElement | undefined => {
      const shell = document.querySelector('[data-shell-overlay]')?.parentElement
      return shell instanceof HTMLElement ? shell : undefined
    }

    const measure = (): void => {
      const next = resolveFrame()
      if (next !== undefined && next !== frame) {
        // The Host can replace the frame on a re-render; re-observe it.
        frame = next
        frameObserver?.disconnect()
        frameObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
        frameObserver?.observe(next)
      }
      const rect = frame?.getBoundingClientRect()
      const chromeTop = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-chrome-top'),
      )
      const resolved = resolveBarLayout({
        frameLeft: rect?.left ?? 0,
        frameTop: rect?.top ?? 0,
        frameWidth: rect?.width ?? 0,
        viewportWidth: window.innerWidth,
        chromeTop: Number.isFinite(chromeTop) ? chromeTop : 0,
      })
      setLayout(previous => (
        previous !== undefined
        && previous.left === resolved.left
        && previous.top === resolved.top
        && previous.width === resolved.width
        && previous.compact === resolved.compact
          ? previous
          : resolved
      ))
      recordNativeBarMetrics(measureNativeBar({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        left: resolved.left,
        // Diagnostics reports the frame extent the bar *would* take, so a
        // clipped frame still shows up as clipped after the box is clamped.
        width: rect?.width ?? resolved.width,
      }))
    }

    measure()
    window.addEventListener('resize', measure)
    // Fullscreen toggles the Host's chrome height to 0; a sidebar collapse or a
    // panel drag changes the frame without changing window.innerWidth.
    const hostObserver = typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(measure)
    hostObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-fullscreen', 'data-platform', 'data-windows-titlebar'],
    })
    return () => {
      window.removeEventListener('resize', measure)
      frameObserver?.disconnect()
      hostObserver?.disconnect()
      recordNativeBarMetrics(undefined)
    }
  }, [])

  // Occlusion probe: name whatever sits on top of the trailing controls. The
  // Host's native window controls and its own in-frame seats are the only
  // candidates, and guessing between them from a screenshot is hopeless.
  useEffect(() => {
    if (layout === undefined) return
    if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return
    const probe = (): void => {
      const element = trailingRef.current
      const barElement = barRef.current
      if (element === null || barElement === null) {
        setObstructed(undefined)
        recordNativeBarObstruction(undefined)
        return
      }
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      const detail = hit === null || barElement.contains(hit) ? undefined : describeObstruction(hit)
      setObstructed(previous => (previous === detail ? previous : detail))
      recordNativeBarObstruction(detail === undefined ? undefined : { detail, updatedAt: Date.now() })
    }
    const handle = requestAnimationFrame(probe)
    return () => cancelAnimationFrame(handle)
  }, [layout, visibleDevices.length, state.activeNativeDeviceId])

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

  const activeDevice = visibleDevices.find(device => device.id === state.activeNativeDeviceId)
  const localActive = activeDevice === undefined

  const compact = layout?.compact === true
  const clipped = layout?.clipped === true

  const settingsButton = (
    <Tooltip label={t('settingsSectionTitle')} side="bottom" align={compact ? 'start' : 'end'}>
      <Button
        variant="ghost"
        size="sm"
        className="dsh-md-icon-btn isCompact"
        aria-label={t('settingsSectionTitle')}
        onClick={onOpenSettings}
      >
        <IconSettingsOutlineRegular size={14} />
      </Button>
    </Tooltip>
  )

  const bar = (
    <div
      className="dsh-md-native-bar"
      ref={barRef}
      data-compact={compact ? 'true' : 'false'}
      data-clipped={clipped ? 'true' : 'false'}
      data-obstructed={obstructed ?? 'false'}
      data-mode="native"
      style={layout === undefined
        ? undefined
        : { left: `${layout.left}px`, top: `${layout.top}px`, width: `${layout.width}px` }}
    >
      {/* No leading cluster: moving the Settings entry from right to left when
          the frame crossed the compact breakpoint re-flowed every tab. The bar's
          width is clamped to the visible viewport, so the trailing cluster stays
          on screen at any size. */}

      <div className="dsh-md-native-tabs" role="tablist" aria-label={t('nativeTabsLabel')} ref={tabsRef}>
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

        {visibleDevices.map((dev) => {
          const isSelected = dev.id === state.activeNativeDeviceId
          const isKeptAlive = state.keepAliveDeviceIds.includes(dev.id)
          return (
            <div key={dev.id} className="dsh-md-native-tab-item">
              <Pill
                active={isSelected}
                role="tab"
                aria-selected={isSelected}
                // Latency used to be an inline span revealed on hover, so merely
                // moving the pointer across the strip resized the tabs under it.
                // The label carries it instead: same information, no geometry.
                title={dev.latencyMs !== undefined
                  ? `${dev.name} · ${dev.latencyMs}ms`
                  : dev.name}
                onClick={() => { void clientStore.selectNativeDevice(dev.id) }}
              >
                <span className="dsh-md-pill-inner">
                  <StateDot state={deviceStateToDotState(dev.state)} size={8} />
                  <span className="dsh-md-pill-name">{dev.name}</span>
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
              {/* Only a mounted page has something to release, so the control
                  exists only for that device; it stays faded out until this tab
                  is hovered or focused. The always-reserved slot it replaces
                  cost 26px of permanent empty space on every keep-alive tab. */}
              {dev.keepNativeAlive !== false && isKeptAlive && (
                <span className="dsh-md-tab-release">
                  <Tooltip label={t('releaseKeepAlive')} side="bottom">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="dsh-md-icon-btn isCompact"
                      aria-label={t('releaseKeepAlive')}
                      onClick={() => clientStore.releaseKeepAliveDevice(dev.id)}
                    >
                      <IconCloseOutlineRegular size={12} />
                    </Button>
                  </Tooltip>
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Trailing cluster: always pinned to the bar's right edge. `flex: none` +
          `margin-inline-start: auto` keeps it out of the tab strip's scroll
          area, so the Settings entry can never be scrolled away or clipped. */}
      <div className="dsh-md-native-bar-trailing" ref={trailingRef}>
        {activeDevice !== undefined && (
          <div className="dsh-md-native-bar-actions">
            <Tooltip label={t('reloadPage')} side="bottom">
              <Button
                variant="ghost"
                size="sm"
                className="dsh-md-icon-btn isCompact"
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
                  size="sm"
                  className="dsh-md-icon-btn isCompact"
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

        {settingsButton}
      </div>

      {/* Overlay scrollbar for the strip. Absolute inside the bar (which is the
          fixed containing block), so it adds a paint layer and no layout: the
          pills keep the exact box they had before. Hidden until hovered. */}
      <TabScrollbar scrollerRef={tabsRef} barRef={barRef} />
    </div>
  )

  // Portal onto <body>: the Host's shell overlay is a stacking context below
  // its own in-frame chrome, and its frame clips overflow. Portalled, the strip
  // is above both while still losing to Tooltips (100), modals (1000) and menus
  // (1100).
  return typeof document === 'undefined' ? bar : createPortal(bar, document.body)
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
  const visibleDevices = devices.filter(device => device.enabled !== false)
  const activeDevice = visibleDevices.find(device => device.id === state.activeNativeDeviceId)
  const stageRef = useRef<HTMLDivElement | null>(null)

  // A framed status page cannot recover on its own when the tunnel returns.
  // Reload exactly once on any mounted device's non-connected -> connected edge.
  const previousStates = useRef<Map<DeviceId, DeviceView['state']>>(new Map())
  useEffect(() => {
    const prevMap = previousStates.current
    const nextMap = new Map<DeviceId, DeviceView['state']>()
    for (const dev of visibleDevices) {
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
  }, [visibleDevices, state.keepAliveDeviceIds, activeDevice?.id])

  // Every keep-alive device and the active tab stay mounted.
  const mountedDeviceIds = new Set<DeviceId>(state.keepAliveDeviceIds)
  if (activeDevice !== undefined) mountedDeviceIds.add(activeDevice.id)
  const mountedDevices = visibleDevices.filter(device => mountedDeviceIds.has(device.id))
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

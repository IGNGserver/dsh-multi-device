import { useEffect, useMemo, useRef, useState } from 'react'
import { getCopy } from '../data/copy'
import {
  createImportedProdDevice,
  createInitialDevices,
} from '../data/workspaceFixtures'
import type {
  AttentionTone,
  DeviceRecord,
  DshSessionItem,
  Locale,
} from '../types'
import {
  formatCountCell,
  formatTaskbarSummary,
  summarizeDeviceAttention,
} from '../utils/attention'
import { DshDevicePane } from './DshDevicePane'
import {
  CloseIcon,
  ExternalLinkIcon,
  GlobeIcon,
  Layers3DIcon,
  RefreshIcon,
  SettingsIcon,
  StateDot,
} from './Icons'

interface InteractiveWorkbenchProps {
  readonly locale: Locale
}

export function InteractiveWorkbench({ locale }: InteractiveWorkbenchProps) {
  const t = getCopy(locale).workbench

  const [devices, setDevices] = useState<DeviceRecord[]>(() =>
    createInitialDevices(),
  )
  const [activeDeviceId, setActiveDeviceId] = useState<string>('__local__')
  const [openMenuDeviceId, setOpenMenuDeviceId] = useState<string | null>(null)
  const [menuLeftPx, setMenuLeftPx] = useState<number>(12)
  const [exploded3d, setExploded3d] = useState<boolean>(false)
  const nativeBarRef = useRef<HTMLDivElement | null>(null)
  const [showTaskbarSummary, setShowTaskbarSummary] = useState<boolean>(true)
  const [syncReadState, setSyncReadState] = useState<boolean>(true)
  const [syncUiState, setSyncUiState] = useState<boolean>(true)
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false)
  const [streamTick, setStreamTick] = useState<number>(1)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const activeDeviceIdRef = useRef(activeDeviceId)
  activeDeviceIdRef.current = activeDeviceId

  const timersRef = useRef<number[]>([])

  // Continuous background Keep-Alive stream ticker
  useEffect(() => {
    const id = window.setInterval(() => {
      setStreamTick((n) => n + 1)
    }, 1100)
    return () => {
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  // Close attention menu on outside click or Escape
  useEffect(() => {
    if (!openMenuDeviceId) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target?.closest('.dsh-md-tab-status-anchor') ||
        target?.closest('.dsh-official-menu-popover')
      ) {
        return
      }
      setOpenMenuDeviceId(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuDeviceId(null)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [openMenuDeviceId])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    const timer = window.setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur))
    }, 2800)
    timersRef.current.push(timer)
  }

  const visibleTabs = useMemo(
    () => devices.filter((d) => d.isLocal || d.enabled),
    [devices],
  )

  const activeDevice =
    visibleTabs.find((d) => d.id === activeDeviceId) ?? visibleTabs[0]

  const taskbarSummary = useMemo(
    () => formatTaskbarSummary(devices, locale),
    [devices, locale],
  )

  // Acknowledge unread status when selecting/viewing an unread session on a visible device
  const acknowledgeIfUnread = (deviceId: string, sessionId: string) => {
    setDevices((prev) =>
      prev.map((dev) => {
        if (dev.id !== deviceId) return dev
        return {
          ...dev,
          activeSessionId: sessionId,
          sessions: dev.sessions.map((s) =>
            s.id === sessionId && s.status === 'unread'
              ? {
                  ...s,
                  status: 'idle',
                  updatedLabel: { zh: '已读', en: 'read' },
                }
              : s,
          ),
        }
      }),
    )
  }

  const handleSwitchDevice = (deviceId: string) => {
    setActiveDeviceId(deviceId)
    setOpenMenuDeviceId(null)
    // Only clear unread if the active session on that newly visible tab is unread & mounted
    const target = devices.find((d) => d.id === deviceId)
    if (target && target.keepAliveMounted) {
      const currentSess = target.sessions.find(
        (s) => s.id === target.activeSessionId,
      )
      if (currentSess?.status === 'unread') {
        acknowledgeIfUnread(deviceId, currentSess.id)
      }
    }
  }

  const handleOpenSessionFromMenu = (deviceId: string, sessionId: string) => {
    setActiveDeviceId(deviceId)
    setOpenMenuDeviceId(null)
    setDevices((prev) =>
      prev.map((dev) => {
        if (dev.id !== deviceId) return dev
        return {
          ...dev,
          keepAliveMounted: true,
          activeSessionId: sessionId,
          sessions: dev.sessions.map((s) =>
            s.id === sessionId && s.status === 'unread'
              ? {
                  ...s,
                  status: 'idle',
                  updatedLabel: { zh: '刚刚已读', en: 'just read' },
                }
              : s,
          ),
        }
      }),
    )
  }

  const handleReleaseKeepAlive = (deviceId: string) => {
    setDevices((prev) =>
      prev.map((dev) =>
        dev.id === deviceId ? { ...dev, keepAliveMounted: false } : dev,
      ),
    )
    showToast(
      locale === 'zh'
        ? `已释放 ${deviceId} 后台页面（远端 SSH 与任务继续保活运行）`
        : `Released ${deviceId} background frame (remote tasks continue running)`,
    )
  }

  const handleRemount = (deviceId: string) => {
    setDevices((prev) =>
      prev.map((dev) =>
        dev.id === deviceId ? { ...dev, keepAliveMounted: true } : dev,
      ),
    )
  }

  const handleApproveSession = (deviceId: string, sessionId: string) => {
    setDevices((prev) =>
      prev.map((dev) => {
        if (dev.id !== deviceId) return dev
        return {
          ...dev,
          sessions: dev.sessions.map((s) => {
            if (s.id !== sessionId) return s
            return {
              ...s,
              status: 'running',
              updatedLabel: { zh: '运行中', en: 'running' },
              blocks: s.blocks.map((b) =>
                b.kind === 'approval'
                  ? {
                      id: `${b.id}-running`,
                      kind: 'tool',
                      title: {
                        zh: '已批准并启动 · torchrun 4×A100 FP8 All-to-All',
                        en: 'Approved & running · torchrun 4×A100 FP8 All-to-All',
                      },
                      subtitle: 'NVLink 614 GB/s · FP8 dispatch/combine active',
                      status: 'ongoing',
                      code: `Rank 0..3 initialized | tokens=8192 | FP8 combine latency: 148 us (1.84x speedup)`,
                      content: {
                        zh: '工具审批已通过！顶部胶囊已从琥珀色「待回复」实时切换为蓝色「运行中」。约 3 秒后运行完成：若你切去其他标签页，它将变为绿色「完成未读」！',
                        en: 'Tool approved! The capsule transitioned live from Amber (pending) to Blue (running). In ~3s it will finish: switch tabs now to see it land as Green (unread)!',
                      },
                    }
                  : b,
              ),
            }
          }),
        }
      }),
    )

    const timer = window.setTimeout(() => {
      const isVisibleNow = activeDeviceIdRef.current === deviceId
      setDevices((prev) =>
        prev.map((dev) => {
          if (dev.id !== deviceId) return dev
          const stillViewingThisSession =
            isVisibleNow && dev.keepAliveMounted && dev.activeSessionId === sessionId
          return {
            ...dev,
            sessions: dev.sessions.map((s) => {
              if (s.id !== sessionId) return s
              return {
                ...s,
                status: stillViewingThisSession ? 'idle' : 'unread',
                updatedLabel: stillViewingThisSession
                  ? { zh: '已完成', en: 'done' }
                  : { zh: '完成未读', en: 'unread' },
                blocks: [
                  ...s.blocks.map((b) =>
                    b.status === 'ongoing'
                      ? { ...b, status: 'done' as const, subtitle: 'exit 0 · 3.1s · turn/end persisted' }
                      : b,
                  ),
                  {
                    id: `done-${Date.now()}`,
                    kind: 'assistant',
                    content: {
                      zh: '4 卡 A100 FP8 评测已完成（`turn/end` 已确认）：吞吐提升 1.84×，零数值溢出。',
                      en: '4×A100 FP8 benchmark completed (`turn/end` confirmed): 1.84× throughput gain with zero overflow.',
                    },
                  },
                ],
              }
            }),
          }
        }),
      )
    }, 3100)
    timersRef.current.push(timer)
  }

  const handleRejectSession = (deviceId: string, sessionId: string) => {
    setDevices((prev) =>
      prev.map((dev) => {
        if (dev.id !== deviceId) return dev
        return {
          ...dev,
          sessions: dev.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  status: 'idle',
                  updatedLabel: { zh: '已取消', en: 'rejected' },
                  blocks: s.blocks.filter((b) => b.kind !== 'approval'),
                }
              : s,
          ),
        }
      }),
    )
  }

  const handleSendDraft = (deviceId: string) => {
    const dev = devices.find((d) => d.id === deviceId)
    if (!dev || !dev.draftText.trim()) return
    const promptText = dev.draftText.trim()
    const targetSessionId = dev.activeSessionId

    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== deviceId) return d
        return {
          ...d,
          draftText: '',
          sessions: d.sessions.map((s) =>
            s.id === targetSessionId
              ? {
                  ...s,
                  status: 'running',
                  updatedLabel: { zh: '运行中', en: 'running' },
                  blocks: [
                    ...s.blocks,
                    {
                      id: `usr-${Date.now()}`,
                      kind: 'user',
                      content: { zh: promptText, en: promptText },
                    },
                  ],
                }
              : s,
          ),
        }
      }),
    )

    const timer = window.setTimeout(() => {
      const visibleNow = activeDeviceIdRef.current === deviceId
      setDevices((prev) =>
        prev.map((d) => {
          if (d.id !== deviceId) return d
          const markIdle = visibleNow && d.activeSessionId === targetSessionId
          return {
            ...d,
            sessions: d.sessions.map((s) =>
              s.id === targetSessionId
                ? {
                    ...s,
                    status: markIdle ? 'idle' : 'unread',
                    updatedLabel: markIdle
                      ? { zh: '刚刚', en: 'just now' }
                      : { zh: '完成未读', en: 'unread' },
                    blocks: [
                      ...s.blocks,
                      {
                        id: `ast-${Date.now()}`,
                        kind: 'assistant',
                        content: {
                          zh: `已在「${d.name}」本地环境独立执行完毕（未同步或改动其他设备文件）。`,
                          en: `Executed independently inside "${d.name}" local workspace (zero cross-machine file mutation).`,
                        },
                      },
                    ],
                  }
                : s,
            ),
          }
        }),
      )
    }, 1800)
    timersRef.current.push(timer)
  }

  const handleCreateSession = (deviceId: string) => {
    const newId = `${deviceId}:sess-${Date.now()}`
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== deviceId) return d
        const ws = d.workspaces[0]
        const created: DshSessionItem = {
          id: newId,
          rawSessionId: `sess-${Math.random().toString(16).slice(2, 8)}`,
          workspaceId: ws.id,
          workspaceName: ws.name,
          workspacePath: ws.path,
          title: {
            zh: `新会话 · ${ws.name} 诊断`,
            en: `New Session · ${ws.name} check`,
          },
          updatedLabel: { zh: '刚刚', en: 'just now' },
          status: 'idle',
          model: 'DeepSeek-V3.2',
          effort: 'High',
          contextPercent: 8,
          blocks: [
            {
              id: `init-${Date.now()}`,
              kind: 'assistant',
              content: {
                zh: `已在 ${d.name} (${ws.path}) 创建全新本地会话。`,
                en: `Created an isolated session on ${d.name} (${ws.path}).`,
              },
            },
          ],
        }
        return {
          ...d,
          activeSessionId: newId,
          sessions: [created, ...d.sessions],
        }
      }),
    )
  }

  // Simulator controls
  const simulateEvent = (tone: AttentionTone) => {
    const targetId =
      activeDeviceId === 'ubuntu-dev' ? 'gpu-a100' : 'ubuntu-dev'
    const sessId = `sim:${targetId}:${Date.now()}`
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== targetId) return d
        const ws = d.workspaces[0]
        const newSession: DshSessionItem =
          tone === 'pending'
            ? {
                id: sessId,
                rawSessionId: `sess-sim-pend`,
                workspaceId: ws.id,
                workspaceName: ws.name,
                workspacePath: ws.path,
                title: {
                  zh: '请求批准：清理旧 benchmark 火焰图快照',
                  en: 'Approval needed: prune flamegraph snapshots',
                },
                updatedLabel: { zh: '待批准', en: 'Approval' },
                status: 'pending',
                pendingKind: 'approval',
                model: 'DeepSeek-V3.2',
                effort: 'Medium',
                contextPercent: 21,
                blocks: [
                  {
                    id: `ap-${Date.now()}`,
                    kind: 'approval',
                    command: 'rm -f ./artifacts/flamegraph-*.svg',
                    status: 'warning',
                    content: {
                      zh: '由顶部模拟器触发的待回复会话：请点击允许一次观察胶囊变化。',
                      en: 'Simulated pending approval session: click Allow once to watch the capsule update.',
                    },
                  },
                ],
              }
            : tone === 'running'
              ? {
                  id: sessId,
                  rawSessionId: `sess-sim-run`,
                  workspaceId: ws.id,
                  workspaceName: ws.name,
                  workspacePath: ws.path,
                  title: {
                    zh: '后台增量构建与单元回归巡检',
                    en: 'Background incremental check & unit suite',
                  },
                  updatedLabel: { zh: '运行中', en: 'running' },
                  status: 'running',
                  model: 'DeepSeek-R1',
                  effort: 'High',
                  contextPercent: 44,
                  blocks: [
                    {
                      id: `rn-${Date.now()}`,
                      kind: 'tool',
                      title: {
                        zh: '后台任务运行中 · vitest --run',
                        en: 'Background task · vitest --run',
                      },
                      subtitle: 'Keep-Alive stream active',
                      status: 'ongoing',
                      code: 'RUN  v3.0 · 42 passed · streaming events.mux ...',
                      content: {
                        zh: '此会话正在后台运行，计数已实时计入蓝色胶囊。',
                        en: 'Running in background; reflected live in the blue capsule segment.',
                      },
                    },
                  ],
                }
              : {
                  id: sessId,
                  rawSessionId: `sess-sim-done`,
                  workspaceId: ws.id,
                  workspaceName: ws.name,
                  workspacePath: ws.path,
                  title: {
                    zh: '后台任务已完成：SSH 端口健康巡检报告',
                    en: 'Completed: SSH loopback health audit report',
                  },
                  updatedLabel: { zh: '刚刚完成', en: 'just done' },
                  status: 'unread',
                  model: 'DeepSeek-V3.2',
                  effort: 'Medium',
                  contextPercent: 18,
                  blocks: [
                    {
                      id: `dn-${Date.now()}`,
                      kind: 'assistant',
                      content: {
                        zh: '后台 `turn/end` 已到达！点击顶部绿色未读胶囊数字即可一键跳转至此并清除未读。',
                        en: 'Background `turn/end` arrived! Click the green unread count in the top bar to jump straight here and clear it.',
                      },
                    },
                  ],
                }

        return {
          ...d,
          sessions: [newSession, ...d.sessions],
        }
      }),
    )
  }

  const anyStale = devices.some((d) => d.stale)

  const toggleStaleDemo = () => {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === 'macos-ci' || d.id === 'prod-arm64'
          ? { ...d, stale: !anyStale }
          : d,
      ),
    )
  }

  const handleImportProd = () => {
    if (devices.some((d) => d.id === 'prod-arm64')) return
    setDevices((prev) => [...prev, createImportedProdDevice()])
  }

  const hasProdImported = devices.some((d) => d.id === 'prod-arm64')

  const resetDemo = () => {
    setDevices(createInitialDevices())
    setActiveDeviceId('__local__')
    setOpenMenuDeviceId(null)
    setExploded3d(false)
  }

  // Order for 3D exploded Z-stack: active device at Z=0, others fanned behind
  const mountedOrder = useMemo(() => {
    const rest = visibleTabs.filter((d) => d.id !== activeDevice.id)
    return [activeDevice, ...rest]
  }, [activeDevice, visibleTabs])

  return (
    <section id="workbench" className="section-block">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">{t.eyebrow}</div>
          <h2 className="section-title">{t.title}</h2>
          <p className="section-subtitle">{t.subtitle}</p>
        </div>

        {/* Control Deck & Status Legend */}
        <div className="workbench-control-deck">
          <div className="legend-cluster">
            <span className="legend-item">
              <span className="legend-swatch legend-swatch--pending" />
              <span>{t.legend.pending}</span>
            </span>
            <span className="legend-item">
              <span className="legend-swatch legend-swatch--running" />
              <span>{t.legend.running}</span>
            </span>
            <span className="legend-item">
              <span className="legend-swatch legend-swatch--done" />
              <span>{t.legend.unread}</span>
            </span>
            <span className="legend-item">
              <span className="legend-swatch legend-swatch--stale" />
              <span>{t.legend.stale}</span>
            </span>
          </div>

          <div className="sim-buttons-cluster">
            <button
              type="button"
              className="sim-btn"
              data-active={exploded3d ? 'true' : 'false'}
              data-testid="toggle-exploded-3d"
              onClick={() => setExploded3d((v) => !v)}
            >
              <Layers3DIcon size={13} />
              <span>
                {exploded3d ? t.controls.exploded3dActive : t.controls.exploded3d}
              </span>
            </button>

            <button
              type="button"
              className="sim-btn sim-btn--pending"
              onClick={() => simulateEvent('pending')}
            >
              {t.controls.simulatePending}
            </button>

            <button
              type="button"
              className="sim-btn sim-btn--running"
              onClick={() => simulateEvent('running')}
            >
              {t.controls.simulateRunning}
            </button>

            <button
              type="button"
              className="sim-btn sim-btn--done"
              onClick={() => simulateEvent('done')}
            >
              {t.controls.simulateUnread}
            </button>

            <button
              type="button"
              className="sim-btn"
              data-active={anyStale ? 'true' : 'false'}
              data-testid="toggle-stale-btn"
              onClick={toggleStaleDemo}
            >
              {anyStale ? t.controls.simulateRecover : t.controls.simulateStale}
            </button>

            <button type="button" className="sim-btn" onClick={resetDemo}>
              {t.controls.resetDemo}
            </button>
          </div>
        </div>

        {/* Full-Scale DSH Host Window */}
        <div className="workbench-window" data-testid="interactive-workbench">
          {/* OS Window Titlebar */}
          <div className="workbench-os-titlebar">
            <div className="window-dots" aria-hidden="true">
              <span className="window-dot window-dot--close" />
              <span className="window-dot window-dot--min" />
              <span className="window-dot window-dot--max" />
            </div>

            <div className="workbench-os-title-center">
              {showTaskbarSummary && taskbarSummary && (
                <span
                  className="os-title-summary-badge tabular-nums"
                  data-testid="window-title-summary"
                >
                  {taskbarSummary}
                </span>
              )}
              <span>
                DeepSeek Harness —{' '}
                {activeDevice.isLocal
                  ? t.nativeBar.localTab
                  : activeDevice.name}
              </span>
            </div>

            <div className="workbench-os-right">
              <span className="transport-telemetry-pill">
                {activeDevice.sshSummary}
              </span>
            </div>
          </div>

          {/* Authentic 42px Persistent Top Native Bar */}
          <div
            ref={nativeBarRef}
            className="dsh-md-native-bar"
            data-testid="native-tab-bar"
          >
            <div className="dsh-md-native-tabs" role="tablist">
              {visibleTabs.map((dev) => {
                const isActive = dev.id === activeDevice.id
                const attention = summarizeDeviceAttention(dev)
                const label = dev.isLocal ? t.nativeBar.localTab : dev.name
                const showCapsule =
                  attention.segments.length > 0 || dev.stale

                const toggleMenuFor = (anchorEl: HTMLElement) => {
                  const barRect = nativeBarRef.current?.getBoundingClientRect()
                  const anchorRect = anchorEl.getBoundingClientRect()
                  if (barRect) {
                    const maxLeft = Math.max(8, barRect.width - 356)
                    const computedLeft = Math.min(
                      maxLeft,
                      Math.max(8, anchorRect.left - barRect.left),
                    )
                    setMenuLeftPx(computedLeft)
                  }
                  setOpenMenuDeviceId((cur) => (cur === dev.id ? null : dev.id))
                }

                return (
                  <div
                    key={dev.id}
                    className="dsh-md-tab-pill"
                    data-active={isActive ? 'true' : 'false'}
                    data-device-tab={dev.id}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className="dsh-md-tab-trigger"
                      data-testid={`device-tab-${dev.id}`}
                      onClick={() => handleSwitchDevice(dev.id)}
                    >
                      {dev.isLocal && <GlobeIcon size={13} />}
                      <span className="dsh-md-tab-name">{label}</span>
                      {!dev.keepAliveMounted && !dev.isLocal && (
                        <span
                          className="dsh-md-tab-unmounted-dot"
                          title={t.pane.keepAliveUnmountedTitle}
                        />
                      )}
                    </button>

                    {/* Status Capsule */}
                    {showCapsule && (
                      <span className="dsh-md-tab-status-anchor">
                        {attention.segments.length > 0 ? (
                          <span
                            className="dsh-md-tab-status"
                            data-stale={dev.stale ? 'true' : undefined}
                            data-testid={`capsule-${dev.id}`}
                          >
                            {attention.segments.map((seg) => (
                              <button
                                key={seg.tone}
                                type="button"
                                className="dsh-md-tab-status-part"
                                data-tone={seg.tone}
                                data-testid={`capsule-part-${dev.id}-${seg.tone}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleMenuFor(e.currentTarget)
                                }}
                              >
                                {formatCountCell(seg.count)}
                              </button>
                            ))}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="dsh-md-tab-status"
                            data-empty="true"
                            data-stale="true"
                            title={t.nativeBar.staleHint}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleMenuFor(e.currentTarget)
                            }}
                          />
                        )}
                      </span>
                    )}

                    {/* Close Background Keep-Alive Frame Button on Inactive Remote Tabs */}
                    {!dev.isLocal && !isActive && dev.keepAliveMounted && (
                      <button
                        type="button"
                        className="dsh-md-tab-close"
                        title={t.nativeBar.releaseTooltip}
                        aria-label={`${t.nativeBar.releaseTooltip}: ${dev.name}`}
                        data-testid={`close-keepalive-${dev.id}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleReleaseKeepAlive(dev.id)
                        }}
                      >
                        <CloseIcon size={11} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Portalled/Unclipped Official Translucent DSH Attention Menu */}
            {openMenuDeviceId &&
              (() => {
                const menuDev = visibleTabs.find(
                  (d) => d.id === openMenuDeviceId,
                )
                if (!menuDev) return null
                const menuAttention = summarizeDeviceAttention(menuDev)
                const menuLabel = menuDev.isLocal
                  ? t.nativeBar.localTab
                  : menuDev.name
                return (
                  <div
                    className="dsh-official-menu-popover"
                    role="menu"
                    data-testid="attention-menu"
                    style={{ left: `${menuLeftPx}px` }}
                  >
                    {menuDev.stale && (
                      <div className="dsh-menu-stale-banner">
                        {t.nativeBar.staleHint}
                      </div>
                    )}

                    {menuAttention.pendingSessions.length > 0 && (
                      <div className="dsh-menu-group">
                        <div className="dsh-menu-group-label">
                          <span style={{ color: '#f59e0b' }}>
                            {t.nativeBar.pendingGroup.replace(
                              '{count}',
                              String(menuAttention.pendingSessions.length),
                            )}
                          </span>
                        </div>
                        {menuAttention.pendingSessions.map((sess) => (
                          <button
                            key={sess.id}
                            type="button"
                            role="menuitem"
                            className="dsh-menu-item-btn"
                            data-testid={`menu-item-${sess.id}`}
                            onClick={() =>
                              handleOpenSessionFromMenu(menuDev.id, sess.id)
                            }
                          >
                            <StateDot status="pending" />
                            <span className="dsh-menu-item-texts">
                              <div className="dsh-menu-item-title">
                                {sess.title[locale]}
                              </div>
                              <div className="dsh-menu-item-sub">
                                {sess.workspacePath} · {menuLabel} ·{' '}
                                {sess.updatedLabel[locale]}
                              </div>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {menuAttention.runningSessions.length > 0 && (
                      <div className="dsh-menu-group">
                        <div className="dsh-menu-group-label">
                          <span style={{ color: '#7aaaff' }}>
                            {t.nativeBar.runningGroup.replace(
                              '{count}',
                              String(menuAttention.runningSessions.length),
                            )}
                          </span>
                        </div>
                        {menuAttention.runningSessions.map((sess) => (
                          <button
                            key={sess.id}
                            type="button"
                            role="menuitem"
                            className="dsh-menu-item-btn"
                            data-testid={`menu-item-${sess.id}`}
                            onClick={() =>
                              handleOpenSessionFromMenu(menuDev.id, sess.id)
                            }
                          >
                            <StateDot status="running" />
                            <span className="dsh-menu-item-texts">
                              <div className="dsh-menu-item-title">
                                {sess.title[locale]}
                              </div>
                              <div className="dsh-menu-item-sub">
                                {sess.workspacePath} · {menuLabel} ·{' '}
                                {sess.updatedLabel[locale]}
                              </div>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {menuAttention.unreadSessions.length > 0 && (
                      <div className="dsh-menu-group">
                        <div className="dsh-menu-group-label">
                          <span style={{ color: '#22c55e' }}>
                            {t.nativeBar.unreadGroup.replace(
                              '{count}',
                              String(menuAttention.unreadSessions.length),
                            )}
                          </span>
                        </div>
                        {menuAttention.unreadSessions.map((sess) => (
                          <button
                            key={sess.id}
                            type="button"
                            role="menuitem"
                            className="dsh-menu-item-btn"
                            data-testid={`menu-item-${sess.id}`}
                            onClick={() =>
                              handleOpenSessionFromMenu(menuDev.id, sess.id)
                            }
                          >
                            <StateDot status="unread" />
                            <span className="dsh-menu-item-texts">
                              <div className="dsh-menu-item-title">
                                {sess.title[locale]}
                              </div>
                              <div className="dsh-menu-item-sub">
                                {sess.workspacePath} · {menuLabel} ·{' '}
                                {sess.updatedLabel[locale]}
                              </div>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

            {/* Right Fixed Action Cluster */}
            <div className="dsh-md-native-actions">
              {!activeDevice.isLocal && (
                <>
                  <button
                    type="button"
                    className="dsh-md-icon-btn"
                    title={t.nativeBar.reloadTooltip}
                    onClick={() =>
                      showToast(
                        locale === 'zh'
                          ? `已通过本地代理刷新 ${activeDevice.name} (${activeDevice.proxyUrl})`
                          : `Reloaded ${activeDevice.name} via local proxy`,
                      )
                    }
                  >
                    <RefreshIcon size={14} />
                  </button>
                  <button
                    type="button"
                    className="dsh-md-icon-btn"
                    title={t.nativeBar.externalTooltip}
                    onClick={() =>
                      showToast(
                        locale === 'zh'
                          ? `独立窗口地址：${activeDevice.proxyUrl}`
                          : `Standalone loopback URL: ${activeDevice.proxyUrl}`,
                      )
                    }
                  >
                    <ExternalLinkIcon size={14} />
                  </button>
                </>
              )}

              <button
                type="button"
                className="dsh-md-icon-btn"
                title={t.nativeBar.settingsTooltip}
                data-testid="open-settings-btn"
                onClick={() => setSettingsOpen(true)}
              >
                <SettingsIcon size={15} />
              </button>
            </div>
          </div>

          {toastMessage && (
            <div
              style={{
                position: 'absolute',
                top: 88,
                right: 18,
                zIndex: 120,
                padding: '8px 14px',
                borderRadius: 10,
                background: 'rgba(20, 26, 40, 0.95)',
                border: '1px solid rgba(122, 170, 255, 0.4)',
                fontSize: 12,
                color: '#dbeafe',
                boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
              }}
            >
              {toastMessage}
            </div>
          )}

          {/* Keep-Alive DOM Stage: All mounted devices remain in DOM! */}
          <div
            className="workbench-stage-viewport"
            data-exploded={exploded3d ? 'true' : 'false'}
            data-testid="keepalive-stage"
          >
            {visibleTabs.map((dev) => {
              const isActive = dev.id === activeDevice.id
              const rank = mountedOrder.findIndex((d) => d.id === dev.id)

              const style: React.CSSProperties = exploded3d
                ? {
                    display: 'block',
                    visibility: 'visible',
                    zIndex: 30 - rank,
                    opacity: isActive ? 1 : Math.max(0.62, 0.94 - rank * 0.12),
                    transform: `translate3d(${(rank - 1.3) * 52}px, ${56 - rank * 38}px, ${-rank * 72}px) rotateX(10deg) rotateY(-14deg) scale(0.76)`,
                  }
                : isActive
                  ? {
                      display: 'block',
                      visibility: 'visible',
                      zIndex: 20,
                    }
                  : {
                      display: 'none',
                      visibility: 'hidden',
                      zIndex: 1,
                    }

              return (
                <div
                  key={dev.id}
                  className="dsh-md-native-frame-wrap"
                  data-device-id={dev.id}
                  data-visible={isActive ? 'true' : 'false'}
                  style={style}
                  onClick={
                    exploded3d
                      ? () => {
                          handleSwitchDevice(dev.id)
                        }
                      : undefined
                  }
                >
                  {exploded3d && (
                    <div className="exploded-layer-ribbon">
                      <span>
                        {dev.isLocal ? t.nativeBar.localTab : dev.name}
                      </span>
                      <span>·</span>
                      <span style={{ color: isActive ? '#86efac' : '#9ec0ff' }}>
                        {isActive
                          ? 'Z=0px (ACTIVE)'
                          : dev.keepAliveMounted
                            ? `Z=-${rank * 72}px (KEEP-ALIVE MOUNTED)`
                            : 'RELEASED'}
                      </span>
                    </div>
                  )}

                  <DshDevicePane
                    device={dev}
                    locale={locale}
                    streamTick={streamTick}
                    onSelectSession={(sessId) =>
                      acknowledgeIfUnread(dev.id, sessId)
                    }
                    onCreateSession={() => handleCreateSession(dev.id)}
                    onChangeDraft={(txt) =>
                      setDevices((prev) =>
                        prev.map((item) =>
                          item.id === dev.id
                            ? { ...item, draftText: txt }
                            : item,
                        ),
                      )
                    }
                    onSendDraft={() => handleSendDraft(dev.id)}
                    onApproveSession={(sessId) =>
                      handleApproveSession(dev.id, sessId)
                    }
                    onRejectSession={(sessId) =>
                      handleRejectSession(dev.id, sessId)
                    }
                    onRemount={() => handleRemount(dev.id)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Settings -> Multi-Device (MultiDeviceHubPanel) Modal */}
      {settingsOpen && (
        <div
          className="dsh-modal-backdrop"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="dsh-modal-panel"
            role="dialog"
            aria-modal="true"
            data-testid="settings-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17 }}>
                {t.settingsModal.title}
              </h3>
              <button
                type="button"
                className="dsh-md-icon-btn"
                onClick={() => setSettingsOpen(false)}
              >
                <CloseIcon size={14} />
              </button>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.55,
                color: 'var(--dsw-alias-label-secondary)',
              }}
            >
              {t.settingsModal.intro}
            </p>

            <div className="dsh-pref-row">
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {t.settingsModal.prefTaskbar}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--dsw-alias-label-tertiary)',
                    marginTop: 3,
                  }}
                >
                  {t.settingsModal.prefTaskbarDesc}
                </div>
              </div>
              <button
                type="button"
                className="dsh-switch"
                data-checked={showTaskbarSummary ? 'true' : 'false'}
                onClick={() => setShowTaskbarSummary((v) => !v)}
              >
                <span className="dsh-switch-thumb" />
              </button>
            </div>

            <div className="dsh-pref-row">
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {t.settingsModal.prefReadSync}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--dsw-alias-label-tertiary)',
                    marginTop: 3,
                  }}
                >
                  {t.settingsModal.prefReadSyncDesc}
                </div>
              </div>
              <button
                type="button"
                className="dsh-switch"
                data-checked={syncReadState ? 'true' : 'false'}
                onClick={() => setSyncReadState((v) => !v)}
              >
                <span className="dsh-switch-thumb" />
              </button>
            </div>

            <div className="dsh-pref-row">
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {t.settingsModal.prefUiSync}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--dsw-alias-label-tertiary)',
                    marginTop: 3,
                  }}
                >
                  {t.settingsModal.prefUiSyncDesc}
                </div>
              </div>
              <button
                type="button"
                className="dsh-switch"
                data-checked={syncUiState ? 'true' : 'false'}
                onClick={() => setSyncUiState((v) => !v)}
              >
                <span className="dsh-switch-thumb" />
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 4,
              }}
            >
              <strong style={{ fontSize: 13.5 }}>
                {t.settingsModal.devicesHeading}
              </strong>
              <button
                type="button"
                className="sim-btn"
                disabled={hasProdImported}
                data-testid="import-prod-btn"
                onClick={handleImportProd}
                style={{
                  opacity: hasProdImported ? 0.6 : 1,
                }}
              >
                {hasProdImported
                  ? t.settingsModal.importedTag
                  : t.settingsModal.importBtn}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {devices
                .filter((d) => !d.isLocal)
                .map((d) => (
                  <div
                    key={d.id}
                    className="dsh-pref-row"
                    style={{ alignItems: 'center', padding: '10px 14px' }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 620,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span>{d.name}</span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: '#86efac',
                          }}
                        >
                          system-ssh
                        </span>
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--dsw-alias-label-tertiary)',
                          marginTop: 2,
                        }}
                      >
                        {d.sshSummary} · {d.proxyUrl}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="dsh-switch"
                      data-checked={d.enabled ? 'true' : 'false'}
                      onClick={() =>
                        setDevices((prev) =>
                          prev.map((item) =>
                            item.id === d.id
                              ? { ...item, enabled: !item.enabled }
                              : item,
                          ),
                        )
                      }
                    >
                      <span className="dsh-switch-thumb" />
                    </button>
                  </div>
                ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-hero-primary"
                data-testid="close-settings-btn"
                onClick={() => setSettingsOpen(false)}
              >
                {t.settingsModal.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

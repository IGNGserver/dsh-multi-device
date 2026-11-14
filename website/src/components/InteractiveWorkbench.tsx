import { useEffect, useMemo, useRef, useState } from 'react'
import { REPO_URL, type SiteCopy } from '../data/copy'
import { createImportedProdDevice, INITIAL_DEVICES } from '../data/workspaceFixtures'
import type { DeviceRecord, DshSessionItem, Locale, WorkbenchViewMode } from '../types'
import {
  formatCountCell,
  formatTaskbarSummary,
  summarizeDeviceAttention,
} from '../utils/attention'
import { DshDevicePane } from './DshDevicePane'
import {
  CheckIcon,
  CloseIcon,
  LaptopIcon,
  PlusIcon,
  ServerIcon,
  SettingsIcon,
} from './Icons'
import { MiniDshWindow } from './MiniDshWindow'

interface InteractiveWorkbenchProps {
  readonly locale: Locale
  readonly copy: SiteCopy
}

export function InteractiveWorkbench({ locale, copy }: InteractiveWorkbenchProps) {
  const [devices, setDevices] = useState<DeviceRecord[]>(INITIAL_DEVICES)
  const [activeDeviceId, setActiveDeviceId] = useState<string>('ubuntu-dev')
  const [viewMode, setViewMode] = useState<WorkbenchViewMode>('converged')
  const [openMenuDeviceId, setOpenMenuDeviceId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const timersRef = useRef<number[]>([])
  const activeDeviceIdRef = useRef<string>(activeDeviceId)
  activeDeviceIdRef.current = activeDeviceId

  const workbenchWrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => {
      for (const id of timersRef.current) {
        window.clearTimeout(id)
      }
      timersRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!openMenuDeviceId && !settingsOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuDeviceId(null)
        setSettingsOpen(false)
      }
    }
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (
        openMenuDeviceId &&
        !target.closest('[data-testid="attention-menu"]') &&
        !target.closest('[data-testid="native-tab-bar"]')
      ) {
        setOpenMenuDeviceId(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('mousedown', handleOutside)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('mousedown', handleOutside)
    }
  }, [openMenuDeviceId, settingsOpen])

  const enabledDevices = useMemo(
    () => devices.filter((dev) => dev.enabled),
    [devices],
  )

  const taskbarText = useMemo(
    () => formatTaskbarSummary(enabledDevices, locale),
    [enabledDevices, locale],
  )

  const menuDevice = useMemo(
    () => devices.find((d) => d.id === openMenuDeviceId) ?? null,
    [devices, openMenuDeviceId],
  )

  const menuSummary = useMemo(
    () => (menuDevice ? summarizeDeviceAttention(menuDevice) : null),
    [menuDevice],
  )

  const prodImported = useMemo(
    () => devices.some((d) => d.id === 'prod-arm64'),
    [devices],
  )

  const handleSelectDevice = (deviceId: string) => {
    if (activeDeviceId === deviceId) {
      const current = devices.find((d) => d.id === deviceId)
      const summary = current ? summarizeDeviceAttention(current) : null
      if (summary && summary.totalActive > 0) {
        setOpenMenuDeviceId((prev) => (prev === deviceId ? null : deviceId))
      }
      return
    }
    setOpenMenuDeviceId(null)
    setActiveDeviceId(deviceId)
  }

  const handleDockFromScattered = (deviceId: string) => {
    setViewMode('converged')
    setActiveDeviceId(deviceId)
    setOpenMenuDeviceId(null)
  }

  const handleSelectSession = (deviceId: string, sessionId: string) => {
    if (!sessionId) return
    setViewMode('converged')
    setActiveDeviceId(deviceId)
    setOpenMenuDeviceId(null)
    setDevices((prev) =>
      prev.map((dev) => {
        if (dev.id !== deviceId) return dev
        return {
          ...dev,
          activeSessionId: sessionId,
          sessions: dev.sessions.map((s) =>
            s.id === sessionId && s.status === 'unread' ? { ...s, status: 'idle' } : s,
          ),
        }
      }),
    )
  }

  const handleUpdateDraft = (deviceId: string, text: string) => {
    setDevices((prev) =>
      prev.map((dev) => (dev.id === deviceId ? { ...dev, draftText: text } : dev)),
    )
  }

  const handleSendMessage = (deviceId: string) => {
    const dev = devices.find((d) => d.id === deviceId)
    if (!dev) return
    const prompt = dev.draftText.trim()
    if (!prompt) return

    const targetSessionId = dev.activeSessionId
    const stamp = Date.now()
    const userBlockId = `u-${stamp}`
    const assistBlockId = `a-${stamp}`

    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== deviceId) return d
        return {
          ...d,
          draftText: '',
          sessions: d.sessions.map((s) => {
            if (s.id !== targetSessionId) return s
            return {
              ...s,
              status: 'running',
              updatedLabel: { zh: '运行中', en: 'Running' },
              blocks: [
                ...s.blocks,
                {
                  id: userBlockId,
                  kind: 'user',
                  content: { zh: prompt, en: prompt },
                },
                {
                  id: assistBlockId,
                  kind: 'assistant',
                  status: 'ongoing',
                  content: {
                    zh: copy.workbench.simulatedStreamReply(prompt),
                    en: copy.workbench.simulatedStreamReply(prompt),
                  },
                },
              ],
            }
          }),
        }
      }),
    )

    const finishTimer = window.setTimeout(() => {
      const stillWatching = activeDeviceIdRef.current === deviceId
      setDevices((prev) =>
        prev.map((d) => {
          if (d.id !== deviceId) return d
          return {
            ...d,
            sessions: d.sessions.map((s) => {
              if (s.id !== targetSessionId) return s
              return {
                ...s,
                status: stillWatching ? 'idle' : 'unread',
                updatedLabel: { zh: '刚刚', en: 'Just now' },
                blocks: s.blocks.map((b) =>
                  b.id === assistBlockId
                    ? {
                        ...b,
                        status: 'done',
                        content: {
                          zh: `${copy.workbench.simulatedStreamReply(prompt)}\n\n${copy.workbench.simulatedStreamFinal}`,
                          en: `${copy.workbench.simulatedStreamReply(prompt)}\n\n${copy.workbench.simulatedStreamFinal}`,
                        },
                      }
                    : b,
                ),
              }
            }),
          }
        }),
      )
    }, 850)

    timersRef.current.push(finishTimer)
  }

  const handleApproveAction = (deviceId: string, sessionId: string, allow: boolean) => {
    setDevices((prev) =>
      prev.map((dev) => {
        if (dev.id !== deviceId) return dev
        return {
          ...dev,
          sessions: dev.sessions.map((sess) => {
            if (sess.id !== sessionId) return sess
            return {
              ...sess,
              status: allow ? 'running' : 'idle',
              pendingKind: undefined,
              updatedLabel: allow
                ? { zh: '运行中', en: 'Running' }
                : { zh: '已取消', en: 'Declined' },
              blocks: sess.blocks.map((b) => {
                if (b.kind !== 'approval') return b
                return {
                  ...b,
                  kind: 'assistant',
                  status: allow ? 'ongoing' : 'done',
                  content: allow
                    ? {
                        zh: SITE_NOTICE_ALLOW.zh,
                        en: SITE_NOTICE_ALLOW.en,
                      }
                    : {
                        zh: SITE_NOTICE_DENY.zh,
                        en: SITE_NOTICE_DENY.en,
                      },
                }
              }),
            }
          }),
        }
      }),
    )
  }

  const handleReconnect = (deviceId: string) => {
    setDevices((prev) =>
      prev.map((dev) =>
        dev.id === deviceId ? { ...dev, connected: true, stale: false } : dev,
      ),
    )
  }

  const handleImportProd = () => {
    setDevices((prev) => {
      if (prev.some((d) => d.id === 'prod-arm64')) {
        return prev.map((d) => (d.id === 'prod-arm64' ? { ...d, enabled: true } : d))
      }
      return [...prev, createImportedProdDevice()]
    })
  }

  const handleToggleDeviceEnabled = (deviceId: string) => {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== deviceId || d.isLocal) return d
        return { ...d, enabled: !d.enabled }
      }),
    )
    if (activeDeviceId === deviceId) {
      setActiveDeviceId('__local__')
    }
  }

  return (
    <section id="workbench" className="hero-workbench">
      <div className="shell-container">
        {/* Clean, readable DSH Hero */}
        <div className="hero-header">
          <div className="hero-eyebrow">{copy.hero.eyebrow}</div>
          <h1 className="hero-title">{copy.hero.title}</h1>
          <p className="hero-subtitle">{copy.hero.subtitle}</p>
          <div className="hero-actions">
            <a className="dsh-btn dsh-btn--primary dsh-btn--lg" href="#install">
              {copy.hero.primaryCta}
            </a>
            <a
              className="dsh-btn dsh-btn--ghost dsh-btn--lg"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
            >
              {copy.hero.secondaryCta}
            </a>
          </div>
        </div>

        {/* Restrained 2D Segmented Mode Switcher (Before vs After) */}
        <div className="workbench-controls">
          <div className="segmented-tabs" role="tablist" aria-label={copy.nav.workbench}>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'converged'}
              className={`segmented-tabs__btn${viewMode === 'converged' ? ' is-active' : ''}`}
              data-testid="mode-converged"
              onClick={() => setViewMode('converged')}
            >
              {copy.hero.modeConverged}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'scattered'}
              className={`segmented-tabs__btn${viewMode === 'scattered' ? ' is-active' : ''}`}
              data-testid="mode-scattered"
              onClick={() => setViewMode('scattered')}
            >
              {copy.hero.modeScattered}
            </button>
          </div>
          <p className="workbench-controls__hint">
            {viewMode === 'converged'
              ? copy.hero.modeConvergedHint
              : copy.hero.modeScatteredHint}
          </p>
        </div>

        {/* 2x2 Flat Comparison Grid OR Unified DSH Workbench */}
        {viewMode === 'scattered' ? (
          <div className="scattered-stage" data-testid="scattered-stage">
            <div className="scattered-grid">
              {enabledDevices.slice(0, 4).map((dev) => (
                <MiniDshWindow
                  key={dev.id}
                  device={dev}
                  locale={locale}
                  copy={copy}
                  onDockDevice={handleDockFromScattered}
                />
              ))}
            </div>
          </div>
        ) : (
          <div ref={workbenchWrapRef} className="workbench-shell-wrap">
            {/* Quiet SSH Connection Strip integrated directly above window */}
            <div className="connection-strip">
              <div className="connection-strip__left">
                <span className="connection-strip__dot" aria-hidden="true" />
                <span className="connection-strip__badge">{copy.connectionStrip.badge}</span>
                <span className="connection-strip__summary">
                  {copy.connectionStrip.summary}
                </span>
              </div>
              <span className="connection-strip__tip">{copy.connectionStrip.tip}</span>
            </div>

            {/* Authentic DSH Desktop Window Frame */}
            <div className="dsh-window" data-testid="interactive-workbench">
              <div className="dsh-titlebar">
                <div className="dsh-titlebar__dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="dsh-titlebar__center">DeepSeek Harness</div>
                <div className="dsh-titlebar__right">
                  {taskbarText && (
                    <span className="dsh-taskbar-pill" title={copy.workbench.taskbarLabel}>
                      {copy.workbench.taskbarLabel} · {taskbarText}
                    </span>
                  )}
                </div>
              </div>

              {/* 42px Native Multi-Device Plugin Tab Strip */}
              <div className="dsh-tabstrip-wrap">
                <div
                  className="dsh-tabstrip"
                  role="tablist"
                  data-testid="native-tab-bar"
                >
                  <div className="dsh-tabstrip__tabs">
                    {enabledDevices.map((dev) => {
                      const active = dev.id === activeDeviceId
                      const attention = summarizeDeviceAttention(dev)
                      return (
                        <button
                          key={dev.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className={`dsh-tab${active ? ' is-active' : ''}`}
                          data-testid={`device-tab-${dev.id}`}
                          onClick={() => handleSelectDevice(dev.id)}
                        >
                          <span className="dsh-tab__icon">
                            {dev.isLocal ? <LaptopIcon /> : <ServerIcon />}
                          </span>
                          <span className="dsh-tab__label">{dev.name}</span>

                          {attention.segments.length > 0 && (
                            <span
                              className="dsh-capsule"
                              data-testid={`capsule-${dev.id}`}
                              role="button"
                              tabIndex={0}
                              aria-label={`${dev.name} attention`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenMenuDeviceId((prev) =>
                                  prev === dev.id ? null : dev.id,
                                )
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setOpenMenuDeviceId((prev) =>
                                    prev === dev.id ? null : dev.id,
                                  )
                                }
                              }}
                            >
                              {attention.segments.map((seg) => (
                                <span
                                  key={seg.tone}
                                  className={`dsh-capsule__part dsh-capsule__part--${seg.tone}`}
                                  data-testid={`capsule-part-${dev.id}-${seg.tone}`}
                                >
                                  {formatCountCell(seg.count)}
                                </span>
                              ))}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    className="dsh-tabstrip__settings"
                    data-testid="open-settings-btn"
                    title={copy.workbench.addDeviceTooltip}
                    aria-label={copy.workbench.addDeviceTooltip}
                    onClick={() => {
                      setOpenMenuDeviceId(null)
                      setSettingsOpen(true)
                    }}
                  >
                    <PlusIcon />
                    <SettingsIcon />
                  </button>
                </div>

                {/* Attention Capsule Popover Menu */}
                {menuDevice && menuSummary && (
                  <div
                    className="dsh-attention-menu"
                    role="dialog"
                    aria-label={copy.workbench.attentionMenuTitle}
                    data-testid="attention-menu"
                  >
                    <div className="dsh-attention-menu__head">
                      <span>{menuDevice.name}</span>
                      <span className="dsh-attention-menu__sub">
                        {copy.workbench.attentionMenuTitle}
                      </span>
                    </div>

                    <AttentionGroup
                      label={copy.workbench.attentionGroups.pending}
                      tone="pending"
                      sessions={menuSummary.pendingSessions}
                      locale={locale}
                      onPick={(sessId) => handleSelectSession(menuDevice.id, sessId)}
                    />
                    <AttentionGroup
                      label={copy.workbench.attentionGroups.running}
                      tone="running"
                      sessions={menuSummary.runningSessions}
                      locale={locale}
                      onPick={(sessId) => handleSelectSession(menuDevice.id, sessId)}
                    />
                    <AttentionGroup
                      label={copy.workbench.attentionGroups.done}
                      tone="done"
                      sessions={menuSummary.unreadSessions}
                      locale={locale}
                      onPick={(sessId) => handleSelectSession(menuDevice.id, sessId)}
                    />
                  </div>
                )}
              </div>

              {/* Keep-Alive Viewport Stage: all mounted tabs stay alive in DOM */}
              <div className="dsh-stage" data-testid="keepalive-stage">
                {enabledDevices.map((dev) => (
                  <DshDevicePane
                    key={dev.id}
                    device={dev}
                    isActive={dev.id === activeDeviceId}
                    locale={locale}
                    copy={copy}
                    onSelectSession={handleSelectSession}
                    onUpdateDraft={handleUpdateDraft}
                    onSendMessage={handleSendMessage}
                    onApproveAction={handleApproveAction}
                    onReconnect={handleReconnect}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings · Multi-Device Discovery Modal */}
      {settingsOpen && (
        <div
          className="dsh-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setSettingsOpen(false)
            }
          }}
        >
          <div
            className="dsh-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dsh-settings-title"
            data-testid="settings-modal"
          >
            <div className="dsh-modal__head">
              <div>
                <h2 id="dsh-settings-title" className="dsh-modal__title">
                  {copy.workbench.settingsModal.title}
                </h2>
                <p className="dsh-modal__subtitle">
                  {copy.workbench.settingsModal.subtitle}
                </p>
              </div>
              <button
                type="button"
                className="dsh-modal__close"
                data-testid="close-settings-btn"
                aria-label={copy.workbench.settingsModal.closeBtn}
                onClick={() => setSettingsOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>

            <div className="dsh-modal__body">
              <div className="dsh-ssh-discovery">
                <div className="dsh-ssh-discovery__text">
                  <span className="dsh-ssh-discovery__dot" aria-hidden="true" />
                  <span>{copy.workbench.settingsModal.sshAutoDiscovery}</span>
                </div>
                {prodImported ? (
                  <span className="dsh-imported-badge">
                    <CheckIcon />
                    <span>{copy.workbench.settingsModal.importedTag}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="dsh-btn dsh-btn--primary"
                    data-testid="import-prod-btn"
                    onClick={handleImportProd}
                  >
                    {copy.workbench.settingsModal.quickImportBtn}
                  </button>
                )}
              </div>

              <ul className="dsh-device-settings-list">
                {devices.map((dev) => (
                  <li key={dev.id} className="dsh-device-settings-row">
                    <div>
                      <div className="dsh-device-settings-row__name">{dev.name}</div>
                      <div className="dsh-device-settings-row__meta">
                        {dev.sshSummary} · {dev.osLabel}
                      </div>
                    </div>
                    {dev.isLocal ? (
                      <span className="dsh-device-settings-row__locked">
                        {locale === 'zh' ? '本机' : 'Local'}
                      </span>
                    ) : (
                      <label className="dsh-switch">
                        <input
                          type="checkbox"
                          checked={dev.enabled}
                          onChange={() => handleToggleDeviceEnabled(dev.id)}
                        />
                        <span>
                          {dev.enabled
                            ? locale === 'zh'
                              ? '已启用'
                              : 'Enabled'
                            : locale === 'zh'
                              ? '已暂停'
                              : 'Paused'}
                        </span>
                      </label>
                    )}
                  </li>
                ))}
              </ul>

              <p className="dsh-modal__note">
                {copy.workbench.settingsModal.remoteSetupNote}
              </p>
            </div>

            <div className="dsh-modal__foot">
              <button
                type="button"
                className="dsh-btn dsh-btn--primary"
                onClick={() => setSettingsOpen(false)}
              >
                {copy.workbench.settingsModal.closeBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

const SITE_NOTICE_ALLOW = {
  zh: '你已允许执行，正在后台清理旧缓存并打包第 4 轮训练权重…',
  en: 'Approved. Cleaning old cache folders and exporting checkpoint round 4 in the background…',
}

const SITE_NOTICE_DENY = {
  zh: '已取消本次磁盘清理操作，会话已安全停留在当前步骤。',
  en: 'Cancelled the cleanup command. Session remains safely idle at this checkpoint.',
}

function AttentionGroup({
  label,
  tone,
  sessions,
  locale,
  onPick,
}: {
  readonly label: string
  readonly tone: 'pending' | 'running' | 'done'
  readonly sessions: readonly DshSessionItem[]
  readonly locale: Locale
  readonly onPick: (sessionId: string) => void
}) {
  if (sessions.length === 0) return null
  return (
    <div className="dsh-attention-group">
      <div className={`dsh-attention-group__label dsh-attention-group__label--${tone}`}>
        <span className="dsh-attention-group__dot" aria-hidden="true" />
        <span>{label}</span>
      </div>
      {sessions.map((sess) => (
        <button
          key={sess.id}
          type="button"
          className="dsh-attention-item"
          data-testid={`menu-item-${sess.id}`}
          onClick={() => onPick(sess.id)}
        >
          <span className="dsh-attention-item__title">{sess.title[locale]}</span>
          <span className="dsh-attention-item__meta">
            {sess.workspaceName} · {sess.updatedLabel[locale]}
          </span>
        </button>
      ))}
    </div>
  )
}

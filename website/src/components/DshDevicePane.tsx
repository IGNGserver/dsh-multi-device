import { useEffect, useRef } from 'react'
import type { SiteCopy } from '../data/copy'
import type { DeviceRecord, Locale, TrajectoryBlock } from '../types'
import {
  ArrowUpIcon,
  CheckIcon,
  ContextRing,
  FolderIcon,
  LaptopIcon,
  PlusIcon,
  ServerIcon,
} from './Icons'

interface DshDevicePaneProps {
  readonly device: DeviceRecord
  readonly isActive: boolean
  readonly locale: Locale
  readonly copy: SiteCopy
  readonly onSelectSession: (deviceId: string, sessionId: string) => void
  readonly onUpdateDraft: (deviceId: string, text: string) => void
  readonly onSendMessage: (deviceId: string) => void
  readonly onApproveAction: (deviceId: string, sessionId: string, allow: boolean) => void
  readonly onReconnect: (deviceId: string) => void
}

export function DshDevicePane({
  device,
  isActive,
  locale,
  copy,
  onSelectSession,
  onUpdateDraft,
  onSendMessage,
  onApproveAction,
  onReconnect,
}: DshDevicePaneProps) {
  const streamRef = useRef<HTMLDivElement | null>(null)
  const activeSession =
    device.sessions.find((s) => s.id === device.activeSessionId) ?? device.sessions[0]

  useEffect(() => {
    if (isActive && streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [isActive, activeSession?.blocks.length])

  const renderBlock = (block: TrajectoryBlock) => {
    if (block.kind === 'user') {
      return (
        <div key={block.id} className="dsh-msg-row dsh-msg-row--user">
          <div className="dsh-user-bubble">{block.content[locale]}</div>
        </div>
      )
    }

    if (block.kind === 'tool') {
      return (
        <div key={block.id} className="dsh-tool-card">
          <div className="dsh-tool-card__head">
            <span className="dsh-tool-card__status">
              <CheckIcon />
            </span>
            <span className="dsh-tool-card__title">{block.subtitle ?? 'Tool'}</span>
            {block.metrics && <span className="dsh-tool-card__metrics">{block.metrics}</span>}
          </div>
          <p className="dsh-tool-card__body">{block.content[locale]}</p>
        </div>
      )
    }

    if (block.kind === 'diff') {
      return (
        <div key={block.id} className="dsh-diff-card">
          <div className="dsh-diff-card__head">
            <span>{block.subtitle ?? 'Diff'}</span>
          </div>
          <p className="dsh-diff-card__note">{block.content[locale]}</p>
          {block.diffLines && (
            <div className="dsh-diff-lines">
              {block.diffLines.map((line, idx) => (
                <div
                  key={`${block.id}-${idx}`}
                  className={`dsh-diff-line dsh-diff-line--${line.type}`}
                >
                  <span className="dsh-diff-sign">
                    {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                  </span>
                  <code>{line.text}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    if (block.kind === 'approval') {
      return (
        <div key={block.id} className="dsh-approval-card">
          <div className="dsh-approval-card__head">
            <span className="dsh-approval-card__dot" aria-hidden="true" />
            <span>{block.title?.[locale] ?? copy.workbench.approvalPromptLabel}</span>
          </div>
          {block.command && <pre className="dsh-approval-card__cmd">{block.command}</pre>}
          <p className="dsh-approval-card__body">{block.content[locale]}</p>
          <div className="dsh-approval-card__actions">
            <button
              type="button"
              className="dsh-btn dsh-btn--primary"
              data-testid="approve-allow-btn"
              onClick={() =>
                activeSession && onApproveAction(device.id, activeSession.id, true)
              }
            >
              {copy.workbench.approveAllow}
            </button>
            <button
              type="button"
              className="dsh-btn dsh-btn--ghost"
              onClick={() =>
                activeSession && onApproveAction(device.id, activeSession.id, false)
              }
            >
              {copy.workbench.approveDeny}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div key={block.id} className="dsh-msg-row dsh-msg-row--assistant">
        <div className="dsh-assistant-text">
          {block.content[locale]}
          {block.status === 'ongoing' && (
            <span className="dsh-streaming-cursor" aria-hidden="true" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`dsh-pane${isActive ? ' is-active' : ''}`}
      data-testid={`device-pane-${device.id}`}
      hidden={!isActive}
      aria-hidden={!isActive}
    >
      {/* Left Sidebar (official DSH #f9fafb / #1b1b1c surface) */}
      <aside className="dsh-sidebar" aria-label={copy.workbench.sidebarTitle}>
        <div className="dsh-sidebar__head">
          <span className="dsh-sidebar__device">
            {device.isLocal ? <LaptopIcon /> : <ServerIcon />}
            <span>{device.name}</span>
          </span>
          <span className="dsh-sidebar__host-meta">{device.sshSummary}</span>
        </div>

        <button
          type="button"
          className="dsh-sidebar__new-chat"
          onClick={() => onSelectSession(device.id, device.sessions[0]?.id ?? '')}
        >
          <PlusIcon />
          <span>{copy.workbench.sidebarNewChat}</span>
        </button>

        <div className="dsh-sidebar__groups">
          {device.workspaces.map((ws) => {
            const wsSessions = device.sessions.filter((s) => s.workspaceId === ws.id)
            return (
              <div key={ws.id} className="dsh-ws-group">
                <div className="dsh-ws-group__head">
                  <FolderIcon />
                  <span className="dsh-ws-group__name">{ws.name}</span>
                  <span className="dsh-ws-group__branch">{ws.branch}</span>
                </div>
                <ul className="dsh-session-list">
                  {wsSessions.map((sess) => {
                    const selected = sess.id === activeSession?.id
                    return (
                      <li key={sess.id}>
                        <button
                          type="button"
                          className={`dsh-session-item${selected ? ' is-selected' : ''}`}
                          onClick={() => onSelectSession(device.id, sess.id)}
                        >
                          <span className="dsh-session-item__top">
                            <span
                              className={`dsh-status-dot dsh-status-dot--${sess.status}`}
                              aria-hidden="true"
                            />
                            <span className="dsh-session-item__title">
                              {sess.title[locale]}
                            </span>
                          </span>
                          <span className="dsh-session-item__time">
                            {sess.updatedLabel[locale]}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </aside>

      {/* Main Conversation Column */}
      <div className="dsh-main">
        <div className="dsh-main__header">
          <div className="dsh-main__title-group">
            <h3 className="dsh-main__title">
              {activeSession ? activeSession.title[locale] : device.name}
            </h3>
            {activeSession && (
              <span className="dsh-main__path">
                {activeSession.workspaceName} · {activeSession.workspacePath}
              </span>
            )}
          </div>
          {activeSession && (
            <div className="dsh-main__context" title={`${activeSession.contextPercent}%`}>
              <ContextRing percent={activeSession.contextPercent} />
              <span>{activeSession.contextPercent}%</span>
            </div>
          )}
        </div>

        {!device.connected && (
          <div className="dsh-offline-banner">
            <span>{copy.workbench.offlineBanner}</span>
            <button
              type="button"
              className="dsh-btn dsh-btn--ghost"
              onClick={() => onReconnect(device.id)}
            >
              {copy.workbench.reconnectBtn}
            </button>
          </div>
        )}

        <div
          ref={streamRef}
          className="dsh-stream"
          data-testid={`live-stream-${device.id}`}
        >
          {activeSession?.blocks.map(renderBlock)}
        </div>

        <div className="dsh-composer-wrap">
          <div className="dsh-composer">
            {(device.draftChip || device.draftText.trim().length > 0) && (
              <div className="dsh-composer__chips">
                {device.draftChip && (
                  <span className="dsh-composer-chip">@ {device.draftChip}</span>
                )}
                {device.draftText.trim().length > 0 && (
                  <span className="dsh-composer-draft-hint">
                    {copy.workbench.draftSavedNote}
                  </span>
                )}
              </div>
            )}

            <textarea
              className="dsh-composer__input"
              data-testid={`composer-${device.id}`}
              rows={2}
              value={device.draftText}
              placeholder={copy.workbench.placeholder}
              onChange={(e) => onUpdateDraft(device.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (device.draftText.trim()) {
                    onSendMessage(device.id)
                  }
                }
              }}
            />

            <div className="dsh-composer__bar">
              <div className="dsh-composer__meta">
                <span className="dsh-meta-pill">
                  {activeSession?.model ?? copy.workbench.modelChip}
                </span>
                <span className="dsh-meta-pill">{copy.workbench.agentChip}</span>
              </div>

              <button
                type="button"
                className="dsh-send-btn"
                aria-label={copy.workbench.sendAria}
                disabled={device.draftText.trim().length === 0}
                onClick={() => onSendMessage(device.id)}
              >
                <ArrowUpIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

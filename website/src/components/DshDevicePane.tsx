import { useState } from 'react'
import { getCopy } from '../data/copy'
import type { DeviceRecord, Locale } from '../types'
import {
  CheckIcon,
  ContextRing,
  FishLogo,
  FolderIcon,
  PlusIcon,
  SidebarDockIcon,
  StateDot,
  TerminalIcon,
} from './Icons'

interface DshDevicePaneProps {
  readonly device: DeviceRecord
  readonly locale: Locale
  readonly streamTick: number
  readonly onSelectSession: (sessionId: string) => void
  readonly onCreateSession: () => void
  readonly onChangeDraft: (text: string) => void
  readonly onSendDraft: () => void
  readonly onApproveSession: (sessionId: string) => void
  readonly onRejectSession: (sessionId: string) => void
  readonly onRemount: () => void
}

export function DshDevicePane({
  device,
  locale,
  streamTick,
  onSelectSession,
  onCreateSession,
  onChangeDraft,
  onSendDraft,
  onApproveSession,
  onRejectSession,
  onRemount,
}: DshDevicePaneProps) {
  const t = getCopy(locale).workbench
  const [viewMode, setViewMode] = useState<'trajectory' | 'chat'>('trajectory')
  const [dockOpen, setDockOpen] = useState(true)

  if (!device.keepAliveMounted) {
    return (
      <div
        className="unmounted-stage-placeholder"
        data-testid={`unmounted-${device.id}`}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'rgba(122, 170, 255, 0.1)',
            border: '1px solid rgba(122, 170, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ec0ff',
          }}
        >
          <TerminalIcon size={20} />
        </div>
        <h3 style={{ margin: '4px 0 0', fontSize: 16 }}>
          {t.pane.keepAliveUnmountedTitle}
        </h3>
        <p
          style={{
            margin: 0,
            maxWidth: 460,
            fontSize: 13.5,
            color: 'var(--dsw-alias-label-secondary)',
            lineHeight: 1.6,
          }}
        >
          {t.pane.keepAliveUnmountedDesc}
        </p>
        <button
          type="button"
          className="btn-hero-primary"
          onClick={onRemount}
          data-testid={`remount-${device.id}`}
        >
          {t.pane.remountBtn}
        </button>
      </div>
    )
  }

  const activeSession =
    device.sessions.find((s) => s.id === device.activeSessionId) ??
    device.sessions[0]

  const displayName = device.isLocal ? t.nativeBar.localTab : device.name

  return (
    <div
      className="dsh-device-pane"
      data-dock-open={dockOpen ? 'true' : 'false'}
    >
      {/* Column 1: Official DSH Left Sidebar */}
      <aside className="dsh-sidebar">
        <div className="dsh-sidebar-header">
          <span className="dsh-sidebar-brand">
            <FishLogo size={18} />
            <span>DeepSeek</span>
          </span>
          <span className="dsh-host-chip">{displayName}</span>
        </div>

        <button
          type="button"
          className="dsh-new-session-btn"
          onClick={onCreateSession}
        >
          <PlusIcon size={14} />
          <span>{t.pane.newSession}</span>
        </button>

        <div className="dsh-isolation-callout">
          {t.pane.localIsolationNote}
        </div>

        <div className="dsh-sidebar-scroll">
          <div className="dsh-ws-section-label">{t.pane.workspacesHeader}</div>

          {device.workspaces.map((ws) => {
            const wsSessions = device.sessions.filter(
              (s) => s.workspaceId === ws.id,
            )
            return (
              <div key={ws.id} className="dsh-ws-block">
                <div className="dsh-ws-title-row">
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <FolderIcon size={13} />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ws.name}
                    </span>
                  </span>
                  <span className="dsh-ws-branch">{ws.branch}</span>
                </div>

                {wsSessions.map((sess) => (
                  <button
                    key={sess.id}
                    type="button"
                    className="dsh-session-row"
                    data-active={sess.id === activeSession.id ? 'true' : 'false'}
                    data-testid={`sidebar-sess-${sess.id}`}
                    onClick={() => onSelectSession(sess.id)}
                  >
                    <StateDot status={sess.status} />
                    <span className="dsh-session-row-title">
                      {sess.title[locale]}
                    </span>
                    <span className="dsh-session-row-meta">
                      {sess.updatedLabel[locale]}
                    </span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>

        <div className="dsh-sidebar-footer">
          <span>DSH v{device.dshVersion}</span>
          <span>{device.isLocal ? 'Host' : `${device.latencyMs ?? 5}ms SSH`}</span>
        </div>
      </aside>

      {/* Column 2: Center Conversation & Trajectory Stream */}
      <div className="dsh-conversation-col">
        <div className="dsh-conv-header">
          <div className="dsh-conv-title-group">
            <StateDot status={activeSession.status} />
            <span className="dsh-conv-title">
              {activeSession.title[locale]}
            </span>
          </div>

          <div className="dsh-conv-header-controls">
            <div className="dsh-segmented" role="group">
              <button
                type="button"
                className="dsh-segmented-btn"
                data-active={viewMode === 'chat' ? 'true' : 'false'}
                onClick={() => setViewMode('chat')}
              >
                Chat
              </button>
              <button
                type="button"
                className="dsh-segmented-btn"
                data-active={viewMode === 'trajectory' ? 'true' : 'false'}
                onClick={() => setViewMode('trajectory')}
              >
                Trajectory
              </button>
            </div>

            <button
              type="button"
              className="dsh-md-icon-btn"
              title="Toggle Workspace & Tunnel Inspector"
              onClick={() => setDockOpen((v) => !v)}
            >
              <SidebarDockIcon size={14} />
            </button>
          </div>
        </div>

        <div className="dsh-conv-stream">
          {activeSession.blocks.map((block) => {
            if (block.kind === 'user') {
              return (
                <div key={block.id} className="dsh-msg-user">
                  {block.content[locale]}
                </div>
              )
            }

            if (block.kind === 'assistant') {
              return (
                <div key={block.id} className="dsh-msg-assistant">
                  {block.content[locale]}
                </div>
              )
            }

            if (block.kind === 'approval') {
              return (
                <div
                  key={block.id}
                  className="dsh-approval-card"
                  data-testid={`approval-card-${activeSession.id}`}
                >
                  <div className="dsh-approval-head">
                    <span>⚠ {t.pane.approveTitle}</span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        opacity: 0.85,
                      }}
                    >
                      {device.name}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: '#fef3c7',
                      lineHeight: 1.5,
                    }}
                  >
                    {t.pane.approveDesc}
                  </div>
                  {block.command && (
                    <pre className="dsh-approval-cmd">{block.command}</pre>
                  )}
                  <div
                    style={{
                      fontSize: 12,
                      color: 'rgba(254, 243, 199, 0.8)',
                      lineHeight: 1.45,
                    }}
                  >
                    {block.content[locale]}
                  </div>
                  <div className="dsh-approval-actions">
                    <button
                      type="button"
                      className="btn-approve-allow"
                      data-testid="approve-allow-btn"
                      onClick={() => onApproveSession(activeSession.id)}
                    >
                      {t.pane.approveAllow}
                    </button>
                    <button
                      type="button"
                      className="btn-approve-reject"
                      onClick={() => onRejectSession(activeSession.id)}
                    >
                      {t.pane.approveReject}
                    </button>
                  </div>
                </div>
              )
            }

            if (viewMode === 'chat' && (block.kind === 'tool' || block.kind === 'diff')) {
              return (
                <div key={block.id} className="dsh-tool-card">
                  <div className="dsh-tool-card-head">
                    <span className="dsh-tool-card-title">
                      {block.status === 'ongoing' ? (
                        <StateDot status="running" />
                      ) : (
                        <span style={{ color: '#22c55e' }}>
                          <CheckIcon size={13} />
                        </span>
                      )}
                      <span>{block.title?.[locale]}</span>
                    </span>
                    <span className="dsh-tool-card-sub">{block.subtitle}</span>
                  </div>
                </div>
              )
            }

            if (block.kind === 'diff') {
              return (
                <div key={block.id} className="dsh-tool-card">
                  <div className="dsh-tool-card-head">
                    <span className="dsh-tool-card-title">
                      <span style={{ color: '#22c55e' }}>
                        <CheckIcon size={13} />
                      </span>
                      <span>{block.title?.[locale]}</span>
                    </span>
                    <span className="dsh-tool-card-sub">{block.subtitle}</span>
                  </div>
                  <div className="dsh-tool-card-body">
                    {block.content[locale]}
                  </div>
                  {block.diffLines && (
                    <div className="dsh-diff-box">
                      {block.diffLines.map((ln, idx) => (
                        <div
                          key={idx}
                          className="dsh-diff-row"
                          data-diff={ln.type}
                        >
                          <span className="dsh-diff-ln">
                            {ln.lineOld ?? ''}
                          </span>
                          <span className="dsh-diff-ln">
                            {ln.lineNew ?? ''}
                          </span>
                          <span>
                            {ln.type === 'add'
                              ? '+ '
                              : ln.type === 'del'
                                ? '- '
                                : '  '}
                            {ln.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            // Tool / Persistent Bash Block
            const liveStreamSuffix =
              block.status === 'ongoing'
                ? `\n[events.mux seq #${1040 + streamTick}] throughput=${141200 + (streamTick % 9) * 310} msg/s · P99=0.${38 + (streamTick % 7)}ms (Keep-Alive live)`
                : ''

            return (
              <div key={block.id} className="dsh-tool-card">
                <div className="dsh-tool-card-head">
                  <span className="dsh-tool-card-title">
                    {block.status === 'ongoing' ? (
                      <StateDot status="running" />
                    ) : (
                      <span style={{ color: '#22c55e' }}>
                        <CheckIcon size={13} />
                      </span>
                    )}
                    <span>{block.title?.[locale]}</span>
                  </span>
                  <span className="dsh-tool-card-sub">{block.subtitle}</span>
                </div>
                {block.code && (
                  <pre
                    className="dsh-terminal-pre tabular-nums"
                    data-testid={
                      block.status === 'ongoing'
                        ? `live-stream-${device.id}`
                        : undefined
                    }
                  >
                    {block.code}
                    {liveStreamSuffix}
                  </pre>
                )}
                <div className="dsh-tool-card-body">
                  {block.content[locale]}
                </div>
              </div>
            )
          })}
        </div>

        {/* Official 24px-Radius DSH Composer */}
        <div className="dsh-composer-outer">
          <div className="dsh-composer-box">
            <div className="dsh-composer-top-chips">
              <span className="dsh-context-chip">
                {device.draftChip ?? activeSession.workspaceName}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--dsw-alias-label-caption)',
                }}
              >
                {device.isLocal ? t.pane.localDomPill : t.pane.bridgePill}
              </span>
            </div>

            <textarea
              className="dsh-composer-textarea"
              rows={2}
              value={device.draftText}
              placeholder={t.pane.composerPlaceholder}
              data-testid={`composer-${device.id}`}
              onChange={(e) => onChangeDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  onSendDraft()
                }
              }}
            />

            <div className="dsh-composer-toolbar">
              <div className="dsh-composer-tools-left">
                <span className="dsh-composer-pill">Workspace Write</span>
                <span className="dsh-composer-pill">
                  {activeSession.model} · {activeSession.effort}
                </span>
              </div>

              <div className="dsh-composer-tools-right">
                <ContextRing percent={activeSession.contextPercent} />
                <button
                  type="button"
                  className="dsh-send-btn"
                  data-testid={`send-btn-${device.id}`}
                  onClick={onSendDraft}
                >
                  <span>{t.pane.sendBtn}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Column 3: Isolated Machine & Tunnel Inspector */}
      {dockOpen && (
        <aside className="dsh-inspector-dock">
          <div className="inspector-card">
            <div className="inspector-card-title">
              {locale === 'zh' ? '机器与隧道边界' : 'Host & Tunnel Isolation'}
            </div>
            <div className="inspector-kv">
              <span className="inspector-k">Host</span>
              <span className="inspector-v">{displayName}</span>
            </div>
            <div className="inspector-kv">
              <span className="inspector-k">OS</span>
              <span className="inspector-v">{device.osLabel}</span>
            </div>
            <div className="inspector-kv">
              <span className="inspector-k">Transport</span>
              <span className="inspector-v">
                {device.isLocal ? 'Native Host DOM' : 'system-ssh -L'}
              </span>
            </div>
            {device.proxyUrl && (
              <div className="inspector-kv">
                <span className="inspector-k">Loopback</span>
                <span className="inspector-v">{device.proxyUrl}</span>
              </div>
            )}
          </div>

          <div className="inspector-card">
            <div className="inspector-card-title">
              {locale === 'zh'
                ? '当前机器本地磁盘路径'
                : 'Machine-Local Disk Path'}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: '#9ec0ff',
                wordBreak: 'break-all',
              }}
            >
              {activeSession.workspacePath}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--dsw-alias-label-caption)',
                lineHeight: 1.45,
              }}
            >
              {locale === 'zh'
                ? '零文件同步：源码与构建产物 100% 留在该设备自身文件系统。'
                : 'Zero file sync: source & build outputs stay 100% on this host’s filesystem.'}
            </div>
          </div>

          <div className="inspector-card">
            <div className="inspector-card-title">Keep-Alive Bridge</div>
            <div className="inspector-kv">
              <span className="inspector-k">DOM State</span>
              <span className="inspector-v" style={{ color: '#86efac' }}>
                Mounted
              </span>
            </div>
            <div className="inspector-kv">
              <span className="inspector-k">Host Key</span>
              <span className="inspector-v">Strict=yes</span>
            </div>
            <div className="inspector-kv">
              <span className="inspector-k">Epoch</span>
              <span className="inspector-v tabular-nums">
                #{device.stale ? 'reconnecting' : '4 (live)'}
              </span>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}

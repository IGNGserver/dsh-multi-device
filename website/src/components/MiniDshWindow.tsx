import { forwardRef } from 'react'
import type { DeviceRecord, Locale } from '../types'
import { FishLogo, FolderIcon, StateDot } from './Icons'

interface MiniDshWindowProps {
  readonly device: DeviceRecord
  readonly locale: Locale
  readonly localLabel: string
  readonly isFront: boolean
  readonly dockedPaddingTop: number
  readonly showFloatingTag: boolean
  readonly onSelect?: () => void
}

export const MiniDshWindow = forwardRef<HTMLDivElement, MiniDshWindowProps>(
  function MiniDshWindow(
    {
      device,
      locale,
      localLabel,
      isFront,
      dockedPaddingTop,
      showFloatingTag,
      onSelect,
    },
    ref,
  ) {
    const activeSession =
      device.sessions.find((s) => s.id === device.activeSessionId) ??
      device.sessions[0]
    const displayName = device.isLocal ? localLabel : device.name

    return (
      <div
        ref={ref}
        className="mini-dsh-card"
        data-device-id={device.id}
        data-front={isFront ? 'true' : 'false'}
        data-interactive={onSelect ? 'true' : 'false'}
        onClick={onSelect}
        style={{
          paddingTop: dockedPaddingTop > 0 ? `${dockedPaddingTop}px` : undefined,
        }}
      >
        {showFloatingTag && (
          <div className="mini-dsh-floating-tag">
            <StateDot status={activeSession.status} />
            <span>{device.sshSummary}</span>
          </div>
        )}

        <div className="mini-dsh-titlebar">
          <div className="window-dots" aria-hidden="true">
            <span className="window-dot window-dot--close" />
            <span className="window-dot window-dot--min" />
            <span className="window-dot window-dot--max" />
          </div>
          <div className="mini-dsh-host-label">
            <strong>{displayName}</strong>
            <span>·</span>
            <span>{device.osLabel}</span>
          </div>
          <span
            className="mini-dsh-ver"
            style={{ visibility: showFloatingTag ? 'hidden' : 'visible' }}
          >
            DSH {device.dshVersion}
          </span>
        </div>

        <div className="mini-dsh-body">
          <aside className="mini-dsh-sidebar">
            <div className="mini-dsh-brand">
              <span className="mini-dsh-brand-left">
                <FishLogo size={16} />
                <span>DeepSeek</span>
              </span>
              <span className="mini-dsh-ver">{displayName}</span>
            </div>

            {device.workspaces.map((ws) => {
              const wsSessions = device.sessions.filter(
                (s) => s.workspaceId === ws.id,
              )
              return (
                <div key={ws.id} className="mini-dsh-ws-group">
                  <div className="mini-dsh-ws-header">
                    <FolderIcon size={12} />
                    <span>{ws.name}</span>
                  </div>
                  {wsSessions.map((sess) => (
                    <div
                      key={sess.id}
                      className="mini-dsh-sess-item"
                      data-active={
                        sess.id === activeSession.id ? 'true' : 'false'
                      }
                    >
                      <StateDot status={sess.status} />
                      <span className="mini-dsh-sess-title">
                        {sess.title[locale]}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </aside>

          <div className="mini-dsh-main">
            <div className="mini-dsh-main-header">
              <span className="mini-dsh-main-title">
                {activeSession.title[locale]}
              </span>
              <span className="mini-dsh-path-chip">
                {activeSession.workspacePath}
              </span>
            </div>

            <div className="mini-dsh-stream">
              {activeSession.blocks.slice(0, 2).map((block) => {
                if (block.kind === 'user') {
                  return (
                    <div key={block.id} className="mini-bubble-user">
                      {block.content[locale]}
                    </div>
                  )
                }
                return (
                  <div
                    key={block.id}
                    className="mini-tool-card"
                    data-tone={block.kind === 'approval' ? 'approval' : 'normal'}
                  >
                    <div className="mini-tool-head">
                      <span>
                        {block.title
                          ? block.title[locale]
                          : locale === 'zh'
                            ? 'DeepSeek Harness 响应'
                            : 'DeepSeek Harness Output'}
                      </span>
                      {block.subtitle && (
                        <span style={{ color: '#81858c' }}>{block.subtitle}</span>
                      )}
                    </div>
                    {block.code && (
                      <pre className="mini-tool-code">{block.code}</pre>
                    )}
                    {block.command && (
                      <pre className="mini-tool-code">{block.command}</pre>
                    )}
                    <div style={{ color: '#cfd3d6', lineHeight: 1.42 }}>
                      {block.content[locale]}
                    </div>
                  </div>
                )
              })}

              {activeSession.blocks[2]?.kind === 'approval' && (
                <div className="mini-tool-card" data-tone="approval">
                  <div className="mini-tool-head" style={{ color: '#fde68a' }}>
                    <span>
                      {locale === 'zh'
                        ? '⚠ 等待工具批准 · Pending Approval'
                        : '⚠ Waiting for Tool Approval'}
                    </span>
                    <span>gpu-a100</span>
                  </div>
                  <pre className="mini-tool-code">
                    {activeSession.blocks[2].command}
                  </pre>
                </div>
              )}
            </div>

            <div className="mini-composer">
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {device.draftChip ? `[${device.draftChip}] ` : ''}
                {device.draftText}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10.5px',
                  color: '#9ec0ff',
                  flex: 'none',
                }}
              >
                {activeSession.model}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  },
)

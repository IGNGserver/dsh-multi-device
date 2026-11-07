/** Explainable attention badges: IDs and categories only, never messages. */
import React, { useState } from 'react'
import type { DeviceAttentionView } from '../attention.ts'
import { copyText } from './clipboard.ts'
import type { MultiDeviceLocaleKey } from './locales.ts'

export interface AttentionDetailsProps {
  readonly view?: DeviceAttentionView
  readonly deviceName: string
  readonly t: (key: MultiDeviceLocaleKey) => string
  readonly nativeBar?: boolean
  /** Compatibility with Hosts predating the shared projection. */
  readonly fallback?: {
    readonly runningCount?: number
    readonly pendingCount?: number
    readonly unreadSessionIds: readonly string[]
    readonly fresh: boolean
  }
}

/** Exported for category/label tests without loading any native primitives. */
export function attentionGroups(view: DeviceAttentionView): {
  category: 'pending' | 'running' | 'unread'; ids: readonly string[]; count: number
}[] {
  return [
    { category: 'pending', ids: view.pendingSessionIds, count: view.pendingSessionIds.length },
    { category: 'running', ids: view.runningSessionIds, count: view.runningSessionIds.length },
    { category: 'unread', ids: view.unreadSessionIds, count: view.unreadSessionIds.length },
  ]
}

/** Localized here because the delegated surface intentionally does not edit locale contracts. */
export function attentionLabels(t: (key: MultiDeviceLocaleKey) => string) {
  return t('nativeLocalTab') === '本机'
    ? { pending: '需回复', running: '运行中', unread: '未读', stale: '同步中 / 数据过期', last: '上次已知', members: '会话成员', unavailable: '旧版 Host 未提供成员 ID', copy: '复制 ID', copied: '已复制', failed: '复制失败，请手动选择 ID', requests: '待处理请求' }
    : { pending: 'needs reply', running: 'running', unread: 'unread', stale: 'Syncing / stale data', last: 'Last known', members: 'Session members', unavailable: 'Older Host did not provide member IDs', copy: 'Copy ID', copied: 'Copied', failed: 'Copy failed; select the ID manually', requests: 'pending requests' }
}

export function AttentionDetails({ view, deviceName, t, nativeBar = false, fallback }: AttentionDetailsProps): React.ReactElement {
  const [copyResult, setCopyResult] = useState<string | undefined>()
  const words = attentionLabels(t)
  const fresh = view?.fresh ?? fallback?.fresh ?? false
  const groups = view !== undefined ? attentionGroups(view) : [
    { category: 'pending' as const, ids: [], count: fallback?.pendingCount ?? 0 },
    { category: 'running' as const, ids: [], count: fallback?.runningCount ?? 0 },
    { category: 'unread' as const, ids: fallback?.unreadSessionIds ?? [], count: fallback?.unreadSessionIds.length ?? 0 },
  ]
  return (
    <span className="dsh-md-attention" role="group" aria-label={`${deviceName} ${words.members}`} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      {!fresh && <span role="status" className="dsh-md-muted" data-attention-stale="true">{words.stale}</span>}
      {groups.filter(group => group.count > 0).map(group => {
        const label = `${fresh ? '' : `${words.last}: `}${group.count} ${words[group.category]}`
        return (
          <details key={group.category} data-attention-category={group.category} style={{ position: 'relative' }}>
            <summary className={group.category === 'pending' ? 'dsh-md-pending' : 'dsh-md-session-count-badge'} aria-label={`${deviceName}: ${label}; ${words.members}`} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</summary>
            <div role="region" aria-label={`${deviceName}: ${words[group.category]} ${words.members}`} style={{
              position: nativeBar ? 'fixed' : 'absolute', zIndex: 1000,
              top: nativeBar ? 'calc(var(--dsh-md-native-bar-top, 0px) + var(--dsh-md-native-bar-height, 42px))' : '100%',
              left: nativeBar ? 8 : 0, minWidth: 240, maxWidth: 'min(520px, calc(100vw - 24px))',
              maxHeight: 'min(420px, 60vh)', overflow: 'auto', padding: 12,
              background: 'var(--surface, Canvas)', color: 'var(--text-primary, CanvasText)',
              border: '1px solid var(--border, GrayText)', borderRadius: 8, boxShadow: '0 4px 18px #0003',
            }}>
              <strong>{deviceName}: {label}</strong>
              {group.category === 'pending' && view !== undefined && <div>{fresh ? '' : `${words.last}: `}{view.pendingRequestCount} {words.requests}</div>}
              {group.ids.length === 0 ? <p>{words.unavailable}</p> : (
                <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
                  {group.ids.map(id => <li key={id} data-attention-member={id} style={{ marginBottom: 6 }}>
                    <span>{words[group.category]}: </span><code style={{ overflowWrap: 'anywhere', userSelect: 'text' }}>{id}</code>{' '}
                    <button type="button" aria-label={`${words.copy}: ${id}`} onClick={() => {
                      void copyText(id).then(ok => setCopyResult(ok ? words.copied : words.failed))
                    }}>{words.copy}</button>
                  </li>)}
                </ul>
              )}
              {copyResult !== undefined && <span role="status">{copyResult}</span>}
            </div>
          </details>
        )
      })}
    </span>
  )
}

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  attentionUnreadIds, emptyDeviceAttention, selectDeviceAttention,
  type DeviceAttentionView, type SessionAttentionFact,
} from '../src/attention.ts'
import { AttentionDetails, attentionGroups } from '../src/client/AttentionDetails.tsx'

const fact = (sessionId: string, extra: Partial<SessionAttentionFact> = {}): SessionAttentionFact => ({
  sessionId, deviceId: 'local', running: false, ...extra,
})
const project = (facts: SessionAttentionFact[], unread: string[] = [], currentSessionId?: string) =>
  selectDeviceAttention(facts, new Set(unread), { currentSessionId }).local
const t = (key: string): string => key === 'nativeLocalTab' ? '本机' : key

function markup(view: DeviceAttentionView): string {
  return renderToStaticMarkup(React.createElement(AttentionDetails, { view, deviceName: '本机', t }))
}

describe('pure attention projection', () => {
  it('filters archive, explicit subagent origin and noncurrent blank, including pending', () => {
    const view = project([
      fact('archived', { archived: true, running: true, pendingInteractionKind: 'approval' }),
      fact('child', { origin: 'subagent', running: true }),
      fact('blank', { blank: true, pendingRequestCount: 2 }),
      fact('current', { blank: true, running: true }),
      fact('visible'),
    ], ['archived', 'child', 'blank', 'visible'], 'current')
    expect(view.eligibleSessionIds).toEqual(['current', 'visible'])
    expect(view.runningSessionIds).toEqual(['current'])
    expect(view.unreadSessionIds).toEqual(['visible'])
    expect(view.pendingSessionIds).toEqual([])
  })

  it('keeps forks with a parentSessionId; no parent heuristic', () => {
    const fork = { ...fact('fork'), parentSessionId: 'parent' }
    expect(project([fork], ['fork']).unreadSessionIds).toEqual(['fork'])
  })

  it('uses pending > running including children > unread as mutually exclusive classes', () => {
    const view = project([
      fact('approval', { running: true, pendingInteractionKind: 'approval', pendingRequestCount: 3 }),
      fact('question', { pendingInteractionKind: 'question' }),
      fact('plan', { pendingInteractionKind: 'plan-review' }),
      fact('count-only', { pendingRequestCount: 2 }),
      fact('running', { running: true }),
      fact('parent', { runningSubagentCount: 2 }),
      fact('unread'), fact('idle'),
    ], ['approval', 'question', 'plan', 'count-only', 'running', 'parent', 'unread'])
    expect(view.pendingSessionIds).toEqual(['approval', 'count-only', 'plan', 'question'])
    expect(view.pendingRequestCount).toBe(7)
    expect(view.runningSessionIds).toEqual(['parent', 'running'])
    expect(view.unreadSessionIds).toEqual(['unread'])
    const classified = [...view.pendingSessionIds, ...view.runningSessionIds, ...view.unreadSessionIds]
    expect(new Set(classified).size).toBe(classified.length)
  })

  it('deduplicates repeated facts, merges strongest signal and counts each request total once', () => {
    const facts = [fact('z'), fact('b', { running: true }), fact('a'),
      fact('b', { pendingRequestCount: 4 }), fact('b', { pendingRequestCount: 2 }), fact('z')]
    const view = project(facts, ['z', 'z'])
    expect(view.eligibleSessionIds).toEqual(['a', 'b', 'z'])
    expect(view.pendingSessionIds).toEqual(['b'])
    expect(view.runningSessionIds).toEqual([])
    expect(view.pendingRequestCount).toBe(4)
    expect(view.unreadSessionIds).toEqual(['z'])
    expect(project([...facts].reverse(), ['z'])).toEqual(view)
  })

  it('does not let a duplicated archived or child row reenter', () => {
    expect(project([fact('x'), fact('x', { archived: true })], ['x']).eligibleSessionIds).toEqual([])
    expect(project([fact('x'), fact('x', { origin: 'subagent' })], ['x']).eligibleSessionIds).toEqual([])
  })

  it('does not truncate members beyond the first fifty visible rows', () => {
    const facts = Array.from({ length: 120 }, (_, i) => fact(`s${String(i).padStart(3, '0')}`))
    const view = project(facts, facts.map(x => x.sessionId))
    expect(view.eligibleSessionIds).toHaveLength(120)
    expect(view.unreadSessionIds).toHaveLength(120)
    expect(view.unreadSessionIds.at(-1)).toBe('s119')
  })

  it('partitions identical raw IDs by their explicit device and ignores unknown unread IDs', () => {
    const views = selectDeviceAttention([fact('a'), fact('b', { deviceId: 'remote' })], new Set(['a', 'b', 'deleted']))
    expect(Object.keys(views)).toEqual(['local', 'remote'])
    expect(views.local.unreadSessionIds).toEqual(['a'])
    expect(views.remote.unreadSessionIds).toEqual(['b'])
    expect(attentionUnreadIds(views)).toEqual(new Set(['a', 'b']))
  })

  it('handles arbitrary device keys without object prototype pollution', () => {
    const views = selectDeviceAttention([fact('a', { deviceId: '__proto__' })], new Set(['a']))
    expect(views['__proto__'].unreadSessionIds).toEqual(['a'])
    expect(Object.keys(views)).toEqual(['__proto__'])
  })

  it('preserves explicit freshness independently of empty or populated counts', () => {
    expect(selectDeviceAttention([fact('a')], new Set(), { fresh: false }).local.fresh).toBe(false)
    expect(project([fact('a')]).fresh).toBe(true)
    expect(emptyDeviceAttention(false)).toEqual({
      eligibleSessionIds: [], runningSessionIds: [], pendingSessionIds: [], unreadSessionIds: [], pendingRequestCount: 0, fresh: false,
    })
    expect(selectDeviceAttention([], new Set())).toEqual({})
  })

  it('sanitizes invalid request/child counts and does not mutate inputs', () => {
    const facts = Object.freeze([
      Object.freeze(fact('negative', { pendingRequestCount: -2, runningSubagentCount: -1 })),
      Object.freeze(fact('nan', { pendingRequestCount: NaN })),
      Object.freeze(fact('infinite', { pendingRequestCount: Infinity })),
      Object.freeze(fact('fraction', { pendingRequestCount: 2.8 })),
    ])
    const unread = new Set(['negative', 'nan', 'infinite'])
    const view = selectDeviceAttention(facts, unread).local
    expect(view.pendingSessionIds).toEqual(['fraction'])
    expect(view.pendingRequestCount).toBe(2)
    expect(unread.size).toBe(3)
  })
})

describe('explainable attention UI', () => {
  it('labels every category, lists member IDs and exposes ID copy, not message contents', () => {
    const view = project([
      fact('request-id', { pendingInteractionKind: 'question', pendingRequestCount: 3 }),
      fact('running-id', { running: true }), fact('unread-id'),
    ], ['unread-id'])
    const html = markup(view)
    expect(attentionGroups(view).map(g => [g.category, g.count])).toEqual([['pending', 1], ['running', 1], ['unread', 1]])
    for (const label of ['1 需回复', '1 运行中', '1 未读', '3', '待处理请求']) expect(html).toContain(label)
    for (const id of ['request-id', 'running-id', 'unread-id']) {
      expect(html).toContain(`data-attention-member="${id}"`)
      expect(html).toContain(`复制 ID: ${id}`)
    }
    expect(html.match(/<summary/g)).toHaveLength(3)
    expect(html).not.toContain('message')
  })

  it('marks stale empty data explicitly instead of displaying authoritative zero', () => {
    const html = markup(emptyDeviceAttention(false))
    expect(html).toContain('同步中 / 数据过期')
    expect(html).not.toContain('0 未读')
    expect(html).not.toContain('0 运行中')
  })

  it('marks retained nonzero data as last known and never truncates expanded members', () => {
    const view = selectDeviceAttention(Array.from({ length: 73 }, (_, i) => fact(`session-${i}`)), new Set(Array.from({ length: 73 }, (_, i) => `session-${i}`)), { fresh: false }).local
    const html = markup(view)
    expect(html).toContain('上次已知: 73 未读')
    expect(html.match(/data-attention-member=/g)).toHaveLength(73)
  })

  it('supports older Host counts but explicitly explains absent membership', () => {
    const html = renderToStaticMarkup(React.createElement(AttentionDetails, {
      deviceName: 'Remote', t,
      fallback: { runningCount: 2, pendingCount: 1, unreadSessionIds: ['legacy-unread'], fresh: false },
    }))
    expect(html).toContain('旧版 Host 未提供成员 ID')
    expect(html).toContain('legacy-unread')
    expect(html).toContain('同步中 / 数据过期')
  })

  it('localizes English labels and qualifies retained request totals', () => {
    const view = selectDeviceAttention([fact('request', { pendingRequestCount: 2 })], new Set(), { fresh: false }).local
    const html = renderToStaticMarkup(React.createElement(AttentionDetails, { view, deviceName: 'Local', t: key => key === 'nativeLocalTab' ? 'This Device' : key }))
    expect(html).toContain('Syncing / stale data')
    expect(html).toContain('Last known: 1 needs reply')
    expect(html).toContain('Last known: 2 pending requests')
    expect(html).toContain('Copy ID: request')
    expect(html).not.toContain('需回复')
  })

  it('uses the same selector-backed members in native, workspace and Hub surfaces', () => {
    for (const file of ['NativeViewport.tsx', 'projectBadges.ts', 'MultiDeviceHubPanel.tsx']) {
      const source = readFileSync(new URL(`../src/client/${file}`, import.meta.url), 'utf8')
      expect(source).toContain('attentionByDevice')
      expect(source).toContain('attentionUnreadIds')
    }
    const native = readFileSync(new URL('../src/client/NativeViewport.tsx', import.meta.url), 'utf8')
    expect(native).toContain('view={attentionByDevice?.[LOCAL_DEVICE_ID]}')
    expect(native).toContain('view={attentionByDevice?.[dev.id]}')
  })
})

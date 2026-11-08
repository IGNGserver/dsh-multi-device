import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  attentionUnreadIds, emptyDeviceAttention, selectDeviceAttention,
  type DeviceAttentionView, type SessionAttentionFact,
} from '../src/attention.ts'
import { AttentionDetails, attentionGroups } from '../src/client/AttentionDetails.tsx'
import { resolveAttentionSessions } from '../src/client/attentionSessions.ts'
import { en, zh, type MultiDeviceLocaleKey } from '../src/client/locales.ts'
import type { MultiDeviceSnapshot } from '../src/contract.ts'

const dict = (table: Record<string, string>) =>
  (key: MultiDeviceLocaleKey): string => table[key] ?? key
const tZh = dict(zh as unknown as Record<string, string>)
const tEn = dict(en as unknown as Record<string, string>)

/** Snapshot with nothing in it: the joins degrade to IDs and counts. */
const emptySnapshot = {
  logicalWorkspaces: [], sessionOrigins: {}, devices: [],
} as unknown as MultiDeviceSnapshot

const fact = (sessionId: string, extra: Partial<SessionAttentionFact> = {}): SessionAttentionFact => ({
  sessionId, deviceId: 'local', running: false, ...extra,
})
const project = (facts: SessionAttentionFact[], unread: string[] = [], currentSessionId?: string) =>
  selectDeviceAttention(facts, new Set(unread), { currentSessionId }).local

function markup(view: DeviceAttentionView): string {
  return renderToStaticMarkup(React.createElement(AttentionDetails, {
    view, deviceName: '本机', t: tZh, fallback: undefined,
  }))
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

describe('native attention capsule', () => {
  it('renders one segment per non-empty category and keeps the wording out of the layout', () => {
    const view = project([
      fact('request-id', { pendingInteractionKind: 'question', pendingRequestCount: 3 }),
      fact('running-id', { running: true }), fact('unread-id'),
    ], ['unread-id'])
    const html = markup(view)
    expect(attentionGroups(view).map(g => [g.category, g.count])).toEqual([['pending', 1], ['running', 1], ['unread', 1]])
    for (const [category, tone] of [['pending', 'pending'], ['running', 'running'], ['unread', 'done']]) {
      expect(html).toContain(`data-attention-category="${category}"`)
      // Colour alone carries the category; the tone is the styling hook.
      expect(html).toContain(`data-tone="${tone}"`)
    }
    // The segment prints a number; the sentence lives in the accessible name.
    expect(html).toContain('aria-label="本机: 1 待回复; 会话成员"')
    expect(html).toContain('aria-label="本机: 1 运行中; 会话成员"')
    expect(html).toContain('aria-label="本机: 1 完成未读; 会话成员"')
    expect(html).not.toContain('>1 完成未读<')
    expect(html).not.toContain('>1 运行中<')
    // No reserved placeholder survives: the capsule holds numbers only.
    expect(html).not.toContain('data-attention-slot')
    expect(html).not.toContain('dsh-md-attention-slot')
    // No browser-default popover markup survives.
    expect(html).not.toContain('<summary')
    expect(html).not.toContain('<details')
    expect(html).not.toContain('Canvas')
  })

  it('marks stale empty data explicitly instead of displaying an authoritative zero', () => {
    const html = markup(emptyDeviceAttention(false))
    expect(html).toContain('同步中 / 数据过期')
    // No number is claimed, so no segment exists; the capsule collapses to an
    // empty dashed ring that states the absence of fresh data.
    expect(html).toContain('data-empty="true"')
    expect(html).toContain('data-stale="true"')
    expect(html).not.toContain('data-attention-category')
  })

  it('renders no capsule for a device with fresh data and nothing to report', () => {
    const html = markup(emptyDeviceAttention(true))
    expect(html).not.toContain('dsh-md-tab-status')
    expect(html).not.toContain('同步中 / 数据过期')
  })

  it('keeps every member of a large category in the joined rows', () => {
    const ids = Array.from({ length: 73 }, (_, index) => `session-${index}`)
    const view = selectDeviceAttention(ids.map(id => fact(id)), new Set(ids), { fresh: false }).local
    const rows = resolveAttentionSessions(view.unreadSessionIds, emptySnapshot, { localDeviceName: '本机', now: 0 })
    expect(rows).toHaveLength(73)
    // The projection orders IDs lexicographically; nothing may be dropped.
    expect(new Set(rows.map(row => row.sessionId))).toEqual(new Set(ids))
  })

  it('supports older Host counts but explains the absent membership', () => {
    const html = renderToStaticMarkup(React.createElement(AttentionDetails, {
      deviceName: 'Remote',
      t: tZh,
      fallback: { runningCount: 2, pendingCount: 1, unreadSessionIds: ['legacy-unread'], fresh: false },
    }))
    // Counts still render as chips; the missing member IDs are explained in the menu.
    expect(html).toContain('data-attention-category="pending"')
    expect(html).toContain('data-attention-category="running"')
    expect(html).toContain('同步中 / 数据过期')
  })

  it('localizes English labels instead of branching on the Chinese tab name', () => {
    const view = selectDeviceAttention([fact('request', { pendingRequestCount: 2 })], new Set(), { fresh: false }).local
    const html = renderToStaticMarkup(React.createElement(AttentionDetails, { view, deviceName: 'Local', t: tEn }))
    expect(html).toContain('Syncing / stale data')
    expect(html).toContain('aria-label="Local: 1 needs reply; Session members"')
    expect(html).not.toContain('需回复')
  })

  it('uses the same selector-backed members in every rendered surface', () => {
    for (const file of ['NativeViewport.tsx', 'MultiDeviceHubPanel.tsx']) {
      const source = readFileSync(new URL(`../src/client/${file}`, import.meta.url), 'utf8')
      expect(source).toContain('attentionByDevice')
      expect(source).toContain('attentionUnreadIds')
    }
    const native = readFileSync(new URL('../src/client/NativeViewport.tsx', import.meta.url), 'utf8')
    expect(native).toContain('view={attentionByDevice?.[LOCAL_DEVICE_ID]}')
    expect(native).toContain('view={attentionByDevice?.[dev.id]}')
  })
})

import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceId, encodeRemoteSessionId, type AggregatedSessionRow, type LogicalWorkspaceView, type MultiDeviceSnapshot } from '../src/contract.ts'
import { buildAggregatedSidebarModel, sidebarDeviceChoices, sidebarFocusKey } from '../src/client/aggregatedSidebarModel.ts'
import { bindClientServices } from '../src/client/clientServices.ts'
import { AggregatedSidebar } from '../src/client/AggregatedSidebar.tsx'
import { virtualWindow } from '../src/client/virtualRows.ts'

const mock = vi.hoisted(() => ({
  state: {} as any,
  open: vi.fn(), action: vi.fn(), start: vi.fn(), search: vi.fn(),
}))
vi.mock('../src/client/state.ts', () => ({
  useMultiDeviceState: () => mock.state,
  clientStore: { openCatalogSession: mock.open, catalogSessionAction: mock.action,
    startSessionOnDevice: mock.start, searchCatalogSessions: mock.search },
}))
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const React = await import('react')
  return {
    Button: React.forwardRef(({ children, icon, variant: _variant, size: _size, ...props }: any, ref: any) => React.createElement('button', { ...props, ref }, icon, children)),
    Input: React.forwardRef(({ icon: _icon, ...props }: any, ref: any) => React.createElement('input', { ...props, ref })),
    Modal: ({ open, children, title }: any) => open ? React.createElement('div', { role: 'dialog', 'aria-label': title }, children) : null,
    StateDot: ({ state }: any) => React.createElement('span', { 'data-state': state }),
    IconChevronDownOutlineRegular: () => React.createElement('span'),
    IconChevronRightOutlineRegular: () => React.createElement('span'),
    IconPlusOutlineRegular: () => React.createElement('span'),
    IconSettingsOutlineRegular: () => React.createElement('span'),
  }
})
const remote = DeviceId('dev-a')
const r = encodeRemoteSessionId(remote, 'r')
const child = encodeRemoteSessionId(remote, 'child')
function row(id: string, extra: Partial<AggregatedSessionRow> = {}): AggregatedSessionRow {
  return { id, rawSessionId: id, deviceId: DeviceId('local'), title: id, updatedAt: 1,
    running: false, blank: false, stale: false, ...extra }
}
function workspace(ids: string[], id = 'project'): LogicalWorkspaceView {
  return { logicalWorkspaceId: id, title: 'Project', kind: 'git', targetDeviceId: remote,
    targetPath: '/repo', effectiveTargetDeviceId: remote, effectiveTargetPath: '/repo', effectiveTargetOnline: true,
    members: [{ deviceId: DeviceId('local'), deviceName: 'Local', remoteWorkspaceId: 'w', path: '/repo', title: 'Project', sessionCount: 0, runningSessionCount: 0 }],
    sessionIds: ids, createdAt: '', updatedAt: '' }
}
function snapshot(): MultiDeviceSnapshot {
  return {
    catalog: { schema: 1, revision: 1, sessions: {
      local: row('local', { title: 'Old local title', cwd: '/repo' }),
      [r]: row(r, { deviceId: remote, rawSessionId: 'r', title: 'Remote architecture', updatedAt: 4 }),
      [child]: row(child, { deviceId: remote, rawSessionId: 'child', parentSessionId: 'r', origin: 'subagent', title: 'Child analysis', updatedAt: 3 }),
      archived: row('archived', { title: 'Archived design' }),
    }, pinnedSessionIds: [r], issues: {} },
    logicalWorkspaces: [workspace(['local', r, child, 'archived'])], archivedSessionIds: ['archived'],
    devices: [{ id: remote, name: 'Build server', state: 'connected', enabled: true },
      { id: DeviceId('offline'), name: 'Offline server', state: 'error', enabled: true }],
  } as unknown as MultiDeviceSnapshot
}
const renderers: ReactTestRenderer[] = []
const cleanups: (() => void)[] = []
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
beforeEach(() => {
  mock.state = { snapshot: snapshot(), displayMode: 'aggregated', loading: false, activeSessionId: r }
  for (const fn of [mock.open, mock.action, mock.start, mock.search]) fn.mockReset().mockResolvedValue({ ok: true })
})
afterEach(() => {
  act(() => { for (const renderer of renderers.splice(0)) renderer.unmount() })
  for (const dispose of cleanups.splice(0)) dispose()
  vi.restoreAllMocks()
})
function harness() {
  const nodes = new Map<string, { focus: ReturnType<typeof vi.fn> }>()
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(<AggregatedSidebar t={key => key} onOpenSettings={() => {}} />, {
      createNodeMock(element) {
        const node = { focus: vi.fn(), getBoundingClientRect: () => ({ left: 20, bottom: 40 }), querySelector: () => null }
        if (element.props['data-tree-key']) nodes.set(element.props['data-tree-key'], node)
        return node
      },
    })
  })
  renderers.push(renderer)
  const byId = (id: string) => renderer.root.findAll(node => typeof node.type === 'string' && node.props['data-testid'] === id)[0]!
  const click = async (id: string) => {
    await act(async () => { byId(id).props.onClick({ currentTarget: { getBoundingClientRect: () => ({ left: 20, bottom: 40 }) } }); await flush() })
  }
  const search = (query: string) => act(() => byId('catalog-search').props.onChange({ currentTarget: { value: query } }))
  const update = () => act(() => renderer.update(<AggregatedSidebar t={key => key} onOpenSettings={() => {}} />))
  return { renderer, byId, click, search, update, nodes }
}

describe('independent aggregated sidebar directory model', () => {
  it('renders remote rows directly with no local summary and supplements accurate local titles only', () => {
    const model = buildAggregatedSidebarModel(snapshot(), { local: {
      ids: ['local', r, 'new-local'], byId: {
        local: { title: 'Accurate local title', cwd: '/repo' } as any,
        [r]: { title: 'DO NOT read a remote mirror' } as any,
        'new-local': { title: 'New local session', cwd: '/repo' } as any,
      },
    } })
    expect(model.rows.local?.title).toBe('Accurate local title')
    expect(model.rows[r]?.title).toBe('Remote architecture')
    expect(model.groups[0]?.sessions.map(node => node.row.id)).toContain('new-local')
    expect(model.groups[0]?.sessions.find(node => node.row.id === r)?.children[0]?.row.id).toBe(child)
    expect(model.visibleCount).toBe(4)
    expect(model.pinned.map(item => item.id)).toEqual([r])
  })
  it('filters archives, searches descendants with ancestor context, and unions explicit content hits', () => {
    const s = snapshot()
    expect(buildAggregatedSidebarModel(s, { archive: 'archived' }).groups[0]?.sessions.map(node => node.row.id)).toEqual(['archived'])
    const search = buildAggregatedSidebarModel(s, { query: 'CHILD' })
    expect(search.visibleCount).toBe(1)
    expect(search.groups[0]?.sessions[0]?.row.id).toBe(r)
    expect(search.groups[0]?.sessions[0]?.children[0]?.row.id).toBe(child)
    expect(buildAggregatedSidebarModel(s, { query: 'not a title', contentSessionIds: [r] }).visibleCount).toBe(1)
    expect(buildAggregatedSidebarModel(s, { query: 'Archived' }).visibleCount).toBe(0)
  })
  it('promotes active children of archived parents and guards cyclic/mixed-owner nesting', () => {
    const s = snapshot()
    const sessions = { ...s.catalog!.sessions,
      [r]: { ...s.catalog!.sessions[r]!, parentSessionId: 'child' },
      local: { ...s.catalog!.sessions.local!, parentSessionId: r },
    }
    const result = buildAggregatedSidebarModel({ ...s, catalog: { ...s.catalog!, sessions }, archivedSessionIds: [r] })
    expect(result.groups[0]?.sessions.map(node => node.row.id)).toContain(child)
    expect(result.groups[0]?.sessions.map(node => node.row.id)).toContain('local')
    expect(result.visibleCount).toBe(3)
  })
  it('retains missing references and pins, deduplicates overlapping workspace membership', () => {
    const s = snapshot()
    const missing = encodeRemoteSessionId(remote, 'missing')
    const result = buildAggregatedSidebarModel({ ...s,
      catalog: { ...s.catalog!, pinnedSessionIds: [missing, missing] },
      logicalWorkspaces: [workspace([missing, r, r]), workspace([r], 'duplicate')],
    })
    expect(result.rows[missing]).toMatchObject({ missing: true, stale: true, deviceId: remote })
    expect(result.pinned).toHaveLength(1)
    expect(result.groups[0]?.sessions.map(node => node.row.id)).toEqual([r, missing])
    expect(result.groups[1]?.sessions).toHaveLength(0)
  })
  it('bounds virtual rows with mixed heights, overscan, and clamped edges', () => {
    const heights = [34, 32, 32, 28, 34, 32, 32, 32]
    const initial = virtualWindow(heights, 0, 64, 1)
    expect(initial).toMatchObject({ start: 0, top: 0 })
    expect(initial.end).toBeLessThan(heights.length)
    const middle = virtualWindow(heights, 100, 64, 1)
    expect(middle.start).toBeGreaterThan(0)
    expect(middle.end).toBeGreaterThan(middle.start)
    expect(middle.top).toBeGreaterThan(0)
    expect(middle.bottom).toBeGreaterThanOrEqual(0)
    const tail = virtualWindow(heights, 10_000, 64, 1)
    expect(tail.end).toBe(heights.length)
    expect(tail.bottom).toBe(0)
    expect(virtualWindow([], 0, 400)).toMatchObject({ start: 0, end: 0, total: 0 })
  })
  it('has deterministic nonwrapping keyboard navigation and disabled offline choices', () => {
    expect(sidebarFocusKey(['a', 'b'], 'a', 'ArrowDown')).toBe('b')
    expect(sidebarFocusKey(['a', 'b'], 'b', 'ArrowDown')).toBe('b')
    expect(sidebarFocusKey(['a', 'b'], 'a', 'ArrowUp')).toBe('a')
    expect(sidebarFocusKey(['a', 'b'], 'a', 'End')).toBe('b')
    expect(sidebarFocusKey([], undefined, 'Home')).toBeUndefined()
    expect(sidebarDeviceChoices(snapshot(), 'Local').map(choice => [choice.id, choice.online])).toEqual([
      ['local', true], ['dev-a', true], ['offline', false],
    ])
  })
})

describe('mounted aggregated sidebar interactions', () => {
  it('opens every remote/pinned/child row through openCatalogSession, never local navigation', async () => {
    const localOpen = vi.fn()
    cleanups.push(bindClientServices({ uiWorkspace: { openSession: localOpen } }))
    const h = harness()
    await h.click(`catalog-open-session:${r}`)
    await h.click(`catalog-open-pinned:${r}`)
    await h.click(`catalog-open-session:${child}`)
    expect(mock.open.mock.calls.map(([id]) => id)).toEqual([r, r, child])
    expect(localOpen).not.toHaveBeenCalled()
  })
  it('filters titles immediately; calls content search only explicitly and clears stale results on query edits', async () => {
    mock.search.mockResolvedValue({ ok: true, sessionIds: [r] })
    const h = harness()
    h.search('needle')
    expect(h.byId('catalog-empty')).toBeDefined()
    expect(mock.search).not.toHaveBeenCalled()
    await h.click('catalog-search-content')
    expect(mock.search).toHaveBeenCalledExactlyOnceWith('needle')
    expect(h.byId(`catalog-open-session:${r}`)).toBeDefined()
    h.search('another query')
    expect(h.byId(`catalog-open-session:${r}`)).toBeUndefined()
  })
  it('shows successful content matches together with partial-source failures', async () => {
    mock.search.mockResolvedValue({ ok: true, sessionIds: [r], errors: { dev: 'offline search' } })
    const h = harness()
    h.search('needle')
    await h.click('catalog-search-content')
    expect(h.byId(`catalog-open-session:${r}`)).toBeDefined()
    expect(h.byId('catalog-search-partial').children.join('')).toContain('offline search')
  })
  it('ignores an in-flight content result after query changes', async () => {
    let resolve!: (value: unknown) => void
    mock.search.mockImplementation(() => new Promise(yes => { resolve = yes }))
    const h = harness()
    h.search('before')
    act(() => h.byId('catalog-search-content').props.onClick())
    h.search('after')
    await act(async () => { resolve({ ok: true, sessionIds: [r] }); await flush() })
    expect(h.byId(`catalog-open-session:${r}`)).toBeUndefined()
  })
  it('sends pin/archive/unarchive/unpin/fork actions to the owning catalog id, without duplicate fork navigation', async () => {
    const h = harness()
    await h.click('catalog-menu-session:local')
    await h.click('catalog-action-pin')
    expect(mock.action).toHaveBeenLastCalledWith('local', 'pin', undefined, false)
    await h.click(`catalog-menu-session:${r}`)
    await h.click('catalog-action-unpin')
    expect(mock.action).toHaveBeenLastCalledWith(r, 'unpin', undefined, false)
    await h.click('catalog-menu-session:local')
    await h.click('catalog-action-archive')
    expect(mock.action).toHaveBeenLastCalledWith('local', 'archive', undefined, false)
    await h.click('catalog-filter-archived')
    await h.click('catalog-menu-session:archived')
    await h.click('catalog-action-unarchive')
    expect(mock.action).toHaveBeenLastCalledWith('archived', 'unarchive', undefined, false)
    await h.click('catalog-filter-active')
    mock.action.mockResolvedValue({ ok: true, sessionId: 'fork-id' })
    await h.click(`catalog-menu-session:${r}`)
    await h.click('catalog-action-fork')
    expect(mock.action).toHaveBeenLastCalledWith(r, 'fork', undefined, false)
    expect(mock.open).not.toHaveBeenCalled()
  })
  it('renames with trimmed input and displays rejection without dismissing the dialog', async () => {
    const h = harness()
    await h.click(`catalog-menu-session:${r}`)
    await h.click('catalog-action-rename')
    act(() => h.byId('catalog-rename-input').props.onChange({ currentTarget: { value: '  New title  ' } }))
    mock.action.mockResolvedValue({ ok: false, error: 'permission denied' })
    await act(async () => { h.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); await flush() })
    expect(mock.action).toHaveBeenCalledExactlyOnceWith(r, 'rename', 'New title', false)
    expect(h.byId('catalog-error').children.join('')).toContain('permission denied')
    expect(h.byId('catalog-rename-input')).toBeDefined()
  })
  it('does not stop or archive a running session when confirmation is cancelled', async () => {
    mock.state.snapshot.catalog.sessions[r] = { ...mock.state.snapshot.catalog.sessions[r], running: true }
    const h = harness()
    await h.click(`catalog-menu-session:${r}`)
    await h.click('catalog-action-archive')
    expect(h.byId('catalog-archive-confirm')).toBeDefined()
    expect(mock.action).not.toHaveBeenCalled()
    act(() => h.renderer.root.findAllByType('button').find(node => node.children.includes('Cancel'))!.props.onClick())
    expect(h.byId('catalog-archive-confirm')).toBeUndefined()
    expect(mock.action).not.toHaveBeenCalled()
    expect(mock.open).not.toHaveBeenCalled()
  })
  it('confirms running archive and catches rejected open/action/create/search promises', async () => {
    mock.state.snapshot.catalog.sessions[r] = { ...mock.state.snapshot.catalog.sessions[r], running: true }
    const h = harness()
    await h.click(`catalog-menu-session:${r}`)
    await h.click('catalog-action-archive')
    expect(mock.action).not.toHaveBeenCalled()
    await h.click('catalog-archive-confirm')
    expect(mock.action).toHaveBeenCalledExactlyOnceWith(r, 'archive', undefined, true)
    mock.open.mockRejectedValue(new Error('open denied'))
    await h.click(`catalog-open-session:${r}`)
    expect(h.byId('catalog-error').children.join('')).toContain('open denied')
    mock.action.mockRejectedValue(new Error('pin denied'))
    await h.click('catalog-menu-session:local'); await h.click('catalog-action-pin')
    expect(h.byId('catalog-error').children.join('')).toContain('pin denied')
    await h.click('catalog-new-project')
    expect(h.byId('catalog-create-device-offline').props.disabled).toBe(true)
    mock.start.mockRejectedValue(new Error('create denied'))
    await h.click('catalog-create-device-dev-a')
    expect(mock.start).toHaveBeenCalledExactlyOnceWith('project', remote)
    expect(h.byId('catalog-error').children.join('')).toContain('create denied')
    // Close the dialog through its Cancel button.
    act(() => h.renderer.root.findAllByType('button').find(node => node.children.includes('Cancel'))!.props.onClick())
    h.search('q'); mock.search.mockRejectedValue(new Error('search denied'))
    await h.click('catalog-search-content')
    expect(h.byId('catalog-error').children.join('')).toContain('search denied')
  })
  it('reacts to local list updates while keeping remote directory titles independent', () => {
    const listeners = new Set<() => void>()
    let local: any = { ids: ['local', r], byId: { local: { title: 'Live local title' }, [r]: { title: 'Wrong mirror' } } }
    cleanups.push(bindClientServices({ sessions: { list: {
      getSnapshot: () => local,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    } } }))
    const h = harness()
    expect(h.byId('catalog-open-session:local').findByProps({ className: 'dsh-md-catalog-title' }).children).toEqual(['Live local title'])
    expect(h.byId(`catalog-open-session:${r}`).findByProps({ className: 'dsh-md-catalog-title' }).children).toEqual(['Remote architecture'])
    act(() => {
      local = { ids: ['local'], byId: { local: { title: 'Updated live title' } } }
      for (const listener of listeners) listener()
    })
    expect(h.byId('catalog-open-session:local').findByProps({ className: 'dsh-md-catalog-title' }).children).toEqual(['Updated live title'])
  })
  it('surfaces unsuccessful result objects from open, create and content search', async () => {
    const h = harness()
    mock.open.mockResolvedValue({ ok: false, error: 'offline owner' })
    await h.click(`catalog-open-session:${r}`)
    expect(h.byId('catalog-error').children.join('')).toContain('offline owner')
    await h.click('catalog-new-project')
    mock.start.mockResolvedValue({ ok: false, error: 'unregistered path' })
    await h.click('catalog-create-device-local')
    expect(h.byId('catalog-error').children.join('')).toContain('unregistered path')
    expect(h.byId('catalog-device-picker')).toBeDefined()
    act(() => h.renderer.root.findAllByType('button').find(node => node.children.includes('Cancel'))!.props.onClick())
    h.search('needle'); mock.search.mockResolvedValue({ ok: false, error: 'remote search unsupported' })
    await h.click('catalog-search-content')
    expect(h.byId('catalog-error').children.join('')).toContain('remote search unsupported')
  })
  it('mounts only a window of a long tree and scrolls End navigation to its focus target', () => {
    const ids = Array.from({ length: 100 }, (_, index) => `s-${index}`)
    const base = snapshot()
    mock.state.snapshot = { ...base,
      catalog: { ...base.catalog!, sessions: Object.fromEntries(ids.map(id => [id, row(id)])), pinnedSessionIds: [], issues: {} },
      logicalWorkspaces: [workspace(ids)], archivedSessionIds: [], unreadSessionIds: [],
    }
    const h = harness()
    expect(h.renderer.root.findAll(node => node.props.role === 'treeitem').length).toBeLessThan(25)
    const event = { key: 'End', target: { dataset: { treeKey: 'workspace:project' } }, preventDefault: vi.fn() }
    act(() => h.byId('catalog-tree').props.onKeyDown(event))
    expect(event.preventDefault).toHaveBeenCalled()
    expect(h.byId('catalog-open-session:s-99')).toBeDefined()
    expect(h.nodes.get('session:s-99')?.focus).toHaveBeenCalled()
    expect(h.renderer.root.findAll(node => node.props.role === 'treeitem').length).toBeLessThan(25)
  })
  it('keeps a collapsed rail compact and requests parent expansion', () => {
    const expand = vi.fn()
    let renderer!: ReactTestRenderer
    act(() => { renderer = create(<AggregatedSidebar t={key => key} onOpenSettings={() => {}} collapsed expandSidebar={expand} />) })
    renderers.push(renderer)
    expect(renderer.root.findAllByType('input')).toHaveLength(0)
    act(() => renderer.root.findByType('button').props.onClick())
    expect(expand).toHaveBeenCalledOnce()
  })
  it('supports project collapse, tree navigation, issue/loading/missing states and native noninterference', async () => {
    const h = harness()
    await h.click('catalog-toggle-project')
    expect(h.byId(`catalog-open-session:${r}`)).toBeUndefined()
    const treeEvent = (key: string, current: string) => ({ key, target: { dataset: { treeKey: current } }, preventDefault: vi.fn() })
    act(() => h.byId('catalog-tree').props.onKeyDown(treeEvent('ArrowRight', 'workspace:project')))
    expect(h.byId(`catalog-open-session:${r}`)).toBeDefined()
    const focusRemote = h.nodes.get(`session:${r}`)!.focus
    act(() => h.byId('catalog-tree').props.onKeyDown(treeEvent('ArrowDown', 'workspace:project')))
    expect(focusRemote).toHaveBeenCalled()
    mock.state.loading = true
    mock.state.snapshot.catalog.issues = { 'dev-a': 'offline cache' }
    mock.state.snapshot = { ...mock.state.snapshot,
      logicalWorkspaces: [{ ...mock.state.snapshot.logicalWorkspaces[0]!, sessionIds: [...mock.state.snapshot.logicalWorkspaces[0]!.sessionIds, 'missing'] }],
    }
    h.update()
    expect(h.byId('catalog-loading')).toBeDefined()
    expect(h.byId('catalog-issue-dev-a').children.join('')).toContain('offline cache')
    act(() => h.byId('catalog-tree').props.onKeyDown(treeEvent('End', `session:${r}`)))
    expect(h.byId('catalog-open-session:missing')).toBeDefined()
    mock.state.displayMode = 'native'; h.update()
    expect(h.renderer.toJSON()).toBeNull()
  })
})

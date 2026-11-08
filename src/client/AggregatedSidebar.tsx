import {
  Button, Input, Modal, StateDot,
  IconChevronDownOutlineRegular, IconChevronRightOutlineRegular,
  IconPlusOutlineRegular, IconSettingsOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { AggregatedSessionRow, CatalogSessionAction, DeviceId, LogicalWorkspaceView } from '../contract.ts'
import { getClientServices, type SessionsListSnapshotLike } from './clientServices.ts'
import {
  buildAggregatedSidebarModel, sidebarDeviceChoices, sidebarFocusKey,
  type ArchiveFilter, type SidebarSessionNode, type SidebarWorkspaceGroup,
} from './aggregatedSidebarModel.ts'
import { virtualWindow } from './virtualRows.ts'
import { clientStore, useMultiDeviceState } from './state.ts'

export interface AggregatedSidebarProps {
  readonly t: (key: any) => string
  readonly onOpenSettings: () => void
  readonly collapsed?: boolean
  readonly expandSidebar?: () => void
}
interface ActionResult { readonly ok: boolean; readonly error?: string; readonly sessionId?: string }
interface SidebarStore {
  openCatalogSession(id: string): Promise<ActionResult | void> | ActionResult | void
  catalogSessionAction(id: string, action: CatalogSessionAction, title?: string, stopActivity?: boolean): Promise<ActionResult>
  startSessionOnDevice(workspaceId: string, deviceId: DeviceId): Promise<ActionResult>
  searchCatalogSessions?(query: string): Promise<ActionResult & { readonly sessionIds?: readonly string[]; readonly errors?: Readonly<Record<string, string>> }>
}
// The parent owns these APIs. This structural boundary also supports old hosts
// with an explicit unavailable error, rather than accidentally using mirrors.
const store = clientStore as unknown as SidebarStore
const EMPTY_LOCAL: SessionsListSnapshotLike = { ids: [], byId: {} }
type CatalogTreeItem =
  | { readonly kind: 'section'; readonly key: string; readonly height: number; readonly title: string }
  | { readonly kind: 'workspace'; readonly key: string; readonly height: number; readonly group: SidebarWorkspaceGroup }
  | { readonly kind: 'session'; readonly key: string; readonly height: number; readonly node: SidebarSessionNode; readonly depth: number; readonly children?: readonly SidebarSessionNode[] }
  | { readonly kind: 'empty'; readonly key: string; readonly height: number; readonly groupId: string }
const noSubscribe = () => () => {}

/** Public token geometry matches the official 34px project / 32px session rows. */
export const AGGREGATED_SIDEBAR_CSS = `
.dsh-md-catalog{display:flex;flex-direction:column;min-height:0;height:100%;font-size:14px;color:var(--dsw-alias-label-primary)}
.dsh-md-catalog button{font:inherit}.dsh-md-catalog-toolbar{display:flex;align-items:center;gap:4px;min-height:36px;flex-wrap:wrap}
.dsh-md-catalog-search{min-width:0;flex:1}.dsh-md-catalog-tree{flex:1;min-height:0;overflow:auto;padding:0 2px 8px}
.dsh-md-catalog-group{margin-top:4px}.dsh-md-catalog-row{display:flex;align-items:center;gap:4px;border-radius:var(--dsw-radius-md);padding:0 8px;min-width:0}
.dsh-md-catalog-row:hover,.dsh-md-catalog-row[data-active=true]{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-md-catalog-project{height:34px}.dsh-md-catalog-session{height:32px;padding-inline-start:calc(8px + var(--md-depth,0)*16px)}
.dsh-md-catalog-main{display:flex;align-items:center;gap:6px;min-width:0;flex:1;text-align:left;height:100%;background:none;border:0;padding:0;color:inherit;cursor:pointer}
.dsh-md-catalog-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-md-catalog-meta{max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-md-catalog-icon{border:0;background:none;color:var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-sm);width:24px;height:24px;flex:none;padding:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.dsh-md-catalog-icon:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-md-catalog button:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dsh-md-catalog-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);padding:6px 8px;overflow-wrap:anywhere}
.dsh-md-catalog-error{color:var(--dsw-alias-state-error-primary)}
.dsh-md-catalog-section{font-size:12px;color:var(--dsw-alias-label-tertiary);padding:8px 8px 4px}
.dsh-md-catalog-menu{position:fixed;z-index:1000;display:flex;flex-direction:column;min-width:170px;max-width:calc(100vw - 16px);padding:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-background-primary,var(--dsw-specific-sidebar-fill));box-shadow:var(--dsw-elevation-md)}
.dsh-md-catalog-menu button{border:0;background:none;color:var(--dsw-alias-label-primary);text-align:left;padding:6px 10px;border-radius:var(--dsw-radius-sm);cursor:pointer}
.dsh-md-catalog-menu button:hover,.dsh-md-catalog-menu button:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-md-catalog-menu button:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.dsh-md-catalog-choices{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.dsh-md-catalog footer{display:flex;align-items:center;justify-content:space-between;padding-top:4px}
`

export function AggregatedSidebar({ t, onOpenSettings, collapsed = false, expandSidebar }: AggregatedSidebarProps): React.ReactElement | null {
  const state = useMultiDeviceState()
  const services = getClientServices()
  const list = services.sessions?.list
  const local = useSyncExternalStore(
    list?.subscribe ? callback => list!.subscribe!(callback) : noSubscribe,
    () => list?.getSnapshot() ?? EMPTY_LOCAL,
    () => EMPTY_LOCAL,
  )
  const [query, setQuery] = useState('')
  const [archive, setArchive] = useState<ArchiveFilter>('active')
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const [focusKey, setFocusKey] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [menu, setMenu] = useState<{ row: AggregatedSessionRow; x: number; y: number; returnKey: string }>()
  const [rename, setRename] = useState<AggregatedSessionRow>()
  const [renameTitle, setRenameTitle] = useState('')
  const [createWorkspace, setCreateWorkspace] = useState<LogicalWorkspaceView>()
  const [archiveTarget, setArchiveTarget] = useState<AggregatedSessionRow>()
  const [content, setContent] = useState<{ query: string; ids: readonly string[] }>()
  const [searchIssues, setSearchIssues] = useState<Readonly<Record<string, string>>>({})
  const searchSequence = useRef(0)
  const mounted = useRef(true)
  const elements = useRef(new Map<string, HTMLButtonElement>())
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<string>()
  const navigationRef = useRef<{ keys: readonly string[]; itemIndex: ReadonlyMap<string, number>; offsets: readonly number[] }>({ keys: [], itemIndex: new Map(), offsets: [0] })
  const scrollFrame = useRef<number>()
  const latestScrollTop = useRef(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(400)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; searchSequence.current++ } }, [])

  // New strings remain local to avoid contending with the parent's locale files.
  const zh = t('nativeLocalTab') === '本机'
  const text = (key: string, en: string, cn: string): string => {
    const value = t(key)
    return value && value !== key && !value.endsWith(`.${key}`) ? value : zh ? cn : en
  }
  const label = {
    projects: text('catalogProjects', 'Projects', '项目'), search: text('catalogSearch', 'Filter session titles', '筛选会话标题'),
    newSession: text('catalogNewSession', 'New Session', '新会话'), pinned: text('catalogPinned', 'Pinned', '置顶'),
    local: text('nativeLocalTab', 'Local', '本机'), untitled: text('catalogUntitled', 'Untitled Session', '未命名会话'),
    cancel: text('catalogCancel', 'Cancel', '取消'), settings: text('catalogSettings', 'Settings', '设置'),
  }
  const contentSessionIds = content?.query === query ? content.ids : undefined
  const model = useMemo(() => buildAggregatedSidebarModel(state.snapshot, {
    local, query, archive, contentSessionIds,
  }), [state.snapshot, local, query, archive, contentSessionIds])
  const archived = useMemo(() => new Set(state.snapshot.archivedSessionIds ?? []), [state.snapshot.archivedSessionIds])
  const pinned = useMemo(() => new Set(state.snapshot.catalog?.pinnedSessionIds ?? []), [state.snapshot.catalog?.pinnedSessionIds])
  const unread = useMemo(() => new Set(state.snapshot.unreadSessionIds ?? []), [state.snapshot.unreadSessionIds])
  const choices = useMemo(() => sidebarDeviceChoices(state.snapshot, label.local), [state.snapshot.devices, label.local])
  const choiceNames = useMemo(() => new Map(choices.map(choice => [choice.id, choice.name])), [choices])
  const isClosed = (key: string): boolean => query.trim() === '' && closed.has(key)
  const toggle = (key: string): void => setClosed(previous => {
    const next = new Set(previous)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const focus = (key: string | undefined): void => {
    if (key === undefined) return
    setFocusKey(key)
    const element = elements.current.get(key)
    if (element !== undefined) { element.focus(); return }
    pendingFocus.current = key
    const navigation = navigationRef.current
    const index = navigation.itemIndex.get(key)
    if (index === undefined) return
    const top = Math.max(0, navigation.offsets[index]! - viewportHeight / 2)
    latestScrollTop.current = top
    setScrollTop(top)
    treeRef.current?.scrollTo?.({ top })
  }
  const closeMenu = (): void => { const key = menu?.returnKey; setMenu(undefined); focus(key) }
  useEffect(() => {
    if (!menu) return
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    if (typeof document === 'undefined') return
    const dismiss = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(undefined)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [menu])

  const run = async (operation: () => Promise<ActionResult | void> | ActionResult | void, fallback: string): Promise<boolean> => {
    if (busyRef.current) return false
    busyRef.current = true; setBusy(true); setError(undefined)
    try {
      const result = await operation()
      if (result && !result.ok) throw new Error(result.error || fallback)
      return true
    } catch (cause) {
      if (mounted.current) setError(`${fallback}: ${cause instanceof Error ? cause.message : String(cause)}`)
      return false
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const open = (id: string): void => { void run(() => store.openCatalogSession(id), text('catalogOpenFailed', 'Could not open session', '打开会话失败')) }
  const action = async (row: AggregatedSessionRow, kind: CatalogSessionAction, title?: string, stopActivity = false): Promise<boolean> =>
    run(() => store.catalogSessionAction(row.id, kind, title, stopActivity),
      text('catalogActionFailed', 'Session action failed', '会话操作失败'))

  const navigation = useMemo(() => {
    const items: CatalogTreeItem[] = []
    const visibleKeys: string[] = []
    const itemIndex = new Map<string, number>()
    const parentKeys = new Map<string, string>()
    const childKeys = new Map<string, string>()
    const closedHere = (key: string): boolean => query.trim() === '' && closed.has(key)
    // Carry depth explicitly through recursion.
    const appendNodes = (nodes: readonly SidebarSessionNode[], parent: string, depth: number): void => {
      for (const node of nodes) {
        const key = `session:${node.row.id}`
        itemIndex.set(key, items.length)
        items.push({ kind: 'session', key, height: 32, node, depth, children: node.children })
        visibleKeys.push(key); parentKeys.set(key, parent)
        if (node.children.length > 0) childKeys.set(key, `session:${node.children[0]!.row.id}`)
        if (!closedHere(key)) appendNodes(node.children, key, depth + 1)
      }
    }
    if (model.pinned.length > 0) {
      items.push({ kind: 'section', key: 'section:pinned', height: 28, title: label.pinned })
      for (const row of model.pinned) {
        const key = `pinned:${row.id}`
        itemIndex.set(key, items.length)
        items.push({ kind: 'session', key, height: 32, node: { row, children: [] }, depth: 0 })
        visibleKeys.push(key)
      }
    }
    for (const group of model.groups) {
      const key = `workspace:${group.id}`
      itemIndex.set(key, items.length)
      items.push({ kind: 'workspace', key, height: 34, group })
      visibleKeys.push(key)
      if (group.sessions.length > 0) childKeys.set(key, `session:${group.sessions[0]!.row.id}`)
      if (!closedHere(key)) {
        appendNodes(group.sessions, key, 0)
        if (group.sessions.length === 0) items.push({ kind: 'empty', key: `empty:${group.id}`, height: 30, groupId: group.id })
      }
    }
    return { items, visibleKeys, itemIndex, parentKeys, childKeys }
  }, [model, closed, query, label.pinned])
  const { items: treeItems, visibleKeys, parentKeys, childKeys } = navigation
  const windowRows = useMemo(() => virtualWindow(treeItems.map(item => item.height), scrollTop, viewportHeight), [treeItems, scrollTop, viewportHeight])
  navigationRef.current = { keys: visibleKeys, itemIndex: navigation.itemIndex, offsets: windowRows.offsets }
  const selectedFocus = focusKey && visibleKeys.includes(focusKey) ? focusKey : visibleKeys[0]
  const selectedItemIndex = selectedFocus === undefined ? undefined : navigation.itemIndex.get(selectedFocus)
  const renderedFocus = selectedItemIndex !== undefined && selectedItemIndex >= windowRows.start && selectedItemIndex < windowRows.end
    ? selectedFocus
    : visibleKeys.find(key => {
        const index = navigation.itemIndex.get(key)
        return index !== undefined && index >= windowRows.start && index < windowRows.end
      })
  useEffect(() => {
    const key = pendingFocus.current
    if (key === undefined) return
    const element = elements.current.get(key)
    if (element !== undefined) { pendingFocus.current = undefined; element.focus() }
  }, [scrollTop, viewportHeight, selectedFocus, treeItems])
  useEffect(() => {
    const node = treeRef.current
    if (node === null) return
    const measure = (): void => {
      const height = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect().height : node.clientHeight
      if (height > 0) setViewportHeight(height)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(node)
    return () => { observer?.disconnect(); if (scrollFrame.current !== undefined) cancelAnimationFrame(scrollFrame.current) }
  }, [])
  const treeKeyDown = (event: React.KeyboardEvent): void => {
    // Only navigate tree row buttons, not search, actions or dialog controls.
    const target = event.target as HTMLElement
    const key = target.dataset?.treeKey
    if (!key || event.altKey || event.ctrlKey || event.metaKey) return
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); focus(sidebarFocusKey(visibleKeys, key, event.key)); return
    }
    if (event.key === 'ArrowRight') {
      if (!childKeys.has(key)) return
      event.preventDefault()
      if (isClosed(key)) toggle(key); else focus(childKeys.get(key))
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (childKeys.has(key) && !isClosed(key)) toggle(key); else focus(parentKeys.get(key))
    }
  }
  const treeProps = (key: string) => ({
    'data-tree-key': key, tabIndex: key === renderedFocus ? 0 : -1,
    ref: (node: HTMLButtonElement | null): void => { if (node) elements.current.set(key, node); else elements.current.delete(key) },
    onFocus: (): void => setFocusKey(key),
  })
  const showMenu = (row: AggregatedSessionRow, key: string, x: number, y: number): void => {
    const width = typeof window === 'undefined' ? 1200 : window.innerWidth
    const height = typeof window === 'undefined' ? 800 : window.innerHeight
    setMenu({ row, returnKey: key, x: Math.max(8, Math.min(x, width - 200)), y: Math.max(8, Math.min(y, height - 240)) })
  }
  const sessionRow = (row: AggregatedSessionRow, depth: number, key: string, children?: readonly SidebarSessionNode[]): React.ReactElement => {
    const hasChildren = Boolean(children?.length)
    const title = row.blank ? label.newSession : row.title || label.untitled
    const device = choiceNames.get(row.deviceId) ?? row.deviceId
    return <div className="dsh-md-catalog-row dsh-md-catalog-session" key={key}
      data-testid={`catalog-row-${key}`} data-active={state.activeSessionId === row.id}
      style={{ '--md-depth': depth } as React.CSSProperties}
      onContextMenu={event => { event.preventDefault(); showMenu(row, key, event.clientX, event.clientY) }}>
      {hasChildren && <button type="button" className="dsh-md-catalog-icon" tabIndex={-1}
        aria-label={isClosed(key) ? 'Expand sessions' : 'Collapse sessions'} aria-expanded={!isClosed(key)}
        onClick={() => toggle(key)}>{isClosed(key) ? <IconChevronRightOutlineRegular size={12} /> : <IconChevronDownOutlineRegular size={12} />}</button>}
      <button type="button" className="dsh-md-catalog-main" role="treeitem" {...treeProps(key)} disabled={busy}
        data-testid={`catalog-open-${key}`} aria-level={depth + 2}
        aria-expanded={hasChildren ? !isClosed(key) : undefined} aria-selected={state.activeSessionId === row.id}
        title={`${title}\n${device}${row.cwd ? ` · ${row.cwd}` : ''}`}
        onClick={() => open(row.id)} onKeyDown={event => {
          if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') {
            event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); showMenu(row, key, rect.left, rect.bottom)
          }
        }}>
        <StateDot size={7} state={row.missing ? 'error' : row.stale ? 'idle' : row.running ? 'ongoing' : unread.has(row.id) ? 'done' : 'idle'} />
        <span className="dsh-md-catalog-title">{title}</span>
        <span className="dsh-md-catalog-meta">{row.missing ? text('catalogMissing', 'Summary unavailable', '摘要缺失') : row.stale ? `${device} · ${text('catalogCached', 'Cached', '缓存')}` : device}</span>
      </button>
      <button type="button" className="dsh-md-catalog-icon" aria-label={`${text('catalogActions', 'Session actions', '会话操作')}: ${title}`}
        aria-haspopup="menu" data-testid={`catalog-menu-${key}`} onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect(); showMenu(row, key, rect.left, rect.bottom)
        }}>⋯</button>
    </div>
  }
  const renderTreeItem = (item: CatalogTreeItem): React.ReactNode => {
    if (item.kind === 'section') return <div key={item.key} className="dsh-md-catalog-section">{item.title}</div>
    if (item.kind === 'empty') return <div key={item.key} className="dsh-md-catalog-note" data-testid={`catalog-empty-${item.groupId}`}>{text('catalogNoProjectSessions', 'No sessions in this project', '此项目暂无会话')}</div>
    if (item.kind === 'session') return sessionRow(item.node.row, item.depth, item.key, item.children)
    const group = item.group, key = item.key
    return <div key={group.id} className="dsh-md-catalog-group" role="group" data-testid={`catalog-workspace-${group.id}`}>
      <div className="dsh-md-catalog-row dsh-md-catalog-project">
        <button type="button" className="dsh-md-catalog-main" role="treeitem" {...treeProps(key)} aria-level={1} aria-expanded={!isClosed(key)}
          data-testid={`catalog-toggle-${group.id}`} onClick={() => toggle(key)}>
          {isClosed(key) ? <IconChevronRightOutlineRegular size={12} /> : <IconChevronDownOutlineRegular size={12} />}
          <span className="dsh-md-catalog-title">{group.title || text('catalogUnassigned', 'Other sessions', '其他会话')}</span>
          <span className="dsh-md-catalog-meta">{group.matchingCount}</span>
        </button>
        {group.workspace && <button type="button" className="dsh-md-catalog-icon" aria-label={`${label.newSession}: ${group.title}`}
          data-testid={`catalog-new-${group.id}`} disabled={busy} onClick={() => setCreateWorkspace(group.workspace)}><IconPlusOutlineRegular size={13} /></button>}
      </div>
    </div>
  }
  const onTreeScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    latestScrollTop.current = event.currentTarget.scrollTop
    if (typeof requestAnimationFrame === 'undefined') { setScrollTop(latestScrollTop.current); return }
    if (scrollFrame.current !== undefined) return
    scrollFrame.current = requestAnimationFrame(() => { scrollFrame.current = undefined; setScrollTop(latestScrollTop.current) })
  }
  const startOnDevice = async (workspace: LogicalWorkspaceView, deviceId: DeviceId): Promise<void> => {
    const ok = await run(() => store.startSessionOnDevice(workspace.logicalWorkspaceId, deviceId), text('catalogCreateFailed', 'Could not create session', '新建会话失败'))
    if (ok && mounted.current) setCreateWorkspace(undefined)
  }
  const searchContent = async (): Promise<void> => {
    const captured = query
    const sequence = ++searchSequence.current
    setSearchIssues({})
    await run(async () => {
      if (!store.searchCatalogSessions) return { ok: false, error: text('catalogSearchUnavailable', 'Content search is unavailable on this host; title filtering remains active.', '此主机未提供内容搜索；仍可筛选标题。') }
      const result = await store.searchCatalogSessions(captured)
      if (result.ok && mounted.current && sequence === searchSequence.current) {
        setContent({ query: captured, ids: result.sessionIds ?? [] })
        setSearchIssues(result.errors ?? {})
      }
      return result
    }, text('catalogSearchFailed', 'Content search failed', '内容搜索失败'))
  }

  // Defensive only: the parent arbitrates the slot and mounts only in aggregated mode.
  if (state.displayMode !== 'aggregated') return null
  if (collapsed) return <div className="dsh-md-catalog" data-testid="aggregated-sidebar-collapsed">
    <style data-plugin="dsh-multi-device">{AGGREGATED_SIDEBAR_CSS}</style>
    <Button variant="ghost" size="icon" aria-label={label.projects} onClick={expandSidebar} icon={<IconChevronRightOutlineRegular size={16} />} />
  </div>

  const menuActions: { kind: CatalogSessionAction; title: string }[] = menu ? [
    { kind: 'rename', title: text('catalogRename', 'Rename', '重命名') },
    { kind: archived.has(menu.row.id) ? 'unarchive' : 'archive', title: archived.has(menu.row.id) ? text('catalogUnarchive', 'Unarchive', '取消归档') : text('catalogArchive', 'Archive', '归档') },
    { kind: pinned.has(menu.row.id) ? 'unpin' : 'pin', title: pinned.has(menu.row.id) ? text('catalogUnpin', 'Unpin', '取消置顶') : text('catalogPin', 'Pin', '置顶') },
    { kind: 'fork', title: text('catalogFork', 'Fork session', '派生会话') },
  ] : []
  return <section className="dsh-md-catalog" data-testid="aggregated-sidebar" aria-label={label.projects} aria-busy={state.loading || busy}>
    <style data-plugin="dsh-multi-device">{AGGREGATED_SIDEBAR_CSS}</style>
    <div className="dsh-md-catalog-toolbar">
      <Input ref={searchRef} className="dsh-md-catalog-search" data-testid="catalog-search" value={query} placeholder={label.search} aria-label={label.search}
        onChange={event => { searchSequence.current++; setQuery(event.currentTarget.value); setContent(undefined); setSearchIssues({}) }}
        onKeyDown={event => { if (event.key === 'Escape') { setQuery(''); setContent(undefined); setSearchIssues({}) } if (event.key === 'ArrowDown') { event.preventDefault(); focus(visibleKeys[0]) } }} />
      <Button variant="ghost" size="sm" data-testid="catalog-search-content" disabled={busy || !query.trim()} onClick={() => { void searchContent() }}>
        {text('catalogSearchContent', 'Search contents…', '搜索内容…')}
      </Button>
    </div>
    <div className="dsh-md-catalog-toolbar" role="group" aria-label={text('catalogArchiveFilter', 'Archive filter', '归档筛选')}>
      {(['active', 'archived', 'all'] as const).map(value => <Button key={value} variant="ghost" size="sm" aria-pressed={archive === value}
        data-testid={`catalog-filter-${value}`} onClick={() => setArchive(value)}>
        {value === 'active' ? text('catalogActive', 'Active', '未归档') : value === 'archived' ? text('catalogArchived', 'Archived', '已归档') : text('catalogAll', 'All', '全部')}
      </Button>)}
    </div>
    {query && <div className="dsh-md-catalog-note" data-testid="catalog-search-scope">{content?.query === query
      ? text('catalogContentScope', 'Title + content results', '标题和内容搜索结果') : text('catalogTitleScope', 'Filtering titles. Content search runs only when requested.', '当前仅筛选标题；点击“搜索内容”才查询会话内容。')}</div>}
    {Object.keys(searchIssues).length > 0 && <div className="dsh-md-catalog-note" role="status" data-testid="catalog-search-partial">
      {text('catalogSearchPartial', 'Partial results; some sources failed: ', '仅显示部分结果，以下来源失败：')}{Object.entries(searchIssues).map(([source, issue]) => `${source}: ${issue}`).join(' · ')}
    </div>}
    {(error || state.error) && <div className="dsh-md-catalog-note dsh-md-catalog-error" role="alert" data-testid="catalog-error">{error || state.error}</div>}
    {Object.entries({ ...state.snapshot.workspaceLoadErrors, ...state.snapshot.catalog?.issues }).map(([device, issue]) =>
      <div key={device} className="dsh-md-catalog-note dsh-md-catalog-error" role="status" data-testid={`catalog-issue-${device}`}>{choices.find(choice => choice.id === device)?.name ?? device}: {issue}</div>)}
    {state.loading && <div className="dsh-md-catalog-note" role="status" data-testid="catalog-loading"><StateDot state="ongoing" size={8} /> {text('catalogLoading', 'Loading sessions…', '正在加载会话…')}</div>}
    {!state.snapshot.catalog && !state.loading && <div className="dsh-md-catalog-note" role="status" data-testid="catalog-unavailable">{text('catalogUnavailable', 'Waiting for the aggregated session directory. Local sessions remain available.', '正在等待聚合会话目录；仍可使用本机会话。')}</div>}
    <div className="dsh-md-catalog-tree" role="tree" aria-label={label.projects} onKeyDown={treeKeyDown} data-testid="catalog-tree"
      ref={treeRef} onScroll={onTreeScroll}>
      {windowRows.top > 0 && <div aria-hidden="true" style={{ height: windowRows.top, flex: 'none' }} />}
      {treeItems.slice(windowRows.start, windowRows.end).map(renderTreeItem)}
      {windowRows.bottom > 0 && <div aria-hidden="true" style={{ height: windowRows.bottom, flex: 'none' }} />}
      {!state.loading && model.visibleCount === 0 && <div className="dsh-md-catalog-note" role="status" data-testid="catalog-empty">
        {query ? text('catalogNoMatches', 'No matching sessions', '没有匹配的会话') : archive === 'archived' ? text('catalogNoArchived', 'No archived sessions', '暂无已归档会话') : text('catalogNoSessions', 'No sessions yet. Create a session in a project to begin.', '暂无会话。请在项目中新建会话。')}
      </div>}
    </div>
    <footer><span className="dsh-md-catalog-note">{label.projects}</span><Button variant="ghost" size="icon" aria-label={label.settings} onClick={onOpenSettings} icon={<IconSettingsOutlineRegular size={15} />} /></footer>
    {menu && <div ref={menuRef} role="menu" className="dsh-md-catalog-menu" data-testid="catalog-context-menu" style={{ left: menu.x, top: menu.y }}
      aria-label={text('catalogActions', 'Session actions', '会话操作')} onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); closeMenu(); return }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
          const index = buttons.indexOf(event.target as HTMLButtonElement)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
          buttons[next]?.focus()
        }
      }}>
      {menu.row.missing && <div className="dsh-md-catalog-note" role="status">{text('catalogMissingActions', 'Actions unavailable until this session summary is restored.', '恢复此会话摘要后才可执行操作。')}</div>}
      {menuActions.map(item => <button key={item.kind} role="menuitem" type="button" disabled={busy || menu.row.missing}
        data-testid={`catalog-action-${item.kind}`} onClick={() => {
          const row = menu.row; closeMenu()
          if (item.kind === 'rename') { setRename(row); setRenameTitle(row.title) }
          else if (item.kind === 'archive' && row.running) setArchiveTarget(row)
          else void action(row, item.kind)
        }}>{item.title}</button>)}
    </div>}
    <Modal open={rename !== undefined} onClose={() => { if (!busy) setRename(undefined) }} title={text('catalogRename', 'Rename', '重命名')}>
      <form onSubmit={event => { event.preventDefault(); if (rename && renameTitle.trim()) void action(rename, 'rename', renameTitle.trim()).then(ok => { if (ok && mounted.current) setRename(undefined) }) }}>
        <Input autoFocus data-testid="catalog-rename-input" aria-label={text('catalogTitle', 'Session title', '会话标题')} value={renameTitle} disabled={busy} onChange={event => setRenameTitle(event.currentTarget.value)} />
        {error && <p role="alert" className="dsh-md-catalog-error">{error}</p>}
        <Button type="button" variant="ghost" disabled={busy} onClick={() => setRename(undefined)}>{label.cancel}</Button>
        <Button type="submit" size="sm" disabled={busy || !renameTitle.trim()} data-testid="catalog-rename-submit">{text('catalogSave', 'Save', '保存')}</Button>
      </form>
    </Modal>
    <Modal open={createWorkspace !== undefined} onClose={() => { if (!busy) setCreateWorkspace(undefined) }} title={label.newSession}
      description={createWorkspace?.title}>
      <div className="dsh-md-catalog-choices" data-testid="catalog-device-picker">
        {choices.map(choice => <Button key={choice.id} variant="ghost" size="sm" disabled={busy || !choice.online} data-testid={`catalog-create-device-${choice.id}`}
          onClick={() => { if (createWorkspace) void startOnDevice(createWorkspace, choice.id) }}>
          <StateDot size={7} state={choice.online ? 'done' : 'idle'} /> {choice.name}{!choice.online && ` · ${text('catalogOffline', 'Offline', '离线')}`}
          {choice.id === createWorkspace?.effectiveTargetDeviceId && ` · ${text('catalogDefault', 'Default', '默认')}`}
        </Button>)}
      </div>
      {error && <p role="alert" className="dsh-md-catalog-error">{error}</p>}
      <Button variant="ghost" disabled={busy} onClick={() => setCreateWorkspace(undefined)}>{label.cancel}</Button>
    </Modal>
    <Modal open={archiveTarget !== undefined} onClose={() => { if (!busy) setArchiveTarget(undefined) }}
      title={text('catalogArchiveRunning', 'Stop and archive this running session?', '停止并归档此运行中的会话？')}>
      {error && <p role="alert" className="dsh-md-catalog-error">{error}</p>}
      <Button variant="ghost" disabled={busy} onClick={() => setArchiveTarget(undefined)}>{label.cancel}</Button>
      <Button variant="primary" disabled={busy} data-testid="catalog-archive-confirm" onClick={() => {
        if (archiveTarget) void action(archiveTarget, 'archive', undefined, true).then(ok => { if (ok && mounted.current) setArchiveTarget(undefined) })
      }}>{text('catalogArchive', 'Archive', '归档')}</Button>
    </Modal>
  </section>
}

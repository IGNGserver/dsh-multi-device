/**
 * `dsh-multi-device` Browser Client Entry.
 *
 * Contributes strictly to official DSH 0.2 UI extension slots:
 * 1. `settings.section` (`id: 'multi-device'`): Native top-level Settings section
 *    for managing remote SSH devices, display mode, and Git repository auto-aggregation.
 *    The mode can be switched here or from the rightmost button of the Native Mode
 *    tab bar; Aggregated Mode has no device navigation.
 * 2. `plugins.bundle.config` (`key: 'dsh-multi-device'`): Companion configuration surface
 *    inside DSH's Plugin Manager bundle detail view.
 * 3. `shell.overlay` (`id: 'multi-device-switcher'`): persistent Native Mode tab bar
 *    (本机 + remote devices), its rightmost "Aggregated" switch, and Keep-Alive
 *    remote viewports.
 * 4. `conversation.input.right`, `conversation.session.header.utilities`, and
 *    `sidebar.session.row.hover`: report the active Session to the Host, show
 *    its owning device (本机 included) as a chip on the conversation page with a
 *    details popover, and keep hover metadata. These are labels/scope hints,
 *    never device navigation entries.
 *
 * @module dsh-multi-device/client
 */
import React from 'react'
import { decodeSessionId, LOCAL_DEVICE_ID } from '../contract.ts'
import { LOCALE_NS, en, zh, type MultiDeviceLocaleKey } from './locales.ts'
import {
  bindClientServices,
  type SessionsServiceLike as BoundSessionsService,
  type UiWorkspaceServiceLike as BoundUiWorkspaceService,
} from './clientServices.ts'
import {
  ActiveSessionReporter,
  ModeSwitcherOverlay,
  SessionRowHoverDeviceSection,
} from './ModeSwitcherOverlay.tsx'
import { MultiDeviceHubPanel } from './MultiDeviceHubPanel.tsx'
import { OfflineDeviceBanner } from './OfflineDeviceBanner.tsx'
import { installProjectDeviceBadges } from './projectBadges.ts'
import {
  installReadStateOverlay,
  existingSessionStatusNotifier,
  type SessionStatusSource,
} from './readState.ts'
import { SessionDeviceChip } from './SessionDeviceChip.tsx'
import { SessionLinkBanner } from './SessionLinkBanner.tsx'
import { SessionRowDeviceMarker } from './SessionRowDeviceMarker.tsx'
import {
  computeSessionLinkGap,
  SessionLinkRepair,
  setActiveSessionLinkRepair,
} from './sessionLinkRepair.ts'
import { clientStore, useMultiDeviceState } from './state.ts'
import { adoptMultiDeviceStyles } from './styles.ts'
import { installWindowTitle } from './windowTitle.ts'
import { installScopedCatalog, type CatalogRpc } from './modelCatalog.ts'

export const SETTINGS_SECTION_ID = 'multi-device'
/** Retained alias for backwards compatibility with external callers. */
export const PANEL_ID = SETTINGS_SECTION_ID

export const inject = ['slots', 'locale']

const zhPreferred =
  typeof navigator !== 'undefined' ? navigator.language.toLowerCase().startsWith('zh') : true
const fallbackDict = zhPreferred ? zh : en

function translateFallback(key: MultiDeviceLocaleKey): string {
  return fallbackDict[key] ?? en[key] ?? key
}

/**
 * Best-effort local refresh of DSH's shared model catalog after the Host has
 * accepted a new active-Session scope. The Host also re-emits
 * `llm/adapters-updated`; this covers shells where that event is not forwarded
 * before the next picker open.
 */
function refreshModelCatalog(ctx: ClientContextLike): void {
  try {
    const models = ctx.get?.('modelDirectories') as
      | { catalog?: { refresh?: () => void; resetGeneration?: () => void } }
      | undefined
    if (models?.catalog?.resetGeneration !== undefined) models.catalog.resetGeneration()
    else models?.catalog?.refresh?.()
  } catch {
    // Private DSH service shape; the Host event remains the primary path.
  }
}

export interface SlotEntryLike {
  readonly options?: {
    readonly id?: string
    readonly store?: {
      readonly create?: () => {
        readonly actions?: {
          readonly openSection?: (id: string) => void
        }
      }
    }
  }
}

interface SessionSummaryLike {
  readonly retainedBy?: { readonly mainView?: number }
}
interface SessionsListSnapshotLike {
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, SessionSummaryLike>>
}
interface SessionsServiceLike {
  readonly list: {
    getSnapshot(): SessionsListSnapshotLike
    subscribe?(listener: () => void): () => void
  }
  refresh(): Promise<void>
}
interface UiWorkspaceServiceLike {
  openSession(sessionId: string): void
  openWorkspace(workspaceId: string): Promise<void>
}
export interface ClientContextLike {
  effect(fn: () => (() => void) | void, label?: string): void
  inject(deps: readonly string[], fn: (ctx: ClientContextLike) => void): void
  /** Resolve a Client service (active-Session scope and model-picker refresh). */
  get?(key: string): unknown
  locale: {
    register(ns: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): () => void
    bind?(ns: string): (key: MultiDeviceLocaleKey) => string
  }
  layout?: {
    selectPanel(panelId: string | null): void
    readonly panelInfo?: {
      getSnapshot(): { readonly activePanelId: string | null }
      subscribe?(listener: () => void): () => void
    }
  }
  sessions?: SessionsServiceLike
  uiWorkspace?: UiWorkspaceServiceLike
  uiSession?: {
    readonly sessionStatus?: SessionStatusSource
  }
  slots: {
    inject(slotName: string, fn: () => (() => void) | void): () => void
    register(options: Record<string, unknown>, component: (props: any) => React.ReactNode): () => void
    entries?(slotName: string): readonly SlotEntryLike[]
  }
}

/**
 * Open the native DSH Settings modal directly on `sectionId` via the `sidebar.settings`
 * shell store, falling back to an owned native `Modal` if the host shell does not mount
 * `sidebar.settings`.
 */
export function openSettingsSection(
  ctx: ClientContextLike,
  sectionId: string = SETTINGS_SECTION_ID,
): boolean {
  try {
    const entries = ctx.slots.entries?.('sidebar.settings')
    const openSection = entries?.[0]?.options?.store?.create?.()?.actions?.openSection
    if (typeof openSection === 'function') {
      openSection(sectionId)
      return true
    }
  } catch {
    // Fall back to the owned Modal below.
  }
  clientStore.setSettingsModalOpen(true)
  return false
}

function currentMainSessionId(list: SessionsListSnapshotLike): string | undefined {
  for (const sessionId of list.ids) {
    const summary = list.byId[sessionId]
    if ((summary?.retainedBy?.mainView ?? 0) > 0) return sessionId
  }
  return undefined
}

/**
 * Native Mode's local tab must never keep a remote conversation visible.
 * Prefer another local Session; otherwise open the first local Workspace,
 * which lets the normal DSH navigation create/reuse a local blank.
 */
async function ensureNativeLocalSelection(ctx: ClientContextLike, isCurrent: () => boolean = () => true): Promise<void> {
  if (!isCurrent()) return
  const sessions = ctx.sessions
  if (sessions === undefined) return
  const list = sessions.list.getSnapshot()
  const current = currentMainSessionId(list)
  if (current === undefined || !decodeSessionId(current).isRemote) return

  const localSession = list.ids.find(id => !decodeSessionId(id).isRemote)
  if (localSession !== undefined) {
    ctx.uiWorkspace?.openSession(localSession)
    return
  }

  const localWorkspace = clientStore
    .getSnapshot()
    .snapshot.allPhysicalWorkspaces.find(workspace => workspace.deviceId === LOCAL_DEVICE_ID)
  if (localWorkspace !== undefined && ctx.uiWorkspace !== undefined) {
    await ctx.uiWorkspace.openWorkspace(localWorkspace.remoteWorkspaceId)
  }
}

/**
 * Apply the Host-owned mode to the local DSH stores. The Host already filters
 * the data; this refreshes the local Session catalog and, on entering Native
 * Mode, moves the main conversation off a remote Session.
 */
export function installModeSideEffects(ctx: ClientContextLike): () => void {
  let lastMode = clientStore.getSnapshot().displayMode
  let disposed = false
  let generation = 0
  let guarding = false
  const waits = new Map<ReturnType<typeof setTimeout>, () => void>()
  const cancelWaits = (): void => {
    for (const [timer, resolve] of waits) {
      clearTimeout(timer)
      resolve()
    }
    waits.clear()
  }
  const pause = (): Promise<void> => new Promise(resolve => {
    const timer = setTimeout(() => { waits.delete(timer); resolve() }, 180)
    waits.set(timer, resolve)
  })
  const isCurrent = (token: number, mode: string): boolean =>
    !disposed && token === generation && clientStore.getSnapshot().displayMode === mode

  const restoreAggregatedSession = async (sessionId: string, current: () => boolean): Promise<void> => {
    const uiWorkspace = ctx.uiWorkspace
    if (uiWorkspace === undefined) return
    for (let attempt = 0; attempt < 3 && current(); attempt += 1) {
      const known = ctx.sessions === undefined || ctx.sessions.list.getSnapshot().byId[sessionId] !== undefined
      if (known || attempt === 2) {
        try {
          if (!current()) return
          uiWorkspace.openSession(sessionId)
          if (current()) void clientStore.setActiveSession(sessionId)
        } catch { /* disconnected device: leave the previous selection in place */ }
        return
      }
      await pause()
      if (!current()) return
      try { await ctx.sessions?.refresh() } catch { /* next attempt retries */ }
    }
  }

  const reconcile = async (mode: string): Promise<void> => {
    const token = ++generation
    cancelWaits()
    const current = (): boolean => isCurrent(token, mode)
    try { await ctx.sessions?.refresh() } catch { /* a failed refresh must not block a current switch */ }
    if (!current()) return
    refreshModelCatalog(ctx)
    if (!current()) return
    if (mode === 'native') {
      try { await ensureNativeLocalSelection(ctx, current) } catch { /* best-effort navigation */ }
    } else if (mode === 'aggregated') {
      const pending = clientStore.takePendingAggregatedSession()
      if (pending !== undefined && current()) await restoreAggregatedSession(pending, current)
    }
  }

  const unsubscribeStore = clientStore.subscribe(() => {
    const mode = clientStore.getSnapshot().displayMode
    if (mode === lastMode) return
    lastMode = mode
    void reconcile(mode)
  })

  const resolveLayout = (): ClientContextLike['layout'] =>
    ctx.layout ?? (ctx.get?.('layout') as ClientContextLike['layout'])

  const isGlobalPanelActive = (): boolean => {
    try {
      const activePanelId = resolveLayout()?.panelInfo?.getSnapshot()?.activePanelId
      return activePanelId !== undefined && activePanelId !== null
    } catch {
      return false
    }
  }

  const syncMainSession = (): string | undefined => {
    const list = ctx.sessions?.list.getSnapshot()
    const current = list === undefined ? undefined : currentMainSessionId(list)
    clientStore.setMainViewVisible(!isGlobalPanelActive())
    if (isGlobalPanelActive()) {
      void clientStore.setActiveSession(undefined)
      return current
    }
    if (current !== undefined) {
      // The Native Pane and the Host model-catalog scope both need the active
      // Session even when the slot that normally reports it never mounts (for
      // example when the hidden mirror conversation failed to open). This is a
      // deduped fallback, not a second source of truth.
      void clientStore.setActiveSession(current)
    }
    return current
  }

  const unsubscribeSessions = ctx.sessions?.list.subscribe?.(() => {
    const current = syncMainSession()
    if (clientStore.getSnapshot().displayMode !== 'native' || guarding) return
    if (current === undefined || !decodeSessionId(current).isRemote) return
    guarding = true
    const token = generation
    void ensureNativeLocalSelection(ctx, () => isCurrent(token, 'native')).catch(() => {
      // A failed local workspace open must not leak an unhandled rejection.
    }).finally(() => {
      guarding = false
    })
  })

  const unsubscribePanelInfo = resolveLayout()?.panelInfo?.subscribe?.(() => {
    syncMainSession()
  })

  syncMainSession()

  if (clientStore.getSnapshot().displayMode === 'native') void reconcile('native')

  return () => {
    disposed = true
    generation += 1
    cancelWaits()
    unsubscribeStore()
    unsubscribeSessions?.()
    unsubscribePanelInfo?.()
  }
}

/**
 * Keep the projected Workspaces resolvable inside DSH's Session store.
 *
 * The sidebar draws a Workspace's children from the ids carried by the row and
 * skips ids it has no summary for, so a lost `api-session/added` replay leaves
 * remote Workspaces expanded-but-empty. Watching the projection for ids the
 * store cannot resolve and re-running `session.list` (which the Host patches to
 * merge every device) heals that generation without a reload.
 */
function installSessionLinkRepair(ctx: ClientContextLike): () => void {
  const sessions = ctx.sessions
  let lastSignature = ''

  const signatureOf = (): string => {
    const state = clientStore.getSnapshot()
    const devices = state.snapshot.devices.map(device => `${device.id}:${device.state}`).join(',')
    return `${state.displayMode}|${devices}`
  }

  const repair = new SessionLinkRepair({
    computeGap: () => {
      const snapshot = clientStore.getSnapshot().snapshot
      const excluded = new Set<string>([
        ...(snapshot.archivedSessionIds ?? []),
        ...(snapshot.subagentSessionIds ?? []),
      ])
      const known = new Set<string>(Object.keys(sessions?.list.getSnapshot().byId ?? {}))
      return computeSessionLinkGap(snapshot.logicalWorkspaces, known, { excludedSessionIds: excluded })
    },
    canRepair: () => {
      const state = clientStore.getSnapshot()
      const connectedDevices = state.snapshot.devices.filter(device => device.state === 'connected').length
      return { ok: state.displayMode !== 'native' && connectedDevices > 0, connectedDevices }
    },
    refresh: async () => {
      await sessions?.refresh?.()
    },
  }, {
    // Keep the user informed instead of silently retrying: the banner reads
    // this status and stays up until every referenced id resolves.
    onReport: (report) => {
      clientStore.updateSessionLinkStatus(report.missing > 0
        ? { missing: report.missing, exhausted: report.exhausted, byDevice: report.byDevice, ...(report.lastError !== undefined ? { lastError: report.lastError } : {}) }
        : undefined)
    },
  })
  setActiveSessionLinkRepair(repair)

  // A device finishing its handshake or a mode switch starts a new budget: the
  // earlier attempts were made for a different input set.
  const noteInputs = (): void => {
    const signature = signatureOf()
    if (signature !== lastSignature) {
      lastSignature = signature
      repair.resetBudget()
    }
    repair.noteChange()
  }

  const unsubscribeStore = clientStore.subscribe(noteInputs)
  const unsubscribeSessions = sessions?.list.subscribe?.(() => {
    repair.noteChange()
  })

  lastSignature = signatureOf()
  repair.noteChange()

  return () => {
    unsubscribeStore()
    unsubscribeSessions?.()
    setActiveSessionLinkRepair(undefined)
    clientStore.updateSessionLinkStatus(undefined)
    repair.dispose()
  }
}

export function apply(ctx: ClientContextLike): void {
  try {
    applyClient(ctx)
  } catch (error) {
    // The desktop crash log captures renderer `console.error` output; without
    // this line a client entry that throws is reduced to "did not activate".
    console.error('[dsh-multi-device] client entry failed to activate', error)
    throw error
  }
}

function applyClient(ctx: ClientContextLike): void {
  adoptMultiDeviceStyles()

  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-multi-device: locales')
  ctx.effect(() => clientStore.start(), 'dsh-multi-device: client-store')
  ctx.effect(() => installWindowTitle(), 'dsh-multi-device: window title')
  // A repair loop that cannot install must never take the whole client entry
  // down with it: the sidebar and settings have to keep working.
  ctx.effect(() => {
    try {
      return installSessionLinkRepair(ctx)
    } catch (error) {
      console.error('[dsh-multi-device] session link repair failed to install', error)
      return () => {}
    }
  }, 'dsh-multi-device: session link repair')

  const getTranslate = (): ((key: MultiDeviceLocaleKey) => string) => {
    try {
      if (typeof ctx.locale.bind === 'function') {
        return ctx.locale.bind(LOCALE_NS)
      }
    } catch {
      // Fallback
    }
    return translateFallback
  }

  const handleOpenSettings = (): void => {
    openSettingsSection(ctx, SETTINGS_SECTION_ID)
  }
  const refreshCatalog = (): void => refreshModelCatalog(ctx)

  ctx.inject(['connection'], (scope) => {
    scope.effect(() => {
      const connection = scope.get?.('connection') as { rpc?: CatalogRpc } | undefined
      if (connection?.rpc === undefined) return () => {}
      return installScopedCatalog(connection.rpc,
        () => clientStore.effectiveSessionId(),
        id => decodeSessionId(id).isRemote,
        async (sessionId, signal) => {
          try {
            const response = await fetch('/multi-device/api', {
              method: 'POST', headers: { 'content-type': 'application/json' }, signal,
              body: JSON.stringify({ action: 'modelCatalog', payload: { sessionId, clientId: clientStore.clientId } }),
            })
            const result = await response.json() as { ok: boolean; value?: unknown; error?: string }
            if (result.ok) return { ok: true, value: result.value }
            return { ok: false, error: { code: 'dsh-md/model-catalog', message: result.error ?? 'Catalog unavailable', details: {} } }
          } catch (error) {
            return { ok: false, error: { code: 'dsh-md/model-catalog', message: error instanceof Error ? error.message : String(error), details: {} } }
          }
        })
    }, 'dsh-multi-device: browser scoped catalog')
  })
  ctx.inject(['modelDirectories'], scope => {
    scope.effect(() => {
      let previous = clientStore.effectiveSessionId()
      const refresh = (): void => {
        const next = clientStore.effectiveSessionId()
        if (next === previous) return
        previous = next
        refreshModelCatalog(scope)
      }
      refreshModelCatalog(scope)
      return clientStore.subscribe(refresh)
    }, 'dsh-multi-device: catalog generation')
  })

  // Sidebar project rows get a device dot + device name / device count.
  ctx.effect(
    () => installProjectDeviceBadges(getTranslate()),
    'dsh-multi-device: project device badges',
  )

  // 1. Native Mode owns the local DSH store transitions. The Host filters the
  //    data; this refreshes the local Session catalog and leaves a remote
  //    conversation when the 本机 tab becomes active. The same injected context
  //    publishes `sessions` / `uiWorkspace` to the device chip components.
  ctx.inject(['sessions', 'uiWorkspace'], (modeCtx) => {
    modeCtx.effect(
      () => installModeSideEffects(modeCtx),
      'dsh-multi-device: native local surface',
    )
    modeCtx.effect(
      () => bindClientServices({
        sessions: modeCtx.sessions as unknown as BoundSessionsService,
        uiWorkspace: modeCtx.uiWorkspace as unknown as BoundUiWorkspaceService,
      }),
      'dsh-multi-device: client service handles',
    )
  })

  // 1b. Replace DSH's page-local completion reminders with the Host-owned set
  //     for local and remote Sessions alike.
  ctx.inject(['uiSession'], (readCtx) => {
    readCtx.effect(() => {
      const service = readCtx.uiSession ??
        (readCtx.get?.('uiSession') as { sessionStatus?: SessionStatusSource } | undefined)
      return installReadStateOverlay({
        source: service?.sessionStatus,
        notifyExistingSubscribers: service === undefined ? undefined : existingSessionStatusNotifier(service),
        getUnread: () => {
          const snapshot = clientStore.getSnapshot()
          // Before the first Host snapshot arrives, keep DSH's own local
          // reminders instead of masking them with an empty set.
          if (snapshot.snapshot.revision === 0) return undefined
          return new Set(snapshot.snapshot.unreadSessionIds ?? [])
        },
        subscribeReadState: listener => clientStore.subscribe(listener),
        shouldOverride: () => true,
      })
    }, 'dsh-multi-device: remote unread overlay')
  })

  // 2. Register Native Settings Section (`settings.section`, id: 'multi-device')
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: SETTINGS_SECTION_ID,
        order: 12,
        label: () => getTranslate()('settingsSectionTitle'),
        locale: LOCALE_NS,
      },
      (props: { t?: (k: MultiDeviceLocaleKey) => string; close?: () => void }) => (
        <MultiDeviceHubPanel
          t={props.t ?? getTranslate()}
          onCloseSettings={props.close}
        />
      ),
    ),
  )

  // 3. Register Plugin Manager Bundle Configuration (`plugins.bundle.config`)
  ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register(
      {
        name: 'plugins.bundle.config',
        key: 'dsh-multi-device',
        locale: LOCALE_NS,
      },
      (props: { view?: 'summary' | 'page'; t?: (k: MultiDeviceLocaleKey) => string }) => {
        const t = props.t ?? getTranslate()
        if (props.view === 'summary') return t('pluginSummary')
        return <MultiDeviceHubPanel t={t} hideHeader />
      },
    ),
  )

  // 4. Register the persistent Native Mode tab bar + keep-alive viewports in `shell.overlay`
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'multi-device-switcher',
        order: 40,
        locale: LOCALE_NS,
      },
      (props: { t?: (k: MultiDeviceLocaleKey) => string }) => (
        <ModeSwitcherOverlay
          t={props.t ?? getTranslate()}
          onOpenSettings={handleOpenSettings}
        />
      ),
    ),
  )
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'multi-device-session-link-banner',
        order: 45,
        locale: LOCALE_NS,
      },
      (props: { t?: (k: MultiDeviceLocaleKey) => string }) => (
        <SessionLinkBanner t={props.t ?? getTranslate()} onOpenSettings={handleOpenSettings} />
      ),
    ),
  )

  // 5. Report the active Session to the Host so `session/modelCatalog` can
  //    answer with exactly that Session owner's models. This slot is rendered
  //    for blank/new Sessions too, unlike the header utilities below.
  ctx.slots.inject('conversation.input.right', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.right',
        id: 'multi-device-active-session',
        order: -100,
      },
      (props: { sessionId: string }) => (
        <ActiveSessionReporter sessionId={props.sessionId} onScopeReported={refreshCatalog} />
      ),
    ),
  )

  // 6b. Owning-device chip on the conversation page. Local Sessions show 本机,
  //     remote Sessions show their device, and both open a details popover.
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.utilities',
        id: 'multi-device-session-device',
        order: 20,
        locale: LOCALE_NS,
      },
      (props: { sessionId: string; t?: (k: MultiDeviceLocaleKey) => string }) => (
        <SessionDeviceChip
          sessionId={props.sessionId}
          t={props.t ?? getTranslate()}
          onOpenSettings={handleOpenSettings}
        />
      ),
    ),
  )

  // 6c. New Session row: choose which device hosts the conversation when the
  //     logical workspace spans several machines. The chip keeps showing the
  //     owner for single-device workspaces instead of advertising a no-op menu.
  const NewSessionDeviceChip = (props: {
    sessionId?: string
    t?: (k: MultiDeviceLocaleKey) => string
  }): React.ReactElement | null => {
    // The hero row is Session-scoped, but keep a fallback to the reported
    // active Session so an older shell that omits the prop still renders the
    // picker instead of silently dropping it.
    const state = useMultiDeviceState()
    const sessionId = props.sessionId ?? state.activeSessionId
    if (sessionId === undefined || sessionId === '') return null
    return (
      <SessionDeviceChip
        sessionId={sessionId}
        variant="hero"
        t={props.t ?? getTranslate()}
        onOpenSettings={handleOpenSettings}
      />
    )
  }

  ctx.slots.inject('conversation.hero.options', () =>
    ctx.slots.register(
      {
        name: 'conversation.hero.options',
        id: 'multi-device-new-session-device',
        order: 10,
        locale: LOCALE_NS,
      },
      NewSessionDeviceChip,
    ),
  )

  // 6d. Offline banner above the composer. The Host holds the history stream
  //     open while the device reconnects, so the conversation shows its normal
  //     skeleton plus this explanation instead of a raw transport error.
  const SessionOfflineBanner = (props: {
    sessionId?: string
    t?: (k: MultiDeviceLocaleKey) => string
  }): React.ReactElement | null => {
    const state = useMultiDeviceState()
    const sessionId = props.sessionId ?? state.activeSessionId
    if (sessionId === undefined || sessionId === '') return null
    return (
      <OfflineDeviceBanner
        sessionId={sessionId}
        t={props.t ?? getTranslate()}
        onOpenSettings={handleOpenSettings}
      />
    )
  }

  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.dock',
        id: 'multi-device-offline-banner',
        order: 10,
        locale: LOCALE_NS,
      },
      SessionOfflineBanner,
    ),
  )

  // 6e. Optional device marker in the Session row's leading cell. Off by
  //     default; the Host persists `ui.sessionRowDeviceDot` and the local
  //     Native Mode page never renders aggregated decorations.
  ctx.slots.inject('sidebar.session.row.leading', () =>
    ctx.slots.register(
      {
        name: 'sidebar.session.row.leading',
        id: 'multi-device-row-device',
        order: 10,
        locale: LOCALE_NS,
      },
      (props: { sessionId: string; t?: (k: MultiDeviceLocaleKey) => string }) => (
        <SessionRowDeviceMarker sessionId={props.sessionId} t={props.t ?? getTranslate()} />
      ),
    ),
  )

  ctx.slots.inject('sidebar.session.row.hover', () =>
    ctx.slots.register(
      {
        name: 'sidebar.session.row.hover',
        id: 'multi-device-row-hover',
        order: 10,
        locale: LOCALE_NS,
      },
      (props: { sessionId: string; t?: (k: MultiDeviceLocaleKey) => string }) => (
        <SessionRowHoverDeviceSection sessionId={props.sessionId} t={props.t ?? getTranslate()} />
      ),
    ),
  )

}

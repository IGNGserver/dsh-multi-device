/**
 * `dsh-multi-device` Browser Client Entry.
 *
 * Contributes strictly to official DSH 0.2 UI extension slots:
 * 1. `settings.section` (`id: 'multi-device'`): the Device Settings section.
 * 2. `plugins.bundle.config` (`key: 'dsh-multi-device'`): Companion configuration
 *    surface inside DSH's Plugin Manager bundle detail view.
 * 3. `shell.overlay` (`id: 'multi-device-switcher'`): the persistent device tab
 *    strip (本机 + remote devices) and the Keep-Alive remote viewports.
 *
 * Remote Sessions are never projected into the local DSH surface: they are only
 * ever rendered by their own device's page inside the tab strip. The only
 * cross-device state the plugin publishes into the local shell is unread
 * completions, which the Host owns for every device.
 *
 * @module dsh-multi-device/client
 */
import React from 'react'
import {
  bindClientServices,
  type SessionsListSnapshotLike,
  type SessionsServiceLike,
  type UiWorkspaceServiceLike,
} from './clientServices.ts'
import { LOCALE_NS, en, zh, type MultiDeviceLocaleKey } from './locales.ts'
import { NativeOverlay } from './NativeOverlay.tsx'
import { MultiDeviceHubPanel } from './MultiDeviceHubPanel.tsx'
import {
  installReadStateOverlay,
  existingSessionStatusNotifier,
  type SessionStatusSource,
} from './readState.ts'
import { clientStore } from './state.ts'
import { installLocalUiStateSync } from './uiState.ts'
import { adoptMultiDeviceStyles } from './styles.ts'
import { installWindowTitle } from './windowTitle.ts'

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

export interface ClientContextLike {
  effect(fn: () => (() => void) | void, label?: string): void
  inject(deps: readonly string[], fn: (ctx: ClientContextLike) => void): void
  /** Resolve a Client service (layout panel ownership). */
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
  /** DSH's own Session navigation surface (opens a conversation in the local UI). */
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
 * Report which local Session owns the main view.
 *
 * The Host needs it for two independent reasons: a completion that lands on the
 * conversation the user is currently looking at must clear immediately, and a
 * brand-new blank Session must not count toward the 本机 tab badge. A global
 * panel (plugin manager, settings) hides the main view, so presence is not
 * reported while one is open.
 */
export function installLocalSessionTracking(source: ClientContextLike): () => void {
  const ctx = {
    sessions: source.sessions,
    layout: source.layout ?? source.get?.('layout'),
    get: source.get?.bind(source),
  } as ClientContextLike

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
    if (isGlobalPanelActive()) return current
    if (current !== undefined) {
      void clientStore.reportLocalMainSession(current)
    }
    return current
  }

  const unsubscribeSessions = ctx.sessions?.list.subscribe?.(() => {
    syncMainSession()
  })

  const unsubscribePanelInfo = resolveLayout()?.panelInfo?.subscribe?.(() => {
    syncMainSession()
  })

  syncMainSession()

  return () => {
    unsubscribeSessions?.()
    unsubscribePanelInfo?.()
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
  // Defined before the title effect: the opt-in taskbar aggregate is localized
  // copy, so the title needs the same translate the strip renders with.
  const getTranslate = (): ((key: MultiDeviceLocaleKey) => string) => {
    try { return ctx.locale.bind?.(LOCALE_NS) ?? translateFallback } catch { return translateFallback }
  }
  ctx.effect(() => installWindowTitle(getTranslate()), 'dsh-multi-device: window title')
  const handleOpenSettings = (): void => { openSettingsSection(ctx, SETTINGS_SECTION_ID) }

  // Publish DSH's Session store and navigation surface to the device UI.
  //
  // The attention menus are rendered by a slot component, not by this entry, so
  // they cannot receive these services as props. Binding them here is what makes
  // an attention row actionable: without it `getClientServices()` stays empty and
  // clicking a local Session can only report "could not open". It also gives the
  // menus the conversation titles the local store already knows.
  ctx.inject(['sessions', 'uiWorkspace'], (serviceCtx) => {
    serviceCtx.effect(
      () => bindClientServices({
        ...(serviceCtx.sessions !== undefined ? { sessions: serviceCtx.sessions } : {}),
        ...(serviceCtx.uiWorkspace !== undefined ? { uiWorkspace: serviceCtx.uiWorkspace } : {}),
      }),
      'dsh-multi-device: client services',
    )
    serviceCtx.effect(
      () => installLocalUiStateSync({
        ...(serviceCtx.uiWorkspace === undefined ? {} : { uiWorkspace: serviceCtx.uiWorkspace }),
        getHostState: () => clientStore.getSnapshot().snapshot.uiState,
        subscribeHostState: listener => clientStore.subscribe(listener),
        report: state => { void clientStore.patchUiState(state).catch(() => {}) },
      }),
      'dsh-multi-device: local view state',
    )
  })

  // The local main view feeds the Host-owned read state; nothing is merged into
  // the local Session store, so this is the only local navigation the plugin
  // observes.
  ctx.inject(['sessions', 'layout'], (trackCtx) => {
    trackCtx.effect(
      () => installLocalSessionTracking(trackCtx),
      'dsh-multi-device: local session tracking',
    )
  })

  // Replace DSH's page-local completion reminders with the Host-owned set, so
  // 本机 and every remote device tab share one read model.
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
    }, 'dsh-multi-device: device unread overlay')
  })

  // 1. Register the Device Settings Section (`settings.section`, id: 'multi-device')
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

  // 2. Register Plugin Manager Bundle Configuration (`plugins.bundle.config`)
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

  // 3. Register the persistent device tab bar + keep-alive viewports in `shell.overlay`
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'multi-device-switcher',
        order: 40,
        locale: LOCALE_NS,
      },
      (props: { t?: (k: MultiDeviceLocaleKey) => string }) => (
        <NativeOverlay
          t={props.t ?? getTranslate()}
          onOpenSettings={handleOpenSettings}
        />
      ),
    ),
  )
}

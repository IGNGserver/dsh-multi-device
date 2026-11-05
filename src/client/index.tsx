/**
 * `dsh-multi-device` Browser Client Entry.
 *
 * Contributes strictly to official DSH 0.2 UI extension slots without occupying
 * the primary left sidebar navigation:
 * 1. `settings.section` (`id: 'multi-device'`): Native top-level Settings section
 *    for managing remote SSH devices, display mode, and Git repository auto-aggregation.
 * 2. `plugins.bundle.config` (`key: 'dsh-multi-device'`): Companion configuration surface
 *    inside DSH's Plugin Manager bundle detail view.
 * 3. `shell.overlay` (`id: 'multi-device-switcher'`): persistent Keep-Alive Native Mode
 *    viewport (the toggle lives in the sidebar footer entry below).
 * 4. `sidebar.footer.action`: compact Multi-Device entry + device popover, so the plugin
 *    never floats controls over DSH's session header or caption drag region.
 * 5. `conversation.session.header.utilities`, `conversation.input.right`,
 *    `sidebar.session.row.hover`, and `sidebar.workspaces.session.menu.item`:
 *    The owning device appears on the right side of an opened Session header;
 *    Session rows themselves stay free of device prefixes. Hover details and a
 *    native `MenuItemButton` still expose the owning device.
 *
 * @module dsh-multi-device/client
 */
import React from 'react'
import { LOCALE_NS, en, zh, type MultiDeviceLocaleKey } from './locales.ts'
import {
  ActiveSessionReporter,
  ModeSwitcherOverlay,
  SessionHeaderDeviceBadge,
  SessionMenuOpenInNativeItem,
  SessionRowHoverDeviceSection,
} from './ModeSwitcherOverlay.tsx'
import { MultiDeviceHubPanel } from './MultiDeviceHubPanel.tsx'
import { installProjectDeviceBadges } from './projectBadges.ts'
import { MultiDeviceSidebarEntry } from './SidebarEntry.tsx'
import { clientStore } from './state.ts'
import { adoptMultiDeviceStyles } from './styles.ts'

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
      | { catalog?: { refresh?: () => void } }
      | undefined
    models?.catalog?.refresh?.()
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

export interface ClientContextLike {
  effect(fn: () => (() => void) | void, label?: string): void
  inject(deps: readonly string[], fn: (ctx: ClientContextLike) => void): void
  /** Resolve a Client service (used only as a guarded model-picker refresh fallback). */
  get?(key: string): unknown
  locale: {
    register(ns: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): () => void
    bind?(ns: string): (key: MultiDeviceLocaleKey) => string
  }
  layout?: {
    selectPanel(panelId: string | null): void
  }
  shortcuts?: {
    register(spec: Record<string, unknown>): () => void
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

export function apply(ctx: ClientContextLike): void {
  adoptMultiDeviceStyles()

  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-multi-device: locales')
  ctx.effect(() => clientStore.start(), 'dsh-multi-device: client-store')

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

  // Sidebar project rows get a device dot + device name / device count.
  ctx.effect(
    () => installProjectDeviceBadges(getTranslate()),
    'dsh-multi-device: project device badges',
  )

  // 1. Register keyboard shortcut (Cmd/Ctrl+Shift+M) to toggle Aggregated ⟷ Native mode
  ctx.inject(['shortcuts'], (shortcutCtx) => {
    shortcutCtx.effect(() => {
      if (shortcutCtx.shortcuts === undefined) return () => {}
      return shortcutCtx.shortcuts.register({
        id: 'multiDevice.toggleMode',
        label: () => getTranslate()('toggleMode'),
        aliases: ['toggle native mode', 'multi device mode'],
        defaults: {
          'desktop:macos': { code: 'KeyM', modifiers: ['primary', 'shift'] },
          'desktop:windows': { code: 'KeyM', modifiers: ['primary', 'shift'] },
          'desktop:linux': { code: 'KeyM', modifiers: ['primary', 'shift'] },
          'web:macos': { code: 'KeyM', modifiers: ['primary', 'shift'] },
          'web:windows': { code: 'KeyM', modifiers: ['primary', 'shift'] },
        },
        // Only outside inputs: toggling the whole UI while typing in a
        // textarea loses the composer draft focus.
        regions: ['page'],
        modals: [],
        resolve: () => ({
          status: 'handled',
          run: () => {
            clientStore.toggleDisplayMode()
          },
        }),
      })
    }, 'dsh-multi-device: shortcut')
  })

  // 2. Register Sidebar Footer Entry (`sidebar.footer.action`) — a native list slot.
  //    Keeping the entry here avoids covering DSH's session header and the Windows
  //    caption drag region, which swallowed clicks on the old floating bar.
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      {
        name: 'sidebar.footer.action',
        id: 'multi-device-entry',
        order: 30,
        locale: LOCALE_NS,
      },
      (props: { wide?: boolean; t?: (k: MultiDeviceLocaleKey) => string }) => (
        <MultiDeviceSidebarEntry
          wide={props.wide === true}
          t={props.t ?? getTranslate()}
          onOpenSettings={handleOpenSettings}
        />
      ),
    ),
  )

  // 3. Register Native Settings Section (`settings.section`, id: 'multi-device')
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

  // 4. Register Plugin Manager Bundle Configuration (`plugins.bundle.config`)
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

  // 5. Register Persistent Native Keep-Alive Viewport in `shell.overlay`
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

  // 6a. Report the active Session to the Host so `session/modelCatalog` can
  //     answer with exactly that Session owner's models. This slot is rendered
  //     for blank/new Sessions too, unlike the header utilities below.
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

  // 6b. Show the owning device on the right side of an opened remote Session.
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.utilities',
        id: 'multi-device-session-device',
        order: 20,
        locale: LOCALE_NS,
      },
      (props: { sessionId: string; t?: (k: MultiDeviceLocaleKey) => string }) => (
        <SessionHeaderDeviceBadge sessionId={props.sessionId} t={props.t ?? getTranslate()} />
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

  ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
    ctx.slots.register(
      {
        name: 'sidebar.workspaces.session.menu.item',
        id: 'multi-device-open-native',
        order: 450,
        locale: LOCALE_NS,
      },
      (props: {
        sessionId: string
        useMenuOpenState: () => readonly [boolean, (open: boolean) => void]
        t?: (k: MultiDeviceLocaleKey) => string
      }) => (
        <SessionMenuOpenInNativeItem
          sessionId={props.sessionId}
          useMenuOpenState={props.useMenuOpenState}
          t={props.t ?? getTranslate()}
        />
      ),
    ),
  )
}

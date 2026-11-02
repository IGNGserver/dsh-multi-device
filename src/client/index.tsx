/**
 * `dsh-multi-device` Browser Client Entry.
 *
 * Contributes strictly to official DSH 0.2 UI extension slots without occupying
 * the primary left sidebar navigation:
 * 1. `settings.section` (`id: 'multi-device'`): Native top-level Settings section
 *    for managing remote SSH devices, display mode, and Git repository auto-aggregation.
 * 2. `plugins.bundle.config` (`key: 'dsh-multi-device'`): Companion configuration surface
 *    inside DSH's Plugin Manager bundle detail view.
 * 3. `shell.overlay` (`id: 'multi-device-switcher'`): Compact Aggregated ⟷ Native switcher
 *    (auto-hidden until a device is added) and persistent Keep-Alive Native Mode viewport.
 * 4. `sidebar.session.row.leading`, `sidebar.session.row.hover`, and
 *    `sidebar.workspaces.session.menu.item`: Per-session device badges, hover details, and
 *    native `MenuItemButton` action to open the owning device in Native Mode.
 *
 * @module dsh-multi-device/client
 */
import React from 'react'
import { LOCALE_NS, en, zh, type MultiDeviceLocaleKey } from './locales.ts'
import {
  ModeSwitcherOverlay,
  SessionMenuOpenInNativeItem,
  SessionRowHoverDeviceSection,
  SessionRowLeadingBadge,
} from './ModeSwitcherOverlay.tsx'
import { MultiDeviceHubPanel } from './MultiDeviceHubPanel.tsx'
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

  // 4. Register Floating Mode Switcher & Persistent Native Keep-Alive Viewport in `shell.overlay`
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

  // 5. Register Session Row Device Badges, Hover Metadata, and Context Menu Action
  ctx.slots.inject('sidebar.session.row.leading', () =>
    ctx.slots.register(
      {
        name: 'sidebar.session.row.leading',
        id: 'multi-device-row-badge',
        order: 10,
      },
      (props: { sessionId: string }) => <SessionRowLeadingBadge sessionId={props.sessionId} />,
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

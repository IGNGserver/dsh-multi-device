/**
 * `dsh-multi-device` Browser Client Entry.
 *
 * Contributes to official DSH 0.2 UI extension slots without replacing any core slot:
 * 1. `shell.overlay` (`id: 'multi-device-switcher'`): Floating Aggregated ⟷ Native mode switcher
 *    and persistent Keep-Alive Native Mode viewport container.
 * 2. `sidebar.panellist` + `main` (`id/key: 'multi-device-hub'`): Global sidebar entry and main panel
 *    for managing devices, importing `~/.ssh/config`, configuring Git workspace aggregation, and
 *    using Native Mode.
 * 3. `settings.plugins.tab` (`id: 'multi-device-hub'`): Settings → Built-in plugins tab.
 * 4. `sidebar.session.row.leading`, `sidebar.session.row.hover`, and
 *    `sidebar.workspaces.session.menu.item`: Per-session device badges, hover details, and
 *    "Open Device in Native Mode" context menu action.
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

export const PANEL_ID = 'multi-device-hub'

export const inject = ['slots', 'locale']

const zhPreferred =
  typeof navigator !== 'undefined' ? navigator.language.toLowerCase().startsWith('zh') : true
const fallbackDict = zhPreferred ? zh : en

function translateFallback(key: MultiDeviceLocaleKey): string {
  return fallbackDict[key] ?? en[key] ?? key
}

function HubPanelIcon({ size = 16 }: { size?: number; active?: boolean }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2" width="8.5" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="6" y="8" width="8.5" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 11H6M10 5H12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
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
  }
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

  const openHubPanel = (): void => {
    try {
      ctx.layout?.selectPanel(PANEL_ID)
    } catch {
      // Ignore if layout is not ready
    }
  }

  // 1. Register keyboard shortcut (Cmd/Ctrl+Shift+M) to toggle Aggregated ⟷ Native mode
  ctx.inject(['shortcuts'], (shortcutCtx) => {
    shortcutCtx.effect(() => {
      if (shortcutCtx.shortcuts === undefined) return () => {}
      return shortcutCtx.shortcuts.register({
        id: 'multiDevice.toggleMode',
        label: () => getTranslate()('switchToNative'),
        aliases: ['toggle native mode', 'multi device mode'],
        defaults: {
          'desktop:macos': { code: 'KeyM', modifiers: ['primary', 'shift'] },
          'desktop:windows': { code: 'KeyM', modifiers: ['primary', 'shift'] },
          'desktop:linux': { code: 'KeyM', modifiers: ['primary', 'shift'] },
          'web:macos': { code: 'KeyM', modifiers: ['primary', 'shift'] },
          'web:windows': { code: 'KeyM', modifiers: ['primary', 'shift'] },
        },
        regions: ['page', 'editable'],
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

  // 2. Register Floating Mode Switcher & Persistent Native Keep-Alive Viewport in `shell.overlay`
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'multi-device-switcher',
        order: 40,
        locale: LOCALE_NS,
      },
      (props: { t?: (k: MultiDeviceLocaleKey) => string }) => (
        <ModeSwitcherOverlay t={props.t ?? getTranslate()} onOpenHubPanel={openHubPanel} />
      ),
    ),
  )

  // 3. Register Global Sidebar Panel icon (`sidebar.panellist`) & Main Panel (`main`)
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 25,
        label: () => getTranslate()('panelTitle'),
      },
      (props: { size?: number; active?: boolean }) => (
        <HubPanelIcon size={props.size} active={props.active} />
      ),
    ),
  )

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: LOCALE_NS,
      },
      (props: { t?: (k: MultiDeviceLocaleKey) => string }) => (
        <MultiDeviceHubPanel t={props.t ?? getTranslate()} />
      ),
    ),
  )

  // 4. Register Settings → Built-in plugins tab (`settings.plugins.tab`)
  ctx.slots.inject('settings.plugins.tab', () =>
    ctx.slots.register(
      {
        name: 'settings.plugins.tab',
        id: 'multi-device-hub',
        order: 8,
        label: () => getTranslate()('settingsTabTitle'),
        locale: LOCALE_NS,
      },
      (props: { t?: (k: MultiDeviceLocaleKey) => string }) => (
        <MultiDeviceHubPanel t={props.t ?? getTranslate()} />
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

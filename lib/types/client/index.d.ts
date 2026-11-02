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
import React from 'react';
import { type MultiDeviceLocaleKey } from './locales.ts';
export declare const SETTINGS_SECTION_ID = "multi-device";
/** Retained alias for backwards compatibility with external callers. */
export declare const PANEL_ID = "multi-device";
export declare const inject: string[];
export interface SlotEntryLike {
    readonly options?: {
        readonly id?: string;
        readonly store?: {
            readonly create?: () => {
                readonly actions?: {
                    readonly openSection?: (id: string) => void;
                };
            };
        };
    };
}
export interface ClientContextLike {
    effect(fn: () => (() => void) | void, label?: string): void;
    inject(deps: readonly string[], fn: (ctx: ClientContextLike) => void): void;
    locale: {
        register(ns: string, dicts: {
            zh: Record<string, string>;
            en: Record<string, string>;
        }): () => void;
        bind?(ns: string): (key: MultiDeviceLocaleKey) => string;
    };
    layout?: {
        selectPanel(panelId: string | null): void;
    };
    shortcuts?: {
        register(spec: Record<string, unknown>): () => void;
    };
    slots: {
        inject(slotName: string, fn: () => (() => void) | void): () => void;
        register(options: Record<string, unknown>, component: (props: any) => React.ReactNode): () => void;
        entries?(slotName: string): readonly SlotEntryLike[];
    };
}
/**
 * Open the native DSH Settings modal directly on `sectionId` via the `sidebar.settings`
 * shell store, falling back to an owned native `Modal` if the host shell does not mount
 * `sidebar.settings`.
 */
export declare function openSettingsSection(ctx: ClientContextLike, sectionId?: string): boolean;
export declare function apply(ctx: ClientContextLike): void;

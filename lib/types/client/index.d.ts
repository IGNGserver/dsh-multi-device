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
import React from 'react';
import { type MultiDeviceLocaleKey } from './locales.ts';
export declare const PANEL_ID = "multi-device-hub";
export declare const inject: string[];
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
    };
}
export declare function apply(ctx: ClientContextLike): void;

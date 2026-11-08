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
import React from 'react';
import { type SessionsServiceLike, type UiWorkspaceServiceLike } from './clientServices.ts';
import { type MultiDeviceLocaleKey } from './locales.ts';
import { type SessionStatusSource } from './readState.ts';
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
    /** Resolve a Client service (layout panel ownership). */
    get?(key: string): unknown;
    locale: {
        register(ns: string, dicts: {
            zh: Record<string, string>;
            en: Record<string, string>;
        }): () => void;
        bind?(ns: string): (key: MultiDeviceLocaleKey) => string;
    };
    layout?: {
        selectPanel(panelId: string | null): void;
        readonly panelInfo?: {
            getSnapshot(): {
                readonly activePanelId: string | null;
            };
            subscribe?(listener: () => void): () => void;
        };
    };
    sessions?: SessionsServiceLike;
    /** DSH's own Session navigation surface (opens a conversation in the local UI). */
    uiWorkspace?: UiWorkspaceServiceLike;
    uiSession?: {
        readonly sessionStatus?: SessionStatusSource;
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
/**
 * Report which local Session owns the main view.
 *
 * The Host needs it for two independent reasons: a completion that lands on the
 * conversation the user is currently looking at must clear immediately, and a
 * brand-new blank Session must not count toward the 本机 tab badge. A global
 * panel (plugin manager, settings) hides the main view, so presence is not
 * reported while one is open.
 */
export declare function installLocalSessionTracking(source: ClientContextLike): () => void;
export declare function apply(ctx: ClientContextLike): void;

/**
 * `dsh-multi-device` Browser Client Entry.
 *
 * Contributes strictly to official DSH 0.2 UI extension slots:
 * 1. `settings.section` (`id: 'multi-device'`): Native top-level Settings section
 *    for managing remote SSH devices, display mode, and Git repository auto-aggregation.
 *    This is the only place the mode is switched; Aggregated Mode has no device
 *    navigation, and Native Mode has no "back to aggregated" control.
 * 2. `plugins.bundle.config` (`key: 'dsh-multi-device'`): Companion configuration surface
 *    inside DSH's Plugin Manager bundle detail view.
 * 3. `shell.overlay` (`id: 'multi-device-switcher'`): persistent Native Mode tab bar
 *    (本机 + remote devices) and Keep-Alive remote viewports.
 * 4. `conversation.input.right`, `conversation.session.header.utilities`, and
 *    `sidebar.session.row.hover`: report the active Session to the Host, show
 *    its owning device (本机 included) as a chip on the conversation page with a
 *    details popover, and keep hover metadata. These are labels/scope hints,
 *    never device navigation entries.
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
interface SessionSummaryLike {
    readonly retainedBy?: {
        readonly mainView?: number;
    };
}
interface SessionsListSnapshotLike {
    readonly ids: readonly string[];
    readonly byId: Readonly<Record<string, SessionSummaryLike>>;
}
interface SessionsServiceLike {
    readonly list: {
        getSnapshot(): SessionsListSnapshotLike;
        subscribe?(listener: () => void): () => void;
    };
    refresh(): Promise<void>;
}
interface UiWorkspaceServiceLike {
    openSession(sessionId: string): void;
    openWorkspace(workspaceId: string): Promise<void>;
}
export interface ClientContextLike {
    effect(fn: () => (() => void) | void, label?: string): void;
    inject(deps: readonly string[], fn: (ctx: ClientContextLike) => void): void;
    /** Resolve a Client service (active-Session scope and model-picker refresh). */
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
    };
    sessions?: SessionsServiceLike;
    uiWorkspace?: UiWorkspaceServiceLike;
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
export {};

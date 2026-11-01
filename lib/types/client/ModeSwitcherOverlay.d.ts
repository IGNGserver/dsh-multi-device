/**
 * Floating Mode Switcher & Sidebar Session Row Enhancements.
 *
 * 1. `ModeSwitcherOverlay`: Mounted in `shell.overlay` (`id: 'multi-device-switcher'`).
 *    - Displays a compact top-right pill bar for 1-click switching between
 *      **Aggregated Mode (聚合模式)** and **Native Mode (原生模式)** plus per-device status dots.
 *    - Always keeps the `NativeViewport` mounted in the DOM (hidden via `display: none` while in
 *      Aggregated Mode) so Native Mode keep-alive pages are NEVER unmounted when switching modes!
 * 2. `SessionRowLeadingBadge`, `SessionRowHoverDeviceSection`, `SessionMenuOpenInNativeItem`:
 *    - Official DSH 0.2 slot contributions for `sidebar.session.row.leading`,
 *      `sidebar.session.row.hover`, and `sidebar.workspaces.session.menu.item`.
 *
 * @module dsh-multi-device/client/ModeSwitcherOverlay
 */
import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
export declare function ModeSwitcherOverlay({ t, onOpenHubPanel, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    onOpenHubPanel: () => void;
}): React.ReactElement;
/** Leading badge inside the 16px idle slot of a remote Session row (`sidebar.session.row.leading`). */
export declare function SessionRowLeadingBadge({ sessionId }: {
    sessionId: string;
}): React.ReactElement | null;
/** Device & Git repo metadata inside the Session row HoverCard (`sidebar.session.row.hover`). */
export declare function SessionRowHoverDeviceSection({ sessionId, t, }: {
    sessionId: string;
    t: (key: MultiDeviceLocaleKey) => string;
}): React.ReactElement | null;
/** Context menu item in a Session's `...` menu (`sidebar.workspaces.session.menu.item`). */
export declare function SessionMenuOpenInNativeItem({ sessionId, useMenuOpenState, t, }: {
    sessionId: string;
    useMenuOpenState: () => readonly [boolean, (open: boolean) => void];
    t: (key: MultiDeviceLocaleKey) => string;
}): React.ReactElement | null;

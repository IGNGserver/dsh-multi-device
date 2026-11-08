import React from 'react';
import { type DeviceView } from '../contract.ts';
import type { MultiDeviceLocaleKey } from './locales.ts';
/**
 * Single device's persistent frame (Electron `<webview>` when available and permitted,
 * or standard authenticated `<iframe>`).
 */
export declare function KeepAliveDeviceFrame({ device, active, reloadCount, t, onOpenSettings, }: {
    device: DeviceView;
    active: boolean;
    reloadCount: number;
    t: (key: MultiDeviceLocaleKey) => string;
    onOpenSettings: () => void;
}): React.ReactElement;
/**
 * Always-visible Native Mode tab strip. 本机 is the first tab and the stable
 * fallback when no remote device is selected.
 *
 * Two properties keep the strip honest at every window size:
 * - Its box is measured from the **Host frame**, never from the bar itself. The
 *   previous version fed the bar's own rect back in and pinned it as
 *   `max-width`, so the strip could shrink and never grow again — the mode
 *   switch stayed parked mid-window with a same-coloured dead band on its right.
 * - It renders through a portal onto `<body>` with an explicit z-index, because
 *   the Host's own `shell.overlay` seat is a stacking context (`z-index: 20`)
 *   and in-frame chrome (`[data-shell-leading]` at 25, the sidebar toggle at 30)
 *   paints above it. Portalled, the strip is clipped by nothing and loses no
 *   clicks; a runtime probe reports whatever still covers the switch.
 */
export declare function NativeTabBar({ t, onOpenSettings, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    onOpenSettings: () => void;
}): React.ReactElement | null;
/**
 * Remote device viewports: one full frame per mounted device, directly below
 * the tab strip. Inactive devices stay mounted but hidden so Keep-Alive keeps
 * their live WebSocket state, conversations and drafts.
 */
export declare function NativeViewport({ t, onOpenSettings, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    onOpenSettings: () => void;
}): React.ReactElement;

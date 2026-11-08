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
 */
export declare function NativeTabBar({ t, onOpenSettings, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    onOpenSettings: () => void;
}): React.ReactElement | null;
/**
 * Remote viewports for both modes:
 * - Native Mode: full frame below the tab bar.
 * - Aggregated Mode: a pane covering only the local conversation column while
 *   a remote Session is selected; the aggregated sidebar stays interactive.
 *
 * The pane is visible only after the injected bridge reports the selected raw
 * Session (see `shouldShowNativePane`). Until then the local mirror remains
 * visible, so a slow bridge or a version mismatch never shows a blank pane.
 */
export declare function NativeViewport({ t, onOpenSettings, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    onOpenSettings: () => void;
}): React.ReactElement;

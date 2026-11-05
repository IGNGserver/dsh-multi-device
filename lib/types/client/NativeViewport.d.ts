import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
/**
 * Always-visible Native Mode tab strip. 本机 is the first tab and the stable
 * fallback when no remote device is selected.
 */
export declare function NativeTabBar({ t, onOpenSettings, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    onOpenSettings: () => void;
}): React.ReactElement | null;
/**
 * Keep-Alive remote viewports below the tab bar. The local DSH page is never
 * rendered here: when 本机 is active this stage is hidden and the host frame
 * underneath remains visible and interactive.
 */
export declare function NativeViewport({ t, onOpenSettings, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    onOpenSettings: () => void;
}): React.ReactElement;

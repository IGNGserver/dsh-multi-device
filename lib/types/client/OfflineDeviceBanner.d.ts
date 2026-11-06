import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
type Translate = (key: MultiDeviceLocaleKey) => string;
export declare function OfflineDeviceBanner({ sessionId, t, onOpenSettings, }: {
    readonly sessionId: string | undefined;
    readonly t: Translate;
    readonly onOpenSettings: () => void;
}): React.ReactElement | null;
export {};

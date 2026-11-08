import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
export declare function NativeOverlay({ t, onOpenSettings, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    onOpenSettings: () => void;
}): React.ReactElement;

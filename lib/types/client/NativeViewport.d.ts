import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
export declare function NativeViewport({ t, embedded, onOpenSettings, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    embedded?: boolean;
    onOpenSettings?: () => void;
}): React.ReactElement;

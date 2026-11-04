import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
export declare function MultiDeviceSidebarEntry({ wide, t, onOpenSettings, }: {
    wide: boolean;
    t: (key: MultiDeviceLocaleKey) => string;
    onOpenSettings: () => void;
}): React.ReactElement;

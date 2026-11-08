import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
export declare function MultiDeviceHubPanel({ t, onCloseSettings, hideHeader, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    onCloseSettings?: () => void;
    hideHeader?: boolean;
}): React.ReactElement;

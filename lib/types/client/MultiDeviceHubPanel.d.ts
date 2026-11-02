import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
import { type HubTabId } from './state.ts';
export declare function MultiDeviceHubPanel({ t, onCloseSettings, hideHeader, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    defaultTab?: HubTabId;
    onCloseSettings?: () => void;
    hideHeader?: boolean;
}): React.ReactElement;

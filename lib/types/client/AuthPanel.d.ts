import React from 'react';
import type { DeviceView } from '../contract.ts';
import type { MultiDeviceLocaleKey } from './locales.ts';
export declare function AuthRequiredPanel({ device, t, onOpenSettings, }: {
    device: DeviceView;
    t: (key: MultiDeviceLocaleKey) => string;
    onOpenSettings: () => void;
}): React.ReactElement;

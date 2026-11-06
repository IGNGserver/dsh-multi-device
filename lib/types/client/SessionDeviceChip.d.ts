import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
type Translate = (key: MultiDeviceLocaleKey) => string;
export declare function SessionDeviceChip({ sessionId, t, onOpenSettings, variant, }: {
    readonly sessionId: string;
    readonly t: Translate;
    readonly onOpenSettings: () => void;
    /** `header` sits in the session header; `hero` sits in the New Session options row. */
    readonly variant?: 'header' | 'hero';
}): React.ReactElement | null;
export {};

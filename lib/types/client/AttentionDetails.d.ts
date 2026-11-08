/** Explainable attention badges: IDs and categories only, never messages. */
import React from 'react';
import type { DeviceAttentionView } from '../attention.ts';
import type { MultiDeviceLocaleKey } from './locales.ts';
export interface AttentionDetailsProps {
    readonly view?: DeviceAttentionView;
    readonly deviceName: string;
    readonly t: (key: MultiDeviceLocaleKey) => string;
    readonly nativeBar?: boolean;
    /** Compatibility with Hosts predating the shared projection. */
    readonly fallback?: {
        readonly runningCount?: number;
        readonly pendingCount?: number;
        readonly unreadSessionIds: readonly string[];
        readonly fresh: boolean;
    };
}
/** Exported for category/label tests without loading any native primitives. */
export declare function attentionGroups(view: DeviceAttentionView): {
    category: 'pending' | 'running' | 'unread';
    ids: readonly string[];
    count: number;
}[];
/** Localized here because the delegated surface intentionally does not edit locale contracts. */
export declare function attentionLabels(t: (key: MultiDeviceLocaleKey) => string): {
    pending: string;
    running: string;
    unread: string;
    stale: string;
    last: string;
    members: string;
    unavailable: string;
    copy: string;
    copied: string;
    failed: string;
    requests: string;
};
export declare function AttentionDetails({ view, deviceName, t, nativeBar, fallback }: AttentionDetailsProps): React.ReactElement;

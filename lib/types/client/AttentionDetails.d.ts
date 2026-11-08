import React from 'react';
import type { DeviceAttentionView } from '../attention.ts';
import type { MultiDeviceLocaleKey } from './locales.ts';
export type AttentionCategory = 'pending' | 'running' | 'unread';
export interface AttentionDetailsProps {
    readonly view?: DeviceAttentionView;
    readonly deviceName: string;
    readonly t: (key: MultiDeviceLocaleKey) => string;
    /** Dense rows for the Native Mode tab bar (same surface, tighter list). */
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
    category: AttentionCategory;
    ids: readonly string[];
    count: number;
}[];
/**
 * Category words shared with the DOM-injected project badges (`projectBadges`
 * cannot render React). Every word comes from the locale namespace, so the two
 * surfaces cannot drift apart, and neither repeats the old hard-coded pair of
 * dictionaries keyed off the Chinese label for This Device.
 */
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
/** Colour alone carries the category, so the tone name is the styling hook. */
export type AttentionTone = 'pending' | 'running' | 'done';
export interface AttentionSegment {
    readonly category: AttentionCategory;
    readonly tone: AttentionTone;
    readonly ids: readonly string[];
    readonly count: number;
}
/**
 * The capsule's segments, most urgent first, with empty categories dropped.
 *
 * Dropping empties is deliberate: the strip then shows only counts that exist,
 * so a device with nothing to report occupies no space at all. The order is the
 * one {@link attentionGroups} and the Host projection already use
 * (needs-reply → running → finished-unread), which is what keeps a colour-only
 * capsule readable for someone who cannot tell amber from green.
 */
export declare function attentionSegments(view: DeviceAttentionView | undefined, fallback?: AttentionDetailsProps['fallback']): AttentionSegment[];
export declare function AttentionDetails({ view, deviceName, t, nativeBar, fallback, }: AttentionDetailsProps): React.ReactElement;

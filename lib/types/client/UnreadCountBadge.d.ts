/**
 * Unread counter pill shared by Native Mode tabs and Settings device rows.
 *
 * Aggregated-mode workspace rows are decorated straight into DSH's DOM (there
 * is no workspace-row slot), so `projectBadges` builds the same markup with
 * `document.createElement`; the class name and locale keys stay identical.
 *
 * @module dsh-multi-device/client/UnreadCountBadge
 */
import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
/** Render the count when it is positive; nothing otherwise. */
export declare function UnreadCountBadge({ count, t, }: {
    count: number;
    t: (key: MultiDeviceLocaleKey) => string;
}): React.ReactElement | null;

/**
 * Optional device marker in a Session row's leading cell.
 *
 * The official `sidebar.session.row.leading` seat is 16px wide and is only
 * mounted while the row's primary state is idle (a running/approval row shows
 * its own status dot there). That makes it a good place for a *quiet* identity
 * hint, never a replacement for the status dot: the letter identifies the
 * device, the badge in the corner reports offline/reconnecting.
 *
 * Disabled by default (`ui.sessionRowDeviceDot`); aggregated mode only, so the
 * local Native Mode page keeps rows byte-for-byte identical to stock DSH.
 *
 * @module dsh-multi-device/client/SessionRowDeviceMarker
 */
import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
type Translate = (key: MultiDeviceLocaleKey) => string;
export declare function SessionRowDeviceMarker({ sessionId, t, }: {
    readonly sessionId: string;
    readonly t: Translate;
}): React.ReactElement | null;
export {};

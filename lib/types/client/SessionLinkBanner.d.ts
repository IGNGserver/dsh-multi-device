/**
 * Session-link repair banner.
 *
 * Rendered in `shell.overlay` so it is visible even when the symptom it
 * describes — aggregated Workspaces expanded but empty — means no conversation
 * is open at all. It reports how many referenced Sessions have no summary in
 * the browser store (the "expanded but empty" root cause), whether the repair
 * loop is still in its fast backoff or already retrying persistently, and
 * offers a manual repair (a `sessions.refresh()`, which the Host patches to
 * merge every device).
 *
 * @module dsh-multi-device/client/SessionLinkBanner
 */
import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
type Translate = (key: MultiDeviceLocaleKey) => string;
export declare function SessionLinkBanner({ t, onOpenSettings, }: {
    readonly t: Translate;
    readonly onOpenSettings: () => void;
}): React.ReactElement | null;
export {};

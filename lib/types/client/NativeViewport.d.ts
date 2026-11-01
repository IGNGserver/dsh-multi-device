/**
 * Native Mode Keep-Alive Viewport (`NativeViewport`).
 *
 * Loads the complete DSH Web UI of any configured remote device inside DSH Desktop / Web,
 * preserving the remote device's DSH version, theme, installed plugins, and live WebSocket state.
 *
 * Keep-Alive Mechanism:
 * - Every device in `keepAliveDeviceIds` stays mounted in the DOM simultaneously.
 * - Inactive devices or backgrounded Native Mode use `display: none` + `visibility: hidden`
 *   instead of unmounting, so switching between devices or toggling between Aggregated Mode
 *   and Native Mode takes 0ms and never drops active conversations or composer drafts.
 * - Supports Electron Desktop's `<webview>` guest bridge (`globalThis.dshDesktop?.browser`)
 *   as well as standard `<iframe>` pointed at the pre-authenticated local `nativeProxyUrl`.
 *
 * @module dsh-multi-device/client/NativeViewport
 */
import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
export declare function NativeViewport({ t, embedded, onOpenSettings, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    embedded?: boolean;
    onOpenSettings?: () => void;
}): React.ReactElement;

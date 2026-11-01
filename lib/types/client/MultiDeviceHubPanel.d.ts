/**
 * Multi-Device Management & Git Aggregation Hub Panel (`MultiDeviceHubPanel`).
 *
 * Used both as a dedicated main panel (`multi-device-hub`) and inside
 * Settings → Built-in plugins (`settings.plugins.tab`).
 *
 * Provides three tabs:
 * 1. Devices & SSH Connections (with `~/.ssh/config` one-click host import, SSH tunnel / HTTP(S)
 *    direct configuration, persistent token/cookie/auto-SSH auth, and live connection test).
 * 2. Git Workspace Aggregation (toggle `autoGitAggregate`, inspect merged Logical Workspaces,
 *    pick preferred device for "+ New Session", split/restore workspaces, and create custom
 *    manual aggregation rules).
 * 3. Native Viewport (embedded Keep-Alive remote DSH Web UI with 1-click fullscreen toggle).
 *
 * @module dsh-multi-device/client/MultiDeviceHubPanel
 */
import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
import { type HubTabId } from './state.ts';
export declare function MultiDeviceHubPanel({ t, defaultTab, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    defaultTab?: HubTabId;
}): React.ReactElement;

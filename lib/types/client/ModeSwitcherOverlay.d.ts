import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
export declare function ModeSwitcherOverlay({ t, onOpenSettings, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    onOpenSettings: () => void;
}): React.ReactElement;
/** Leading badge inside the 16px idle slot of a remote Session row (`sidebar.session.row.leading`). */
export declare function SessionRowLeadingBadge({ sessionId }: {
    sessionId: string;
}): React.ReactElement | null;
/** Device & Git repo metadata inside the Session row HoverCard (`sidebar.session.row.hover`). */
export declare function SessionRowHoverDeviceSection({ sessionId, t, }: {
    sessionId: string;
    t: (key: MultiDeviceLocaleKey) => string;
}): React.ReactElement | null;
/** Context menu item in a Session's `...` menu (`sidebar.workspaces.session.menu.item`). */
export declare function SessionMenuOpenInNativeItem({ sessionId, useMenuOpenState, t, }: {
    sessionId: string;
    useMenuOpenState: () => readonly [boolean, (open: boolean) => void];
    t: (key: MultiDeviceLocaleKey) => string;
}): React.ReactElement | null;

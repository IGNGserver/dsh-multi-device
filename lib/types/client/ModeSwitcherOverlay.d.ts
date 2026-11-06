import React from 'react';
import type { MultiDeviceLocaleKey } from './locales.ts';
export declare function ModeSwitcherOverlay({ t, onOpenSettings, }: {
    t: (key: MultiDeviceLocaleKey) => string;
    onOpenSettings: () => void;
}): React.ReactElement;
/**
 * Report the Session currently rendered in the conversation pane. Mounted in
 * `conversation.input.right` because that Session-scoped slot also renders for
 * a brand-new blank Session, where the header chrome is hidden.
 */
export declare function ActiveSessionReporter({ sessionId, onScopeReported, }: {
    sessionId: string;
    onScopeReported?: () => void;
}): null;
/** Device & Git repo metadata inside the Session row HoverCard (`sidebar.session.row.hover`). */
export declare function SessionRowHoverDeviceSection({ sessionId, t, }: {
    sessionId: string;
    t: (key: MultiDeviceLocaleKey) => string;
}): React.ReactElement | null;

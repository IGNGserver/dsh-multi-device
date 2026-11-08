/** Minimal Session-list summary the device UI reads. */
export interface SessionSummaryLike {
    readonly cwd?: string;
    readonly blank?: boolean;
    /** Durable log-backed title, absent until the host projects one. */
    readonly title?: string;
    /** Human-facing label: durable title, project basename, then the id. */
    readonly displayTitle?: string;
    readonly projectionValues?: Readonly<Record<string, unknown>>;
    /** Local ownership counts; the main view is the Session on screen. */
    readonly retainedBy?: {
        readonly mainView?: number;
    };
}
export interface SessionsListSnapshotLike {
    readonly ids: readonly string[];
    readonly byId: Readonly<Record<string, SessionSummaryLike | undefined>>;
}
export interface SessionsServiceLike {
    readonly list: {
        getSnapshot(): SessionsListSnapshotLike;
        subscribe?(listener: () => void): () => void;
    };
    refresh?(): Promise<void>;
}
/** The `uiWorkspace` operations used by the device picker. */
export interface UiWorkspaceServiceLike {
    openSession(sessionId: string): void;
    startSession?(workspaceId?: string): void;
}
export interface BoundClientServices {
    readonly sessions?: SessionsServiceLike;
    readonly uiWorkspace?: UiWorkspaceServiceLike;
    readonly revealMain?: () => void;
}
/** Publish the injected services; returns a disposer that clears them. */
export declare function bindClientServices(next: BoundClientServices): () => void;
export declare function getClientServices(): BoundClientServices;
/** Read the current Session's catalog summary, re-rendering on list updates. */
export declare function useSessionSummary(sessionId: string | undefined): SessionSummaryLike | undefined;
/**
 * Subscribe to the whole Session-list snapshot.
 *
 * Attention menus resolve a title for every row at once, so they need the map
 * rather than one row. Hooks cannot be called per row, so the component holds
 * this one subscription and passes a plain lookup into the join.
 */
export declare function useSessionListSnapshot(): SessionsListSnapshotLike | undefined;

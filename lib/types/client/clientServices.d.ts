/** Minimal Session-list summary the device UI reads. */
export interface SessionSummaryLike {
    readonly cwd?: string;
    readonly blank?: boolean;
    readonly projectionValues?: Readonly<Record<string, unknown>>;
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
}
/** Publish the injected services; returns a disposer that clears them. */
export declare function bindClientServices(next: BoundClientServices): () => void;
export declare function getClientServices(): BoundClientServices;
/** Read the current Session's catalog summary, re-rendering on list updates. */
export declare function useSessionSummary(sessionId: string | undefined): SessionSummaryLike | undefined;

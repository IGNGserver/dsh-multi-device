import { type DeviceAuthState, type DeviceCatalogCache, type DeviceConfig, type DeviceConnectionState, type DeviceId, type DeviceView, type PendingInteractionKind } from '../contract.ts';
import { DeviceAuthManager } from './auth.ts';
/** Map a remote waterfall event name (and payload) to the pending kind shown in the UI. */
export declare function pendingInteractionKind(event: string, request?: Record<string, unknown>): PendingInteractionKind | undefined;
export interface RemoteSessionSummary {
    readonly sessionId: string;
    readonly updatedAt: number;
    readonly agentAvailable: boolean;
    readonly running: boolean;
    readonly blank: boolean;
    readonly parentSessionId?: string;
    readonly origin?: 'subagent';
    readonly cwd?: string;
    readonly projections?: {
        readonly kind: 'cached' | 'sequenced';
        readonly asOfSeq: number;
        readonly values: Record<string, unknown>;
    };
}
export interface RemoteWorkspaceItem {
    readonly workspaceId: string;
    readonly path: string;
    readonly title: string;
    readonly sessionIds: readonly string[];
    readonly createdAt: string;
    readonly updatedAt: string;
}
export interface RemotePendingInteraction {
    readonly eventId: string;
    readonly namespacedEventId: string;
    readonly deviceId: DeviceId;
    readonly rawSessionId: string;
    readonly namespacedSessionId: string;
    readonly kind: PendingInteractionKind;
    readonly eventName: string;
    readonly request: Record<string, unknown>;
}
export interface RemoteDeviceCallbacks {
    readonly onStateChanged: (deviceId: DeviceId) => void;
    readonly onRemoteEventFrame: (deviceId: DeviceId, frame: {
        type: 'emit';
        event: string;
        args: unknown[];
    } | {
        type: 'waterfall';
        event: string;
        eventId: string;
        agentId: string;
        request: Record<string, unknown>;
    } | {
        type: 'cancel';
        eventId: string;
    }) => void;
    readonly onControlProjectionFrame: (deviceId: DeviceId, frame: {
        sessionId: string;
        key: string;
        value: unknown;
        seq: number;
    }) => void;
    readonly onWorkspacesChanged: (deviceId: DeviceId) => void;
    readonly onGitRemotesDiscovered: (deviceId: DeviceId, remotesByPath: ReadonlyMap<string, string>) => void;
    /** The device's model list changed (or it just connected); refresh the picker. */
    readonly onModelCatalogChanged: (deviceId: DeviceId) => void;
    /** Optional auth-state callback so 401/403 on control/RPC surfaces in the UI. */
    readonly onAuthState?: (deviceId: DeviceId, state: DeviceAuthState, error?: string) => void;
}
export declare class RemoteDeviceClient {
    private readonly authManager;
    private readonly callbacks;
    private config;
    private tunnel;
    private state;
    private protocolVersion;
    /** 0.1 has no live stream. The UI uses this to show a list-only device. */
    private realtime;
    private remoteDshVersion;
    private remoteHome;
    private latencyMs;
    private connectedAt;
    private lastError;
    private reconnectAttempt;
    private nativeProxyUrl;
    /** Epoch ms of the last successful catalog sync (live or hydrated from disk). */
    private lastSyncedAt;
    /** True while the catalog rows predate a live baseline (hydrated cache). */
    private catalogStale;
    private summaries;
    private workspaces;
    private archivedSessionIds;
    private pinnedSessionIds;
    private readonly projectionsBySession;
    private readonly pendingInteractions;
    private readonly discoveredGitPaths;
    private readonly gitProbeAttemptedAt;
    private remoteEventsClientId;
    private muxSocket;
    private readonly muxStreams;
    private running;
    private loopAbort;
    private iterationAbort;
    constructor(config: DeviceConfig, authManager: DeviceAuthManager, callbacks: RemoteDeviceCallbacks);
    get id(): DeviceId;
    get deviceConfig(): DeviceConfig;
    setNativeProxyUrl(url: string | undefined): void;
    effectiveBaseUrl(): string | undefined;
    targetSummary(): string;
    toView(): DeviceView;
    /** Current lifecycle state, read through a getter so callers never narrow a stale value. */
    get connectionState(): DeviceConnectionState;
    /** True while this device has a live baseline and can answer RPCs. */
    isConnected(): boolean;
    /**
     * Seed the in-memory catalog from the persisted cache before the first
     * connection attempt, so an offline device keeps its sidebar rows after a
     * Host restart. A later live baseline replaces everything.
     */
    hydrateCatalog(cache: DeviceCatalogCache | undefined): void;
    /** Durable mirror of the current catalog; projections and secrets stay out. */
    catalogSnapshot(): DeviceCatalogCache;
    /**
     * Wait until the device reaches `connected`, for a Session that is opened
     * while the tunnel is still coming up. Polling keeps this free of extra
     * listener lifecycles; the wait is bounded by the caller's timeout.
     */
    waitForConnected(signal: AbortSignal, timeoutMs: number): Promise<boolean>;
    sessionSummaries(): readonly RemoteSessionSummary[];
    workspaceItems(): readonly RemoteWorkspaceItem[];
    archivedIds(): readonly string[];
    setArchivedIds(ids: readonly string[]): void;
    pinnedIds(): readonly string[];
    setPinnedIds(ids: readonly string[]): void;
    /**
     * Refresh the remote `session/list` catalog and notify local `$events`
     * listeners of any newly created or updated remote Sessions.
     */
    refreshSessionCatalog(signal?: AbortSignal): Promise<void>;
    controlProjections(): ReadonlyMap<string, {
        asOfSeq: number;
        values: Record<string, unknown>;
    }>;
    pendingInteractionList(): readonly RemotePendingInteraction[];
    start(): void;
    stop(): void;
    /**
     * A transport generation ended. The last catalog remains visible, but a
     * Session that was running cannot still be running on an unreachable Host:
     * report the transition so the sidebar spinner stops and completion becomes
     * detectable. Pending waterfalls are cancelled in the local UI but kept so a
     * reconnect can replay them (the remote may still be waiting for an answer).
     */
    private markDisconnected;
    /** Drop every pending waterfall and close its local card (device removed/disabled). */
    private clearPendingInteractions;
    /** Re-deliver still-pending waterfalls after the `$events` stream comes back. */
    private replayPendingInteractions;
    updateConfig(next: DeviceConfig): void;
    reconnectNow(): void;
    /**
     * Invoke a DSH 0.2 unary endpoint (`<namespace>/<method>`) on the remote device,
     * automatically adapting to DSH 0.1 if the remote runs 0.1.x.
     */
    invokeUnary(namespace: string, method: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
    /**
     * Open a logical stream (`session/follow`, etc.) over the remote device's `/api/remote.mux`.
     */
    openStream(endpoint: string, args: Record<string, unknown>, signal: AbortSignal): AsyncIterable<unknown>;
    /**
     * Deliver the user's answer for a remote `$events` waterfall (`approval/request` or `user-questions/request`).
     */
    respondWaterfall(remoteEventId: string, outcome: {
        readonly kind: 'next';
    } | {
        readonly kind: 'result';
        readonly value?: unknown;
    } | {
        readonly kind: 'rejected';
        readonly error: {
            readonly name: string;
            readonly message: string;
            readonly code?: string;
            readonly details?: unknown;
        };
    }, signal?: AbortSignal): Promise<{
        ok: boolean;
        error?: string;
    }>;
    private superviseLoop;
    private ensureTransportUp;
    private handshakeAndLoadInitial;
    private runProtocol02Streams;
    private pump02RemoteEvents;
    private handle02EmitEvent;
    private sanitizeRemoteWorkspace;
    private pump02WorkspaceFollow;
    private pump02SessionControl;
    /**
     * Read `remote.origin.url` for workspaces that are already registered on this
     * device, so devices that both registered the same repository keep grouping.
     *
     * This is deliberately not a filesystem scan and it never registers anything:
     * only the paths DSH already lists are read. Discovering projects that exist
     * on disk but are not registered happens solely in the manual Git match.
     */
    private refreshRegisteredWorkspaceOrigins;
    private refreshLegacy01Lists;
    private runProtocol01Polling;
    private invokeLegacy01;
    private openLegacy01SessionFollow;
    /**
     * Push the initial/reconnected session list into the browser's Session store.
     *
     * DSH fetches `session.list` once per connection and then relies exclusively
     * on `api-session/added` / `api-session/removed` events. A remote device that
     * finishes its SSH handshake after that initial fetch would otherwise keep
     * its Sessions invisible even though `workspace/follow` already lists their
     * ids; the sidebar silently skips ids with no summary.
     */
    private reconcileSessionSummaries;
    namespaceProjectionValue(key: string, value: unknown): unknown;
    namespaceProjectionValues(values: Record<string, unknown>): Record<string, unknown>;
    namespaceSummary(summary: RemoteSessionSummary): RemoteSessionSummary;
    private closeMuxSocket;
    private rawRpcPost;
}
/** Major generation of a DSH version string. `0.1.x` is list-only. */
export declare function protocolGeneration(version: string | undefined): '0.2' | '0.1' | 'unknown';
/**
 * A body is 0.2 only when it says so. An `items` array alone is shared with
 * 0.1 list responses and must not promote the device to the live protocol.
 */
export declare function classifyRemoteProtocol(value: unknown): '0.2' | '0.1' | 'unknown';
/**
 * Decide the protocol from the two probes.
 * `session/list` without a version stays 0.2 unless `host.describe` says 0.1.
 * An `items` array on its own is not enough when the legacy probe disagrees.
 */
export declare function resolveProbedProtocol(sessionListValue: unknown, hostDescribeValue: unknown): {
    protocol: '0.2' | '0.1';
    version?: string;
} | undefined;

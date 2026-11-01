import { type DeviceConfig, type DeviceId, type DeviceView } from '../contract.ts';
import { DeviceAuthManager } from './auth.ts';
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
    readonly kind: 'approval' | 'question';
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
}
export declare class RemoteDeviceClient {
    private readonly authManager;
    private readonly callbacks;
    private config;
    private tunnel;
    private state;
    private protocolVersion;
    private remoteDshVersion;
    private remoteHome;
    private latencyMs;
    private connectedAt;
    private lastError;
    private reconnectAttempt;
    private nativeProxyUrl;
    private summaries;
    private workspaces;
    private archivedSessionIds;
    private pinnedSessionIds;
    private readonly projectionsBySession;
    private readonly pendingInteractions;
    private readonly discoveredGitPaths;
    private remoteEventsClientId;
    private muxSocket;
    private readonly muxStreams;
    private running;
    private loopAbort;
    constructor(config: DeviceConfig, authManager: DeviceAuthManager, callbacks: RemoteDeviceCallbacks);
    get id(): DeviceId;
    get deviceConfig(): DeviceConfig;
    setNativeProxyUrl(url: string | undefined): void;
    effectiveBaseUrl(): string | undefined;
    targetSummary(): string;
    toView(): DeviceView;
    sessionSummaries(): readonly RemoteSessionSummary[];
    workspaceItems(): readonly RemoteWorkspaceItem[];
    archivedIds(): readonly string[];
    pinnedIds(): readonly string[];
    controlProjections(): ReadonlyMap<string, {
        asOfSeq: number;
        values: Record<string, unknown>;
    }>;
    pendingInteractionList(): readonly RemotePendingInteraction[];
    start(): void;
    stop(): void;
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
    private pump02WorkspaceFollow;
    private pump02SessionControl;
    private probeNewWorkspaceGitRemotes;
    private refreshLegacy01Lists;
    private runProtocol01Polling;
    private invokeLegacy01;
    private openLegacy01SessionFollow;
    namespaceSummary(summary: RemoteSessionSummary): RemoteSessionSummary;
    private closeMuxSocket;
    private rawRpcPost;
}

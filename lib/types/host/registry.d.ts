import { type DeviceConfig, DeviceId, type DeviceView, type MultiDeviceSnapshot, type RemoteSessionCreateInput, type RemoteWorkspaceCreateInput, type SshKeyEntry, type UpsertDeviceInput, type WorkspaceAggregationConfig } from '../contract.ts';
import { DeviceAuthManager } from './auth.ts';
import { type PhysicalWorkspaceInput, WorkspaceAggregator } from './git-aggregator.ts';
import { NativeProxyManager } from './native-proxy.ts';
import { RemoteDeviceClient } from './remote-client.ts';
/**
 * The SSH tunnel can be up while DSH itself still rejects the HTTP call.
 * Say so, instead of pointing the user at the private key.
 */
export declare function describeProbeFailure(status: number | undefined, input: UpsertDeviceInput): string;
export interface LocalHostProvider {
    /** Local webserver port, used for self-loop prevention. */
    readonly localPort: () => number | undefined;
    /** Read current local workspaces from `ctx.workspaceRegistry`. */
    readonly localWorkspaces: () => PhysicalWorkspaceInput[];
    /** Read current local session summaries. */
    readonly localSessionUpdatedAt: () => Map<string, number>;
}
export declare class DeviceRegistry {
    private readonly dataFilePath;
    private readonly localHost;
    private readonly options;
    readonly authManager: DeviceAuthManager;
    readonly nativeProxyManager: NativeProxyManager;
    readonly aggregator: WorkspaceAggregator;
    private readonly configs;
    private readonly clients;
    private readonly listeners;
    private readonly eventListeners;
    private readonly projectionListeners;
    private readonly workspaceListeners;
    private revision;
    private aggregatedGatewayActive;
    private aggregatedGatewayError;
    private nativeProxyActive;
    constructor(dataFilePath: string, secretsFilePath: string, localHost: LocalHostProvider, options?: {
        enableTunnels?: boolean;
        enableNativeProxy?: boolean;
        localOrigin?: () => string | undefined;
        allowDirectTransport?: boolean;
    });
    setGatewayStatus(active: boolean, error?: string): void;
    onSnapshotChanged(listener: () => void): () => void;
    onRemoteEvent(listener: (deviceId: DeviceId, frame: {
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
    }) => void): () => void;
    onControlProjection(listener: (deviceId: DeviceId, frame: {
        sessionId: string;
        key: string;
        value: unknown;
        seq: number;
    }) => void): () => void;
    onWorkspacesChanged(listener: () => void): () => void;
    startAll(): void;
    dispose(): void;
    client(deviceId: DeviceId): RemoteDeviceClient | undefined;
    clientList(): RemoteDeviceClient[];
    deviceConfig(deviceId: DeviceId): DeviceConfig | undefined;
    /** Add or update a device configuration, preventing self-loops. */
    upsertDevice(input: UpsertDeviceInput): Promise<{
        ok: true;
        device: DeviceView;
    } | {
        ok: false;
        error: string;
    }>;
    removeDevice(deviceId: DeviceId): boolean;
    reconnectDevice(deviceId: DeviceId): boolean;
    /** List local private-key candidates for the add/edit device form. */
    listSshKeys(): SshKeyEntry[];
    /**
     * Create a Session directly on an explicitly chosen remote device. The
     * returned ID is namespaced exactly like a Session discovered by polling, so
     * the official Session view can open it immediately.
     */
    createRemoteSession(input: RemoteSessionCreateInput): Promise<{
        ok: true;
        sessionId: string;
        agentPreset?: string;
    } | {
        ok: false;
        error: string;
    }>;
    /** Register one folder as a Workspace on a remote device. */
    createRemoteWorkspace(input: RemoteWorkspaceCreateInput): Promise<{
        ok: true;
        workspace: unknown;
    } | {
        ok: false;
        error: string;
    }>;
    /** Test reachability & authentication of a candidate device without saving it. */
    testDeviceConnection(input: UpsertDeviceInput): Promise<{
        ok: true;
        protocolVersion: string;
        remoteDshVersion?: string;
        latencyMs: number;
    } | {
        ok: false;
        error: string;
    }>;
    updateAggregationConfig(patch: Partial<WorkspaceAggregationConfig>): WorkspaceAggregationConfig;
    /** Build the complete snapshot for the Client UI and Aggregated Gateway. */
    snapshot(): MultiDeviceSnapshot;
    /** Resolve which remote client owns a given namespaced session ID. */
    resolveSessionOwner(sessionId: string): {
        client: RemoteDeviceClient;
        rawSessionId: string;
    } | undefined;
    private hydrateConfig;
    private mountClient;
    private isSelfLoop;
    private bumpRevision;
    private notifyWorkspacesChanged;
    private loadFromDisk;
    saveToDisk(): void;
}

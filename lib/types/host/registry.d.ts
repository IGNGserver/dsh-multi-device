import { type DeviceAuthState, type DeviceCatalogCache, type DeviceConfig, DeviceId, type DeviceView, type DisplayMode, type GitMatchRun, type MultiDeviceSnapshot, type MultiDeviceUiPreferences, type RemoteSessionCreateInput, type RemoteWorkspaceCreateInput, type SshKeyEntry, type UpsertDeviceInput, type WorkspaceAggregationConfig } from '../contract.ts';
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
    /**
     * Local archived Session IDs (`ctx.workspaceRegistry.archivedSessionIds`).
     * Optional so registries built by older callers and tests keep working;
     * a missing provider simply means "no local Session is archived".
     */
    readonly localArchivedSessionIds?: () => readonly string[];
    /**
     * Local subagent-origin Session IDs (`session.header.origin === 'subagent'`).
     * DSH renders these under their parent, never as standalone sidebar rows.
     */
    readonly localSubagentSessionIds?: () => readonly string[];
}
/**
 * The model-catalog scope for the Session currently shown in the conversation
 * pane. A remote Session must use only its owner's catalog; there is no local
 * fallback because that would offer models the remote Agent cannot run.
 */
export type ActiveSessionScope = {
    readonly kind: 'local';
} | {
    readonly kind: 'remote';
    readonly deviceId: DeviceId;
    readonly deviceName: string;
    readonly client: RemoteDeviceClient | undefined;
};
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
    private readonly modelCatalogListeners;
    private readonly modeListeners;
    private activeSessionSeq;
    private activeSessionClientId;
    private activeSessionIsRemote;
    private activeSessionDeviceId;
    private activeSessionId;
    /** The one framed device currently rendered as the aggregated pane. */
    private paneEmbeddedDeviceId;
    private revision;
    private displayMode;
    private gitMatchRunner;
    private gitMatchRun;
    private localWorkspaceCreator;
    private localSessionCreator;
    private aggregatedGatewayActive;
    private aggregatedGatewayError;
    private nativeProxyActive;
    private readonly authStates;
    /** Durable mirror of each device catalog (see {@link DeviceCatalogCache}). */
    private readonly catalogs;
    /** Injected Native Pane bridge lifecycle, last page selection/title, and visibility per device. */
    private readonly nativePanes;
    /** Previous connection state per device, so workspace rows are recomputed on a real transition. */
    private readonly lastDeviceStates;
    /** Host-owned fold state per device, restored into the framed page before its first render. */
    private readonly nativeGroups;
    /** Host-owned read/unread state for namespaced remote Sessions. */
    private readonly readTracker;
    /** Stable Host identity (used by the optional cross-Host state file). */
    private hostId;
    private uiPreferences;
    private catalogPersistTimer;
    private persistTimer;
    /** Optional cross-Host read-state polling and per-device push debounce. */
    private sharedReadStateTimer;
    private readonly sharedReadStateInFlight;
    private readonly sharedReadStateInitialized;
    private readonly sharedReadStatePushTimers;
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
    /**
     * Subscribe to model-catalog scope changes. The Host re-emits DSH's
     * `llm/adapters-updated` event so the browser's shared model picker drops its
     * cached catalog and asks `session/modelCatalog` again.
     */
    onModelCatalogChanged(listener: () => void): () => void;
    /**
     * Record the Session currently rendered on the right. `requestSeq` is
     * client-monotonic so out-of-order control-plane HTTP requests cannot move
     * the scope back to a previously selected Session.
     */
    setActiveSession(sessionId: string | undefined, requestSeq?: number, clientId?: string): boolean;
    /**
     * Clear one remote Session's unread marker. Returns true when this call
     * actually removed a marker, so callers can distinguish a real transition
     * from a redundant read touch.
     */
    markSessionRead(sessionId: string): boolean;
    /** Local DSH session status, observed through this Host's own event bus. */
    observeLocalSessionStatus(sessionId: string, running: boolean): void;
    /** Persisted fold state for one device; the bridge injection uses this map. */
    nativeGroupState(deviceId: DeviceId): Readonly<Record<string, boolean>> | undefined;
    /**
     * Accept a fold-state report from a framed page. This is deliberately not
     * part of the UI snapshot: only the device's bridge needs it, and routing it
     * through revisions would re-render every sidebar row on each fold click.
     */
    private setNativeGroupState;
    /** Raw remote Session IDs that are unread on one device. */
    private unreadForDevice;
    /** Push the new unread set to the owning device's framed page. */
    private publishUnreadState;
    /**
     * Reconcile running flags from the authoritative list. DSH can miss a
     * `api-session/status` frame across a stream gap; the list refresh still
     * carries the final flag, and a live `true -> false` there is a completion
     * for the same reason a stream event is.
     */
    private isCurrentlyViewedSession;
    private reconcileRunningForDevice;
    /** Observe one remote event before it is forwarded to the local mirror. */
    private observeRemoteFrame;
    /**
     * Optional cross-Host sync. The state file lives in the remote DSH home and
     * is written only over an existing SSH transport; direct-only devices and
     * Windows remote homes are skipped rather than guessed at.
     */
    /** Seed the transition baseline from a cached catalog without marking it unread. */
    private seedRunningFromCatalog;
    /** One pull+push per connection once the remote home is known. */
    private maybeInitializeSharedReadState;
    private sharedReadStateTarget;
    private scheduleSharedReadStatePush;
    /** Read the remote file and merge every Host's Session entries locally. */
    private pullSharedReadState;
    /**
     * Read-merge-write one Host section. Preserving the other sections is what
     * makes several Hosts converge; the write only happens after a successful
     * read so an unreachable file cannot clobber another machine's reminders.
     */
    private pushSharedReadState;
    private mergeSharedReadDocument;
    /** Start/stop the 30s remote scan when the preference changes. */
    private syncSharedReadStateTimer;
    private schedulePersist;
    /**
     * Keep exactly one device frame in embedded mode (remote sidebar hidden) and
     * restore every other frame's sidebar for full native rendering.
     */
    private syncNativePaneEmbedding;
    /**
     * Ask the framed page of the active remote device to show the selected
     * Session. Called on every selection and when a bridge becomes ready; the
     * proxy queues the command until then, so an iframe that is still loading
     * still lands on the right conversation.
     */
    private publishNativePaneSession;
    /** Ask the native frame on the active remote Session's device to open it. */
    private openActiveRemoteSessionInNative;
    private setNativePaneState;
    private setNativePaneSelection;
    /** Persist the framed page's own document title for window chrome. */
    private setNativePaneTitle;
    /**
     * Track whether any framed page for this device is actually on screen.
     * Read clearing and "currently viewed" detection must not treat a hidden
     * keep-alive page as if the user were reading it.
     */
    private setNativePaneVisibility;
    /** Persist the actually-bound native proxy port so the origin stays stable. */
    private persistNativeProxyPort;
    private withNativePane;
    /** Scope `session/modelCatalog` to the Session currently shown on the right. */
    activeSessionScope(): ActiveSessionScope;
    private notifyModelCatalogChanged;
    onDisplayModeChanged(listener: (mode: DisplayMode) => void): () => void;
    /** Host-authoritative UI mode. Defaults to aggregated for existing installs. */
    getDisplayMode(): DisplayMode;
    /** Aggregated mode is the only mode that may merge or route remote data. */
    isAggregatedMode(): boolean;
    /**
     * Persist and publish a mode change. The workspace stream recomputes its
     * snapshot immediately, so already-connected clients receive remove/upsert
     * frames for the rows that just became invisible (or visible again).
     */
    setDisplayMode(mode: DisplayMode): void;
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
    /** Current native-mode credential state for one device. */
    authStateOf(deviceId: DeviceId): DeviceAuthState;
    private setAuthState;
    private withAuthState;
    /**
     * Re-authenticate one device on user request. An explicit credential (launch
     * URL/token) replaces the stored one; otherwise the SSH bootstrap path runs
     * again. Always forces a fresh cookie so a rotated remote secret recovers.
     */
    authenticateDevice(deviceId: DeviceId, credential?: string): Promise<{
        ok: true;
        authState: DeviceAuthState;
    } | {
        ok: false;
        error: string;
    }>;
    /** List local private-key candidates for the add/edit device form. */
    listSshKeys(): SshKeyEntry[];
    /**
     * Create the next blank Session of a logical workspace on one chosen device.
     *
     * A device that already owns the workspace is only recorded as the preferred
     * target; DSH's own `startSession` then creates through the aggregated
     * gateway. A device without the workspace gets the workspace path registered
     * there first (nothing is copied), and the new Session is created against
     * that registration directly.
     */
    startSessionOnDevice(logicalWorkspaceId: string, deviceId: DeviceId): Promise<{
        ok: true;
        mode: 'member' | 'registered';
        sessionId?: string;
    } | {
        ok: false;
        error: string;
    }>;
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
    /** Wire the local Workspace controller so a match can register local folders. */
    setLocalWorkspaceCreator(creator: (path: string) => Promise<void>): void;
    /**
     * Wire local Session creation for a device that does not own the workspace
     * yet. Registering the folder is not enough: the logical workspace id still
     * points at the previous device until aggregation recomputes.
     */
    setLocalSessionCreator(creator: (cwd: string) => Promise<string>): void;
    /** Latest manual Git match state (running progress or the last outcome). */
    gitMatch(): GitMatchRun;
    /**
     * Start the manual Git match run. This is the only trigger: nothing in the
     * device/session streams starts a scan or registers a workspace.
     */
    startGitMatch(): {
        ok: true;
    } | {
        ok: false;
        error: string;
    };
    /** Ask the running manual Git match to stop. */
    cancelGitMatch(): boolean;
    private gitMatchTargets;
    private discoverRemoteOrigins;
    private scanRemoteRepos;
    /**
     * Local archived Session IDs. A missing provider (older callers, tests that
     * do not care) or a stale controller simply means "nothing archived", so a
     * read failure must never break the whole snapshot.
     */
    private localArchivedIds;
    /** Local subagent-origin Session IDs; same failure policy as {@link localArchivedIds}. */
    private localSubagentIds;
    /** Build the complete snapshot for the Client UI and Aggregated Gateway. */
    snapshot(): MultiDeviceSnapshot;
    /** Persisted display preferences (Snapshot also carries them under `ui`). */
    ui(): MultiDeviceUiPreferences;
    /** Update and persist display preferences; unknown keys are ignored by the type. */
    updateUiPreferences(patch: Partial<MultiDeviceUiPreferences>): MultiDeviceUiPreferences;
    /**
     * Wait for a device to become reachable, bounded by `timeoutMs`.
     *
     * The local machine is always reachable; an unconfigured or disabled device
     * answers false immediately. Callers use this before opening a Session so a
     * tunnel that is still coming back up does not surface as a transport error.
     */
    waitForDeviceConnected(deviceId: DeviceId, signal: AbortSignal, timeoutMs: number): Promise<boolean>;
    /** Resolve which remote client owns a given namespaced session ID. */
    resolveSessionOwner(sessionId: string): {
        client: RemoteDeviceClient;
        rawSessionId: string;
    } | undefined;
    private hydrateConfig;
    private mountClient;
    private isSelfLoop;
    /**
     * Publish a workspace-set change made directly through the aggregator
     * (a logical-workspace split, an external organizer, ...). Workspace
     * consumers derive both data and visibility from the registry snapshot, so
     * they must be woken even when no platform controller method ran.
     */
    refreshWorkspaceView(): void;
    private bumpRevision;
    private notifyWorkspacesChanged;
    private loadFromDisk;
    /** Persisted catalog of one device (hydrated cache or the last capture). */
    deviceCatalog(deviceId: DeviceId): DeviceCatalogCache | undefined;
    /**
     * Replace the persisted catalog of one device. Used for hydration and by
     * tests; live clients are captured through {@link scheduleCatalogPersist}.
     */
    setDeviceCatalog(cache: DeviceCatalogCache): void;
    /**
     * Capture every live client's catalog and write it to disk. Debounced: the
     * session/workspace streams can burst many changes per turn, and the file is
     * rewritten atomically on each save.
     */
    private scheduleCatalogPersist;
    /** Copy each client's current catalog into the durable map. */
    private flushCatalogCache;
    saveToDisk(): void;
}

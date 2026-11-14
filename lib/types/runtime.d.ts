/**
 * Host Control-Plane HTTP & RPC Endpoints (`MultiDeviceControlPlane`).
 *
 * Exposes device management, SSH config discovery, connection testing and the
 * device-tab attention state over:
 * 1. Direct authenticated HTTP JSON route `/multi-device/api` (plus SSE `/multi-device/events`),
 *    with zero dependency on Typert reflection.
 * 2. Optional Typert Remote registration (`multiDevice/*`) when `ctx.typert` is present.
 *
 * @module dsh-multi-device/runtime
 */
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import type { DeviceView, MultiDeviceSnapshot } from './contract.ts';
import type { DeviceRegistry } from './host/registry.ts';
export declare const MULTI_DEVICE_API_PATH = "/multi-device/api";
export declare const MULTI_DEVICE_EVENTS_PATH = "/multi-device/events";
/** True when the Host header is this machine's loopback, including `[::1]`. */
export declare function isLoopbackHostHeader(hostHeader: string | undefined): boolean;
/**
 * Admit a control-plane request only from loopback, and only when Origin
 * matches that host. `extraRejection` may add a rejection; a missing hook
 * does not admit a non-loopback caller.
 */
export declare function admitControlPlaneRequest(headers: IncomingHttpHeaders, extraRejection?: (headers: IncomingHttpHeaders) => number | undefined): boolean;
/**
 * Host connection fence consulted on every control-plane request.
 *
 * The method must be invoked on the object returned by `get('connection')`.
 * Cordis wraps that service in a traceable proxy whose methods are not safe
 * to detach: a bare `reject(req)` runs with `this === undefined` and throws
 * inside `requestRejection` (`Cannot read properties of undefined (reading 'admit')`),
 * which DSH treats as a fatal load failure.
 */
export interface ConnectionRejectionService {
    requestRejection?: (request: {
        headers: IncomingHttpHeaders;
    }) => number | undefined;
}
/** Read `connection` from the plugin context. A missing service is not an error. */
export declare function readConnectionService(ctx: Context): ConnectionRejectionService | undefined;
/**
 * Ask the Host connection service whether this request is rejected.
 *
 * Re-reads the service on every call and invokes `requestRejection` as a
 * method, matching `dsh-host-open-in-app`. A missing hook admits nothing
 * extra (returns `undefined`). A throwing hook fails closed (`403`) so the
 * exception never leaves the HTTP handler.
 */
export declare function connectionRequestRejection(ctx: Context, headers: IncomingHttpHeaders): number | undefined;
/**
 * Admit one control-plane request: loopback fence first, then the Host
 * connection service. Setup failures and a throwing connection hook both
 * fail closed instead of crashing the host.
 */
export declare function admitMultiDeviceRequest(ctx: Context, req: IncomingMessage): boolean;
export interface ControlPlaneRequest {
    readonly action: 'snapshot' | 'diagnostics' | 'upsertDevice' | 'removeDevice' | 'setDeviceEnabled' | 'reconnectDevice' | 'authenticateDevice' | 'testDevice' | 'listSshKeys' | 'setActiveSession' | 'markSessionRead' | 'markDeviceRead' | 'setUiPreferences' | 'patchUiState';
    readonly payload?: Record<string, unknown>;
}
/** Validate the transport envelope before TypeScript erases its runtime types. */
export declare function parseControlPlaneRequest(value: unknown): ControlPlaneRequest;
/** Field-level runtime schemas shared by HTTP parsing and direct dispatch. */
export declare function validateControlPlanePayload(request: ControlPlaneRequest): void;
/**
 * Browser geometry the Client volunteers with a Diagnostics request. The Host
 * cannot read the viewport, but a clipped Native Mode bar is a layout fact on
 * the client side, so the report travels with the request and is echoed back.
 */
export interface DiagnosticsClientReport {
    readonly innerWidth?: number;
    readonly innerHeight?: number;
    readonly devicePixelRatio?: number;
    /** Frame-relative left edge of the Native Mode tab bar. */
    readonly barLeft?: number;
    /** Width the Host frame gives the bar — the width the bar must take. */
    readonly barWidth?: number;
    /** Width the bar actually occupies inside the viewport. */
    readonly barClampedWidth?: number;
    readonly compact?: boolean;
    /**
     * What the bar's occlusion probe found on top of the trailing controls, if
     * anything: `tag#id.class z=N`. Absent while the switch is clickable.
     */
    readonly barObstruction?: string;
    readonly userAgent?: string;
}
/** One device row of the Diagnostics report. */
export interface DiagnosticsDevice {
    readonly id: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly state: DeviceView['state'];
    readonly transportKind: DeviceView['transportKind'];
    readonly protocolVersion: DeviceView['protocolVersion'];
    readonly realtime: boolean;
    readonly remoteDshVersion?: string;
    readonly authState?: DeviceView['authState'];
    readonly sessionCount: number;
    readonly runningSessionCount: number;
    /** Raw catalog totals, including archived and subagent Sessions. */
    readonly allSessionCount: number;
    readonly allRunningSessionCount: number;
    readonly workspaceCount: number;
    readonly pendingApprovalCount: number;
    readonly catalogStale: boolean;
    readonly lastSyncedAt?: number;
    readonly lastError?: string;
    /** Why this device was dropped from the merged `session.list`, if it was. */
    readonly sessionListError?: string;
}
/** Snapshot of everything a support report needs to explain the device UI state. */
export interface MultiDeviceDiagnostics {
    readonly kind: 'dsh-multi-device/diagnostics';
    readonly generatedAt: number;
    readonly hostId: string;
    readonly counts: {
        readonly devices: number;
        readonly connectedDevices: number;
        readonly staleDevices: number;
        readonly runningSessions: number;
        /** Raw catalog total, including archived and subagent Sessions. */
        readonly allRunningSessions: number;
    };
    readonly devices: readonly DiagnosticsDevice[];
    /** Session identities and categories only; no conversation content or credentials. */
    readonly attentionByDevice?: MultiDeviceSnapshot['attentionByDevice'];
    readonly client?: DiagnosticsClientReport;
}
/** Parse the Client's Diagnostics payload; unknown fields are dropped. */
export declare function readDiagnosticsClientReport(raw: unknown): DiagnosticsClientReport | undefined;
/**
 * Build the Diagnostics report from one Host snapshot.
 *
 * Per-device staging (`state`, `catalogStale`, counts, last error) is what
 * explains a "device tab shows nothing" report.
 */
export declare function buildDiagnostics(snapshot: MultiDeviceSnapshot, client?: DiagnosticsClientReport, now?: number): MultiDeviceDiagnostics;
export declare class MultiDeviceControlPlane {
    private readonly registry;
    private readonly admitRequest?;
    private activeControlRequests;
    constructor(registry: DeviceRegistry, admitRequest?: ((req: IncomingMessage) => boolean) | undefined);
    /** Execute one control-plane action and return a JSON-serializable result envelope. */
    dispatch(request: ControlPlaneRequest, signal?: AbortSignal): Promise<{
        ok: true;
        value: unknown;
    } | {
        ok: false;
        error: string;
    }>;
    /** HTTP route handler for `POST /multi-device/api`. */
    handleApiHttp(req: IncomingMessage, res: ServerResponse): Promise<void>;
    /** SSE route handler for `GET /multi-device/events` (real-time snapshot push to Client UI). */
    handleEventsSse(req: IncomingMessage, res: ServerResponse): void;
    private isAuthorized;
}

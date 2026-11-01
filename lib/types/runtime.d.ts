/**
 * Host Control-Plane HTTP & RPC Endpoints (`MultiDeviceControlPlane`).
 *
 * Exposes all device management, SSH config discovery, connection testing,
 * and Git workspace aggregation operations over:
 * 1. Direct authenticated HTTP JSON route `/multi-device/api` (plus SSE `/multi-device/events`),
 *    which has zero dependency on Typert reflection or Aggregated Gateway state — ensuring
 *    that Native Mode and Device Management ALWAYS work even if Aggregated Mode fails!
 * 2. Optional Typert Remote registration (`multiDevice/*`) when `ctx.typert` is present.
 *
 * @module dsh-multi-device/runtime
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DeviceRegistry } from './host/registry.ts';
export declare const MULTI_DEVICE_API_PATH = "/multi-device/api";
export declare const MULTI_DEVICE_EVENTS_PATH = "/multi-device/events";
export interface ControlPlaneRequest {
    readonly action: 'snapshot' | 'upsertDevice' | 'removeDevice' | 'reconnectDevice' | 'testDevice' | 'updateAggregationConfig' | 'upsertManualRule' | 'removeManualRule' | 'setMemberExcluded' | 'setPreferredDevice' | 'setCustomTitle';
    readonly payload?: Record<string, unknown>;
}
export declare class MultiDeviceControlPlane {
    private readonly registry;
    private readonly admitRequest?;
    constructor(registry: DeviceRegistry, admitRequest?: ((req: IncomingMessage) => boolean) | undefined);
    /** Execute one control-plane action and return a JSON-serializable result envelope. */
    dispatch(request: ControlPlaneRequest): Promise<{
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

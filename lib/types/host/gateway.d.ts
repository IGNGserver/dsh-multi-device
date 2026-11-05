/**
 * Host Aggregated Mode Gateway (`AggregatedGateway`).
 *
 * Attaches reversibly via `ctx.effect()` to DSH 0.2's `sessionController`,
 * `workspaceController`, and `typertGateway` (with a DSH 0.1 `apiProxy` fallback).
 *
 * Guarantees:
 * - Zero core file modifications: all hooks are runtime service method wrappers that
 *   cleanly restore original methods when the plugin unloads or reloads (HMR).
 * - Mode Independence: if attaching to the Host controllers fails for any reason,
 *   the error is caught and reported in `registry.setGatewayStatus(false, err)` while
 *   Native Mode and the Multi-Device Hub continue operating normally.
 * - Full Session, Workspace, Projection, Approval & Question Waterfall routing across
 *   local and remote devices.
 *
 * @module dsh-multi-device/host/gateway
 */
import { type DeviceId } from '../contract.ts';
import type { PhysicalWorkspaceInput } from './git-aggregator.ts';
import type { DeviceRegistry } from './registry.ts';
export interface SessionControllerLike {
    list(_request: {
        cursor?: string;
    }, signal: AbortSignal): Promise<{
        items: readonly Record<string, unknown>[];
    }>;
    search(request: {
        query: string;
    }, signal: AbortSignal): Promise<{
        items: readonly {
            sessionId: string;
            snippet: string;
        }[];
        hasMore: boolean;
    }>;
    create(request: {
        workspaceId?: string;
        cwd?: string;
        sessionId?: string;
        agentPreset?: string;
    }): Promise<{
        sessionId: string;
        agentPreset?: string;
    }>;
    selectModel(request: {
        sessionId: string;
        provider: string;
        model: string;
        reasoningEffort?: string;
    }): Promise<{
        selected: Record<string, unknown>;
    }>;
    modelCatalog(): Promise<Record<string, unknown>>;
    rename(request: {
        sessionId: string;
        title: string;
    }): Promise<{
        title: string;
        seq: number;
    }>;
    fork(request: {
        sessionId: string;
        atSeq?: number;
    }): Promise<{
        sessionId: string;
    }>;
    prompt(request: {
        requestId: string;
        sessionId: string;
        mode: 'queue' | 'steer';
        content: readonly unknown[];
        clientTimeZone?: string;
    }, signal: AbortSignal): Promise<{
        accepted: true;
    }>;
    attachment(request: {
        sessionId: string;
        attachmentId: string;
    }): Promise<Record<string, unknown>>;
    updateQueue(request: {
        sessionId: string;
        itemId: string;
        action: Record<string, unknown>;
    }): Promise<{
        accepted: true;
    }>;
    cancel(request: {
        sessionId: string;
    }): {
        accepted: true;
    } | Promise<{
        accepted: true;
    }>;
    page(request: Record<string, unknown>, signal: AbortSignal): Promise<{
        records: readonly unknown[];
        hasMore: boolean;
    }>;
    follow(request: Record<string, unknown>, signal: AbortSignal): AsyncIterable<Record<string, unknown>>;
    projections(request: {
        sessionId: string;
    }, signal: AbortSignal): Promise<{
        asOfSeq: number;
        values: Record<string, unknown>;
    } | null>;
    control(signal: AbortSignal): AsyncIterable<Record<string, unknown>>;
    openWorkspacePath?(request: {
        path: string;
        action?: 'reveal';
        application?: string;
    }, signal: AbortSignal): Promise<{
        opened: true;
    }>;
}
export interface WorkspaceControllerLike {
    create(request: {
        path: string;
    }): Promise<{
        workspace: Record<string, unknown>;
        created: boolean;
    }>;
    rename(request: {
        workspaceId: string;
        title: string;
    }): Promise<{
        workspace: Record<string, unknown>;
    }>;
    delete(request: {
        workspaceId: string;
    }): Promise<{
        deleted: true;
    }>;
    insertBefore(request: {
        workspaceId: string;
        beforeWorkspaceId?: string;
    }): Promise<{
        workspaceIds: readonly string[];
    }>;
    insertSessionBefore(request: {
        workspaceId: string;
        sessionId: string;
        beforeSessionId?: string;
    }): Promise<{
        workspace: Record<string, unknown>;
    }>;
    archiveSession(request: {
        sessionId: string;
        stopActivity?: boolean;
    }): Promise<{
        archivedSessionIds: readonly string[];
    }>;
    unarchiveSession(request: {
        sessionId: string;
    }): Promise<{
        archivedSessionIds: readonly string[];
    }>;
    pinSession(request: {
        sessionId: string;
    }): Promise<{
        pinnedSessionIds: readonly string[];
    }>;
    unpinSession(request: {
        sessionId: string;
    }): Promise<{
        pinnedSessionIds: readonly string[];
    }>;
    follow(signal: AbortSignal): AsyncIterable<Record<string, unknown>>;
}
export interface WorkspaceRegistryLike {
    list(): readonly {
        readonly id: string;
        readonly path: string;
        readonly title: string;
        readonly sessionIds: readonly string[];
        readonly createdAt: string;
        readonly updatedAt: string;
    }[];
    readonly archivedSessionIds: readonly string[];
    readonly pinnedSessionIds: readonly string[];
}
export interface ModelCatalogLike {
    readonly default: Record<string, unknown>;
    readonly routableProviders: readonly string[];
    readonly groups: {
        readonly id: string;
        readonly name: string;
        readonly models: {
            readonly id: string;
            readonly name: string;
            readonly description?: string;
            readonly reasoning?: unknown;
        }[];
    }[];
    readonly failures: {
        readonly id: string;
        readonly name: string;
        readonly message: string;
    }[];
}
/**
 * A remote catalog can be temporarily unavailable (SSH reconnect, remote DSH
 * restart). Return a valid empty catalog with a visible failure instead of
 * falling back to local models: a remote Agent cannot run a local-only model.
 */
export declare function unavailableRemoteCatalog(deviceName: string, message: string): ModelCatalogLike;
export interface TypertGatewayLike {
    wireStream: {
        open(endpoint: string, payload: unknown, uplink: AsyncIterable<unknown>, peer: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
        failure(error: unknown): {
            code: string;
            message: string;
            details: object;
        };
    };
    dispatchRpc?(endpoint: string, payload: unknown, signal: AbortSignal, peer: unknown): Promise<{
        ok: boolean;
        value?: unknown;
        error?: {
            code: string;
            message: string;
            details: object;
        };
    }>;
}
/**
 * Extract local workspaces from `ctx.workspaceRegistry` for `DeviceRegistry`.
 */
export declare function readLocalPhysicalWorkspaces(workspaceRegistry: WorkspaceRegistryLike | undefined, localRunningSessionIds: ReadonlySet<string>): PhysicalWorkspaceInput[];
/**
 * Install the DSH 0.2 Aggregated Mode service wrappers and return a disposer
 * that restores all original methods.
 */
export declare function installAggregatedGateway02(registry: DeviceRegistry, sessionController: SessionControllerLike, workspaceController: WorkspaceControllerLike, typertGateway: TypertGatewayLike, workspaceRegistry?: WorkspaceRegistryLike): () => void;
/**
 * A subagent address may only be routed to the device that owns the parent
 * when the child is namespaced to that same device. A local or foreign child
 * id must fall back instead of being sent to the parent's remote host.
 */
export declare function isSameDeviceChildSession(parentDeviceId: DeviceId, childSessionId: string): boolean;

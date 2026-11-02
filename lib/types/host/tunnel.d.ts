import { type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { SshTransportConfig } from '../contract.ts';
import { type ResolvedSshParameters } from './ssh-config.ts';
export type TunnelState = 'connecting' | 'up' | 'error' | 'stopped';
/** Test seam. Production always uses `node:child_process` `spawn`. */
export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
/** Replace or restore the process spawner. Tests pass `null` to restore. */
export declare function setSshSpawn(spawnFn: SpawnFn | null): void;
export interface TunnelStatus {
    readonly state: TunnelState;
    readonly localPort?: number;
    readonly baseUrl?: string;
    readonly engine?: 'system-ssh' | 'ssh2';
    readonly error?: string;
    readonly attempt: number;
}
/** Allocate an ephemeral free TCP port on `127.0.0.1`. */
export declare function allocateLoopbackPort(): Promise<number>;
/** Build the CLI arguments for `ssh -N -L ...` given transport and resolved parameters. */
export declare function buildSystemSshArgs(transport: SshTransportConfig, resolved: ResolvedSshParameters, localPort: number): string[];
/**
 * Execute a quick non-interactive command on the remote host over SSH (`system-ssh` or `ssh2`).
 * Used only for read-only discovery (e.g. `.git/config` remote URLs and `.credentials.yaml` bootstrap).
 */
export declare function execSshCommand(transport: SshTransportConfig, command: string, timeoutMs?: number): Promise<{
    ok: true;
    stdout: string;
} | {
    ok: false;
    error: string;
}>;
/**
 * Managed SSH local-forward tunnel with automatic supervision and exponential backoff.
 */
export declare class SshTunnel {
    private readonly transport;
    private readonly notify;
    private state;
    private localPort;
    private activeEngine;
    private lastError;
    private stopped;
    private attempt;
    private retryTimer;
    private sshProc;
    private ssh2Conn;
    private ssh2Server;
    private readonly sockets;
    constructor(transport: SshTransportConfig, notify: () => void);
    baseUrl(): string | undefined;
    status(): TunnelStatus;
    start(): Promise<void>;
    stop(): void;
    private teardown;
    private scheduleRetry;
    private fail;
    private open;
    private openWithSystemSsh;
    private openWithSsh2;
}
/** One-shot tunnel probe for the "Test Connection" button. */
export declare function probeSshTunnel(transport: SshTransportConfig): Promise<{
    ok: true;
    baseUrl: string;
    engine: 'system-ssh' | 'ssh2';
    close: () => void;
} | {
    ok: false;
    error: string;
}>;

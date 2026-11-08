/**
 * System SSH local port-forwarding manager with an explicitly installed `ssh2` compatibility engine.
 *
 * - Default `system-ssh` spawns the OS `ssh` client (`ssh -N -L 127.0.0.1:<localPort>:<remoteBindHost>:<remotePort>`),
 *   which natively honors 100% of `~/.ssh/config` (`Host`, `ProxyJump`, `ProxyCommand`, `ControlMaster`,
 *   macOS Keychain `UseKeychain`, `IdentityAgent`, 1Password SSH Agent, `SSH_AUTH_SOCK`).
 * - `ssh2` is used only when `engine: 'ssh2'` is explicitly selected and the user
 *   installed that optional peer. A stored passphrase never changes engines.
 * - Automatically allocates a free local loopback port, verifies TCP forwarding readiness,
 *   supervises connection health, and reconnects with exponential backoff + jitter.
 *
 * @module dsh-multi-device/host/tunnel
 */
import { type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { SshTransportConfig } from '../contract.ts';
import { type ResolvedSshParameters } from './ssh-config.ts';
export type TunnelState = 'connecting' | 'up' | 'error' | 'stopped';
export declare const SSH2_MISSING_MESSAGE = "The optional ssh2 engine is not installed. Use system-ssh with an SSH agent, or explicitly install ssh2 in this DSH Profile through dsh plugin and approve only its reported build scripts.";
export interface TunnelStatus {
    readonly state: TunnelState;
    readonly localPort?: number;
    readonly baseUrl?: string;
    readonly engine?: 'system-ssh' | 'ssh2';
    readonly error?: string;
    readonly attempt: number;
}
/** Test seam. Production always uses `node:child_process` `spawn`. */
export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
/** Replace or restore the process spawner. Tests pass `null` to restore. */
export declare function setSshSpawn(spawnFn: SpawnFn | null): void;
/** Allocate an ephemeral free TCP port on `127.0.0.1`. */
export declare function allocateLoopbackPort(): Promise<number>;
/**
 * The tunnel may only forward to the remote machine's own loopback DSH listener.
 * An arbitrary `remoteBindHost` would turn the local port into a jump into the remote LAN.
 */
export declare function assertLoopbackForward(transport: SshTransportConfig): {
    host: string;
    port: number;
};
/**
 * Always force `yes`. User config values such as `accept-new`, `no`, or `off`
 * must not be copied onto the command line: the tunnel later reads remote credentials.
 */
export declare function strictHostKeyCheckingArg(): string;
/** Build the CLI arguments for `ssh -N -L ...` given transport and resolved parameters. */
export declare function buildSystemSshArgs(transport: SshTransportConfig, resolved: ResolvedSshParameters, localPort: number): string[];
/**
 * Execute a quick non-interactive command on the remote host over SSH (`system-ssh` or `ssh2`).
 * Used only for read-only discovery (e.g. `.git/config` remote URLs and `.credentials.yaml` bootstrap).
 */
export declare function execSshCommand(transport: SshTransportConfig, command: string, timeoutMs?: number, signal?: AbortSignal): Promise<{
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
    /** Monotonic generation so a late `close`/`fail` cannot tear down a newer tunnel. */
    private generation;
    private openInFlight;
    constructor(transport: SshTransportConfig, notify: () => void);
    baseUrl(): string | undefined;
    status(): TunnelStatus;
    start(): Promise<void>;
    stop(): void;
    /** Kill a child and wait until it exits, escalating to SIGKILL. */
    private killChild;
    private teardown;
    private scheduleRetry;
    private fail;
    private open;
    private openOnce;
    private openWithSystemSsh;
    private openWithSsh2;
}
/**
 * Verify an in-process `ssh2` host key against the user's `known_hosts`.
 *
 * The system `ssh` engine keeps its normal host-key policy. The fallback
 * engine must not silently accept an unknown key, so it requires a matching
 * entry and tells the user to connect once with `ssh` / `ssh-keyscan` when the
 * host is new.
 */
/**
 * Compare one `ssh-keygen -F` output line with the key ssh2 presented.
 *
 * `-F` reprints matching `known_hosts` lines, including hashed hosts
 * (`|1|salt|hash type base64`). The host token can itself contain spaces, so
 * the key is the field after the key-type token, not a fixed index. Comment
 * lines (`# Host … found`) and markers (`@cert-authority`) are not keys.
 */
export declare function hostKeyMatchesKnownHostsLine(line: string, key: Buffer): boolean;
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

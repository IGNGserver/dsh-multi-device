import type { SshConfigHostEntry, SshKeyEntry, SshTransportConfig } from '../contract.ts';
export interface ParsedSshConfigBlock {
    readonly patterns: readonly string[];
    readonly options: Readonly<Record<string, string[]>>;
    readonly sourceFile: string;
}
export interface ResolvedSshParameters {
    readonly aliasOrHost: string;
    readonly hostName: string;
    readonly port: number;
    readonly user: string;
    readonly identityFiles: readonly string[];
    readonly proxyJump?: string;
    readonly proxyCommand?: string;
    readonly forwardAgent?: boolean;
    readonly serverAliveInterval?: number;
    readonly strictHostKeyChecking?: string;
}
/** Expand leading `~` or `~/...` to the user's home directory. */
export declare function expandHomePath(inputPath: string, home?: string): string;
/** Return existing default private key paths in `~/.ssh`. */
export declare function discoverDefaultPrivateKeys(home?: string): string[];
/**
 * Discover candidate private keys under `<home>/.ssh` for the device form.
 *
 * Only files whose first bytes look like PEM/OpenSSH private-key material are
 * returned. Passphrase detection is best-effort (OpenSSH PEM header or the
 * legacy `Proc-Type: 4,ENCRYPTED` marker); the authoritative check remains the
 * SSH client's prompt/agent.
 */
export declare function listLocalSshKeys(home?: string): SshKeyEntry[];
/**
 * Parse a `user@host:port` or `ssh://user@host:port` shorthand into fields.
 */
export declare function parseSshTargetSpec(spec: string): {
    readonly host: string;
    readonly username?: string;
    readonly port?: number;
};
/**
 * Parse raw `~/.ssh/config` text into blocks, optionally resolving `Include` files.
 */
export declare function parseSshConfigText(content: string, sourceFile?: string, resolveInclude?: (pattern: string, fromFile: string) => {
    path: string;
    content: string;
}[], visited?: Set<string>): ParsedSshConfigBlock[];
/**
 * Load and parse the user's `~/.ssh/config` (and any included files).
 */
export declare function loadSystemSshConfigBlocks(configFile?: string): ParsedSshConfigBlock[];
/**
 * List concrete (non-wildcard) SSH host entries from `~/.ssh/config` for UI discovery/import.
 */
export declare function listSshConfigHosts(configFile?: string, home?: string): SshConfigHostEntry[];
/**
 * Extract concrete host entries from parsed SSH config blocks, applying cascading wildcard rules.
 */
export declare function extractConcreteHostsFromBlocks(blocks: readonly ParsedSshConfigBlock[], home?: string): SshConfigHostEntry[];
/**
 * Resolve effective SSH parameters for a given `SshTransportConfig` by combining explicit
 * user settings with matching `~/.ssh/config` blocks (first-match-wins per OpenSSH semantics).
 */
export declare function resolveSshConfigForTransport(transport: SshTransportConfig, blocks?: readonly ParsedSshConfigBlock[], home?: string): ResolvedSshParameters;
/**
 * Apply OpenSSH first-match-wins rules across parsed blocks for a target host alias.
 */
export declare function resolveSshParametersFromBlocks(targetHost: string, blocks: readonly ParsedSshConfigBlock[], home?: string): ResolvedSshParameters;

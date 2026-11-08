/** SSH exec uses the login shell, not necessarily POSIX. Probe before scripts. */
import { type SshTransportConfig } from '../contract.ts';
import { execSshCommand } from './tunnel.ts';
export type GitSshExecutor = typeof execSshCommand;
export interface GitRemotePlatform {
    readonly shell: 'posix' | 'powershell';
    readonly namespace: 'posix' | 'windows';
    readonly launcher: 'sh' | 'powershell' | 'pwsh';
}
export declare const GIT_PLATFORM_TTL_MS: number;
export declare function quotePosix(value: string): string;
export declare function quotePowerShell(value: string): string;
export declare function encodePowerShell(script: string, launcher?: string): string;
export declare function encodeGitScript(platform: GitRemotePlatform, script: string): string;
/** C:\\foo, /mnt/c/foo and /c/foo are not interchangeable namespaces. */
export declare function assertGitPathNamespace(path: string, platform: GitRemotePlatform): void;
export declare class GitPlatformProbe {
    private readonly exec;
    private readonly now;
    private readonly ttlMs;
    private readonly cache;
    private readonly pending;
    constructor(exec?: GitSshExecutor, now?: () => number, ttlMs?: number);
    invalidate(transport?: SshTransportConfig): void;
    detect(transport: SshTransportConfig): Promise<GitRemotePlatform>;
    private probe;
}
export declare const gitPlatformProbe: GitPlatformProbe;
export declare function invalidateGitPlatform(transport?: SshTransportConfig): void;

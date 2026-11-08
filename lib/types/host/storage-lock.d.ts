export interface StorageLockLease {
    readonly owner: string;
    release(): void;
}
export interface AsyncStorageLockLease {
    readonly owner: string;
    release(): Promise<void>;
}
export declare function acquireStorageLock(path: string): StorageLockLease;
export declare function acquireStorageLockAsync(path: string): Promise<AsyncStorageLockLease>;
export declare function assertStorageLockAvailable(path: string): void;
export declare function assertStorageLockAvailableAsync(path: string): Promise<void>;

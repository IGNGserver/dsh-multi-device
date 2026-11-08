export declare function atomicWrite(path: string, text: string): void;
export declare function atomicWriteAsync(path: string, text: string): Promise<void>;
export declare class JsonSnapshotFile {
    readonly path: string;
    private readonly validate?;
    private expected;
    private unreadable;
    private pendingWrites;
    constructor(path: string, validate?: ((value: Record<string, unknown>) => boolean) | undefined);
    private parse;
    read<T>(): T | undefined;
    /** Reject predictable stale/busy writes before callers mutate live services. */
    assertWritable(): void;
    write(value: unknown): void;
    /** Async reads wait for earlier writes on this instance before refreshing CAS state. */
    readAsync<T>(): Promise<T | undefined>;
    private readAsyncNow;
    assertWritableAsync(): Promise<void>;
    /** Serialize asynchronous writes per file; the CAS comparison remains inside the lease. */
    writeAsync(value: unknown): Promise<void>;
    private writeAsyncNow;
}
/** Each Profile owns its state. Legacy shared data is copied, never moved. */
export declare function resolvePluginStorage(home: string, profileDir?: string, profile?: string): {
    dataFile: string;
    secretsFile: string;
};

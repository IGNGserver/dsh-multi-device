/** Browser-local adapter for the official parameterless model catalog RPC. */
export interface CatalogRpc {
    call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown>;
}
export declare function installScopedCatalog(rpc: CatalogRpc, session: () => string | undefined, isRemote: (id: string) => boolean, load: (id: string, signal?: AbortSignal) => Promise<unknown>): () => void;

/** Browser-local adapter for the official parameterless model catalog RPC. */
export interface CatalogRpc {
  call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown>
}

export function installScopedCatalog(
  rpc: CatalogRpc,
  session: () => string | undefined,
  isRemote: (id: string) => boolean,
  load: (id: string, signal?: AbortSignal) => Promise<unknown>,
): () => void {
  const original = rpc.call
  const wrapped: CatalogRpc['call'] = function (channel, endpoint, payload, signal) {
    const id = session()
    if (channel !== '/api' || endpoint !== 'session/modelCatalog' || id === undefined || !isRemote(id)) {
      return original.call(rpc, channel, endpoint, payload, signal)
    }
    return load(id, signal)
  }
  rpc.call = wrapped
  return () => { if (rpc.call === wrapped) rpc.call = original }
}

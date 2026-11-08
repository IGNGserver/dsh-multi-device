import type { SessionAttentionFact } from '../attention.ts';
/**
 * Read a complete local attention baseline without attaching Sessions or Agents.
 *
 * `undefined` means unavailable/non-authoritative, never an empty deletion
 * baseline. In installed DSH 0.2.1-rc.5, sessionQuery can silently return only
 * live Sessions when its optional persistence binding is absent. `_persistence`
 * is a private, version-scoped compatibility guard: unknown future internals
 * deliberately fail closed until their completeness contract is verified.
 * Query/abort errors intentionally propagate to the Registry's retry handling.
 */
export declare function readLocalAttentionCatalog(resolve: (key: string) => unknown, signal?: AbortSignal): Promise<readonly SessionAttentionFact[] | undefined>;

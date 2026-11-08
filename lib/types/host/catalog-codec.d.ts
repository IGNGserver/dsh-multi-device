/** Versioned durable codec for raw remote Session/Workspace catalogs. */
import { DeviceId, type DeviceCatalogCache } from '../contract.ts';
export interface CatalogDocumentV2 {
    readonly version: 2;
    readonly catalogs: Readonly<Record<string, DeviceCatalogCache>>;
}
export declare function decodeCatalogDocument(value: unknown): Map<DeviceId, DeviceCatalogCache>;
/** Legacy v1 embedded catalogs have no wrapper version; device ownership remains explicit. */
export declare function decodeLegacyCatalogs(value: unknown): Map<DeviceId, DeviceCatalogCache>;
export declare function encodeCatalogDocument(values: ReadonlyMap<DeviceId, DeviceCatalogCache>): CatalogDocumentV2;

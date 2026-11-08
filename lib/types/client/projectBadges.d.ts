import { type DisplayMode } from '../contract.ts';
import type { MultiDeviceLocaleKey } from './locales.ts';
/** Translate function shape the host passes into the client plugin. */
type Translate = (key: MultiDeviceLocaleKey) => string;
/**
 * Device labels belong to the aggregated sidebar only. Native Mode's 本机 tab is
 * the unmodified local DSH surface, so a row decorated there would be an
 * aggregation artifact leaking into a supposedly local page.
 */
export declare function shouldDecorateProjectRows(mode: DisplayMode | undefined): boolean;
/**
 * Start decorating project rows. Returns a disposer that disconnects the
 * observer, unsubscribes from the store, and removes every badge it inserted.
 */
export declare function installProjectDeviceBadges(t: Translate): () => void;
export {};

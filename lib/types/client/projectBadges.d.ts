import type { MultiDeviceLocaleKey } from './locales.ts';
/** Translate function shape the host passes into the client plugin. */
type Translate = (key: MultiDeviceLocaleKey) => string;
/**
 * Start decorating project rows. Returns a disposer that disconnects the
 * observer, unsubscribes from the store, and removes every badge it inserted.
 */
export declare function installProjectDeviceBadges(t: Translate): () => void;
export {};

/**
 * Device badge and unread counter for sidebar project rows.
 *
 * DSH's sidebar exposes session-row slots only; the project (workspace) row has
 * no extension point, and its title is the single visible label. To show a
 * Codex-style connection dot plus a device label we decorate the row in the
 * DOM: a dot (green / amber / grey) followed by the device name when the
 * project lives on exactly one device, or `N个设备` when it spans several. The
 * same decoration carries the workspace's unread count, rolled up through
 * nested workspaces, because a collapsed parent row would otherwise hide its
 * children's unread completions.
 *
 * The decoration is additive and reversible: rows are matched by their stable
 * `data-row-key="workspace:<id>"` attribute, both badges are marker-tagged
 * spans, and the observer re-applies them after React re-renders. If DSH
 * changes its row markup the function simply finds nothing and leaves the
 * sidebar untouched.
 *
 * @module dsh-multi-device/client/projectBadges
 */
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

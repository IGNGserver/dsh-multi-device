/**
 * Turn the Host's attention projection (bare Session IDs) into rows a person
 * can read: owning device, category and the conversation title.
 *
 * The projection itself stays ID-only (`src/attention.ts` never carries titles
 * or message text). Titles come from exactly two places, in this order:
 *
 * 1. The browser's own Session store. It is the only live source for local
 *    conversations and reflects renames immediately.
 * 2. `snapshot.sessionTitles`, published by the Host for the remote Sessions it
 *    reports attention for. A remote conversation lives inside a cross-origin
 *    device page the parent cannot read, but the Host already keeps that
 *    device's catalog titles (`DeviceCatalog` control projections), so it can
 *    join them without projecting whole catalogs into the local snapshot.
 *
 * Pure and synchronous: the component owns rendering, this owns the join.
 *
 * @module dsh-multi-device/client/attentionSessions
 */
import { type MultiDeviceSnapshot } from '../contract.ts';
/** One readable attention row. */
export interface AttentionSessionRow {
    readonly sessionId: string;
    readonly rawSessionId: string;
    readonly deviceId: string;
    readonly deviceName: string;
    /** Real conversation title; `''` when nothing knows one yet. */
    readonly title: string;
    readonly cwd?: string;
}
export interface AttentionJoinOptions {
    /** Localized label for this machine (本机 / This Device). */
    readonly localDeviceName: string;
    /** Live DSH Session store lookup, used when the browser already has a row. */
    readonly title?: (sessionId: string) => string | undefined;
    /**
     * The device this attention view belongs to. The tab strip renders one view
     * per device, so the caller already knows it and the snapshot does not have
     * to carry a cross-device origin map.
     */
    readonly owningDeviceId?: string;
    readonly owningDeviceName?: string;
}
/** The title fields one local Session-store row is read for. */
export interface AttentionTitleSource {
    readonly displayTitle?: string;
    readonly title?: string;
}
/** Host-published titles for remote attention rows, keyed by namespaced id. */
export type AttentionTitleMap = Readonly<Record<string, string>>;
/**
 * Resolve one attention row's title, or `undefined` when nothing knows it yet.
 *
 * Local first: the browser's store carries the durable title and the project
 * basename fallback DSH itself shows, while the Host map is a projection that
 * only refreshes when a catalog frame arrives.
 */
export declare function resolveAttentionTitle(sessionId: string, local: AttentionTitleSource | undefined, hostTitles: AttentionTitleMap | undefined): string | undefined;
/** Last non-empty path segment, tolerating both separators. */
export declare function pathBasename(path: string | undefined): string | undefined;
/**
 * Join one ID to what the device UI can show for it.
 *
 * Every lookup degrades independently: a Session whose device was just removed
 * still renders its raw ID instead of blanking the popover out.
 */
export declare function resolveAttentionSession(sessionId: string, snapshot: MultiDeviceSnapshot, options: AttentionJoinOptions): AttentionSessionRow;
/** Join a whole category, preserving the Host's order. */
export declare function resolveAttentionSessions(sessionIds: readonly string[], snapshot: MultiDeviceSnapshot, options: AttentionJoinOptions): AttentionSessionRow[];

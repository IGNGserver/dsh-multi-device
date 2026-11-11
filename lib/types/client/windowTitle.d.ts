/**
 * Window/taskbar title for the local shell window.
 *
 * Three owners, in priority order:
 *
 * 1. The opt-in taskbar summary (`ui.taskbarSummary`): one aggregate of every
 *    device's Session status, e.g. `1跑 2结`, using the same categories as the
 *    tab capsule. It deliberately carries no product name — the strip's own
 *    counts are the whole message, and the taskbar already shows the app icon.
 * 2. A remote device tab: that device's own page title, reported by the bridge.
 * 3. Nothing: DSH keeps `document.title` naming the local conversation.
 *
 * DSH's layout owns `document.title` and derives it from the *local* Session
 * list. A remote page lives in a cross-origin frame, so its title never reaches
 * the parent document. The bridge reports that title through the Host snapshot;
 * this module applies it while a remote device tab is visible and restores
 * DSH's own title when the 本机 tab is active again.
 *
 * @module dsh-multi-device/client/windowTitle
 */
import type { DeviceId, DeviceView, MultiDeviceSnapshot } from '../contract.ts';
import type { MultiDeviceLocaleKey } from './locales.ts';
import { type TaskbarTranslate } from './taskbarSummary.ts';
/** Inputs the title depends on; kept as a narrow shape so it is easy to test. */
export interface WindowTitleInput {
    readonly activeNativeDeviceId?: DeviceId;
    readonly devices: readonly DeviceView[];
    /**
     * Aggregate task line when the taskbar-summary preference is on. `undefined`
     * means the preference is off, or nothing is running/waiting/unread.
     */
    readonly summary?: string;
}
/**
 * Pick the title the local window should show, or `undefined` to leave DSH in
 * charge. The aggregate wins over the remote page title: it already covers
 * every device, including the one on screen.
 */
export declare function resolveWindowTitle(input: WindowTitleInput): string | undefined;
/**
 * The aggregate line for one snapshot, or `undefined` to leave the title alone.
 *
 * Reads only the Host-published projection, so a toggle flip or a device count
 * change repaints the title without any extra request.
 */
export declare function resolveTaskbarSummary(snapshot: MultiDeviceSnapshot, t: TaskbarTranslate): string | undefined;
/**
 * Override `document.title` without losing DSH's own value.
 *
 * DSH's `DocumentTitle` component writes `document.title` from a React effect
 * whenever the local Session changes. A plain assignment from this plugin would
 * be silently overwritten. Shadowing the property lets us record DSH's writes
 * as `baseTitle` while the remote surface owns the visible window chrome.
 */
export declare class DocumentTitleController {
    private titleDescriptor;
    private ownPropertyInstalled;
    private baseTitle;
    private override;
    private observer;
    private installed;
    install(): boolean;
    apply(next: string | undefined): void;
    dispose(): void;
}
/**
 * Install the Host/bridge-aware window title and return its cleanup.
 *
 * `t` is needed for the opt-in aggregate: the title is localized copy, not a
 * fixed string, and the same dictionary the tab strip uses.
 */
export declare function installWindowTitle(t: (key: MultiDeviceLocaleKey) => string): () => void;

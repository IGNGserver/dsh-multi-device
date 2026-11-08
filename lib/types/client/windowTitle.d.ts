/**
 * Window/taskbar title while a remote device tab is active.
 *
 * DSH's layout owns `document.title` and derives it from the *local* Session
 * list. A remote page lives in a cross-origin frame, so its title never reaches
 * the parent document. The bridge reports that title through the Host snapshot;
 * this module applies it while a remote device tab is visible and restores
 * DSH's own title when the 本机 tab is active again.
 *
 * @module dsh-multi-device/client/windowTitle
 */
import type { DeviceId, DeviceView } from '../contract.ts';
/** Inputs the title depends on; kept as a narrow shape so it is easy to test. */
export interface WindowTitleInput {
    readonly activeNativeDeviceId?: DeviceId;
    readonly devices: readonly DeviceView[];
}
/**
 * Pick the title the local window should show, or `undefined` to leave DSH in
 * charge. A missing bridge title falls back to the device name so the window
 * never shows the local conversation's title while a remote tab is active.
 */
export declare function resolveWindowTitle(input: WindowTitleInput): string | undefined;
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
/** Install the Host/bridge-aware window title and return its cleanup. */
export declare function installWindowTitle(): () => void;

/**
 * Window/taskbar title for the aggregated and native surfaces.
 *
 * DSH's layout owns `document.title` and derives it from the *local* Session
 * list. A remote page lives in a cross-origin iframe, so its title never reaches
 * the parent document. The bridge reports that title through the Host snapshot;
 * this module applies it while a remote device is the visible conversation and
 * restores DSH's own title when the 本机 surface is active again.
 *
 * @module dsh-multi-device/client/windowTitle
 */
import type { DeviceId, DeviceView, DisplayMode } from '../contract.ts';
/** Inputs the title depends on; kept as a narrow shape so it is easy to test. */
export interface WindowTitleInput {
    readonly displayMode: DisplayMode;
    readonly activeNativeDeviceId?: DeviceId;
    readonly activeSessionId?: string;
    readonly devices: readonly DeviceView[];
    readonly nativePaneEnabled: boolean;
}
/**
 * Pick the title the local window should show, or `undefined` to leave DSH in
 * charge. In Native Mode a missing bridge title falls back to the device name;
 * in the aggregated pane a missing title is left to the local aggregated
 * Session row so no stale remote title can appear.
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

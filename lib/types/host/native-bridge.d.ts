/**
 * Native Pane bridge: the tiny script the local reverse proxy injects into the
 * framed remote DSH page, plus the HTML injection helper.
 *
 * Why a bridge at all: DSH Web has no URL router. `uiWorkspace.openSession()`
 * lives in the remote page's in-memory client store, so the only way the local
 * aggregated sidebar can drive the framed page to a Session is to execute a
 * script inside that page. The script runs before the DSH client modules
 * materialize, wraps the module table, and captures the client Context that
 * owns `uiWorkspace`.
 *
 * The bridge talks to the proxy over a same-origin WebSocket
 * (`/__md/bridge`), not `postMessage`: the proxy is the one local origin that
 * already carries the HttpOnly proxy cookie, and Electron `<webview>` guests
 * do not expose a reliable `contentWindow`.
 *
 * Failure is always graceful: when the module id, loader shape or CSP differs,
 * the bridge reports `failed` (or simply never becomes ready) and the client
 * falls back to the local mirror renderer.
 *
 * @module dsh-multi-device/host/native-bridge
 */
/** Path the proxy serves the bridge script from (root-relative inside the frame). */
export declare const NATIVE_BRIDGE_SCRIPT_PATH = "/__md/bridge.js";
/** Same-origin WebSocket the bridge opens to receive commands. */
export declare const NATIVE_BRIDGE_SOCKET_PATH = "/__md/bridge";
/** The DSH client module that owns `uiWorkspace` in 0.2.x. */
export declare const NATIVE_BRIDGE_WORKSPACE_MODULE = "@deepseek-ai/dsh-client-ui-workspace";
/**
 * Plain-JS bridge source. Kept as a template string (not a bundled module) so
 * the proxy can serve it byte-for-byte without another build target.
 */
export declare const NATIVE_BRIDGE_SCRIPT: string;
/**
 * Bound and validate one device's workspace fold state before it crosses the
 * Host/page boundary. Unknown shapes are dropped rather than injected into
 * the remote workspace store.
 */
export declare function sanitizeGroupState(value: unknown): Record<string, boolean>;
/** Initial page state served alongside the bridge script. */
export interface NativeBridgeScriptState {
    /** Explicit workspace fold state last observed by the Host. */
    readonly groups?: Readonly<Record<string, boolean>>;
    /** Raw remote Session IDs whose completion is currently unread. */
    readonly unread?: readonly string[];
}
/**
 * Build the per-device bridge response. The state prefix runs before the
 * bridge body and before any DSH module, so the first workspace render already
 * has the Host's fold state.
 */
export declare function buildNativeBridgeScript(state?: NativeBridgeScriptState): string;
/** Options for {@link injectNativeBridge}. */
export interface NativeBridgeInjectionOptions {
    readonly deviceId: string;
}
/**
 * Insert the bridge `<script>` as the first head child so it executes before
 * any DSH client module script.
 *
 * Idempotent: a second call on already-injected HTML returns it unchanged.
 * Falls back to an `<html>` prefix or a document prefix when the remote shell
 * has no explicit `<head>` (unusual, but never worse than dropping the bridge).
 */
export declare function injectNativeBridge(html: string, options: NativeBridgeInjectionOptions): string;
/** True when a proxied request path asks for the bridge script. */
export declare function isNativeBridgeScriptPath(pathname: string): boolean;
/** True when a proxy upgrade targets the bridge socket (not a remote API socket). */
export declare function isNativeBridgeSocketPath(pathname: string): boolean;

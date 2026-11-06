/**
 * Clipboard helpers for the local shell.
 *
 * `navigator.clipboard` is unavailable in insecure contexts and can be denied
 * by embedded frames; the textarea + `execCommand('copy')` fallback keeps the
 * diagnostics button working in those shells.
 *
 * @module dsh-multi-device/client/clipboard
 */
/** Synchronous copy path that does not need the async Clipboard API. */
export declare function fallbackCopyText(text: string): boolean;
/** Copy text to the local browser clipboard, with a legacy fallback. */
export declare function copyText(text: string): Promise<boolean>;

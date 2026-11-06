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
export function fallbackCopyText(text: string): boolean {
  if (typeof document === 'undefined') return false
  const value = String(text)
  let area: HTMLTextAreaElement | undefined
  try {
    area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.left = '-1000px'
    area.style.opacity = '0'
    const parent = document.body ?? document.documentElement
    if (parent === null) return false
    parent.appendChild(area)
    const selection = typeof document.getSelection === 'function' ? document.getSelection() : null
    const previousRange = selection !== null && selection.rangeCount > 0
      ? selection.getRangeAt(0)
      : null
    area.select()
    let copied = false
    try { copied = document.execCommand('copy') } catch { copied = false }
    area.remove()
    if (selection !== null && previousRange !== null) {
      try {
        selection.removeAllRanges()
        selection.addRange(previousRange)
      } catch {
        // Selection restoration is cosmetic.
      }
    }
    return copied
  } catch {
    try { area?.remove() } catch { /* ignore */ }
    return false
  }
}

/** Copy text to the local browser clipboard, with a legacy fallback. */
export async function copyText(text: string): Promise<boolean> {
  const value = String(text)
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard !== undefined &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Fall through to the synchronous path.
  }
  return fallbackCopyText(value)
}

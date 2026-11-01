/**
 * Scoped stylesheet injection for `dsh-multi-device`.
 *
 * Uses `data-plugin="dsh-multi-device"` so DSH's `removeOwnedStyles` cleans it up
 * automatically when the plugin unloads or reloads.
 *
 * @module dsh-multi-device/client/styles
 */

const STYLE_TAG_ID = 'dsh-multi-device/styles.css'

const CSS_TEXT = `
.dsh-md-overlay-bar {
  position: fixed;
  top: var(--dsh-frame-chrome-top, 10px);
  right: 16px;
  z-index: 90;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1, rgba(30, 32, 37, 0.92));
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(12px);
  color: var(--dsw-alias-label-primary, #e5e7eb);
  font-size: 12px;
  line-height: 18px;
  user-select: none;
}

.dsh-md-mode-seg {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.06));
  padding: 2px;
  gap: 2px;
}

.dsh-md-mode-btn {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #9ca3af);
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: background 0.15s ease, color 0.15s ease;
}

.dsh-md-mode-btn:hover {
  color: var(--dsw-alias-label-primary, #f3f4f6);
}

.dsh-md-mode-btn[data-active="true"] {
  background: var(--dsw-alias-state-business-primary, #3b82f6);
  color: #ffffff;
}

.dsh-md-device-pill {
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  background: transparent;
  color: var(--dsw-alias-label-primary, #e5e7eb);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dsh-md-device-pill:hover,
.dsh-md-device-pill[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(59, 130, 246, 0.16));
  border-color: var(--dsw-alias-state-business-primary, #3b82f6);
}

.dsh-md-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.dsh-md-dot[data-state="connected"] { background: #10b981; }
.dsh-md-dot[data-state="connecting"],
.dsh-md-dot[data-state="reconnecting"] { background: #f59e0b; animation: dsh-md-pulse 1.2s infinite; }
.dsh-md-dot[data-state="error"] { background: #ef4444; }
.dsh-md-dot[data-state="disabled"] { background: #6b7280; }

@keyframes dsh-md-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.dsh-md-native-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 80;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, #111318);
  color: var(--dsw-alias-label-primary, #e5e7eb);
}

.dsh-md-native-toolbar {
  height: 42px;
  padding: 0 12px;
  padding-left: calc(var(--dsh-frame-leading-clearance, 12px) + 64px);
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  background: var(--dsw-specific-sidebar-fill, #181a20);
  flex-shrink: 0;
  overflow-x: auto;
}

.dsh-md-native-stage {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

.dsh-md-native-frame-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

.dsh-md-native-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  flex: 1;
  background: var(--dsw-alias-bg-base, #111318);
}

.dsh-md-hub-root {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--dsw-alias-label-primary, #e5e7eb);
  background: var(--dsw-alias-bg-base, transparent);
  overflow-y: auto;
  padding: 20px 24px;
  box-sizing: border-box;
  gap: 16px;
}

.dsh-md-hub-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dsh-md-tabs {
  display: flex;
  gap: 16px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
}

.dsh-md-tab {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #9ca3af);
  padding: 8px 2px 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
}

.dsh-md-tab[data-active="true"] {
  color: var(--dsw-alias-label-primary, #ffffff);
}

.dsh-md-tab[data-active="true"]::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--dsw-alias-state-business-primary, #3b82f6);
  border-radius: 2px 2px 0 0;
}

.dsh-md-card {
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.03));
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsh-md-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.dsh-md-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.dsh-md-field label {
  color: var(--dsw-alias-label-secondary, #9ca3af);
  font-weight: 500;
}

.dsh-md-input,
.dsh-md-select {
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  background: var(--dsw-alias-bg-base, rgba(0, 0, 0, 0.2));
  color: var(--dsw-alias-label-primary, #e5e7eb);
  font-size: 12px;
  box-sizing: border-box;
}

.dsh-md-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16));
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.06));
  color: var(--dsw-alias-label-primary, #e5e7eb);
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.dsh-md-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.12));
}

.dsh-md-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.dsh-md-btn-primary {
  background: var(--dsw-alias-state-business-primary, #2563eb);
  border-color: var(--dsw-alias-state-business-primary, #2563eb);
  color: #ffffff;
}

.dsh-md-btn-primary:hover:not(:disabled) {
  filter: brightness(1.08);
}

.dsh-md-btn-danger:hover:not(:disabled) {
  color: #ef4444;
  border-color: #ef4444;
}

.dsh-md-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-secondary, #9ca3af);
}

.dsh-md-row-leading-tag {
  font-size: 9px;
  font-weight: 600;
  padding: 0 3px;
  border-radius: 3px;
  background: rgba(59, 130, 246, 0.18);
  color: #60a5fa;
  line-height: 13px;
  max-width: 16px;
  overflow: hidden;
  text-overflow: clip;
}
`

export function adoptMultiDeviceStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`) !== null) return
  const tag = document.createElement('style')
  tag.setAttribute('data-plugin', 'dsh-multi-device')
  tag.setAttribute('data-plugin-css', STYLE_TAG_ID)
  tag.textContent = CSS_TEXT
  document.head.appendChild(tag)
}

/**
 * Scoped layout stylesheet for `dsh-multi-device`.
 *
 * Strictly consumes official DSH `--dsw-*` and `--dsh-*` semantic design tokens
 * (zero hardcoded colors) so light, dark, and custom themes render identically
 * to built-in DSH settings sections (`GeneralSection` & `ModelsSection`).
 *
 * Uses `data-plugin="dsh-multi-device"` so DSH's `removeOwnedStyles` cleans it up
 * automatically when the plugin unloads or reloads.
 *
 * @module dsh-multi-device/client/styles
 */

const STYLE_TAG_ID = 'dsh-multi-device/styles.css'

const CSS_TEXT = `

/* Settings Section Layout (aligned with @deepseek-ai/dsh-client-ui-settings-models & general) */
.dsh-md-section {
  width: 100%;
  max-width: 720px;
  color: var(--dsw-alias-label-primary);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dsh-md-section-title {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}

.dsh-md-section-intro {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}

.dsh-md-pref-list {
  display: flex;
  flex-direction: column;
}

.dsh-md-pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 24px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}

.dsh-md-pref-title {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 20px;
}

.dsh-md-pref-desc {
  margin-top: 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-devices-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 14px;
}

.dsh-md-devices-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 2px;
}

.dsh-md-devices-heading-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsh-md-devices-heading {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
}

.dsh-md-devices-count-pill {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-bg-layer-3));
  color: var(--dsw-alias-label-secondary);
}

.dsh-md-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dsh-md-card {
  border: 0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2));
  background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1));
  border-radius: var(--dsw-radius-xl, 12px);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsh-md-empty-card {
  align-items: center;
  text-align: center;
  padding: 28px 20px;
  gap: 6px;
}

.dsh-md-row-head {
  display: flex;
  align-items: center;
  gap: 6px 10px;
  flex-wrap: wrap;
}

.dsh-md-row-identity {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.dsh-md-row-name {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}

.dsh-md-row-actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: auto;
  flex-shrink: 0;
}

.dsh-md-icon-actions-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.dsh-md-device-endpoint {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-family: var(--ds-font-family-code);
  padding: 1px 6px;
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-secondary);
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsh-md-latency-text {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  font-family: var(--ds-font-family-code);
}

.dsh-md-session-count-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-selected, rgba(103, 158, 254, 0.12));
  color: var(--dsw-alias-state-business-primary, #679efe);
}

.dsh-md-auth-required-tag {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-interactive-bg-hover-warning, rgba(245, 158, 11, 0.12));
  color: var(--dsw-alias-state-warn-label, #f59e0b);
}

.dsh-md-error-text {
  margin: 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}

.dsh-md-success-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--dsw-alias-state-success-primary);
  font-size: 12px;
  line-height: 18px;
}

/* Form Layout inside Settings Card */
.dsh-md-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dsh-md-editor-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dsh-md-editor-title {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}

.dsh-md-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: 10px 12px;
}

.dsh-md-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.dsh-md-field-span {
  grid-column: 1 / -1;
}

.dsh-md-field-label {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

/* DSH Design Compliant Select Dropdown */
.dsh-md-select-container {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}

.dsh-md-select-container.isCompact {
  width: auto;
  min-width: 160px;
  max-width: min(320px, 100%);
}

.dsh-md-select-trigger {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  padding: 0 8px 0 10px;
  gap: 8px;
  border-radius: var(--dsw-radius-md, 8px);
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
  text-align: start;
  transition: border-color 0.12s ease, background-color 0.12s ease;
}

.dsh-md-select-container.isCompact .dsh-md-select-trigger {
  height: 28px;
  padding: 0 6px 0 8px;
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-select-trigger:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l1);
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-select-trigger:focus-visible,
.dsh-md-select-container.isOpen .dsh-md-select-trigger {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.dsh-md-select-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dsh-md-select-trigger-content {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  flex: 1 1 auto;
}

.dsh-md-select-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-md-select-label.isPlaceholder {
  color: var(--dsw-alias-label-tertiary);
}

.dsh-md-select-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary));
  transition: transform 0.15s ease;
}

.dsh-md-select-arrow.isOpen {
  transform: rotate(180deg);
}

.dsh-md-select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  width: max-content;
  max-width: min(380px, 90vw);
  max-height: 240px;
  overflow-y: auto;
  z-index: 960;
  box-sizing: border-box;
  padding: 4px;
  border-radius: var(--dsw-radius-lg, 10px);
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-elevation-prominent);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dsh-md-select-container.isCompact .dsh-md-select-dropdown {
  left: auto;
  right: 0;
}

.dsh-md-select-empty {
  padding: 8px 10px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}

.dsh-md-select-option {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.dsh-md-select-option:hover:not(.isDisabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-select-option.isSelected {
  background: var(--dsw-alias-interactive-bg-selected, rgba(103, 158, 254, 0.08));
}

.dsh-md-select-option.isDisabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dsh-md-select-option-main {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.dsh-md-select-option-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 auto;
}

.dsh-md-select-option-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-bg-layer-4);
  color: var(--dsw-alias-label-secondary);
  flex: none;
}

.dsh-md-select-option-desc {
  font-size: 11px;
  font-family: var(--ds-font-family-code);
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 2px;
}

.dsh-md-select-check-wrap {
  display: inline-flex;
  align-items: center;
  color: var(--dsw-alias-brand-primary, #679efe);
  flex: none;
  margin-left: auto;
}

.dsh-md-secret-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.dsh-md-secret-input {
  width: 100%;
}

.dsh-md-secret-toggle {
  position: absolute;
  right: 4px;
}

.dsh-md-advanced-body {
  padding-top: 8px;
}

.dsh-md-editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 4px;
}

.dsh-md-editor-footer-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.dsh-md-editor-footer-right {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
}

/* Native Mode tab bar, host-frame reservation and keep-alive stage */
html {
  --dsh-md-native-bar-height: 42px;
  --dsh-md-native-bar-top: var(--dsh-frame-chrome-top, 0px);
}

/* macOS Desktop keeps its traffic lights and the collapsed-sidebar leading
 * controls in the reserved title area; place the tab strip below that area.
 * Browser-hosted DSH on macOS has no such native title area and keeps 0. */
html[data-platform='darwin'] .dsh-md-frame-native.dsh-md-frame-desktop {
  --dsh-md-native-bar-top: var(--dsh-frame-top-clearance, 48px);
}

/* Keep macOS collapsed-sidebar window-chrome controls above the overlay */
[data-shell-leading] {
  z-index: 25 !important;
}

/* While resizing the local sidebar/rightbar, prevent iframes from swallowing pointer events */
[data-dragging] .dsh-md-native-stage {
  pointer-events: none !important;
}

.dsh-md-native-layer {
  position: absolute;
  inset: 0;
  z-index: 21;
  pointer-events: none;
}

.dsh-md-native-layer > * {
  pointer-events: auto;
}

/*
 * Reserve the tab-strip height inside the Host frame, below the platform
 * titlebar. !important is intentional: the layout plugin writes its own
 * padding-top for the Windows caption row.
 */
.dsh-md-frame-native {
  box-sizing: border-box;
  padding-top: calc(var(--dsh-md-native-bar-top) + var(--dsh-md-native-bar-height)) !important;
}

.dsh-md-native-bar {
  /* Portalled onto <body>: the Host's shell overlay is a stacking context
   * (z-index 20) sitting under its own in-frame chrome (leading seat 25,
   * sidebar toggle 30), and the frame clips overflow. Fixed positioning plus
   * this z-index keeps the Settings entry above every in-frame seat while
   * staying below Tooltip/HoverCard (100), Modal (1000) and Menu (1100).
   * left/top/width are written inline from the measured Host frame; the
   * values here are only the pre-measurement fallback. */
  position: fixed;
  top: var(--dsh-md-native-bar-top);
  left: 0;
  right: auto;
  bottom: auto;
  width: 100vw;
  max-width: 100vw;
  height: var(--dsh-md-native-bar-height);
  box-sizing: border-box;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

/* Compact bars only tighten the gap and padding. The Settings entry stays in the
 * trailing cluster at every width: moving it across the strip at 720px re-flowed
 * every tab, and the bar's width is already clamped to the visible viewport. */
.dsh-md-native-bar[data-compact='true'] {
  gap: 6px;
  padding: 0 8px;
}

.dsh-md-native-bar[data-compact='true'] .dsh-md-native-tabs {
  gap: 4px;
}

/*
 * Everything right of the tab strip. flex:none + margin-inline-start:auto
 * keeps the Settings entry out of the strip's scroll area: the tabs shrink
 * and scroll, this cluster never does.
 */
.dsh-md-native-bar-trailing {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
  margin-inline-start: auto;
}

.dsh-md-native-mode-switch-wrap {
  display: inline-flex;
  align-items: center;
  flex: none;
}

/* Diagnostics card in Settings → Multi-Device */
.dsh-md-diagnostics {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 0;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}

.dsh-md-diagnostics-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.dsh-md-diagnostics-mode {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-diagnostics-output {
  box-sizing: border-box;
  margin: 0;
  padding: 12px;
  max-height: 320px;
  overflow: auto;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  line-height: 16px;
  white-space: pre-wrap;
  word-break: break-word;
}

/*
 * The bar is portalled onto <body>, where the Host forces
 * body > :not(#root) { -webkit-app-region: no-drag }. !important restores the
 * drag affordance this strip provides in place of the macOS title bar; the
 * buttons inside opt back out below.
 */
html[data-platform='darwin'] body > .dsh-md-native-bar,
html[data-platform='darwin'] .dsh-md-native-bar {
  -webkit-app-region: drag !important;
}

.dsh-md-native-bar button,
.dsh-md-native-bar [role='button'],
.dsh-md-native-bar [role='tab'] {
  -webkit-app-region: no-drag;
}

.dsh-md-native-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  /* Shrinks and scrolls; the trailing cluster beside it never does. */
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.dsh-md-native-tabs::-webkit-scrollbar {
  display: none;
}

.dsh-md-native-bar-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

/* Separates the device actions from the rightmost mode switch. */
.dsh-md-native-bar-sep {
  width: 1px;
  height: 18px;
  flex: none;
  background: var(--dsw-alias-border-l2);
}

.dsh-md-native-tab-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

/*
 * The keep-alive release button lives in a slot that exists for every device
 * that can be kept alive, not only for the ones currently mounted. Adding it on
 * the first click resized the tab and shifted every tab beside it.
 */
.dsh-md-tab-action-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
}

.dsh-md-pill-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* Long device names must not push the trailing cluster off the bar. */
.dsh-md-pill-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * Attention chips: a number with a category icon, never a sentence. Every
 * category owns a slot of this exact width whether or not it has members, and
 * the freshness marker is a dot instead of a text chip, so a Session starting
 * or finishing never changes the strip's geometry.
 */
html {
  --dsh-md-attention-slot-width: 30px;
}
.dsh-md-attention {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

/* Menu wraps its anchor in a span; keep the chip inline with the pill. */
.dsh-md-attention > span {
  display: inline-flex;
  align-items: center;
}

/* Freshness marker and the empty slot that replaces it share one box, so a
 * snapshot flipping between cached and live cannot resize the tab. */
.dsh-md-attention-stale,
.dsh-md-attention-stale-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 8px;
  height: 20px;
  flex: none;
}

.dsh-md-attention-stale-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-state-warn-primary);
}

/* Reserved space for an empty category. Same width as a chip, invisible. */
.dsh-md-attention-slot {
  display: inline-flex;
  width: var(--dsh-md-attention-slot-width, 30px);
  height: 20px;
  flex: none;
}

.dsh-md-attention-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  box-sizing: border-box;
  width: var(--dsh-md-attention-slot-width, 30px);
  height: 20px;
  padding: 0;
  overflow: hidden;
  flex: none;
  border: 0.5px solid transparent;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-selected, rgba(103, 158, 254, 0.12));
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: border-color 0.12s ease, background-color 0.12s ease;
}

.dsh-md-attention-chip:hover {
  border-color: var(--dsw-alias-border-l2);
}

.dsh-md-attention-chip[data-open='true'] {
  border-color: var(--dsw-alias-border-l1);
}

.dsh-md-attention-chip:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}

.dsh-md-attention-chip[data-category='pending'] {
  color: var(--dsw-alias-state-warn-primary);
  background: transparent;
}

.dsh-md-attention-count {
  font-weight: 500;
}

/* The menu surface and rows are rendered by the Host's Menu; only the two
 * text lines inside a row are ours. */
.dsh-md-attention-menu {
  min-width: 260px;
  max-width: min(420px, calc(100vw - 24px));
}

.dsh-md-attention-row {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.dsh-md-attention-row-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-md-attention-row-title.isId {
  color: var(--dsw-alias-label-tertiary);
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
}

.dsh-md-attention-row-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 15px;
}

.dsh-md-attention-note {
  padding: 6px 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-muted {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dsh-md-pending {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--dsw-alias-state-warn-primary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dsh-md-native-stage {
  position: absolute;
  top: calc(var(--dsh-md-native-bar-top) + var(--dsh-md-native-bar-height));
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  pointer-events: auto;
}

.dsh-md-native-stage[data-visible='false'] {
  display: none;
  pointer-events: none;
}

.dsh-md-native-stage-body {
  position: relative;
  flex: 1;
  min-height: 0;
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
  background: var(--dsw-alias-bg-base);
}

.dsh-md-native-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px;
  text-align: center;
}

.dsh-md-auth-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: auto;
}

.dsh-md-auth-card {
  box-sizing: border-box;
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-panel);
}

.dsh-md-auth-badge {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-state-warn-tertiary, var(--dsw-alias-bg-layer-3));
  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary));
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-auth-title {
  margin: 2px 0 0;
  color: var(--dsw-alias-label-primary);
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
}

.dsh-md-auth-desc {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}

.dsh-md-auth-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.dsh-md-auth-hint {
  margin: 2px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

/* Bridge-failed banner at the top of the native stage: a failed bridge used
   to leave a blank stage with no explanation and no recovery action. */
.dsh-md-bridge-failed {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-secondary));
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-bridge-failed-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.dsh-md-bridge-failed-title {
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}

.dsh-md-bridge-failed-error {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dsh-md-fallback-modal {
  width: min(740px, 100%);
}

@media (max-width: 560px) {
  .dsh-md-pref-row {
    align-items: flex-start;
  }

  .dsh-md-editor-top {
    align-items: stretch;
  }

  .dsh-md-editor-footer {
    align-items: stretch;
  }

  .dsh-md-editor-footer-left,
  .dsh-md-editor-footer-right {
    width: 100%;
  }

  .dsh-md-editor-footer-right {
    justify-content: flex-end;
  }

  .dsh-md-auth-card {
    padding: 18px;
  }
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

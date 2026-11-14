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

.dsh-md-card.isDisabled .dsh-md-row-name {
  color: var(--dsw-alias-label-secondary);
}

.dsh-md-device-toggle {
  display: inline-flex;
  align-items: center;
  margin-left: 2px;
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

/*
 * DSH's real Button primitive only supports 'sm' | 'md' sizes (size='icon'
 * accidentally applies the inner 16x16 icon-span class onto <button> while
 * keeping padding: 0 14px, collapsing child SVGs to 0px wide). Always render
 * icon-only buttons with size='sm' plus this class to clear horizontal padding
 * and protect the SVG box.
 */
.dsh-md-icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  flex: none;
  color: var(--dsw-alias-label-secondary);
}

.dsh-md-icon-btn:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
}

.dsh-md-icon-btn.isCompact {
  width: 22px;
  height: 22px;
}

.dsh-md-icon-btn.isDanger:hover:not(:disabled) {
  color: var(--dsw-alias-state-error-primary, #ef4444);
}

.dsh-md-icon-btn svg {
  flex: none;
  display: block;
}

.dsh-md-danger-action {
  color: var(--dsw-alias-state-error-primary, #ef4444);
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

/*
 * Overlay scrollbar for the device strip.
 *
 * Absolutely positioned inside the bar — the bar is fixed, so it is the
 * containing block — and *not* inside the tab scroller: a positioned child of
 * the scroller would be dragged along by scrollLeft, and an in-flow one would
 * change the row's height. Nothing here takes part in the bar's flex layout,
 * which is what keeps every pill at the exact box it had before.
 *
 * Hidden by default; the bar's hover/focus reveals it, a drag holds it open,
 * and data-active covers the no-hover case. The thumb, not the track, owns
 * pointer events, so the 3px strip never steals a tab click.
 */
.dsh-md-native-tab-scroll {
  position: absolute;
  bottom: 2px;
  height: 3px;
  z-index: 2;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
  -webkit-app-region: no-drag;
}

.dsh-md-native-tab-scroll-thumb {
  height: 100%;
  border-radius: 999px;
  background: var(
    --dsw-alias-scrollbar-bg-l2,
    color-mix(in srgb, var(--dsw-alias-label-tertiary) 55%, transparent)
  );
  pointer-events: none;
  cursor: grab;
}

.dsh-md-native-bar:hover .dsh-md-native-tab-scroll[data-scrollable='true'],
.dsh-md-native-bar:focus-within .dsh-md-native-tab-scroll[data-scrollable='true'],
.dsh-md-native-tab-scroll[data-dragging='true'] {
  opacity: 1;
}

.dsh-md-native-bar:hover .dsh-md-native-tab-scroll[data-scrollable='true'] .dsh-md-native-tab-scroll-thumb,
.dsh-md-native-bar:focus-within .dsh-md-native-tab-scroll[data-scrollable='true'] .dsh-md-native-tab-scroll-thumb,
.dsh-md-native-tab-scroll[data-dragging='true'] .dsh-md-native-tab-scroll-thumb {
  pointer-events: auto;
}

.dsh-md-native-tab-scroll-thumb:hover,
.dsh-md-native-tab-scroll[data-dragging='true'] .dsh-md-native-tab-scroll-thumb {
  background: var(
    --dsw-alias-scrollbar-hover-l2,
    color-mix(in srgb, var(--dsw-alias-label-secondary) 70%, transparent)
  );
}

.dsh-md-native-tab-scroll[data-dragging='true'] .dsh-md-native-tab-scroll-thumb {
  cursor: grabbing;
}

/*
 * Touch: there is no hover, so the thumb appears for a moment after a pan.
 * It stays non-interactive there — native panning is the gesture, and a 3px
 * grab target would only compete with it. touch-action is deliberately left
 * at its default so a vertical swipe starting on the strip still scrolls the
 * page instead of being swallowed.
 */
@media (hover: none) {
  .dsh-md-native-tab-scroll[data-scrollable='true'][data-active='true'] {
    opacity: 1;
  }

  .dsh-md-native-tab-scroll-thumb {
    pointer-events: none !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dsh-md-native-tab-scroll {
    transition: none;
  }
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
 * The keep-alive release control exists only while that device's page is really
 * mounted. Keep a fixed 22x22 slot in flow and render the button visibly at
 * muted opacity so users can see and click it immediately without hovering
 * blindly, brightening on tab hover or focus.
 */
.dsh-md-tab-release {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: none;
  opacity: 0.6;
  pointer-events: auto;
  transition: opacity 0.12s ease;
}

.dsh-md-native-tab-item:hover .dsh-md-tab-release,
.dsh-md-native-tab-item:focus-within .dsh-md-tab-release {
  opacity: 1;
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
 * Tab status capsule: ONE capsule per device, numbers only. Colour is the
 * category — needs-reply (amber) → running (blue) → finished-unread (green) —
 * and the words live in the title attribute, the aria-label and the menu heading.
 *
 * Only categories with members render a segment, so a quiet device carries no
 * invisible reservation; the three 30px slots plus the separate freshness marker
 * this replaces are what made the strip read as a row of scattered dots. Digits
 * are tabular and every segment keeps a two-digit cell, so 1 ↔ 9 ↔ 99 cannot
 * nudge the neighbouring tabs; only a category appearing or disappearing
 * reflows, which is a real change worth showing.
 */
html {
  --dsh-md-tone-pending: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary, #f59e0b));
  --dsh-md-tone-running: var(--dsw-alias-state-business-primary, #679efe);
  --dsh-md-tone-done: var(--dsw-alias-state-success-label, var(--dsw-alias-state-success-primary, #1f8b4c));
  --dsh-md-status-segment-width: 22px;
}

.dsh-md-attention {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: none;
}

/* Nothing to report and nothing stale: stay out of the tab's gap arithmetic so
 * a quiet device's tab is exactly as wide as its pill. */
.dsh-md-attention:empty {
  display: none;
}

.dsh-md-tab-status {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  box-sizing: border-box;
  height: 20px;
  padding: 0 3px;
  flex: none;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-3);
}

/* Menu wraps its anchor in a span; keep the segments flush inside the capsule. */
.dsh-md-tab-status > span {
  display: inline-flex;
  align-items: center;
}

/* Dock the capsule to its device tab; Settings rows keep their own row gap. */
.dsh-md-native-tab-item .dsh-md-tab-status {
  margin-inline-start: 4px;
}

/*
 * Cached or partial data is not an authoritative zero, so the capsule states
 * that itself instead of adding a second amber marker beside the numbers: it
 * dims and goes dashed, and with nothing to count it collapses to an empty ring.
 */
.dsh-md-tab-status[data-stale='true'] {
  opacity: 0.5;
  border-style: dashed;
}

.dsh-md-tab-status[data-empty='true'] {
  width: 10px;
  height: 10px;
  padding: 0;
}

.dsh-md-tab-status-seg {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: var(--dsh-md-status-segment-width, 22px);
  height: 18px;
  padding: 0 4px;
  flex: none;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background-color 0.12s ease;
}

/* The number stays small while the hit box still clears a comfortable target.
 * The button must not clip: a pseudo-element that overflows a clipping box stops
 * receiving pointer events, which would silently undo the enlargement. */
.dsh-md-tab-status-seg::after {
  content: '';
  position: absolute;
  inset: -3px -1px;
}

.dsh-md-tab-status-seg[data-tone='pending'] {
  color: var(--dsh-md-tone-pending);
}

.dsh-md-tab-status-seg[data-tone='running'] {
  color: var(--dsh-md-tone-running);
}

.dsh-md-tab-status-seg[data-tone='done'] {
  color: var(--dsh-md-tone-done);
}

.dsh-md-tab-status-seg:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-tab-status-seg[data-open='true'] {
  background: var(--dsw-alias-interactive-bg-selected);
}

.dsh-md-tab-status-seg:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
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

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
/* Manual Git match block */
.dsh-md-gitmatch {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}

.dsh-md-gitmatch-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 24px;
}

.dsh-md-gitmatch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsh-md-gitmatch-progress,
.dsh-md-gitmatch-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-gitmatch-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}

.dsh-md-gitmatch-phase,
.dsh-md-gitmatch-status-ok {
  color: var(--dsw-alias-state-success-primary);
}

.dsh-md-gitmatch-status-error {
  color: var(--dsw-alias-state-error-primary);
}

.dsh-md-gitmatch-detail {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-gitmatch-created {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.dsh-md-gitmatch-created li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dsh-md-gitmatch-path {
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-md-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Sidebar project row device badge (dot + device name / device count) */
.dsh-md-project-device {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  margin-left: 4px;
  max-width: 110px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}

[data-row-key^='workspace:']:hover > .dsh-md-project-device,
[data-row-key^='workspace:'][class*='menuOpen'] > .dsh-md-project-device {
  display: none;
}

/* Unread counter: Native tabs, sidebar project rows, and Settings device rows.
   Green matches DSH's "completed" status dot, so the badge reads as a finished
   result waiting to be opened rather than an error. */
.dsh-md-unread-count {
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--dsw-alias-state-success-tertiary, rgba(34, 197, 94, 0.14));
  color: var(--dsw-alias-state-success-primary, #22c55e);
  font-size: 10px;
  font-weight: 500;
  line-height: 14px;
  white-space: nowrap;
}

/* The project row has no flex gap, unlike the pill and Settings row groups. */
[data-row-key^='workspace:'] > .dsh-md-unread-count {
  margin-left: 4px;
}

[data-row-key^='workspace:']:hover > .dsh-md-unread-count,
[data-row-key^='workspace:'][class*='menuOpen'] > .dsh-md-unread-count {
  display: none;
}

.dsh-md-project-device-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-md-project-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: var(--dsw-alias-state-success-primary);
}

.dsh-md-project-dot[data-state='pending'] {
  background: var(--dsw-alias-state-warn-primary);
}

.dsh-md-project-dot[data-state='offline'] {
  background: var(--dsw-alias-state-idle-primary);
}

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

/* Sub-panel for nested settings like Merged Git Workspaces */
.dsh-md-subpanel {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: var(--dsw-radius-lg, 10px);
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsh-md-subpanel-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dsh-md-subpanel-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
}

.dsh-md-subpanel-icon {
  color: var(--dsw-alias-brand-primary, #679efe);
  flex-shrink: 0;
}

.dsh-md-subpanel-desc {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-merged-repos-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dsh-md-merged-repo-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l2);
}

.dsh-md-merged-repo-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.dsh-md-merged-repo-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsh-md-merged-repo-remote {
  font-size: 11px;
  font-family: var(--ds-font-family-code);
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsh-md-merged-repo-hint {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-state-warn-label);
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

.dsh-md-code-text {
  font-family: var(--ds-font-family-code);
}

.dsh-md-notice-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-label-secondary));
  font-size: 12px;
  line-height: 18px;
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

.dsh-md-native-select {
  box-sizing: border-box;
  height: 32px;
  width: 100%;
  padding: 0 10px;
  border-radius: var(--dsw-radius-md, 8px);
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}

.dsh-md-native-select-compact {
  width: auto;
  max-width: min(240px, 100%);
  height: 28px;
  font-size: 12px;
}

.dsh-md-native-select:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
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

html[data-platform='darwin'] [data-sidebar-collapsed] .dsh-md-pane-bar {
  padding-left: var(--dsh-frame-leading-clearance, 160px);
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
  position: absolute;
  top: var(--dsh-md-native-bar-top);
  left: 0;
  right: 0;
  /* A Host frame wider than the viewport (embedded remote page) must never
   * push the right-aligned mode switch off-screen: clamp to the viewport and
   * let the component measure the exact remainder. */
  width: min(100%, 100vw);
  max-width: 100vw;
  height: var(--dsh-md-native-bar-height);
  box-sizing: border-box;
  z-index: 2;
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

/* Compact bars render the mode switch and Settings before the tab strip, so
 * the way back to Aggregated Mode is always inside the visible viewport. */
.dsh-md-native-bar-leading {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

.dsh-md-native-bar[data-compact='true'] {
  gap: 6px;
  padding: 0 8px;
}

.dsh-md-native-bar[data-compact='true'] .dsh-md-native-tabs {
  gap: 4px;
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

html[data-platform='darwin'] .dsh-md-native-bar {
  -webkit-app-region: drag;
}

.dsh-md-native-bar button,
.dsh-md-native-bar [role='button'] {
  -webkit-app-region: no-drag;
}

.dsh-md-native-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
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

/* Rightmost Native Mode action: back to Aggregated Mode in one click. */
.dsh-md-native-mode-switch {
  flex: none;
  white-space: nowrap;
}

.dsh-md-native-tab-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.dsh-md-pill-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

/*
 * Aggregated Native Pane. Geometry is written inline from the measured local
 * conversation column; the pane keeps its iframe mounted (visibility, not
 * display) while the bridge is loading, so it can report readiness without a
 * second navigation.
 */
.dsh-md-native-stage[data-scope='pane'] {
  border-left: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
}

.dsh-md-native-stage[data-scope='pane'][data-visible='false'] {
  display: flex;
  visibility: hidden;
  pointer-events: none;
}

.dsh-md-native-stage-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dsh-md-pane-bar {
  flex: none;
  height: 32px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 10px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  -webkit-app-region: no-drag;
}

.dsh-md-pane-identity {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.dsh-md-pane-identity .dsh-md-device-chip-wrap,
.dsh-md-pane-identity .dsh-md-device-chip {
  min-width: 0;
  max-width: 230px;
}

.dsh-md-pane-name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}

.dsh-md-pane-mode {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  white-space: nowrap;
}

.dsh-md-pane-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
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

/* Owning-device chip on the conversation page (header + New Session row) */
.dsh-md-device-chip-wrap {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.dsh-md-device-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 220px;
  padding: 3px 8px;
  border: 0.5px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}

.dsh-md-device-chip:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-device-chip[data-state='error'] {
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-tertiary);
}

.dsh-md-device-chip[data-state='disabled'],
.dsh-md-device-chip[data-state='connecting'],
.dsh-md-device-chip[data-state='reconnecting'] {
  color: var(--dsw-alias-label-tertiary);
}

.dsh-md-device-chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-md-device-chip-offline {
  flex: none;
  padding: 0 5px;
  border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-interactive-bg-hover-solid);
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}

.dsh-md-device-chip-chevron {
  flex: none;
  opacity: 0.55;
}

.dsh-md-device-chip-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
}

.dsh-md-device-popover {
  position: fixed;
  z-index: 2147483001;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 300px;
  max-width: calc(100vw - 16px);
  padding: 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-panel);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-device-popover-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.dsh-md-device-popover-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
}

.dsh-md-device-popover-state {
  margin-left: auto;
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dsh-md-device-popover-rows {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 10px;
  margin: 0;
}

.dsh-md-device-popover-rows dt {
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}

.dsh-md-device-popover-rows dd {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  color: var(--dsw-alias-label-secondary);
}

.dsh-md-device-popover-hint,
.dsh-md-device-popover-error {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-md-device-popover-error {
  color: var(--dsw-alias-state-error-primary);
}

.dsh-md-device-popover-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 2px;
}

.dsh-md-device-popover-action {
  padding: 4px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}

.dsh-md-device-popover-action:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-device-chip-label {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dsh-md-device-menu {
  width: 340px;
}

.dsh-md-device-target-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
  list-style: none;
}

.dsh-md-device-target {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0.5px solid transparent;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  cursor: pointer;
}

.dsh-md-device-target:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-device-target[data-current='true'] {
  border-color: var(--dsw-alias-border-l2);
}

.dsh-md-device-target:disabled {
  opacity: 0.55;
  cursor: default;
}

.dsh-md-device-target-name {
  flex: none;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
}

.dsh-md-device-target-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ds-font-family-code);
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-md-device-target-meta {
  flex: none;
  font-size: 11px;
  color: var(--dsw-alias-state-warn-label);
}

.dsh-md-device-target[data-online='true'] .dsh-md-device-target-meta {
  color: var(--dsw-alias-state-success-primary);
}

/* Optional device marker in a Session row's leading cell */
.dsh-md-row-device {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  font-size: 9px;
  line-height: 1;
  font-weight: 600;
  flex: none;
  user-select: none;
}

.dsh-md-row-device[data-state='error'],
.dsh-md-row-device[data-state='disabled'] {
  color: var(--dsw-alias-label-tertiary);
  border-color: var(--dsw-alias-border-l3);
}

.dsh-md-row-device-badge {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--dsw-alias-state-warn-primary);
}

.dsh-md-row-device[data-state='error'] .dsh-md-row-device-badge,
.dsh-md-row-device[data-state='disabled'] .dsh-md-row-device-badge {
  background: var(--dsw-alias-label-tertiary);
}

.dsh-md-offline-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-md-offline-banner > :first-child {
  margin-top: 4px;
  flex: none;
}

.dsh-md-offline-banner-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.dsh-md-offline-banner-title {
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}

.dsh-md-offline-banner-desc {
  color: var(--dsw-alias-label-tertiary);
}

.dsh-md-offline-banner-error {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-state-error-primary);
  font-size: 11px;
}

.dsh-md-device-other {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dsh-md-device-other-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsh-md-device-other-back {
  margin-left: auto;
  padding: 2px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
}

.dsh-md-device-other-back:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-device-other-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.dsh-md-device-other-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dsh-md-device-other-device {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 500;
}

.dsh-md-device-other-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-md-device-other-state {
  margin-left: auto;
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-weight: 400;
}

.dsh-md-device-other-workspace {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 4px 8px;
  border: 0.5px solid transparent;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  cursor: pointer;
}

.dsh-md-device-other-workspace:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-md-device-other-workspace:disabled {
  opacity: 0.55;
  cursor: default;
}

.dsh-md-device-other-title {
  flex: none;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
}

.dsh-md-device-other-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ds-font-family-code);
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-md-offline-banner-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
}

.dsh-md-offline-banner-action {
  padding: 3px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}

.dsh-md-offline-banner-action:hover {
  background: var(--dsw-alias-interactive-bg-hover);
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

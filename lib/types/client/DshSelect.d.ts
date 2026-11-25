/**
 * Native DSH Design-Compliant Select Component (`DshSelect`).
 *
 * Replaces the crude browser-native `<select>` with a refined, theme-aware
 * dropdown that matches DeepSeek Harness's design language:
 * - DSH semantic design tokens (`--dsw-alias-*`, `--dsw-radius-*`, `--dsw-elevation-*`)
 * - Portalled onto `document.body` (`z-index: 1100`) so scrollable settings
 *   panels and modals never clip the listbox, with automatic upward flip near
 *   the bottom edge of the viewport
 * - Smooth chevron toggle animation
 * - Multi-line rich options (title, status dot, monospace description, checkmark)
 * - Keyboard navigation (`ArrowDown`/`ArrowUp`/`Home`/`End`/`Enter`/`Space`/`Escape`/`Tab`)
 * - Outside click and Escape key dismissal
 * - Full accessibility attributes (combobox/listbox pattern)
 *
 * @module dsh-multi-device/client/DshSelect
 */
import { type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';
import React from 'react';
export interface SelectDropdownPositionInput {
    readonly triggerRect: {
        readonly left: number;
        readonly right: number;
        readonly top: number;
        readonly bottom: number;
        readonly width: number;
    };
    readonly viewportWidth: number;
    readonly viewportHeight: number;
    readonly safeTop?: number;
    readonly compact?: boolean;
    readonly optionCount?: number;
    readonly maxDropdownHeight?: number;
}
export interface SelectDropdownPosition {
    readonly placement: 'bottom' | 'top';
    readonly top?: number;
    readonly bottom?: number;
    readonly left?: number;
    readonly right?: number;
    readonly minWidth: number;
    readonly maxHeight: number;
}
/**
 * Pure viewport-aware dropdown placement solver.
 *
 * Opens downward when space permits, flips upward near the bottom edge when
 * there is more room above than below, and clamps horizontal edges inside the
 * viewport across narrow and desktop screens.
 */
export declare function resolveSelectDropdownPosition(input: SelectDropdownPositionInput): SelectDropdownPosition;
export interface DshSelectOption<T extends string = string> {
    readonly value: T;
    readonly label: string;
    readonly description?: string;
    readonly badge?: string;
    readonly dotState?: StateDotState;
    readonly disabled?: boolean;
}
export interface DshSelectProps<T extends string = string> {
    readonly id?: string;
    readonly value: T;
    readonly options: readonly DshSelectOption<T>[];
    readonly onChange: (value: T) => void;
    readonly placeholder?: string;
    readonly disabled?: boolean;
    readonly compact?: boolean;
    readonly clearOnSelect?: boolean;
    readonly className?: string;
    readonly ariaLabel?: string;
    readonly style?: React.CSSProperties;
}
export declare function DshSelect<T extends string = string>({ id, value, options, onChange, placeholder, disabled, compact, clearOnSelect, className, ariaLabel, style, }: DshSelectProps<T>): React.ReactElement;

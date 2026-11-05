/**
 * Native DSH Design-Compliant Select Component (`DshSelect`).
 *
 * Replaces the crude browser-native `<select>` with a refined, theme-aware
 * dropdown that matches DeepSeek Harness's design language:
 * - DSH semantic design tokens (`--dsw-alias-*`, `--dsw-radius-*`, `--dsw-elevation-*`)
 * - Smooth chevron toggle animation
 * - Multi-line rich options (title, status dot, monospace description, checkmark)
 * - Outside click and Escape key dismissal
 * - Full accessibility attributes (combobox/listbox pattern)
 *
 * @module dsh-multi-device/client/DshSelect
 */
import { type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';
import React from 'react';
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

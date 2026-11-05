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
import {
  IconChevronDownOutlineRegular,
  StateDot,
  type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useEffect, useId, useRef, useState } from 'react'

export interface DshSelectOption<T extends string = string> {
  readonly value: T
  readonly label: string
  readonly description?: string
  readonly badge?: string
  readonly dotState?: StateDotState
  readonly disabled?: boolean
}

export interface DshSelectProps<T extends string = string> {
  readonly id?: string
  readonly value: T
  readonly options: readonly DshSelectOption<T>[]
  readonly onChange: (value: T) => void
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly compact?: boolean
  readonly clearOnSelect?: boolean
  readonly className?: string
  readonly ariaLabel?: string
  readonly style?: React.CSSProperties
}

function CheckmarkIcon(): React.ReactElement {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="dsh-md-select-check"
    >
      <polyline points="3 8.5 6.5 12 13 4.5" />
    </svg>
  )
}

export function DshSelect<T extends string = string>({
  id,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  compact = false,
  clearOnSelect = false,
  className = '',
  ariaLabel,
  style,
}: DshSelectProps<T>): React.ReactElement {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const listboxId = `${selectId}-listbox`
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const selectedOption = options.find(o => o.value === value)
  const displayLabel = selectedOption?.label ?? placeholder ?? (value !== '' ? value : '')

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleSelect = (optionValue: T): void => {
    onChange(optionValue)
    setOpen(false)
    if (!clearOnSelect) {
      triggerRef.current?.focus()
    }
  }

  const toggle = (): void => {
    if (disabled) return
    setOpen(prev => !prev)
  }

  return (
    <div
      ref={containerRef}
      className={`dsh-md-select-container${compact ? ' isCompact' : ''}${open ? ' isOpen' : ''}${disabled ? ' isDisabled' : ''} ${className}`.trim()}
      style={style}
    >
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        className="dsh-md-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel ?? placeholder}
        disabled={disabled}
        onClick={toggle}
      >
        <span className="dsh-md-select-trigger-content">
          {selectedOption?.dotState && (
            <StateDot state={selectedOption.dotState} size={7} />
          )}
          <span className={`dsh-md-select-label${!selectedOption && placeholder ? ' isPlaceholder' : ''}`}>
            {displayLabel}
          </span>
        </span>
        <span className={`dsh-md-select-arrow${open ? ' isOpen' : ''}`}>
          <IconChevronDownOutlineRegular size={13} />
        </span>
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel ?? placeholder}
          className="dsh-md-select-dropdown"
        >
          {options.length === 0 ? (
            <div className="dsh-md-select-empty">{placeholder ?? 'No options'}</div>
          ) : (
            options.map((opt) => {
              const isSelected = !clearOnSelect && opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  className={`dsh-md-select-option${isSelected ? ' isSelected' : ''}${opt.disabled ? ' isDisabled' : ''}`}
                  onClick={() => handleSelect(opt.value)}
                >
                  <div className="dsh-md-select-option-main">
                    {opt.dotState && (
                      <StateDot state={opt.dotState} size={7} />
                    )}
                    <span className="dsh-md-select-option-title">{opt.label}</span>
                    {opt.badge && (
                      <span className="dsh-md-select-option-badge">{opt.badge}</span>
                    )}
                  </div>
                  {opt.description && (
                    <div className="dsh-md-select-option-desc" title={opt.description}>
                      {opt.description}
                    </div>
                  )}
                  {isSelected && (
                    <span className="dsh-md-select-check-wrap">
                      <CheckmarkIcon />
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

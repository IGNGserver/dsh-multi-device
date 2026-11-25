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
import {
  IconChevronDownOutlineRegular,
  StateDot,
  type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const DROPDOWN_GAP = 4
const DROPDOWN_VIEWPORT_MARGIN = 12
const DROPDOWN_DEFAULT_MAX_HEIGHT = 240
const DROPDOWN_ESTIMATED_ROW_HEIGHT = 36

export interface SelectDropdownPositionInput {
  readonly triggerRect: {
    readonly left: number
    readonly right: number
    readonly top: number
    readonly bottom: number
    readonly width: number
  }
  readonly viewportWidth: number
  readonly viewportHeight: number
  readonly safeTop?: number
  readonly compact?: boolean
  readonly optionCount?: number
  readonly maxDropdownHeight?: number
}

export interface SelectDropdownPosition {
  readonly placement: 'bottom' | 'top'
  readonly top?: number
  readonly bottom?: number
  readonly left?: number
  readonly right?: number
  readonly minWidth: number
  readonly maxHeight: number
}

/**
 * Pure viewport-aware dropdown placement solver.
 *
 * Opens downward when space permits, flips upward near the bottom edge when
 * there is more room above than below, and clamps horizontal edges inside the
 * viewport across narrow and desktop screens.
 */
export function resolveSelectDropdownPosition(
  input: SelectDropdownPositionInput,
): SelectDropdownPosition {
  const { triggerRect, viewportWidth, viewportHeight } = input
  const safeTop = Math.max(DROPDOWN_VIEWPORT_MARGIN, input.safeTop ?? DROPDOWN_VIEWPORT_MARGIN)
  const capHeight = input.maxDropdownHeight ?? DROPDOWN_DEFAULT_MAX_HEIGHT
  const estimatedHeight = Math.min(
    capHeight,
    Math.max(44, (input.optionCount ?? 4) * DROPDOWN_ESTIMATED_ROW_HEIGHT + 12),
  )

  const spaceBelow = Math.max(0, viewportHeight - triggerRect.bottom - DROPDOWN_VIEWPORT_MARGIN - DROPDOWN_GAP)
  const spaceAbove = Math.max(0, triggerRect.top - safeTop - DROPDOWN_GAP)
  const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow

  const availableVertical = openUpward ? spaceAbove : spaceBelow
  const maxHeight = Math.max(96, Math.min(capHeight, availableVertical || capHeight))
  const maxAllowedWidth = Math.max(0, viewportWidth - DROPDOWN_VIEWPORT_MARGIN * 2)
  const minWidth = maxAllowedWidth > 0
    ? Math.min(Math.max(0, triggerRect.width), maxAllowedWidth)
    : Math.max(0, triggerRect.width)

  const horizontal: { readonly left?: number; readonly right?: number } = input.compact === true
    ? {
        right: Math.max(
          DROPDOWN_VIEWPORT_MARGIN,
          Math.min(
            Math.max(DROPDOWN_VIEWPORT_MARGIN, viewportWidth - triggerRect.right),
            Math.max(DROPDOWN_VIEWPORT_MARGIN, viewportWidth - DROPDOWN_VIEWPORT_MARGIN - minWidth),
          ),
        ),
      }
    : {
        left: Math.max(
          DROPDOWN_VIEWPORT_MARGIN,
          Math.min(
            triggerRect.left,
            Math.max(DROPDOWN_VIEWPORT_MARGIN, viewportWidth - DROPDOWN_VIEWPORT_MARGIN - minWidth),
          ),
        ),
      }

  if (openUpward) {
    return {
      placement: 'top',
      bottom: Math.max(DROPDOWN_VIEWPORT_MARGIN, viewportHeight - triggerRect.top + DROPDOWN_GAP),
      ...horizontal,
      minWidth,
      maxHeight,
    }
  }

  return {
    placement: 'bottom',
    top: Math.max(safeTop, triggerRect.bottom + DROPDOWN_GAP),
    ...horizontal,
    minWidth,
    maxHeight,
  }
}

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

function findNextEnabledIndex<T extends string>(
  options: readonly DshSelectOption<T>[],
  startIndex: number,
  step: 1 | -1,
): number {
  if (options.length === 0) return -1
  for (let offset = 0; offset < options.length; offset += 1) {
    const idx = (startIndex + step * offset + options.length) % options.length
    if (options[idx]?.disabled !== true) return idx
  }
  return -1
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
  const [activeIndex, setActiveIndex] = useState(-1)
  const [position, setPosition] = useState<SelectDropdownPosition | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const selectedIndex = options.findIndex(o => o.value === value && o.disabled !== true)
  const selectedOption = options.find(o => o.value === value)
  const displayLabel = selectedOption?.label ?? placeholder ?? (value !== '' ? value : '')

  const measureDropdown = useCallback((): void => {
    if (typeof window === 'undefined' || triggerRef.current === null) return
    const rect = triggerRef.current.getBoundingClientRect()
    const rawSafeTop = typeof document === 'undefined'
      ? Number.NaN
      : Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-overlay-top'))
    const next = resolveSelectDropdownPosition({
      triggerRect: rect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      safeTop: Number.isFinite(rawSafeTop) && rawSafeTop > 0 ? rawSafeTop : DROPDOWN_VIEWPORT_MARGIN,
      compact,
      optionCount: options.length,
    })
    setPosition(next)
  }, [compact, options.length])

  useBrowserLayoutEffect(() => {
    if (!open) {
      setPosition(undefined)
      return
    }
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : findNextEnabledIndex(options, 0, 1))
    measureDropdown()
  }, [open, measureDropdown, selectedIndex, options])

  useEffect(() => {
    if (!open || typeof window === 'undefined') return

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null
      if (
        target !== null
        && (containerRef.current?.contains(target) === true || dropdownRef.current?.contains(target) === true)
      ) {
        return
      }
      setOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    const handleReposition = (): void => { measureDropdown() }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [open, measureDropdown])

  useEffect(() => {
    if (!open || activeIndex < 0 || dropdownRef.current === null) return
    const activeEl = dropdownRef.current.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
    activeEl?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeIndex])

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

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      setActiveIndex(prev => findNextEnabledIndex(options, prev < 0 ? 0 : prev + 1, 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      setActiveIndex(prev => findNextEnabledIndex(options, prev <= 0 ? options.length - 1 : prev - 1, -1))
    } else if (event.key === 'Home' && open) {
      event.preventDefault()
      setActiveIndex(findNextEnabledIndex(options, 0, 1))
    } else if (event.key === 'End' && open) {
      event.preventDefault()
      setActiveIndex(findNextEnabledIndex(options, options.length - 1, -1))
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      const candidate = activeIndex >= 0 ? options[activeIndex] : undefined
      if (candidate !== undefined && candidate.disabled !== true) {
        event.preventDefault()
        handleSelect(candidate.value)
      }
    } else if (event.key === 'Tab' && open) {
      setOpen(false)
    }
  }

  const activeOptionId = open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
  const canPortal = typeof document !== 'undefined' && document.body !== null

  const dropdownStyle: React.CSSProperties | undefined = position === undefined
    ? undefined
    : {
        position: 'fixed',
        ...(position.top !== undefined ? { top: `${position.top}px`, bottom: 'auto' } : {}),
        ...(position.bottom !== undefined ? { bottom: `${position.bottom}px`, top: 'auto' } : {}),
        ...(position.left !== undefined ? { left: `${position.left}px`, right: 'auto' } : {}),
        ...(position.right !== undefined ? { right: `${position.right}px`, left: 'auto' } : {}),
        minWidth: `${position.minWidth}px`,
        maxHeight: `${position.maxHeight}px`,
      }

  const dropdownNode = open ? (
    <div
      ref={dropdownRef}
      id={listboxId}
      role="listbox"
      tabIndex={-1}
      aria-label={ariaLabel ?? placeholder}
      data-placement={position?.placement ?? 'bottom'}
      data-portal={canPortal ? 'true' : 'false'}
      className={`dsh-md-select-dropdown${canPortal ? ' isPortalled' : ''}`}
      style={dropdownStyle}
    >
      {options.length === 0 ? (
        <div className="dsh-md-select-empty">{placeholder ?? 'No options'}</div>
      ) : (
        options.map((opt, index) => {
          const isSelected = !clearOnSelect && opt.value === value
          const isActive = index === activeIndex
          return (
            <button
              key={opt.value}
              id={`${listboxId}-opt-${index}`}
              data-option-index={index}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={opt.disabled}
              className={`dsh-md-select-option${isSelected ? ' isSelected' : ''}${isActive ? ' isActive' : ''}${opt.disabled ? ' isDisabled' : ''}`}
              onMouseEnter={() => { if (opt.disabled !== true) setActiveIndex(index) }}
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
  ) : null

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
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-label={ariaLabel ?? placeholder}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={handleTriggerKeyDown}
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

      {dropdownNode !== null && (canPortal ? createPortal(dropdownNode, document.body) : dropdownNode)}
    </div>
  )
}

/**
 * React stand-in for `@deepseek-ai/dsh-client-ui-primitives` in tests.
 *
 * The real module ships inside DSH and is only an optional peer of this
 * package, so a test that imports a Client component would otherwise fail at
 * import time with "Could not resolve". `vitest.config.ts` aliases the bare
 * specifier here; suites that need different behaviour still override it with
 * their own `vi.mock`.
 *
 * Faithful only where a test can observe it: popups render nothing while
 * closed, menu rows are real `role="menuitem"` buttons, and the icons render as
 * empty spans so snapshots stay stable.
 */
import React, { type ReactNode } from 'react'

type AnyProps = Record<string, unknown> & { children?: ReactNode }

function passthrough(name: string) {
  const Component = ({ children, ...props }: AnyProps) => React.createElement(name, props, children)
  Component.displayName = name
  return Component
}

export const Button = ({ children, icon, variant, size, ...props }: AnyProps) =>
  React.createElement(
    'button',
    {
      ...props,
      type: (props.type as string | undefined) ?? 'button',
      ...(variant !== undefined ? { 'data-variant': String(variant) } : {}),
      ...(size !== undefined ? { 'data-size': String(size) } : {}),
    },
    icon as ReactNode,
    children,
  )
export const Input = (props: AnyProps) => React.createElement('input', props)
export const Switch = ({ checked, onChange, label, disabled }: AnyProps) =>
  React.createElement('button', {
    role: 'switch',
    'aria-checked': checked as boolean,
    'aria-label': label as string,
    disabled: disabled as boolean,
    onClick: () => {
      if (disabled === true) return
      ;(onChange as (next: boolean) => void)(!(checked as boolean))
    },
  })
export const Checkbox = ({ label, checked, onChange }: AnyProps) =>
  React.createElement(
    'label',
    {},
    React.createElement('input', {
      type: 'checkbox',
      checked: checked as boolean,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => (onChange as (next: boolean) => void)(event.target.checked),
    }),
    label as ReactNode,
  )
export const SegmentedControl = ({ value, options, onChange, label }: AnyProps) =>
  React.createElement(
    'div',
    { role: 'group', 'aria-label': label as string },
    (options as { value: string; label: ReactNode }[]).map(option =>
      React.createElement('button', {
        key: option.value,
        role: 'radio',
        'aria-checked': option.value === value,
        onClick: () => (onChange as (next: string) => void)(option.value),
      }, option.label)),
  )
export const SegmentedTabs = SegmentedControl
export const StateDot = ({ state, size: _size, appearance: _appearance }: AnyProps) =>
  React.createElement('span', { 'data-state': state as string })
export const Tag = ({ children }: AnyProps) => React.createElement('span', {}, children)
export const Pill = ({ children, active, ...props }: AnyProps) =>
  React.createElement('button', { ...props, type: 'button', 'data-active': active === true ? 'true' : 'false' }, children)
export const DisclosureRow = ({ title, open, children }: AnyProps) =>
  React.createElement('div', {}, title as ReactNode, open === true ? children as ReactNode : null)
export const Modal = ({ open, title, description, footer, children }: AnyProps) =>
  open === true
    ? React.createElement(
        'div',
        { role: 'dialog', 'aria-label': title as string },
        description !== undefined ? React.createElement('p', {}, description as ReactNode) : null,
        children,
        footer !== undefined ? React.createElement('div', { 'data-modal-footer': 'true' }, footer as ReactNode) : null,
      )
    : null
export const Toast = ({ text }: AnyProps) => React.createElement('div', { role: 'status' }, text as ReactNode)
export const Tooltip = ({ children }: AnyProps) => React.createElement(React.Fragment, {}, children)
export const MenuItemButton = ({ children, icon, onSelect, disabled }: AnyProps) =>
  React.createElement(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      disabled: disabled as boolean,
      onClick: () => (onSelect as () => void)(),
    },
    icon as ReactNode,
    children,
  )
export const MenuSurface = passthrough('div')
export const MenuGroup = ({ label, children }: AnyProps) =>
  React.createElement('section', { role: 'group', 'aria-label': label as string }, children)
/** Closed menus render only their anchor, exactly like the real primitive. */
export const Menu = ({ open, anchor, children, className }: AnyProps) =>
  React.createElement(
    'span',
    {},
    anchor as ReactNode,
    open === true
      ? React.createElement('div', { role: 'menu', className: className as string }, children)
      : null,
  )

const Icon = ({ size: _size, className: _className, ...props }: AnyProps) => React.createElement('span', props)

export const IconPlusOutlineRegular = Icon
export const IconRefreshOutlineRegular = Icon
export const IconEditOutlineRegular = Icon
export const IconTrashOutlineRegular = Icon
export const IconSettingsOutlineRegular = Icon
export const IconSettingsOutlineMedium = Icon
export const IconRightUpOutlineRegular = Icon
export const IconChevronLeftOutlineRegular = Icon
export const IconChevronDownOutlineRegular = Icon
export const IconChevronRightOutlineRegular = Icon
export const IconCloseOutlineRegular = Icon
export const IconWarningOutlineRegular = Icon
export const IconWarningTriangleOutlineRegular = Icon
export const IconCheckCircleFillRegular = Icon
export const IconGlobeOutlineRegular = Icon
export const IconInfoOutlineRegular = Icon
export const IconArchiveOutlineRegular = Icon
export const IconSearchOutlineRegular = Icon
export const IconEllipsisOutlineRegular = Icon
export const IconWorkspaceTreeOutlineRegular = Icon
export const IconFolderOpenOutlineRegular = Icon

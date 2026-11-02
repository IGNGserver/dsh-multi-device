declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type * as React from 'react'

  export type StateDotState = 'idle' | 'ongoing' | 'done' | 'error'

  export interface IconProps extends React.SVGProps<SVGSVGElement> {
    readonly size?: number
    readonly className?: string
  }

  export type IconComponent = React.ComponentType<IconProps>

  export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    readonly variant?: 'primary' | 'outline' | 'ghost'
    readonly size?: 'sm' | 'md' | 'toolbar' | 'icon'
    readonly icon?: React.ReactNode
    readonly className?: string
    readonly children?: React.ReactNode
  }
  export const Button: React.ForwardRefExoticComponent<
    ButtonProps & React.RefAttributes<HTMLButtonElement>
  >

  export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    readonly icon?: React.ReactNode
    readonly className?: string
  }
  export const Input: React.ForwardRefExoticComponent<
    InputProps & React.RefAttributes<HTMLInputElement>
  >

  export interface SwitchProps {
    readonly checked: boolean
    readonly onChange: (checked: boolean) => void
    readonly label: string
    readonly disabled?: boolean
    readonly title?: string
    readonly className?: string
  }
  export const Switch: React.ComponentType<SwitchProps>

  export interface CheckboxProps {
    readonly label: React.ReactNode
    readonly checked: boolean
    readonly disabled?: boolean
    readonly onChange: (checked: boolean) => void
    readonly className?: string
  }
  export const Checkbox: React.ComponentType<CheckboxProps>

  export interface SegmentedOption<T extends string = string> {
    readonly value: T
    readonly label: React.ReactNode
    readonly disabled?: boolean
    readonly title?: string
  }
  export interface SegmentedControlProps<T extends string = string> {
    readonly id?: string
    readonly value: T
    readonly options: readonly SegmentedOption<T>[]
    readonly onChange: (value: T) => void
    readonly label: string
    readonly disabled?: boolean
    readonly className?: string
  }
  export function SegmentedControl<T extends string = string>(
    props: SegmentedControlProps<T>,
  ): React.ReactElement

  export interface StateDotProps {
    readonly state: StateDotState
    readonly size?: number
    readonly className?: string
    readonly appearance?: 'dot' | 'step'
  }
  export const StateDot: React.ComponentType<StateDotProps>

  export interface TagProps {
    readonly tone?: 'outline' | string
    readonly className?: string
    readonly children?: React.ReactNode
  }
  export const Tag: React.ComponentType<TagProps>

  export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    readonly active?: boolean
    readonly className?: string
    readonly children?: React.ReactNode
    readonly onClick?: React.MouseEventHandler<HTMLButtonElement>
  }
  export const Pill: React.ComponentType<PillProps>

  export interface DisclosureRowProps {
    readonly icon?: React.ReactNode
    readonly title: React.ReactNode
    readonly open: boolean
    readonly expandable: boolean
    readonly onToggle: () => void
    readonly running?: boolean
    readonly expandOnRowClick?: boolean
    readonly previewChevron?: boolean
    readonly keepContentWhenOpen?: boolean
    readonly collapsedContent?: React.ReactNode
    readonly headerAccessory?: React.ReactNode
    readonly children?: React.ReactNode
    readonly className?: string
    readonly rowClassName?: string
    readonly contentClassName?: string
  }
  export const DisclosureRow: React.ComponentType<DisclosureRowProps>

  export interface ModalProps {
    readonly open: boolean
    readonly onClose: () => void
    readonly title?: string
    readonly closeLabel?: string
    readonly description?: React.ReactNode
    readonly children?: React.ReactNode
    readonly footer?: React.ReactNode
    readonly className?: string
    readonly contentClassName?: string
    readonly headless?: boolean
    readonly backdropBlur?: boolean
    readonly shortcutModal?: string
  }
  export const Modal: React.ComponentType<ModalProps>

  export interface ToastProps {
    readonly text: string
    readonly icon?: React.ReactNode
    readonly tone?: 'success' | 'warning' | 'error' | string
    readonly holdMs?: number
    readonly actions?: React.ReactNode
    readonly onDone: () => void
  }
  export const Toast: React.ComponentType<ToastProps>

  export interface TooltipProps {
    readonly label: React.ReactNode | (() => React.ReactNode)
    readonly shortcutKeys?: readonly string[]
    readonly side?: 'top' | 'right' | 'bottom' | 'left'
    readonly align?: 'start' | 'center' | 'end'
    readonly delayMs?: number
    readonly disabled?: boolean
    readonly portal?: boolean
    readonly maxWidth?: number
    readonly openOnClick?: boolean
    readonly children: React.ReactElement
  }
  export const Tooltip: React.ComponentType<TooltipProps>

  export interface MenuItemButtonProps {
    readonly children: React.ReactNode
    readonly icon?: React.ReactNode
    readonly current?: boolean
    readonly disabled?: boolean
    readonly danger?: boolean
    readonly separatorBefore?: boolean
    readonly onSelect: () => void
  }
  export const MenuItemButton: React.ComponentType<MenuItemButtonProps>

  export const IconPlusOutlineRegular: IconComponent
  export const IconRefreshOutlineRegular: IconComponent
  export const IconEditOutlineRegular: IconComponent
  export const IconTrashOutlineRegular: IconComponent
  export const IconSettingsOutlineRegular: IconComponent
  export const IconSettingsOutlineMedium: IconComponent
  export const IconRightUpOutlineRegular: IconComponent
  export const IconChevronLeftOutlineRegular: IconComponent
  export const IconChevronDownOutlineRegular: IconComponent
  export const IconChevronRightOutlineRegular: IconComponent
  export const IconCloseOutlineRegular: IconComponent
  export const IconWarningOutlineRegular: IconComponent
  export const IconCheckCircleFillRegular: IconComponent
  export const IconGlobeOutlineRegular: IconComponent
}

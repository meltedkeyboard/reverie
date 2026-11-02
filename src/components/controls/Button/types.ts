import type { Icon } from '@/components/visuals/Icon'
import type { ComponentProps } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'glass' | 'solid'

export type ButtonProps = {
  label: string
  icon?: ComponentProps<typeof Icon>['name']
  // Optional because a Link with asChild injects its own onPress.
  onPress?: () => void
  disabled?: boolean
  loading?: boolean
  // primary: solid accent. secondary: neutral. soft: accent on a tint, for actions
  // inside a form. glass: the big call to action, Liquid Glass tinted with the accent.
  // solid: the same capsule filled with the accent, without the glass, for a screen whose
  // one button should read as a plain filled one.
  variant?: ButtonVariant
  style?: StyleProp<ViewStyle>
}

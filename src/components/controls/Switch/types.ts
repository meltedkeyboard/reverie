import type { StyleProp, ViewStyle } from 'react-native'

export type SwitchProps = {
  value: boolean
  onValueChange?: (value: boolean) => void
  disabled?: boolean
  accessibilityLabel?: string
  trackColor?: { false?: string; true?: string }
  thumbColor?: string
  style?: StyleProp<ViewStyle>
}

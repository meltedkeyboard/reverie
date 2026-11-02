import type { StyleProp, ViewStyle } from 'react-native'
import type { MenuItem } from '../../overlays/NativeMenu'

export type PickerBoxProps = {
  value: string
  placeholder: string
  // One row of the system menu per choice.
  items: MenuItem[]
  accessibilityLabel?: string
  // Extra style for the box, to match the fields around it.
  fallbackStyle?: StyleProp<ViewStyle>
}

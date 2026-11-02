import type { StyleProp, ViewStyle } from 'react-native'

export type SliderProps = {
  value: number
  minimumValue?: number
  maximumValue?: number
  step?: number
  onValueChange?: (value: number) => void
  onSlidingStart?: () => void
  onSlidingComplete?: (value: number) => void
  disabled?: boolean
  minimumTrackTintColor?: string
  maximumTrackTintColor?: string
  thumbTintColor?: string
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

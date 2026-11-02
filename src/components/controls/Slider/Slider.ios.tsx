import RNSlider from '@react-native-community/slider'

import type { SliderProps } from './types'

export function Slider({
  value,
  minimumValue = 0,
  maximumValue = 1,
  step = 0,
  onValueChange,
  onSlidingStart,
  onSlidingComplete,
  disabled,
  minimumTrackTintColor,
  maximumTrackTintColor,
  thumbTintColor,
  accessibilityLabel,
  style,
}: SliderProps) {
  return (
    <RNSlider
      value={value}
      minimumValue={minimumValue}
      maximumValue={maximumValue}
      step={step}
      onValueChange={onValueChange}
      onSlidingStart={onSlidingStart}
      onSlidingComplete={onSlidingComplete}
      disabled={disabled}
      minimumTrackTintColor={minimumTrackTintColor}
      maximumTrackTintColor={maximumTrackTintColor}
      thumbTintColor={thumbTintColor}
      accessibilityLabel={accessibilityLabel}
      style={style}
    />
  )
}

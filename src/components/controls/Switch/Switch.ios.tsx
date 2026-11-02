import { Switch as RNSwitch } from 'react-native'

import * as Haptics from '@/lib/ui/haptics'
import { useColors } from '@/theme'

import type { SwitchProps } from './types'

export function Switch({ value, onValueChange, disabled, accessibilityLabel, trackColor, style }: SwitchProps) {
  const colors = useColors()
  return (
    <RNSwitch
      value={value}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      onValueChange={(next) => {
        Haptics.selectionAsync()
        onValueChange?.(next)
      }}
      trackColor={{ true: trackColor?.true ?? colors.accent, false: trackColor?.false }}
      style={style}
    />
  )
}

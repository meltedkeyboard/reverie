import { Switch as RNSwitch } from 'react-native'

import { isDesktop } from '@/lib/core/platform'
import * as Haptics from '@/lib/ui/haptics'
import { useColors } from '@/theme'

import type { SwitchProps } from './types'

export function Switch({ value, onValueChange, disabled, accessibilityLabel, trackColor, thumbColor, style }: SwitchProps) {
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
      trackColor={{ true: trackColor?.true ?? colors.accent, false: trackColor?.false ?? colors.borderStrong }}
      {...(isDesktop
        ? ({ thumbColor: thumbColor ?? '#FFFFFF', activeThumbColor: '#FFFFFF' } as object)
        : thumbColor
        ? { thumbColor }
        : {})}
      style={style}
    />
  )
}

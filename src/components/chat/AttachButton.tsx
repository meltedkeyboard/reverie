import { Icon } from '@/components/visuals/Icon'
import { View } from 'react-native'

import { useColors } from '@/theme'

import { GlassSurface, useGlassStyles } from '../chrome/Glass'
import { ImageSourceMenu } from '../overlays/ImageSourceMenu'
import { nativeMenuGlass } from '../overlays/NativeMenu'
import type { ImageSource } from '@/lib/images/images'

type Props = {
  disabled: boolean
  size?: number
  onPick: (source: ImageSource) => void
}

export function AttachButton({ disabled, onPick, size = 44 }: Props) {
  const colors = useColors()
  const styles = useGlassStyles()
  const icon = <Icon name="add" size={24} color={colors.text} />
  const shape = { width: size, height: size, borderRadius: size / 2 }
  const circle = (
    <GlassSurface style={[styles.circle, shape]} fallbackStyle={styles.solid}>
      {icon}
    </GlassSurface>
  )

  return (
    <ImageSourceMenu
      onPick={onPick}
      opensUp
      disabled={disabled}
      // With Liquid Glass the menu draws the circle's glass and hosts the icon inside
      // its label, so the menu morphs out of the button.
      glassRadius={size / 2}
      style={disabled && { opacity: 0.55 }}
    >
      {nativeMenuGlass ? <View style={[styles.circle, shape]}>{icon}</View> : circle}
    </ImageSourceMenu>
  )
}

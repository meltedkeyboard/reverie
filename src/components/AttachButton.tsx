import Ionicons from '@expo/vector-icons/Ionicons'
import { Platform, Pressable, View } from 'react-native'

import { useColors } from '@/theme'

import { GlassSurface, useGlassStyles } from './Glass'
import { ImageSourceMenu } from './ImageSourceMenu'
import { nativeMenuGlass } from './NativeMenu'
import type { ImageSource } from '@/lib/images'

type Props = {
  disabled: boolean
  onPick: (source: ImageSource) => void
}

export function AttachButton({ disabled, onPick }: Props) {
  const colors = useColors()
  const styles = useGlassStyles()
  const icon = <Ionicons name="add" size={24} color={colors.text} />
  const circle = (
    <GlassSurface style={styles.circle} fallbackStyle={styles.solid}>
      {icon}
    </GlassSurface>
  )

  // A browser has no separate camera flow, the file dialog covers it.
  if (Platform.OS === 'web') {
    return (
      <Pressable
        onPress={() => onPick('library')}
        disabled={disabled}
        hitSlop={6}
        style={({ pressed }) => (pressed || disabled) && { opacity: 0.55 }}
      >
        {circle}
      </Pressable>
    )
  }

  return (
    <ImageSourceMenu
      onPick={onPick}
      opensUp
      disabled={disabled}
      // With Liquid Glass the menu draws the circle's glass and hosts the icon inside
      // its label, so the menu morphs out of the button.
      glassRadius={22}
      style={disabled && { opacity: 0.55 }}
    >
      {nativeMenuGlass ? <View style={styles.circle}>{icon}</View> : circle}
    </ImageSourceMenu>
  )
}

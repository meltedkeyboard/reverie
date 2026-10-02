import Ionicons from '@expo/vector-icons/Ionicons'
import { View } from 'react-native'

import { useColors } from '@/theme'

import { GlassSurface, useGlassStyles } from './Glass'
import { NativeMenu, nativeMenuGlass, type MenuItem } from './NativeMenu'

type Props = {
  icon: React.ComponentProps<typeof Ionicons>['name']
  items: MenuItem[]
  size?: number
  disabled?: boolean
}

// A round glass icon button that opens a menu, for a header: the same circle as
// GlassButton, with the menu growing out of it.
export function MenuGlassButton({ icon, items, size = 44, disabled }: Props) {
  const colors = useColors()
  const styles = useGlassStyles()
  const glyph = <Ionicons name={icon} size={22} color={colors.text} />
  const shape = { width: size, height: size, borderRadius: size / 2 }
  const circle = (
    <GlassSurface interactive style={[styles.circle, shape]} fallbackStyle={styles.solid}>
      {glyph}
    </GlassSurface>
  )

  // With Liquid Glass the menu draws the circle's glass and hosts the icon inside its
  // label, so the menu morphs out of the button.
  return (
    <NativeMenu items={items} disabled={disabled} glassRadius={size / 2}>
      {nativeMenuGlass ? <View style={[styles.circle, shape]}>{glyph}</View> : circle}
    </NativeMenu>
  )
}

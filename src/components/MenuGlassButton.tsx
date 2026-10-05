import { Icon } from '@/components/Icon'
import { View } from 'react-native'

import { showSheet } from '@/lib/dialogs'
import { isDesktop } from '@/lib/platform'
import { useColors } from '@/theme'

import { GlassSurface, useGlassStyles } from './Glass'
import { IconButton } from './IconButton'
import { NativeMenu, nativeMenuGlass, type MenuItem } from './NativeMenu'

type Props = {
  icon: React.ComponentProps<typeof Icon>['name']
  items: MenuItem[]
  size?: number
  disabled?: boolean
}

// A round glass icon button that opens a menu, for a header: the same circle as
// GlassButton, with the menu growing out of it.
export function MenuGlassButton({ icon, items, size = 44, disabled }: Props) {
  const colors = useColors()
  const styles = useGlassStyles()
  const glyph = <Icon name={icon} size={22} color={colors.text} />
  const shape = { width: size, height: size, borderRadius: size / 2 }
  const circle = (
    <GlassSurface interactive style={[styles.circle, shape]} fallbackStyle={styles.solid}>
      {glyph}
    </GlassSurface>
  )

  // On the desktop the flat square of IconButton, like the buttons beside it; the menu is the
  // same sheet NativeMenu opens on the web, at the pointer.
  if (isDesktop) {
    return (
      <IconButton name={icon} disabled={disabled} onPress={() => showSheet(undefined, items)} />
    )
  }

  // With Liquid Glass the menu draws the circle's glass and hosts the icon inside its
  // label, so the menu morphs out of the button.
  return (
    <NativeMenu items={items} disabled={disabled} glassRadius={size / 2}>
      {nativeMenuGlass ? <View style={[styles.circle, shape]}>{glyph}</View> : circle}
    </NativeMenu>
  )
}

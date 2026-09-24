import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { showSheet } from '@/lib/dialogs'
import { swiftUI } from '@/lib/nativeUI'
import { useColors, useStyles, type Colors } from '@/theme'

import { IconButton } from './IconButton'
import { NativeMenu, type MenuItem } from './NativeMenu'

type Props = {
  onOpen: () => void
  menu: MenuItem[]
  // Title of the action sheet the menu falls back to.
  menuTitle?: string
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

// A tappable card in a list with a menu behind the trailing ellipsis. On iOS it is the
// system menu growing out of the ellipsis; elsewhere an action sheet, which a long press
// on the card opens too.
export function ListCard({ onOpen, menu, menuTitle, style, children }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const openSheet = () => showSheet(menuTitle, menu)
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={swiftUI ? undefined : openSheet}
      style={({ pressed }) => [styles.card, style, pressed && { transform: [{ scale: 0.985 }], opacity: 0.9 }]}
    >
      {children}
      {swiftUI ? (
        // Claims the touch, so the card does not open under the menu.
        <View onStartShouldSetResponder={() => true}>
          <NativeMenu items={menu} style={styles.menu}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textFaint} />
          </NativeMenu>
        </View>
      ) : (
        <IconButton name="ellipsis-horizontal" size={18} color={colors.textFaint} onPress={openSheet} />
      )}
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      paddingVertical: 14,
      paddingLeft: 16,
      paddingRight: 6,
    },
    // The same box as the IconButton it replaces.
    menu: { width: 40, height: 40 },
  })

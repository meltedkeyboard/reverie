import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useReorderableDrag } from 'react-native-reorderable-list'

import { useTranslation } from '@/i18n'
import { showSheet } from '@/lib/dialogs'
import { swiftUI } from '@/lib/nativeUI'
import { useColors, useStyles, type Colors } from '@/theme'

import { IconButton } from './IconButton'
import { NativeMenu, type MenuItem } from './NativeMenu'
import { SwipeToDelete } from './SwipeToDelete'

type Props = {
  onOpen: () => void
  // Asks and deletes; a swipe to the left reaches it.
  onDelete: () => void
  menu: MenuItem[]
  // Title of the action sheet the menu falls back to.
  menuTitle?: string
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

// A tappable card in a list with a menu behind the trailing ellipsis. On iOS it is the
// system menu growing out of the ellipsis; elsewhere an action sheet. A long press picks
// the card up to drag it to another place in the list, and a swipe to the left uncovers
// a trash button. Only for a list that reorders.
export function ListCard({ onOpen, onDelete, menu, menuTitle, style, children }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const drag = useReorderableDrag()
  const openSheet = () => showSheet(menuTitle, menu)
  return (
    <SwipeToDelete radius={RADIUS} label={t('common.delete')} onDelete={onDelete}>
      <Pressable
        onPress={onOpen}
        onLongPress={drag}
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
    </SwipeToDelete>
  )
}

const RADIUS = 20

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS,
      paddingVertical: 14,
      paddingLeft: 16,
      paddingRight: 6,
    },
    // The same box as the IconButton it replaces.
    menu: { width: 40, height: 40 },
  })

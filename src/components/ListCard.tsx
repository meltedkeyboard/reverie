import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useReorderableDrag } from 'react-native-reorderable-list'

import { useTranslation } from '@/i18n'
import { isConfirmDeleteOn } from '@/lib/confirmDelete'
import { showSheet } from '@/lib/dialogs'
import { liquidGlass, swiftUI } from '@/lib/nativeUI'
import { useColors, useStyles, type Colors } from '@/theme'

import { GlassSurface } from './Glass'
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
//
// On iOS 26 the card is clear Liquid Glass with nothing under it: the regular glass over a
// solid fill turned into a grey haze in the dark scheme. The glass is a sibling of the
// content rather than inside it: clipped, its rim and the swell of a touch would be cut
// off at the corners.
export function ListCard({ onOpen, onDelete, menu, menuTitle, style, children }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const drag = useReorderableDrag()
  const openSheet = () => showSheet(menuTitle, menu)
  const menuButton = swiftUI ? (
    // Claims the touch, so the card does not open under the menu.
    <View onStartShouldSetResponder={() => true}>
      <NativeMenu items={menu} style={styles.menu}>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textFaint} />
      </NativeMenu>
    </View>
  ) : (
    <IconButton name="ellipsis-horizontal" size={18} color={colors.textFaint} onPress={openSheet} />
  )

  if (liquidGlass) {
    return (
      <SwipeToDelete radius={RADIUS} label={t('common.delete')} onDelete={onDelete} throwAway={!isConfirmDeleteOn()}>
        <Pressable onPress={onOpen} onLongPress={drag}>
          <GlassSurface interactive variant="clear" style={styles.layer} />
          <View style={[styles.card, styles.glassCard, style]}>
            {children}
            {menuButton}
          </View>
        </Pressable>
      </SwipeToDelete>
    )
  }

  return (
    <SwipeToDelete radius={RADIUS} label={t('common.delete')} onDelete={onDelete} throwAway={!isConfirmDeleteOn()}>
      <Pressable
        onPress={onOpen}
        onLongPress={drag}
        style={({ pressed }) => [styles.card, style, pressed && { transform: [{ scale: 0.985 }], opacity: 0.9 }]}
      >
        {children}
        {menuButton}
      </Pressable>
    </SwipeToDelete>
  )
}

const RADIUS = 20

const LAYER = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  borderRadius: RADIUS,
  borderCurve: 'continuous',
} as const

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
      // The corners of Liquid Glass are this curve, not a circular arc.
      borderCurve: 'continuous',
      paddingVertical: 14,
      paddingLeft: 16,
      paddingRight: 6,
    },
    // The glass behind the content; it draws the edge in place of the border.
    layer: LAYER,
    glassCard: { borderWidth: 0, backgroundColor: 'transparent' },
    // The same box as the IconButton it replaces.
    menu: { width: 40, height: 40 },
  })

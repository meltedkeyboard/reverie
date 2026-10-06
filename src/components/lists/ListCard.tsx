import { Icon } from '@/components/visuals/Icon'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useReorderableDrag } from 'react-native-reorderable-list'

import { isDesktop } from '@/lib/core/platform'
import { useTranslation } from '@/i18n'
import { isConfirmDeleteOn } from '@/lib/settings/confirmDelete'
import { showSheet } from '@/lib/ui/dialogs'
import { liquidGlass, swiftUI } from '@/lib/ui/nativeUI'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

import { GlassSurface } from '../chrome/Glass'
import { IconButton } from '../controls/IconButton'
import { NativeMenu, type MenuItem } from '../overlays/NativeMenu'
import { SwipeToDelete } from './SwipeToDelete'

type Props = {
  onOpen: () => void
  // Asks and deletes; a swipe to the left reaches it.
  onDelete: () => void
  menu: MenuItem[]
  // Title of the action sheet the menu falls back to.
  menuTitle?: string
  style?: StyleProp<ViewStyle>
  // Children stack top to bottom (a large card with a picture on top), the menu over a corner.
  vertical?: boolean
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
export function ListCard({ onOpen, onDelete, menu, menuTitle, style, vertical, children }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const drag = useReorderableDrag()
  const openSheet = () => showSheet(menuTitle, menu)
  // In a vertical card the ellipsis floats over the picture, on a dark disc to stay readable.
  const iconColor = vertical ? ON_ACCENT : colors.textFaint
  const menuButton = swiftUI ? (
    // Claims the touch, so the card does not open under the menu.
    <View onStartShouldSetResponder={() => true} style={vertical && styles.floating}>
      <NativeMenu items={menu} style={styles.menu}>
        <Icon name="ellipsis-horizontal" size={18} color={iconColor} />
      </NativeMenu>
    </View>
  ) : (
    <View style={vertical && styles.floating}>
      <IconButton name="ellipsis-horizontal" size={18} color={iconColor} onPress={openSheet} />
    </View>
  )
  const cardStyle = [styles.card, vertical && styles.vertical, style]

  if (liquidGlass) {
    return (
      <SwipeToDelete radius={RADIUS} label={t('common.delete')} onDelete={onDelete} throwAway={!isConfirmDeleteOn()}>
        <Pressable onPress={onOpen} onLongPress={drag}>
          <GlassSurface interactive variant="clear" style={styles.layer} />
          <View style={[cardStyle, styles.glassCard]}>
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
        // On the desktop a flat list row: no outline, greyer under the pointer.
        style={(state) =>
          isDesktop
            ? [cardStyle, (state as { hovered?: boolean }).hovered && styles.hovered, state.pressed && styles.pressedFlat]
            : [cardStyle, state.pressed && { transform: [{ scale: 0.985 }], opacity: 0.9 }]
        }
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
    vertical: { flexDirection: 'column', alignItems: 'stretch', gap: 0, paddingVertical: 0, paddingLeft: 0, paddingRight: 0 },
    ...(isDesktop
      ? {
          card: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.surface,
            borderRadius: 8,
            paddingVertical: 10,
            paddingLeft: 14,
            paddingRight: 6,
          },
        }
      : {}),
    hovered: { backgroundColor: colors.surfaceRaised },
    pressedFlat: { backgroundColor: colors.border },
    floating: {
      position: 'absolute',
      top: 8,
      right: 8,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
  })

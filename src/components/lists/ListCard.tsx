import { Icon } from '@/components/visuals/Icon'
import { useEffect } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useReorderableDrag } from 'react-native-reorderable-list'

import { isDesktop } from '@/lib/core/platform'
import { useTranslation } from '@/i18n'
import { isConfirmDeleteOn } from '@/lib/settings/confirmDelete'
import { showSheet } from '@/lib/ui/dialogs'
import { liquidGlass, swiftUI } from '@/lib/ui/nativeUI'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

import { GlassSurface } from '../chrome/Glass'
import { IconButton } from '../controls/IconButton'
import { SFIcon } from '../visuals/SFIcon'
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
  // A plain card even with Liquid Glass around it.
  solid?: boolean
  // Off where a long press belongs to something else (the system drag of the characters).
  longPressDrag?: boolean
  // The edit mode of a list: a check slides in on the left, the handle takes the place of
  // the ellipsis and is the only way to drag the card, and a tap ticks it in place of
  // opening it. Only for a solid card; it stays mounted so the change animates.
  // With `opens` a tap still opens the card (a group unfolds) and only the check ticks it.
  editing?: { active: boolean; checked: boolean; onToggle: () => void; opens?: boolean }
  // Drawn in place of the ellipsis, for a card whose menu is only the long press.
  trailing?: React.ReactNode
  // An action behind a swipe to the right (see SwipeToDelete).
  leading?: React.ComponentProps<typeof SwipeToDelete>['leading']
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
export function ListCard({ onOpen, onDelete, menu, menuTitle, style, vertical, solid, longPressDrag = true, editing, trailing, leading, children }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const drag = useReorderableDrag()
  const openSheet = () => showSheet(menuTitle, menu)
  // In a vertical card the ellipsis floats over the picture, on a dark disc to stay readable.
  const iconColor = vertical ? ON_ACCENT : colors.textFaint
  const menuButton = trailing ? (
    <View style={styles.menu}>{trailing}</View>
  ) : swiftUI ? (
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

  const onLongPress = longPressDrag ? drag : undefined
  const active = editing?.active ?? false

  // The spring of a UITableView entering edit mode: critically damped, about a third of a second.
  const progress = useSharedValue(active ? 1 : 0)
  useEffect(() => {
    progress.value = withSpring(active ? 1 : 0, { duration: 350, dampingRatio: 1 })
  }, [active, progress])
  // Only transforms move while the spring runs: animating a width relaid out every card on
  // every frame on the UI thread, and the scroll stuttered along with it. The content's real
  // inset changes once, as the spring starts, and a shift holds the content where it was, so
  // the text is cut to its new width right away, under the fading ellipsis, not at the end.
  const settled = useSharedValue(active ? 1 : 0)
  useEffect(() => {
    settled.value = active ? 1 : 0
  }, [active, settled])
  const gap = Number(StyleSheet.flatten(cardStyle).gap ?? 0)
  const shift = CHECK_WIDTH + gap
  const checkStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: (progress.value - 1) * CHECK_WIDTH }, { scale: interpolate(progress.value, [0, 1], [0.5, 1]) }],
  }))
  const insetStyle = useAnimatedStyle(() => ({ paddingLeft: settled.value * shift }))
  const shiftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (progress.value - settled.value) * shift }] }))
  const menuStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }))
  const handleStyle = useAnimatedStyle(() => ({ opacity: progress.value }))

  if (liquidGlass && !solid) {
    return (
      <SwipeToDelete radius={RADIUS} label={t('common.delete')} onDelete={onDelete} throwAway={!isConfirmDeleteOn()}>
        <Pressable onPress={onOpen} onLongPress={onLongPress}>
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
    <SwipeToDelete radius={RADIUS} label={t('common.delete')} onDelete={onDelete} throwAway={!isConfirmDeleteOn()} disabled={active} leading={leading}>
      <Pressable
        onPress={active && !editing?.opens ? editing?.onToggle : onOpen}
        onLongPress={active ? undefined : onLongPress}
        // On the desktop a flat list row: no outline, greyer under the pointer.
        style={(state) =>
          isDesktop
            ? [cardStyle, (state as { hovered?: boolean }).hovered && styles.hovered, state.pressed && styles.pressedFlat]
            : [cardStyle, state.pressed && !active && { transform: [{ scale: 0.985 }], opacity: 0.9 }]
        }
      >
        {editing ? (
          <>
            <Animated.View style={[styles.content, { gap }, insetStyle]}>
              <Animated.View style={[styles.content, { gap }, shiftStyle]}>{children}</Animated.View>
            </Animated.View>
            {/* Over the content, so the check takes its own tap where a tap opens the card. */}
            <Animated.View style={[styles.check, checkStyle]} pointerEvents={active && editing.opens ? 'auto' : 'none'}>
              <Pressable onPress={editing.onToggle} hitSlop={8} style={styles.checkTap}>
                <SFIcon
                  name={editing.checked ? 'checkmark.circle.fill' : 'circle'}
                  fallback={editing.checked ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={editing.checked ? colors.accent : colors.textFaint}
                  animateChange
                />
              </Pressable>
            </Animated.View>
          </>
        ) : (
          children
        )}
        {editing ? (
          <View>
            <Animated.View style={menuStyle} pointerEvents={active ? 'none' : 'auto'}>
              {menuButton}
            </Animated.View>
            {/* The handle claims the touch on its own, so a press there drags at once. */}
            <Animated.View style={[styles.handleLayer, handleStyle]} pointerEvents={active ? 'auto' : 'none'}>
              <Pressable onPressIn={drag} hitSlop={8} style={styles.handle} accessibilityLabel={t('characters.reorder')}>
                <SFIcon name="line.3.horizontal" fallback="reorder-three" size={20} color={colors.textFaint} />
              </Pressable>
            </Animated.View>
          </View>
        ) : (
          menuButton
        )}
      </Pressable>
    </SwipeToDelete>
  )
}

const CHECK_WIDTH = 40

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
    menu: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
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
    check: { position: 'absolute', top: 0, bottom: 0, left: 0, width: CHECK_WIDTH, alignItems: 'center', justifyContent: 'center' },
    // Stands in for the card's own row, so the content keeps its layout inside.
    content: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center' },
    checkTap: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
    handleLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    handle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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

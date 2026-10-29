import { Icon } from '@/components/visuals/Icon'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated'
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
  // `motion`, when the list drives the change itself, starts it at the touch, before this
  // card has rendered again.
  editing?: { active: boolean; checked: boolean; onToggle: () => void; opens?: boolean; motion?: EditMotion }
  // Drawn in place of the ellipsis, for a card whose menu is only the long press.
  trailing?: React.ReactNode
  // An action behind a swipe to the right (see SwipeToDelete).
  leading?: React.ComponentProps<typeof SwipeToDelete>['leading']
  // What a swipe to the left does in place of deleting, at once and with no question (a
  // character put in the archive); the delete is then in the menu.
  swipe?: SwipeAction
  children: React.ReactNode
}

export type SwipeAction = {
  label: string
  icon: React.ComponentProps<typeof Icon>['name']
  symbol: React.ComponentProps<typeof SFIcon>['name']
  color: string
  onAction: () => void
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
export function ListCard({ onOpen, onDelete, menu, menuTitle, style, vertical, solid, longPressDrag = true, editing, trailing, leading, swipe, children }: Props) {
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
  // The tick shows at once on this card alone; the list takes it in after (see toggleChecked
  // of the characters list), and its answer wins.
  const checkedProp = editing?.checked ?? false
  const [checked, setChecked] = useState(checkedProp)
  useEffect(() => setChecked(checkedProp), [checkedProp])
  const toggle = () => {
    setChecked(!checked)
    editing?.onToggle()
  }

  const ownProgress = useSharedValue(active ? 1 : 0)
  const ownSettled = useSharedValue(active ? 1 : 0)
  const motion = editing?.motion
  const progress = motion?.progress ?? ownProgress
  const settled = motion?.settled ?? ownSettled
  useEffect(() => {
    if (!motion) setEditMotion({ progress: ownProgress, settled: ownSettled }, active)
  }, [active, motion, ownProgress, ownSettled])
  // Only transforms move while the spring runs: animating a width relaid out every card on
  // every frame on the UI thread, and the scroll stuttered along with it. The check sits on
  // the right, before the handle, so nothing on the left moves: the content's real inset on
  // the right changes once, as the spring starts, and the text is cut to its new width right
  // away, under the check sliding in.
  const checkStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.5, 1]) }],
  }))
  const menuStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }))

  const isGlass = liquidGlass && !solid

  return (
    <SwipeToDelete
      radius={RADIUS}
      label={swipe?.label ?? t('common.delete')}
      onDelete={swipe?.onAction ?? onDelete}
      throwAway={swipe ? true : !isConfirmDeleteOn()}
      actionIcon={swipe?.icon}
      actionIconSF={swipe?.symbol}
      actionColor={swipe?.color}
      disabled={active}
      leading={leading}
    >
      <Pressable
        onPress={active && !editing?.opens ? toggle : onOpen}
        onLongPress={onLongPress}
        // On the desktop a flat list row: no outline, greyer under the pointer.
        style={(state) =>
          isDesktop
            ? [cardStyle, isGlass && styles.glassCard, (state as { hovered?: boolean }).hovered && styles.hovered, state.pressed && styles.pressedFlat]
            : [
                cardStyle,
                isGlass && styles.glassCard,
                state.pressed && !active && !isGlass && { transform: [{ scale: 0.985 }], opacity: 0.9 },
              ]
        }
      >
        {isGlass ? (
          <GlassSurface
            interactive
            variant="clear"
            style={styles.layer}
            fallbackStyle={styles.glassFallback}
          />
        ) : null}
        {children}
        {editing ? (
          <View style={[styles.menu, vertical && styles.floating]}>
            <Animated.View style={[StyleSheet.absoluteFill, menuStyle]} pointerEvents={active ? 'none' : 'auto'}>
              {menuButton}
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, checkStyle]} pointerEvents={active && editing.opens ? 'auto' : 'none'}>
              <Pressable onPress={toggle} hitSlop={8} style={styles.checkTap}>
                <SFIcon
                  name={checked ? 'checkmark.circle.fill' : 'circle'}
                  fallback={checked ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={checked ? colors.accent : colors.textFaint}
                  animateChange
                  changeResponse={0.18}
                />
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

export type EditMotion = { progress: SharedValue<number>; settled: SharedValue<number> }

// The spring of a UITableView entering edit mode: critically damped, about a third of a
// second. The inset is not animated (see ListCard) and changes at once.
export function setEditMotion({ progress, settled }: EditMotion, on: boolean) {
  progress.value = withSpring(on ? 1 : 0, { duration: 350, dampingRatio: 1 })
  settled.value = on ? 1 : 0
}

const RADIUS = 20
// The desktop's flat rows are less round.
const DESKTOP_RADIUS = 8
// The corners a card cuts what fills its edge to, like a character card's avatar; on iOS the
// continuous curve of Liquid Glass.
export const CARD_RADIUS = isDesktop ? DESKTOP_RADIUS : RADIUS
export const CARD_CORNERS_CONTINUOUS = !isDesktop

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
    glassFallback: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS,
      borderCurve: 'continuous',
    },
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
            borderRadius: DESKTOP_RADIUS,
            paddingVertical: 10,
            paddingLeft: 14,
            paddingRight: 6,
          },
        }
      : {}),
    checkTap: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
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

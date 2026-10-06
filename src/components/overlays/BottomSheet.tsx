import { Icon } from '@/components/visuals/Icon'
import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { useTranslation } from '@/i18n'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { HEADER_FONT_SCALE, useStyles, useTheme, type Colors } from '@/theme'

import { GlassButton, GlassSurface } from '../chrome/Glass'

type Props = {
  visible: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

// iOS moves a sheet on a critically damped spring of about half a second, not on a
// timing curve; the same spring brings it back when a drag is let go too early.
const OPEN = { stiffness: 170, damping: 26, mass: 1 }
// Slightly underdamped and clamped: a critically damped spring only creeps toward the
// edge, this one crosses it and ends there, so the modal goes away on time.
const DROP = { stiffness: 220, damping: 24, mass: 1, overshootClamping: true }
// Where a flick would carry the sheet, as UIScrollView projects a deceleration.
const PROJECTION = 0.2
// How far the sheet gives when pulled up; there is nothing above it to reveal.
const STRETCH = 24
const CLOSE = 44
// Gap between the floating sheet and the screen edges.
const INSET = 8

// The sheet and the grouped cards inside it. On Liquid Glass the card is a faint layer
// over the glass and a row is see-through until pressed; an opaque card would hide the
// glass it sits on. Without it, the iOS way: in the dark the cards are lighter than the
// sheet, in the light the sheet is gray and the cards white.
export function useSheetTones() {
  const { colors, scheme } = useTheme()
  if (liquidGlass) {
    return scheme === 'light'
      ? { sheet: 'transparent', card: 'rgba(255, 255, 255, 0.55)', row: 'transparent', pressed: 'rgba(0, 0, 0, 0.06)' }
      : { sheet: 'transparent', card: 'rgba(255, 255, 255, 0.07)', row: 'transparent', pressed: 'rgba(255, 255, 255, 0.08)' }
  }
  return scheme === 'light'
    ? { sheet: colors.bg, card: colors.surface, row: colors.surface, pressed: colors.surfaceRaised }
    : { sheet: colors.surface, card: colors.surfaceRaised, row: colors.surfaceRaised, pressed: colors.bubble }
}

// A card that floats up from the bottom over a dimmed screen, sized to its content, with
// a round close button and a centered title. Dragging the top down or tapping outside
// closes it too.
export function BottomSheet({ visible, onClose, title, children }: Props) {
  const styles = useStyles(createStyles)
  const tones = useSheetTones()
  const { colors } = useTheme()
  const { t } = useTranslation()
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // Stays mounted after `visible` turns false, until the slide down has played.
  const [mounted, setMounted] = useState(visible)
  // The slide up waits for both the modal to be on screen and the sheet to be measured.
  // Started on `visible`, its first frames play before iOS has presented the modal; with
  // the height measured mid-way, the dimming jumps.
  const presented = useRef(false)
  const measured = useRef(false)
  const opened = useRef(false)
  const offset = useSharedValue(height)
  // The distance to just below the screen edge: the sheet's own height, not the
  // window's, or it would fly in from far away and look rushed.
  const travel = useSharedValue(height)
  const closing = useSharedValue(false)
  const grab = useSharedValue(0)

  const hide = () => {
    presented.current = false
    measured.current = false
    opened.current = false
    setMounted(false)
  }

  const open = () => {
    if (!presented.current || !measured.current || opened.current) return
    opened.current = true
    closing.value = false
    offset.value = travel.value
    offset.value = withSpring(0, OPEN)
  }

  const drop = (velocity: number) => {
    'worklet'
    closing.value = true
    offset.value = withSpring(travel.value, { ...DROP, velocity }, (finished) => {
      if (finished) scheduleOnRN(hide)
    })
  }

  // The slide down starts right away, and the parent hears about it after. Waiting for
  // the parent to re-render with `visible` off leaves the sheet standing still meanwhile.
  const dismiss = () => {
    if (opened.current && !closing.value) drop(0)
    onClose()
  }

  useEffect(() => {
    if (visible) {
      setMounted(true)
      // Reopened while still sliding down: the modal is up, so onShow won't come.
      if (opened.current) {
        closing.value = false
        offset.value = withSpring(0, OPEN)
      }
    } else if (opened.current) {
      if (!closing.value) drop(0)
    } else {
      presented.current = false
      measured.current = false
      setMounted(false)
    }
  }, [visible])

  const drag = Gesture.Pan()
    .onBegin(() => {
      grab.value = offset.value
    })
    .onUpdate((e) => {
      if (closing.value) return
      const y = grab.value + e.translationY
      offset.value = y >= 0 ? y : -STRETCH * (1 - Math.exp(y / (STRETCH * 4)))
    })
    .onEnd((e) => {
      if (closing.value) return
      if (offset.value + e.velocityY * PROJECTION > travel.value / 2) {
        drop(Math.max(0, e.velocityY))
        scheduleOnRN(onClose)
      } else {
        offset.value = withSpring(0, { ...OPEN, velocity: e.velocityY })
      }
    })

  const dim = useAnimatedStyle(() => ({ opacity: interpolate(offset.value, [0, travel.value], [1, 0], 'clamp') }))
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))

  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onShow={() => {
        presented.current = true
        open()
      }}
      onRequestClose={dismiss}
    >
      {/* Gestures inside a modal need their own root: the app's one does not reach here. */}
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, liquidGlass ? styles.backdropGlass : styles.backdrop, dim]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel={t('common.close')} />
        </Animated.View>
        {/* Only moved, never faded: Liquid Glass renders wrongly under a fading parent. */}
        <Animated.View
          style={[styles.slot, { maxHeight: height - insets.top - 24 }, slide]}
          onLayout={(e) => {
            travel.value = e.nativeEvent.layout.height + INSET * 2
            measured.current = true
            open()
          }}
        >
          <GlassSurface
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
            fallbackStyle={[styles.solid, { backgroundColor: tones.sheet }]}
          >
            <GestureDetector gesture={drag}>
              <View style={styles.header}>
                <View style={styles.grabber} />
                <View style={styles.titleRow}>
                  {liquidGlass ? (
                    <GlassButton icon="close" iconSize={26} onPress={dismiss} accessibilityLabel={t('common.close')} />
                  ) : (
                    <Pressable
                      onPress={dismiss}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.close')}
                      style={({ pressed }) => [styles.close, { backgroundColor: pressed ? tones.pressed : tones.card }]}
                    >
                      <Icon name="close" size={24} color={colors.text} />
                    </Pressable>
                  )}
                  <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.title} numberOfLines={1}>
                    {title}
                  </Text>
                  <View style={styles.balance} />
                </View>
              </View>
            </GestureDetector>
            {children}
          </GlassSurface>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    fill: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: INSET },
    backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.45)' },
    // Glass takes its look from what is behind it, so the screen is dimmed less.
    backdropGlass: { backgroundColor: 'rgba(0, 0, 0, 0.2)' },
    slot: { width: '100%', alignSelf: 'center', marginBottom: INSET },
    sheet: { flexShrink: 1, borderRadius: 38 },
    solid: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
    header: { paddingTop: 7, paddingBottom: 12, paddingHorizontal: 16 },
    grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 2.5, backgroundColor: colors.borderStrong, marginBottom: 12 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    close: { width: CLOSE, height: CLOSE, borderRadius: CLOSE / 2, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '600' },
    // Keeps the title centered against the close button.
    balance: { width: CLOSE },
  })

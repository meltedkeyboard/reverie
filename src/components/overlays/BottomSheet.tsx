import { Icon } from '@/components/visuals/Icon'
import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { useTranslation } from '@/i18n'
import { isIOS } from '@/lib/core/platform'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { HEADER_FONT_SCALE, useStyles, useTheme, type Colors } from '@/theme'

import { GlassButton, GlassSurface } from '../chrome/Glass'

type Props = {
  visible: boolean
  onClose: () => void
  onDismissed?: () => void
  onBack?: () => void
  title: string
  rightItem?: React.ReactNode
  compactHeader?: boolean
  noGlass?: boolean
  // Force glass-style close/back buttons even when the sheet itself uses noGlass.
  glassButtons?: boolean
  height?: number
  minHeight?: number
  contentPaddingBottom?: number
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
export function useSheetTones(options?: { noGlass?: boolean }) {
  const { colors, scheme } = useTheme()
  if (liquidGlass && !options?.noGlass) {
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
export function BottomSheet({
  visible,
  onClose,
  onDismissed,
  title,
  rightItem,
  compactHeader = false,
  noGlass = false,
  glassButtons = false,
  height: fixedHeight,
  minHeight: customMinHeight,
  contentPaddingBottom,
  onBack,
  children,
}: Props) {
  const styles = useStyles(createStyles)
  const tones = useSheetTones({ noGlass })
  const isGlass = liquidGlass && !noGlass
  // Header buttons use glass either when the sheet itself is glass, or when explicitly requested.
  const isGlassButtons = liquidGlass && (!noGlass || glassButtons)
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
  const dismissHandled = useRef(false)
  const offset = useSharedValue(height)
  // The distance to just below the screen edge: the sheet's own height, not the
  // window's, or it would fly in from far away and look rushed.
  const travel = useSharedValue(height)
  const closing = useSharedValue(false)
  const grab = useSharedValue(0)

  // 0 = close button visible, 1 = back button visible. Drives the native spring transition.
  const backProgress = useSharedValue(onBack ? 1 : 0)
  useEffect(() => {
    backProgress.value = withSpring(onBack ? 1 : 0, { stiffness: 280, damping: 24, mass: 0.85 })
  }, [!!onBack])

  // The outgoing button shrinks and fades; the incoming one grows and fades in.
  // position:'absolute' is kept in the static style (buttonOverlay) — not in the animated
  // style — so that Reanimated does not rebuild the shadow node on every frame.
  const closeButtonStyle = useAnimatedStyle(() => ({
    opacity: interpolate(backProgress.value, [0, 0.5], [1, 0], 'clamp'),
    transform: [{ scale: interpolate(backProgress.value, [0, 0.6], [1, 0.6], 'clamp') }],
  }))
  const backButtonStyle = useAnimatedStyle(() => ({
    opacity: interpolate(backProgress.value, [0.4, 1], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(backProgress.value, [0.4, 1], [0.6, 1], 'clamp') }],
  }))

  const triggerDismissed = () => {
    if (!dismissHandled.current) {
      dismissHandled.current = true
      onDismissed?.()
    }
  }

  const hide = () => {
    presented.current = false
    measured.current = false
    opened.current = false
    setMounted(false)
    if (!isIOS) {
      scheduleOnRN(triggerDismissed)
    } else {
      setTimeout(triggerDismissed, 150)
    }
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
      dismissHandled.current = false
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
      triggerDismissed()
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

  const sheetBody = (
    <>
      <View style={[styles.header, compactHeader && styles.headerCompact, compactHeader && isGlassButtons && styles.headerCompactGlass]}>
        <View style={[styles.grabber, compactHeader && styles.grabberCompact]} />
        <View style={styles.titleRow}>
          <View style={styles.titleCenterContainer} pointerEvents="none">
            <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {/* Both buttons are always mounted; a spring animates between them so the
              transition is native and frame-perfect. The container holds the 44pt
              footprint of GlassButton so the title stays centred throughout.
              position:'absolute' lives in buttonOverlay (a static style) so
              Reanimated never needs to rebuild the shadow node on each frame, and
              GlassSurface always gets a measured non-zero frame to render into. */}
          <View style={[styles.buttonSlot, compactHeader && !isGlassButtons && styles.buttonSlotCompact]}>
            <Animated.View style={[styles.buttonOverlay, closeButtonStyle]} pointerEvents={onBack ? 'none' : 'auto'}>
              {isGlassButtons ? (
                <GlassButton
                  icon="close"
                  iconSize={compactHeader ? 22 : 26}
                  onPress={dismiss}
                  accessibilityLabel={t('common.close')}
                />
              ) : (
                <Pressable
                  onPress={dismiss}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                  style={({ pressed }) => [
                    styles.close,
                    compactHeader && styles.closeCompact,
                    { backgroundColor: pressed ? tones.pressed : tones.card },
                  ]}
                >
                  <Icon name="close" size={compactHeader ? 20 : 24} color={colors.text} />
                </Pressable>
              )}
            </Animated.View>
            <Animated.View style={[styles.buttonOverlay, backButtonStyle]} pointerEvents={onBack ? 'auto' : 'none'}>
              {isGlassButtons ? (
                <GlassButton
                  icon="chevron-back"
                  iconSize={compactHeader ? 22 : 26}
                  onPress={onBack ?? dismiss}
                  accessibilityLabel={t('common.back')}
                />
              ) : (
                <Pressable
                  onPress={onBack ?? dismiss}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.back')}
                  style={({ pressed }) => [
                    styles.close,
                    compactHeader && styles.closeCompact,
                    { backgroundColor: pressed ? tones.pressed : tones.card },
                  ]}
                >
                  <Icon name="chevron-back" size={compactHeader ? 20 : 24} color={colors.text} />
                </Pressable>
              )}
            </Animated.View>
          </View>
          <View style={styles.spacer} />
          {rightItem ? (
            <View style={[styles.rightItemContainer, compactHeader && styles.rightItemCompact]}>{rightItem}</View>
          ) : (
            <View style={[styles.balance, compactHeader && styles.balanceCompact]} />
          )}
        </View>
      </View>
      {children}
    </>
  )

  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onShow={() => {
        dismissHandled.current = false
        presented.current = true
        open()
      }}
      onDismiss={triggerDismissed}
      onRequestClose={dismiss}
    >
      {/* Gestures inside a modal need their own root: the app's one does not reach here. */}
      <GestureHandlerRootView
        style={[
          styles.fill,
          {
            paddingLeft: Math.max(INSET, insets.left),
            paddingRight: Math.max(INSET, insets.right),
          },
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, isGlass ? styles.backdropGlass : styles.backdrop, dim]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel={t('common.close')} />
        </Animated.View>
        {/* Only moved, never faded: Liquid Glass renders wrongly under a fading parent. */}
        <Animated.View
          style={[
            styles.slot,
            { maxHeight: height - insets.top - 24 },
            fixedHeight ? { height: fixedHeight } : null,
            customMinHeight ? { minHeight: customMinHeight } : null,
            slide,
          ]}
          onLayout={(e) => {
            travel.value = e.nativeEvent.layout.height + INSET * 2
            measured.current = true
            open()
          }}
        >
          <GestureDetector gesture={drag}>
            {isGlass ? (
              <GlassSurface
                style={[
                  styles.sheet,
                  fixedHeight ? { height: '100%' } : null,
                  customMinHeight ? { minHeight: customMinHeight } : null,
                  { paddingBottom: contentPaddingBottom !== undefined ? contentPaddingBottom : Math.max(insets.bottom, 16) },
                ]}
                fallbackStyle={[styles.solid, { backgroundColor: tones.sheet }]}
              >
                {sheetBody}
              </GlassSurface>
            ) : (
              <View
                style={[
                  styles.sheet,
                  // overflow:'hidden' clips GlassSurface children (UIKit paints glass layers
                  // outside view bounds). When glass buttons are used, skip the clip and let
                  // borderRadius handle the visual rounding of the sheet background.
                  !glassButtons && styles.solid,
                  glassButtons && styles.solidNoClip,
                  fixedHeight ? { height: '100%' } : null,
                  customMinHeight ? { minHeight: customMinHeight } : null,
                  {
                    backgroundColor: tones.sheet,
                    paddingBottom: contentPaddingBottom !== undefined ? contentPaddingBottom : Math.max(insets.bottom, 16),
                  },
                ]}
              >
                {sheetBody}
              </View>
            )}
          </GestureDetector>
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
    slot: { width: '100%', maxWidth: 640, alignSelf: 'center', marginBottom: INSET },
    sheet: { flexShrink: 1, borderRadius: 38 },
    solid: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
    // Like solid but without overflow:'hidden': UIKit renders glass effect layers outside
    // their view bounds, so a clipping ancestor makes the glass material disappear.
    solidNoClip: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    header: { paddingTop: 7, paddingBottom: 12, paddingHorizontal: 16 },
    headerCompact: { paddingTop: 6, paddingBottom: 6 },
    grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 2.5, backgroundColor: colors.borderStrong, marginBottom: 12 },
    grabberCompact: { marginBottom: 6 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    titleCenterContainer: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 56,
    },
    spacer: { flex: 1 },
    close: { width: CLOSE, height: CLOSE, borderRadius: CLOSE / 2, alignItems: 'center', justifyContent: 'center' },
    closeCompact: { width: 36, height: 36, borderRadius: 18 },
    title: { textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '600' },
    // Keeps the title centered against the close button.
    balance: { width: CLOSE },
    balanceCompact: { width: 36 },
    rightItemContainer: { minWidth: CLOSE, height: CLOSE, alignItems: 'center', justifyContent: 'center' },
    rightItemCompact: { minWidth: 36, height: 36 },
    // Container that always occupies the 44pt GlassButton footprint so the title
    // stays centred during the spring transition between close and back.
    buttonSlot: { width: CLOSE, height: CLOSE, alignItems: 'center', justifyContent: 'center' },
    // Only applied when glassButtons is false — glass buttons are always 44pt.
    buttonSlotCompact: { width: 36, height: 36 },
    // Absolutely fills buttonSlot so each Animated.View has a measured non-zero
    // frame; GlassSurface inside GlassButton can only render once it has a size.
    buttonOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Compact header with glass buttons: add enough vertical padding for the 44pt
    // circles to breathe without clipping.
    headerCompactGlass: { paddingTop: 8, paddingBottom: 8 },
  })


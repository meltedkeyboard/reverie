import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'

import { liquidGlass } from '@/lib/nativeUI'
import { type Colors, CONTROL_FONT_SCALE, ON_ACCENT, useColors, useStyles } from '@/theme'

import { GlassSurface } from './Glass'
import { SFIcon } from './SFIcon'

type Props = {
  // Without a label the button is a circle around the icon; accessibilityLabel names it then.
  label?: string
  accessibilityLabel?: string
  // A symbol before the label, in the label's color. With `slide`, the button shows no
  // spinner while loading: the symbol keeps leaving that way and coming back from the other.
  // `plain` draws the Ionicons glyph instead of the SF Symbol, for a button inside a
  // NativeMenu: a SwiftUI symbol in the menu's label gets the accent tint. The glyph then
  // takes the label's color, where the SF Symbol is in the text color.
  icon?: Pick<ComponentProps<typeof SFIcon>, 'name' | 'fallback'> & { slide?: 'up' | 'down'; plain?: boolean }
  onPress?: () => void
  // The label's color, which says what the action is: the accent, or danger for deleting.
  color?: string
  // Tints the glass with the color and turns the label white, for actions that should
  // stand out on the page: backups, deleting.
  filled?: boolean
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
}

// A capsule of Liquid Glass for the secondary actions of a screen, with the label in the
// action's color. Outside iOS 26 it is the plain surface with a hairline, or a solid fill.
export function PillButton({ label, accessibilityLabel, icon, onPress, color, filled = false, disabled, loading, style }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const tint = color ?? colors.accent
  const ink = filled ? ON_ACCENT : tint
  const sliding = useAtLeastOneLap(!!loading && !!icon?.slide)
  const inactive = disabled || loading || sliding
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // Interactive glass springs under the finger by itself; a scale on top would fight it.
      style={({ pressed }) => [style, inactive && !sliding && { opacity: 0.5 }, !liquidGlass && pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <GlassSurface
        interactive={!inactive}
        tintColor={filled ? tint : undefined}
        style={[styles.pill, !label && styles.circle]}
        fallbackStyle={filled ? { backgroundColor: tint } : styles.solid}
      >
        {loading && !sliding ? (
          <ActivityIndicator color={ink} />
        ) : (
          <View style={styles.content}>
            {icon ? (
              <SlidingIcon direction={icon.slide} active={sliding}>
                {icon.plain ? (
                  <Ionicons name={icon.fallback} size={19} color={ink} />
                ) : (
                  <SFIcon name={icon.name} fallback={icon.fallback} size={19} color={filled ? ink : color ?? colors.text} onAccent={filled} />
                )}
              </SlidingIcon>
            ) : null}
            {label ? (
              <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[styles.label, { color: ink }]} numberOfLines={1}>
                {label}
              </Text>
            ) : null}
          </View>
        )}
      </GlassSurface>
    </Pressable>
  )
}


// The timing of the continue button changing chats.
const OUT_MS = 140
const IN_MS = 260
const HOLD_MS = 240
const SHIFT = 8

const LAP_MS = OUT_MS + IN_MS + HOLD_MS + 60

// Stays true for one full lap of the sliding icon after it starts, even when the work
// behind it ends sooner, so a quick push or pull still shows the animation once.
export function useAtLeastOneLap(active: boolean) {
  const [held, setHeld] = useState(false)
  const startedAt = useRef(0)
  useEffect(() => {
    if (active) {
      startedAt.current = Date.now()
      setHeld(true)
      return
    }
    const timer = setTimeout(() => setHeld(false), Math.max(0, startedAt.current + LAP_MS - Date.now()))
    return () => clearTimeout(timer)
  }, [active])
  return active || held
}

// While active, the icon fades out moving `direction` and slides back in from the other
// side, over and over; when it stops, it settles where it belongs.
export function SlidingIcon({ direction, active, children }: { direction?: 'up' | 'down'; active: boolean; children: ReactNode }) {
  const fade = useSharedValue(1)
  const shift = useSharedValue(0)
  const away = direction === 'down' ? SHIFT : -SHIFT

  useEffect(() => {
    const ease = { duration: IN_MS, easing: Easing.out(Easing.cubic) }
    if (!active) {
      // Setting the values cancels the loop wherever it is.
      fade.value = withTiming(1, ease)
      shift.value = withTiming(0, ease)
      return
    }
    // The same steps as the shift, the instant one included: even a zero-length step takes
    // a frame, and with one step fewer the fade would run ahead a frame every lap, until
    // the icon jumps across while still visible.
    fade.value = withRepeat(
      withSequence(withTiming(0, { duration: OUT_MS }), withTiming(0, { duration: 0 }), withTiming(1, ease), withTiming(1, { duration: HOLD_MS })),
      -1
    )
    shift.value = withRepeat(
      withSequence(withTiming(away, { duration: OUT_MS }), withTiming(-away, { duration: 0 }), withTiming(0, ease), withTiming(0, { duration: HOLD_MS })),
      -1
    )
  }, [active, away, fade, shift])

  const style = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateY: shift.value }] }))
  return <Animated.View style={style}>{children}</Animated.View>
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    pill: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    circle: { width: 44, paddingHorizontal: 0 },
    solid:{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    content: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    label: { fontSize: 16, fontWeight: '600' },
  })

import { useEffect, type ComponentProps, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'

import { liquidGlass } from '@/lib/nativeUI'
import { CONTROL_FONT_SCALE, useColors, useStyles, type Colors } from '@/theme'

import { GlassSurface } from './Glass'
import { SFIcon } from './SFIcon'

type Props = {
  label: string
  // A symbol before the label, in the label's color. With `slide`, the button shows no
  // spinner while loading: the symbol keeps leaving that way and coming back from the other.
  icon?: Pick<ComponentProps<typeof SFIcon>, 'name' | 'fallback'> & { slide?: 'up' | 'down' }
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
export function PillButton({ label, icon, onPress, color, filled = false, disabled, loading, style }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const tint = color ?? colors.accent
  const ink = filled ? ON_FILL : tint
  const inactive = disabled || loading
  const sliding = !!loading && !!icon?.slide
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      // Interactive glass springs under the finger by itself; a scale on top would fight it.
      style={({ pressed }) => [style, inactive && !sliding && { opacity: 0.5 }, !liquidGlass && pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <GlassSurface
        interactive={!inactive}
        tintColor={filled ? tint : undefined}
        style={styles.pill}
        fallbackStyle={filled ? { backgroundColor: tint } : styles.solid}
      >
        {loading && !sliding ? (
          <ActivityIndicator color={ink} />
        ) : (
          <View style={styles.content}>
            {icon ? (
              <SlidingIcon direction={icon.slide} active={sliding}>
                <SFIcon name={icon.name} fallback={icon.fallback} size={19} color={ink} onAccent={filled} />
              </SlidingIcon>
            ) : null}
            <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[styles.label, { color: ink }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        )}
      </GlassSurface>
    </Pressable>
  )
}

const ON_FILL = '#FFFFFF'

// The timing of the continue button changing chats.
const OUT_MS = 140
const IN_MS = 260
const HOLD_MS = 240
const SHIFT = 8

// While active, the icon fades out moving `direction` and slides back in from the other
// side, over and over; when it stops, it settles where it belongs.
function SlidingIcon({ direction, active, children }: { direction?: 'up' | 'down'; active: boolean; children: ReactNode }) {
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
    fade.value = withRepeat(
      withSequence(withTiming(0, { duration: OUT_MS }), withTiming(1, ease), withTiming(1, { duration: HOLD_MS })),
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
    solid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    content: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    label: { fontSize: 16, fontWeight: '600' },
  })

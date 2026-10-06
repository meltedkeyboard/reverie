import { useEffect, useRef } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'

import { isDesktop } from '@/lib/core/platform'
import { GlassSurface } from '@/components/chrome/Glass'
import * as Haptics from '@/lib/ui/haptics'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

import { Star } from './Star'

const SIZE = 44
const ON_TILT = -10
const OFF_TILT = 8

// The app's switch: a round Liquid Glass button with the brand star in it. Off, it is
// clear glass with an outlined star; on, the glass fills with the accent and the star
// turns solid white, swinging over with a little bounce, so the change reads as a state
// rather than an action. Outside iOS 26 it is a plain circle, filled when on.
export function StarToggle({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const tilt = useSharedValue(value ? ON_TILT : OFF_TILT)
  const scale = useSharedValue(1)

  // Only a change plays; the first render just shows the state.
  const shown = useRef(value)
  useEffect(() => {
    if (shown.current === value) return
    shown.current = value
    tilt.value = withSpring(value ? ON_TILT : OFF_TILT, { damping: 12, stiffness: 220 })
    scale.value = withSequence(withTiming(value ? 1.25 : 0.85, { duration: 110 }), withSpring(1, { damping: 10, stiffness: 260 }))
  }, [value, tilt, scale])

  const starStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${tilt.value}deg` }, { scale: scale.value }],
  }))

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync()
        onValueChange(!value)
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={8}
      // Interactive glass springs under the finger by itself; a scale on top would fight it.
      style={({ pressed }) => !liquidGlass && pressed && { transform: [{ scale: 0.94 }] }}
    >
      <GlassSurface
        interactive
        tintColor={value ? colors.accent : undefined}
        style={styles.circle}
        fallbackStyle={value ? styles.solidOn : styles.solidOff}
      >
        <Animated.View style={starStyle}>
          <Star size={26} color={value ? ON_ACCENT : colors.textFaint} filled={value} />
        </Animated.View>
      </GlassSurface>
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    circle: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' },
    solidOff: { backgroundColor: isDesktop ? colors.surfaceRaised : colors.surface, borderWidth: isDesktop ? 0 : 1, borderColor: colors.border },
    solidOn: { backgroundColor: colors.accent, borderWidth: isDesktop ? 0 : 1, borderColor: colors.accent },
  })

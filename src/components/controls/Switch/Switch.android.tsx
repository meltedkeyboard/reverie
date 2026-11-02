import { useEffect, useRef } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import * as Haptics from '@/lib/ui/haptics'
import { ON_ACCENT, useColors, useStyles, type Colors } from '@/theme'

import type { SwitchProps } from './types'

// Material Design 3 switch specifications: 52 x 32 pill track, 24 x 24 thumb expanding
// from 16dp when unselected to 24dp when selected, with a 2dp track outline.
const TRACK_WIDTH = 52
const TRACK_HEIGHT = 32
const THUMB_HOLDER = 24
const TRAVEL = 20
const SCALE_OFF = 16 / 24
const DURATION = 200
const EASING = Easing.bezier(0.2, 0, 0, 1)

export function Switch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  trackColor,
  thumbColor,
  style,
}: SwitchProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)

  const progress = useSharedValue(value ? 1 : 0)

  // First render displays the initial state without triggering an animation.
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    progress.value = withTiming(value ? 1 : 0, { duration: DURATION, easing: EASING })
  }, [value, progress])

  const inactiveTrack = trackColor?.false ?? colors.surfaceRaised
  const activeTrack = trackColor?.true ?? colors.accent
  const inactiveBorder = trackColor?.false ? trackColor.false : colors.borderStrong
  const activeBorder = activeTrack
  const inactiveThumb = colors.textMuted
  const activeThumb = thumbColor ?? ON_ACCENT

  const trackStyle = useAnimatedStyle(() => {
    const p = progress.value
    return {
      backgroundColor: interpolateColor(p, [0, 1], [inactiveTrack, activeTrack]),
      borderColor: interpolateColor(p, [0, 1], [inactiveBorder, activeBorder]),
    }
  })

  const thumbStyle = useAnimatedStyle(() => {
    const p = progress.value
    const scale = interpolate(p, [0, 1], [SCALE_OFF, 1])
    const translateX = interpolate(p, [0, 1], [0, TRAVEL])
    return {
      transform: [{ translateX }, { scale }],
      backgroundColor: interpolateColor(p, [0, 1], [inactiveThumb, activeThumb]),
    }
  })

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync()
        onValueChange?.(!value)
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.container, disabled && styles.disabled, style]}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <View style={styles.thumbHolder}>
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </Animated.View>
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    container: {
      width: TRACK_WIDTH,
      height: TRACK_HEIGHT,
      justifyContent: 'center',
    },
    disabled: {
      opacity: 0.38,
    },
    track: {
      width: TRACK_WIDTH,
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      borderWidth: 2,
    },
    thumbHolder: {
      position: 'absolute',
      left: 2,
      top: 2,
      width: THUMB_HOLDER,
      height: THUMB_HOLDER,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumb: {
      width: THUMB_HOLDER,
      height: THUMB_HOLDER,
      borderRadius: THUMB_HOLDER / 2,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 1.5,
    },
  })

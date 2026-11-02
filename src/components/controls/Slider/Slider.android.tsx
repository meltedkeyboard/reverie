import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'

import { ON_ACCENT, useColors, useStyles, type Colors } from '@/theme'

import type { SliderProps } from './types'

// Material Design 3 slider: 16dp capsule track and a 24dp circular white handle,
// matching the geometry and 2dp outline of the Material switch.
const TRACK_HEIGHT = 16
const TRACK_RADIUS = TRACK_HEIGHT / 2
const THUMB_SIZE = 24
const CONTAINER_HEIGHT = 40

function snapValue(val: number, min: number, max: number, step: number) {
  'worklet'
  if (step <= 0) return Math.min(max, Math.max(min, val))
  const steps = Math.round((val - min) / step)
  const snapped = min + steps * step
  return Math.min(max, Math.max(min, snapped))
}

export function Slider({
  value,
  minimumValue = 0,
  maximumValue = 1,
  step = 0,
  onValueChange,
  onSlidingStart,
  onSlidingComplete,
  disabled = false,
  minimumTrackTintColor,
  maximumTrackTintColor,
  thumbTintColor,
  accessibilityLabel,
  style,
}: SliderProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)

  const [trackWidth, setTrackWidth] = useState(0)

  const min = minimumValue
  const max = Math.max(min, maximumValue)
  const range = max - min

  const thumbX = useSharedValue(0)
  const isDragging = useSharedValue(false)
  const lastReported = useSharedValue(value)

  // Sync position from prop value while not actively being dragged.
  useEffect(() => {
    if (isDragging.value || trackWidth <= 0 || range <= 0) return
    const usableWidth = Math.max(0, trackWidth - THUMB_SIZE)
    const fraction = Math.min(1, Math.max(0, (value - min) / range))
    thumbX.value = fraction * usableWidth
    lastReported.value = value
  }, [value, min, range, trackWidth, isDragging, thumbX, lastReported])

  const triggerChange = useCallback((v: number) => {
    onValueChange?.(v)
  }, [onValueChange])

  const triggerStart = useCallback(() => {
    onSlidingStart?.()
  }, [onSlidingStart])

  const triggerComplete = useCallback((v: number) => {
    onSlidingComplete?.(v)
  }, [onSlidingComplete])

  const pan = Gesture.Pan()
    .enabled(!disabled && trackWidth > 0 && range > 0)
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onStart(() => {
      'worklet'
      isDragging.value = true
      runOnJS(triggerStart)()
    })
    .onUpdate((e) => {
      'worklet'
      const usableWidth = trackWidth - THUMB_SIZE
      if (usableWidth <= 0) return

      const rawFraction = (e.x - THUMB_SIZE / 2) / usableWidth
      const clampedFraction = Math.min(1, Math.max(0, rawFraction))
      const rawVal = min + clampedFraction * range
      const snapped = snapValue(rawVal, min, max, step)

      const finalFraction = (snapped - min) / range
      thumbX.value = finalFraction * usableWidth

      if (snapped !== lastReported.value) {
        lastReported.value = snapped
        runOnJS(triggerChange)(snapped)
      }
    })
    .onEnd(() => {
      'worklet'
      isDragging.value = false
      const finalVal = lastReported.value
      runOnJS(triggerComplete)(finalVal)
    })

  const tap = Gesture.Tap()
    .enabled(!disabled && trackWidth > 0 && range > 0)
    .onStart(() => {
      'worklet'
      runOnJS(triggerStart)()
    })
    .onEnd((e) => {
      'worklet'
      const usableWidth = trackWidth - THUMB_SIZE
      if (usableWidth <= 0) return

      const rawFraction = (e.x - THUMB_SIZE / 2) / usableWidth
      const clampedFraction = Math.min(1, Math.max(0, rawFraction))
      const rawVal = min + clampedFraction * range
      const snapped = snapValue(rawVal, min, max, step)

      const finalFraction = (snapped - min) / range
      thumbX.value = finalFraction * usableWidth
      lastReported.value = snapped

      runOnJS(triggerChange)(snapped)
      runOnJS(triggerComplete)(snapped)
    })

  const gesture = Gesture.Race(pan, tap)

  const activeTrackStyle = useAnimatedStyle(() => ({
    width: Math.max(THUMB_SIZE, Math.min(trackWidth, thumbX.value + THUMB_SIZE)) + 2,
  }))

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value }],
  }))

  const activeColor = minimumTrackTintColor ?? colors.accent
  const inactiveColor =
    maximumTrackTintColor && maximumTrackTintColor !== colors.borderStrong
      ? maximumTrackTintColor
      : colors.surfaceRaised

  return (
    <View
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width)
        if (w > 0) setTrackWidth(w)
      }}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      accessibilityState={{ disabled }}
      style={[styles.container, disabled && styles.disabled, style]}
    >
      <GestureDetector gesture={gesture}>
        <View style={styles.touchArea}>
          <View style={[styles.inactiveTrack, { backgroundColor: inactiveColor, borderColor: colors.borderStrong }]}>
            <Animated.View style={[styles.activeTrack, { backgroundColor: activeColor }, activeTrackStyle]} />
          </View>
          <Animated.View
            style={[
              styles.thumb,
              { backgroundColor: thumbTintColor ?? ON_ACCENT },
              thumbStyle,
            ]}
          />
        </View>
      </GestureDetector>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    container: {
      height: CONTAINER_HEIGHT,
      justifyContent: 'center',
    },
    touchArea: {
      height: CONTAINER_HEIGHT,
      justifyContent: 'center',
    },
    disabled: {
      opacity: 0.38,
    },
    inactiveTrack: {
      height: TRACK_HEIGHT,
      borderRadius: TRACK_RADIUS,
      borderWidth: 2,
      overflow: 'hidden',
    },
    activeTrack: {
      position: 'absolute',
      left: -2,
      top: -2,
      bottom: -2,
      borderRadius: TRACK_RADIUS,
    },
    thumb: {
      position: 'absolute',
      left: 0,
      top: (CONTAINER_HEIGHT - THUMB_SIZE) / 2,
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: THUMB_SIZE / 2,
      elevation: 3,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1.5 },
      shadowOpacity: 0.25,
      shadowRadius: 2.5,
    },
  })

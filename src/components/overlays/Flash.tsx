import { useEffect } from 'react'
import { type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'

import { useColors } from '@/theme'

// A tint laid behind what a screen was opened at (a message found by search, a
// setting), fading once the eye has found it. Put it first in the item's own View;
// `style` says how far it reaches past the item and rounds its corners.
export function Flash({ style }: { style?: StyleProp<ViewStyle> }) {
  const colors = useColors()
  const opacity = useSharedValue(1)
  useEffect(() => {
    opacity.value = withDelay(700, withTiming(0, { duration: 1400 }))
  }, [opacity])
  const tint = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View
      style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.accentSoft }, style, tint]}
      pointerEvents="none"
    />
  )
}

import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { useColors } from '@/theme'

function Dot({ delay }: { delay: number }) {
  const colors = useColors()
  const level = useSharedValue(0.25)

  useEffect(() => {
    level.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 450 }), withTiming(0.25, { duration: 450 })), -1)
    )
  }, [delay, level])

  const style = useAnimatedStyle(() => ({
    opacity: level.value,
    transform: [{ scale: 0.8 + level.value * 0.3 }],
  }))

  return (
    <Animated.View
      style={[{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.textMuted }, style]}
    />
  )
}

export function TypingIndicator() {
  return (
    <View style={{ flexDirection: 'row', gap: 6, height: 27, alignItems: 'center' }}>
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  )
}

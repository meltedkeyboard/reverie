import { StyleSheet, View, type TextStyle } from 'react-native'
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useEffect } from 'react'

import { useColors } from '@/theme'

// How many letters wide the glint is.
const WIDTH = 3
const SWEEP_MS = 1500
const PAUSE_MS = 500

// A glint that runs along the text in waves. Without a native mask each letter is its own
// Text, brightened by how close the glint is to it; the one shared value drives them all.
export function ShimmerText({ text, style }: { text: string; style: TextStyle }) {
  const colors = useColors()
  const glint = useSharedValue(0)
  const letters = Array.from(text)

  useEffect(() => {
    glint.value = withRepeat(
      withSequence(
        withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: PAUSE_MS }),
        withTiming(0, { duration: 0 })
      ),
      -1
    )
  }, [glint])

  return (
    <View style={styles.row} accessible accessibilityLabel={text}>
      {letters.map((letter, index) => (
        <Letter
          key={index}
          letter={letter === ' ' ? '\u00a0' : letter}
          index={index}
          count={letters.length}
          glint={glint}
          from={colors.textMuted}
          to={colors.text}
          style={style}
        />
      ))}
    </View>
  )
}

type LetterProps = {
  letter: string
  index: number
  count: number
  glint: SharedValue<number>
  from: string
  to: string
  style: TextStyle
}

function Letter({ letter, index, count, glint, from, to, style }: LetterProps) {
  const lit = useAnimatedStyle(() => {
    // The glint starts and ends just outside the text so it enters and leaves smoothly.
    const at = glint.value * (count + 2 * WIDTH) - WIDTH
    const near = Math.max(0, 1 - Math.abs(at - index) / WIDTH)
    return { color: interpolateColor(near, [0, 1], [from, to]) }
  })
  return (
    <Animated.Text style={[style, lit]} importantForAccessibility="no">
      {letter}
    </Animated.Text>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
})

import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native'
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
export function ShimmerText({
  text,
  style,
  from,
  to,
  maxFontSizeMultiplier,
  wrap = false,
}: {
  text: string
  style?: StyleProp<TextStyle>
  from?: string
  to?: string
  maxFontSizeMultiplier?: number
  // Breaks onto more lines between words instead of cutting the text off at the edge.
  wrap?: boolean
}) {
  const colors = useColors()
  const glint = useSharedValue(0)
  const letters = Array.from(text)
  const flatStyle = StyleSheet.flatten(style) ?? {}

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

  const letter = (index: number) => (
    <Letter
      key={index}
      letter={letters[index] === ' ' ? '\u00a0' : letters[index]}
      index={index}
      count={letters.length}
      glint={glint}
      from={from ?? colors.textMuted}
      to={to ?? colors.text}
      style={flatStyle}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    />
  )

  if (!wrap) {
    return (
      <View style={styles.row} accessible accessibilityLabel={text}>
        {letters.map((_, index) => letter(index))}
      </View>
    )
  }
  // Each word keeps its letters together in a row of its own, so the lines break between
  // words; the glint still runs over the letters of the whole text.
  const words: number[][] = []
  letters.forEach((char, index) => {
    const last = words[words.length - 1]
    if (!last || char === ' ' || letters[index - 1] === ' ') words.push([index])
    else last.push(index)
  })
  return (
    <View style={styles.wrap} accessible accessibilityLabel={text}>
      {words.map((word) => (
        <View key={word[0]} style={styles.word}>
          {word.map(letter)}
        </View>
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
  maxFontSizeMultiplier?: number
}

function Letter({ letter, index, count, glint, from, to, style, maxFontSizeMultiplier }: LetterProps) {
  const lit = useAnimatedStyle(() => {
    // The glint starts and ends just outside the text so it enters and leaves smoothly.
    const at = glint.value * (count + 2 * WIDTH) - WIDTH
    const near = Math.max(0, 1 - Math.abs(at - index) / WIDTH)
    return { color: interpolateColor(near, [0, 1], [from, to]) }
  })
  return (
    <Animated.Text style={[style, lit]} maxFontSizeMultiplier={maxFontSizeMultiplier} importantForAccessibility="no">
      {letter}
    </Animated.Text>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', overflow: 'hidden' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1 },
  word: { flexDirection: 'row' },
})

import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type TextStyle } from 'react-native'
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
import { useEffect, type ReactNode } from 'react'

import { useColors } from '@/theme'

// How many letters wide the glint is.
const WIDTH = 3
const SWEEP_MS = 1500
const PAUSE_MS = 500
// How far the glint leans: each line down meets it this much of a line height later.
const SLANT = 0.3

// A glint that sweeps across the text in waves. Without a native mask each letter is its
// own Text, brightened by how close the glint is to it; the one shared value drives them
// all. The glint goes by where a letter sits, not by its place in the text, so wrapped
// lines light up together as one block instead of one line after another.
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
  // The width and height of the text as laid out; zero until it is.
  const span = useSharedValue({ width: 0, height: 0 })
  const letters = Array.from(text)
  const flatStyle = StyleSheet.flatten(style) ?? {}
  const band = WIDTH * (flatStyle.fontSize ?? 14) * 0.55

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

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    span.value = { width, height }
  }

  const letter = (index: number, word: SharedValue<Point> | null) => (
    <Letter
      key={index}
      letter={letters[index] === ' ' ? '\u00a0' : letters[index]}
      index={index}
      count={letters.length}
      glint={glint}
      span={span}
      band={band}
      word={word}
      from={from ?? colors.textMuted}
      to={to ?? colors.text}
      style={flatStyle}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    />
  )

  if (!wrap) {
    return (
      <View style={styles.row} onLayout={onLayout} accessible accessibilityLabel={text}>
        {letters.map((_, index) => letter(index, null))}
      </View>
    )
  }
  // Each word keeps its letters together in a row of its own, so the lines break between
  // words.
  const words: number[][] = []
  letters.forEach((char, index) => {
    const last = words[words.length - 1]
    if (!last || char === ' ' || letters[index - 1] === ' ') words.push([index])
    else last.push(index)
  })
  return (
    <View style={styles.wrap} onLayout={onLayout} accessible accessibilityLabel={text}>
      {words.map((word) => (
        <Word key={word[0]} indices={word} letter={letter} />
      ))}
    </View>
  )
}

type Point = { x: number; y: number }

// A word's place in the text, which its letters add to their own place in it.
function Word({ indices, letter }: { indices: number[]; letter: (index: number, word: SharedValue<Point>) => ReactNode }) {
  const at = useSharedValue<Point>({ x: 0, y: 0 })
  const onLayout = (e: LayoutChangeEvent) => {
    const { x, y } = e.nativeEvent.layout
    at.value = { x, y }
  }
  return (
    <View style={styles.word} onLayout={onLayout}>
      {indices.map((index) => letter(index, at))}
    </View>
  )
}

type LetterProps = {
  letter: string
  index: number
  count: number
  glint: SharedValue<number>
  span: SharedValue<{ width: number; height: number }>
  band: number
  word: SharedValue<Point> | null
  from: string
  to: string
  style: TextStyle
  maxFontSizeMultiplier?: number
}

function Letter({ letter, index, count, glint, span, band, word, from, to, style, maxFontSizeMultiplier }: LetterProps) {
  // The middle of the letter within its word, or within the text without words.
  const own = useSharedValue<Point>({ x: -1, y: 0 })
  const onLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout
    own.value = { x: x + width / 2, y: y + height / 2 }
  }
  const lit = useAnimatedStyle(() => {
    let near: number
    const { width, height } = span.value
    if (own.value.x < 0 || width === 0) {
      // Not laid out yet: by the letter's place in the text.
      const at = glint.value * (count + 2 * WIDTH) - WIDTH
      near = Math.max(0, 1 - Math.abs(at - index) / WIDTH)
    } else {
      const x = own.value.x + (word?.value.x ?? 0)
      const y = own.value.y + (word?.value.y ?? 0)
      const lean = height * SLANT
      // The glint starts and ends just outside the text so it enters and leaves smoothly.
      const at = glint.value * (width + lean + 2 * band) - band
      near = Math.max(0, 1 - Math.abs(at - x - y * SLANT) / band)
    }
    return { color: interpolateColor(near, [0, 1], [from, to]) }
  })
  return (
    <Animated.Text
      style={[style, lit]}
      onLayout={onLayout}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      importantForAccessibility="no"
    >
      {letter}
    </Animated.Text>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', overflow: 'hidden' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1 },
  word: { flexDirection: 'row' },
})

import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated'

import * as Haptics from '@/lib/haptics'
import { liquidGlass } from '@/lib/nativeUI'
import { CONTROL_FONT_SCALE, useColors, useStyles, type Colors } from '@/theme'

import { GlassSurface } from './Glass'

const PAD = 3
const SPRING = { damping: 22, stiffness: 260, mass: 0.9 }

type Props<T extends string> = {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  // Draws the track as Liquid Glass, for a control that floats over a picture.
  glass?: boolean
  style?: StyleProp<ViewStyle>
}

export function Segmented<T extends string>({ options, value, onChange, glass = false, style }: Props<T>) {
  const styles = useStyles(createStyles)
  const index = Math.max(0, options.findIndex((opt) => opt.value === value))
  // Where the thumb is, in segments; fractional while it slides between two of them.
  const pos = useSharedValue(index)
  const [width, setWidth] = useState(0)
  const itemWidth = width ? (width - PAD * 2) / options.length : 0

  useEffect(() => {
    pos.value = withSpring(index, SPRING)
  }, [index, pos])

  const thumbStyle = useAnimatedStyle(() => ({
    width: itemWidth,
    transform: [{ translateX: pos.value * itemWidth }],
  }))

  const select = (next: T) => {
    if (next === value) return
    Haptics.selectionAsync()
    onChange(next)
  }

  const items = (
    <>
      {itemWidth ? <Animated.View style={[styles.thumb, thumbStyle]} /> : null}
      {options.map((opt, i) => (
        <Pressable key={opt.value} onPress={() => select(opt.value)} style={styles.item}>
          <Label label={opt.label} index={i} pos={pos} active={i === index} />
        </Pressable>
      ))}
    </>
  )
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)

  if (glass && liquidGlass) {
    return (
      <GlassSurface interactive style={[styles.segment, styles.segmentGlass, style]} onLayout={onLayout}>
        {items}
      </GlassSurface>
    )
  }
  return (
    <View style={[styles.segment, style]} onLayout={onLayout}>
      {items}
    </View>
  )
}

// The label color follows the thumb as it passes over, rather than flipping on tap.
function Label({ label, index, pos, active }: { label: string; index: number; pos: SharedValue<number>; active: boolean }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const colorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(Math.min(1, Math.abs(pos.value - index)), [0, 1], [colors.accent, colors.textMuted]),
  }))
  return <Animated.Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[styles.text, active && styles.textActive, colorStyle]}>{label}</Animated.Text>
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    segment: { flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: 10, padding: PAD },
    // The plain track's fill is dropped, the glass is the track.
    segmentGlass: { backgroundColor: undefined, borderRadius: 22 },
    thumb: {
      position: 'absolute',
      top: PAD,
      bottom: PAD,
      left: PAD,
      borderRadius: 8,
      backgroundColor: colors.accentSoft,
    },
    item: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
    text: { color: colors.textMuted, fontSize: 13 },
    textActive: { fontWeight: '600' },
  })

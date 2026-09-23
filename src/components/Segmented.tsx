import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated'

import * as Haptics from '@/lib/haptics'
import { useColors } from '@/theme'

const PAD = 3
const SPRING = { damping: 22, stiffness: 260, mass: 0.9 }

type Props<T extends string> = {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  style?: StyleProp<ViewStyle>
}

export function Segmented<T extends string>({ options, value, onChange, style }: Props<T>) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
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

  return (
    <View style={[styles.segment, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {itemWidth ? <Animated.View style={[styles.thumb, thumbStyle]} /> : null}
      {options.map((opt, i) => (
        <Pressable key={opt.value} onPress={() => select(opt.value)} style={styles.item}>
          <Label label={opt.label} index={i} pos={pos} active={i === index} />
        </Pressable>
      ))}
    </View>
  )
}

// The label color follows the thumb as it passes over, rather than flipping on tap.
function Label({ label, index, pos, active }: { label: string; index: number; pos: SharedValue<number>; active: boolean }) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const colorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(Math.min(1, Math.abs(pos.value - index)), [0, 1], [colors.accent, colors.textMuted]),
  }))
  return <Animated.Text style={[styles.text, active && styles.textActive, colorStyle]}>{label}</Animated.Text>
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    segment: { flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: 10, padding: PAD },
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

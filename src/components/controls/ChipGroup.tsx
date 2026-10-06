import { LinearGradient } from 'expo-linear-gradient'
import { useState } from 'react'
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { useColors } from '@/theme'

import { Chip } from './Chip'

const FADE = 20

type Props<T extends string> = {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  style?: StyleProp<ViewStyle>
  // What the row sits on, for the fades at its edges; the screen background by default.
  fadeColor?: string
}

// A row of chips where exactly one is active. The chips stretch to fill the width; when they
// do not fit at their own width they keep it and the row scrolls sideways, with fixed fades
// at both edges for as long as it scrolls.
export function ChipGroup<T extends string>({ options, value, onChange, style, fadeColor }: Props<T>) {
  const colors = useColors()
  const fade = fadeColor ?? colors.bg
  const [viewport, setViewport] = useState(0)
  const [content, setContent] = useState(0)
  const scrolls = content > viewport + 1

  return (
    <View style={style}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Horizontal lists bounce by default even when everything fits, which reads as a scroll.
        alwaysBounceHorizontal={false}
        overScrollMode="never"
        style={styles.scroll}
        contentContainerStyle={styles.row}
        onLayout={(e) => setViewport(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContent(w)}
      >
        {options.map((opt) => (
          <Chip key={opt.value} label={opt.label} active={value === opt.value} onPress={() => onChange(opt.value)} style={styles.chip} />
        ))}
      </ScrollView>
      {scrolls ? (
        <>
          <LinearGradient colors={[fade, `${fade}00`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fade, styles.left]} pointerEvents="none" />
          <LinearGradient colors={[`${fade}00`, fade]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fade, styles.right]} pointerEvents="none" />
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  // flexGrow on the content makes it at least as wide as the viewport, so the chips can grow into it.
  row: { flexGrow: 1, gap: 8 },
  chip: { flexGrow: 1, flexShrink: 0 },
  // zIndex keeps the fades above the glass chips, which are native layers of their own.
  fade: { position: 'absolute', top: 0, bottom: 0, width: FADE, zIndex: 1, elevation: 1 },
  left: { left: 0 },
  right: { right: 0 },
})

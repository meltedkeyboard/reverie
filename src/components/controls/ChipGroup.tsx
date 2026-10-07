import { LinearGradient } from 'expo-linear-gradient'
import { useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import type { MenuItem } from '@/components/overlays/NativeMenu'
import { NativeMenu } from '@/components/overlays/NativeMenu'
import { useColors } from '@/theme'

import { Chip } from './Chip'

const FADE = 20

type Props<T extends string> = {
  // An option with a menu opens it instead of being chosen by the tap: its variants are
  // picked there.
  options: { value: T; label: string; menu?: MenuItem[] }[]
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
  return (
    <FadingRow style={style} fadeColor={fadeColor}>
      {options.map((opt) =>
        opt.menu ? (
          <NativeMenu key={opt.value} items={opt.menu} style={styles.chip}>
            <Chip label={opt.label} active={value === opt.value} onPress={() => {}} style={styles.inMenu} />
          </NativeMenu>
        ) : (
          <Chip key={opt.value} label={opt.label} active={value === opt.value} onPress={() => onChange(opt.value)} style={styles.chip} />
        ),
      )}
    </FadingRow>
  )
}

// A row that scrolls sideways when its chips do not fit, under fixed fades at both edges
// for as long as it scrolls. `inset` is the room before the first chip and after the last,
// for a row inside a group.
export function FadingRow({
  children,
  style,
  fadeColor,
  inset = 0,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  // What the row sits on, for the fades; the screen background by default.
  fadeColor?: string
  inset?: number
}) {
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
        contentContainerStyle={[styles.row, inset > 0 && { paddingHorizontal: inset }]}
        onLayout={(e) => setViewport(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContent(w)}
      >
        {children}
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
  // Room above and below the chips, taken back by the margin: a glass chip grows a little
  // as its menu opens, and the scroll view would cut it off with a straight edge.
  scroll: { flexGrow: 0, marginVertical: -16 },
  // flexGrow on the content makes it at least as wide as the viewport, so the chips can grow into it.
  row: { flexGrow: 1, gap: 8, paddingVertical: 16 },
  chip: { flexGrow: 1, flexShrink: 0 },
  // The menu centers its label, so the chip is stretched back to the menu's width.
  inMenu: { alignSelf: 'stretch' },
  // zIndex keeps the fades above the glass chips, which are native layers of their own.
  fade: { position: 'absolute', top: 0, bottom: 0, width: FADE, zIndex: 1, elevation: 1 },
  left: { left: 0 },
  right: { right: 0 },
})

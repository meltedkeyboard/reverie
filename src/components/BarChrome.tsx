import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { Platform, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'

import { useStyles, useTheme, type Colors } from '@/theme'

type Edge = 'top' | 'bottom'

// The frosted bar pinned to a screen edge (the header, the composer) when Liquid Glass
// is not available, with a hairline on the side facing the content.
export function BlurBar({
  edge,
  style,
  onLayout,
  children,
}: {
  edge: Edge
  style?: StyleProp<ViewStyle>
  onLayout?: (e: LayoutChangeEvent) => void
  children: React.ReactNode
}) {
  const { scheme } = useTheme()
  const styles = useStyles(createStyles)
  // Real blur on Android costs a copy of the screen under the bar on every frame of a
  // scroll, so the bar there is a nearly opaque tint instead.
  if (Platform.OS === 'android') {
    return (
      <View style={[styles.bar, styles.tint, edge === 'top' ? styles.top : styles.bottom, style]} onLayout={onLayout}>
        {children}
      </View>
    )
  }
  return (
    <BlurView tint={scheme} intensity={55} style={[styles.bar, edge === 'top' ? styles.top : styles.bottom, style]} onLayout={onLayout}>
      {children}
    </BlurView>
  )
}

// With Liquid Glass the bar goes away and the content fades out toward the edge instead,
// so text scrolling underneath doesn't clash with the floating controls.
export function EdgeFade({ edge, style }: { edge: Edge; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme()
  const toEdge = edge === 'top' ? { start: { x: 0, y: 1 }, end: { x: 0, y: 0 } } : { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } }
  return (
    <LinearGradient
      colors={[`rgba(${colors.bgRgb}, 0)`, `rgba(${colors.bgRgb}, 0.8)`, colors.bg]}
      locations={[0, 0.45, 1]}
      {...toEdge}
      style={style}
      pointerEvents="none"
    />
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    bar: { backgroundColor: `rgba(${colors.bgRgb}, 0.55)` },
    tint: { backgroundColor: `rgba(${colors.bgRgb}, 0.94)` },
    top: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    bottom: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  })

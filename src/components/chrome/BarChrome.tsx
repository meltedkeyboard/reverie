import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'

import { useStyles, useTheme, type Colors } from '@/theme'
import { isAndroid } from '@/lib/core/platform'

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
  const styles = useStyles(createStyles)
  return (
    <View style={[styles.bar, edge === 'top' ? styles.top : styles.bottom, style]} onLayout={onLayout}>
      {children}
    </View>
  )
}

// Minimal fade
export function EdgeFade({ edge, style }: { edge: Edge; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme()
  const toEdge = edge === 'top' ? { start: { x: 0, y: 1 }, end: { x: 0, y: 0 } } : { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } }
  return (
    <LinearGradient
      colors={[`rgba(${colors.bgRgb}, 0)`, colors.bg]}
      locations={[0, 1]}
      {...toEdge}
      style={style}
      pointerEvents="none"
    />
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    bar: { backgroundColor: colors.bg },
    tint: { backgroundColor: colors.bg },
    top: { borderBottomWidth: 1, borderBottomColor: colors.border },
    bottom: { borderTopWidth: 1, borderTopColor: colors.border },
  })

import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { liquidGlass } from '@/lib/nativeUI'
import { HEADER_ROW_HEIGHT, useStyles, useTheme, type Colors } from '@/theme'

type Props = {
  left?: React.ReactNode
  right?: React.ReactNode
  children?: React.ReactNode
  // With Liquid Glass the bar itself disappears: the controls float over the content
  // and a fade stands in for the scroll edge effect of iOS 26.
  floating?: boolean
}

const FADE_OVERHANG = 28

export function useHeaderHeight() {
  return useSafeAreaInsets().top + HEADER_ROW_HEIGHT
}

export function GlassHeader({ left, right, children, floating }: Props) {
  const insets = useSafeAreaInsets()
  const { colors, scheme } = useTheme()
  const styles = useStyles(createStyles)
  const row = (
    <View style={styles.row} pointerEvents="box-none">
      {left}
      <View style={[styles.center, !left && { paddingLeft: 12 }]} pointerEvents="box-none">
        {children}
      </View>
      {right}
    </View>
  )

  if (floating && liquidGlass) {
    return (
      <View style={[styles.floating, { paddingTop: insets.top }]} pointerEvents="box-none">
        <LinearGradient
          colors={[colors.bg, `rgba(${colors.bgRgb}, 0.8)`, `rgba(${colors.bgRgb}, 0)`]}
          locations={[0, 0.55, 1]}
          style={[styles.fade, { height: insets.top + HEADER_ROW_HEIGHT + FADE_OVERHANG }]}
          pointerEvents="none"
        />
        {row}
      </View>
    )
  }

  return (
    <BlurView tint={scheme} intensity={55} style={[styles.root, { paddingTop: insets.top }]}>
      {row}
    </BlurView>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: `rgba(${colors.bgRgb}, 0.55)`,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  floating: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
  row: {
    height: HEADER_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 4 },
})

import { Image } from 'expo-image'
import { StyleSheet, type ImageStyle, type StyleProp } from 'react-native'

import { useStyles, useTheme, type Colors } from '@/theme'

const ICONS = {
  light: require('../../assets/images/icon.png'),
  dark: require('../../assets/images/icon-dark.png'),
}

// The app icon as it looks on the home screen, in the app's current theme. Its
// background is the screen's own, so a hairline keeps its outline visible.
export function AppMark({ size = 72, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  const { scheme } = useTheme()
  const styles = useStyles(createStyles)
  return (
    <Image
      source={ICONS[scheme]}
      accessibilityIgnoresInvertColors
      style={[styles.mark, { width: size, height: size, borderRadius: size * 0.2237 }, style]}
    />
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    mark: { alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  })

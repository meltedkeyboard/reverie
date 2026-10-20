import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'

import type { BackgroundEffect } from '@/db/characters'
import { FILL, paletteOf, useTheme } from '@/theme'

// How far each effect goes at full intensity.
const MAX_BLUR = 40
const MAX_DIM = 0.9

type Props = { uri: string; effect: BackgroundEffect; intensity: number }

// The picture behind a chat. Blur softens it; dim lays a background color over it: the
// theme's own by default, which darkens it in the dark theme and washes it out in the light
// one, so the text on top keeps its contrast either way, or the theme's light or dark one always.
export function ChatBackground({ uri, effect, intensity }: Props) {
  const { colors, theme } = useTheme()
  const dim = effect === 'dim-light' ? paletteOf(theme, 'light').bg : effect === 'dim-dark' ? paletteOf(theme, 'dark').bg : colors.bg
  return (
    <View style={styles.root} pointerEvents="none">
      <Image
        source={{ uri }}
        style={styles.bleed}
        contentFit="cover"
        blurRadius={effect === 'blur' ? intensity * MAX_BLUR : 0}
      />
      {effect !== 'blur' ? (
        <View style={[styles.bleed, { backgroundColor: dim, opacity: intensity * MAX_DIM }]} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...FILL,
    overflow: 'hidden',
  },
  // Bleed slightly past the bounds so subpixel rounding on high-DPI retina screens
  // never leaves a 1px gap along any edge.
  bleed: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    left: -2,
    right: -2,
  },
})

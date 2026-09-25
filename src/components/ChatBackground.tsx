import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'

import type { BackgroundEffect } from '@/db/characters'
import { useColors } from '@/theme'

// How far each effect goes at full intensity.
const MAX_BLUR = 40
const MAX_DIM = 0.9

type Props = { uri: string; effect: BackgroundEffect; intensity: number }

// The picture behind a chat. Blur softens it; dim lays the theme's own background color
// over it, which darkens it in the dark theme and washes it out in the light one, so the
// text on top keeps its contrast either way.
export function ChatBackground({ uri, effect, intensity }: Props) {
  const colors = useColors()
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={effect === 'blur' ? intensity * MAX_BLUR : 0}
      />
      {effect === 'dim' ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: intensity * MAX_DIM }]} />
      ) : null}
    </View>
  )
}

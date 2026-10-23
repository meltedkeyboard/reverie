import { BlurTargetView, BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { useIsFocused } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent, type View as ViewRef } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'

import { Picture } from '@/components/visuals/Picture'
import type { BackgroundEffect } from '@/db/characters'
import type { CropRect } from '@/lib/images/avatars'
import { placeCrop } from '@/lib/images/backgroundFrame'
import { BLURRED_DIM, MAX_DIM } from '@/lib/images/backgroundTone'
import { movingKind } from '@/lib/images/media'
import { FILL, paletteOf, useTheme } from '@/theme'

// How far a blur goes at full intensity. The dims are with the measure of how light a chat
// reads over its picture (backgroundTone.ts); the one over a picture blurred whatever its
// effect is fixed, so text reads over it at any intensity chosen for the chat, where a faint
// dim would leave a bright picture too loud.
const MAX_BLUR = 40
// Pixels past each edge, so subpixel rounding on high-DPI screens never leaves a 1px gap.
const BLEED = 2

// `blurred` sets the effect aside for a full blur and a fixed dim in the effect's color
// (the theme's for a blur), as under the drawer's list and the menus. `crop` is the frame of
// a moving background, which is drawn from its whole file; a still one is already cut to it.
type Props = {
  uri: string
  effect: BackgroundEffect
  intensity: number
  blurred?: boolean
  crop?: CropRect | null
  onVideoSize?: (size: { width: number; height: number }) => void
}

// The picture behind a chat. Blur softens it; dim lays a background color over it: the
// theme's own by default, which darkens it in the dark theme and washes it out in the light
// one, so the text on top keeps its contrast either way, or the theme's light or dark one always.
export function ChatBackground({ uri, effect, intensity, blurred = false, crop = null, onVideoSize }: Props) {
  const { colors, theme, scheme } = useTheme()
  const dim = effect === 'dim-light' ? paletteOf(theme, 'light').bg : effect === 'dim-dark' ? paletteOf(theme, 'dark').bg : colors.bg
  const blur = blurred ? 1 : effect === 'blur' ? intensity : 0
  // Read from the file's header once: the preview shows an original, whose name may lie.
  const moving = useMemo(() => movingKind(uri), [uri])
  const reduceMotion = useReducedMotion()
  // A pushed screen hides a still or moving picture from the window, which stops it there;
  // a player would go on decoding behind it.
  const focused = useIsFocused()
  const [view, setView] = useState<{ width: number; height: number } | null>(null)
  const target = useRef<ViewRef>(null)
  const paused = reduceMotion || (moving === 'video' && !focused)

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setView({ width: width + BLEED * 2, height: height + BLEED * 2 })
  }

  const dimLayer =
    blurred || effect !== 'blur' ? (
      <View style={[styles.bleed, { backgroundColor: dim, opacity: blurred ? BLURRED_DIM : intensity * MAX_DIM }]} />
    ) : null

  if (!moving) {
    return (
      <View style={styles.root} pointerEvents="none">
        <Image source={{ uri }} style={styles.bleed} contentFit="cover" blurRadius={blur * MAX_BLUR} />
        {dimLayer}
      </View>
    )
  }

  // A moving picture keeps its frames only without expo-image's blur, which is worked out
  // once over a single frame, and a video has none at all: the blur is a layer over it.
  const placed = crop?.sourceWidth && crop.sourceHeight && view ? placeCrop({ width: crop.sourceWidth, height: crop.sourceHeight }, crop, view) : null
  return (
    <View style={styles.root} pointerEvents="none" onLayout={crop ? onLayout : undefined}>
      {/* Android's blur draws what is in its target; elsewhere the target is a plain view. */}
      <BlurTargetView ref={target} style={styles.bleed}>
        {crop && !placed ? null : (
          <Picture
            uri={uri}
            style={placed ? { position: 'absolute', left: placed.left, top: placed.top, width: placed.width, height: placed.height } : StyleSheet.absoluteFill}
            paused={paused}
            onVideoSize={onVideoSize}
          />
        )}
      </BlurTargetView>
      {blur > 0 ? (
        <BlurView
          tint={scheme}
          intensity={blur * 100}
          blurTarget={target}
          blurMethod="dimezisBlurViewSdk31Plus"
          style={styles.bleed}
        />
      ) : null}
      {dimLayer}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...FILL,
    overflow: 'hidden',
  },
  bleed: {
    position: 'absolute',
    top: -BLEED,
    bottom: -BLEED,
    left: -BLEED,
    right: -BLEED,
  },
})

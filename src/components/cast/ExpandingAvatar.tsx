import { LinearGradient } from 'expo-linear-gradient'
import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import * as Haptics from '@/lib/ui/haptics'
import { fonts, ON_ACCENT } from '@/theme'

import { useOpenViewer } from '../visuals/ImageLink'
import { Picture } from '../visuals/Picture'

type Props = {
  name: string
  uri: string
  // Offset of the scroll view the avatar sits at the top of, and whether a finger is on it.
  scrollY: SharedValue<number>
  dragging: SharedValue<boolean>
  // 0 round, 1 spread out; owned by the screen, whose header gives way to the photo.
  progress: SharedValue<number>
  // Android only: how far a pull down at the top of the page has gone. There the scroll never
  // goes below zero, so the screen measures the pull with a gesture of its own and hands it
  // in; on iOS the overscroll above does the same and this stays unset.
  pull?: SharedValue<number>
  // How far the avatar sits from the top of the screen and from its sides with the
  // content unscrolled; the open photo reaches out over both.
  top: number
  side: number
}

const SIZE = 96
// A pull this long opens the photo, as in a Telegram profile.
const PULL_TO_OPEN = 45
// Scrolling the page up by this much closes it again.
const SCROLL_TO_CLOSE = 12
// Springs into place without overshooting, so the size never wobbles after it settles.
const SPRING = { damping: 26, stiffness: 220, overshootClamping: true }

// The round avatar at the top of the character editor that spreads into a square photo
// across the whole width when the page is pulled down, and folds back once it is scrolled
// up. The screen pushes the form under it down with useSpreadPush.
//
// Everything moves by transforms: the photo is always laid out at its full size and scaled
// down into the circle. Animating its size, or the height of its block, laid out the form
// and its glass fields again on every frame, and the spread stuttered.
export function ExpandingAvatar({ name, uri, scrollY, dragging, progress, pull: androidPull, top, side }: Props) {
  const { width } = useWindowDimensions()
  const openViewer = useOpenViewer()
  const open = useSharedValue(false)

  const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

  useAnimatedReaction(
    () => scrollY.value,
    (y) => {
      if (!open.value && dragging.value && -y > PULL_TO_OPEN) {
        open.value = true
        progress.value = withSpring(1, SPRING)
        scheduleOnRN(tick)
      } else if (open.value && y > SCROLL_TO_CLOSE) {
        open.value = false
        progress.value = withSpring(0, SPRING)
      }
    }
  )

  // The same opening, from the Android pull. Closing is the scroll reaction above.
  useAnimatedReaction(
    () => androidPull?.value ?? 0,
    (pulled) => {
      if (!open.value && pulled > PULL_TO_OPEN) {
        open.value = true
        progress.value = withSpring(1, SPRING)
        scheduleOnRN(tick)
      }
    }
  )

  // Another photo starts out round again, and a removed one hands the header back.
  useEffect(() => {
    open.value = false
    progress.value = 0
    return () => {
      progress.value = 0
    }
  }, [uri, open, progress])

  const photo = useAnimatedStyle(() => {
    const k = progress.value
    // Closed, the circle swells a little under the pull, hinting that it opens. Open, the
    // photo moves down with the page like the rest of it.
    const pull = Math.max(0, -scrollY.value, androidPull?.value ?? 0)
    const swell = 1 + Math.min(pull / PULL_TO_OPEN, 1) * 0.12 * (1 - k)
    const closedScale = SIZE / width
    const scale = (closedScale + (1 - closedScale) * k) * swell
    // Where the middle of the photo goes: the middle of the circle, or half the photo
    // below the top of the page. It is laid out with its middle at width / 2 - top.
    const closedY = SIZE / 2
    const openY = width / 2 - top
    return {
      // In the photo's own, unscaled size: a circle at first, square corners when open.
      borderRadius: (width / 2) * (1 - k),
      transform: [{ translateY: closedY + (openY - closedY) * k - (width / 2 - top) }, { scale }],
    }
  })

  // What the open photo carries in place of the header, as in a Telegram profile: a shade
  // at the top for the status bar and the buttons, and the name at the bottom on a shade
  // of its own. Both come in over the last part of the spread.
  const overlay = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.5, 1], [0, 1], 'clamp') }))

  return (
    <View style={styles.block}>
      <Animated.View style={[styles.photo, { width, height: width, left: -side, top: -top }, photo]}>
        <Pressable
          onPress={() => openViewer([{ uri, aspect: 1 }])}
          accessibilityRole="imagebutton"
          accessibilityLabel={name}
          style={StyleSheet.absoluteFill}
        >
          <Picture uri={uri} style={StyleSheet.absoluteFill} transition={150} />
        </Pressable>
        <Animated.View style={[StyleSheet.absoluteFill, overlay]} pointerEvents="none">
          <LinearGradient colors={TOP_SHADE} style={[styles.topShade, { height: top }]} />
          <LinearGradient colors={BOTTOM_SHADE} style={styles.bottomShade}>
            {name.trim() ? (
              <Text style={styles.name} numberOfLines={2}>
                {name.trim()}
              </Text>
            ) : null}
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </View>
  )
}

// For what follows the avatar in the page: moves it down as far as the open photo reaches
// past the circle's place.
export function useSpreadPush(progress: SharedValue<number>, top: number) {
  const { width } = useWindowDimensions()
  const reach = Math.max(0, width - top - SIZE)
  return useAnimatedStyle(() => ({ transform: [{ translateY: reach * progress.value }] }))
}

const TOP_SHADE = ['rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0)'] as const
const BOTTOM_SHADE = ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.55)'] as const

const styles = StyleSheet.create({
  block: { alignSelf: 'stretch', height: SIZE },
  photo: { position: 'absolute', overflow: 'hidden' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 48, paddingHorizontal: 20, paddingBottom: 18 },
  name: { color: ON_ACCENT, fontFamily: fonts.prose, fontSize: 28, fontWeight: '700' },
})

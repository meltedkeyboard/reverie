import { LinearGradient } from 'expo-linear-gradient'
import { useEffect } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
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
  side?: number
  sideLeft?: number
  sideRight?: number
}

const SIZE = 96
// A pull this long opens the photo, as in a Telegram profile. Short, since the overscroll of
// iOS resists the finger: the page moves well under half as far as the finger does.
const PULL_TO_OPEN = 18
// The Android pull is the finger's own distance, with nothing resisting it.
const ANDROID_PULL_TO_OPEN = 32
// Scrolling the page up by this much closes it again.
const SCROLL_TO_CLOSE = 12
// Springs into place without overshooting, so the size never wobbles after it settles.
const SPRING = { damping: 26, stiffness: 220, overshootClamping: true }
// Opening is near instant once the pull gets there, as in Telegram: the same motion, only
// stiff enough to be over in about a tenth of a second.
const OPEN_SPRING = { damping: 40, stiffness: 700, overshootClamping: true }
// The name on the open photo stands this far from its left and bottom edges.
const NAME_INSET_X = 20
const NAME_INSET_BOTTOM = 18

// The round avatar at the top of the character editor that spreads into a square photo
// across the whole width when the page is pulled down, and folds back once it is scrolled
// up. The screen pushes the form under it down with useSpreadPush.
//
// Everything moves by transforms: the photo is always laid out at its full size and scaled
// down into the circle. Animating its size, or the height of its block, laid out the form
// and its glass fields again on every frame, and the spread stuttered.
export function ExpandingAvatar({ name, uri, scrollY, dragging, progress, pull: androidPull, top, side = 0, sideLeft, sideRight }: Props) {
  const { width } = useWindowDimensions()
  const openViewer = useOpenViewer()
  const open = useSharedValue(false)
  const leftInset = sideLeft ?? side
  const rightInset = sideRight ?? side
  const photoSize = usePhotoSize()

  const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

  useAnimatedReaction(
    () => scrollY.value,
    (y) => {
      if (!open.value && dragging.value && -y > PULL_TO_OPEN) {
        open.value = true
        progress.value = withSpring(1, OPEN_SPRING)
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
      if (!open.value && pulled > ANDROID_PULL_TO_OPEN) {
        open.value = true
        progress.value = withSpring(1, OPEN_SPRING)
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
    const pull = Math.max(0, -scrollY.value / PULL_TO_OPEN, (androidPull?.value ?? 0) / ANDROID_PULL_TO_OPEN)
    const swell = 1 + Math.min(pull, 1) * 0.12 * (1 - k)
    const closedScale = SIZE / photoSize
    const scale = (closedScale + (1 - closedScale) * k) * swell
    // Where the middle of the photo goes: the middle of the circle, or half the photo
    // below the top of the page. It is laid out with its middle at photoSize / 2 - top.
    const closedY = SIZE / 2
    const openY = photoSize / 2 - top
    return {
      // In the photo's own, unscaled size: a circle at first, square corners when open.
      borderRadius: (photoSize / 2) * (1 - k),
      transform: [{ translateY: closedY + (openY - closedY) * k - (photoSize / 2 - top) + pinOpen(scrollY.value, k) }, { scale }],
    }
  })

  // What the open photo carries in place of the header, as in a Telegram profile: a shade
  // at the top for the status bar and the buttons, and one at the bottom for the name,
  // which the header carries down onto it (usePhotoNameSpot). Both come in over the last
  // part of the spread.
  const overlay = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.5, 1], [0, 1], 'clamp') }))

  // Centered on the block, which already starts leftInset in from the edge of the screen
  const photoLeft = (width - leftInset - rightInset - photoSize) / 2

  return (
    <View style={styles.block}>
      <Animated.View style={[styles.photo, { width: photoSize, height: photoSize, left: photoLeft, top: -top }, photo]}>
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
          <LinearGradient colors={BOTTOM_SHADE} style={styles.bottomShade} />
        </Animated.View>
      </Animated.View>
    </View>
  )
}

// The side of the open photo: the width of the screen, capped in landscape so it doesn't
// take 900+ pt.
function usePhotoSize() {
  const { width, height } = useWindowDimensions()
  const isLandscape = width > height && height > 0
  return isLandscape ? Math.min(width, Math.max(380, height * 0.85)) : width
}

// Where the name goes on the open photo, in screen points, for the header that carries
// its title there (see NameSpot in FormScreenHeader). Takes the same sides as the avatar.
export function usePhotoNameSpot(sideLeft: number, sideRight: number) {
  const { width } = useWindowDimensions()
  const photoSize = usePhotoSize()
  const photoLeft = sideLeft + (width - sideLeft - sideRight - photoSize) / 2
  return { left: photoLeft + NAME_INSET_X, bottom: photoSize - NAME_INSET_BOTTOM }
}

// The open photo stays put under a further pull, as in Telegram: the overscroll of iOS
// would carry the page down past it and spring back, so it is taken back by as much. It
// comes in with the spread, so the page doesn't jump up as the photo opens. Android never
// scrolls below zero, and there is nothing to take back.
export function pinOpen(scrollY: number, progress: number) {
  'worklet'
  return Math.min(0, scrollY) * progress
}

// For what follows the avatar in the page: moves it down as far as the open photo reaches
// past the circle's place.
export function useSpreadPush(progress: SharedValue<number>, top: number, scrollY: SharedValue<number>) {
  const photoSize = usePhotoSize()
  const reach = Math.max(0, photoSize - top - SIZE)
  return useAnimatedStyle(() => ({ transform: [{ translateY: reach * progress.value + pinOpen(scrollY.value, progress.value) }] }))
}

const TOP_SHADE = ['rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0)'] as const
const BOTTOM_SHADE = ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.55)'] as const

const styles = StyleSheet.create({
  block: { alignSelf: 'stretch', height: SIZE },
  photo: { position: 'absolute', overflow: 'hidden' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 },
})

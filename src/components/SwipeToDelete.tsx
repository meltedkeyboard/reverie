import { Icon } from '@/components/Icon'
import { useState } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import * as Haptics from '@/lib/haptics'
import { type Colors, ON_ACCENT, useStyles } from '@/theme'

type Props = {
  onDelete: () => void
  // Corner radius of the content, shared by the trash button behind it.
  radius: number
  // Accessibility label of the trash button.
  label: string
  // Makes the content itself tappable, with a small press effect.
  onPress?: () => void
  contentLabel?: string
  // Throws the content off screen before onDelete runs, for a delete that needs no
  // question. Otherwise the content springs back first, and onDelete asks.
  throwAway?: boolean
  children: React.ReactNode
}

const TRASH = 56
const GAP = 8
// How far the content stays pulled to the left with the trash button showing.
const REVEAL = TRASH + GAP
// Width of the strip along the left edge that is left to the system's swipe back.
const EDGE = 24
const SPRING ={ damping: 24, stiffness: 240 }

// Like a row in an iOS list: a swipe to the left uncovers a trash button, and a long
// swipe deletes at once. The one place this gesture lives, for cards and the continue
// button alike.
export function SwipeToDelete({ onDelete, radius, label, onPress, contentLabel, throwAway = false, children }: Props) {
  const styles = useStyles(createStyles)
  const { width } = useWindowDimensions()
  const [open, setOpen] = useState(false)
  const offset = useSharedValue(0)
  const start = useSharedValue(0)
  const armed = useSharedValue(false)
  const pressed = useSharedValue(false)
  // Past this pull letting go deletes without a tap on the trash.
  const full = width * 0.5

  const fire = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onDelete()
  }

  const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

  const close = () => {
    'worklet'
    offset.value = withSpring(0, SPRING)
    scheduleOnRN(setOpen, false)
  }

  const trigger = () => {
    'worklet'
    if (!throwAway) {
      close()
      scheduleOnRN(fire)
      return
    }
    offset.value = withTiming(-width - REVEAL, { duration: 220 }, (finished) => {
      if (finished) scheduleOnRN(fire)
    })
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    // A touch that starts at the left edge is the system's swipe back, not ours.
    .onTouchesDown((e, manager) => {
      if (e.allTouches[0] && e.allTouches[0].x < EDGE) manager.fail()
    })
    .onBegin(() => {
      start.value = offset.value
    })
    .onUpdate((e) => {
      const raw = start.value + e.translationX
      // Nothing is behind the right edge, so a pull that way only gives a little.
      offset.value = raw > 0 ? raw * 0.2 : raw
      const past = -offset.value > full
      if (past !== armed.value) {
        armed.value = past
        scheduleOnRN(tick)
      }
    })
    .onEnd((e) => {
      if (armed.value) {
        armed.value = false
        trigger()
      } else if (-offset.value > REVEAL / 2 || e.velocityX < -400) {
        offset.value = withSpring(-REVEAL, SPRING)
        scheduleOnRN(setOpen, true)
      } else {
        close()
      }
    })

  // Only there to close the row (and to open it, when the content is a button): a tap
  // on a closed row otherwise belongs to whatever is inside it.
  const tap = Gesture.Tap()
    .enabled(open || !!onPress)
    .onBegin(() => {
      pressed.value = !!onPress
    })
    .onFinalize(() => {
      pressed.value = false
    })
    .onEnd((_e, success) => {
      if (!success) return
      if (offset.value < 0) close()
      else if (onPress) scheduleOnRN(onPress)
    })

  // Liquid Glass renders wrongly under a fading parent, so the content only moves.
  const content = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.value },
      { scale: withTiming(pressed.value ? 0.97 : 1, { duration: 120 }) },
    ],
  }))

  // The trash button fills the gap the content leaves and stretches with a long swipe.
  const trash = useAnimatedStyle(() => {
    const pulled = Math.max(0, -offset.value)
    return {
      width: Math.max(TRASH, pulled - GAP),
      opacity: interpolate(pulled, [0, REVEAL * 0.6], [0, 1], 'clamp'),
      transform: [{ scale: interpolate(pulled, [0, REVEAL], [0.6, 1], 'clamp') }],
    }
  })

  return (
    <View>
      <Animated.View style={[styles.trashSlot, trash]}>
        <Pressable
          onPress={trigger}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed: down }) => [styles.trash, { borderRadius: radius }, down && { opacity: 0.8 }]}
        >
          <Icon name="trash" size={22} color={ON_ACCENT} />
        </Pressable>
      </Animated.View>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <Animated.View style={content} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={contentLabel}>
          {/* While the trash shows, a tap only closes the row, so nothing inside opens. */}
          <View pointerEvents={open ? 'none' : 'auto'}>{children}</View>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    trashSlot: { position: 'absolute', right: 0, top: 0, bottom: 0 },
    trash: { flex: 1, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  })

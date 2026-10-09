import { useEffect, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  runOnUI,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

type Props = {
  groupId: number
  // The groups open right now, set at the tap, before React renders anything.
  openGroups: SharedValue<number[]>
  // Whether React has the group open: touches and VoiceOver follow it.
  open: boolean
  index: number
  count: number
  // The space above the card, in place of the list's separator.
  gap: number
  children: ReactNode
}

// A member's card stays mounted under its group, closed to no height, so opening the group
// builds nothing: it only moves. The cards come down one after another, each a beat after
// the one above, the rows below riding on the growing height; closing takes them back up
// from the bottom.
export function MemberSlat({ groupId, openGroups, open, index, count, gap, children }: Props) {
  const shown = useSharedValue(open ? 1 : 0)
  // Where the slat is headed, so the tap and React's state, whichever comes first, start it once.
  const target = useSharedValue(open ? 1 : 0)
  const height = useSharedValue(0)

  const move = (to: number) => {
    'worklet'
    if (target.value === to) return
    target.value = to
    const delay = (to ? index : count - 1 - index) * STEP
    shown.value = withDelay(delay, to ? withSpring(1, SPRING) : withTiming(0, CLOSE))
  }
  useAnimatedReaction(
    () => openGroups.value.includes(groupId),
    (now, before) => {
      if (before !== null && now !== before) move(now ? 1 : 0)
    }
  )
  useEffect(() => {
    // On the UI thread, where the tap may have started it already.
    runOnUI(move)(open ? 1 : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Until the card has been measured an open one keeps its own height. Said outright: a
  // key left out of an animated style keeps its last value, and a closed 0 stayed for good.
  const slot = useAnimatedStyle(() =>
    height.value === 0 ? { height: shown.value > 0 ? 'auto' : 0 } : { height: (height.value + gap) * shown.value }
  )
  // The card hangs from the bottom of its growing slot, so it comes down out of the one above.
  const slat = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 3),
    transform: [{ translateY: -(1 - shown.value) * (height.value + gap) }],
  }))

  return (
    <Animated.View
      style={[styles.slot, slot]}
      pointerEvents={open ? 'box-none' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      <View
        style={{ paddingTop: gap }}
        onLayout={(e) => {
          height.value = e.nativeEvent.layout.height - gap
        }}
      >
        <Animated.View style={slat}>{children}</Animated.View>
      </View>
    </Animated.View>
  )
}

const STEP = 20
const SPRING = { duration: 220, dampingRatio: 1 }
const CLOSE = { duration: 140, easing: Easing.in(Easing.quad) }

const styles = StyleSheet.create({
  slot: { overflow: 'hidden' },
})

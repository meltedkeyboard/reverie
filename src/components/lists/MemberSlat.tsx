import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
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
// builds nothing: it only moves. The cards unfold like the slats of a blind, each turning
// down on its top edge a beat after the one above, the rows below riding on the growing
// height; closing folds them back up from the bottom.
export function MemberSlat({ groupId, openGroups, open, index, count, gap, children }: Props) {
  const shown = useSharedValue(open ? 1 : 0)
  const height = useSharedValue(0)

  useAnimatedReaction(
    () => openGroups.value.includes(groupId),
    (now, before) => {
      if (before === null || now === before) return
      const delay = (now ? index : count - 1 - index) * STEP
      shown.value = withDelay(delay, now ? withSpring(1, SPRING) : withTiming(0, CLOSE))
    }
  )

  // Until the card has been measured an open one keeps its own height.
  const slot = useAnimatedStyle(() =>
    height.value === 0 ? (shown.value > 0 ? {} : { height: 0 }) : { height: (height.value + gap) * shown.value }
  )
  const slat = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 3),
    transform: [{ perspective: PERSPECTIVE }, { rotateX: `${(1 - shown.value) * -90}deg` }],
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
        <Animated.View style={[styles.slat, slat]}>{children}</Animated.View>
      </View>
    </Animated.View>
  )
}

const STEP = 35
const SPRING = { duration: 350, dampingRatio: 1 }
const CLOSE = { duration: 220, easing: Easing.in(Easing.quad) }
const PERSPECTIVE = 900

const styles = StyleSheet.create({
  slot: { overflow: 'hidden' },
  slat: { transformOrigin: 'top' },
})

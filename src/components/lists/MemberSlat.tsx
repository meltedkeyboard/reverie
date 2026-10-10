import { useMemo, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, makeMutable, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnUI } from 'react-native-worklets'

// Each card takes 220 ms to come down, on about the curve of a critically damped spring that
// long, a beat after the one above. Going back in runs the same way backwards, faster, so
// the cards go in from the bottom up and a tap mid-way turns them around where they are.
// Declared before the worklets below, which take them in as soon as the module loads.
const SLAT = 220
const STEP = 20
const CLOSE_PACE = 0.65

// How long a group of `count` members takes to open.
function spanOf(count: number) {
  'worklet'
  return SLAT + Math.max(count - 1, 0) * STEP
}

// How far out the member at `index` is, 0 to 1, with its group `progress` of the way open.
function shownAt(progress: number, index: number, count: number) {
  'worklet'
  const t = (progress * spanOf(count) - index * STEP) / SLAT
  return t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) ** 3
}

// A row of the list as the motion sees it: a member comes with its group and its place there.
export type MotionRow = { key: string; member?: { id: number; group: number; index: number; count: number } }

export type GroupMotion = ReturnType<typeof useGroupMotion>

// The groups of a list open and close by transforms alone. Their members' slots take their
// height in one step as a group starts to open and give it up in one once it has shut; in
// between, every row from there down is held up by the height the cards have yet to fill.
// A height animated frame by frame relaid out the whole list on every frame and sent each
// row under it an onLayout, a trip to JS and back, and the motion stuttered.
export function useGroupMotion(rows: MotionRow[]) {
  // How far each group's members are out: 0 shut, 1 open. Kept through reloads.
  const progresses = useMemo(() => new Map<number, SharedValue<number>>(), [])
  const progressOf = (group: number) => {
    let progress = progresses.get(group)
    if (!progress) progresses.set(group, (progress = makeMutable(0)))
    return progress
  }
  // The same while only the open groups change, so a tap does not set the worklet up anew
  // under cards already moving.
  const order = rows.map(({ key, member }) => (member ? `${key}@${member.group}` : key)).join()
  const plan = useMemo(
    () => rows.map(({ key, member }) => ({ key, member: member && { ...member, progress: progressOf(member.group) } })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order]
  )
  // The height of each member's slot, its card and the gap above it, by character id.
  const heights = useSharedValue<Record<number, number>>({})
  // How far up each row is held, by key: what the members above it have yet to fill, or have
  // given back, of the height their slots take in the list.
  const shifts = useDerivedValue(() => {
    const held: Record<string, number> = {}
    let missing = 0
    for (const { key, member } of plan) {
      held[key] = missing
      if (!member || member.progress.value === 0) continue
      missing += (1 - shownAt(member.progress.value, member.index, member.count)) * (heights.value[member.id] ?? 0)
    }
    return held
  })

  // From wherever the group is, at a steady pace.
  const unfold = (group: number, open: boolean) => {
    const progress = progressOf(group)
    const count = rows.find(({ member }) => member?.group === group)?.member?.count ?? 1
    const span = spanOf(count) * (open ? 1 : CLOSE_PACE)
    const to = open ? 1 : 0
    scheduleOnUI(() => {
      'worklet'
      progress.value = withTiming(to, { duration: span * Math.abs(to - progress.value), easing: Easing.linear })
    })
  }
  // At once, with no motion.
  const shut = (group: number) => {
    progressOf(group).value = 0
  }

  return { shifts, heights, progressOf, unfold, shut }
}

type Props = {
  motion: GroupMotion
  rowKey: string
  id: number
  group: number
  // Whether React has the group open: touches and VoiceOver follow it.
  open: boolean
  index: number
  count: number
  // The space above the card, the same as the gap under every other row.
  gap: number
  children: ReactNode
}

// A member's card stays mounted under its group, closed to no height, so opening the group
// builds nothing: it only moves. The cards come down one after another, each a beat after
// the one above, the rows below riding on them; closing takes them back up from the bottom.
export function MemberSlat({ motion, rowKey, id, group, open, index, count, gap, children }: Props) {
  const { shifts, heights } = motion
  const progress = motion.progressOf(group)
  // A number, so the slot is moved only when it has to: a transform is a new array every
  // time and would be sent again for every slot on every frame. A shut group's slots take
  // no room and stay where they are.
  const shift = useDerivedValue(() => (progress.value > 0 ? (shifts.value[rowKey] ?? 0) : 0))
  const slot = useAnimatedStyle(() => ({ height: progress.value > 0 ? 'auto' : 0 }))
  // The row above ends in a gap (the group's own, or the one the member before carries), so
  // the slot is drawn moved up over it: the card comes out from under the card above, and
  // the gap is left under this one in its place.
  const held = useAnimatedStyle(() => ({ transform: [{ translateY: -gap - shift.value }] }))
  // The card hangs from the bottom of the part of its slot it has come out to.
  const slat = useAnimatedStyle(() => {
    const shown = shownAt(progress.value, index, count)
    return { opacity: Math.min(1, shown * 3), transform: [{ translateY: -(1 - shown) * (heights.value[id] ?? 0) }] }
  })

  return (
    <Animated.View
      style={[styles.slot, slot, held]}
      pointerEvents={open ? 'box-none' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      <View
        style={{ paddingTop: gap }}
        onLayout={(e) => {
          const height = e.nativeEvent.layout.height
          heights.modify((all) => {
            'worklet'
            return { ...all, [id]: height }
          })
        }}
      >
        <Animated.View style={slat}>{children}</Animated.View>
      </View>
    </Animated.View>
  )
}

// A row outside the groups, with the gap under it, riding on the members above it.
export function RidingRow({ motion, rowKey, gap, children }: { motion: GroupMotion; rowKey: string; gap: number; children: ReactNode }) {
  const { shifts } = motion
  const shift = useDerivedValue(() => shifts.value[rowKey] ?? 0)
  const held = useAnimatedStyle(() => ({ transform: [{ translateY: -shift.value }] }))
  return <Animated.View style={[{ paddingBottom: gap }, held]}>{children}</Animated.View>
}

const styles = StyleSheet.create({
  slot: { overflow: 'hidden' },
})

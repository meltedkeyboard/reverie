import { useMemo } from 'react'
import { Gesture } from 'react-native-gesture-handler'
import { reorderItems, type ReorderableListReorderEvent } from 'react-native-reorderable-list'
import { scheduleOnRN } from 'react-native-worklets'

import * as Haptics from '@/lib/ui/haptics'

const EDGE = 24
const pickUp = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
const swap = () => Haptics.selectionAsync()
const drop = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

// Made once, not on every render: the list builds what starts a drag from onDragStart and
// hands it to every cell, so a new one rendered all the rows again with each render of
// the screen, memoized or not.
const onDragStart = () => {
  'worklet'
  scheduleOnRN(pickUp)
}
const onIndexChange = () => {
  'worklet'
  scheduleOnRN(swap)
}
const onDragEnd = () => {
  'worklet'
  scheduleOnRN(drop)
}

// The taps alone, for a list whose order lives only in the screen, as pictures before sending.
export const reorderFeel = { onDragStart, onIndexChange, onDragEnd }

// The props that make a ReorderableList draggable: shows the new order at once, saves it,
// and taps on picking up, on every place swapped on the way, and on dropping.
export function useReorder<T extends { id: number }>(
  items: T[] | null,
  setItems: (items: T[]) => void,
  save: (ids: number[]) => Promise<unknown>,
  // Off where no swipe back starts at the edge (the chat's drawer), so a row is lifted
  // wherever it is pressed.
  { edge = true }: { edge?: boolean } = {}
) {
  // The list's own pan sits over the whole screen and would swallow the system's swipe
  // back from the left edge, so a touch that starts there is left alone. No row is lifted
  // from there either: the list starts a drag only while its pan holds the finger.
  const panGesture = useMemo(
    () =>
      Gesture.Pan().onTouchesDown((e, manager) => {
        'worklet'
        if (edge && e.allTouches[0] && e.allTouches[0].absoluteX < EDGE) manager.fail()
      }),
    [edge]
  )

  return {
    panGesture,
    onReorder: ({ from, to }: ReorderableListReorderEvent) => {
      if (!items) return
      const next = reorderItems(items, from, to)
      setItems(next)
      save(next.map((item) => item.id))
    },
    ...reorderFeel,
  }
}

import { useMemo } from 'react'
import { Gesture } from 'react-native-gesture-handler'
import { reorderItems, type ReorderableListReorderEvent } from 'react-native-reorderable-list'
import { scheduleOnRN } from 'react-native-worklets'

import * as Haptics from '@/lib/ui/haptics'

const EDGE = 24
const pickUp = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
const swap = () => Haptics.selectionAsync()
const drop = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

// The props that make a ReorderableList draggable: shows the new order at once, saves it,
// and taps on picking up, on every place swapped on the way, and on dropping.
export function useReorder<T extends { id: number }>(
  items: T[] | null,
  setItems: (items: T[]) => void,
  save: (ids: number[]) => Promise<unknown>
) {
  // The list's own pan sits over the whole screen and would swallow the system's swipe
  // back from the left edge, so a touch that starts there is left alone.
  const panGesture = useMemo(
    () =>
      Gesture.Pan().onTouchesDown((e, manager) => {
        'worklet'
        if (e.allTouches[0] && e.allTouches[0].absoluteX < EDGE) manager.fail()
      }),
    []
  )

  return {
    panGesture,
    onReorder: ({ from, to }: ReorderableListReorderEvent) => {
      if (!items) return
      const next = reorderItems(items, from, to)
      setItems(next)
      save(next.map((item) => item.id))
    },
    onDragStart: () => {
      'worklet'
      scheduleOnRN(pickUp)
    },
    onIndexChange: () => {
      'worklet'
      scheduleOnRN(swap)
    },
    onDragEnd: () => {
      'worklet'
      scheduleOnRN(drop)
    },
  }
}

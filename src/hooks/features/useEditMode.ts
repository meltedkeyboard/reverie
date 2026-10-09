import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { useSharedValue } from 'react-native-reanimated'

import { setEditMotion } from '@/components/lists/ListCard'
import { useLastChatContext } from '@/hooks/chat/useLastChat'

// The edit mode of a home list: the cards' motion, the ticked ids, and the props of the
// button that switches it. The continue button is away meanwhile.
export function useEditMode(onChange?: (on: boolean) => void) {
  const [editing, setEditing] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const { setSuspended } = useLastChatContext()
  useEffect(() => {
    setSuspended(editing)
    return () => setSuspended(false)
  }, [editing, setSuspended])

  // Driven from here, so the cards start moving at the touch, not after the list renders.
  const progress = useSharedValue(0)
  const settled = useSharedValue(0)
  const motion = useMemo(() => ({ progress, settled }), [progress, settled])

  const set = (on: boolean) => {
    setEditMotion(motion, on)
    setEditing(on)
    setChecked(new Set())
    onChange?.(on)
  }

  // The cards start moving at the touch, but the mode changes only when it ends on the
  // button: a finger slid off it takes the motion back. onPressOut comes before onPress, so
  // the take-back waits a turn for the press to claim it.
  const pressing = useRef(false)
  const button = {
    onPressIn: () => {
      pressing.current = true
      setEditMotion(motion, !editing)
    },
    onPressOut: () =>
      setTimeout(() => {
        if (!pressing.current) return
        pressing.current = false
        setEditMotion(motion, editing)
      }),
    onPress: () => {
      pressing.current = false
      set(!editing)
    },
  }

  // Several ids tick or clear together (a group's characters). A transition, since it
  // renders the whole list again: the card shows its tick by itself meanwhile.
  const toggleChecked = (ids: number[]) =>
    startTransition(() =>
      setChecked((prev) => {
        const next = new Set(prev)
        const all = ids.every((id) => next.has(id))
        for (const id of ids) {
          if (all) next.delete(id)
          else next.add(id)
        }
        return next
      })
    )

  return { editing, setEditing: set, motion, button, checked, setChecked, toggleChecked }
}

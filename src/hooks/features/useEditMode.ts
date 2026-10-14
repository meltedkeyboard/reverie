import { startTransition, useContext, useEffect, useMemo, useState } from 'react'
import { useSharedValue } from 'react-native-reanimated'

import { setEditMotion } from '@/components/lists/ListCard'
import { Context as LastChatContext } from '@/hooks/chat/useLastChat'

// The edit mode of a list: the cards' motion, the ticked ids, and the props of the
// button that switches it. The continue button is away meanwhile if present.
export function useEditMode(onChange?: (on: boolean) => void) {
  const [editing, setEditing] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const lastChat = useContext(LastChatContext)
  const setSuspended = lastChat?.setSuspended
  useEffect(() => {
    if (!editing) return
    setSuspended?.(true)
    return () => setSuspended?.(false)
  }, [editing, setSuspended])

  const progress = useSharedValue(0)
  const settled = useSharedValue(0)
  const motion = useMemo(() => ({ progress, settled }), [progress, settled])

  const set = (on: boolean) => {
    setEditMotion(motion, on)
    setEditing(on)
    setChecked(new Set())
    onChange?.(on)
  }

  const button = {
    onPress: () => {
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

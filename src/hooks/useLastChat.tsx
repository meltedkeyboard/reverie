import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWindowDimensions, type View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { getLastChat, type LastChat } from '@/db/chats'
import { getLastOpened, isContinueByVisit, isContinueEnabled, isContinueHidden, setContinueHidden, type ContinueKind } from '@/db/continue'
import { useDatabase } from '@/db/provider'
import { createRequiredContext } from '@/lib/requiredContext'

type Chats = Record<ContinueKind, LastChat | null>

type LastChatContext = {
  chats: Chats
  reload: (kind: ContinueKind) => Promise<void>
  hide: (kind: ContinueKind) => void
  // Distance from the bottom of the window to where the tab's content ends, which the
  // continue button floats above.
  bottom: number
  setBottom: (bottom: number) => void
}

export const [Context, useLastChatContext] = createRequiredContext<LastChatContext>('useLastChat needs LastChatProvider')

// The chats behind the continue button, for both home tabs at once: the button is one,
// drawn over the tabs, and switching tabs only changes what it shows. Both are loaded up
// front, so the tab opened the first time already has its chat.
export function LastChatProvider({ children }: { children: React.ReactNode }) {
  const db = useDatabase()
  const [chats, setChats] = useState<Chats>({ character: null, room: null })
  const [bottom, setBottom] = useState(0)

  const reload = useCallback(
    async (kind: ContinueKind) => {
      const show = (await isContinueEnabled(db)) && !(await isContinueHidden(db, kind))
      const openedId = show && (await isContinueByVisit(db)) ? await getLastOpened(db, kind) : null
      const chat = show ? await getLastChat(db, kind, openedId) : null
      setChats((prev) => ({ ...prev, [kind]: chat }))
    },
    [db]
  )

  const hide = useCallback(
    (kind: ContinueKind) => {
      setChats((prev) => ({ ...prev, [kind]: null }))
      setContinueHidden(db, kind, true)
    },
    [db]
  )

  useEffect(() => {
    reload('character')
    reload('room')
  }, [reload])

  const value = useMemo(() => ({ chats, reload, hide, bottom, setBottom }), [chats, reload, hide, bottom])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

// The chat the continue button opens on a home tab: the last one with a character on
// Characters, the last scene on Rooms. Null while the button is turned off or swiped away.
export function useLastChat(kind: ContinueKind) {
  const { chats, reload, hide } = useLastChatContext()
  return {
    lastChat: chats[kind],
    reload: useCallback(() => reload(kind), [reload, kind]),
    hide: useCallback(() => hide(kind), [hide, kind]),
  }
}

// Re-measured this long after a tab comes into focus: the tab bar's inset and the layout of
// a tab shown for the first time can arrive a moment later than the focus.
const SETTLE_DELAYS = [0, 100, 300, 700]
// And now and then while the tab stays open, in case something moved without a layout event.
const RECHECK_MS = 500

// For the root view of a home tab: tells the button where the tab's content ends. Inside a
// tab the safe area already takes in the tab bar.
// Only the tab in focus reports: a hidden one can measure wrong and push the button off
// its place, down to the very bottom of the screen.
export function useContinueAnchor() {
  const { setBottom } = useLastChatContext()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const ref = useRef<View>(null)
  const focused = useRef(false)
  // Read at measuring time, so the timers never use values from an older render.
  const latest = useRef({ inset: insets.bottom, height })
  latest.current = { inset: insets.bottom, height }

  const measure = useCallback(() => {
    if (!focused.current) return
    ref.current?.measureInWindow((_x, y, _w, h) => {
      // A view not laid out yet reports zero height; that is no answer at all.
      if (!focused.current || h <= 0) return
      setBottom(Math.max(0, latest.current.height - (y + h)) + latest.current.inset)
    })
  }, [setBottom])

  useFocusEffect(
    useCallback(() => {
      focused.current = true
      const frame = requestAnimationFrame(measure)
      const timers = SETTLE_DELAYS.map((ms) => setTimeout(measure, ms))
      const recheck = setInterval(measure, RECHECK_MS)
      return () => {
        focused.current = false
        cancelAnimationFrame(frame)
        timers.forEach(clearTimeout)
        clearInterval(recheck)
      }
    }, [measure])
  )

  useEffect(measure, [measure, insets.bottom, height])
  return { ref, onLayout: measure }
}

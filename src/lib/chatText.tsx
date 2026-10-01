import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { useDatabase } from '@/db/provider'
import {
  CHAT_TEXT_SCALE_RANGE,
  DEFAULT_CHAT_FONT,
  loadChatFont,
  loadChatTextScale,
  loadChatUserFont,
  saveChatFont,
  saveChatTextScale,
  saveChatUserFont,
  type ChatFont,
} from '@/db/settings'

// Base size and line height of the chat texts, before the chosen scale.
export const CHAT_METRICS = {
  user: { size: 16, line: 22 },
  bot: { size: 17, line: 27 },
  narration: { size: 16, line: 25 },
} as const

type ChatTextValue = {
  font: ChatFont
  // Whether the user's own messages use the font too, not the system one.
  userFont: boolean
  setUserFont: (on: boolean) => void
  // How much the chat text is enlarged: 1 is the regular size.
  scale: number
  setFont: (font: ChatFont) => void
  // The scale follows a slider, so it is shown at once and written only when `save` says so.
  setScale: (scale: number, save?: boolean) => void
  reset: () => void
}

const ChatTextContext = createContext<ChatTextValue | null>(null)

export function ChatTextProvider({ children }: { children: React.ReactNode }) {
  const db = useDatabase()
  const [font, setFontState] = useState<ChatFont>(DEFAULT_CHAT_FONT)
  const [scale, setScaleState] = useState<number>(CHAT_TEXT_SCALE_RANGE.default)
  const [userFont, setUserFontState] = useState(false)

  useEffect(() => {
    loadChatFont(db).then(setFontState)
    loadChatTextScale(db).then(setScaleState)
    loadChatUserFont(db).then(setUserFontState)
  }, [db])

  const setFont = useCallback(
    (next: ChatFont) => {
      setFontState(next)
      saveChatFont(db, next)
    },
    [db]
  )
  const setScale = useCallback(
    (next: number, save = true) => {
      setScaleState(next)
      if (save) saveChatTextScale(db, next)
    },
    [db]
  )
  const setUserFont = useCallback(
    (on: boolean) => {
      setUserFontState(on)
      saveChatUserFont(db, on)
    },
    [db]
  )
  const reset = useCallback(() => {
    setFont(DEFAULT_CHAT_FONT)
    setUserFont(false)
    setScale(CHAT_TEXT_SCALE_RANGE.default)
  }, [setFont, setScale, setUserFont])

  const value = useMemo(
    () => ({ font, userFont, setUserFont, scale, setFont, setScale, reset }),
    [font, userFont, setUserFont, scale, setFont, setScale, reset]
  )
  return <ChatTextContext.Provider value={value}>{children}</ChatTextContext.Provider>
}

export function useChatTextSettings() {
  const ctx = useContext(ChatTextContext)
  if (!ctx) throw new Error('useChatTextSettings must be used within ChatTextProvider')
  return ctx
}

// What a style of chat text takes from the settings: the family, and sizes that are
// multiplied by the chosen scale. `scaled(17)` is a font size, `scaled(27)` a line height.
export function useChatText() {
  const { font, userFont, scale } = useChatTextSettings()
  return useMemo(
    () => ({
      fontFamily: font,
      // undefined is the system font.
      userFontFamily: userFont ? font : undefined,
      scaled: (value: number) => Math.round(value * scale * 100) / 100,
    }),
    [font, userFont, scale]
  )
}

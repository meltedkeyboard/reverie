import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { useDatabase } from '@/db/provider'
import {
  CHAT_TEXT_SCALE_RANGE,
  DEFAULT_CHAT_FONT,
  loadChatFont,
  loadChatTextScale,
  saveChatFont,
  saveChatTextScale,
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

  useEffect(() => {
    loadChatFont(db).then(setFontState)
    loadChatTextScale(db).then(setScaleState)
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
  const reset = useCallback(() => {
    setFont(DEFAULT_CHAT_FONT)
    setScale(CHAT_TEXT_SCALE_RANGE.default)
  }, [setFont, setScale])

  const value = useMemo(() => ({ font, scale, setFont, setScale, reset }), [font, scale, setFont, setScale, reset])
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
  const { font, scale } = useChatTextSettings()
  return useMemo(
    () => ({
      fontFamily: font,
      scaled: (value: number) => Math.round(value * scale * 100) / 100,
    }),
    [font, scale]
  )
}

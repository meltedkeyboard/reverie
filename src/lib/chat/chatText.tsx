import { useCallback, useEffect, useMemo, useState } from 'react'

import { useDatabase } from '@/db/provider'
import {
  CHAT_TEXT_SCALE_RANGE,
  DEFAULT_CHAT_FONT,
  loadChatFont,
  loadChatPattern,
  loadChatTextScale,
  loadChatUserFont,
  loadChatUserMarkdown,
  saveChatFont,
  saveChatPattern,
  saveChatTextScale,
  saveChatUserFont,
  saveChatUserMarkdown,
  type ChatFont,
  type ChatPatternId,
} from '@/db/prefs/settings'
import { createRequiredContext } from '@/lib/core/requiredContext'

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
  // Whether the user's own messages go through Markdown, as the replies do.
  userMarkdown: boolean
  setUserMarkdown: (on: boolean) => void
  // The pattern behind chats that have no picture of their own.
  pattern: ChatPatternId
  setPattern: (pattern: ChatPatternId) => void
  // How much the chat text is enlarged: 1 is the regular size.
  scale: number
  setFont: (font: ChatFont) => void
  // The scale follows a slider, so it is shown at once and written only when `save` says so.
  setScale: (scale: number, save?: boolean) => void
  reset: () => void
}

export const [ChatTextContext, useChatTextSettings] = createRequiredContext<ChatTextValue>('useChatTextSettings must be used within ChatTextProvider')

export function ChatTextProvider({ children }: { children: React.ReactNode }) {
  const db = useDatabase()
  const [font, setFontState] = useState<ChatFont>(DEFAULT_CHAT_FONT)
  const [scale, setScaleState] = useState<number>(CHAT_TEXT_SCALE_RANGE.default)
  const [userFont, setUserFontState] = useState(false)
  const [userMarkdown, setUserMarkdownState] = useState(false)
  const [pattern, setPatternState] = useState<ChatPatternId>('none')

  useEffect(() => {
    loadChatPattern(db).then(setPatternState)
    loadChatFont(db).then(setFontState)
    loadChatTextScale(db).then(setScaleState)
    loadChatUserFont(db).then(setUserFontState)
    loadChatUserMarkdown(db).then(setUserMarkdownState)
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
  const setUserMarkdown = useCallback(
    (on: boolean) => {
      setUserMarkdownState(on)
      saveChatUserMarkdown(db, on)
    },
    [db]
  )
  const setPattern = useCallback(
    (next: ChatPatternId) => {
      setPatternState(next)
      saveChatPattern(db, next)
    },
    [db]
  )
  const reset = useCallback(() => {
    setFont(DEFAULT_CHAT_FONT)
    setUserFont(false)
    setScale(CHAT_TEXT_SCALE_RANGE.default)
  }, [setFont, setScale, setUserFont])

  const value = useMemo(
    () => ({ font, userFont, setUserFont, userMarkdown, setUserMarkdown, pattern, setPattern, scale, setFont, setScale, reset }),
    [font, userFont, setUserFont, userMarkdown, setUserMarkdown, pattern, setPattern, scale, setFont, setScale, reset]
  )
  return <ChatTextContext.Provider value={value}>{children}</ChatTextContext.Provider>
}

// What a style of chat text takes from the settings: the family, and sizes that are
// multiplied by the chosen scale. `scaled(17)` is a font size, `scaled(27)` a line height.
export function useChatText() {
  const { font, userFont, userMarkdown, scale } = useChatTextSettings()
  return useMemo(
    () => ({
      fontFamily: font,
      // undefined is the system font.
      userFontFamily: userFont ? font : undefined,
      userMarkdown,
      scaled: (value: number) => Math.round(value * scale * 100) / 100,
    }),
    [font, userFont, userMarkdown, scale]
  )
}

import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { MenuItem } from '@/components/overlays/NativeMenu'
import { setChatDirection, setChatSuggestionDirection, type Chat } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { setTextDraft } from '@/lib/chat/textDraft'
import { isFeatureOn } from '@/lib/settings/features'

// A chat's direction: the user's standing note to the model (where the story should go, the
// tone, the pace), sent with every request until it is cleared. Opened from the attach menu
// over the whole screen; the request builders read `current`.
export function useDirection(chat: Chat) {
  const db = useDatabase()
  const router = useRouter()
  const { t } = useTranslation()
  const chatId = chat.id
  const text = useRef(chat.direction ?? '')
  const [directionText, setDirectionText] = useState(chat.direction ?? '')
  const suggestionTextRef = useRef(chat.suggestionDirection ?? '')
  const [suggestionDirectionText, setSuggestionDirectionText] = useState(chat.suggestionDirection ?? '')
  const [isSet, setIsSet] = useState(Boolean(chat.direction?.trim() || chat.suggestionDirection?.trim()))

  useEffect(() => {
    text.current = chat.direction ?? ''
    setDirectionText(chat.direction ?? '')
    suggestionTextRef.current = chat.suggestionDirection ?? ''
    setSuggestionDirectionText(chat.suggestionDirection ?? '')
    setIsSet(Boolean(chat.direction?.trim() || chat.suggestionDirection?.trim()))
  }, [chat.id, chat.direction, chat.suggestionDirection])

  // Switched off in Settings, nothing is sent, the text kept for when it is on again.
  const current = useCallback(() => (isFeatureOn('direction') ? text.current.trim() : ''), [])
  const suggestionCurrent = useCallback(() => (isFeatureOn('direction') ? suggestionTextRef.current.trim() : ''), [])

  const set = useCallback(
    (value: string) => {
      text.current = value
      setDirectionText(value)
      setIsSet(Boolean(value.trim() || suggestionTextRef.current.trim()))
      setChatDirection(db, chatId, value)
    },
    [db, chatId]
  )

  const setSuggestionDirection = useCallback(
    (value: string) => {
      suggestionTextRef.current = value
      setSuggestionDirectionText(value)
      setIsSet(Boolean(text.current.trim() || value.trim()))
      setChatSuggestionDirection(db, chatId, value)
    },
    [db, chatId]
  )

  const open = useCallback(() => {
    setTextDraft({
      title: t('direction.title'),
      value: text.current,
      placeholder: t('direction.placeholder'),
      onChange: (value) => {
        set(value)
      },
    })
    setTimeout(() => router.push('/text-editor'), 50)
  }, [set, router, t])

  const menu = useMemo<MenuItem[]>(
    () => [{ label: isSet ? t('direction.menuSet') : t('direction.menu'), systemImage: 'signpost.right', onSelect: open }],
    [isSet, open, t]
  )

  return useMemo(
    () => ({
      current,
      suggestionCurrent,
      set,
      setSuggestionDirection,
      open,
      isSet,
      text: directionText,
      suggestionText: suggestionDirectionText,
      menu,
    }),
    [current, suggestionCurrent, set, setSuggestionDirection, open, isSet, directionText, suggestionDirectionText, menu]
  )
}

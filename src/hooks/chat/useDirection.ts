import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { MenuItem } from '@/components/overlays/NativeMenu'
import { setChatDirection, type Chat } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { setTextDraft } from '@/lib/chat/textDraft'

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
  const [isSet, setIsSet] = useState(Boolean(chat.direction?.trim()))

  useEffect(() => {
    text.current = chat.direction ?? ''
    setDirectionText(chat.direction ?? '')
    setIsSet(Boolean(chat.direction?.trim()))
  }, [chat.id, chat.direction])

  const current = useCallback(() => text.current.trim(), [])

  const set = useCallback((value: string) => {
    text.current = value
    setDirectionText(value)
    setIsSet(Boolean(value.trim()))
    setChatDirection(db, chatId, value)
  }, [db, chatId])

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
    () => ({ current, set, open, isSet, text: directionText, menu }),
    [current, set, open, isSet, directionText, menu]
  )
}

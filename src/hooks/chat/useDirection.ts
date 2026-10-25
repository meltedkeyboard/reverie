import { useRouter } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'

import type { MenuItem } from '@/components/overlays/NativeMenu'
import { setChatDirection, type Chat } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { setTextDraft } from '@/lib/chat/textDraft'

// A chat's direction: the user's standing note to the model (where the story should go, the
// tone, the pace), sent with every request until it is cleared. "Direction" in the chat's
// and the scene's menu opens it over the whole screen; the request builders read `current`.
export function useDirection(chat: Chat) {
  const db = useDatabase()
  const router = useRouter()
  const { t } = useTranslation()
  const chatId = chat.id
  const text = useRef(chat.direction ?? '')
  const [isSet, setIsSet] = useState(Boolean(chat.direction?.trim()))

  const current = useCallback(() => text.current.trim(), [])

  const open = useCallback(() => {
    setTextDraft({
      title: t('direction.title'),
      value: text.current,
      placeholder: t('direction.placeholder'),
      onChange: (value) => {
        text.current = value
        setIsSet(Boolean(value.trim()))
        setChatDirection(db, chatId, value)
      },
    })
    router.push('/text-editor')
  }, [db, chatId, router, t])

  const menu = useMemo<MenuItem[]>(
    () => [{ label: isSet ? t('direction.menuSet') : t('direction.menu'), systemImage: 'signpost.right', onSelect: open }],
    [isSet, open, t]
  )

  return useMemo(() => ({ current, menu }), [current, menu])
}

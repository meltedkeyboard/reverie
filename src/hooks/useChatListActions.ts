import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'

import { deleteChat, duplicateChat, setChatTitle } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { confirmDeleteChat, promptRenameChat } from '@/lib/chatDialogs'

// Loads a screen's list again whenever the screen comes into focus.
export function useReloadOnFocus(reload: () => void) {
  useFocusEffect(
    useCallback(() => {
      reload()
    }, [reload])
  )
}

// Rename, duplicate and delete for the chats listed on a character's or a room's screen,
// each followed by a reload of the list.
export function useChatListActions(reload: () => void) {
  const db = useDatabase()
  const { t } = useTranslation()

  const duplicate = async (chat: { id: number; title: string | null }) => {
    const title = chat.title ? `${chat.title} (${t('characters.copySuffix')})` : null
    await duplicateChat(db, chat.id, title)
    reload()
  }

  const rename = (chat: { id: number; title: string | null }) => {
    promptRenameChat(chat.title, async (text) => {
      await setChatTitle(db, chat.id, text)
      reload()
    })
  }

  const remove = (chat: { id: number }) => {
    confirmDeleteChat(async () => {
      await deleteChat(db, chat.id)
      reload()
    })
  }

  return { duplicate, rename, remove }
}

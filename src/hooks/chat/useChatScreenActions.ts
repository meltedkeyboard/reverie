import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { useCallback } from 'react'

import type { RowMessage } from '@/components/chat/MessageRow'
import { deleteChat } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { confirmDeleteChat, promptRenameChat } from '@/lib/chat/chatDialogs'
import { promptText, showMessage } from '@/lib/ui/dialogs'
import type { MessageAction } from '@/lib/chat/messageActions'
import { alertError } from '@/lib/transfer/report'

type MessageActionHandlers = {
  regenerate: (id: number, guidance?: string) => void
  removeMessage: (id: number) => void
  edit: (message: RowMessage) => void
}

// What the menu on a message does, the same in a chat and in a scene.
export function useMessageActions({ regenerate, removeMessage, edit }: MessageActionHandlers) {
  const { t } = useTranslation()
  return useCallback(
    (message: RowMessage, action: MessageAction) => {
      if (action === 'copy') Clipboard.setStringAsync(message.content)
      else if (action === 'regenerate') regenerate(message.id)
      else if (action === 'refine') {
        promptText({
          title: t('chat.refineTitle'),
          message: t('chat.refineMessage'),
          confirmLabel: t('chat.refineConfirm'),
          onSubmit: (text) => {
            if (text.trim()) regenerate(message.id, text)
          },
        })
      } else if (action === 'edit') edit(message)
      else removeMessage(message.id)
    },
    [regenerate, removeMessage, edit, t]
  )
}

type ChatMenuHandlers = {
  chatId: number
  title: string | null
  rename: (title: string | null) => Promise<void>
  autoName: () => Promise<string | null>
  discard: () => void
}

// The header menu's rename, title suggestion and delete, the same in a chat and in a scene.
export function useChatMenuActions({ chatId, title, rename, autoName, discard }: ChatMenuHandlers) {
  const db = useDatabase()
  const router = useRouter()
  const { t } = useTranslation()

  const confirmDelete = () => {
    confirmDeleteChat(async () => {
      discard()
      await deleteChat(db, chatId)
      router.back()
    })
  }

  const promptRename = () => promptRenameChat(title, rename)

  const suggestName = async () => {
    try {
      if (!(await autoName())) showMessage(t('chat.titleNotFoundTitle'), t('chat.titleNotFoundMessage'))
    } catch (err) {
      alertError(t('chat.titleFailedTitle'), err)
    }
  }

  return { confirmDelete, promptRename, suggestName }
}

import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { useCallback } from 'react'

import type { RowMessage } from '@/components/chat/MessageRow'
import { branchChat, deleteChat, getChat, type Chat } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { confirmDeleteChat, promptRenameChat } from '@/lib/chat/chatDialogs'
import { promptText, showMessage } from '@/lib/ui/dialogs'
import type { MessageAction } from '@/lib/chat/messageActions'
import { alertError, reportError } from '@/lib/transfer/report'

type MessageActionHandlers = {
  regenerate: (id: number, guidance?: string) => void
  removeRefine: (id: number) => void
  removeVariant: (id: number) => void
  removeMessage: (id: number) => void
  edit: (message: RowMessage) => void
  branch: (id: number) => void
}

// What the menu on a message does, the same in a chat and in a scene.
export function useMessageActions({ regenerate, removeRefine, removeVariant, removeMessage, edit, branch }: MessageActionHandlers) {
  const { t } = useTranslation()
  return useCallback(
    (message: RowMessage, action: MessageAction) => {
      const wish = message.refines[message.variant] ?? undefined
      if (action === 'copy') Clipboard.setStringAsync(message.content)
      else if (action === 'regenerate') regenerate(message.id)
      else if (action === 'refine' || action === 'editRefine') {
        promptText({
          title: t('chat.refineTitle'),
          message: t('chat.refineMessage'),
          initial: action === 'editRefine' ? wish : undefined,
          confirmLabel: t('chat.refineConfirm'),
          onSubmit: (text) => {
            if (text.trim()) regenerate(message.id, text)
          },
        })
      } else if (action === 'refineAgain') {
        if (wish) regenerate(message.id, wish)
      } else if (action === 'dropRefine') removeRefine(message.id)
      else if (action === 'deleteVariant') removeVariant(message.id)
      else if (action === 'edit') edit(message)
      else if (action === 'branch') branch(message.id)
      else removeMessage(message.id)
    },
    [regenerate, removeRefine, removeVariant, removeMessage, edit, branch, t]
  )
}

// A new chat that goes on from a message (branchChat), taken to at once: the chat it came
// from stays as it was.
export function useBranch(chatId: number, title: string | null, onShow: (chat: Chat) => void) {
  const db = useDatabase()
  const { t } = useTranslation()
  return useCallback(
    async (messageId: number) => {
      try {
        const id = await branchChat(db, chatId, messageId, title ? t('chat.branchTitle', { title }) : null)
        const chat = await getChat(db, id)
        if (chat) onShow(chat)
      } catch (err) {
        reportError(t('chat.branchFailed'), err)
      }
    },
    [db, chatId, title, onShow, t]
  )
}

type ChatMenuHandlers = {
  chatId: number
  title: string | null
  rename: (title: string | null) => Promise<void>
  autoName: () => Promise<string | null>
  discard: () => void
  // Where to go once the chat is deleted; back by default.
  onDeleted?: () => void
}

// The header menu's rename, title suggestion and delete, the same in a chat and in a scene.
export function useChatMenuActions({ chatId, title, rename, autoName, discard, onDeleted }: ChatMenuHandlers) {
  const db = useDatabase()
  const router = useRouter()
  const { t } = useTranslation()

  const confirmDelete = () => {
    confirmDeleteChat(async () => {
      discard()
      await deleteChat(db, chatId)
      if (onDeleted) onDeleted()
      else router.back()
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

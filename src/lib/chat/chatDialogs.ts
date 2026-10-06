import { t } from '@/i18n'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { promptText } from '@/lib/ui/dialogs'

// Asked the same way from inside a chat and from the character's list of chats.
export function promptRenameChat(initial: string | null, onSubmit: (title: string) => void) {
  promptText({
    title: t('chat.renameChatTitle'),
    message: t('chat.renameChatMessage'),
    initial: initial ?? '',
    confirmLabel: t('common.save'),
    onSubmit,
  })
}

export function confirmDeleteChat(onConfirm: () => void) {
  confirmDeletion({
    title: t('chat.deleteChatTitle'),
    message: t('chat.deleteChatMessage'),
    onConfirm,
  })
}

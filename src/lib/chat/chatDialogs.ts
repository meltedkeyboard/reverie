import { t } from '@/i18n'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { promptText } from '@/lib/ui/dialogs'

// Asked the same way from inside a chat and from the character's list of chats.
// `scheme` is the chat's, when asked from inside it (see TextPrompt).
export function promptRenameChat(initial: string | null, onSubmit: (title: string) => void, scheme?: 'light' | 'dark' | null) {
  promptText({
    scheme,
    title: t('chat.renameChatTitle'),
    message: t('chat.renameChatMessage'),
    initial: initial ?? '',
    confirmLabel: t('common.save'),
    onSubmit,
  })
}

export function confirmDeleteChat(onConfirm: () => void, scheme?: 'light' | 'dark' | null) {
  confirmDeletion({
    scheme,
    title: t('chat.deleteChatTitle'),
    message: t('chat.deleteChatMessage'),
    onConfirm,
  })
}

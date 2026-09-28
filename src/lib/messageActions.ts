
import { t } from '@/i18n'
import type { Role } from '@/db/messages'

// refine regenerates with a wish from the user, like "more surprised" or "sadder".
export type MessageAction = 'copy' | 'select' | 'regenerate' | 'refine' | 'edit' | 'delete'

export type ActionItem = {
  action: MessageAction
  label: string
  // SF Symbol shown next to the label in the native iOS menu.
  systemImage: string
  destructive?: boolean
}

type Options = {
  canRegenerate: boolean
  // Set while a reply streams or a message is being edited: only reading actions remain.
  locked: boolean
}

export function messageActions(message: { role: Role; content: string }, { canRegenerate, locked }: Options) {
  const items: ActionItem[] = []
  if (message.content) {
    items.push({ action: 'copy', label: t('action.copy'), systemImage: 'doc.on.doc' })
    items.push({ action: 'select', label: t('action.selectText'), systemImage: 'text.cursor' })
  }
  if (!locked) {
    if (canRegenerate) {
      const label = message.role === 'user' ? t('action.replyAgain') : t('action.regenerate')
      items.push({ action: 'regenerate', label, systemImage: 'arrow.clockwise' })
      items.push({ action: 'refine', label: t('action.refine'), systemImage: 'text.bubble' })
    }
    items.push({ action: 'edit', label: t('action.edit'), systemImage: 'pencil' })
    items.push({ action: 'delete', label: t('action.delete'), systemImage: 'trash', destructive: true })
  }
  return items
}

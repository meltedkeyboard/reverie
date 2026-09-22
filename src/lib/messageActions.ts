import { Platform } from 'react-native'

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
    items.push({ action: 'copy', label: 'Копировать', systemImage: 'doc.on.doc' })
    // In the browser the text is selectable in place.
    if (Platform.OS !== 'web') items.push({ action: 'select', label: 'Выделить текст', systemImage: 'text.cursor' })
  }
  if (!locked) {
    if (canRegenerate) {
      const label = message.role === 'user' ? 'Ответить заново' : 'Перегенерировать'
      items.push({ action: 'regenerate', label, systemImage: 'arrow.clockwise' })
      items.push({ action: 'refine', label: 'Уточнить...', systemImage: 'text.bubble' })
    }
    items.push({ action: 'edit', label: 'Изменить', systemImage: 'pencil' })
    items.push({ action: 'delete', label: 'Удалить', systemImage: 'trash', destructive: true })
  }
  return items
}

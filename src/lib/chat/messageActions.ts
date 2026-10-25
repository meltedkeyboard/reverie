
import { t } from '@/i18n'
import type { Role } from '@/db/messages'

// refine regenerates with a wish from the user, like "more surprised" or "sadder". The wish
// shown above the reply it produced has its own: refineAgain asks with it once more,
// editRefine asks with it changed, dropRefine forgets it. deleteVariant removes only the
// version shown in the pager, delete the whole message. branch starts a new chat that goes
// on from the message.
export type MessageAction =
  | 'copy'
  | 'regenerate'
  | 'refine'
  | 'refineAgain'
  | 'editRefine'
  | 'dropRefine'
  | 'edit'
  | 'branch'
  | 'deleteVariant'
  | 'delete'

export type ActionItem = {
  action: MessageAction
  label: string
  // SF Symbol shown next to the label in the native iOS menu.
  systemImage: string
  destructive?: boolean
  separated?: boolean
}

// What the menus draw: each item runs `run` with its action.
export function menuItems(items: ActionItem[], run: (action: MessageAction) => void) {
  return items.map((item) => ({ ...item, onSelect: () => run(item.action) }))
}

type Options = {
  canRegenerate: boolean
  // Set while a reply streams or a message is being edited: only reading actions remain.
  locked: boolean
}

export function messageActions(message: { role: Role; content: string; variants: string[] }, { canRegenerate, locked }: Options) {
  const items: ActionItem[] = []
  if (message.content) items.push({ action: 'copy', label: t('action.copy'), systemImage: 'doc.on.doc' })
  if (!locked) {
    if (canRegenerate) {
      const label = message.role === 'user' ? t('action.replyAgain') : t('action.regenerate')
      items.push({ action: 'regenerate', label, systemImage: 'arrow.clockwise' })
      items.push({ action: 'refine', label: t('action.refine'), systemImage: 'text.bubble' })
    }
    items.push({ action: 'edit', label: t('action.edit'), systemImage: 'pencil' })
    // A new chat that goes on from here, this one left as it is.
    items.push({ action: 'branch', label: t('action.branch'), systemImage: 'arrow.triangle.branch' })
    // With several versions Delete would be ambiguous, so both are named. Not as a submenu:
    // iOS 26 draws the destructive items of one in a darker red than their symbols. A line
    // sets them apart from the changes above.
    if (message.variants.length > 1) {
      items.push({ action: 'deleteVariant', label: t('action.deleteVariant'), systemImage: 'minus.circle', destructive: true, separated: true })
      items.push({ action: 'delete', label: t('action.deleteMessage'), systemImage: 'trash', destructive: true })
    } else items.push({ action: 'delete', label: t('action.delete'), systemImage: 'trash', destructive: true, separated: true })
  }
  return items
}

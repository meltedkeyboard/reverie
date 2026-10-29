import { useRouter } from 'expo-router'

import { archiveCharacters, deleteCharacter, duplicateCharacter, restoreCharacters, type CharacterPreview } from '@/db/characters'
import { pruneGroups, removeFromGroup } from '@/db/groups'
import { useDatabase } from '@/db/provider'
import { useCardExport } from '@/hooks/features/useCardExport'
import { useTranslation } from '@/i18n'
import { copyStoredImage, removeCharacterImages } from '@/lib/images/avatars'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { showSheet } from '@/lib/ui/dialogs'
import { reportError } from '@/lib/transfer/report'
import { SYSTEM_GREY } from '@/components/lists/NativeCardList'
import type { SwipeAction } from '@/components/lists/ListCard'

// What a character in the list can do: open its profile, be copied, exported, put in the
// archive or deleted; one in the archive is brought back instead of copied. reload re-lists
// them after a change. A new chat is started from the drawer in the chat.
export function useCharacterActions(reload: () => void) {
  const db = useDatabase()
  const router = useRouter()
  const { t } = useTranslation()
  const { exportItem } = useCardExport()

  const confirmDelete = (character: CharacterPreview) => {
    confirmDeletion({
      title: t('characters.deleteConfirmTitle'),
      message: t('characters.deleteConfirmMessage', { name: character.name }),
      confirmLabel: t('characters.delete'),
      destructive: true,
      onConfirm: async () => {
        await deleteCharacter(db, character.id)
        await pruneGroups(db)
        removeCharacterImages(character)
        reload()
      },
    })
  }

  const duplicate = async (character: CharacterPreview) => {
    await duplicateCharacter(db, character.id, `${character.name} (${t('characters.copySuffix')})`, {
      avatar: await copyStoredImage(character.avatar),
      avatarOriginal: await copyStoredImage(character.avatarOriginal),
      background: await copyStoredImage(character.background, 'backgrounds'),
      backgroundOriginal: await copyStoredImage(character.backgroundOriginal, 'backgrounds'),
    })
    reload()
  }

  const archive = (character: CharacterPreview) =>
    archiveCharacters(db, [character.id]).catch((err) => reportError(t('archive.failed'), err)).then(reload)
  const restore = (character: CharacterPreview) =>
    restoreCharacters(db, [character.id]).catch((err) => reportError(t('archive.failed'), err)).then(reload)

  // What the swipe to the left runs at once: into the archive, or out of it.
  const swipeAction = (character: CharacterPreview) =>
    character.archivedAt === null
      ? { label: t('archive.archive'), systemImage: 'archivebox', onAction: () => archive(character) }
      : { label: t('archive.restore'), systemImage: 'tray.and.arrow.up', onAction: () => restore(character) }
  // The same for a card, which shows the symbol alone.
  const swipeCard = (character: CharacterPreview): SwipeAction => {
    const action = swipeAction(character)
    return {
      label: action.label,
      symbol: action.systemImage as SwipeAction['symbol'],
      icon: character.archivedAt === null ? 'archive-outline' : 'arrow-up-circle-outline',
      color: SYSTEM_GREY,
      onAction: action.onAction,
    }
  }

  const menuItems = (character: CharacterPreview): MenuItem[] =>
    character.archivedAt !== null
      ? [
          { label: t('chat.menuShowProfile'), systemImage: 'person.crop.circle', onSelect: () => router.push(`/character/${character.id}?profile=1`) },
          exportItem(async () => character),
          { label: t('archive.restoreFull'), systemImage: 'tray.and.arrow.up', onSelect: () => restore(character) },
          { label: t('characters.delete'), systemImage: 'trash', destructive: true, separated: true, onSelect: () => confirmDelete(character) },
        ]
      : [
          { label: t('chat.menuShowProfile'), systemImage: 'person.crop.circle', onSelect: () => router.push(`/character/${character.id}?profile=1`) },
          { label: t('characters.duplicate'), systemImage: 'plus.square.on.square', onSelect: () => duplicate(character) },
          exportItem(async () => character),
          ...(character.groupId !== null
            ? [{ label: t('groups.removeFromGroup'), systemImage: 'rectangle.stack.badge.minus', onSelect: () => removeFromGroup(db, [character.id]).then(reload) }]
            : []),
          { label: t('archive.archive'), systemImage: 'archivebox', onSelect: () => archive(character) },
          { label: t('characters.delete'), systemImage: 'trash', destructive: true, separated: true, onSelect: () => confirmDelete(character) },
        ]

  const openMenu = (character: CharacterPreview) => showSheet(character.name, menuItems(character))

  return { openMenu, menuItems, confirmDelete, duplicate, swipeAction, swipeCard }
}

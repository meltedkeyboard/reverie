import { useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'

import { deleteCharacter, duplicateCharacter, type CharacterPreview } from '@/db/characters'
import { createChat } from '@/db/chats'
import { useTranslation } from '@/i18n'
import { copyStoredImage, removeCharacterImages } from '@/lib/avatars'
import type { MenuItem } from '@/components/NativeMenu'
import { confirmDeletion } from '@/lib/confirmDelete'
import { showSheet } from '@/lib/dialogs'

// What a character in a list can do: start a chat, be edited or deleted. Shared by the
// home screen and the wide-web sidebar; reload re-lists them after a delete, and
// onStart lets the caller react before the new chat opens.
export function useCharacterActions(reload: () => void, onStart?: (character: CharacterPreview) => void) {
  const db = useSQLiteContext()
  const router = useRouter()
  const { t } = useTranslation()

  const startChat = async (character: CharacterPreview) => {
    onStart?.(character)
    router.push(`/chat/${await createChat(db, character)}`)
  }

  const confirmDelete = (character: CharacterPreview) => {
    confirmDeletion({
      title: t('characters.deleteConfirmTitle'),
      message: t('characters.deleteConfirmMessage', { name: character.name }),
      confirmLabel: t('characters.delete'),
      destructive: true,
      onConfirm: async () => {
        await deleteCharacter(db, character.id)
        removeCharacterImages(character)
        reload()
      },
    })
  }

  const duplicate = async (character: CharacterPreview) => {
    const avatar = await copyStoredImage(character.avatar)
    const background = await copyStoredImage(character.background, 'backgrounds')
    await duplicateCharacter(db, character.id, `${character.name} (${t('characters.copySuffix')})`, avatar, background)
    reload()
  }

  const menuItems = (character: CharacterPreview): MenuItem[] => [
    { label: t('characters.newChat'), systemImage: 'plus.bubble', onSelect: () => startChat(character) },
    { label: t('characters.edit'), systemImage: 'pencil', onSelect: () => router.push(`/character/${character.id}`) },
    { label: t('characters.duplicate'), systemImage: 'plus.square.on.square', onSelect: () => duplicate(character) },
    { label: t('characters.delete'), systemImage: 'trash', destructive: true, onSelect: () => confirmDelete(character) },
  ]

  const openMenu = (character: CharacterPreview) => showSheet(character.name, menuItems(character))

  return { openMenu, menuItems, confirmDelete }
}

import { useRouter } from 'expo-router'

import type { MenuItem } from '@/components/overlays/NativeMenu'
import { deleteRoom, duplicateRoom, type Room } from '@/db/rooms'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { copyStoredImage, removeAvatar } from '@/lib/images/avatars'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { exportRoom } from '@/lib/transfer/backup'
import { reportError } from '@/lib/transfer/report'
import { showToast } from '@/lib/ui/toast'

type RoomRef = Pick<Room, 'id' | 'name' | 'background' | 'backgroundOriginal'>

// What a room in the list can do, as a character there can: open its profile, be copied,
// exported or deleted; reload re-lists them after a change. A new scene is started from the
// drawer in the scene.
export function useRoomActions(reload: () => void) {
  const db = useDatabase()
  const router = useRouter()
  const { t } = useTranslation()

  const confirmDelete = (room: RoomRef, onDeleted = reload) => {
    confirmDeletion({
      title: t('roomEditor.deleteConfirmTitle'),
      message: t('rooms.deleteConfirmMessage', { name: room.name }),
      onConfirm: async () => {
        await deleteRoom(db, room.id)
        if (room.background) removeAvatar(room.background, 'backgrounds')
        if (room.backgroundOriginal) removeAvatar(room.backgroundOriginal, 'backgrounds')
        onDeleted()
      },
    })
  }

  const duplicate = async (room: RoomRef) => {
    try {
      await duplicateRoom(db, room.id, `${room.name} (${t('characters.copySuffix')})`, {
        background: await copyStoredImage(room.background, 'backgrounds'),
        backgroundOriginal: await copyStoredImage(room.backgroundOriginal, 'backgrounds'),
      })
      reload()
    } catch (err) {
      reportError(t('rooms.duplicateFailed'), err)
    }
  }

  // The room as a file of its own, which opened in Reverie comes back with its cast and scenes.
  const exportFile = async (room: RoomRef) => {
    try {
      const saved = await exportRoom(db, room)
      if (saved) showToast({ tone: 'success', title: t('rooms.exportDone'), message: `${saved.name} · ${saved.folder}` })
    } catch (err) {
      reportError(t('rooms.exportFailed'), err)
    }
  }

  const exportItem = (room: RoomRef): MenuItem => ({
    label: t('rooms.export'),
    systemImage: 'square.and.arrow.up',
    onSelect: () => exportFile(room),
  })

  const menuItems = (room: RoomRef): MenuItem[] => [
    { label: t('chat.menuShowProfile'), systemImage: 'person.2.circle', onSelect: () => router.push(`/room/${room.id}?profile=1`) },
    { label: t('characters.duplicate'), systemImage: 'plus.square.on.square', onSelect: () => duplicate(room) },
    exportItem(room),
    { label: t('common.delete'), systemImage: 'trash', destructive: true, separated: true, onSelect: () => confirmDelete(room) },
  ]

  return { menuItems, confirmDelete, duplicate, exportFile }
}

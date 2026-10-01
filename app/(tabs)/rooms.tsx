import { Link, useRouter, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import ReorderableList from 'react-native-reorderable-list'

import { Button } from '@/components/Button'
import { CONTINUE_BUTTON_SPACE } from '@/components/ContinueButton'
import { EmptyState, ListSeparator } from '@/components/EmptyState'
import { GlassButton } from '@/components/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/GlassHeader'
import { HomePattern } from '@/components/HomePattern'
import type { MenuItem } from '@/components/NativeMenu'
import { RoomCard } from '@/components/RoomCard'
import { listCharacters } from '@/db/characters'
import { pruneUntouchedChats } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { deleteRoom, listRooms, setRoomOrder, type RoomPreview } from '@/db/rooms'
import { useContinueAnchor, useLastChat } from '@/hooks/useLastChat'
import { useReorder } from '@/hooks/useReorder'
import { useTranslation } from '@/i18n'
import { removeAvatar } from '@/lib/avatars'
import { confirmDeletion } from '@/lib/confirmDelete'
import { useStyles, type Colors } from '@/theme'

export default function RoomsScreen() {
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [rooms, setRooms] = useState<RoomPreview[] | null>(null)
  const [characterCount, setCharacterCount] = useState(0)
  const { lastChat, reload: reloadLastChat } = useLastChat('room')
  // The continue button itself is drawn by the tabs layout, over both home tabs.
  const anchor = useContinueAnchor()

  const reload = useCallback(async () => {
    await pruneUntouchedChats(db)
    setRooms(await listRooms(db))
    setCharacterCount((await listCharacters(db)).length)
    await reloadLastChat()
  }, [db, reloadLastChat])

  useFocusEffect(
    useCallback(() => {
      reload()
    }, [reload])
  )

  const reorder = useReorder(rooms, setRooms, (ids) => setRoomOrder(db, ids))

  const confirmDelete = (room: RoomPreview) => {
    confirmDeletion({
      title: t('roomEditor.deleteConfirmTitle'),
      message: t('rooms.deleteConfirmMessage', { name: room.name }),
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        await deleteRoom(db, room.id)
        if (room.background) removeAvatar(room.background, 'backgrounds')
        reload()
      },
    })
  }

  const roomMenu = (room: RoomPreview): MenuItem[] => [
    { label: t('rooms.newScene'), systemImage: 'plus.bubble', onSelect: () => router.push(`/chat/new?room=${room.id}`) },
    { label: t('characters.edit'), systemImage: 'pencil', onSelect: () => router.push(`/room/${room.id}`) },
    { label: t('common.delete'), systemImage: 'trash', destructive: true, onSelect: () => confirmDelete(room) },
  ]

  return (
    <View style={styles.screen} ref={anchor.ref} onLayout={anchor.onLayout}>
      <HomePattern />
      <ReorderableList
        data={rooms ?? []}
        keyExtractor={(r) => String(r.id)}
        {...reorder}
        scrollEnabled={!!rooms?.length}
        contentContainerStyle={[padding, lastChat && { paddingBottom: padding.paddingBottom + CONTINUE_BUTTON_SPACE }]}
        ItemSeparatorComponent={ListSeparator}
        ListEmptyComponent={
          rooms ? (
            <EmptyState
              title={t('rooms.emptyTitle')}
              text={characterCount < 2 ? t('rooms.emptyTextFew') : t('rooms.emptyText')}
              action={
                characterCount >= 2 ? (
                  <Link href="/room/new" asChild>
                    <Link.AppleZoom>
                      <Button variant="glass" label={t('rooms.createRoom')} style={styles.emptyButton} />
                    </Link.AppleZoom>
                  </Link>
                ) : undefined
              }
            />
          ) : null
        }
        renderItem={({ item: room }) => (
          <RoomCard
            room={room}
            onOpen={() => router.push(`/rooms/${room.id}`)}
            onDelete={() => confirmDelete(room)}
            menu={roomMenu(room)}
          />
        )}
      />
      <GlassHeader
        floating
        right={
          <Link href="/room/new" asChild>
            <Link.AppleZoom>
              <GlassButton icon="add" iconSize={26} accessibilityLabel={t('rooms.createRoom')} />
            </Link.AppleZoom>
          </Link>
        }
      >
        <TabTitle>{t('rooms.title')}</TabTitle>
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    emptyButton: { minWidth: 200 },
  })

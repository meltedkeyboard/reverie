import { Link, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import ReorderableList from 'react-native-reorderable-list'

import { Button } from '@/components/controls/Button'
import { CONTINUE_BUTTON_SPACE } from '@/components/chat/ContinueButton'
import { EmptyState, FeaturedSeparator, ListSeparator, emptyButtonStyle } from '@/components/lists/EmptyState'
import { GlassButton } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { Pattern } from '@/components/visuals/Pattern'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import { RoomCard } from '@/components/lists/RoomCard'
import { listCharacters } from '@/db/characters'
import { pruneUntouchedChats } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { deleteRoom, listRooms, setRoomOrder, type RoomPreview } from '@/db/rooms'
import { useFeaturedFill } from '@/hooks/features/useFeaturedFill'
import { useContinueAnchor, useLastChat } from '@/hooks/chat/useLastChat'
import { useReloadOnFocus } from '@/hooks/chat/useChatListActions'
import { useEditMode } from '@/hooks/features/useEditMode'
import { useReorder } from '@/hooks/features/useReorder'
import { useTranslation } from '@/i18n'
import { removeAvatar } from '@/lib/images/avatars'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { useColors, useStyles, type Colors } from '@/theme'


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
    const list = await listRooms(db)
    const characters = (await listCharacters(db)).length
    setRooms(list)
    setCharacterCount(characters)
    await reloadLastChat()
  }, [db, reloadLastChat])

  useReloadOnFocus(reload)

  const reorder = useReorder(rooms, setRooms, (ids) => setRoomOrder(db, ids))
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { editing, setEditing, motion, button: editButton, checked, setChecked, toggleChecked } = useEditMode()
  const allChecked = !!rooms?.length && checked.size === rooms.length

  // A lone room is one card over the whole screen, and the list does not scroll. Not while
  // editing: the check and the handle sit on a row.
  const fill = useFeaturedFill(rooms?.length ?? 0, padding, lastChat ? CONTINUE_BUTTON_SPACE : 0)
  const fillHeight = editing ? undefined : fill.height
  const featured = fillHeight !== undefined
  // The continue button is gone while editing; the edit bar takes its place.
  const bottomSpace = editing ? EDIT_BAR_SPACE : lastChat ? CONTINUE_BUTTON_SPACE : 0

  const deleteChecked = () => {
    const doomed = (rooms ?? []).filter((r) => checked.has(r.id))
    confirmDeletion({
      title: t('rooms.deleteSelectedTitle', { count: doomed.length }),
      message: t('rooms.deleteSelectedMessage'),
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        for (const room of doomed) {
          await deleteRoom(db, room.id)
          if (room.background) removeAvatar(room.background, 'backgrounds')
        }
        setEditing(false)
        reload()
      },
    })
  }

  const confirmDelete = (room: RoomPreview) => {
    confirmDeletion({
      title: t('roomEditor.deleteConfirmTitle'),
      message: t('rooms.deleteConfirmMessage', { name: room.name }),
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
    <View style={styles.screen} ref={anchor.ref} onLayout={(e) => {
      anchor.onLayout()
      fill.onLayout(e)
    }}>
      <Pattern id="stars" />
      <ReorderableList
        data={rooms ?? []}
        keyExtractor={(r) => String(r.id)}
        {...reorder}
        scrollEnabled={editing || fill.scroll}
        contentContainerStyle={[padding, { paddingBottom: padding.paddingBottom + bottomSpace }]}
        ItemSeparatorComponent={featured ? FeaturedSeparator : ListSeparator}
        ListEmptyComponent={
          rooms ? (
            <EmptyState
              title={t('rooms.emptyTitle')}
              text={characterCount < 2 ? t('rooms.emptyTextFew') : t('rooms.emptyText')}
              action={
                characterCount >= 2 ? (
                  <Link href="/room/new" asChild>
                    <Link.AppleZoom>
                      <Button variant="glass" label={t('rooms.createRoom')} style={emptyButtonStyle} />
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
            fillHeight={fillHeight}
            editing={{ active: editing, checked: checked.has(room.id), onToggle: () => toggleChecked([room.id]), motion }}
          />
        )}
      />
      {editing ? (
        <Animated.View
          entering={FadeInDown.springify().duration(350).dampingRatio(1)}
          exiting={FadeOutDown.duration(200)}
          style={[styles.editBar, { bottom: insets.bottom + 12 }]}
          pointerEvents="box-none"
        >
          <Button
            variant="glass"
            label={allChecked ? t('characters.deselectAll') : t('characters.selectAll')}
            onPress={() => setChecked(allChecked ? new Set() : new Set((rooms ?? []).map((r) => r.id)))}
          />
          <GlassButton
            icon="trash-outline"
            tint={checked.size ? colors.danger : undefined}
            disabled={!checked.size}
            onPress={deleteChecked}
            accessibilityLabel={t('rooms.deleteSelected')}
          />
        </Animated.View>
      ) : null}
      <GlassHeader
        floating
        right={
          <View style={styles.headerButtons}>
            {rooms?.length ? (
              <GlassButton
                icon={editing ? 'checkmark' : 'list'}
                tint={editing ? colors.accent : undefined}
                {...editButton}
                accessibilityLabel={editing ? t('characters.doneEditing') : t('rooms.editList')}
              />
            ) : null}
            {editing ? null : (
              <Link href="/room/new" asChild>
                <Link.AppleZoom>
                  <GlassButton icon="add" iconSize={26} accessibilityLabel={t('rooms.createRoom')} />
                </Link.AppleZoom>
              </Link>
            )}
          </View>
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
    headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    editBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  })

// Room the list leaves under its last card for the edit bar.
const EDIT_BAR_SPACE = 64

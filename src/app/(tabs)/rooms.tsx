import { Link, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import ReorderableList from 'react-native-reorderable-list'

import { Button } from '@/components/controls/Button'
import { CONTINUE_BUTTON_SPACE } from '@/components/chat/ContinueButton'
import { EmptyState, FeaturedSeparator, ListSeparator, emptyButtonStyle } from '@/components/lists/EmptyState'
import { IconButton } from '@/components/controls/IconButton'
import { GlassButton, GlassGroup } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { HomeBackground, useHomeScheme } from '@/components/chrome/ChatChrome'
import { NativeMenu, type MenuItem } from '@/components/overlays/NativeMenu'
import { PopoverMenu, usePopoverMenu } from '@/components/overlays/PopoverMenu'
import { NativeCardList, nativeCardList, type NativeCardRow } from '@/components/lists/NativeCardList'
import { RoomCard, roomPreview } from '@/components/lists/RoomCard'
import { listCharacters } from '@/db/characters'
import { pruneUntouchedChats } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { deleteRoom, listRooms, setRoomOrder, type RoomPreview } from '@/db/rooms'
import { useBackupImport } from '@/hooks/features/useBackupImport'
import { useRoomActions } from '@/hooks/features/useRoomActions'
import { useFeaturedFill } from '@/hooks/features/useFeaturedFill'
import { useContinueAnchor, useLastChat } from '@/hooks/chat/useLastChat'
import { useReloadOnFocus } from '@/hooks/chat/useChatListActions'
import { useEditMode } from '@/hooks/features/useEditMode'
import { useReorder } from '@/hooks/features/useReorder'
import { useTranslation } from '@/i18n'
import { removeAvatar } from '@/lib/images/avatars'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { swiftUI } from '@/lib/ui/nativeUI'
import { SchemeOverride, useColors, useStyles, type Colors } from '@/theme'


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
  // Over the chats' wallpaper, when it is behind the list, the list takes the scheme a chat takes there.
  const homeScheme = useHomeScheme()

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
  // The system's list on iOS has no card over the whole screen: a lone room is a row.
  const native = !!nativeCardList && !!rooms?.length
  const fillHeight = editing || native ? undefined : fill.height
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
          if (room.backgroundOriginal) removeAvatar(room.backgroundOriginal, 'backgrounds')
        }
        setEditing(false)
        reload()
      },
    })
  }

  const { menuItems, confirmDelete, duplicate } = useRoomActions(reload)
  // A room saved as a file comes back in through the same sheet a backup does.
  const backupImport = useBackupImport(reload)
  const createMenu = usePopoverMenu()

  // The menu of the plus on iOS: a new room, or one brought in from a file.
  const createItems: MenuItem[] = [
    { label: t('rooms.createRoom'), systemImage: 'plus.bubble', onSelect: () => router.push('/room/new') },
    { label: t('rooms.importRoom'), systemImage: 'square.and.arrow.down', onSelect: backupImport.pick },
  ]

  // A room's row shows its cast's faces and the last line said in it; there is nothing in it to
  // drag out, so a long press is only its menu.
  const nativeRows: NativeCardRow[] = native
    ? (rooms ?? []).map((room) => ({
        key: String(room.id),
        people: room.cast.length ? room.cast : [{ name: room.name, avatar: null }],
        title: room.name,
        date: room.chatCount > 0 && room.lastMessage ? room.lastActivity : null,
        line: roomPreview(room, t('rooms.noMembers')),
        menu: menuItems(room),
        ids: [room.id],
        drags: [],
        onOpen: () => router.push(`/chat/latest?room=${room.id}`),
        onDelete: () => confirmDelete(room),
        leading: { label: t('characters.duplicate'), systemImage: 'plus.square.on.square', onAction: () => duplicate(room) },
      }))
    : []

  return (
    <SchemeOverride scheme={homeScheme}>
      <View style={styles.screen} ref={anchor.ref} onLayout={(e) => {
        anchor.onLayout()
        fill.onLayout(e)
      }}>
        <HomeBackground pattern="stars" />
        {native ? (
          <NativeCardList
            rows={nativeRows}
            editing={editing}
            checked={checked}
            onCheck={setChecked}
            bottomInset={bottomSpace}
            onMove={(from, to) => reorder.onReorder({ from, to })}
          />
        ) : (
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
              ) : undefined
            }
            onScrollBeginDrag={createMenu.close}
            renderItem={({ item: room }) => (
              <RoomCard
                room={room}
                onOpen={() => router.push(`/chat/latest?room=${room.id}`)}
                onDelete={() => confirmDelete(room)}
                menu={menuItems(room)}
                fillHeight={fillHeight}
                editing={{ active: editing, checked: checked.has(room.id), onToggle: () => toggleChecked([room.id]), motion }}
              />
            )}
          />
        )}
        {editing ? (
          <Animated.View
            entering={FadeInDown.springify().duration(350).dampingRatio(1)}
            exiting={FadeOutDown.duration(200)}
            style={[
              styles.editBar,
              {
                bottom: insets.bottom + 12,
                left: Math.max(16, insets.left + 8),
                right: Math.max(16, insets.right + 8),
              },
            ]}
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
            // The edit and create buttons share one capsule, as on the Characters tab.
            <GlassGroup interactive={false}>
              {rooms?.length ? (
                <IconButton
                  name={editing ? 'checkmark' : 'list'}
                  color={editing ? colors.accent : undefined}
                  {...editButton}
                  accessibilityLabel={editing ? t('characters.doneEditing') : t('rooms.editList')}
                />
              ) : null}
              {editing ? null : swiftUI ? (
                // The system menu grows out of the button, in Liquid Glass on iOS 26.
                <NativeMenu items={createItems}>
                  <IconButton name="add" size={26} accessibilityLabel={t('rooms.createRoom')} />
                </NativeMenu>
              ) : (
                <IconButton name="add" size={26} onPress={createMenu.toggle} accessibilityLabel={t('rooms.createRoom')} />
              )}
            </GlassGroup>
          }
        >
          <TabTitle>{t('rooms.title')}</TabTitle>
        </GlassHeader>
        <PopoverMenu
          visible={createMenu.visible}
          onClose={createMenu.close}
          style={[styles.createMenu, { top: insets.top + 4, right: 8 }]}
          items={[
            { label: t('rooms.createRoom'), icon: 'add-circle-outline', onSelect: () => router.push('/room/new') },
            { label: t('rooms.importRoom'), icon: 'folder-outline', onSelect: backupImport.pick },
          ]}
        />
        {backupImport.sheet}
      </View>
    </SchemeOverride>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    createMenu: { position: 'absolute', zIndex: 100, transformOrigin: 'right top' },
    editBar: {
      position: 'absolute',
      left: 16,
      right: 16,
      maxWidth: 720,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  })

// Room the list leaves under its last card for the edit bar.
const EDIT_BAR_SPACE = 64

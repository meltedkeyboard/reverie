import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import ReorderableList from 'react-native-reorderable-list'

import { AvatarStack } from '@/components/AvatarStack'
import { Button } from '@/components/Button'
import { ChatCard } from '@/components/ChatCard'
import { EmptyState, ListSeparator } from '@/components/EmptyState'
import { GlassGroup } from '@/components/Glass'
import { IconButton } from '@/components/IconButton'
import { BackButton, GlassHeader, useScreenPadding } from '@/components/GlassHeader'
import type { MenuItem } from '@/components/NativeMenu'
import { deleteChat, duplicateChat, listChats, pruneUntouchedChats, setChatOrder, setChatTitle } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import {
  getRoom,
  importChatToRoom,
  listRoomChats,
  listRoomMembers,
  type Room,
  type RoomChatPreview,
  type RoomMember,
} from '@/db/rooms'
import { useReorder } from '@/hooks/useReorder'
import { useTranslation } from '@/i18n'
import { confirmDeleteChat, promptRenameChat } from '@/lib/chatDialogs'
import { showMessage, showSheet } from '@/lib/dialogs'
import { formatWhen } from '@/lib/format'
import { fonts, HEADER_FONT_SCALE, useStyles, type Colors } from '@/theme'

const IMPORT_CHOICES = 12

export default function RoomScenesScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>()
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<RoomMember[]>([])
  const [chats, setChats] = useState<RoomChatPreview[] | null>(null)

  const reload = useCallback(async () => {
    const found = await getRoom(db, Number(roomId))
    if (!found) return router.back()
    await pruneUntouchedChats(db)
    setRoom(found)
    setMembers(await listRoomMembers(db, found.id))
    setChats(await listRoomChats(db, found.id))
  }, [db, roomId, router])

  useFocusEffect(
    useCallback(() => {
      reload()
    }, [reload])
  )

  const reorder = useReorder(chats, setChats, (ids) => setChatOrder(db, ids))

  const menuItems = (chat: RoomChatPreview): MenuItem[] => [
    { label: t('chat.menuRename'), systemImage: 'pencil', onSelect: () => promptRename(chat) },
    { label: t('chat.menuDuplicate'), systemImage: 'plus.square.on.square', onSelect: () => duplicate(chat) },
    { label: t('chat.menuDeleteChat'), systemImage: 'trash', destructive: true, onSelect: () => confirmDelete(chat) },
  ]

  const duplicate = async (chat: RoomChatPreview) => {
    const title = chat.title ? `${chat.title} (${t('characters.copySuffix')})` : null
    await duplicateChat(db, chat.id, title)
    reload()
  }

  const promptRename = (chat: RoomChatPreview) => {
    promptRenameChat(chat.title, async (text) => {
      await setChatTitle(db, chat.id, text)
      reload()
    })
  }

  const confirmDelete = (chat: RoomChatPreview) => {
    confirmDeleteChat(async () => {
      await deleteChat(db, chat.id)
      reload()
    })
  }

  // Any one-on-one chat of a member can seed a scene here; the original stays put.
  const chooseImport = async () => {
    if (!room) return
    const found = (
      await Promise.all(
        members.map(async (m) => (await listChats(db, m.characterId)).map((chat) => ({ chat, name: m.character.name })))
      )
    )
      .flat()
      .filter(({ chat }) => chat.messageCount > 1)
      .sort((a, b) => b.chat.lastActivity - a.chat.lastActivity)
      .slice(0, IMPORT_CHOICES)
    if (!found.length) return showMessage(t('rooms.importNothingTitle'), t('rooms.importNothingMessage'))
    showSheet(
      t('rooms.importTitle'),
      found.map(({ chat, name }) => ({
        label: `${name}: ${chat.title ?? formatWhen(chat.lastActivity, locale)}`,
        onSelect: async () => {
          const { chatId } = await importChatToRoom(db, chat.id, room.id)
          router.push(`/chat/${chatId}`)
        },
      }))
    )
  }

  const cast = members.map((m) => ({ name: m.character.name, avatar: m.character.avatar }))

  return (
    <View style={styles.screen}>
      <ReorderableList
        data={chats ?? []}
        keyExtractor={(c) => String(c.id)}
        {...reorder}
        contentContainerStyle={padding}
        ItemSeparatorComponent={ListSeparator}
        ListEmptyComponent={
          chats ? (
            <EmptyState
              title={t('rooms.scenesEmptyTitle')}
              text={t('rooms.scenesEmptyText')}
              action={
                <Link href={`/chat/new?room=${roomId}`} asChild>
                  <Link.AppleZoom>
                    <Button variant="glass" label={t('rooms.startScene')} style={styles.emptyButton} />
                  </Link.AppleZoom>
                </Link>
              }
            />
          ) : null
        }
        renderItem={({ item: chat }) => (
          <ChatCard
            chat={{ ...chat, lastMessage: chat.lastSpeaker && chat.lastMessage ? `${chat.lastSpeaker}: ${chat.lastMessage}` : chat.lastMessage }}
            onOpen={() => router.push(`/chat/${chat.id}`)}
            onDelete={() => confirmDelete(chat)}
            menu={menuItems(chat)}
          />
        )}
      />
      <GlassHeader
        floating
        left={
          <GlassGroup>
            <BackButton />
            {cast.length ? <AvatarStack cast={cast} size={28} /> : null}
          </GlassGroup>
        }
        right={
          room ? (
            <GlassGroup>
              <IconButton name="download-outline" onPress={chooseImport} />
              <IconButton name="options-outline" onPress={() => router.push(`/room/${room.id}`)} />
              <Link href={`/chat/new?room=${room.id}`} asChild>
                <Link.AppleZoom>
                  <IconButton name="add" size={26} />
                </Link.AppleZoom>
              </Link>
            </GlassGroup>
          ) : null
        }
      >
        {room ? (
          <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.name} numberOfLines={1}>
            {room.name}
          </Text>
        ) : null}
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    name: { flexShrink: 1, color: colors.text, fontFamily: fonts.prose, fontSize: 18, fontWeight: '600' },
    emptyButton: { minWidth: 200 },
  })

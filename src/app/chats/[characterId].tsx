import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import ReorderableList from 'react-native-reorderable-list'

import { Avatar } from '@/components/visuals/Avatar'
import { Button } from '@/components/controls/Button'
import { ChatCard } from '@/components/lists/ChatCard'
import { EmptyState, ListSeparator, emptyButtonStyle } from '@/components/lists/EmptyState'
import { GlassGroup } from '@/components/chrome/Glass'
import { IconButton } from '@/components/controls/IconButton'
import { BackButton, GlassHeader, useScreenPadding } from '@/components/chrome/GlassHeader'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import { Pattern } from '@/components/visuals/Pattern'
import { getCharacter, type Character } from '@/db/characters'
import { listChats, pruneUntouchedChats, setChatOrder, type ChatPreview } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { importChatToRoom, listRooms, type RoomPreview } from '@/db/rooms'
import { useChatListActions, useReloadOnFocus } from '@/hooks/chat/useChatListActions'
import { useReorder } from '@/hooks/features/useReorder'
import { useTranslation } from '@/i18n'
import { fonts, HEADER_FONT_SCALE, useStyles, type Colors } from '@/theme'

export default function CharacterChatsScreen() {
  const { characterId } = useLocalSearchParams<{ characterId: string }>()
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [character, setCharacter] = useState<Character | null>(null)
  const [chats, setChats] = useState<ChatPreview[] | null>(null)
  const [rooms, setRooms] = useState<RoomPreview[]>([])

  const reload = useCallback(async () => {
    const found = await getCharacter(db, Number(characterId))
    if (!found) return router.back()
    await pruneUntouchedChats(db)
    setCharacter(found)
    setChats(await listChats(db, found.id))
    setRooms(await listRooms(db))
  }, [db, characterId, router])

  useReloadOnFocus(reload)
  const { duplicate, rename: promptRename, remove: confirmDelete } = useChatListActions(reload)

  const reorder = useReorder(chats, setChats, (ids) => setChatOrder(db, ids))

  const menuItems = (chat: ChatPreview): MenuItem[] => [
    { label: t('chat.menuRename'), systemImage: 'pencil', onSelect: () => promptRename(chat) },
    { label: t('chat.menuDuplicate'), systemImage: 'plus.square.on.square', onSelect: () => duplicate(chat) },
    rooms.length
      ? {
          label: t('chat.menuMoveToRoom'),
          systemImage: 'person.3',
          children: [
            { label: t('chat.menuNewRoom'), systemImage: 'plus', onSelect: () => moveToRoom(chat) },
            ...rooms.map((room) => ({ label: room.name, onSelect: () => moveToRoom(chat, room.id) })),
          ],
        }
      : { label: t('chat.menuMoveToRoom'), systemImage: 'person.3', onSelect: () => moveToRoom(chat) },
    { label: t('chat.menuDeleteChat'), systemImage: 'trash', destructive: true, onSelect: () => confirmDelete(chat) },
  ]

  // The chat is copied, so the one-on-one version stays where it was. In a room that
  // exists the character joins the cast if not in it yet and the scene opens; a new
  // room's editor opens over the scene, to add the rest of the cast right away.
  const moveToRoom = async (chat: ChatPreview, roomId: number | null = null) => {
    const { roomId: target, chatId: sceneId } = await importChatToRoom(db, chat.id, roomId)
    router.push(`/chat/${sceneId}`)
    if (roomId === null) router.push(`/room/${target}`)
  }

  return (
    <View style={styles.screen}>
      <Pattern id="two-stars" />
      <ReorderableList
        data={chats ?? []}
        keyExtractor={(c) => String(c.id)}
        {...reorder}
        contentContainerStyle={padding}
        ItemSeparatorComponent={ListSeparator}
        ListEmptyComponent={
          chats ? (
            <EmptyState
              title={t('chatsList.emptyTitle')}
              text={t('chatsList.emptyText')}
              action={
                <Link href={`/chat/new?character=${characterId}`} asChild>
                  <Link.AppleZoom>
                    <Button variant="glass" label={t('chatsList.startChat')} style={emptyButtonStyle} />
                  </Link.AppleZoom>
                </Link>
              }
            />
          ) : null
        }
        renderItem={({ item: chat }) => (
          <ChatCard
            chat={chat}
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
            {character ? <Avatar name={character.name} file={character.avatar} size={34} /> : null}
          </GlassGroup>
        }
        right={
          character ? (
            <GlassGroup>
              <IconButton
                name="information-circle-outline"
                onPress={() => router.push(`/character/${character.id}?profile=1`)}
                accessibilityLabel={t('profile.title')}
              />
              <Link href={`/chat/new?character=${character.id}`} asChild>
                <Link.AppleZoom>
                  <IconButton name="add" size={26} />
                </Link.AppleZoom>
              </Link>
            </GlassGroup>
          ) : null
        }
      >
        {character ? (
          <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.name} numberOfLines={1}>
            {character.name}
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
})

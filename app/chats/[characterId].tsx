import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import ReorderableList from 'react-native-reorderable-list'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { ChatCard } from '@/components/ChatCard'
import { EmptyState, ListSeparator } from '@/components/EmptyState'
import { GlassGroup } from '@/components/Glass'
import { IconButton } from '@/components/IconButton'
import { BackButton, GlassHeader, useScreenPadding } from '@/components/GlassHeader'
import type { MenuItem } from '@/components/NativeMenu'
import { getCharacter, type Character } from '@/db/characters'
import { deleteChat, duplicateChat, listChats, pruneUntouchedChats, setChatOrder, setChatTitle, type ChatPreview } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { useReorder } from '@/hooks/useReorder'
import { useTranslation } from '@/i18n'
import { confirmDeleteChat, promptRenameChat } from '@/lib/chatDialogs'
import { fonts, useStyles, type Colors } from '@/theme'

export default function CharacterChatsScreen() {
  const { characterId } = useLocalSearchParams<{ characterId: string }>()
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const [character, setCharacter] = useState<Character | null>(null)
  const [chats, setChats] = useState<ChatPreview[] | null>(null)

  const reload = useCallback(async () => {
    const found = await getCharacter(db, Number(characterId))
    if (!found) return router.back()
    await pruneUntouchedChats(db)
    setCharacter(found)
    setChats(await listChats(db, found.id))
  }, [db, characterId, router])

  useFocusEffect(
    useCallback(() => {
      reload()
    }, [reload])
  )

  const reorder = useReorder(chats, setChats, (ids) => setChatOrder(db, ids))

  const menuItems = (chat: ChatPreview): MenuItem[] => [
    { label: t('chat.menuRename'), systemImage: 'pencil', onSelect: () => promptRename(chat) },
    { label: t('chat.menuDuplicate'), systemImage: 'plus.square.on.square', onSelect: () => duplicate(chat) },
    { label: t('chat.menuDeleteChat'), systemImage: 'trash', destructive: true, onSelect: () => confirmDelete(chat) },
  ]

  const duplicate = async (chat: ChatPreview) => {
    const title = chat.title ? `${chat.title} (${t('characters.copySuffix')})` : null
    await duplicateChat(db, chat.id, title)
    reload()
  }

  const promptRename = (chat: ChatPreview) => {
    promptRenameChat(chat.title, async (text) => {
      await setChatTitle(db, chat.id, text)
      reload()
    })
  }

  const confirmDelete = (chat: ChatPreview) => {
    confirmDeleteChat(async () => {
      await deleteChat(db, chat.id)
      reload()
    })
  }

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
              title={t('chatsList.emptyTitle')}
              text={t('chatsList.emptyText')}
              action={
                <Link href={`/chat/new?character=${characterId}`} asChild>
                  <Link.AppleZoom>
                    <Button variant="glass" label={t('chatsList.startChat')} style={styles.emptyButton} />
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
              <IconButton name="options-outline" onPress={() => router.push(`/character/${character.id}`)} />
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
          <Text style={styles.name} numberOfLines={1}>
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
  emptyButton: { minWidth: 200 },
})

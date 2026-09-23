import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { ChatCard } from '@/components/ChatCard'
import { EmptyState, ListSeparator } from '@/components/EmptyState'
import { GlassHeader, useScreenPadding } from '@/components/GlassHeader'
import { IconButton } from '@/components/IconButton'
import { getCharacter, type Character } from '@/db/characters'
import { deleteChat, listChats, pruneUntouchedChats, setChatTitle, type ChatPreview } from '@/db/chats'
import { useTranslation } from '@/i18n'
import { confirmDeleteChat, promptRenameChat } from '@/lib/chatDialogs'
import { showSheet } from '@/lib/dialogs'
import { fonts, useStyles, type Colors } from '@/theme'

export default function CharacterChatsScreen() {
  const { characterId } = useLocalSearchParams<{ characterId: string }>()
  const db = useSQLiteContext()
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

  const openMenu = (chat: ChatPreview) => {
    showSheet(chat.title ?? undefined, [
      { label: t('chat.menuRename'), onSelect: () => promptRename(chat) },
      { label: t('chat.menuDeleteChat'), destructive: true, onSelect: () => confirmDelete(chat) },
    ])
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
      <FlatList
        data={chats ?? []}
        keyExtractor={(c) => String(c.id)}
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
          <ChatCard chat={chat} onOpen={() => router.push(`/chat/${chat.id}`)} onMenu={() => openMenu(chat)} />
        )}
      />
      <GlassHeader
        left={<IconButton name="chevron-back" size={26} onPress={() => router.back()} />}
        right={
          character ? (
            <>
              <IconButton name="options-outline" onPress={() => router.push(`/character/${character.id}`)} />
              <Link href={`/chat/new?character=${character.id}`} asChild>
                <Link.AppleZoom>
                  <IconButton name="add" size={26} />
                </Link.AppleZoom>
              </Link>
            </>
          ) : null
        }
      >
        {character ? (
          <View style={styles.who}>
            <Avatar name={character.name} file={character.avatar} size={34} />
            <Text style={styles.name} numberOfLines={1}>
              {character.name}
            </Text>
          </View>
        ) : null}
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flexShrink: 1, color: colors.text, fontFamily: fonts.prose, fontSize: 18, fontWeight: '600' },
  emptyButton: { minWidth: 200 },
})

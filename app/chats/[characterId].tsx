import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Avatar } from '@/components/Avatar'
import { ChatCard } from '@/components/ChatCard'
import { GlassHeader, useHeaderHeight } from '@/components/GlassHeader'
import { IconButton } from '@/components/IconButton'
import { getCharacter, type Character } from '@/db/characters'
import { deleteChat, listChats, pruneUntouchedChats, setChatTitle, type ChatPreview } from '@/db/chats'
import { useTranslation } from '@/i18n'
import { confirm, promptText, showSheet } from '@/lib/dialogs'
import { fonts, useStyles, type Colors } from '@/theme'

export default function CharacterChatsScreen() {
  const { characterId } = useLocalSearchParams<{ characterId: string }>()
  const db = useSQLiteContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
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
    promptText({
      title: t('chat.renameChatTitle'),
      message: t('chat.renameChatMessage'),
      initial: chat.title ?? '',
      confirmLabel: t('common.save'),
      onSubmit: async (text) => {
        await setChatTitle(db, chat.id, text)
        reload()
      },
    })
  }

  const confirmDelete = (chat: ChatPreview) => {
    confirm({
      title: t('chat.deleteChatTitle'),
      message: t('chat.deleteChatMessage'),
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        await deleteChat(db, chat.id)
        reload()
      },
    })
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={chats ?? []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ paddingTop: headerHeight + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 16, flexGrow: 1 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          chats ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{t('chatsList.emptyTitle')}</Text>
              <Text style={styles.emptyText}>{t('chatsList.emptyText')}</Text>
              <Link href={`/chat/new?character=${characterId}`} asChild>
                <Link.AppleZoom>
                  <Pressable style={styles.emptyButton}>
                    <Text style={styles.emptyButtonText}>{t('chatsList.startChat')}</Text>
                  </Pressable>
                </Link.AppleZoom>
              </Link>
            </View>
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, paddingHorizontal: 24 },
  emptyTitle: { color: colors.text, fontFamily: fonts.prose, fontSize: 22, marginBottom: 8 },
  emptyText: { color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  emptyButton: { backgroundColor: colors.accent, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 },
  emptyButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})

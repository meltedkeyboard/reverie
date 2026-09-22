import { Link, useRouter, useFocusEffect } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CharacterCard } from '@/components/CharacterCard'
import { GlassHeader, useHeaderHeight } from '@/components/GlassHeader'
import { IconButton } from '@/components/IconButton'
import { deleteCharacter, listCharacters, type CharacterPreview } from '@/db/characters'
import { createChat, pruneUntouchedChats } from '@/db/chats'
import { isOnboardingComplete } from '@/db/onboarding'
import { loadSettings } from '@/db/settings'
import { removeAvatar } from '@/lib/avatars'
import { confirm, showSheet } from '@/lib/dialogs'
import { fonts, useColors } from '@/theme'

export default function CharactersScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [characters, setCharacters] = useState<CharacterPreview[] | null>(null)
  const [serverSet, setServerSet] = useState(true)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)

  useEffect(() => {
    isOnboardingComplete(db).then((done) => {
      setOnboarded(done)
      if (!done) router.replace('/onboarding')
    })
  }, [db, router])

  const reload = useCallback(async () => {
    await pruneUntouchedChats(db)
    setCharacters(await listCharacters(db))
    setServerSet(Boolean((await loadSettings(db)).baseUrl.trim()))
  }, [db])

  useFocusEffect(
    useCallback(() => {
      if (onboarded) reload()
    }, [reload, onboarded])
  )

  if (!onboarded) return <View style={styles.screen} />

  const startChat = async (character: CharacterPreview) => {
    router.push(`/chat/${await createChat(db, character)}`)
  }

  const openMenu = (character: CharacterPreview) => {
    showSheet(character.name, [
      { label: 'Новый чат', onSelect: () => startChat(character) },
      { label: 'Изменить', onSelect: () => router.push(`/character/${character.id}`) },
      { label: 'Удалить', destructive: true, onSelect: () => confirmDelete(character) },
    ])
  }

  const confirmDelete = (character: CharacterPreview) => {
    confirm({
      title: 'Удалить персонажа?',
      message: `${character.name} и все чаты с персонажем будут удалены без возможности восстановления.`,
      confirmLabel: 'Удалить',
      destructive: true,
      onConfirm: async () => {
        await deleteCharacter(db, character.id)
        if (character.avatar) removeAvatar(character.avatar)
        reload()
      },
    })
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={characters ?? []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ paddingTop: headerHeight + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 16, flexGrow: 1 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          !serverSet && characters ? (
            <Pressable onPress={() => router.push('/settings')} style={styles.notice}>
              <Text style={styles.noticeTitle}>Сервер не настроен</Text>
              <Text style={styles.noticeText}>Укажите адрес сервера в настройках, чтобы персонажи могли отвечать.</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          characters ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Пока никого нет</Text>
              <Text style={styles.emptyText}>Создайте первого персонажа и начните историю.</Text>
              <Link href="/character/new" asChild>
                <Link.AppleZoom>
                  <Pressable style={styles.emptyButton}>
                    <Text style={styles.emptyButtonText}>Создать персонажа</Text>
                  </Pressable>
                </Link.AppleZoom>
              </Link>
            </View>
          ) : null
        }
        renderItem={({ item: character }) => (
          <CharacterCard
            character={character}
            onOpen={() => router.push(`/chats/${character.id}`)}
            onMenu={() => openMenu(character)}
          />
        )}
      />
      <GlassHeader
        right={
          <>
            <IconButton name="settings-outline" onPress={() => router.push('/settings')} />
            <Link href="/character/new" asChild>
              <Link.AppleZoom>
                <IconButton name="add" size={26} />
              </Link.AppleZoom>
            </Link>
          </>
        }
      >
        <Text style={styles.title}>Персонажи</Text>
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontFamily: fonts.prose, fontSize: 24, fontWeight: '600' },
  notice: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  noticeTitle: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 3 },
  noticeText: { color: colors.textMuted, fontSize: 14, lineHeight: 19 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, paddingHorizontal: 24 },
  emptyTitle: { color: colors.text, fontFamily: fonts.prose, fontSize: 22, marginBottom: 8 },
  emptyText: { color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  emptyButton: { backgroundColor: colors.accent, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 },
  emptyButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})

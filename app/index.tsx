import { Link, useRouter, useFocusEffect } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CharacterCard } from '@/components/CharacterCard'
import { GlassSurface } from '@/components/Glass'
import { GlassHeader, useHeaderHeight } from '@/components/GlassHeader'
import { IconButton } from '@/components/IconButton'
import { deleteCharacter, listCharacters, type CharacterPreview } from '@/db/characters'
import { createChat, pruneUntouchedChats } from '@/db/chats'
import { isOnboardingComplete } from '@/db/onboarding'
import { loadSettings } from '@/db/settings'
import { useIsWideWeb } from '@/hooks/useResponsive'
import { useTranslation } from '@/i18n'
import { removeAvatar } from '@/lib/avatars'
import { confirm, showSheet } from '@/lib/dialogs'
import { fonts, useColors, useStyles, type Colors } from '@/theme'

export default function CharactersScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const isWideWeb = useIsWideWeb()
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

  // The character list already lives in the sidebar on wide web, so the root route
  // just welcomes the visitor instead of repeating it.
  if (isWideWeb) {
    return (
      <View style={styles.wideWelcome}>
        <Text style={styles.wideWelcomeTitle}>{t('characters.title')}</Text>
        <Text style={styles.wideWelcomeText}>{t('characters.wideWelcomeText')}</Text>
      </View>
    )
  }

  const startChat = async (character: CharacterPreview) => {
    router.push(`/chat/${await createChat(db, character)}`)
  }

  const openMenu = (character: CharacterPreview) => {
    showSheet(character.name, [
      { label: t('characters.newChat'), onSelect: () => startChat(character) },
      { label: t('characters.edit'), onSelect: () => router.push(`/character/${character.id}`) },
      { label: t('characters.delete'), destructive: true, onSelect: () => confirmDelete(character) },
    ])
  }

  const confirmDelete = (character: CharacterPreview) => {
    confirm({
      title: t('characters.deleteConfirmTitle'),
      message: t('characters.deleteConfirmMessage', { name: character.name }),
      confirmLabel: t('characters.delete'),
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
              <Text style={styles.noticeTitle}>{t('characters.serverNotSetTitle')}</Text>
              <Text style={styles.noticeText}>{t('characters.serverNotSetText')}</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          characters ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{t('characters.emptyTitle')}</Text>
              <Text style={styles.emptyText}>{t('characters.emptyText')}</Text>
              <Link href="/character/new" asChild>
                <Link.AppleZoom>
                  <Pressable>
                    <GlassSurface interactive tintColor={colors.accent} style={styles.emptyButton} fallbackStyle={{ backgroundColor: colors.accent }}>
                      <Text style={styles.emptyButtonText}>{t('characters.createCharacter')}</Text>
                    </GlassSurface>
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
        <Text style={styles.title}>{t('characters.title')}</Text>
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontFamily: fonts.prose, fontSize: 24, fontWeight: '600' },
  wideWelcome: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, paddingHorizontal: 40 },
  wideWelcomeTitle: { color: colors.text, fontFamily: fonts.prose, fontSize: 26, marginBottom: 10 },
  wideWelcomeText: { color: colors.textMuted, fontSize: 15, textAlign: 'center', maxWidth: 360, lineHeight: 21 },
  notice: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  noticeTitle: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 3 },
  noticeText: { color: colors.textMuted, fontSize: 14, lineHeight: 19 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, paddingHorizontal: 24 },
  emptyTitle: { color: colors.text, fontFamily: fonts.prose, fontSize: 22, marginBottom: 8 },
  emptyText: { color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  emptyButton: { borderRadius: 16, minWidth: 200, paddingHorizontal: 28, paddingVertical: 15, alignItems: 'center' },
  emptyButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})

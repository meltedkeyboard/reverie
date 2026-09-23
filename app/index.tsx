import { Link, useRouter, useFocusEffect } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/Button'
import { CharacterCard } from '@/components/CharacterCard'
import { EmptyState, ListSeparator } from '@/components/EmptyState'
import { GlassHeader, useScreenPadding } from '@/components/GlassHeader'
import { IconButton } from '@/components/IconButton'
import { listCharacters, type CharacterPreview } from '@/db/characters'
import { pruneUntouchedChats } from '@/db/chats'
import { isOnboardingComplete } from '@/db/onboarding'
import { loadSettings } from '@/db/settings'
import { useCharacterActions } from '@/hooks/useCharacterActions'
import { useIsWideWeb } from '@/hooks/useResponsive'
import { useTranslation } from '@/i18n'
import { fonts, useStyles, type Colors } from '@/theme'

export default function CharactersScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const padding = useScreenPadding('list')
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

  const { openMenu } = useCharacterActions(reload)

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

  return (
    <View style={styles.screen}>
      <FlatList
        data={characters ?? []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={padding}
        ItemSeparatorComponent={ListSeparator}
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
            <EmptyState
              title={t('characters.emptyTitle')}
              text={t('characters.emptyText')}
              action={
                <Link href="/character/new" asChild>
                  <Link.AppleZoom>
                    <Button variant="glass" label={t('characters.createCharacter')} style={styles.emptyButton} />
                  </Link.AppleZoom>
                </Link>
              }
            />
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
  emptyButton: { minWidth: 200 },
})

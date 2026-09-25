import { Link, useRouter, useFocusEffect } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import ReorderableList from 'react-native-reorderable-list'

import { Button } from '@/components/Button'
import { CharacterCard } from '@/components/CharacterCard'
import { CONTINUE_BUTTON_SPACE, ContinueButton } from '@/components/ContinueButton'
import { EmptyState, ListSeparator } from '@/components/EmptyState'
import { GlassGroup } from '@/components/Glass'
import { IconButton } from '@/components/IconButton'
import { GlassHeader, useScreenPadding } from '@/components/GlassHeader'
import { HomePattern } from '@/components/HomePattern'
import { Star } from '@/components/motifs/Star'
import { SFIcon } from '@/components/SFIcon'
import { listCharacters, setCharacterOrder, type CharacterPreview } from '@/db/characters'
import { getLastChat, pruneUntouchedChats, type LastChat } from '@/db/chats'
import { isContinueEnabled, isContinueHidden, setContinueHidden } from '@/db/continue'
import { isOnboardingComplete } from '@/db/onboarding'
import { loadSettings } from '@/db/settings'
import { useCharacterActions } from '@/hooks/useCharacterActions'
import { useReorder } from '@/hooks/useReorder'
import { useIsWideWeb } from '@/hooks/useResponsive'
import { useTranslation } from '@/i18n'
import { fonts, useColors, useStyles, type Colors } from '@/theme'

export default function CharactersScreen() {
  const db = useSQLiteContext()
  const router = useRouter()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const isWideWeb = useIsWideWeb()
  const [characters, setCharacters] = useState<CharacterPreview[] | null>(null)
  const [serverSet, setServerSet] = useState(true)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [lastChat, setLastChat] = useState<LastChat | null>(null)

  const reload = useCallback(async () => {
    await pruneUntouchedChats(db)
    setCharacters(await listCharacters(db))
    setServerSet(Boolean((await loadSettings(db)).baseUrl.trim()))
    const showContinue = (await isContinueEnabled(db)) && !(await isContinueHidden(db))
    setLastChat(showContinue ? await getLastChat(db) : null)
  }, [db])

  const hideContinue = () => {
    setLastChat(null)
    setContinueHidden(db, true)
  }

  // Checked on every focus, not once on mount: wiping all data from Settings clears the
  // flag and dismisses back to this already-mounted screen.
  useFocusEffect(
    useCallback(() => {
      isOnboardingComplete(db).then((done) => {
        setOnboarded(done)
        if (done) reload()
        else router.replace('/onboarding')
      })
    }, [db, router, reload])
  )

  const { menuItems, confirmDelete } = useCharacterActions(reload)
  const reorder = useReorder(characters, setCharacters, (ids) => setCharacterOrder(db, ids))

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
      <HomePattern />
      <ReorderableList
        data={characters ?? []}
        keyExtractor={(c) => String(c.id)}
        {...reorder}
        contentContainerStyle={[
          padding,
          lastChat && { paddingBottom: padding.paddingBottom + CONTINUE_BUTTON_SPACE },
        ]}
        ItemSeparatorComponent={ListSeparator}
        ListHeaderComponent={
          <>
            {!serverSet && characters ? (
              // A row like the "finish setting up" one in iOS Settings: a glyph on a
              // colored tile, the text, and a chevron to where it is fixed.
              <Pressable
                onPress={() => router.push('/settings')}
                style={({ pressed }) => [styles.notice, pressed && { opacity: 0.6 }]}
              >
                <View style={styles.noticeTile}>
                  <SFIcon name="server.rack" fallback="server" size={15} color="#FFFFFF" />
                </View>
                <View style={styles.noticeBody}>
                  <Text style={styles.noticeTitle}>{t('characters.serverNotSetTitle')}</Text>
                  <Text style={styles.noticeText}>{t('characters.serverNotSetText')}</Text>
                </View>
                <SFIcon name="chevron.right" fallback="chevron-forward" size={14} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </>
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
            onDelete={() => confirmDelete(character)}
            menu={menuItems(character)}
          />
        )}
      />
      <GlassHeader
        floating
        right={
          <GlassGroup>
            <IconButton name="settings-outline" onPress={() => router.push('/settings')} />
            <Link href="/character/new" asChild>
              <Link.AppleZoom>
                <IconButton name="add" size={26} />
              </Link.AppleZoom>
            </Link>
          </GlassGroup>
        }
      >
        <View style={styles.titleRow}>
          <Star size={22} color={colors.danger} rotation={-14} style={styles.titleStar} />
          <Text style={styles.title}>{t('characters.title')}</Text>
        </View>
      </GlassHeader>
      {lastChat ? (
        <ContinueButton
          // A fresh button for another chat, so a swipe in progress does not carry over.
          key={lastChat.id}
          chat={lastChat}
          onOpen={() => router.push(`/chat/${lastChat.id}`)}
          onDismiss={hideContinue}
        />
      ) : null}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleStar: { marginTop: 2 },
  title: { color: colors.text, fontFamily: fonts.prose, fontWeight: '700', fontSize: 28 },
  wideWelcome: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, paddingHorizontal: 40 },
  wideWelcomeTitle: { color: colors.text, fontFamily: fonts.prose, fontSize: 26, marginBottom: 10 },
  wideWelcomeText: { color: colors.textMuted, fontSize: 15, textAlign: 'center', maxWidth: 360, lineHeight: 21 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 12,
    marginBottom: 14,
  },
  noticeTile: {
    width: 30,
    height: 30,
    borderRadius: 7,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  noticeBody: { flex: 1 },
  noticeTitle: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  noticeText: { color: colors.textMuted, fontSize: 14, lineHeight: 19 },
  emptyButton: { minWidth: 200 },
})

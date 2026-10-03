import { Link, useRouter, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import ReorderableList from 'react-native-reorderable-list'

import { Button } from '@/components/Button'
import { CharacterCard } from '@/components/CharacterCard'
import { CONTINUE_BUTTON_SPACE } from '@/components/ContinueButton'
import { EmptyState, ListSeparator } from '@/components/EmptyState'
import { GlassButton, GlassSurface } from '@/components/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/GlassHeader'
import { HomePattern } from '@/components/HomePattern'
import { MenuGlassButton } from '@/components/MenuGlassButton'
import { SFIcon } from '@/components/SFIcon'
import { listCharacters, setCharacterOrder, type CharacterPreview } from '@/db/characters'
import { pruneUntouchedChats } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { loadSettings } from '@/db/settings'
import { useCharacterActions } from '@/hooks/useCharacterActions'
import { useFeaturedFill } from '@/hooks/useFeaturedFill'
import { useContinueAnchor, useLastChat } from '@/hooks/useLastChat'
import { useReorder } from '@/hooks/useReorder'
import { useTranslation } from '@/i18n'
import { errorMessage } from '@/lib/errors'
import { FEATURED_GAP } from '@/lib/featuredLayout'
import { importCharacterCard, type CardSource } from '@/lib/importCard'
import { liquidGlass } from '@/lib/nativeUI'
import { showToast } from '@/lib/toast'
import { useColors, useStyles, type Colors } from '@/theme'

// The server notice above the list: its height and the margin under it.
const NOTICE_HEIGHT = 74

const FeaturedSeparator = () => <View style={{ height: FEATURED_GAP }} />

export default function CharactersScreen() {
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const [characters, setCharacters] = useState<CharacterPreview[] | null>(null)
  const [serverSet, setServerSet] = useState(true)
  const { lastChat, reload: reloadLastChat } = useLastChat('character')
  // The continue button itself is drawn by the tabs layout, over both home tabs.
  const anchor = useContinueAnchor()

  const reload = useCallback(async () => {
    await pruneUntouchedChats(db)
    const list = await listCharacters(db)
    const set = Boolean((await loadSettings(db)).baseUrl.trim())
    setCharacters(list)
    setServerSet(set)
    await reloadLastChat()
  }, [db, reloadLastChat])

  useFocusEffect(
    useCallback(() => {
      reload()
    }, [reload])
  )

  const onImportCard = async (source: CardSource) => {
    try {
      const name = await importCharacterCard(db, source)
      if (name === null) return
      showToast({ tone: 'success', title: t('card.importDone'), message: name })
      reload()
    } catch (err) {
      showToast({ tone: 'error', title: t('card.importFailed'), message: errorMessage(err) })
    }
  }

  const { menuItems, confirmDelete } = useCharacterActions(reload)
  const reorder = useReorder(characters, setCharacters, (ids) => setCharacterOrder(db, ids))

  // A lone character is one card over the whole screen, and the list does not scroll.
  const fill = useFeaturedFill(
    characters?.length ?? 0,
    padding,
    (lastChat ? CONTINUE_BUTTON_SPACE : 0) + (serverSet ? 0 : NOTICE_HEIGHT)
  )
  const featured = fill.height !== undefined

  return (
    <View style={styles.screen} ref={anchor.ref} onLayout={(e) => {
      anchor.onLayout()
      fill.onLayout(e)
    }}>
      <HomePattern />
      <ReorderableList
        data={characters ?? []}
        keyExtractor={(c) => String(c.id)}
        {...reorder}
        scrollEnabled={fill.scroll}
        contentContainerStyle={[padding, lastChat && { paddingBottom: padding.paddingBottom + CONTINUE_BUTTON_SPACE }]}
        ItemSeparatorComponent={featured ? FeaturedSeparator : ListSeparator}
        ListHeaderComponent={
          !serverSet && characters ? (
            // A row like the "finish setting up" one in iOS Settings: a glyph on a
            // colored tile, the text, and a chevron to where it is fixed. Clear glass like
            // the cards under it, drawn as a sibling layer for the same reason as ListCard.
            <Pressable
              onPress={() => router.navigate('/settings')}
              style={({ pressed }) => [styles.notice, liquidGlass ? styles.noticeGlass : pressed && { opacity: 0.6 }]}
            >
              {liquidGlass ? <GlassSurface interactive variant="clear" style={styles.noticeLayer} /> : null}
              <View style={styles.noticeTile}>
                <SFIcon name="server.rack" fallback="server" size={15} color="#FFFFFF" />
              </View>
              <View style={styles.noticeBody}>
                <Text style={styles.noticeTitle}>{t('characters.serverNotSetTitle')}</Text>
                <Text style={styles.noticeText}>{t('characters.serverNotSetText')}</Text>
              </View>
              <SFIcon name="chevron.right" fallback="chevron-forward" size={14} color={colors.textFaint} />
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
            onDelete={() => confirmDelete(character)}
            menu={menuItems(character)}
            fillHeight={fill.height}
          />
        )}
      />
      <GlassHeader
        floating
        right={
          <View style={styles.headerButtons}>
            <MenuGlassButton
              icon="download-outline"
              items={[
                { label: t('card.importFromFiles'), systemImage: 'folder', onSelect: () => onImportCard('files') },
                { label: t('card.importFromPhotos'), systemImage: 'photo.on.rectangle', onSelect: () => onImportCard('photos') },
              ]}
            />
            <Link href="/character/new" asChild>
              <Link.AppleZoom>
                <GlassButton icon="add" iconSize={26} accessibilityLabel={t('characters.createCharacter')} />
              </Link.AppleZoom>
            </Link>
          </View>
        }
      >
        <TabTitle>{t('characters.title')}</TabTitle>
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    borderCurve: 'continuous',
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 12,
    marginBottom: 14,
  },
  noticeGlass: { borderWidth: 0, backgroundColor: 'transparent' },
  noticeLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 20,
    borderCurve: 'continuous',
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
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})

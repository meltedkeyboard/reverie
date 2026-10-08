import { File, Paths } from 'expo-file-system'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import ReorderableList, { type ReorderableListReorderEvent } from 'react-native-reorderable-list'

import { isDesktop } from '@/lib/core/platform'
import { Button } from '@/components/controls/Button'
import { CharacterCard } from '@/components/lists/CharacterCard'
import { CONTINUE_BUTTON_SPACE } from '@/components/chat/ContinueButton'
import { EmptyState, FeaturedSeparator, ListSeparator, emptyButtonStyle } from '@/components/lists/EmptyState'
import { GlassButton } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { Pattern } from '@/components/visuals/Pattern'
import { MenuGlassButton } from '@/components/chrome/MenuGlassButton'
import { SFIcon } from '@/components/visuals/SFIcon'
import { deleteCharacter, listCharacters, mergeCharacters, sameCharacter, setCharacterOrder, type CharacterPreview } from '@/db/characters'
import { pruneUntouchedChats } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { loadSettings } from '@/db/prefs/settings'
import { useBackupImport } from '@/hooks/features/useBackupImport'
import { useCharacterActions } from '@/hooks/features/useCharacterActions'
import { useFeaturedFill } from '@/hooks/features/useFeaturedFill'
import { useContinueAnchor, useLastChat, useLastChatContext } from '@/hooks/chat/useLastChat'
import { useReloadOnFocus } from '@/hooks/chat/useChatListActions'
import { useReorder } from '@/hooks/features/useReorder'
import { useTranslation } from '@/i18n'
import { removeCharacterImages } from '@/lib/images/avatars'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { confirm } from '@/lib/ui/dialogs'
import { buildBackupArchive, characterSelection, openBackupBytes } from '@/lib/transfer/backup'
import { buildCardPng, cardFileName, importCardFile, importCharacterCard, type CardSource } from '@/lib/transfer/importCard'
import { showToast } from '@/lib/ui/toast'
import { reportError } from '@/lib/transfer/report'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

import { dragModule, DropTargetView, type DropFile } from '../../../modules/reverie-drag'

// The server notice above the list: its height and the margin under it.
const NOTICE_HEIGHT = 74


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

  useReloadOnFocus(reload)

  const onImportCard = async (source: CardSource) => {
    try {
      const name = await importCharacterCard(db, source)
      if (name === null) return
      showToast({ tone: 'success', title: t('card.importDone'), message: name })
      reload()
    } catch (err) {
      reportError(t('card.importFailed'), err)
    }
  }

  const backupImport = useBackupImport(reload)
  const [editing, setEditing] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const insets = useSafeAreaInsets()
  const { setSuspended } = useLastChatContext()
  useEffect(() => {
    setSuspended(editing)
    return () => setSuspended(false)
  }, [editing, setSuspended])

  const toggleEditing = () => {
    setEditing((on) => !on)
    setChecked(new Set())
  }

  const toggleChecked = (id: number) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const allChecked = !!characters?.length && checked.size === characters.length

  const deleteChecked = () => {
    const doomed = (characters ?? []).filter((c) => checked.has(c.id))
    confirmDeletion({
      title: t('characters.deleteSelectedTitle', { count: doomed.length }),
      message: t('characters.deleteSelectedMessage'),
      confirmLabel: t('characters.delete'),
      destructive: true,
      onConfirm: async () => {
        for (const character of doomed) {
          await deleteCharacter(db, character.id)
          removeCharacterImages(character)
        }
        setEditing(false)
        setChecked(new Set())
        reload()
      },
    })
  }

  // The file a drop outside the app asked for, written to the caches for the system to copy.
  const provide = async (character: CharacterPreview, token: string, kind: 'archive' | 'card') => {
    if (!dragModule) return
    try {
      const bytes = kind === 'card' ? await buildCardPng(character) : await buildBackupArchive(db, await characterSelection(db, character.id))
      const file = new File(Paths.cache, cardFileName(character.name, kind === 'card' ? 'png' : 'reverie'))
      file.create({ overwrite: true })
      file.write(bytes)
      dragModule.fulfill(token, file.uri)
    } catch (err) {
      dragModule.fulfill(token, null)
      reportError(t('card.exportFailed'), err)
    }
  }

  const importFiles = async (files: DropFile[]) => {
    const archives = files.filter((f) => f.kind === 'archive')
    for (const card of files.filter((f) => f.kind === 'card')) {
      try {
        const name = await importCardFile(db, card.uri, true)
        if (name !== null) showToast({ tone: 'success', title: t('card.importDone'), message: name })
      } catch (err) {
        reportError(t('card.importFailed'), err)
      }
    }
    if (archives.length) await backupImport.open(async () => Promise.all(archives.map(async (f) => openBackupBytes(await new File(f.uri).bytes()))))
    reload()
  }

  // A file opened from Files or shared to the app arrives here by the native intent.
  const { file: openedFile } = useLocalSearchParams<{ file?: string }>()
  useEffect(() => {
    if (!openedFile) return
    router.setParams({ file: undefined })
    importFiles([{ uri: openedFile, kind: openedFile.toLowerCase().endsWith('.png') ? 'card' : 'archive' }])
  }, [openedFile])

  const { menuItems, confirmDelete } = useCharacterActions(reload)
  const reorder = useReorder(characters, setCharacters, (ids) => setCharacterOrder(db, ids))

  // A card dropped next to an identical one (the one it displaced first) offers to merge: the
  // other one stays, with its settings, and takes over the chats of the dropped one.
  const onReorder = (event: ReorderableListReorderEvent) => {
    reorder.onReorder(event)
    const list = characters
    const dragged = list?.[event.from]
    if (!list || !dragged) return
    const target = [list[event.to], list[event.to + (event.to > event.from ? 1 : -1)]].find(
      (other) => other && other.id !== dragged.id && sameCharacter(other, dragged)
    )
    if (!target) return
    confirm({
      title: t('characters.mergeTitle'),
      message: t('characters.mergeMessage', { name: target.name, count: dragged.chatCount }),
      confirmLabel: t('characters.merge'),
      onConfirm: async () => {
        try {
          await mergeCharacters(db, target.id, dragged.id)
          removeCharacterImages(dragged)
          showToast({ tone: 'success', title: t('characters.mergeDone'), message: target.name })
        } catch (err) {
          reportError(t('characters.mergeFailed'), err)
        }
        reload()
      },
    })
  }

  // A lone character is one card over the whole screen, and the list does not scroll. Not
  // while editing: the check and the handle sit on a row.
  const fill = useFeaturedFill(
    characters?.length ?? 0,
    padding,
    (lastChat ? CONTINUE_BUTTON_SPACE : 0) + (serverSet ? 0 : NOTICE_HEIGHT)
  )
  const fillHeight = editing ? undefined : fill.height
  const featured = fillHeight !== undefined
  // The continue button is gone while editing; the edit bar takes its place.
  const barBottom = insets.bottom + 12
  const bottomSpace = editing ? EDIT_BAR_SPACE : lastChat ? CONTINUE_BUTTON_SPACE : 0

  const screen = (
    <View style={styles.screen} ref={anchor.ref} onLayout={(e) => {
      anchor.onLayout()
      fill.onLayout(e)
    }}>
      <Pattern id="stars" />
      <ReorderableList
        data={characters ?? []}
        keyExtractor={(c) => String(c.id)}
        {...reorder}
        onReorder={onReorder}
        // The list runs under the floating header and the tab bar, where the edge zones that
        // scroll it would hide: they start where the cards can be seen.
        autoscrollThreshold={0.15}
        autoscrollThresholdOffset={{ start: padding.paddingTop, end: padding.paddingBottom }}
        // A step every frame without the scroll animation (see the patch of the list), 12 pt to
        // begin with and speeding up while the card is held at the edge.
        autoscrollDelay={16}
        autoscrollSpeedScale={0.12}
        // About 20 characters fit a few screens, where the full speed-up overshoots: it grows
        // from two thirds there to all of it at 50.
        autoscrollAcceleration={Math.min(Math.max(((characters?.length ?? 0) - 20) / 30, 0), 1) / 3 + 2 / 3}
        scrollEnabled={editing || fill.scroll}
        contentContainerStyle={[
          padding,
          { paddingBottom: padding.paddingBottom + bottomSpace },
        ]}
        ItemSeparatorComponent={featured ? FeaturedSeparator : ListSeparator}
        ListHeaderComponent={
          !serverSet && characters ? (
            // A row like the "finish setting up" one in iOS Settings: a glyph on a
            // colored tile, the text, and a chevron to where it is fixed.
            <Pressable onPress={() => router.navigate('/settings')} style={({ pressed }) => [styles.notice, pressed && { opacity: 0.6 }]}>
              <View style={styles.noticeTile}>
                <SFIcon name="server.rack" fallback="server" size={15} color={ON_ACCENT} />
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
                    <Button variant="glass" label={t('characters.createCharacter')} style={emptyButtonStyle} />
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
            fillHeight={fillHeight}
            editing={{ active: editing, checked: checked.has(character.id), onToggle: () => toggleChecked(character.id) }}
            onProvide={(token, kind) => provide(character, token, kind)}
          />
        )}
      />
      {editing ? (
        <Animated.View
          entering={FadeInDown.springify().duration(350).dampingRatio(1)}
          exiting={FadeOutDown.duration(200)}
          style={[styles.editBar, { bottom: barBottom }]}
          pointerEvents="box-none"
        >
          <Button
            variant="glass"
            label={allChecked ? t('characters.deselectAll') : t('characters.selectAll')}
            onPress={() => setChecked(allChecked ? new Set() : new Set((characters ?? []).map((c) => c.id)))}
          />
          <GlassButton
            icon="trash-outline"
            tint={checked.size ? colors.danger : undefined}
            disabled={!checked.size}
            onPress={deleteChecked}
            accessibilityLabel={t('characters.deleteSelected')}
          />
        </Animated.View>
      ) : null}
      <GlassHeader
        floating
        right={
          <View style={styles.headerButtons}>
            {characters?.length ? (
              <GlassButton
                icon={editing ? 'checkmark' : 'list'}
                tint={editing ? colors.accent : undefined}
                onPress={toggleEditing}
                accessibilityLabel={editing ? t('characters.doneEditing') : t('characters.editList')}
              />
            ) : null}
            {editing ? null : (
              <MenuGlassButton
                icon="add"
                items={[
                  { label: t('characters.createCharacter'), systemImage: 'person.crop.circle.badge.plus', onSelect: () => router.push('/character/new') },
                  { label: t('card.importFromFiles'), systemImage: 'folder', onSelect: () => onImportCard('files') },
                  { label: t('card.importFromPhotos'), systemImage: 'photo.on.rectangle', onSelect: () => onImportCard('photos') },
                ]}
              />
            )}
          </View>
        }
      >
        <TabTitle>{t('characters.title')}</TabTitle>
      </GlassHeader>
      {backupImport.sheet}
    </View>
  )

  return DropTargetView ? (
    <DropTargetView style={styles.screen} onDropFiles={({ nativeEvent }) => importFiles(nativeEvent.files)}>
      {screen}
    </DropTargetView>
  ) : (
    screen
  )
}

// Room the list leaves under its last card for the edit bar.
const EDIT_BAR_SPACE = 64

const createStyles = (colors: Colors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: isDesktop ? 0 : 1,
    borderColor: colors.border,
    borderRadius: isDesktop ? 8 : 20,
    borderCurve: 'continuous',
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
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})

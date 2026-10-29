import { File, Paths } from 'expo-file-system'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import ReorderableList from 'react-native-reorderable-list'

import { Button } from '@/components/controls/Button'
import { CharacterCard } from '@/components/lists/CharacterCard'
import { characterRow, NativeCardList, nativeCardList, type NativeCardRow } from '@/components/lists/NativeCardList'
import { EmptyState, ListSeparator } from '@/components/lists/EmptyState'
import { GlassButton } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { HomeBackground, useHomeScheme } from '@/components/chrome/ChatChrome'
import { deleteCharacter, listCharacters, restoreCharacters, type CharacterPreview } from '@/db/characters'
import { useDatabase } from '@/db/provider'
import { useCharacterActions } from '@/hooks/features/useCharacterActions'
import { useReloadOnFocus } from '@/hooks/chat/useChatListActions'
import { useEditMode } from '@/hooks/features/useEditMode'
import { useTranslation } from '@/i18n'
import { removeCharacterImages } from '@/lib/images/avatars'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { buildBackupArchive, characterSelection } from '@/lib/transfer/backup'
import { buildCardPng, cardFileName } from '@/lib/transfer/importCard'
import { reportError } from '@/lib/transfer/report'
import { SchemeOverride, useColors, useStyles, type Colors } from '@/theme'

import { dragModule } from '../../modules/reverie-drag'

// Room the list leaves under its last card for the edit bar.
const EDIT_BAR_SPACE = 64

// The characters put away, from Settings: the list of the Characters tab, the one put there
// last on top, in no order of the user's. A swipe or the menu brings one back where it was;
// its chats open to be read.
export default function ArchiveScreen() {
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const homeScheme = useHomeScheme()
  const [characters, setCharacters] = useState<CharacterPreview[] | null>(null)

  const reload = useCallback(async () => {
    try {
      setCharacters(await listCharacters(db, true))
    } catch (err) {
      reportError(t('archive.failed'), err)
    }
  }, [db, t])
  useReloadOnFocus(reload)

  const { menuItems, confirmDelete, swipeAction, swipeCard } = useCharacterActions(reload)
  const { editing, setEditing, motion, button: editButton, checked, setChecked, toggleChecked } = useEditMode()
  const allChecked = !!characters?.length && checked.size === characters.length

  const restoreChecked = async () => {
    const ids = (characters ?? []).filter((c) => checked.has(c.id)).map((c) => c.id)
    if (!ids.length) return
    setChecked(new Set())
    setEditing(false)
    await restoreCharacters(db, ids).catch((err) => reportError(t('archive.failed'), err))
    reload()
  }

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
        setChecked(new Set())
        setEditing(false)
        reload()
      },
    })
  }

  // A character dragged out of a row to Files or Photos, as from the Characters tab.
  const provide = async (token: string, kind: 'archive' | 'card', id: number) => {
    const character = characters?.find((c) => c.id === id)
    if (!dragModule) return
    try {
      if (!character) throw new Error(`No character ${id}`)
      const bytes = kind === 'card' ? await buildCardPng(character) : await buildBackupArchive(db, await characterSelection(db, character.id))
      const file = new File(Paths.cache, cardFileName(character.name, kind === 'card' ? 'png' : 'reverie'))
      file.create({ overwrite: true })
      file.writeSync(bytes)
      dragModule.fulfill(token, file.uri)
    } catch (err) {
      dragModule.fulfill(token, null)
      reportError(t('card.exportFailed'), err)
    }
  }

  const open = (character: CharacterPreview) => router.push(`/chat/latest?character=${character.id}`)
  const bottomSpace = editing ? EDIT_BAR_SPACE : 0

  const native = !!nativeCardList && !!characters?.length
  const nativeRows: NativeCardRow[] = native
    ? (characters ?? []).map((character) =>
        characterRow(character, {
          key: String(character.id),
          menu: menuItems(character),
          onOpen: () => open(character),
          onDelete: () => confirmDelete(character),
          trailing: swipeAction(character),
        })
      )
    : []

  return (
    <SchemeOverride scheme={homeScheme}>
      <View style={styles.screen}>
        <HomeBackground pattern="two-stars" />
        {native ? (
          <NativeCardList
            rows={nativeRows}
            editing={editing}
            checked={checked}
            onCheck={setChecked}
            bottomInset={bottomSpace}
            onProvide={provide}
          />
        ) : (
          <ReorderableList
            data={characters ?? []}
            keyExtractor={(c) => String(c.id)}
            // The order is when each was put away; nothing here moves.
            onReorder={() => {}}
            scrollEnabled={Boolean(characters?.length)}
            contentContainerStyle={[padding, { paddingBottom: padding.paddingBottom + bottomSpace }]}
            ItemSeparatorComponent={ListSeparator}
            ListEmptyComponent={characters ? <EmptyState title={t('archive.emptyTitle')} text={t('archive.emptyText')} /> : undefined}
            renderItem={({ item: character }) => (
              <CharacterCard
                character={character}
                onOpen={() => open(character)}
                onDelete={() => confirmDelete(character)}
                swipe={swipeCard(character)}
                menu={menuItems(character)}
                editing={editing ? { active: true, checked: checked.has(character.id), onToggle: () => toggleChecked([character.id]), motion } : undefined}
                onProvide={provide}
              />
            )}
          />
        )}
        {editing ? (
          <Animated.View
            entering={FadeInDown.springify().duration(350).dampingRatio(1)}
            exiting={FadeOutDown.duration(200)}
            style={[styles.editBar, { bottom: insets.bottom + 12, left: Math.max(16, insets.left + 8), right: Math.max(16, insets.right + 8) }]}
            pointerEvents="box-none"
          >
            <Button
              variant="glass"
              label={allChecked ? t('characters.deselectAll') : t('characters.selectAll')}
              onPress={() => setChecked(allChecked ? new Set() : new Set((characters ?? []).map((c) => c.id)))}
            />
            <View style={styles.editBarActions}>
              <GlassButton
                icon="arrow-up-circle-outline"
                tint={checked.size ? colors.accent : undefined}
                disabled={!checked.size}
                onPress={restoreChecked}
                accessibilityLabel={t('archive.restoreSelected')}
              />
              <GlassButton
                icon="trash-outline"
                tint={checked.size ? colors.danger : undefined}
                disabled={!checked.size}
                onPress={deleteChecked}
                accessibilityLabel={t('characters.deleteSelected')}
              />
            </View>
          </Animated.View>
        ) : null}
        <GlassHeader
          floating
          centerTitle
          left={<GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} accessibilityLabel={t('common.back')} />}
          right={
            characters?.length ? (
              <GlassButton
                icon={editing ? 'checkmark' : 'list'}
                tint={editing ? colors.accent : undefined}
                {...editButton}
                accessibilityLabel={editing ? t('characters.doneEditing') : t('characters.editList')}
              />
            ) : null
          }
        >
          <TabTitle>{t('archive.title')}</TabTitle>
        </GlassHeader>
      </View>
    </SchemeOverride>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    editBar: {
      position: 'absolute',
      maxWidth: 720,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    editBarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  })

import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ReorderableList from 'react-native-reorderable-list'

import { Avatar } from '@/components/visuals/Avatar'
import { Button } from '@/components/controls/Button'
import { EmptyState, ListSeparator } from '@/components/lists/EmptyState'
import { GlassButton } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { ListCard } from '@/components/lists/ListCard'
import { NativeCardList, nativeCardList, type NativeCardRow } from '@/components/lists/NativeCardList'
import { Pattern } from '@/components/visuals/Pattern'
import { deleteCharacter, listCharacters, restoreCharacters, type CharacterPreview } from '@/db/characters'
import { useDatabase } from '@/db/provider'
import { useCharacterActions } from '@/hooks/features/useCharacterActions'
import { useReloadOnFocus } from '@/hooks/chat/useChatListActions'
import { useEditMode } from '@/hooks/features/useEditMode'
import { useReorder } from '@/hooks/features/useReorder'
import { useTranslation } from '@/i18n'
import { characterPreview } from '@/lib/chat/roleplay'
import { removeCharacterImages } from '@/lib/images/avatars'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { reportError } from '@/lib/transfer/report'
import { useColors, useStyles, type Colors } from '@/theme'

// Room the list leaves under its last card for the edit bar.
const EDIT_BAR_SPACE = 64

// The characters put away, from Settings: the list of archived characters.
// Look and behavior match the other settings screens (personas, lorebooks):
// compact cards with 44px avatars, swipe to restore/delete, and two-stars pattern.
export default function ArchiveScreen() {
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [characters, setCharacters] = useState<CharacterPreview[] | null>(null)

  const reload = useCallback(async () => {
    try {
      setCharacters(await listCharacters(db, true))
    } catch (err) {
      reportError(t('archive.failed'), err)
    }
  }, [db, t])
  useReloadOnFocus(reload)

  const reorder = useReorder(characters, setCharacters, async () => {})
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

  const open = (character: CharacterPreview) => router.push(`/chat/latest?character=${character.id}`)
  const bottomSpace = editing ? EDIT_BAR_SPACE : 0

  const native = !!nativeCardList && !!characters?.length
  const nativeRows: NativeCardRow[] = native
    ? (characters ?? []).map((character) => ({
        key: String(character.id),
        people: [character],
        title: character.name,
        date: character.chatCount > 0 ? character.lastActivity : null,
        line: characterPreview(character),
        menu: menuItems(character),
        ids: [character.id],
        drags: [],
        onOpen: () => open(character),
        onDelete: () => confirmDelete(character),
        trailing: swipeAction(character),
      }))
    : []

  return (
    <View style={styles.screen}>
      <Pattern id="two-stars" />
      {native ? (
        <NativeCardList
          rows={nativeRows}
          editing={editing}
          checked={checked}
          onCheck={setChecked}
          bottomInset={bottomSpace}
        />
      ) : (
        <ReorderableList
          data={characters ?? []}
          keyExtractor={(c) => String(c.id)}
          {...reorder}
          scrollEnabled={Boolean(characters?.length)}
          contentContainerStyle={[padding, { paddingBottom: padding.paddingBottom + bottomSpace }]}
          ItemSeparatorComponent={ListSeparator}
          ListEmptyComponent={characters ? <EmptyState title={t('archive.emptyTitle')} text={t('archive.emptyText')} /> : undefined}
          renderItem={({ item: character }) => {
            const preview = characterPreview(character)
            return (
              <ListCard
                solid
                onOpen={() => open(character)}
                onDelete={() => confirmDelete(character)}
                swipe={swipeCard(character)}
                menu={menuItems(character)}
                editing={{ active: editing, checked: checked.has(character.id), onToggle: () => toggleChecked([character.id]), motion }}
              >
                <View style={styles.cardRow}>
                  <Avatar name={character.name} file={character.avatar} size={44} />
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {character.name}
                    </Text>
                    {preview ? (
                      <Text style={styles.cardDescription} numberOfLines={2}>
                        {preview}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </ListCard>
            )
          }}
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
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      flex: 1,
    },
    cardInfo: {
      flex: 1,
      justifyContent: 'center',
      gap: 2,
    },
    cardName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      flexShrink: 1,
    },
    cardDescription: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 18,
    },
  })

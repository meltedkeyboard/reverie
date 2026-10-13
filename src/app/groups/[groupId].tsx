import { File, Paths } from 'expo-file-system'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import ReorderableList from 'react-native-reorderable-list'

import { Button } from '@/components/controls/Button'
import { CharacterCard } from '@/components/lists/CharacterCard'
import { EmptyState, ListSeparator, emptyButtonStyle } from '@/components/lists/EmptyState'
import { GlassButton } from '@/components/chrome/Glass'
import { MenuGlassButton } from '@/components/chrome/MenuGlassButton'
import { GlassHeader, useScreenPadding } from '@/components/chrome/GlassHeader'
import type { MenuItem } from '@/components/overlays/NativeMenu'
import { Pattern } from '@/components/visuals/Pattern'
import { deleteCharacter, listCharacters, listGroupCharacters, setCharacterOrder, type CharacterPreview } from '@/db/characters'
import { addToGroup, deleteGroup, getGroup, removeFromGroup, renameGroup, ungroup, type CharacterGroup } from '@/db/groups'
import { useDatabase } from '@/db/provider'
import { useCharacterActions } from '@/hooks/features/useCharacterActions'
import { useReloadOnFocus } from '@/hooks/chat/useChatListActions'
import { useEditMode } from '@/hooks/features/useEditMode'
import { useReorder } from '@/hooks/features/useReorder'
import { useTranslation } from '@/i18n'
import { removeCharacterImages } from '@/lib/images/avatars'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { AddCharactersSheet } from '@/components/overlays/AddCharactersSheet'
import { promptText } from '@/lib/ui/dialogs'
import { buildBackupArchive, characterSelection, exportBackup } from '@/lib/transfer/backup'
import { buildCardPng, cardFileName } from '@/lib/transfer/importCard'
import { reportError } from '@/lib/transfer/report'
import { fonts, HEADER_FONT_SCALE, useStyles, useColors, type Colors } from '@/theme'

import { dragModule, DropTargetView } from '../../../modules/reverie-drag'

// Room the list leaves under its last card for the edit bar.
const EDIT_BAR_SPACE = 64

export default function GroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>()
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  const [group, setGroup] = useState<CharacterGroup | null>(null)
  const [members, setMembers] = useState<CharacterPreview[] | null>(null)
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [candidates, setCandidates] = useState<CharacterPreview[]>([])

  const parsedGroupId = Number(Array.isArray(groupId) ? groupId[0] : groupId)

  const reload = useCallback(async () => {
    if (!groupId) return
    const id = Number(Array.isArray(groupId) ? groupId[0] : groupId)
    if (Number.isNaN(id)) return
    try {
      const found = await getGroup(db, id)
      if (!found) {
        router.back()
        return
      }
      const list = await listGroupCharacters(db, id)
      setGroup(found)
      setMembers(list)
    } catch (err) {
      reportError(t('groups.failed'), err)
    }
  }, [db, groupId, router, t])

  useReloadOnFocus(reload)

  const { menuItems, confirmDelete } = useCharacterActions(reload)
  const reorder = useReorder(members, setMembers, (ids) => setCharacterOrder(db, ids))
  const { editing, setEditing, motion, button: editButton, checked, setChecked, toggleChecked } = useEditMode()

  const allChecked = !!members?.length && checked.size === members.length

  // The ids of all members: used by DropTargetView to recognise characters dragged out of
  // the group (dropped on the list background) and by the cards so they are no target for each other.
  const groupedIds = useMemo(() => (members ?? []).map((m) => m.id), [members])

  const removeChecked = () => {
    const doomed = (members ?? []).filter((c) => checked.has(c.id))
    confirmDeletion({
      title: t('groups.removeSelectedTitle', { count: doomed.length }),
      message: t('groups.removeSelectedMessage'),
      confirmLabel: t('groups.removeFromGroup'),
      destructive: true,
      onConfirm: async () => {
        await removeFromGroup(db, doomed.map((c) => c.id))
        setChecked(new Set())
        setEditing(false)
        reload()
      },
    })
  }

  const deleteWholeGroup = () => {
    if (!group || !members) return
    confirmDeletion({
      title: t('groups.deleteTitle'),
      message: t('groups.deleteMessage', { count: members.length }),
      confirmLabel: t('characters.delete'),
      destructive: true,
      onConfirm: async () => {
        for (const character of members) {
          await deleteCharacter(db, character.id)
          removeCharacterImages(character)
        }
        await deleteGroup(db, group.id)
        router.back()
      },
    })
  }

  const chooseCharacterToAdd = async () => {
    if (Number.isNaN(parsedGroupId)) return
    const all = await listCharacters(db)
    const available = all.filter((c) => c.groupId !== parsedGroupId)
    setCandidates(available)
    setAddSheetOpen(true)
  }

  const groupMenuItems: MenuItem[] = group
    ? [
        {
          label: t('groups.addCharacter'),
          systemImage: 'plus',
          onSelect: chooseCharacterToAdd,
        },
        {
          label: t('groups.rename'),
          systemImage: 'pencil',
          onSelect: () =>
            promptText({
              title: t('groups.rename'),
              message: t('groups.renameMessage'),
              initial: group.name ?? '',
              confirmLabel: t('common.save'),
              onSubmit: async (name) => {
                await renameGroup(db, group.id, name)
                reload()
              },
            }),
        },
        {
          label: t('groups.ungroup'),
          systemImage: 'rectangle.stack.badge.minus',
          onSelect: async () => {
            await ungroup(db, group.id)
            router.back()
          },
        },
        {
          label: t('card.export'),
          systemImage: 'square.and.arrow.up',
          onSelect: async () => {
            if (!members) return
            const picked = await Promise.all(members.map((c) => characterSelection(db, c.id)))
            await exportBackup(db, {
              characters: new Set(picked.flatMap((p) => [...p.characters])),
              rooms: new Set(),
              chats: new Set(picked.flatMap((p) => [...p.chats])),
            })
          },
        },
        { label: t('groups.delete'), systemImage: 'trash', destructive: true, onSelect: deleteWholeGroup },
      ]
    : []

  const provide = async (token: string, kind: 'archive' | 'card', id: number) => {
    const character = members?.find((c) => c.id === id)
    if (!dragModule) return
    try {
      if (!character) throw new Error(`No character ${id}`)
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

  const title = group?.name || members?.map((m) => m.name).join(', ') || ''
  const barBottom = insets.bottom + 12
  const bottomSpace = editing ? EDIT_BAR_SPACE : 0

  const screen = (
    <View style={styles.screen}>
      <Pattern id="two-stars" />
      <ReorderableList
        data={members ?? []}
        keyExtractor={(c) => String(c.id)}
        {...reorder}
        contentContainerStyle={[
          padding,
          { paddingBottom: padding.paddingBottom + bottomSpace },
        ]}
        ItemSeparatorComponent={ListSeparator}
        ListEmptyComponent={
          members ? (
            <EmptyState
              title={t('groups.emptyTitle')}
              text={t('groups.emptyText')}
              action={
                <Button
                  variant="glass"
                  label={t('groups.addCharacter')}
                  style={emptyButtonStyle}
                  onPress={chooseCharacterToAdd}
                />
              }
            />
          ) : null
        }
        renderItem={({ item: character }) => (
          <CharacterCard
            character={character}
            onOpen={() => router.push(`/chat/new?character=${character.id}`)}
            onDelete={() => confirmDelete(character)}
            menu={menuItems(character)}
            // All member ids: no card in the group becomes a drop target for another member.
            groupIds={groupedIds}
            editing={
              editing
                ? {
                    active: true,
                    checked: checked.has(character.id),
                    onToggle: () => toggleChecked([character.id]),
                    motion,
                  }
                : undefined
            }
            onProvide={provide}
            onDropCards={(dropped) => addToGroup(db, parsedGroupId, dropped).then(reload)}
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
            onPress={() => setChecked(allChecked ? new Set() : new Set((members ?? []).map((c) => c.id)))}
          />
          <GlassButton
            icon="trash-outline"
            tint={checked.size ? colors.danger : undefined}
            disabled={!checked.size}
            onPress={removeChecked}
            accessibilityLabel={t('groups.removeFromGroup')}
          />
        </Animated.View>
      ) : null}
      <GlassHeader
        floating
        left={<GlassButton icon="chevron-back" iconSize={26} onPress={() => router.back()} accessibilityLabel={t('common.back')} />}
        right={
          group ? (
            <View style={styles.headerButtons}>
              {members?.length ? (
                <GlassButton
                  icon={editing ? 'checkmark' : 'list'}
                  tint={editing ? colors.accent : undefined}
                  {...editButton}
                  accessibilityLabel={editing ? t('characters.doneEditing') : t('characters.editList')}
                />
              ) : null}
              {editing ? null : (
                <MenuGlassButton icon="ellipsis-horizontal" items={groupMenuItems} />
              )}
            </View>
          ) : null
        }
      >
        {group ? (
          <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.name} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </GlassHeader>
      <AddCharactersSheet
        visible={addSheetOpen}
        characters={candidates}
        onConfirm={async (selectedIds) => {
          setAddSheetOpen(false)
          await addToGroup(db, parsedGroupId, selectedIds)
          reload()
        }}
        onClose={() => setAddSheetOpen(false)}
      />
    </View>
  )

  // When the native drag module is present: a character dragged off any card and dropped on
  // the list background (not on another card) leaves the group and reappears on the home list.
  return DropTargetView ? (
    <DropTargetView
      style={styles.screen}
      groupedIds={groupedIds}
      onDropFiles={() => {}}
      onDropCards={({ nativeEvent }) => removeFromGroup(db, nativeEvent.ids).then(reload)}
    >
      {screen}
    </DropTargetView>
  ) : (
    screen
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { flexShrink: 1, color: colors.text, fontFamily: fonts.prose, fontSize: 18, fontWeight: '600' },
    editBar: {
      position: 'absolute',
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  })

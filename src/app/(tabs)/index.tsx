import { File, Paths } from 'expo-file-system'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, LinearTransition } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import ReorderableList, { reorderItems, type ReorderableListReorderEvent } from 'react-native-reorderable-list'

import { isDesktop } from '@/lib/core/platform'
import { Button } from '@/components/controls/Button'
import { CharacterCard } from '@/components/lists/CharacterCard'
import { GroupCard } from '@/components/lists/GroupCard'
import { CONTINUE_BUTTON_SPACE } from '@/components/chat/ContinueButton'
import { EmptyState, FeaturedSeparator, ListSeparator, emptyButtonStyle } from '@/components/lists/EmptyState'
import { GlassButton } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { Pattern } from '@/components/visuals/Pattern'
import { MenuGlassButton } from '@/components/chrome/MenuGlassButton'
import { SFIcon } from '@/components/visuals/SFIcon'
import { deleteCharacter, listCharacters, mergeCharacters, sameCharacter, type CharacterPreview } from '@/db/characters'
import { addToGroup, createGroup, deleteGroup, listGroups, pruneGroups, removeFromGroup, renameGroup, setHomeOrder, setMemberOrder, ungroup, type CharacterGroup } from '@/db/groups'
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
import { confirm, promptText } from '@/lib/ui/dialogs'
import { buildBackupArchive, characterSelection, exportBackup, openBackupBytes } from '@/lib/transfer/backup'
import { buildCardPng, cardFileName, importCardFile, importCharacterCard, type CardSource } from '@/lib/transfer/importCard'
import { showToast } from '@/lib/ui/toast'
import { reportError } from '@/lib/transfer/report'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

import { dragModule, DropTargetView, type DropFile } from '../../../modules/reverie-drag'

// The server notice above the list: its height and the margin under it.
const NOTICE_HEIGHT = 74

// A row of the home list: a group, or a character standing alone or inside an open group.
type Row =
  | { kind: 'group'; key: string; group: CharacterGroup; members: CharacterPreview[] }
  | { kind: 'character'; key: string; character: CharacterPreview; inGroup: boolean }

// Groups and lone characters share one order, highest first; on a tie a group comes first,
// so a character taken out of one lands right under it.
function buildRows(characters: CharacterPreview[], groups: CharacterGroup[], open: Set<number>): Row[] {
  const members = new Map<number, CharacterPreview[]>()
  for (const c of characters) if (c.groupId !== null) members.set(c.groupId, [...(members.get(c.groupId) ?? []), c])
  const top = [
    ...groups.filter((g) => members.has(g.id)).map((g) => ({ order: g.sortOrder, tie: 1, id: g.id, group: g as CharacterGroup | undefined, character: undefined })),
    ...characters.filter((c) => c.groupId === null).map((c) => ({ order: c.sortOrder, tie: 0, id: c.id, group: undefined, character: c as CharacterPreview | undefined })),
  ].sort((a, b) => b.order - a.order || b.tie - a.tie || b.id - a.id)
  return top.flatMap((entry): Row[] => {
    if (entry.character) return [{ kind: 'character', key: `c${entry.id}`, character: entry.character, inGroup: false }]
    const list = members.get(entry.id)!
    const head: Row = { kind: 'group', key: `g${entry.id}`, group: entry.group!, members: list }
    if (!open.has(entry.id)) return [head]
    return [head, ...list.map((c): Row => ({ kind: 'character', key: `c${c.id}`, character: c, inGroup: true }))]
  })
}


export default function CharactersScreen() {
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const [characters, setCharacters] = useState<CharacterPreview[] | null>(null)
  const [groups, setGroups] = useState<CharacterGroup[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [serverSet, setServerSet] = useState(true)
  const { lastChat, reload: reloadLastChat } = useLastChat('character')
  // The continue button itself is drawn by the tabs layout, over both home tabs.
  const anchor = useContinueAnchor()

  const reload = useCallback(async () => {
    await pruneUntouchedChats(db)
    const list = await listCharacters(db)
    const set = Boolean((await loadSettings(db)).baseUrl.trim())
    setGroups(await listGroups(db))
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

  // A group's check ticks or clears all its characters at once.
  const toggleChecked = (ids: number[]) =>
    setChecked((prev) => {
      const next = new Set(prev)
      const all = ids.every((id) => next.has(id))
      for (const id of ids) {
        if (all) next.delete(id)
        else next.add(id)
      }
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
        await pruneGroups(db)
        setEditing(false)
        setChecked(new Set())
        reload()
      },
    })
  }

  // The file a drop outside the app asked for, written to the caches for the system to copy.
  const provide = async (token: string, kind: 'archive' | 'card', id: number) => {
    const character = characters?.find((c) => c.id === id)
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
  // Only the haptics and the edge guard of the shared hook: the rows here are of two kinds.
  const reorder = useReorder(null, () => {}, async () => {})

  const rows = useMemo(() => buildRows(characters ?? [], groups, expanded), [characters, groups, expanded])
  const groupedIds = useMemo(() => (characters ?? []).filter((c) => c.groupId !== null).map((c) => c.id), [characters])
  const membersOf = useMemo(() => {
    const byGroup = new Map<number, number[]>()
    for (const c of characters ?? []) if (c.groupId !== null) byGroup.set(c.groupId, [...(byGroup.get(c.groupId) ?? []), c.id])
    return byGroup
  }, [characters])

  const toggleExpanded = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const run = (change: Promise<unknown>) =>
    change.catch((err) => reportError(t('groups.failed'), err)).then(reload)

  // Cards dropped on a character make a group in its place; on a member of a group or on the
  // group itself they join that group.
  const dropOnCharacter = (target: CharacterPreview, ids: number[]) =>
    run(target.groupId !== null ? addToGroup(db, target.groupId, ids) : createGroup(db, target, ids))

  const deleteWholeGroup = (group: CharacterGroup, members: CharacterPreview[]) =>
    confirmDeletion({
      title: t('groups.deleteTitle'),
      message: t('groups.deleteMessage', { count: members.length }),
      confirmLabel: t('characters.delete'),
      destructive: true,
      onConfirm: () =>
        run(
          (async () => {
            for (const character of members) {
              await deleteCharacter(db, character.id)
              removeCharacterImages(character)
            }
            await deleteGroup(db, group.id)
          })()
        ),
    })

  const groupMenu = (group: CharacterGroup, members: CharacterPreview[]) => [
    {
      label: t('groups.rename'),
      systemImage: 'pencil',
      onSelect: () =>
        promptText({
          title: t('groups.rename'),
          message: t('groups.renameMessage'),
          initial: group.name ?? '',
          confirmLabel: t('common.save'),
          onSubmit: (name) => run(renameGroup(db, group.id, name)),
        }),
    },
    { label: t('groups.ungroup'), systemImage: 'rectangle.stack.badge.minus', onSelect: () => run(ungroup(db, group.id)) },
    {
      label: t('card.export'),
      systemImage: 'square.and.arrow.up',
      onSelect: () =>
        run(
          (async () => {
            const picked = await Promise.all(members.map((c) => characterSelection(db, c.id)))
            await exportBackup(db, {
              characters: new Set(picked.flatMap((p) => [...p.characters])),
              rooms: new Set(),
              chats: new Set(picked.flatMap((p) => [...p.chats])),
            })
          })()
        ),
    },
    { label: t('groups.delete'), systemImage: 'trash', destructive: true, onSelect: () => deleteWholeGroup(group, members) },
  ]

  // The new order is shown at once and saved: groups and lone characters among themselves,
  // and the members of each group among themselves. A member moved out of its group's rows
  // stays in the group and goes back under it.
  const moveRow = ({ from, to }: ReorderableListReorderEvent) => {
    const next = reorderItems(rows, from, to)
    const top = next.filter((row) => row.kind === 'group' || !row.inGroup)
    const order = new Map(top.map((row, index) => [row.key, top.length - index]))
    const inside = new Map<number, number[]>()
    for (const row of next) {
      if (row.kind !== 'character' || !row.inGroup || row.character.groupId === null) continue
      inside.set(row.character.groupId, [...(inside.get(row.character.groupId) ?? []), row.character.id])
    }
    for (const ids of inside.values()) ids.forEach((id, index) => order.set(`c${id}`, ids.length - index))
    setGroups((prev) => prev.map((g) => ({ ...g, sortOrder: order.get(`g${g.id}`) ?? g.sortOrder })))
    setCharacters((prev) => prev && prev.map((c) => ({ ...c, sortOrder: order.get(`c${c.id}`) ?? c.sortOrder })))
    setHomeOrder(
      db,
      top.map((row) => (row.kind === 'group' ? { kind: 'group', id: row.group.id } : { kind: 'character', id: row.character.id }))
    )
    for (const ids of inside.values()) setMemberOrder(db, ids)
  }

  // A card dropped next to an identical one (the one it displaced first) offers to merge: the
  // other one stays, with its settings, and takes over the chats of the dropped one.
  const onReorder = (event: ReorderableListReorderEvent) => {
    moveRow(event)
    const near = [rows[event.to], rows[event.to + (event.to > event.from ? 1 : -1)]]
    const moved = rows[event.from]
    if (moved?.kind !== 'character') return
    const dragged = moved.character
    const target = near
      .map((row) => (row?.kind === 'character' ? row.character : undefined))
      .find((other) => other && other.id !== dragged.id && sameCharacter(other, dragged))
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
    rows.length === 1 && rows[0].kind === 'group' ? rows.length + 1 : rows.length,
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
        data={rows}
        keyExtractor={(row) => row.key}
        {...reorder}
        itemLayoutAnimation={LinearTransition.springify().duration(350).dampingRatio(1)}
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
        autoscrollAcceleration={Math.min(Math.max((rows.length - 20) / 30, 0), 1) / 3 + 2 / 3}
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
        renderItem={({ item: row }) => {
          if (row.kind === 'group') {
            const ids = row.members.map((m) => m.id)
            return (
              <GroupCard
                group={row.group}
                members={row.members}
                expanded={expanded.has(row.group.id)}
                onToggle={() => toggleExpanded(row.group.id)}
                onDelete={() => deleteWholeGroup(row.group, row.members)}
                onUngroup={() => run(ungroup(db, row.group.id))}
                menu={groupMenu(row.group, row.members)}
                editing={{ active: editing, checked: ids.every((id) => checked.has(id)), onToggle: () => toggleChecked(ids), opens: true }}
                onDropCards={(dropped) => run(addToGroup(db, row.group.id, dropped))}
                onProvide={provide}
              />
            )
          }
          const { character, inGroup } = row
          const groupIds = character.groupId !== null ? membersOf.get(character.groupId) : undefined
          const card = (
            <CharacterCard
              character={character}
              onOpen={() => router.push(`/chats/${character.id}`)}
              onDelete={() => confirmDelete(character)}
              menu={menuItems(character)}
              fillHeight={fillHeight}
              editing={{ active: editing, checked: checked.has(character.id), onToggle: () => toggleChecked([character.id]) }}
              onProvide={provide}
              onDropCards={(dropped) => dropOnCharacter(character, dropped)}
              inGroup={inGroup}
              groupIds={groupIds}
            />
          )
          // Members slide in under their group and fade out back into it.
          return inGroup ? (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)}>
              {card}
            </Animated.View>
          ) : (
            card
          )
        }}
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
    <DropTargetView
      style={styles.screen}
      groupedIds={groupedIds}
      onDropFiles={({ nativeEvent }) => importFiles(nativeEvent.files)}
      onDropCards={({ nativeEvent }) => run(removeFromGroup(db, nativeEvent.ids))}
    >
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

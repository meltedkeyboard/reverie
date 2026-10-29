import { File, Paths } from 'expo-file-system'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import ReorderableList, { reorderItems, type ReorderableListReorderEvent } from 'react-native-reorderable-list'

import { isDesktop } from '@/lib/core/platform'
import { Button } from '@/components/controls/Button'
import { IconButton } from '@/components/controls/IconButton'
import { CharacterCard } from '@/components/lists/CharacterCard'
import { GroupCard } from '@/components/lists/GroupCard'
import { characterRow, NativeCardList, nativeCardList, type NativeCardRow } from '@/components/lists/NativeCardList'
import { CONTINUE_BUTTON_SPACE } from '@/components/chat/ContinueButton'
import { EmptyState, FeaturedSeparator, ListSeparator, emptyButtonStyle } from '@/components/lists/EmptyState'
import { GlassButton, GlassGroup, GlassSurface, useGlassStyles } from '@/components/chrome/Glass'
import { GlassHeader, TabTitle, useScreenPadding } from '@/components/chrome/GlassHeader'
import { HomeBackground, useHomeScheme } from '@/components/chrome/ChatChrome'
import { NativeMenu, type MenuItem } from '@/components/overlays/NativeMenu'
import { PopoverMenu, usePopoverMenu } from '@/components/overlays/PopoverMenu'
import { Icon } from '@/components/visuals/Icon'
import { SFIcon } from '@/components/visuals/SFIcon'
import { withAlpha } from '@/lib/core/color'
import { countLabel } from '@/lib/core/format'
import * as Haptics from '@/lib/ui/haptics'
import { deleteCharacter, listCharacters, mergeCharacters, sameCharacter, type CharacterPreview } from '@/db/characters'
import { addToGroup, createGroup, deleteGroup, listGroups, pruneGroups, removeFromGroup, renameGroup, saveHomeOrder, ungroup, type CharacterGroup } from '@/db/groups'
import { pruneUntouchedChats } from '@/db/chats'
import { useDatabase } from '@/db/provider'
import { loadSettings } from '@/db/prefs/settings'
import { useBackupImport } from '@/hooks/features/useBackupImport'
import { useCharacterActions } from '@/hooks/features/useCharacterActions'
import { useFeaturedFill } from '@/hooks/features/useFeaturedFill'
import { useContinueAnchor, useLastChat } from '@/hooks/chat/useLastChat'
import { useReloadOnFocus } from '@/hooks/chat/useChatListActions'
import { useEditMode } from '@/hooks/features/useEditMode'
import { useReorder } from '@/hooks/features/useReorder'
import { useTranslation } from '@/i18n'
import { removeCharacterImages } from '@/lib/images/avatars'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { confirm, promptText, showSheet } from '@/lib/ui/dialogs'
import { buildBackupArchive, characterSelection, exportBackup, openBackupBytes } from '@/lib/transfer/backup'
import { buildCardPng, cardFileName, importCardFile, importCharacterCard, type CardSource } from '@/lib/transfer/importCard'
import { swiftUI } from '@/lib/ui/nativeUI'
import { showToast } from '@/lib/ui/toast'
import { reportError } from '@/lib/transfer/report'
import { type Colors, ON_ACCENT, SchemeOverride, useColors, useStyles } from '@/theme'

import { dragModule, DropTargetView, type DropFile } from '../../../modules/reverie-drag'

// The server notice above the list: its height and the margin under it.
const NOTICE_HEIGHT = 74

// A row of the home list: a group, or a character standing alone.
type HomeRow =
  | { kind: 'group'; key: string; group: CharacterGroup; members: CharacterPreview[] }
  | { kind: 'character'; key: string; character: CharacterPreview }

// Groups and lone characters share one order, highest first; on a tie a group comes first.
function buildRows(characters: CharacterPreview[], groups: CharacterGroup[]): HomeRow[] {
  const members = new Map<number, CharacterPreview[]>()
  for (const c of characters) if (c.groupId !== null) members.set(c.groupId, [...(members.get(c.groupId) ?? []), c])
  const top = [
    ...groups.filter((g) => members.has(g.id)).map((g) => ({ order: g.sortOrder, tie: 1, id: g.id, group: g as CharacterGroup | undefined, character: undefined })),
    ...characters.filter((c) => c.groupId === null).map((c) => ({ order: c.sortOrder, tie: 0, id: c.id, group: undefined, character: c as CharacterPreview | undefined })),
  ].sort((a, b) => b.order - a.order || b.tie - a.tie || b.id - a.id)
  return top.map((entry): HomeRow => {
    if (entry.character) return { kind: 'character', key: `c${entry.id}`, character: entry.character }
    const list = members.get(entry.id)!
    return { kind: 'group', key: `g${entry.id}`, group: entry.group!, members: list }
  })
}


export default function CharactersScreen() {
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('list')
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t, locale } = useTranslation()
  const [characters, setCharacters] = useState<CharacterPreview[] | null>(null)
  const [groups, setGroups] = useState<CharacterGroup[]>([])
  const [serverSet, setServerSet] = useState(true)
  const { lastChat, reload: reloadLastChat } = useLastChat('character')
  const glass = useGlassStyles()
  const createMenu = usePopoverMenu()

  const anchor = useContinueAnchor()
  // Over the chats' wallpaper, when it is behind the list, the list takes the scheme a chat takes there.
  const homeScheme = useHomeScheme()

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
  const insets = useSafeAreaInsets()
  const { editing, setEditing, motion: editMotion, button: editButton, checked, setChecked, toggleChecked } = useEditMode()

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
        reload()
      },
    })
  }

  const canGroup = groups.length > 0 ? checked.size >= 1 : checked.size >= 2

  const groupChecked = () => {
    const selected = (characters ?? []).filter((c) => checked.has(c.id))
    if (!selected.length) return
    const ids = selected.map((c) => c.id)

    if (groups.length === 0) {
      if (ids.length < 2) return
      const target = selected[0]
      run(createGroup(db, target, ids))
      setChecked(new Set())
      setEditing(false)
      return
    }

    const options: { label: string; onSelect: () => void }[] = []
    if (ids.length >= 2) {
      options.push({
        label: t('groups.newGroup'),
        onSelect: () => {
          const target = selected[0]
          run(createGroup(db, target, ids))
          setChecked(new Set())
          setEditing(false)
        },
      })
    }
    for (const g of groups) {
      const gMembers = (characters ?? []).filter((c) => c.groupId === g.id)
      const name = g.name ?? gMembers.map((m) => m.name).join(', ')
      options.push({
        label: name,
        onSelect: () => {
          run(addToGroup(db, g.id, ids))
          setChecked(new Set())
          setEditing(false)
        },
      })
    }
    showSheet(t('groups.addCharacterTitle'), options)
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
      file.writeSync(bytes)
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

  const { menuItems, confirmDelete, duplicate } = useCharacterActions(reload)
  // Only the haptics and the edge guard of the shared hook: the rows here are of two kinds.
  const reorder = useReorder(null, () => {}, async () => {})

  const rows = useMemo(() => buildRows(characters ?? [], groups), [characters, groups])
  const visibleCount = rows.length
  const groupedIds = useMemo(() => (characters ?? []).filter((c) => c.groupId !== null).map((c) => c.id), [characters])

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
              personas: new Set(picked.flatMap((p) => [...p.personas])),
            })
          })()
        ),
    },
    { label: t('groups.delete'), systemImage: 'trash', destructive: true, onSelect: () => deleteWholeGroup(group, members) },
  ]

  // The new order is shown at once and saved: groups and lone characters among themselves.
  const moveRow = ({ from, to }: ReorderableListReorderEvent) => {
    const next = reorderItems(rows, from, to)
    const order = new Map(next.map((row, index) => [row.key, next.length - index]))
    setGroups((prev) => prev.map((g) => ({ ...g, sortOrder: order.get(`g${g.id}`) ?? g.sortOrder })))
    setCharacters((prev) => prev && prev.map((c) => ({ ...c, sortOrder: order.get(`c${c.id}`) ?? c.sortOrder })))
    saveHomeOrder(
      db,
      next.map((row) => (row.kind === 'group' ? { kind: 'group', id: row.group.id } : { kind: 'character', id: row.character.id })),
      []
    ).catch((err) => reportError(t('groups.failed'), err))
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
    visibleCount === 1 && rows[0].kind === 'group' ? 2 : visibleCount,
    padding,
    (lastChat ? CONTINUE_BUTTON_SPACE : 0) + (serverSet ? 0 : NOTICE_HEIGHT)
  )
  // The system's list on iOS has no card over the whole screen: a lone character is a row.
  const native = !!nativeCardList && rows.length > 0
  const fillHeight = editing || native ? undefined : fill.height
  const featured = fillHeight !== undefined
  // The continue button is gone while editing; the edit bar takes its place.
  const barBottom = insets.bottom + 12
  const bottomSpace = editing ? EDIT_BAR_SPACE : lastChat ? CONTINUE_BUTTON_SPACE : 0

  // The menu of the plus on iOS, with the kinds of import folded into one item.
  const createItems: MenuItem[] = [
    { label: t('characters.createCharacter'), systemImage: 'person.badge.plus', onSelect: () => router.push('/character/new') },
    {
      label: t('card.import'),
      systemImage: 'square.and.arrow.down',
      children: [
        { label: t('card.importFromFiles'), systemImage: 'folder', onSelect: () => onImportCard('files') },
        { label: t('card.importFromPhotos'), systemImage: 'photo', onSelect: () => onImportCard('photos') },
      ],
    },
  ]

  // The rows of the system's list: a group shows its members' faces and names, and a drag
  // lifts them all; a character lifted alone can be dropped on another to make a group.
  const nativeRows: NativeCardRow[] = native
    ? rows.map((row) => {
        if (row.kind === 'group') {
          const names = row.members.map((c) => c.name).join(', ')
          const ids = row.members.map((c) => c.id)
          return {
            key: row.key,
            people: row.members,
            title: row.group.name ?? names,
            date: null,
            line: row.group.name ? names : countLabel(row.members.length, 'character', locale),
            menu: groupMenu(row.group, row.members),
            ids,
            drags: row.members.map((c) => ({ id: c.id, name: c.name })),
            onDrop: (dropped) => run(addToGroup(db, row.group.id, dropped)),
            own: ids,
            onOpen: () => router.push(`/groups/${row.group.id}`),
            onDelete: () => deleteWholeGroup(row.group, row.members),
            leading: { label: t('groups.ungroup'), systemImage: 'rectangle.stack.badge.minus', onAction: () => run(ungroup(db, row.group.id)) },
          }
        }
        return characterRow(row.character, {
          key: row.key,
          menu: menuItems(row.character),
          onDrop: (dropped) => dropOnCharacter(row.character, dropped),
          onOpen: () => router.push(`/chat/latest?character=${row.character.id}`),
          onDelete: () => confirmDelete(row.character),
          leading: { label: t('characters.duplicate'), systemImage: 'plus.square.on.square', onAction: () => duplicate(row.character) },
        })
      })
    : []

  const screen = (
    <View style={styles.screen} ref={anchor.ref} onLayout={(e) => {
      anchor.onLayout()
      fill.onLayout(e)
    }}>
      <HomeBackground pattern="stars" />
      {native ? (
        <NativeCardList
          rows={nativeRows}
          editing={editing}
          checked={checked}
          onCheck={setChecked}
          notice={serverSet ? null : { title: t('characters.serverNotSetTitle'), text: t('characters.serverNotSetText'), symbol: 'server.rack', onPress: () => router.navigate('/settings') }}
          bottomInset={bottomSpace}
          onMove={(from, to) => onReorder({ from, to })}
          onProvide={provide}
        />
      ) : (
        <ReorderableList
          data={rows}
          keyExtractor={(row) => row.key}
          {...reorder}
          onReorder={onReorder}
          onScrollBeginDrag={createMenu.close}
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
          autoscrollAcceleration={Math.min(Math.max((visibleCount - 20) / 30, 0), 1) / 3 + 2 / 3}
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
            ) : undefined
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
            ) : undefined
          }
          renderItem={({ item: row }) => {
            if (row.kind === 'group') {
              const ids = row.members.map((m) => m.id)
              return (
                <GroupCard
                  group={row.group}
                  members={row.members}
                  onOpen={() => router.push(`/groups/${row.group.id}`)}
                  onDelete={() => deleteWholeGroup(row.group, row.members)}
                  onUngroup={() => run(ungroup(db, row.group.id))}
                  menu={groupMenu(row.group, row.members)}
                  editing={{ active: editing, checked: ids.every((id) => checked.has(id)), onToggle: () => toggleChecked(ids), motion: editMotion }}
                  onDropCards={(dropped) => run(addToGroup(db, row.group.id, dropped))}
                  onProvide={provide}
                />
              )
            }
            const { character } = row
            return (
              <CharacterCard
                character={character}
                onOpen={() => router.push(`/chat/latest?character=${character.id}`)}
                onDelete={() => confirmDelete(character)}
                menu={menuItems(character)}
                fillHeight={fillHeight}
                editing={{ active: editing, checked: checked.has(character.id), onToggle: () => toggleChecked([character.id]), motion: editMotion }}
                onProvide={provide}
                onDropCards={(dropped) => dropOnCharacter(character, dropped)}
              />
            )
          }}
        />
      )}
      {editing ? (
        <Animated.View
          entering={FadeInDown.springify().duration(350).dampingRatio(1)}
          exiting={FadeOutDown.duration(200)}
          style={[
            styles.editBar,
            {
              bottom: barBottom,
              left: Math.max(16, insets.left + 8),
              right: Math.max(16, insets.right + 8),
            },
          ]}
          pointerEvents="box-none"
        >
          <Button
            variant="glass"
            label={allChecked ? t('characters.deselectAll') : t('characters.selectAll')}
            onPress={() => setChecked(allChecked ? new Set() : new Set((characters ?? []).map((c) => c.id)))}
          />
          <View style={styles.editBarActions}>
            <GlassButton
              icon="folder-outline"
              tint={canGroup ? colors.accent : undefined}
              disabled={!canGroup}
              onPress={groupChecked}
              accessibilityLabel={t('groups.groupSelected')}
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
        right={
          <GlassGroup interactive={false}>
            {characters?.length ? (
              <IconButton
                name={editing ? 'checkmark' : 'list'}
                color={editing ? colors.accent : undefined}
                {...editButton}
                accessibilityLabel={editing ? t('characters.doneEditing') : t('characters.editList')}
              />
            ) : null}
            {editing ? null : swiftUI ? (
              // The system menu grows out of the button, in Liquid Glass on iOS 26.
              <NativeMenu items={createItems}>
                <IconButton name="add" size={26} accessibilityLabel={t('characters.createCharacter')} />
              </NativeMenu>
            ) : (
              <IconButton
                name="add"
                size={26}
                onPress={createMenu.toggle}
                accessibilityLabel={t('characters.createCharacter')}
              />
            )}
          </GlassGroup>
        }
      >
        <TabTitle>{t('characters.title')}</TabTitle>
      </GlassHeader>
      <PopoverMenu
        visible={createMenu.visible}
        onClose={createMenu.close}
        style={[styles.createMenu, { top: insets.top + 4, right: 8 }]}
        items={[
          {
            label: t('characters.createCharacter'),
            icon: 'person-add-outline',
            onSelect: () => router.push('/character/new'),
          },
          {
            label: t('card.importFromFiles'),
            icon: 'folder-outline',
            onSelect: () => onImportCard('files'),
          },
          {
            label: t('card.importFromPhotos'),
            icon: 'images-outline',
            onSelect: () => onImportCard('photos'),
          },
        ]}
      />
      {backupImport.sheet}
    </View>
  )

  return (
    <SchemeOverride scheme={homeScheme}>
      {DropTargetView ? (
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
      )}
    </SchemeOverride>
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
    maxWidth: 720,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editBarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  createMenu: { position: 'absolute', zIndex: 100, transformOrigin: 'right top' },
})

import { useEffect, useState } from 'react'
import { PixelRatio, StyleSheet } from 'react-native'

import type { CharacterPreview } from '@/db/characters'
import type { CharacterGroup } from '@/db/groups'
import { useTranslation } from '@/i18n'
import { countLabel, formatShortWhen } from '@/lib/core/format'
import { characterPreview } from '@/lib/chat/roleplay'
import { avatarUri } from '@/lib/images/avatarStore'
import { avatarInitial, avatarTint } from '@/lib/images/initial'
import { swiftUI } from '@/lib/ui/nativeUI'
import { HEADER_ROW_HEIGHT, useTheme } from '@/theme'

import type { MenuItem } from '../overlays/NativeMenu'
import { toEntries, unlessDragging } from './DraggableCard'
import { cardRow, dragModule, dragSession, type CardRowEvent, type RowFace } from '../../../modules/reverie-drag'

// A row of the home list: a group, or a character standing alone.
export type HomeRow =
  | { kind: 'group'; key: string; group: CharacterGroup; members: CharacterPreview[] }
  | { kind: 'character'; key: string; character: CharacterPreview }

// The system's list on iOS, where the rows are a SwiftUI List as Messages draws its
// conversations: a face in a circle, the name with the date of the last message and the
// message under it, the system's swipe and edit mode. A row still behaves as a card did
// (see CardRow.swift): the menu on a long press, the drag with other rows tapped into the
// stack, characters dropped on it. Null without SwiftUI and the drag module.
export const nativeCharacterList = swiftUI && dragModule ? swiftUI : null

type Props = {
  rows: HomeRow[]
  editing: boolean
  checked: Set<number>
  onCheck: (ids: Set<number>) => void
  // The row about the server not set, over the list.
  notice: { title: string; text: string; onPress: () => void } | null
  // Room under the list's end for what floats over it: the continue button, the edit bar.
  bottomInset: number
  onOpen: (row: HomeRow) => void
  menuOf: (row: HomeRow) => MenuItem[]
  onDelete: (row: HomeRow) => void
  onUngroup: (group: CharacterGroup) => void
  // From and to as a list that reorders by dragging gives them: `to` where the row ends up.
  onMove: (from: number, to: number) => void
  onDrop: (row: HomeRow, ids: number[]) => void
  onProvide: (token: string, kind: 'archive' | 'card', id: number) => void
}

const AVATAR = 56
const CLEAR = '#00000000'

export function NativeCharacterList({ rows, editing, checked, onCheck, notice, bottomInset, onOpen, menuOf, onDelete, onUngroup, onMove, onDrop, onProvide }: Props) {
  const { colors, scheme } = useTheme()
  const { t, locale } = useTranslation()
  const avatars = useRowAvatars(rows, colors.bg)
  const { Host, List, HStack, VStack, ZStack, Spacer, Text, Image, Button, SwipeActions } = nativeCharacterList!.ui
  const m = nativeCharacterList!.modifiers
  const secondary = { type: 'hierarchical', style: 'secondary' } as const
  // Rows of the list's own that are not characters: no separator, nothing behind them, never moved.
  const plainRow = [m.listRowBackground(CLEAR), m.listRowSeparator('hidden'), m.moveDisabled(true), m.deleteDisabled(true)]
  const spacer = (height: number, key: string) => (
    <ZStack key={key} modifiers={[m.frame({ height: Math.max(1, height) }), m.listRowInsets({ top: 0, leading: 0, bottom: 0, trailing: 0 }), ...plainRow]}>
      <Text> </Text>
    </ZStack>
  )

  const idsOf = (row: HomeRow) => (row.kind === 'group' ? row.members.map((c) => c.id) : [row.character.id])
  const selection = rows.filter((row) => idsOf(row).every((id) => checked.has(id))).map((row) => row.key)

  const onEvent = (row: HomeRow, menu: MenuItem[]) => (event: CardRowEvent) => {
    switch (event.event) {
      case 'menu': {
        let item: MenuItem | undefined = { label: '', children: menu }
        for (const index of event.path) item = item?.children?.[index]
        item?.onSelect?.()
        break
      }
      case 'provide':
        onProvide(event.token, event.kind, event.id)
        break
      case 'dragState':
        dragSession.active = event.active
        break
      case 'menuState':
        dragSession.menuOpen = event.open
        break
      case 'drop':
        onDrop(row, event.ids)
        break
    }
  }

  const renderRow = (row: HomeRow) => {
    const group = row.kind === 'group' ? row : null
    const character = row.kind === 'character' ? row.character : null
    const names = group ? group.members.map((c) => c.name).join(', ') : ''
    const name = group ? (group.group.name ?? names) : character!.name
    const line = group ? (group.group.name ? names : countLabel(group.members.length, 'character', locale)) : characterPreview(character!)
    const chats = group ? group.members.some((c) => c.chatCount > 0) : character!.chatCount > 0
    const last = group ? Math.max(...group.members.map((c) => c.lastActivity)) : character!.lastActivity
    const avatar = avatars[faceKey(facesOf(row))]
    const menu = menuOf(row)

    const content = (
      <HStack spacing={12}>
        {avatar ? (
          <Image uiImage={avatar} modifiers={[m.resizable(), m.frame({ width: AVATAR, height: AVATAR })]} />
        ) : (
          <ZStack modifiers={[m.frame({ width: AVATAR, height: AVATAR })]}>
            <Text> </Text>
          </ZStack>
        )}
        <VStack alignment="leading" spacing={3}>
          <HStack spacing={6}>
            <Text modifiers={[m.font({ textStyle: 'body', weight: 'semibold' }), m.lineLimit(1)]}>{name}</Text>
            <Spacer />
            {chats && !group ? (
              <Text modifiers={[m.font({ textStyle: 'subheadline' }), m.foregroundStyle(secondary), m.lineLimit(1)]}>{formatShortWhen(last, locale)}</Text>
            ) : null}
            {editing ? null : <Image systemName="chevron.right" size={13} color={colors.textFaint} />}
          </HStack>
          <Text modifiers={[m.font({ textStyle: 'subheadline' }), m.foregroundStyle(secondary), m.lineLimit(2)]}>{line}</Text>
        </VStack>
      </HStack>
    )

    // A long press, the drag and a drop belong to the row's cell (see CardRow.swift).
    const behavior = cardRow(
      {
        items: group ? group.members.map((c) => ({ id: c.id, name: c.name })) : [{ id: character!.id, name: character!.name }],
        menu: toEntries(menu),
        enabled: !editing,
        acceptsCards: true,
        // A group is no target for its own members.
        groupIds: group ? group.members.map((c) => c.id) : [],
        accentColor: colors.accent,
        shadeColor: colors.bg,
      },
      onEvent(row, menu)
    )
    const rowModifiers = [m.listRowBackground(CLEAR), m.listRowInsets({ top: 8, leading: 16, bottom: 8, trailing: 16 })]

    // In edit mode a tap ticks the row, so it is not a button, and the list's own drag moves it.
    if (editing) {
      return (
        <HStack key={row.key} modifiers={[m.tag(row.key), ...rowModifiers, behavior]}>
          {content}
        </HStack>
      )
    }
    return (
      // Out of edit mode the long press is the row's menu and drag, not the list's move.
      <SwipeActions key={row.key} modifiers={[m.tag(row.key), m.moveDisabled(true), ...rowModifiers]}>
        {/* The button paints its label in its tint: the name in the text's color, the lines under it a lighter shade. */}
        <Button onPress={unlessDragging(() => onOpen(row))} modifiers={[m.tint(colors.text), behavior]}>
          {content}
        </Button>
        {group ? (
          <SwipeActions.Actions edge="leading" allowsFullSwipe>
            <Button label={t('groups.ungroup')} systemImage="rectangle.stack.badge.minus" onPress={() => onUngroup(group.group)} modifiers={[m.tint(colors.accent)]} />
          </SwipeActions.Actions>
        ) : null}
        {/* Not the destructive role: with it the row leaves the list before the question is answered. */}
        <SwipeActions.Actions edge="trailing">
          <Button label={t('common.delete')} systemImage="trash" onPress={() => onDelete(row)} modifiers={[m.tint(colors.danger)]} />
        </SwipeActions.Actions>
      </SwipeActions>
    )
  }

  return (
    <Host style={styles.host} colorScheme={scheme} seedColor={colors.accent}>
      <List
        selection={selection}
        onSelectionChange={(keys) => {
          const picked = new Set(keys.map(String))
          onCheck(new Set(rows.filter((row) => picked.has(row.key)).flatMap(idsOf)))
        }}
        modifiers={[
          m.listStyle('plain'),
          m.scrollContentBackground('hidden'),
          m.tint(colors.accent),
          m.environment('editMode', editing ? 'active' : 'inactive'),
        ]}
      >
        {/* The list keeps the safe area; the header the screen draws over it takes this much more. */}
        {spacer(HEADER_ROW_HEIGHT, 'top')}
        {notice ? (
          <Button key="notice" onPress={notice.onPress} modifiers={[m.tint(colors.text), ...plainRow, m.listRowInsets({ top: 4, leading: 16, bottom: 12, trailing: 16 })]}>
            {/* As the "finish setting up" row of iOS Settings: a glyph on a colored tile, the text and a chevron. */}
            <HStack spacing={12}>
              <Image systemName="server.rack" size={15} color="#FFFFFF" modifiers={[m.frame({ width: 30, height: 30 }), m.background(colors.accent), m.clipShape('roundedRectangle', 7)]} />
              <VStack alignment="leading" spacing={2}>
                <Text modifiers={[m.font({ textStyle: 'subheadline', weight: 'semibold' })]}>{notice.title}</Text>
                <Text modifiers={[m.font({ textStyle: 'subheadline' }), m.foregroundStyle(secondary)]}>{notice.text}</Text>
              </VStack>
              <Spacer />
              <Image systemName="chevron.right" size={13} color={colors.textFaint} />
            </HStack>
          </Button>
        ) : null}
        <List.ForEach
          onMove={(sources, destination) => {
            const from = sources[0]
            if (from === undefined) return
            // The list counts the destination before the row is taken out.
            const to = destination > from ? destination - 1 : destination
            if (to !== from) onMove(from, to)
          }}
        >
          {rows.map(renderRow)}
        </List.ForEach>
        {spacer(bottomInset, 'bottom')}
      </List>
    </Host>
  )
}

const facesOf = (row: HomeRow): RowFace[] =>
  (row.kind === 'group' ? row.members.slice(0, 3) : [row.character]).map((c) => ({
    uri: c.avatar ? avatarUri(c.avatar) : null,
    letter: avatarInitial(c.name),
    tint: avatarTint(c.name),
  }))

const faceKey = (faces: RowFace[]) => faces.map((f) => `${f.uri ?? ''}|${f.letter}|${f.tint}`).join(';')

// The rows' pictures, drawn natively at the row's size the first time they are needed and
// then taken from the caches; a row without its picture yet keeps the room for it.
function useRowAvatars(rows: HomeRow[], ring: string) {
  const [ready, setReady] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    const scale = PixelRatio.get()
    for (const row of rows) {
      const faces = facesOf(row)
      const key = faceKey(faces)
      if (ready[key]) continue
      dragModule!
        .rowAvatar(faces, AVATAR, scale, ring)
        .then((uri) => {
          if (alive) setReady((prev) => ({ ...prev, [key]: uri }))
        })
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [rows, ring])
  return ready
}

const styles = StyleSheet.create({
  host: { flex: 1 },
})

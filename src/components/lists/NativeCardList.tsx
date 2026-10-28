import { useEffect, useState, useSyncExternalStore } from 'react'
import { PixelRatio, StyleSheet } from 'react-native'

import type { CharacterPreview } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { formatShortWhen } from '@/lib/core/format'
import { characterPreview } from '@/lib/chat/roleplay'
import { avatarUri } from '@/lib/images/avatarStore'
import { avatarInitial, avatarTint } from '@/lib/images/initial'
import { liftedSource, subscribeLifted, type ViewerOrigin } from '@/lib/images/viewer'
import { swiftUI } from '@/lib/ui/nativeUI'
import { HEADER_ROW_HEIGHT, useTheme } from '@/theme'

import { castGallery } from '../cast/AvatarStack'
import type { MenuItem } from '../overlays/NativeMenu'
import { useOpenViewer } from '../visuals/ImageLink'
import { toEntries, unlessDragging } from './DraggableCard'
import { cardRow, dragModule, dragSession, pictureTap, type CardRowEvent, type RowFace } from '../../../modules/reverie-drag'

// The system's list on iOS for the characters, a group's members and the rooms: a SwiftUI
// List as Messages draws its conversations, a face in a circle (or up to three of a group's
// or a room's cast), the name with the date of the last message and the message under it, the
// system's swipe and edit mode. A row still behaves as a card did (see CardRow.swift): the
// menu on a long press, the drag with other rows tapped into the stack, characters dropped on
// it. Null without SwiftUI and the drag module, where the screens keep their cards.
export const nativeCardList = swiftUI && dragModule ? swiftUI : null

export type NativeCardRow = {
  key: string
  // Whose faces the picture shows: the character, a group's members, a room's cast. A tap on
  // it opens their photos in the viewer.
  people: Person[]
  title: string
  // The date of the last message, if there is one.
  date: number | null
  line: string
  menu: MenuItem[]
  // What edit mode ticks with the row: one character, a group's members, a room.
  ids: number[]
  // The characters a drag lifts out of the row; none, and the row only has its menu.
  drags: { id: number; name: string }[]
  // Characters dropped on the row, when it takes them. `own` are no target for it: the
  // members of its own group.
  onDrop?: (ids: number[]) => void
  own?: number[]
  onOpen: () => void
  onDelete: () => void
  // An action behind a swipe from the other edge.
  leading?: { label: string; systemImage: string; onAction: () => void }
}

type Props = {
  rows: NativeCardRow[]
  editing: boolean
  checked: Set<number>
  onCheck: (ids: Set<number>) => void
  // A row about something to fix before the list, as Settings has for setting up.
  notice?: { title: string; text: string; symbol: string; onPress: () => void } | null
  // Room under the list's end for what floats over it: the continue button, the edit bar.
  bottomInset: number
  // From and to as a list that reorders by dragging gives them: `to` where the row ends up.
  onMove: (from: number, to: number) => void
  // The file a drop outside the app asked for, of a character dragged out of a row.
  onProvide?: (token: string, kind: 'archive' | 'card', id: number) => void
}

type Person = { name: string; avatar: string | null }

const AVATAR = 56
const CLEAR = '#00000000'

export function NativeCardList({ rows, editing, checked, onCheck, notice, bottomInset, onMove, onProvide }: Props) {
  const { colors, scheme } = useTheme()
  const { t, locale } = useTranslation()
  const avatars = useRowAvatars(rows, colors.bg)
  const openViewer = useOpenViewer()
  // The row whose picture is up in the viewer hides its own, which the photo lands back in.
  const lifted = useSyncExternalStore(subscribeLifted, liftedSource, () => null)
  const { Host, List, HStack, VStack, ZStack, Spacer, Text, Image, Button, SwipeActions, Circle } = nativeCardList!.ui
  const m = nativeCardList!.modifiers
  const secondary = { type: 'hierarchical', style: 'secondary' } as const
  // Rows of the list's own that are not cards: no separator, nothing behind them, never moved.
  const plainRow = [m.listRowBackground(CLEAR), m.listRowSeparator('hidden'), m.moveDisabled(true), m.deleteDisabled(true)]
  const spacer = (height: number, key: string) => (
    <ZStack key={key} modifiers={[m.frame({ height: Math.max(1, height) }), m.listRowInsets({ top: 0, leading: 0, bottom: 0, trailing: 0 }), ...plainRow]}>
      <Text> </Text>
    </ZStack>
  )

  const selection = rows.filter((row) => row.ids.length && row.ids.every((id) => checked.has(id))).map((row) => row.key)

  const onEvent = (row: NativeCardRow) => (event: CardRowEvent) => {
    switch (event.event) {
      case 'menu': {
        let item: MenuItem | undefined = { label: '', children: row.menu }
        for (const index of event.path) item = item?.children?.[index]
        item?.onSelect?.()
        break
      }
      case 'provide':
        onProvide?.(event.token, event.kind, event.id)
        break
      case 'dragState':
        dragSession.active = event.active
        break
      case 'menuState':
        dragSession.menuOpen = event.open
        break
      case 'drop':
        row.onDrop?.(event.ids)
        break
    }
  }

  const renderRow = (row: NativeCardRow) => {
    const faces = rowFaces(row.people)
    const avatar = avatars[faceKey(faces)]
    const gallery = castGallery(row.people)
    // Each photo grows out of its own face in the picture; one of a cast past the three shown has no place.
    const openPictures = (box: { x: number; y: number; width: number; height: number }) => {
      const shown = row.people.slice(0, 3)
      const spots = faceSpots(shown.length)
      const origins = gallery.map((image): ViewerOrigin | null => {
        const spot = spots[shown.findIndex((p) => p.avatar === image.avatar)]
        if (!spot) return null
        const side = spot.size * box.width
        return { x: box.x + spot.x * box.width, y: box.y + spot.y * box.height, width: side, height: side, radii: [side / 2, side / 2, side / 2, side / 2], continuous: false }
      })
      openViewer(gallery, 0, origins, origins.map((origin) => (origin ? row.key : null)))
    }
    const pictureModifiers = [
      m.resizable(),
      m.frame({ width: AVATAR, height: AVATAR }),
      ...(lifted === row.key ? [m.opacity(0)] : []),
      ...(gallery.length && !editing ? [pictureTap(openPictures)] : []),
    ]
    const content = (
      <HStack spacing={12}>
        {avatar ? (
          <Image uiImage={avatar} modifiers={pictureModifiers} />
        ) : (
          // No text in it: the list starts the separator under the row's first text, and keeps
          // it there once the picture comes.
          <Circle modifiers={[m.foregroundStyle(faces[0]?.tint ?? colors.surface), m.frame({ width: AVATAR, height: AVATAR })]} />
        )}
        <VStack alignment="leading" spacing={3}>
          <HStack spacing={6}>
            <Text modifiers={[m.font({ textStyle: 'body', weight: 'semibold' }), m.lineLimit(1)]}>{row.title}</Text>
            <Spacer />
            {row.date !== null ? (
              <Text modifiers={[m.font({ textStyle: 'subheadline' }), m.foregroundStyle(secondary), m.lineLimit(1)]}>{formatShortWhen(row.date, locale)}</Text>
            ) : null}
            {editing ? null : <Image systemName="chevron.right" size={13} color={colors.textFaint} />}
          </HStack>
          <Text modifiers={[m.font({ textStyle: 'subheadline' }), m.foregroundStyle(secondary), m.lineLimit(2)]}>{row.line}</Text>
        </VStack>
      </HStack>
    )

    // A long press, the drag and a drop belong to the row's cell (see CardRow.swift).
    const behavior = cardRow(
      {
        items: row.drags,
        menu: toEntries(row.menu),
        enabled: !editing,
        acceptsCards: !!row.onDrop,
        groupIds: row.own ?? [],
        accentColor: colors.accent,
        shadeColor: colors.bg,
      },
      onEvent(row)
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
        <Button onPress={unlessDragging(row.onOpen)} modifiers={[m.tint(colors.text), behavior]}>
          {content}
        </Button>
        {row.leading ? (
          <SwipeActions.Actions edge="leading" allowsFullSwipe>
            <Button label={row.leading.label} systemImage={row.leading.systemImage as never} onPress={row.leading.onAction} modifiers={[m.tint(colors.accent)]} />
          </SwipeActions.Actions>
        ) : null}
        {/* Not the destructive role: with it the row leaves the list before the question is answered. */}
        <SwipeActions.Actions edge="trailing">
          <Button label={t('common.delete')} systemImage="trash" onPress={row.onDelete} modifiers={[m.tint(colors.danger)]} />
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
          onCheck(new Set(rows.filter((row) => picked.has(row.key)).flatMap((row) => row.ids)))
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
              <Image systemName={notice.symbol as never} size={15} color="#FFFFFF" modifiers={[m.frame({ width: 30, height: 30 }), m.background(colors.accent), m.clipShape('roundedRectangle', 7)]} />
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

// A character's row: its face, its last message and its date, lifted alone in a drag.
export function characterRow(
  character: CharacterPreview,
  row: Pick<NativeCardRow, 'key' | 'menu' | 'onDrop' | 'own' | 'onOpen' | 'onDelete' | 'leading'>
): NativeCardRow {
  return {
    ...row,
    people: [character],
    title: character.name,
    date: character.chatCount > 0 ? character.lastActivity : null,
    line: characterPreview(character),
    ids: [character.id],
    drags: [{ id: character.id, name: character.name }],
  }
}

// The faces of characters, or of a room's cast, as a row draws them: up to three.
const rowFaces = (people: Person[]): RowFace[] =>
  people.slice(0, 3).map((c) => ({
    uri: c.avatar ? avatarUri(c.avatar) : null,
    letter: avatarInitial(c.name),
    tint: avatarTint(c.name),
  }))

// Where each face sits in the picture, in fractions of its side, as rowAvatar draws them
// (faceRects in CardRow.swift).
function faceSpots(count: number) {
  if (count === 2) return [{ x: 0, y: 0, size: 0.66 }, { x: 0.34, y: 0.34, size: 0.66 }]
  if (count === 3) return [{ x: 0.22, y: 0, size: 0.56 }, { x: 0, y: 0.44, size: 0.56 }, { x: 0.44, y: 0.44, size: 0.56 }]
  return [{ x: 0, y: 0, size: 1 }]
}

const faceKey = (faces: RowFace[]) => faces.map((f) => `${f.uri ?? ''}|${f.letter}|${f.tint}`).join(';')

// The rows' pictures, drawn natively at the row's size the first time they are needed and
// then taken from the caches; a row without its picture yet keeps the room for it.
function useRowAvatars(rows: NativeCardRow[], ring: string) {
  const [ready, setReady] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    const scale = PixelRatio.get()
    for (const row of rows) {
      const faces = rowFaces(row.people)
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

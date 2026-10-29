import { useEffect, useState, useSyncExternalStore } from 'react'
import { PixelRatio, StyleSheet } from 'react-native'

import type { CharacterPreview } from '@/db/characters'
import { LIST_CORNER_RANGE, useListLook, type ListLook } from '@/db/prefs/listLook'
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
  // An action beside the delete, at the end of the row, which a full swipe runs (a
  // character put in the archive, or brought back from it), as Mail's archive.
  trailing?: { label: string; systemImage: string; onAction: () => void }
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
  // Without it the rows keep their order (the archive, by when each was put there).
  onMove?: (from: number, to: number) => void
  // The file a drop outside the app asked for, of a character dragged out of a row.
  onProvide?: (token: string, kind: 'archive' | 'card', id: number) => void
}

type Person = { name: string; avatar: string | null }

const CLEAR = '#00000000'
// The system's grey, behind the white of a swipe's action in either scheme.
export const SYSTEM_GREY = '#8E8E93'

// The sizes of a row in each spacing: the compact one of the app, and the roomy one, a larger
// face a little further in, more room above and below, and always room for two lines.
function rowMetrics(look: ListLook) {
  return look.spacing === 'roomy'
    ? { avatar: 68, gap: 14, vertical: 12, leading: 20, textHeight: 62 }
    : { avatar: 56, gap: 12, vertical: 8, leading: 16, textHeight: 0 }
}

type Modifier = ReturnType<NonNullable<typeof nativeCardList>['modifiers']['opacity']>

type ContentProps = {
  title: string
  date: number | null
  line: string
  faces: RowFace[]
  // The faces drawn by rowFace, by faceKey; a face not drawn yet is its tint meanwhile.
  pictures: Record<string, string>
  // The background around a face laid over another.
  ring: string
  chevron: boolean
  pictureModifiers?: Modifier[]
}

// What a row shows, in the look set under Appearance: the face, the name with the date, and
// the line under it. The lists draw it, and so does the preview of Appearance. The faces are
// cut to their corners here rather than in the drawn files, so the corners follow the slider
// of Appearance as it moves.
export function useRowContent() {
  const { colors } = useTheme()
  const { locale } = useTranslation()
  const look = useListLook()
  const metrics = rowMetrics(look)
  const { HStack, VStack, ZStack, Spacer, Text, Image, Rectangle } = nativeCardList!.ui
  const m = nativeCardList!.modifiers
  const secondary = { type: 'hierarchical', style: 'secondary' } as const
  const side = metrics.avatar
  // A circle, or iOS's continuous corners, which a radius of half the side never quite makes round.
  const cut = (size: number): Modifier =>
    look.corner >= LIST_CORNER_RANGE.max ? m.clipShape('circle') : { ...m.clipShape('roundedRectangle', (size * look.corner) / 100), roundedCornerStyle: 'continuous' }
  // No text in a face that is not drawn yet: the list starts the separator under the row's
  // first text, and keeps it there once the picture comes.
  const face = (f: RowFace, size: number, pictures: Record<string, string>, extra: Modifier[]) => {
    const uri = pictures[faceKey([f])]
    const box = [m.frame({ width: size, height: size }), cut(size), ...extra]
    return uri ? <Image uiImage={uri} modifiers={[m.resizable(), ...box]} /> : <Rectangle modifiers={[m.foregroundStyle(f.tint), ...box]} />
  }
  const picture = (faces: RowFace[], pictures: Record<string, string>, ring: string, extra: Modifier[]) => {
    if (faces.length <= 1) return face(faces[0] ?? { letter: '?', tint: colors.surface }, side, pictures, extra)
    const spots = faceSpots(faces.length)
    const ringWidth = side * 0.03
    return (
      <ZStack alignment="topLeading" modifiers={[m.frame({ width: side, height: side, alignment: 'topLeading' }), ...extra]}>
        {faces.map((f, i) => {
          const spot = spots[i]
          const size = spot.size * side
          // A face over another stands off it by a thin ring of the background.
          const over = i > 0 ? [m.padding({ all: ringWidth }), m.background(ring), cut(size + 2 * ringWidth)] : []
          const shift = i > 0 ? ringWidth : 0
          return (
            <ZStack key={i} modifiers={[m.offset({ x: spot.x * side - shift, y: spot.y * side - shift })]}>
              {face(f, size, pictures, over)}
            </ZStack>
          )
        })}
      </ZStack>
    )
  }
  const render = ({ title, date, line, faces, pictures, ring, chevron, pictureModifiers = [] }: ContentProps) => (
    <HStack spacing={metrics.gap}>
      {picture(faces, pictures, ring, pictureModifiers)}
      <VStack alignment="leading" spacing={3} modifiers={metrics.textHeight ? [m.frame({ minHeight: metrics.textHeight, alignment: 'topLeading' })] : []}>
        <HStack spacing={6}>
          <Text modifiers={[m.font({ textStyle: 'body', weight: 'semibold' }), m.lineLimit(1)]}>{title}</Text>
          <Spacer />
          {date !== null ? (
            <Text modifiers={[m.font({ textStyle: 'subheadline' }), m.foregroundStyle(secondary), m.lineLimit(1)]}>{formatShortWhen(date, locale)}</Text>
          ) : null}
          {chevron ? <Image systemName="chevron.right" size={13} color={colors.textFaint} /> : null}
        </HStack>
        <Text modifiers={[m.font({ textStyle: 'subheadline' }), m.foregroundStyle(secondary), m.lineLimit(2)]}>{line}</Text>
      </VStack>
    </HStack>
  )
  return { look, metrics, render }
}

export function NativeCardList({ rows, editing, checked, onCheck, notice, bottomInset, onMove, onProvide }: Props) {
  const { colors, scheme } = useTheme()
  const { t } = useTranslation()
  const { look, metrics, render } = useRowContent()
  const pictures = useRowFaces(rows.map((row) => row.people))
  const openViewer = useOpenViewer()
  // The row whose picture is up in the viewer hides its own, which the photo lands back in.
  const lifted = useSyncExternalStore(subscribeLifted, liftedSource, () => null)
  const { Host, List, HStack, VStack, ZStack, Spacer, Text, Image, Button, SwipeActions } = nativeCardList!.ui
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
    const gallery = castGallery(row.people)
    // Each photo grows out of its own face in the picture; one of a cast past the three shown has no place.
    const openPictures = (box: { x: number; y: number; width: number; height: number }) => {
      const shown = row.people.slice(0, 3)
      const spots = faceSpots(shown.length)
      const origins = gallery.map((image): ViewerOrigin | null => {
        const spot = spots[shown.findIndex((p) => p.avatar === image.avatar)]
        if (!spot) return null
        const side = spot.size * box.width
        const radius = (side * look.corner) / 100
        return { x: box.x + spot.x * box.width, y: box.y + spot.y * box.height, width: side, height: side, radii: [radius, radius, radius, radius], continuous: look.corner < 50 }
      })
      openViewer(gallery, 0, origins, origins.map((origin) => (origin ? row.key : null)))
    }
    const content = render({
      title: row.title,
      date: row.date,
      line: row.line,
      faces,
      pictures,
      ring: colors.bg,
      chevron: !editing,
      pictureModifiers: [...(lifted === row.key ? [m.opacity(0)] : []), ...(gallery.length && !editing ? [pictureTap(openPictures)] : [])],
    })

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
    const rowModifiers = [m.listRowBackground(CLEAR), m.listRowInsets({ top: metrics.vertical, leading: metrics.leading, bottom: metrics.vertical, trailing: 16 })]

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
        {/* Not the destructive role: with it the row leaves the list before the question is answered.
            The first button sits at the very end, where a full swipe takes it. */}
        <SwipeActions.Actions edge="trailing">
          {row.trailing ? (
            <Button label={row.trailing.label} systemImage={row.trailing.systemImage as never} onPress={row.trailing.onAction} modifiers={[m.tint(SYSTEM_GREY)]} />
          ) : null}
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
          onMove={
            onMove
              ? (sources, destination) => {
                  const from = sources[0]
                  if (from === undefined) return
                  // The list counts the destination before the row is taken out.
                  const to = destination > from ? destination - 1 : destination
                  if (to !== from) onMove(from, to)
                }
              : undefined
          }
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
  row: Pick<NativeCardRow, 'key' | 'menu' | 'onDrop' | 'own' | 'onOpen' | 'onDelete' | 'leading' | 'trailing'>
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

// Where each face sits in a picture of several, in fractions of its side: two across the
// diagonal, three as a triangle.
function faceSpots(count: number) {
  if (count === 2) return [{ x: 0, y: 0, size: 0.66 }, { x: 0.34, y: 0.34, size: 0.66 }]
  if (count === 3) return [{ x: 0.22, y: 0, size: 0.56 }, { x: 0, y: 0.44, size: 0.56 }, { x: 0.44, y: 0.44, size: 0.56 }]
  return [{ x: 0, y: 0, size: 1 }]
}

const faceKey = (faces: RowFace[]) => faces.map((f) => `${f.uri ?? ''}|${f.letter}|${f.tint}`).join(';')

// The faces of the rows, each drawn natively at the row's size the first time it is needed
// and then taken from the caches, by faceKey. A face drawn at another size (the other
// spacing) stays up until the new one comes, rather than going blank.
function useRowFaces(people: Person[][]) {
  const side = rowMetrics(useListLook()).avatar
  const [drawn, setDrawn] = useState<Record<string, { uri: string; side: number }>>({})
  const faces = people.flatMap(rowFaces)
  const wanted = faces.map((f) => faceKey([f])).join(';;')
  useEffect(() => {
    let alive = true
    const scale = PixelRatio.get()
    for (const face of faces) {
      const key = faceKey([face])
      if (drawn[key]?.side === side) continue
      dragModule!
        .rowFace(face, side, scale)
        .then((uri) => {
          if (alive) setDrawn((prev) => ({ ...prev, [key]: { uri, side } }))
        })
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [wanted, side])
  return Object.fromEntries(Object.entries(drawn).map(([key, value]) => [key, value.uri]))
}

// Two rows as the lists draw them, a character and a group, for Appearance: rows of the
// settings' own list, in the look set there.
export function NativeListPreview() {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const { metrics, render } = useRowContent()
  const { HStack } = nativeCardList!.ui
  const { listRowInsets } = nativeCardList!.modifiers
  const now = Date.now()
  const samples = [
    { key: 'one', people: [{ name: t('listPreview.name'), avatar: null }], title: t('listPreview.name'), line: t('listPreview.line'), date: now },
    {
      key: 'group',
      people: [{ name: t('listPreview.member1'), avatar: null }, { name: t('listPreview.member2'), avatar: null }],
      title: t('listPreview.groupName'),
      line: `${t('listPreview.member1')}, ${t('listPreview.member2')}`,
      date: null,
    },
  ]
  const pictures = useRowFaces(samples.map((sample) => sample.people))
  return samples.map((sample) => {
    const faces = rowFaces(sample.people)
    return (
      <HStack key={sample.key} modifiers={[listRowInsets({ top: metrics.vertical, leading: metrics.leading, bottom: metrics.vertical, trailing: 16 })]}>
        {render({ title: sample.title, date: sample.date, line: sample.line, faces, pictures, ring: colors.surface, chevron: true })}
      </HStack>
    )
  })
}

const styles = StyleSheet.create({
  host: { flex: 1 },
})


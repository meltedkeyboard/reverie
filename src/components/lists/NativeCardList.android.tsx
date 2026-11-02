import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ReorderableList, { useReorderableDrag } from 'react-native-reorderable-list'

import { Avatar } from '@/components/visuals/Avatar'
import { Icon } from '@/components/visuals/Icon'
import { SFIcon } from '@/components/visuals/SFIcon'
import { castGallery } from '../cast/AvatarStack'
import { useOpenViewer } from '../visuals/ImageLink'
import { SwipeToDelete } from './SwipeToDelete'
import { unlessDragging } from './DraggableCard'
import type { MenuItem } from '../overlays/NativeMenu'
import type { CharacterPreview } from '@/db/characters'
import { characterPreview } from '@/lib/chat/roleplay'
import { useListLook, type ListLook } from '@/db/prefs/listLook'
import { formatShortWhen } from '@/lib/core/format'
import { withAlpha } from '@/lib/core/color'
import { isConfirmDeleteOn } from '@/lib/settings/confirmDelete'
import { showSheet } from '@/lib/ui/dialogs'
import { useTranslation } from '@/i18n'
import { HEADER_ROW_HEIGHT, useColors, useStyles, type Colors } from '@/theme'

export const nativeCardList = true

export const SYSTEM_GREY = '#8E8E93'

export type NativeCardRow = {
  key: string
  people: Person[]
  title: string
  mark?: string
  date: number | null
  line: string
  menu: MenuItem[]
  ids: number[]
  drags: { id: number; name: string }[]
  onDrop?: (ids: number[]) => void
  own?: number[]
  onOpen: () => void
  onDelete: () => void
  leading?: { label: string; systemImage: string; onAction: () => void }
  trailing?: { label: string; systemImage: string; onAction: () => void }
}

type Person = { name: string; avatar: string | null }

type Props = {
  rows: NativeCardRow[]
  editing: boolean
  checked: Set<number>
  onCheck: (ids: Set<number>) => void
  notice?: { title: string; text: string; symbol: string; onPress: () => void } | null
  bottomInset: number
  onMove?: (from: number, to: number) => void
  onProvide?: (token: string, kind: 'archive' | 'card', id: number) => void
}

function rowMetrics(look: ListLook) {
  return look.spacing === 'roomy'
    ? { avatar: 68, gap: 14, vertical: 12, leading: 16 }
    : { avatar: 56, gap: 12, vertical: 8, leading: 16 }
}

function faceSpots(count: number) {
  if (count === 2) return [{ x: 0, y: 0, size: 0.66 }, { x: 0.34, y: 0.34, size: 0.66 }]
  if (count === 3) return [{ x: 0.22, y: 0, size: 0.56 }, { x: 0, y: 0.44, size: 0.56 }, { x: 0.44, y: 0.44, size: 0.56 }]
  return [{ x: 0, y: 0, size: 1 }]
}

function leadingIcon(symbol: string): React.ComponentProps<typeof Icon>['name'] {
  switch (symbol) {
    case 'plus.square.on.square':
      return 'copy-outline'
    case 'rectangle.stack.badge.minus':
      return 'albums-outline'
    case 'minus.circle':
      return 'remove-circle-outline'
    case 'star':
    case 'star.fill':
      return 'star-outline'
    case 'star.slash':
      return 'star-outline'
    default:
      return 'copy-outline'
  }
}

type RowItemProps = {
  row: NativeCardRow
  editing: boolean
  checked: boolean
  onToggle: () => void
  isLast: boolean
}

function NativeCardRowItem({ row, editing, checked, onToggle, isLast }: RowItemProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t, locale } = useTranslation()
  const look = useListLook()
  const metrics = rowMetrics(look)
  const drag = useReorderableDrag()
  const openViewer = useOpenViewer()

  const side = metrics.avatar
  const cornerRadius = (side * look.corner) / 100
  const people = row.people
  const gallery = castGallery(people)

  const openPhotos = () => {
    if (!editing && gallery.length > 0) openViewer(gallery, 0)
  }

  const spots = faceSpots(people.length)
  const ringWidth = Math.max(1.5, Math.round(side * 0.03))

  const avatarBox = people.length <= 1 ? (
    <View style={{ width: side, height: side }}>
      <Avatar
        name={people[0]?.name ?? '?'}
        file={people[0]?.avatar}
        size={side}
        corners={cornerRadius}
        viewable={!editing}
      />
    </View>
  ) : (
    <Pressable
      onPress={openPhotos}
      disabled={editing || gallery.length === 0}
      style={{ width: side, height: side }}
    >
      {people.slice(0, 3).map((person, idx) => {
        const spot = spots[idx]
        const faceSize = spot.size * side
        const faceRadius = (faceSize * look.corner) / 100
        const shift = idx > 0 ? ringWidth : 0
        return (
          <View
            key={idx}
            style={[
              {
                position: 'absolute',
                top: spot.y * side - shift,
                left: spot.x * side - shift,
                width: faceSize + (idx > 0 ? ringWidth * 2 : 0),
                height: faceSize + (idx > 0 ? ringWidth * 2 : 0),
                borderRadius: faceRadius + (idx > 0 ? ringWidth : 0),
                overflow: 'hidden',
                zIndex: idx === 0 ? 1 : 2,
              },
              idx > 0 && {
                borderWidth: ringWidth,
                borderColor: colors.bg,
              },
            ]}
          >
            <Avatar
              name={person.name}
              file={person.avatar}
              size={faceSize}
              corners={faceRadius}
              viewable={false}
            />
          </View>
        )
      })}
    </Pressable>
  )

  const onLongPress = () => {
    if (editing) {
      drag()
    } else if (row.menu.length > 0) {
      showSheet(row.title, row.menu)
    }
  }

  const rowPressable = (
    <Pressable
      onPress={editing ? onToggle : unlessDragging(row.onOpen)}
      onLongPress={onLongPress}
      delayLongPress={260}
      style={({ pressed }) => [
        styles.rowPressable,
        {
          paddingVertical: metrics.vertical,
          paddingLeft: metrics.leading,
          paddingRight: 16,
        },
        pressed && !editing && styles.rowPressed,
      ]}
    >
      {editing ? (
        <Pressable onPress={onToggle} hitSlop={8} style={styles.check}>
          <SFIcon
            name={checked ? 'checkmark.circle.fill' : 'circle'}
            fallback={checked ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={checked ? colors.accent : colors.textFaint}
            animateChange
            changeResponse={0.18}
          />
        </Pressable>
      ) : null}

      {avatarBox}

      <View style={[styles.textColumn, { marginLeft: metrics.gap }]}>
        <View style={styles.topLine}>
          <Text style={styles.title} numberOfLines={1}>
            {row.title}
          </Text>
          {row.mark ? (
            <View style={styles.mark}>
              <SFIcon
                name={row.mark as never}
                fallback="star"
                size={12}
                color={colors.accent}
              />
            </View>
          ) : null}
          <View style={styles.spacer} />
          {row.date !== null ? (
            <Text style={styles.date} numberOfLines={1}>
              {formatShortWhen(row.date, locale)}
            </Text>
          ) : null}
          {!editing ? (
            <View style={styles.chevron}>
              <SFIcon
                name="chevron.right"
                fallback="chevron-forward"
                size={13}
                color={colors.textFaint}
              />
            </View>
          ) : null}
        </View>
        <Text style={styles.line} numberOfLines={2}>
          {row.line}
        </Text>
      </View>

      {editing ? (
        <Pressable onPressIn={drag} hitSlop={12} style={styles.dragHandle}>
          <Icon name="reorder-three-outline" size={24} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </Pressable>
  )

  const separatorInset = metrics.leading + (editing ? 22 + 12 : 0) + side + metrics.gap

  return (
    <View style={styles.itemWrapper}>
      {editing ? (
        rowPressable
      ) : (
        <SwipeToDelete
          radius={0}
          label={row.trailing?.label ?? t('common.delete')}
          actionLabel={row.trailing?.label}
          actionIcon={row.trailing ? (row.trailing.systemImage === 'archivebox' ? 'archive-outline' : 'trash') : 'trash'}
          actionIconSF={row.trailing ? (row.trailing.systemImage as never) : 'trash'}
          actionColor={row.trailing ? SYSTEM_GREY : colors.danger}
          onDelete={row.trailing?.onAction ?? row.onDelete}
          throwAway={row.trailing ? true : !isConfirmDeleteOn()}
          leading={
            row.leading
              ? {
                  label: row.leading.label,
                  icon: leadingIcon(row.leading.systemImage),
                  color: colors.accent,
                  onAction: row.leading.onAction,
                }
              : undefined
          }
          disabled={editing}
        >
          {rowPressable}
        </SwipeToDelete>
      )}
      {!isLast ? <View style={[styles.separator, { marginLeft: separatorInset }]} /> : null}
    </View>
  )
}

export function NativeCardList({
  rows,
  editing,
  checked,
  onCheck,
  notice,
  bottomInset,
  onMove,
}: Props) {
  const insets = useSafeAreaInsets()
  const styles = useStyles(createStyles)
  const colors = useColors()

  const isRowChecked = (row: NativeCardRow) =>
    row.ids.length > 0 && row.ids.every((id) => checked.has(id))

  const toggleRow = (row: NativeCardRow) => {
    const next = new Set(checked)
    const isChecked = isRowChecked(row)
    for (const id of row.ids) {
      if (isChecked) next.delete(id)
      else next.add(id)
    }
    onCheck(next)
  }

  const noticeHeader = notice ? (
    <Pressable
      onPress={notice.onPress}
      style={({ pressed }) => [styles.notice, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.noticeTile}>
        <SFIcon name={notice.symbol as never} fallback="server" size={15} color="#FFFFFF" />
      </View>
      <View style={styles.noticeBody}>
        <Text style={styles.noticeTitle}>{notice.title}</Text>
        <Text style={styles.noticeText}>{notice.text}</Text>
      </View>
      <SFIcon name="chevron.right" fallback="chevron-forward" size={14} color={colors.textFaint} />
    </Pressable>
  ) : undefined

  return (
    <ReorderableList
      data={rows}
      keyExtractor={(row) => row.key}
      onReorder={({ from, to }) => onMove?.(from, to)}
      contentContainerStyle={[
        styles.listContent,
        {
          paddingTop: insets.top + HEADER_ROW_HEIGHT + 8,
          paddingBottom: insets.bottom + bottomInset + 16,
        },
      ]}
      ListHeaderComponent={noticeHeader}
      renderItem={({ item: row, index }) => (
        <NativeCardRowItem
          row={row}
          editing={editing}
          checked={isRowChecked(row)}
          onToggle={() => toggleRow(row)}
          isLast={index === rows.length - 1}
        />
      )}
    />
  )
}

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

export function useRowContent() {
  const look = useListLook()
  const metrics = rowMetrics(look)
  return { look, metrics }
}

export function NativeListPreview() {
  const { t } = useTranslation()
  const now = Date.now()
  const samples: NativeCardRow[] = [
    {
      key: 'one',
      people: [{ name: t('listPreview.name'), avatar: null }],
      title: t('listPreview.name'),
      line: t('listPreview.line'),
      date: now,
      menu: [],
      ids: [],
      drags: [],
      onOpen: () => {},
      onDelete: () => {},
    },
    {
      key: 'group',
      people: [
        { name: t('listPreview.member1'), avatar: null },
        { name: t('listPreview.member2'), avatar: null },
      ],
      title: t('listPreview.groupName'),
      line: `${t('listPreview.member1')}, ${t('listPreview.member2')}`,
      date: null,
      menu: [],
      ids: [],
      drags: [],
      onOpen: () => {},
      onDelete: () => {},
    },
  ]

  return (
    <View style={styles.previewContainer}>
      {samples.map((sample, index) => (
        <NativeCardRowItem
          key={sample.key}
          row={sample}
          editing={false}
          checked={false}
          onToggle={() => {}}
          isLast={index === samples.length - 1}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  previewContainer: {
    overflow: 'hidden',
  },
})

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    listContent: {
      flexGrow: 1,
    },
    itemWrapper: {
      width: '100%',
    },
    rowPressable: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    rowPressed: {
      backgroundColor: withAlpha(colors.text, 0.08),
    },
    check: {
      marginRight: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textColumn: {
      flex: 1,
      justifyContent: 'center',
    },
    topLine: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
      flexShrink: 1,
    },
    mark: {
      marginLeft: 4,
    },
    spacer: {
      flex: 1,
      minWidth: 8,
    },
    date: {
      fontSize: 14,
      color: colors.textMuted,
      paddingLeft: 4,
    },
    chevron: {
      marginLeft: 6,
    },
    dragHandle: {
      marginLeft: 12,
      padding: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    line: {
      fontSize: 14,
      lineHeight: 19,
      color: colors.textMuted,
      marginTop: 3,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    noticeTile: {
      width: 30,
      height: 30,
      borderRadius: 7,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noticeBody: {
      flex: 1,
    },
    noticeTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    noticeText: {
      fontSize: 13,
      color: colors.textMuted,
    },
  })

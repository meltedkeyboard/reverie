import { useCallback, useRef } from 'react'
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, View, type ViewInstance } from 'react-native'
import ReorderableList, { useReorderableDrag, type ReorderableListDragEndEvent } from 'react-native-reorderable-list'
import { scheduleOnRN } from 'react-native-worklets'

import type { GalleryItem } from '@/db/gallery'
import { reorderFeel } from '@/hooks/features/useReorder'
import { useGallery } from '@/hooks/features/useGallery'
import { useTranslation } from '@/i18n'
import { galleryUri, isGalleryVideo } from '@/lib/images/gallery'
import { originOf, type ViewerOrigin } from '@/lib/images/viewer'
import { PRESS_ANYWHERE } from '@/lib/ui/press'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { ON_ACCENT, useColors, useStyles, type Colors } from '@/theme'

import { ListSection } from '../lists/GroupedList'
import { ImageSourceMenu } from '../overlays/ImageSourceMenu'
import { Icon } from '../visuals/Icon'
import { useLifted, useOpenViewer } from '../visuals/ImageLink'
import { Picture } from '../visuals/Picture'

// The row is as tall as its most upright item would be at this width, between the two
// bounds, and every tile keeps its own shape at that height; a wide panorama stops at the
// widest and is cropped.
const TILE = 112
const MAX_HEIGHT = 180
const MAX_WIDTH = 240
const TILE_RADIUS = 14

// The pictures and videos of a character's profile, in a row the user puts in order: a tap
// opens one in the viewer and swipes through all of them from there, a long press lifts one to
// move it, and one let go where it was lifted asks to be taken out. The plus at the end of the
// row adds more. `system` draws the header as the system's list beside it does.
export function ProfileGallery({ characterId, system = false }: { characterId: number; system?: boolean }) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const { items, adding, add, remove, reorder, measured } = useGallery(characterId)
  const openViewer = useOpenViewer()
  // The tiles on screen by item, measured as one is tapped so each picture grows out of its
  // own and lands back in it; one scrolled out of the row (or never laid out by the list) has
  // no place and comes and goes with a fade.
  const tiles = useRef(new Map<number, ViewInstance>())
  const height = rowHeight(items)

  const open = async (id: number) => {
    const index = Math.max(0, items.findIndex((item) => item.id === id))
    const origins = await Promise.all(items.map((item) => placeOf(tiles.current.get(item.id) ?? null)))
    openViewer(
      items.map((item) => ({ uri: galleryUri(item.file), aspect: aspectOf(item) })),
      index,
      origins,
      items.map((item, i) => (origins[i] ? sourceOf(item) : null))
    )
  }

  const confirmRemove = (item: GalleryItem) => {
    confirmDeletion({
      title: t(isGalleryVideo(item.file) ? 'gallery.removeVideoTitle' : 'gallery.removePictureTitle'),
      message: t('gallery.removeMessage'),
      onConfirm: () => remove(item),
    })
  }

  // Read when a drop comes back from the UI thread, by which time the list may have changed.
  const latest = useRef({ items, confirmRemove })
  latest.current = { items, confirmRemove }
  const askRemove = useCallback((index: number) => {
    const item = latest.current.items[index]
    if (item) latest.current.confirmRemove(item)
  }, [])
  // The same from render to render, as the list hands it to every cell. A tile put down
  // where it was picked up was held, not moved: that asks to take it out.
  const onDragEnd = useCallback(
    ({ from, to }: ReorderableListDragEndEvent) => {
      'worklet'
      reorderFeel.onDragEnd()
      if (from === to) scheduleOnRN(askRemove, from)
    },
    [askRemove]
  )

  const square = { width: Math.min(TILE, height), height }
  const footer = (
    <View style={styles.footer}>
      {adding ? (
        <View style={[styles.tile, styles.busy, square]}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : null}
      <ImageSourceMenu onPick={add} disabled={adding} style={styles.tileBox}>
        <View style={[styles.tile, styles.plus, square]} accessible accessibilityRole="button" accessibilityLabel={t('gallery.add')}>
          <Icon name="add" size={28} color={colors.textMuted} />
        </View>
      </ImageSourceMenu>
    </View>
  )

  return (
    <ListSection header={t('gallery.title')} plainHeader={system}>
      {items.length ? (
        <ReorderableList
          horizontal
          data={items}
          keyExtractor={(item) => String(item.id)}
          onReorder={({ from, to }) => reorder(from, to)}
          {...reorderFeel}
          onDragEnd={onDragEnd}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
          ListFooterComponent={footer}
          renderItem={({ item }) => (
            <GalleryTile
              item={item}
              height={height}
              register={(node) => {
                if (node) tiles.current.set(item.id, node)
                else tiles.current.delete(item.id)
              }}
              onOpen={() => open(item.id)}
              onRemove={() => confirmRemove(item)}
              onVideoSize={(size) => measured(item, size.width, size.height)}
            />
          )}
        />
      ) : (
        <View style={styles.strip}>{footer}</View>
      )}
    </ListSection>
  )
}

type TileProps = {
  item: GalleryItem
  height: number
  register: (node: ViewInstance | null) => void
  onOpen: () => void
  onRemove: () => void
  onVideoSize: (size: { width: number; height: number }) => void
}

function GalleryTile({ item, height, register, onOpen, onRemove, onVideoSize }: TileProps) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const drag = useReorderableDrag()
  const uri = galleryUri(item.file)
  const video = isGalleryVideo(item.file)
  // Away while its picture is up in the viewer, which puts it back here on closing.
  const lifted = useLifted(sourceOf(item))
  const size = { width: Math.min(MAX_WIDTH, Math.round(height * aspectOf(item))), height }
  return (
    <View style={styles.tileBox}>
      <Pressable
        ref={register}
        onPress={onOpen}
        onLongPress={drag}
        pressRetentionOffset={PRESS_ANYWHERE}
        accessibilityRole="imagebutton"
        accessibilityLabel={t(video ? 'gallery.openVideo' : 'gallery.openPicture')}
        // VoiceOver has no long press to drop a tile in place, so taking it out is an action.
        accessibilityActions={[{ name: 'delete', label: t('common.delete') }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'delete') onRemove()
        }}
        style={({ pressed }) => [styles.tile, size, pressed && { opacity: 0.8 }, lifted && { opacity: 0 }]}
      >
        {/* A video stands still on its first frame here; it plays in the viewer. */}
        <Picture uri={uri} style={size} paused={video} transition={150} onVideoSize={video && !(item.width && item.height) ? onVideoSize : undefined} />
        {video ? (
          <View style={styles.play} pointerEvents="none">
            <Icon name="play" size={13} color={ON_ACCENT} />
          </View>
        ) : null}
      </Pressable>
    </View>
  )
}

const aspectOf = (item: GalleryItem) => (item.width && item.height ? item.width / item.height : 1)

function rowHeight(items: GalleryItem[]) {
  const upright = Math.min(1, ...items.map(aspectOf))
  return Math.min(MAX_HEIGHT, Math.round(TILE / upright))
}

// What a tile is known by while its picture is up in the viewer.
const sourceOf = (item: GalleryItem) => `gallery:${item.id}`

// Where a tile sits in the window, or null for one off the screen.
function placeOf(node: ViewInstance | null) {
  return new Promise<ViewerOrigin | null>((resolve) => {
    if (!node) return resolve(null)
    node.measureInWindow((x, y, width, height) => {
      const window = Dimensions.get('window')
      const shown = width > 0 && height > 0 && x + width > 0 && y + height > 0 && x < window.width && y < window.height
      resolve(shown ? originOf({ x, y, width, height }, { topLeft: TILE_RADIUS, topRight: TILE_RADIUS, bottomRight: TILE_RADIUS, bottomLeft: TILE_RADIUS, continuous: true }) : null)
    })
  })
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    strip: { paddingHorizontal: 10, paddingVertical: 12 },
    // Room around the tile, for it to grow into as it is lifted.
    tileBox: { padding: 6 },
    footer: { flexDirection: 'row' },
    tile: {
      borderRadius: TILE_RADIUS,
      borderCurve: 'continuous',
      overflow: 'hidden',
      backgroundColor: colors.surfaceRaised,
    },
    busy: { margin: 6, alignItems: 'center', justifyContent: 'center' },
    plus: { alignItems: 'center', justifyContent: 'center' },
    play: {
      position: 'absolute',
      left: 8,
      bottom: 8,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 2,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
  })

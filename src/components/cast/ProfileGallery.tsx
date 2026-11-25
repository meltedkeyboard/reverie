import { Image, useImage, type ImageRef } from 'expo-image'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { ActivityIndicator, Dimensions, PixelRatio, Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import type { GalleryItem } from '@/db/gallery'
import { useGalleryLayout } from '@/db/prefs/galleryLook'
import { reorderFeel } from '@/hooks/features/useReorder'
import { useGallery } from '@/hooks/features/useGallery'
import { useTranslation } from '@/i18n'
import { isWeb } from '@/lib/core/platform'
import { galleryUri, isGalleryStill, isGalleryVideo } from '@/lib/images/gallery'
import { originOf, type Corners } from '@/lib/images/viewer'
import { confirmDeletion } from '@/lib/settings/confirmDelete'
import { ON_ACCENT, useColors, useStyles, type Colors } from '@/theme'

import { GROUP_CORNERS, ListSection } from '../lists/GroupedList'
import { SourceCell } from '../lists/PictureCells'
import { ImageSourceMenu } from '../overlays/ImageSourceMenu'
import { clamp, spring } from '../viewer/motion'
import { Icon } from '../visuals/Icon'
import { useLifted, useOpenViewer } from '../visuals/ImageLink'
import { Picture } from '../visuals/Picture'
import { SFIcon } from '../visuals/SFIcon'

// Square tiles three to a row with a hairline of the group between them, as in Photos; each
// picture fills its square and is cropped to it.
const COLUMNS = 3
const GAP = 2
// How long a finger rests on a tile before it lifts, about the system's long press.
const LIFT_DELAY = 350
// A lifted tile grows a little, as an app icon picked up on the home screen.
const LIFTED_SCALE = 1.08
// Tiles move aside, and a dropped one lands, quickly and without a bounce.
const SETTLE = spring(0.35, 0.9)

// Carousel height stays within portrait-to-landscape bounds so mixed shapes don't jolt the page.
const CAROUSEL_MIN_ASPECT = 0.65
const CAROUSEL_MAX_ASPECT = 2.2

// The pictures and videos of a character's profile, shown either as a reorderable grid or as a
// full-width horizontally swipeable carousel (chosen in Settings): a tap opens one in the
// viewer where the bin deletes it. A single item spans the full width at its own aspect ratio
// with the add button below in both modes. `onDragging` says while a grid tile is in the air,
// for the page to hold its scroll still. `system` draws the header as the system's list beside
// it does.
export function ProfileGallery({
  characterId,
  system = false,
  color,
  onDragging,
}: {
  characterId: number
  system?: boolean
  color?: string
  onDragging?: (dragging: boolean) => void
}) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const galleryLayout = useGalleryLayout()
  const { items, adding, add, remove, reorder, measured } = useGallery(characterId)
  const openViewer = useOpenViewer()
  const [width, setWidth] = useState(0)
  const [page, setPage] = useState(0)
  const [jump, setJump] = useState<{ index: number; animated: boolean; tick: number } | null>(null)
  const carouselPage = useRef(0)
  const addedFrom = useRef<number | null>(null)
  const cell = width ? (width - GAP * (COLUMNS - 1)) / COLUMNS : 0
  // The place of each item in the grid by its id, on the UI thread, where a lifted tile moves
  // the others as it passes over them; it is set again from the list whenever that changes.
  const slots = useSharedValue<Record<number, number>>({})
  useEffect(() => {
    slots.value = Object.fromEntries(items.map((item, i) => [item.id, i]))
  }, [items, slots])
  // The still pictures as their tiles decoded them, which the viewer shows from its first frame
  // while it reads the whole files.
  const previews = useRef(new Map<number, ImageRef>())
  const setPreview = useCallback((id: number, preview: ImageRef | null) => {
    if (preview) previews.current.set(id, preview)
    else previews.current.delete(id)
  }, [])
  // The grid is measured as a tile is tapped and the place of every tile worked out from it,
  // rather than each tile measured where its transform has moved it, so each picture grows
  // out of its own tile and lands back in it, rounded where the tile fills a corner of the group.
  const grid = useRef<ViewInstance>(null)
  // Where the grid was as the viewer opened from it: nothing on the page moves while the viewer
  // is up, so the tiles' places after one is deleted there are worked out from it.
  const gridAt = useRef<{ x: number; y: number } | null>(null)

  const carousel = galleryLayout === 'carousel' && items.length > 1

  const jumpTo = useCallback((index: number, animated: boolean) => {
    carouselPage.current = index
    setPage(index)
    setJump((prev) => ({ index, animated, tick: (prev?.tick ?? 0) + 1 }))
  }, [])

  const onPageChange = useCallback((next: number) => {
    carouselPage.current = next
    setPage(next)
  }, [])

  const addItems = async (source: Parameters<typeof add>[0]) => {
    addedFrom.current = items.length
    await add(source)
  }

  useEffect(() => {
    const start = addedFrom.current
    if (start !== null) {
      if (items.length > start) {
        addedFrom.current = null
        if (galleryLayout === 'carousel' && items.length > 1) jumpTo(start, true)
      } else if (!adding) {
        addedFrom.current = null
      }
    } else if (items.length > 0 && carouselPage.current >= items.length) {
      jumpTo(items.length - 1, false)
    } else if (items.length <= 1 && carouselPage.current !== 0) {
      carouselPage.current = 0
      setPage(0)
    }
  }, [items.length, adding, galleryLayout, jumpTo])

  // Read when the viewer or a drop comes back, by which time the list may have changed.
  const latest = useRef({ items, width, cell, galleryLayout, remove, reorder, onDragging, jumpTo })
  latest.current = { items, width, cell, galleryLayout, remove, reorder, onDragging, jumpTo }

  // The viewer's bin: the item goes at once, the tiles after it close up under the viewer, and
  // the viewer is told where the ones left now sit, to land the one it shows in its own.
  const removeFromViewer = (index: number) => {
    const { items, width, cell, galleryLayout, remove, jumpTo } = latest.current
    const item = items[index]
    if (!item) return []
    remove(item)
    const at = gridAt.current
    const left = items.filter((_, i) => i !== index)
    if (!left.length) return []
    const next = Math.min(index, left.length - 1)
    if (galleryLayout === 'carousel') jumpTo(next, false)
    return at && width && cell ? placesOf(left, at, width, cell, false, galleryLayout, next) : []
  }

  const open = (id: number) => {
    const index = Math.max(0, items.findIndex((item) => item.id === id))
    const images = items.map((item) => ({ uri: galleryUri(item.file), aspect: aspectOf(item), preview: previews.current.get(item.id) ?? null }))
    const node = grid.current
    if (!node || !width || !cell) return openViewer(images, index, [], [], removeFromViewer)
    node.measureInWindow((x, y) => {
      gridAt.current = { x, y }
      const origins = placesOf(items, { x, y }, width, cell, adding, galleryLayout, index)
      openViewer(images, index, origins, items.map((item, i) => (origins[i] ? sourceOf(item) : null)), removeFromViewer)
    })
  }

  // For VoiceOver, which has the viewer's bin too but can take a tile out from the grid.
  const confirmRemove = (item: GalleryItem) => {
    confirmDeletion({
      title: t(isGalleryVideo(item.file) ? 'gallery.removeVideoTitle' : 'gallery.removePictureTitle'),
      message: t('gallery.removeMessage'),
      onConfirm: () => remove(item),
    })
  }

  const dragging = useCallback((lifted: boolean) => latest.current.onDragging?.(lifted), [])
  const dropped = useCallback((from: number, to: number) => {
    if (from !== to) latest.current.reorder(from, to)
  }, [])

  const { single, button, extra, cells } = layoutOf(items.length, adding, carousel)
  const rows = Math.ceil(cells / COLUMNS)
  const height = !width
    ? 0
    : single
      ? width / aspectOf(items[0])
      : carousel
        ? undefined
        : rows * cell + (rows - 1) * GAP
  const next = placeAt(items.length, cell)
  const nextStyle = [styles.cell, { width: cell, height: cell, left: next.x, top: next.y }]

  return (
    <ListSection header={t('gallery.title')} plainHeader={system}>
      {cells ? (
        <View ref={grid} style={height !== undefined ? { height } : undefined} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width ? (
            single ? (
              <SingleGalleryItem
                item={items[0]}
                width={width}
                height={height!}
                onPreview={setPreview}
                onOpen={() => open(items[0].id)}
                onRemove={() => confirmRemove(items[0])}
                onVideoSize={(size) => measured(items[0], size.width, size.height)}
              />
            ) : carousel ? (
              <GalleryCarousel
                items={items}
                width={width}
                page={page}
                jump={jump}
                onPageChange={onPageChange}
                onPreview={setPreview}
                onOpen={open}
                onRemove={confirmRemove}
                onVideoSize={(item, size) => measured(item, size.width, size.height)}
              />
            ) : (
              items.map((item) => (
                <GalleryTile
                  key={item.id}
                  item={item}
                  cell={cell}
                  count={items.length}
                  slots={slots}
                  onPreview={setPreview}
                  onOpen={() => open(item.id)}
                  onRemove={() => confirmRemove(item)}
                  onDragging={dragging}
                  onDrop={dropped}
                  onVideoSize={(size) => measured(item, size.width, size.height)}
                />
              ))
            )
          ) : null}
          {cell && extra ? (
            button ? (
              // New ones coming in under full rows: a row of their own is starting anyway.
              <View style={[nextStyle, styles.plusInner]}>
                <ActivityIndicator color={colors.textMuted} />
              </View>
            ) : (
              <ImageSourceMenu onPick={addItems} disabled={adding} style={nextStyle}>
                <View style={styles.plusInner} accessible accessibilityRole="button" accessibilityLabel={t('gallery.add')}>
                  {adding ? <ActivityIndicator color={color ?? colors.textMuted} /> : <Icon name="add" size={30} color={color ?? colors.textMuted} />}
                </View>
              </ImageSourceMenu>
            )
          ) : null}
        </View>
      ) : (
        // Nothing yet: what goes here, in the middle of where the first row of tiles will stand.
        <View
          style={[styles.empty, cell ? { height: cell } : null]}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityLabel={t('gallery.empty')}
        >
          <SFIcon name="photo.on.rectangle.angled" fallback="images-outline" size={28} color={colors.textFaint} />
          <Text style={styles.emptyText}>{t('gallery.empty')}</Text>
        </View>
      )}
      {button ? <SourceCell label={t('gallery.add')} onPick={addItems} color={color} loading={(single || carousel) && adding} /> : null}
    </ListSection>
  )
}

type TileProps = {
  item: GalleryItem
  cell: number
  count: number
  slots: SharedValue<Record<number, number>>
  onPreview: (id: number, preview: ImageRef | null) => void
  onOpen: () => void
  onRemove: () => void
  onDragging: (dragging: boolean) => void
  onDrop: (from: number, to: number) => void
  onVideoSize: (size: { width: number; height: number }) => void
}

function GalleryTile({ item, cell, count, slots, onPreview, onOpen, onRemove, onDragging, onDrop, onVideoSize }: TileProps) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const video = isGalleryVideo(item.file)
  const id = item.id
  // Away while its picture is up in the viewer, which puts it back here on closing.
  const lifted = useLifted(sourceOf(item))
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  // Hidden until it has been given its place. Kept apart from the place itself: a tile
  // springing back into the first column swings a little past it, below nothing.
  const placed = useSharedValue(false)
  const scale = useSharedValue(1)
  const active = useSharedValue(false)
  const from = useSharedValue(0)
  const grab = useSharedValue({ x: 0, y: 0 })

  // To its place whenever that changes, by a spring, but straight there the first time and
  // when the grid itself changes width; the lifted one follows the finger instead.
  useAnimatedReaction(
    () => slots.value[id],
    (slot, was) => {
      if (slot === undefined || active.value) return
      const to = placeAt(slot, cell)
      const first = was === undefined || !placed.value
      x.value = first ? to.x : withSpring(to.x, SETTLE)
      y.value = first ? to.y : withSpring(to.y, SETTLE)
      placed.value = true
    },
    [cell]
  )

  const pan = Gesture.Pan()
    .activateAfterLongPress(LIFT_DELAY)
    .onStart(() => {
      active.value = true
      from.value = slots.value[id] ?? 0
      grab.value = { x: x.value, y: y.value }
      scale.value = withSpring(LIFTED_SCALE, SETTLE)
      reorderFeel.onDragStart()
      scheduleOnRN(onDragging, true)
    })
    .onUpdate((e) => {
      x.value = grab.value.x + e.translationX
      y.value = grab.value.y + e.translationY
      // The place under the tile's middle, never past the last item.
      const step = cell + GAP
      const column = clamp(Math.round(x.value / step), 0, COLUMNS - 1)
      const row = clamp(Math.round(y.value / step), 0, Math.ceil(count / COLUMNS) - 1)
      const target = Math.min(row * COLUMNS + column, count - 1)
      const current = slots.value[id]
      if (current === undefined || target === current) return
      // The items between close up behind it, as a list's splice does, so the order the drop
      // hands on is the one on screen.
      const next: Record<number, number> = {}
      for (const key of Object.keys(slots.value)) {
        const other = Number(key)
        const slot = slots.value[other]
        if (other === id) next[other] = target
        else if (current < target && slot > current && slot <= target) next[other] = slot - 1
        else if (current > target && slot >= target && slot < current) next[other] = slot + 1
        else next[other] = slot
      }
      slots.value = next
      reorderFeel.onIndexChange()
    })
    .onFinalize(() => {
      if (!active.value) return
      active.value = false
      const to = slots.value[id] ?? from.value
      const place = placeAt(to, cell)
      x.value = withSpring(place.x, SETTLE)
      y.value = withSpring(place.y, SETTLE)
      scale.value = withSpring(1, SETTLE)
      reorderFeel.onDragEnd()
      scheduleOnRN(onDragging, false)
      scheduleOnRN(onDrop, from.value, to)
    })
  const tap = Gesture.Tap()
    .maxDuration(LIFT_DELAY)
    .onEnd((_e, success) => {
      if (success) scheduleOnRN(onOpen)
    })

  // Hidden until it has a place, and while it is up in the viewer.
  const style = useAnimatedStyle(
    () => ({
      opacity: placed.value && !lifted ? 1 : 0,
      zIndex: active.value ? 1 : 0,
      transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
    }),
    [lifted]
  )

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View
        accessible
        accessibilityRole="imagebutton"
        accessibilityLabel={t(video ? 'gallery.openVideo' : 'gallery.openPicture')}
        onAccessibilityTap={onOpen}
        // VoiceOver has no long press to drop a tile in place, so taking it out is an action.
        accessibilityActions={[{ name: 'delete', label: t('common.delete') }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'delete') onRemove()
        }}
        style={[styles.cell, { width: cell, height: cell }, style]}
      >
        <GalleryMedia
          item={item}
          limits={previewSize(item, Math.ceil(cell * PixelRatio.get() * LIFTED_SCALE))}
          onPreview={onPreview}
          onVideoSize={onVideoSize}
        />
      </Animated.View>
    </GestureDetector>
  )
}

function GalleryCarousel({
  items,
  width,
  page,
  jump,
  onPageChange,
  onPreview,
  onOpen,
  onRemove,
  onVideoSize,
}: {
  items: GalleryItem[]
  width: number
  page: number
  jump: { index: number; animated: boolean; tick: number } | null
  onPageChange: (page: number) => void
  onPreview: (id: number, preview: ImageRef | null) => void
  onOpen: (id: number) => void
  onRemove: (item: GalleryItem) => void
  onVideoSize: (item: GalleryItem, size: { width: number; height: number }) => void
}) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const scrollRef = useRef<ComponentRef<typeof Animated.ScrollView>>(null)
  const lastWidth = useRef(width)
  const pageRef = useRef(page)
  pageRef.current = page

  const heights = useMemo(() => items.map((item) => carouselHeightOf(item, width)), [items, width])
  const heightsSV = useSharedValue(heights)
  useEffect(() => {
    heightsSV.value = heights
  }, [heights, heightsSV])

  const pageWidth = useSharedValue(width)
  useEffect(() => {
    pageWidth.value = width
  }, [width, pageWidth])

  const scrollX = useSharedValue(page * width)

  // Keep the clip wrapper's height synced to the active slide on the UI thread without resizing
  // slides inside ScrollView while scrolling.
  const clipStyle = useAnimatedStyle(() => {
    const hs = heightsSV.value
    const w = pageWidth.value
    if (!hs.length || w <= 0) return { height: 0 }
    const pos = clamp(scrollX.value / w, 0, hs.length - 1)
    const low = Math.floor(pos)
    const high = Math.min(hs.length - 1, low + 1)
    return { height: hs[low] + (hs[high] - hs[low]) * (pos - low) }
  })

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x
    },
  })

  useAnimatedReaction(
    () => {
      const w = pageWidth.value
      const count = heightsSV.value.length
      if (w <= 0 || count <= 1) return 0
      return clamp(Math.round(scrollX.value / w), 0, count - 1)
    },
    (next, prev) => {
      if (next !== prev) scheduleOnRN(onPageChange, next)
    }
  )

  useEffect(() => {
    if (width <= 0) return
    const widthChanged = lastWidth.current !== width
    lastWidth.current = width
    if (!jump && !widthChanged) return
    const target = clamp(jump ? jump.index : pageRef.current, 0, items.length - 1)
    const x = target * width
    const animated = !widthChanged && Boolean(jump?.animated)
    if (!animated) scrollX.value = x
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x, animated })
    })
    return () => cancelAnimationFrame(frame)
  }, [jump, width, items.length, scrollX])

  const safePage = clamp(page, 0, items.length - 1)
  const activeLifted = useLifted(sourceOf(items[safePage]))

  const stepTo = (next: number) => {
    const clamped = clamp(next, 0, items.length - 1)
    onPageChange(clamped)
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true })
  }

  return (
    <Animated.View style={[styles.carouselWrap, clipStyle]}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        directionalLockEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        style={styles.fill}
      >
        {items.map((item, i) => (
          <SingleGalleryItem
            key={item.id}
            item={item}
            width={width}
            height={heights[i]}
            onPreview={onPreview}
            onOpen={() => onOpen(item.id)}
            onRemove={() => onRemove(item)}
            onVideoSize={(size) => onVideoSize(item, size)}
          />
        ))}
      </Animated.ScrollView>
      {!activeLifted ? (
        <>
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>
              {safePage + 1} / {items.length}
            </Text>
          </View>
          {isWeb && safePage > 0 ? (
            <Pressable
              onPress={() => stepTo(safePage - 1)}
              hitSlop={8}
              style={[styles.arrow, styles.arrowLeft]}
              accessibilityRole="button"
              accessibilityLabel={t('gallery.previous')}
            >
              <Icon name="chevron-back" size={18} color={ON_ACCENT} />
            </Pressable>
          ) : null}
          {isWeb && safePage < items.length - 1 ? (
            <Pressable
              onPress={() => stepTo(safePage + 1)}
              hitSlop={8}
              style={[styles.arrow, styles.arrowRight]}
              accessibilityRole="button"
              accessibilityLabel={t('gallery.next')}
            >
              <Icon name="chevron-forward" size={18} color={ON_ACCENT} />
            </Pressable>
          ) : null}
        </>
      ) : null}
    </Animated.View>
  )
}

function SingleGalleryItem({
  item,
  width,
  height,
  onPreview,
  onOpen,
  onRemove,
  onVideoSize,
}: {
  item: GalleryItem
  width: number
  height: number
  onPreview: (id: number, preview: ImageRef | null) => void
  onOpen: () => void
  onRemove: () => void
  onVideoSize: (size: { width: number; height: number }) => void
}) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const video = isGalleryVideo(item.file)
  const lifted = useLifted(sourceOf(item))
  const scale = PixelRatio.get()
  const limits = {
    maxWidth: Math.ceil(width * scale),
    maxHeight: Math.ceil((item.width && item.height ? height : width * 2) * scale),
  }

  return (
    <Pressable
      onPress={onOpen}
      accessible
      accessibilityRole="imagebutton"
      accessibilityLabel={t(video ? 'gallery.openVideo' : 'gallery.openPicture')}
      accessibilityActions={[{ name: 'delete', label: t('common.delete') }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'delete') onRemove()
      }}
      style={[styles.single, { width, height }, lifted && styles.hidden]}
    >
      <GalleryMedia item={item} limits={limits} onPreview={onPreview} onVideoSize={onVideoSize} />
    </Pressable>
  )
}

function GalleryMedia({
  item,
  limits,
  onPreview,
  onVideoSize,
}: {
  item: GalleryItem
  limits: { maxWidth: number; maxHeight: number }
  onPreview: (id: number, preview: ImageRef | null) => void
  onVideoSize: (size: { width: number; height: number }) => void
}) {
  const styles = useStyles(createStyles)
  const uri = galleryUri(item.file)
  const video = isGalleryVideo(item.file)
  return (
    <>
      {isGalleryStill(item.file) ? (
        <StillPicture item={item} uri={uri} limits={limits} onPreview={onPreview} />
      ) : (
        // A video stands still on its first frame here; it plays in the viewer.
        <Picture
          uri={uri}
          style={styles.fill}
          paused={video}
          transition={150}
          onVideoSize={video && !(item.width && item.height) ? onVideoSize : undefined}
        />
      )}
      {video ? (
        <View style={styles.play} pointerEvents="none">
          <Icon name="play" size={13} color={ON_ACCENT} />
        </View>
      ) : null}
    </>
  )
}

// A still picture decoded once, off the main thread, at about its display size, rather than
// read whole from its file and shrunk by every view that shows it. The decoded picture is handed
// up for the viewer to open with.
function StillPicture({
  item,
  uri,
  limits,
  onPreview,
}: {
  item: GalleryItem
  uri: string
  limits: { maxWidth: number; maxHeight: number }
  onPreview: (id: number, preview: ImageRef | null) => void
}) {
  const styles = useStyles(createStyles)
  const preview = useImage(uri, { ...limits, onError: (err) => console.warn('Gallery picture not loaded', err) })
  const id = item.id
  useEffect(() => {
    onPreview(id, preview)
    return () => onPreview(id, null)
  }, [id, preview, onPreview])
  return preview ? <Image source={preview} style={styles.fill} contentFit="cover" transition={150} /> : null
}

// The size to decode a still picture at: its short side covers a tile, lifted too, and the
// long one follows its shape, up to a panorama's worth.
function previewSize(item: GalleryItem, side: number) {
  if (!item.width || !item.height) return { maxWidth: side * 2, maxHeight: side * 2 }
  return item.width >= item.height ? { maxWidth: side * 4, maxHeight: side } : { maxWidth: side, maxHeight: side * 4 }
}

// The top left corner of a place in the grid.
function placeAt(slot: number, cell: number) {
  'worklet'
  return { x: (slot % COLUMNS) * (cell + GAP), y: Math.floor(slot / COLUMNS) * (cell + GAP) }
}

const aspectOf = (item: GalleryItem) => (item.width && item.height ? item.width / item.height : 1)

const carouselHeightOf = (item: GalleryItem, width: number) =>
  Math.round(width / clamp(aspectOf(item), CAROUSEL_MIN_ASPECT, CAROUSEL_MAX_ASPECT))

// What a tile is known by while its picture is up in the viewer.
const sourceOf = (item: GalleryItem) => `gallery:${item.id}`

// What the gallery holds for `count` items: one item (or carousel mode) spans the full width
// with the add button below; otherwise a plus takes the place after the last while its row
// has room, or a spinner while new ones come in under full rows, where the add button stands
// below (and alone with no items at all).
function layoutOf(count: number, adding: boolean, carousel: boolean) {
  const single = count === 1
  const button = single || carousel || count % COLUMNS === 0
  const extra = !single && !carousel && (!button || adding)
  return { single, button, extra, cells: count + (extra ? 1 : 0) }
}

// Where the items sit in the window, given the grid's corner there, each with the group's
// rounding on the corners it fills; null for one off the screen.
function placesOf(
  list: GalleryItem[],
  at: { x: number; y: number },
  width: number,
  cell: number,
  adding = false,
  mode: 'grid' | 'carousel' = 'grid',
  active = 0
) {
  const window = Dimensions.get('window')
  const { radius, continuous } = GROUP_CORNERS
  if (list.length === 1) {
    const box = { x: at.x, y: at.y, width, height: width / aspectOf(list[0]) }
    const shown = box.x + box.width > 0 && box.y + box.height > 0 && box.x < window.width && box.y < window.height
    return [shown ? originOf(box, { topLeft: radius, topRight: radius, bottomRight: 0, bottomLeft: 0, continuous }) : null]
  }
  if (mode === 'carousel') {
    const shownItem = list[active]
    if (!shownItem) return list.map(() => null)
    const box = { x: at.x, y: at.y, width, height: carouselHeightOf(shownItem, width) }
    const shown = box.x + box.width > 0 && box.y + box.height > 0 && box.x < window.width && box.y < window.height
    const origin = shown ? originOf(box, { topLeft: radius, topRight: radius, bottomRight: 0, bottomLeft: 0, continuous }) : null
    return list.map((_, slot) => (slot === active ? origin : null))
  }
  const { button, cells } = layoutOf(list.length, adding, false)
  return list.map((_, slot) => {
    const place = placeAt(slot, cell)
    const box = { x: at.x + place.x, y: at.y + place.y, width: cell, height: cell }
    const shown = box.x + cell > 0 && box.y + cell > 0 && box.x < window.width && box.y < window.height
    return shown ? originOf(box, cornersOf(slot, cells, !button)) : null
  })
}

// The corners of the tile at a place among `cells` places. The square tiles have none of
// their own, but the group's rounding cuts those that fill its corners: the bottom ones only
// when the grid ends the group, with no button under it.
function cornersOf(slot: number, cells: number, ends: boolean): Corners {
  const { radius, continuous } = GROUP_CORNERS
  const row = Math.floor(slot / COLUMNS)
  const column = slot % COLUMNS
  const top = row === 0
  const bottom = ends && row === Math.ceil(cells / COLUMNS) - 1
  const left = column === 0
  const right = column === COLUMNS - 1
  return {
    topLeft: top && left ? radius : 0,
    topRight: top && right ? radius : 0,
    bottomRight: bottom && right ? radius : 0,
    bottomLeft: bottom && left ? radius : 0,
    continuous,
  }
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    // Every place is laid out from the grid's corner, the tiles by a transform, so a lifted
    // one moves on the UI thread and the rest slide aside by springs.
    cell: { position: 'absolute', left: 0, top: 0, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
    carouselWrap: { width: '100%', overflow: 'hidden', backgroundColor: colors.surfaceRaised },
    single: { overflow: 'hidden', backgroundColor: colors.surfaceRaised },
    hidden: { opacity: 0 },
    fill: { width: '100%', height: '100%' },
    counter: {
      position: 'absolute',
      top: 10,
      right: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    counterText: {
      color: ON_ACCENT,
      fontSize: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    arrow: {
      position: 'absolute',
      top: '50%',
      marginTop: -16,
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    arrowLeft: { left: 10 },
    arrowRight: { right: 10 },
    plusInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    // As tall as a row of tiles once the width is known; about that before.
    empty: { minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12 },
    emptyText: { color: colors.textMuted, fontSize: 15, lineHeight: 20, textAlign: 'center' },
    play: {
      position: 'absolute',
      left: 6,
      bottom: 6,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 2,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
  })

import { useNavigation, useRouter } from 'expo-router'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Icon } from '@/components/visuals/Icon'
import { OrderBadge } from '@/components/visuals/OrderBadge'
import { Picture } from '@/components/visuals/Picture'
import type { GalleryItem } from '@/db/gallery'
import { useTranslation } from '@/i18n'
import { isIOS } from '@/lib/core/platform'
import { galleryUri, isGalleryVideo } from '@/lib/images/gallery'
import { choose, finishGalleryPick, galleryPick } from '@/lib/images/galleryPick'
import { selectionAsync } from '@/lib/ui/haptics'
import { type Colors, ON_ACCENT, useColors, useStyles } from '@/theme'

const COLUMNS = 3
const GAP = 2

// A character's gallery as a sheet to take one picture or video from, a grid as in Photos:
// a tap ticks one, another tap moves the tick, and the check in the bar takes it. A
// generator takes several: each tap adds one under its number in the order they go, as the
// attach menu's gallery ticks them, and the check takes them all.
export default function GalleryPickScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const colors = useColors()
  const styles = useStyles(createStyles)
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { t } = useTranslation()
  // Read once: the next opening may replace it under a sheet still closing.
  const [pick] = useState(galleryPick)
  const [selected, setSelected] = useState<GalleryItem[]>(() => pick?.initial ?? [])
  const multiple = pick?.multiple ?? false
  const side = (width - GAP * (COLUMNS - 1)) / COLUMNS

  useEffect(() => {
    if (!pick) router.back()
  }, [pick, router])

  // Gone without the end of its transition reported, as on the web, the pick is still handed over.
  useEffect(() => () => finishGalleryPick(), [])

  // Several may all be unticked again, which takes off the ones attached before.
  const canConfirm = selected.length > 0 || (multiple && (pick?.initial?.length ?? 0) > 0)

  const confirm = () => {
    if (!canConfirm) return
    choose(selected)
    router.back()
  }
  // The bar takes the handler through a ref, so it is set again only when what it shows changes.
  const confirmRef = useRef(confirm)
  confirmRef.current = confirm

  useLayoutEffect(() => {
    navigation.setOptions(
      isIOS
        ? {
            title: pick?.title ?? '',
            unstable_headerLeftItems: () => [
              {
                type: 'button',
                label: t('common.close'),
                icon: { type: 'sfSymbol', name: 'xmark' },
                onPress: () => router.back(),
              },
            ],
            unstable_headerRightItems: () => [
              {
                type: 'button',
                label: t('common.done'),
                icon: { type: 'sfSymbol', name: 'checkmark' },
                variant: 'prominent',
                tintColor: colors.accent,
                disabled: !canConfirm,
                onPress: () => confirmRef.current(),
              },
            ],
          }
        : {
            title: pick?.title ?? '',
            headerLeft: () => (
              <Pressable onPress={() => router.back()} hitSlop={10}>
                <Text style={styles.headerButton}>{t('common.close')}</Text>
              </Pressable>
            ),
            headerRight: () => (
              <Pressable onPress={() => confirmRef.current()} disabled={!canConfirm} hitSlop={10}>
                <Text style={[styles.headerButton, styles.headerDone, !canConfirm && styles.headerDisabled]}>{t('common.done')}</Text>
              </Pressable>
            ),
          }
    )
  }, [navigation, pick, router, styles, t, canConfirm, colors.accent])

  if (!pick) return null

  const toggle = (item: GalleryItem) => {
    selectionAsync()
    setSelected((current) => {
      if (current.some((other) => other.id === item.id)) return current.filter((other) => other.id !== item.id)
      return multiple ? [...current, item] : [item]
    })
  }

  return (
    <FlatList
      data={pick.items}
      keyExtractor={(item) => String(item.id)}
      numColumns={COLUMNS}
      columnWrapperStyle={styles.row}
      contentContainerStyle={{ gap: GAP, paddingBottom: insets.bottom + 16 }}
      style={{ backgroundColor: colors.bg }}
      // The bar of the sheet lies over the grid, which starts under it and scrolls beneath.
      contentInsetAdjustmentBehavior="automatic"
      extraData={selected}
      renderItem={({ item }) => {
        const video = isGalleryVideo(item.file)
        // Where it stands among the ticked ones: the pictures are attached in that order.
        const order = selected.findIndex((other) => other.id === item.id) + 1
        const ticked = order > 0
        return (
          <Pressable
            onPress={() => toggle(item)}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={multiple ? { checked: ticked } : { selected: ticked }}
            accessibilityValue={multiple && ticked ? { text: String(order) } : undefined}
            accessibilityLabel={t(video ? 'promptGen.galleryVideo' : 'promptGen.galleryPicture')}
            style={({ pressed }) => [{ width: side, height: side }, styles.tile, pressed && styles.pressed]}
          >
            {/* A video stands still on its first frame, as in the profile's grid. */}
            <Picture uri={galleryUri(item.file)} style={styles.fill} paused transition={150} />
            {video ? (
              <View style={styles.play} pointerEvents="none">
                <Icon name="play" size={13} color={ON_ACCENT} />
              </View>
            ) : null}
            {ticked ? (
              <>
                <View style={styles.dim} pointerEvents="none" />
                <OrderBadge order={multiple ? order : undefined} />
              </>
            ) : null}
          </Pressable>
        )
      }}
    />
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    row: { gap: GAP },
    tile: { overflow: 'hidden', backgroundColor: colors.surfaceRaised },
    pressed: { opacity: 0.7 },
    fill: { width: '100%', height: '100%' },
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
    dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.28)' },
    headerButton: { color: colors.accent, fontSize: 17 },
    headerDone: { fontWeight: '600' },
    headerDisabled: { opacity: 0.4 },
  })

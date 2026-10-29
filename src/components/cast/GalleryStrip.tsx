import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { listGallery, type GalleryItem } from '@/db/gallery'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { galleryUri, isGalleryVideo } from '@/lib/images/gallery'
import { selectionAsync } from '@/lib/ui/haptics'
import { type Colors, ON_ACCENT, useStyles } from '@/theme'

import { Icon } from '../visuals/Icon'
import { Picture } from '../visuals/Picture'

type Props = {
  items: GalleryItem[]
  // Ticked items, for a picker that takes several and gives them back with a second tap.
  isPicked?: (item: GalleryItem) => boolean
  onPress: (item: GalleryItem) => void
}

// A saved character's gallery to pick from, none for a new one. Videos are offered only
// where they can be used, as behind a chat.
export function useGalleryPicks(characterId: number | null | undefined, videos = false) {
  const db = useDatabase()
  const [items, setItems] = useState<GalleryItem[]>([])
  useEffect(() => {
    if (characterId == null) return
    listGallery(db, characterId)
      .then((all) => setItems(videos ? all : all.filter((item) => !isGalleryVideo(item.file))))
      .catch((err) => console.warn('Gallery not loaded', err))
  }, [db, characterId, videos])
  return items
}

// A character's gallery as a row of small tiles to take a picture from into a field of the
// editor or a generator. Its row is left out while there is nothing in it: the system's list
// would keep an empty one.
export function GalleryStrip({ items, isPicked, onPress }: Props) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{t('promptGen.fromGallery')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {items.map((item) => {
          const video = isGalleryVideo(item.file)
          const picked = isPicked?.(item) ?? false
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                selectionAsync()
                onPress(item)
              }}
              accessibilityRole="button"
              accessibilityLabel={t(video ? 'promptGen.galleryVideo' : 'promptGen.galleryPicture')}
              accessibilityState={isPicked ? { selected: picked } : undefined}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
            >
              {/* A video stands still on its first frame, as in the profile's grid. */}
              <Picture uri={galleryUri(item.file)} style={styles.thumb} paused />
              {video ? (
                <View style={styles.play} pointerEvents="none">
                  <Icon name="play" size={10} color={ON_ACCENT} />
                </View>
              ) : null}
              {picked ? (
                <View style={styles.check} pointerEvents="none">
                  <Icon name="checkmark" size={12} color={ON_ACCENT} />
                </View>
              ) : null}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    wrapper: {
      paddingVertical: 10,
    },
    label: {
      color: colors.textMuted,
      fontSize: 13,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    content: {
      paddingHorizontal: 16,
      flexDirection: 'row',
      gap: 12,
    },
    // The tile rounds what is in it: a video's view does not round itself.
    tile: {
      width: 56,
      height: 56,
      borderRadius: 10,
      borderCurve: 'continuous',
      overflow: 'hidden',
      backgroundColor: colors.surfaceRaised,
    },
    pressed: {
      transform: [{ scale: 0.94 }],
    },
    thumb: {
      width: 56,
      height: 56,
    },
    play: {
      position: 'absolute',
      left: 4,
      bottom: 4,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    check: {
      position: 'absolute',
      right: 4,
      bottom: 4,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
    },
  })

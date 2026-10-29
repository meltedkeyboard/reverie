import { Image } from 'expo-image'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { GalleryStrip, useGalleryPicks } from '@/components/cast/GalleryStrip'
import { SourceCell } from '@/components/lists/PictureCells'
import { Icon } from '@/components/visuals/Icon'
import type { GalleryItem } from '@/db/gallery'
import type { MessageImage } from '@/db/messages'
import { useGenInput } from '@/hooks/features/useGenSession'
import { useTranslation } from '@/i18n'
import { galleryMessageImage, pickMessageImages, pictureUri } from '@/lib/images/attachments'
import type { ImageSource } from '@/lib/images/images'
import { isDesktop } from '@/lib/core/platform'
import { alertError } from '@/lib/transfer/report'
import { type Colors, useColors, useStyles } from '@/theme'

import { GenRow, GenSection } from './GenCells'

type Props = {
  // A saved character's gallery is offered to pick from, its videos left out.
  characterId?: number | null
  images: MessageImage[]
  onImagesChange: (images: MessageImage[]) => void
  header?: string
  footer?: string
}

// The pictures sent along with a generator's request: their thumbnails in a row, and the
// sources to add more from, the character's gallery among them.
export function GenImageAttachments({ characterId, images, onImagesChange, header, footer }: Props) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()
  const gallery = useGalleryPicks(characterId)
  // Which attachment each picked gallery picture became, so its tile shows it as attached
  // when the sheet opens again, and a second tap takes that attachment off.
  const [fromGallery, setFromGallery] = useGenInput<Record<string, string>>('fromGallery', {})
  const [storing, setStoring] = useState(false)

  const attachedFrom = (item: GalleryItem) => {
    const file = fromGallery[item.file]
    return file && images.some((image) => image.file === file) ? file : null
  }

  const toggleGallery = async (item: GalleryItem) => {
    if (storing) return
    const attached = attachedFrom(item)
    if (attached) {
      onImagesChange(images.filter((image) => image.file !== attached))
      return
    }
    try {
      setStoring(true)
      const picture = await galleryMessageImage(item.file)
      onImagesChange([...images, picture])
      setFromGallery((prev) => ({ ...prev, [item.file]: picture.file }))
    } catch (err) {
      alertError(t('composer.attachFailedTitle'), err)
    } finally {
      setStoring(false)
    }
  }

  const onPick = async (source: ImageSource) => {
    try {
      const picked = await pickMessageImages(source)
      if (picked.length > 0) {
        onImagesChange([...images, ...picked])
      }
    } catch (err) {
      alertError(t('composer.attachFailedTitle'), err)
    }
  }

  const removeAt = (index: number) => {
    onImagesChange(images.filter((_, i) => i !== index))
  }

  return (
    <GenSection header={header} footer={footer}>
      {images.length > 0 ? (
        <GenRow>
          <View style={styles.scrollWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              {images.map((item, index) => (
                <View key={item.file || index} style={styles.thumbWrapper}>
                  <Image source={{ uri: pictureUri(item) }} style={styles.thumb} contentFit="cover" />
                  <Pressable
                    onPress={() => removeAt(index)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('promptGen.removePhoto')}
                    style={styles.removeBtn}
                  >
                    <Icon name="close" size={13} color={colors.text} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        </GenRow>
      ) : null}
      {gallery.length > 0 ? (
        <GenRow>
          <GalleryStrip items={gallery} isPicked={(item) => attachedFrom(item) !== null} onPress={toggleGallery} />
        </GenRow>
      ) : null}
      {/* A new row once the thumbnails come or go above it, or the system's list leaves it
          blank (see NativeHostedRow). */}
      <GenRow key={images.length > 0 ? 'under' : 'alone'}>
        <SourceCell
          label={images.length > 0 ? t('promptGen.addPhoto') : t('promptGen.attachPhoto')}
          onPick={onPick}
        />
      </GenRow>
    </GenSection>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    scrollWrapper: {
      paddingVertical: 10,
    },
    scrollContent: {
      paddingHorizontal: 16,
      flexDirection: 'row',
      gap: 12,
    },
    thumbWrapper: {
      position: 'relative',
      paddingTop: 6,
      paddingRight: 6,
    },
    thumb: {
      width: 72,
      height: 72,
      borderRadius: 14,
      backgroundColor: colors.surfaceRaised,
    },
    removeBtn: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
      borderWidth: isDesktop ? 0 : 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 2,
      elevation: 2,
    },
  })

import { Image } from 'expo-image'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { SourceCell } from '@/components/lists/PictureCells'
import { Icon } from '@/components/visuals/Icon'
import type { MessageImage } from '@/db/messages'
import { useTranslation } from '@/i18n'
import { pickMessageImages, pictureUri } from '@/lib/images/attachments'
import type { ImageSource } from '@/lib/images/images'
import { isDesktop } from '@/lib/core/platform'
import { alertError } from '@/lib/transfer/report'
import { type Colors, useColors, useStyles } from '@/theme'

import { GenRow, GenSection } from './GenCells'

type Props = {
  images: MessageImage[]
  onImagesChange: (images: MessageImage[]) => void
  header?: string
  footer?: string
}

// The pictures sent along with a generator's request: their thumbnails in a row, and the
// sources to add more from.
export function GenImageAttachments({ images, onImagesChange, header, footer }: Props) {
  const styles = useStyles(createStyles)
  const colors = useColors()
  const { t } = useTranslation()

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

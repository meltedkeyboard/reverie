import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'

import type { NewGalleryItem } from '@/db/gallery'
import { t } from '@/i18n'
import { avatarUri, persistAvatar } from '@/lib/images/avatarStore'
import { pictureSize } from '@/lib/images/avatars'
import { requireCamera, resizedJpeg, type ImageSource } from '@/lib/images/images'
import { extensionOf, isVideo, movingKind } from '@/lib/images/media'
import { attachmentLimitBytes } from '@/lib/settings/fileLimits'
import { showToast } from '@/lib/ui/toast'

// A still picture of the gallery is kept large enough to look at full screen, but not as
// the camera's full 48 megapixels.
const MAX_SIDE = 2560
// How many the library hands over at a time.
const MAX_PICKED = 30

type Picked = { uri: string; width: number | null; height: number | null }

export const galleryUri = (file: string) => avatarUri(file, 'gallery') ?? ''

// Pictures and videos from the camera, the library or Files, several at a time.
async function pickMedia(source: ImageSource): Promise<Picked[]> {
  if (source === 'files') {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'video/*'], multiple: true, copyToCacheDirectory: true })
    return picked.canceled ? [] : picked.assets.map((asset) => ({ uri: asset.uri, width: null, height: null }))
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images', 'videos'], quality: 1 }
  if (source === 'camera') await requireCamera()
  const picked =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: MAX_PICKED, orderedSelection: true })
  return picked.canceled ? [] : picked.assets.map((asset) => ({ uri: asset.uri, width: asset.width || null, height: asset.height || null }))
}

// Stores what was picked in the `gallery` folder: a still picture shrunk to a JPEG, a GIF,
// moving WebP or APNG and a video as they are, up to the size limit of message pictures. What
// cannot be kept is left out with a word why, and the rest still comes in.
export async function pickGalleryItems(source: ImageSource): Promise<NewGalleryItem[]> {
  const picked = await pickMedia(source)
  const limit = attachmentLimitBytes()
  const stored: NewGalleryItem[] = []
  let refused = 0
  for (const item of picked) {
    try {
      const ext = extensionOf(item.uri)
      if (ext === 'webm') {
        refused++
        continue
      }
      const moving = movingKind(item.uri)
      if (moving) {
        if ((new File(item.uri).size ?? 0) > limit) {
          refused++
          continue
        }
        // A video picked from Files has no size until its first frame is shown.
        const size = item.width && item.height ? item : moving === 'image' ? await pictureSize(item.uri) : { width: null, height: null }
        stored.push({ file: await persistAvatar(item.uri, 'gallery'), width: size.width, height: size.height })
        continue
      }
      const saved = await resizedJpeg(item.uri, MAX_SIDE, 0.9)
      stored.push({ file: await persistAvatar(saved.uri, 'gallery'), width: saved.width, height: saved.height })
    } catch (err) {
      console.warn('Gallery item not stored', err)
      refused++
    }
  }
  if (refused) showToast({ title: t('gallery.someRefused', { count: refused, mb: Math.round(limit / 1024 / 1024) }), tone: 'info' })
  return stored
}

export const isGalleryVideo = (file: string) => isVideo(file)

// A still picture of the gallery is always stored as a JPEG; a GIF, WebP or APNG keeps its
// own format because it moves.
export const isGalleryStill = (file: string) => ['jpg', 'jpeg'].includes(extensionOf(file))

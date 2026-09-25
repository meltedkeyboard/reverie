import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'

import type { MessageImage } from '@/db/messages'
import { t } from '@/i18n'

// Vision models downscale large inputs anyway, and every photo in the context window
// is sent again with each reply, so a smaller picture keeps requests fast.
const MAX_SIDE = 1024

// How many pictures one message can take from the library at a time.
const MAX_PICKED = 10

export type ImageSource = 'library' | 'camera' | 'files'

export async function pickMessageImages(source: ImageSource): Promise<MessageImage[]> {
  const uris = await pickUris(source, true)
  return Promise.all(uris.map(prepareMessageImage))
}

export async function requireCamera() {
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) throw new Error(t('images.cameraPermission'))
}

// The uris of the pictures the user chose; several only when asked for (the camera gives one).
export async function pickUris(source: ImageSource, multiple: boolean) {
  if (source === 'files') {
    const picked = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      multiple,
      copyToCacheDirectory: true,
    })
    return picked.canceled ? [] : picked.assets.map((asset) => asset.uri)
  }
  if (source === 'camera') {
    await requireCamera()
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
    return shot.canceled ? [] : shot.assets.map((asset) => asset.uri)
  }
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: multiple,
    selectionLimit: MAX_PICKED,
  })
  return picked.canceled ? [] : picked.assets.map((asset) => asset.uri)
}

// Shrinks a picture to at most maxSide on its longer side and saves it as JPEG. Files come
// without a size, so it is read from the decoded picture.
export async function resizedJpeg(uri: string, maxSide: number, compress: number, base64 = false) {
  const original = await ImageManipulator.manipulate(uri).renderAsync()
  let picture = original
  if (Math.max(original.width, original.height) > maxSide) {
    const resize = original.width >= original.height ? { width: maxSide } : { height: maxSide }
    picture = await ImageManipulator.manipulate(original).resize(resize).renderAsync()
  }
  return picture.saveAsync({ format: SaveFormat.JPEG, compress, base64 })
}

async function prepareMessageImage(uri: string): Promise<MessageImage> {
  const saved = await resizedJpeg(uri, MAX_SIDE, 0.8, true)
  if (!saved.base64) throw new Error(t('images.readFailed'))
  return { base64: saved.base64, width: saved.width, height: saved.height }
}

export function imageDataUrl(base64: string) {
  return `data:image/jpeg;base64,${base64}`
}

// Avatars and backgrounds are stored under a name made from the time they were saved; the
// random part keeps two saved in the same moment apart.
export function newAvatarName() {
  return `${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`
}

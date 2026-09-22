import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'

import type { MessageImage } from '@/db/messages'

// Vision models downscale large inputs anyway, and every photo in the context window
// is sent again with each reply, so a smaller picture keeps requests fast.
const MAX_SIDE = 1024

export async function pickMessageImage(source: 'library' | 'camera'): Promise<MessageImage | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) throw new Error('Нет доступа к камере. Его можно включить в настройках iOS.')
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 }
  const picked =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options)
  if (picked.canceled) return null

  const asset = picked.assets[0]
  let context = ImageManipulator.manipulate(asset.uri)
  if (Math.max(asset.width, asset.height) > MAX_SIDE) {
    context = context.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE })
  }
  const rendered = await context.renderAsync()
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true })
  if (!saved.base64) throw new Error('Не удалось прочитать изображение')
  return { base64: saved.base64, width: saved.width, height: saved.height }
}

export function imageDataUrl(base64: string) {
  return `data:image/jpeg;base64,${base64}`
}

import * as DocumentPicker from 'expo-document-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { File } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'

import { t } from '@/i18n'
import { pickUris, requireCamera, resizedJpeg, newAvatarName, type ImageSource } from '@/lib/images'
import { extensionOf, MAX_ANIMATED_BYTES, movingKind } from '@/lib/media'
import { readAvatarBase64, removeAvatar, writeAvatarBase64, type ImageKind } from './avatarStore'

// Picking and resizing work the same everywhere; only storage differs per platform. Avatars
// and chat backgrounds are kept in separate folders.
export type { ImageKind } from './avatarStore'
export { avatarUri, persistAvatar, removeAvatar, readAvatarBase64, writeAvatarBase64, removeAllAvatars } from './avatarStore'

const SIDE = 512

export type CropRect = { originX: number; originY: number; width: number; height: number }

// A photo from the camera, already cropped in the system's own editor.
export async function pickAvatarPhoto() {
  await requireCamera()
  const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 })
  return picked.canceled ? null : squareAvatar(picked.assets[0].uri)
}

// A picture, GIF or video from the photo library, as it is. The system editor would flatten
// a GIF and only trims a video, so nothing is edited here: a still picture is framed on
// /avatar-crop, while a moving one goes through acceptMoving.
export async function pickAvatarLibrary() {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1 })
  return picked.canceled ? null : picked.assets[0].uri
}

// A file as it is; same as the library, the Files picker has no editor.
export async function pickAvatarFile() {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'video/*'], copyToCacheDirectory: true })
  return picked.canceled ? null : picked.assets[0].uri
}

// Whether the file is a moving avatar to be stored untouched. Throws when it is too big.
export function acceptMoving(uri: string) {
  const ext = extensionOf(uri)
  if (ext === 'webm') throw new Error(t('editor.avatarWebm'))
  if (!movingKind(uri)) return false
  if ((new File(uri).size ?? 0) > MAX_ANIMATED_BYTES) {
    throw new Error(t('editor.avatarTooBig', { mb: Math.round(MAX_ANIMATED_BYTES / 1024 / 1024) }))
  }
  return true
}

// Cuts the square out of the picture (the middle one unless given) and shrinks it to the
// avatar size. Returns a temporary file.
export async function squareAvatar(uri: string, rect?: CropRect) {
  const original = await ImageManipulator.manipulate(uri).renderAsync()
  const side = Math.min(original.width, original.height)
  const square = rect ?? { originX: (original.width - side) / 2, originY: (original.height - side) / 2, width: side, height: side }
  const cropped = await ImageManipulator.manipulate(original).crop(square).resize({ width: SIDE }).renderAsync()
  const saved = await cropped.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 })
  return saved.uri
}

const BACKGROUND_SIDE = 1600

// A picture for behind the chat, kept in its own proportions and shrunk to a size a phone
// screen needs. Returns a temporary file, or null when nothing was chosen.
export async function pickBackground(source: ImageSource) {
  const [uri] = await pickUris(source, false)
  if (!uri) return null
  return (await resizedJpeg(uri, BACKGROUND_SIDE, 0.85)).uri
}

// A stored picture under a new name, so a duplicated character owns its own file.
export async function copyStoredImage(name: string | null, kind: ImageKind = 'avatars') {
  if (!name) return null
  const base64 = await readAvatarBase64(name, kind)
  if (!base64) return null
  const copy = newAvatarName(extensionOf(name) || 'jpg')
  await writeAvatarBase64(copy, base64, kind)
  return copy
}

// Everything a character keeps in the image store.
export function removeCharacterImages(character: { avatar: string | null; background: string | null }) {
  if (character.avatar) removeAvatar(character.avatar)
  if (character.background) removeAvatar(character.background, 'backgrounds')
}

import * as DocumentPicker from 'expo-document-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'

import { pickUris, requireCamera, resizedJpeg, newAvatarName, type ImageSource } from '@/lib/images'
import { readAvatarBase64, removeAvatar, writeAvatarBase64 } from './avatarStore'

// Picking and resizing work the same everywhere; only storage differs per platform. The
// store keeps a character's chat background as well, as one more picture under a name.
export { avatarUri, persistAvatar, removeAvatar, readAvatarBase64, writeAvatarBase64, removeAllAvatars } from './avatarStore'

const SIDE = 512

export async function pickAvatar(source: ImageSource = 'library') {
  const uri = source === 'files' ? await pickFile() : await pickPhoto(source)
  if (!uri) return null

  // The library crops in its own editor; a file is cropped to the middle square here.
  const original = await ImageManipulator.manipulate(uri).renderAsync()
  const side = Math.min(original.width, original.height)
  const squared = await ImageManipulator.manipulate(original)
    .crop({ originX: (original.width - side) / 2, originY: (original.height - side) / 2, width: side, height: side })
    .resize({ width: SIDE })
    .renderAsync()
  const saved = await squared.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 })
  return saved.uri
}

async function pickPhoto(source: 'library' | 'camera') {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 }
  if (source === 'camera') await requireCamera()
  const picked =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options)
  return picked.canceled ? null : picked.assets[0].uri
}

async function pickFile() {
  const picked = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true })
  return picked.canceled ? null : picked.assets[0].uri
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
export async function copyStoredImage(name: string | null) {
  if (!name) return null
  const base64 = await readAvatarBase64(name)
  if (!base64) return null
  const copy = newAvatarName()
  await writeAvatarBase64(copy, base64)
  return copy
}

// Everything a character keeps in the image store.
export function removeCharacterImages(character: { avatar: string | null; background: string | null }) {
  if (character.avatar) removeAvatar(character.avatar)
  if (character.background) removeAvatar(character.background)
}

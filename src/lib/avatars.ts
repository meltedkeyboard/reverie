import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { File } from 'expo-file-system'

import { t } from '@/i18n'
import { newAvatarName, pickUris, type ImageSource } from '@/lib/images'
import { avatarLimitBytes } from '@/lib/fileLimits'
import { extensionOf, movingKind } from '@/lib/media'
import { readAvatarBase64, removeAvatar, writeAvatarBase64, type ImageKind } from './avatarStore'

// Picking and resizing work the same everywhere; only storage differs per platform. Avatars
// and chat backgrounds are kept in separate folders.
export type { ImageKind } from './avatarStore'
export { avatarUri, persistAvatar, persistOriginal, removeAvatar, readAvatarBase64, readAvatarBytes, writeAvatarBase64, writeAvatarBytes, removeAllAvatars } from './avatarStore'

const SIDE = 512

// The frame cut out of an original, in its pixels (as drawn, with its orientation applied).
// Stored as JSON beside the original; null means the default frame.
export type CropRect = { originX: number; originY: number; width: number; height: number }

export const cropToJson = (crop: CropRect | null) => (crop ? JSON.stringify(crop) : null)

export function cropFromJson(json: string | null): CropRect | null {
  if (!json) return null
  try {
    const crop = JSON.parse(json)
    return [crop?.originX, crop?.originY, crop?.width, crop?.height].every((n) => typeof n === 'number') ? crop : null
  } catch {
    return null
  }
}

// A picture, GIF or video as it is, from the camera, the library or the Files picker. The
// system editor would flatten a GIF and only trims a video, so nothing is edited here: a
// still picture is framed on /avatar-crop, a camera shot included so the whole shot is kept,
// while a moving one goes through acceptMoving.
export async function pickAvatar(source: ImageSource) {
  const [uri] = await pickUris(source, false, true)
  return uri ?? null
}

// Whether the file is a moving avatar to be stored untouched. Throws when it is too big.
export function acceptMoving(uri: string) {
  const ext = extensionOf(uri)
  if (ext === 'webm') throw new Error(t('editor.avatarWebm'))
  if (!movingKind(uri)) return false
  const limit = avatarLimitBytes()
  if ((new File(uri).size ?? 0) > limit) {
    throw new Error(t('editor.avatarTooBig', { mb: Math.round(limit / 1024 / 1024) }))
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

// A picture for behind the chat, as picked: it is framed on /background, which makes the
// copy the chat shows. Null when nothing was chosen.
export async function pickBackground(source: ImageSource) {
  const [uri] = await pickUris(source, false)
  return uri ?? null
}

// The part of the original the chat shows (all of it without a frame), shrunk to a size a
// phone screen needs. Returns a temporary file.
export async function frameBackground(uri: string, crop: CropRect | null) {
  let picture = ImageManipulator.manipulate(uri)
  if (crop) picture = picture.crop(crop)
  const framed = await picture.renderAsync()
  const resize = framed.width >= framed.height ? { width: BACKGROUND_SIDE } : { height: BACKGROUND_SIDE }
  const shown = Math.max(framed.width, framed.height) > BACKGROUND_SIDE ? await ImageManipulator.manipulate(framed).resize(resize).renderAsync() : framed
  return (await shown.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 })).uri
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
export function removeCharacterImages(character: {
  avatar: string | null
  avatarOriginal: string | null
  background: string | null
  backgroundOriginal: string | null
}) {
  if (character.avatar) removeAvatar(character.avatar)
  if (character.avatarOriginal) removeAvatar(character.avatarOriginal)
  if (character.background) removeAvatar(character.background, 'backgrounds')
  if (character.backgroundOriginal) removeAvatar(character.backgroundOriginal, 'backgrounds')
}

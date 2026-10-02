import { toByteArray } from 'base64-js'
import { Directory, File } from 'expo-file-system'

import { newAvatarName } from '@/lib/images'
import { extensionOf, movingKind } from '@/lib/media'
import { dataDirectory } from '@/lib/storage'

// `attachments` holds the pictures sent in messages.
export type ImageKind = 'avatars' | 'backgrounds' | 'attachments'

// Only the file name goes into the database. The absolute path of the app
// container changes between installs and updates, so it is resolved on read.
const folder = (kind: ImageKind) => new Directory(dataDirectory(), kind)

// Backgrounds used to be saved next to the avatars, so a name that isn't in its own
// folder is looked for there.
function imageFile(name: string, kind: ImageKind) {
  const file = new File(folder(kind), name)
  if (kind === 'backgrounds' && !file.exists) {
    const legacy = new File(folder('avatars'), name)
    if (legacy.exists) return legacy
  }
  return file
}

export function avatarUri(name: string, kind: ImageKind = 'avatars'): string | null {
  return imageFile(name, kind).uri
}

export async function persistAvatar(tempUri: string, kind: ImageKind = 'avatars') {
  folder(kind).create({ intermediates: true, idempotent: true })
  // A moving avatar keeps its own format; everything else was already made a JPEG.
  const name = newAvatarName(movingKind(tempUri) ? extensionOf(tempUri) : 'jpg')
  await new File(tempUri).copy(new File(folder(kind), name))
  return name
}

// An original is kept exactly as it was picked, in its own format, next to the framed copy.
export async function persistOriginal(tempUri: string, kind: ImageKind = 'avatars') {
  folder(kind).create({ intermediates: true, idempotent: true })
  const name = newAvatarName(extensionOf(tempUri) || 'jpg')
  await new File(tempUri).copy(new File(folder(kind), name))
  return name
}

export function removeAvatar(name: string, kind: ImageKind = 'avatars') {
  const file = imageFile(name, kind)
  if (file.exists) file.delete()
}

export async function readAvatarBase64(name: string, kind: ImageKind = 'avatars') {
  const file = imageFile(name, kind)
  return file.exists ? await file.base64() : null
}

export async function readAvatarBytes(name: string, kind: ImageKind = 'avatars') {
  const file = imageFile(name, kind)
  return file.exists ? await file.bytes() : null
}

export function writeAvatarBytes(name: string, bytes: Uint8Array, kind: ImageKind = 'avatars') {
  folder(kind).create({ intermediates: true, idempotent: true })
  new File(folder(kind), name).write(bytes)
}

export async function writeAvatarBase64(name: string, base64: string, kind: ImageKind = 'avatars') {
  folder(kind).create({ intermediates: true, idempotent: true })
  new File(folder(kind), name).write(toByteArray(base64))
}

export function removeAllAvatars() {
  for (const kind of ['avatars', 'backgrounds', 'attachments'] as const) {
    if (folder(kind).exists) folder(kind).delete()
  }
}

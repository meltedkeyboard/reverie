import { toByteArray } from 'base64-js'
import { Directory, File } from 'expo-file-system'

import { newAvatarName } from '@/lib/images'
import { extensionOf, movingFormat, movingKind } from '@/lib/media'
import { dataDirectory } from '@/lib/storage'

// `attachments` holds the pictures sent in messages.
export type ImageKind = 'avatars' | 'backgrounds' | 'attachments'

// Only the file name goes into the database. The absolute path of the app
// container changes between installs and updates, so it is resolved on read.
const folder = (kind: ImageKind) => new Directory(dataDirectory(), kind)

// The folder of a kind, created when it is first written to.
function writableFolder(kind: ImageKind) {
  const dir = folder(kind)
  dir.create({ intermediates: true, idempotent: true })
  return dir
}

// A temporary file copied into the store under a new name.
async function copyIntoStore(tempUri: string, kind: ImageKind, extension: string) {
  const name = newAvatarName(extension)
  await new File(tempUri).copy(new File(writableFolder(kind), name))
  return name
}

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
  // A moving avatar keeps its own format; everything else was already made a JPEG.
  return copyIntoStore(tempUri, kind, movingKind(tempUri) === 'video' ? extensionOf(tempUri) : (movingFormat(tempUri) ?? 'jpg'))
}

// An original is kept exactly as it was picked, in its own format, next to the framed copy.
export async function persistOriginal(tempUri: string, kind: ImageKind = 'avatars') {
  return copyIntoStore(tempUri, kind, extensionOf(tempUri) || 'jpg')
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
  new File(writableFolder(kind), name).write(bytes)
}

export async function writeAvatarBase64(name: string, base64: string, kind: ImageKind = 'avatars') {
  new File(writableFolder(kind), name).write(toByteArray(base64))
}

export function removeAllAvatars() {
  for (const kind of ['avatars', 'backgrounds', 'attachments'] as const) {
    if (folder(kind).exists) folder(kind).delete()
  }
}

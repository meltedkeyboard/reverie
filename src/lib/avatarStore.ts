import { toByteArray } from 'base64-js'
import { Directory, File, Paths } from 'expo-file-system'

// Only the file name goes into the database. The absolute path of the app
// container changes between installs and updates, so it is resolved on read.
const avatarDir = new Directory(Paths.document, 'avatars')

function avatarFile(name: string) {
  return new File(avatarDir, name)
}

export function avatarUri(name: string): string | null {
  return avatarFile(name).uri
}

export async function persistAvatar(tempUri: string) {
  avatarDir.create({ intermediates: true, idempotent: true })
  const name = `${Date.now()}.jpg`
  await new File(tempUri).copy(avatarFile(name))
  return name
}

export function removeAvatar(name: string) {
  const file = avatarFile(name)
  if (file.exists) file.delete()
}

export async function readAvatarBase64(name: string) {
  const file = avatarFile(name)
  return file.exists ? await file.base64() : null
}

export async function writeAvatarBase64(name: string, base64: string) {
  avatarDir.create({ intermediates: true, idempotent: true })
  avatarFile(name).write(toByteArray(base64))
}

export function removeAllAvatars() {
  if (avatarDir.exists) avatarDir.delete()
}

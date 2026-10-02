import { toByteArray } from 'base64-js'
import { Directory, File, Paths } from 'expo-file-system'
import * as MediaLibrary from 'expo-media-library/legacy'

import { t } from '@/i18n'
import { saveAsSheet } from '../../modules/reverie-save-as'

// "backup.json" -> "backup (2).json" when the folder already has one, so an old backup
// is never overwritten.
function freeName(taken: Set<string>, fileName: string) {
  if (!taken.has(fileName)) return fileName
  const dot = fileName.lastIndexOf('.')
  const base = dot === -1 ? fileName : fileName.slice(0, dot)
  const ext = dot === -1 ? '' : fileName.slice(dot)
  let n = 2
  while (taken.has(`${base} (${n})${ext}`)) n++
  return `${base} (${n})${ext}`
}

// Shows the Files "Save as" sheet, where the user picks the folder and can change the name,
// instead of the share sheet, so the file can't end up in a messenger by a stray tap.
// Cancelling just does nothing.
export async function saveFile(
  fileName: string,
  contents: string | Uint8Array,
  mimeType: string
): Promise<{ name: string; folder: string } | null> {
  if (saveAsSheet) {
    const draft = new File(Paths.cache, fileName)
    draft.create({ overwrite: true })
    draft.write(contents)
    try {
      return await saveAsSheet.saveAs(draft.uri)
    } finally {
      if (draft.exists) draft.delete()
    }
  }
  return saveToPickedFolder(fileName, contents, mimeType)
}

export const saveJson = (fileName: string, contents: string) => saveFile(fileName, contents, 'application/json')

// Without the native sheet (Expo Go) only a folder can be asked for, and the name is made
// free here.
async function saveToPickedFolder(fileName: string, contents: string | Uint8Array, mimeType: string) {
  let dir: Directory
  try {
    dir = await Directory.pickDirectoryAsync()
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return null
    throw err
  }
  const taken = new Set(dir.list().map((item) => item.name))
  const name = freeName(taken, fileName)
  dir.createFile(name, mimeType).write(contents)
  return { name, folder: dir.name }
}

// Puts the picture straight into Photos. Only permission to add is asked for, so the app
// never gets to see the library.
export async function saveImage(uri: string) {
  const inline = uri.match(/^data:image\/(\w+);base64,(.*)$/)
  if (inline) return saveImageBytes(toByteArray(inline[2]), inline[1] === 'jpeg' ? 'jpg' : inline[1])
  await requireAddPermission()
  await MediaLibrary.saveToLibraryAsync(uri)
}

// Image data, which Photos only takes as a local file with an extension.
export async function saveImageBytes(bytes: Uint8Array, extension: string) {
  await requireAddPermission()
  const out = new File(Paths.cache, `image-${Date.now()}.${extension}`)
  out.create({ overwrite: true })
  out.write(bytes)
  try {
    await MediaLibrary.saveToLibraryAsync(out.uri)
  } finally {
    if (out.exists) out.delete()
  }
}

async function requireAddPermission() {
  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo'])
  if (!permission.granted) throw new Error(t('images.savePermission'))
}

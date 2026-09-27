import { toByteArray } from 'base64-js'
import { Directory, File, Paths } from 'expo-file-system'
import * as MediaLibrary from 'expo-media-library/legacy'

import { t } from '@/i18n'

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

// Asks for a folder instead of opening the share sheet, so the file can't end up in a
// messenger by a stray tap. Cancelling the picker just does nothing.
export async function saveJson(fileName: string, contents: string): Promise<{ name: string; folder: string } | null> {
  let dir: Directory
  try {
    dir = await Directory.pickDirectoryAsync()
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return null
    throw err
  }
  const taken = new Set(dir.list().map((item) => item.name))
  const name = freeName(taken, fileName)
  dir.createFile(name, 'application/json').write(contents)
  return { name, folder: dir.name }
}

// Puts the picture straight into Photos. Only permission to add is asked for, so the app
// never gets to see the library.
export async function saveImage(uri: string) {
  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo'])
  if (!permission.granted) throw new Error(t('images.savePermission'))

  // Photos takes only a local file, and one with an extension.
  const inline = uri.match(/^data:image\/(\w+);base64,(.*)$/)
  const out = inline ? new File(Paths.cache, `image-${Date.now()}.${inline[1] === 'jpeg' ? 'jpg' : inline[1]}`) : null
  if (out && inline) {
    out.create({ overwrite: true })
    out.write(toByteArray(inline[2]))
  }
  try {
    await MediaLibrary.saveToLibraryAsync(out?.uri ?? uri)
  } finally {
    if (out?.exists) out.delete()
  }
}

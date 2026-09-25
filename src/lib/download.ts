import { toByteArray } from 'base64-js'
import { Directory, File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

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

// The share sheet has "Save Image", which puts the picture into Photos without the
// app asking for photo library access.
export async function saveImage(uri: string) {
  let target = uri
  const inline = uri.match(/^data:image\/(\w+);base64,(.*)$/)
  if (inline) {
    const out = new File(Paths.cache, `image-${Date.now()}.${inline[1] === 'jpeg' ? 'jpg' : inline[1]}`)
    out.create({ overwrite: true })
    out.write(toByteArray(inline[2]))
    target = out.uri
  }
  await Sharing.shareAsync(target)
}

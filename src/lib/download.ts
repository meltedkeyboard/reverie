import { toByteArray } from 'base64-js'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

export async function saveJson(fileName: string, contents: string) {
  const out = new File(Paths.cache, fileName)
  out.create({ overwrite: true })
  out.write(contents)
  await Sharing.shareAsync(out.uri, { mimeType: 'application/json', UTI: 'public.json' })
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

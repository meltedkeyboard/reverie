import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

export async function saveJson(fileName: string, contents: string) {
  const out = new File(Paths.cache, fileName)
  out.create({ overwrite: true })
  out.write(contents)
  await Sharing.shareAsync(out.uri, { mimeType: 'application/json', UTI: 'public.json' })
}

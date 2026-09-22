import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'

export async function pickJsonFile(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json' })
  if (picked.canceled) return null
  return await new File(picked.assets[0].uri).text()
}

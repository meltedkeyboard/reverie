import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'

// A backup file: a zip, or the single JSON file older versions wrote.
export async function pickBackupFile(): Promise<Uint8Array | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/x-zip-compressed', 'application/json'],
  })
  if (picked.canceled) return null
  return await new File(picked.assets[0].uri).bytes()
}

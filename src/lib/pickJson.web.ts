import * as DocumentPicker from 'expo-document-picker'

export async function pickJsonFile(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json' })
  if (picked.canceled) return null
  const asset = picked.assets[0]
  if (asset.file) return await asset.file.text()
  return await (await fetch(asset.uri)).text()
}

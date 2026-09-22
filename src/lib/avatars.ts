import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'

// Picking and resizing work the same everywhere; only storage differs per platform.
export { avatarUri, persistAvatar, removeAvatar, readAvatarBase64, writeAvatarBase64, removeAllAvatars } from './avatarStore'

export async function pickAvatar() {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  })
  if (picked.canceled) return null

  const resized = await ImageManipulator.manipulate(picked.assets[0].uri).resize({ width: 512 }).renderAsync()
  const saved = await resized.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 })
  return saved.uri
}

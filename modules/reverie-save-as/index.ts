import { requireOptionalNativeModule } from 'expo'
import { Platform } from 'react-native'

type SaveAsModule = {
  saveAs(fileUri: string): Promise<{ name: string; folder: string } | null>
}

// Missing in Expo Go and on the web.
export const saveAsSheet = Platform.OS === 'ios' ? requireOptionalNativeModule<SaveAsModule>('ReverieSaveAs') : null

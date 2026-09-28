import { requireOptionalNativeModule } from 'expo'

type SaveAsModule = {
  saveAs(fileUri: string): Promise<{ name: string; folder: string } | null>
}

// Missing in Expo Go.
export const saveAsSheet = requireOptionalNativeModule<SaveAsModule>('ReverieSaveAs')

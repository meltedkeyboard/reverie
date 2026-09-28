import { requireOptionalNativeModule } from 'expo'
import { Platform } from 'react-native'

type CloudFolderModule = {
  pickFolder(): Promise<string | null>
  folderName(): string | null
  forgetFolder(): void
  list(path: string): Promise<string[]>
  copyIn(path: string, localUri: string): Promise<void>
  copyOut(localUri: string, path: string): Promise<void>
  remove(path: string): Promise<void>
}

// Missing in Expo Go and on the web, where there is nothing to sync with.
export const cloudFolder = Platform.OS === 'ios' ? requireOptionalNativeModule<CloudFolderModule>('ReverieCloudFolder') : null

import { requireOptionalNativeModule } from 'expo'

type CloudFolderModule = {
  pickFolder(): Promise<string | null>
  folderName(): string | null
  forgetFolder(): void
  list(path: string): Promise<string[]>
  copyIn(path: string, localUri: string): Promise<void>
  copyOut(localUri: string, path: string): Promise<void>
  remove(path: string): Promise<void>
}

// Missing in Expo Go.
export const cloudFolder = requireOptionalNativeModule<CloudFolderModule>('ReverieCloudFolder')

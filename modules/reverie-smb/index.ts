import { requireOptionalNativeModule } from 'expo'

export type SmbConfig = {
  host: string
  port?: number
  share: string
  path?: string
  username?: string
  password?: string
  domain?: string
}

export type SmbFileItem = {
  name: string
  isDirectory: boolean
  size: number
  modifiedAt: number
}

export type SmbTestResult = {
  ok: boolean
  protocol?: string
  error?: string
}

export type SmbNativeModule = {
  testConnection(config: SmbConfig): Promise<SmbTestResult>
  listShares(config: SmbConfig): Promise<string[]>
  listDirectory(config: SmbConfig, path: string): Promise<SmbFileItem[]>
  createDirectory(config: SmbConfig, path: string): Promise<void>
  list(config: SmbConfig, path: string): Promise<string[]>
  copyIn(config: SmbConfig, path: string, localUri: string): Promise<void>
  copyOut(config: SmbConfig, localUri: string, path: string): Promise<void>
  remove(config: SmbConfig, path: string): Promise<void>
  savePassword(key: string, secret: string): Promise<void>
  getPassword(key: string): Promise<string | null>
  deletePassword(key: string): Promise<void>
}

// Missing in Expo Go or non-Apple builds unless mocked.
export const reverieSmb = requireOptionalNativeModule<SmbNativeModule>('ReverieSmb')

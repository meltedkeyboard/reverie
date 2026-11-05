import type { SmbConfig, SmbFileItem, SmbNativeModule, SmbTestResult } from './index'

export type { SmbConfig, SmbFileItem, SmbNativeModule, SmbTestResult }

const passwords = new Map<string, string>()

// In-memory mock for web development and tests.
export const reverieSmb: SmbNativeModule = {
  testConnection: async (config: SmbConfig): Promise<SmbTestResult> => {
    await new Promise((r) => setTimeout(r, 600))
    if (!config.host.trim()) return { ok: false, error: 'Host is required' }
    return { ok: true, protocol: 'SMB 3.1.1 (Mock)' }
  },
  listShares: async (): Promise<string[]> => {
    await new Promise((r) => setTimeout(r, 400))
    return ['backups', 'public', 'reverie']
  },
  listDirectory: async (_config: SmbConfig, path: string): Promise<SmbFileItem[]> => {
    await new Promise((r) => setTimeout(r, 300))
    if (!path || path === '/') {
      return [
        { name: 'Reverie Sync', isDirectory: true, size: 0, modifiedAt: Date.now() - 3600000 },
        { name: 'Photos', isDirectory: true, size: 0, modifiedAt: Date.now() - 86400000 },
        { name: 'Notes', isDirectory: true, size: 0, modifiedAt: Date.now() - 172800000 },
      ]
    }
    return [
      { name: 'manifest.json', isDirectory: false, size: 124, modifiedAt: Date.now() - 60000 },
      { name: 'reverie.db', isDirectory: false, size: 524288, modifiedAt: Date.now() - 60000 },
      { name: 'avatars', isDirectory: true, size: 0, modifiedAt: Date.now() - 60000 },
    ]
  },
  createDirectory: async (): Promise<void> => {},
  list: async (): Promise<string[]> => ['manifest.json', 'reverie.db'],
  copyIn: async (): Promise<void> => {},
  copyOut: async (): Promise<void> => {},
  remove: async (): Promise<void> => {},
  savePassword: async (key: string, secret: string): Promise<void> => {
    passwords.set(key, secret)
  },
  getPassword: async (key: string): Promise<string | null> => {
    return passwords.get(key) ?? null
  },
  deletePassword: async (key: string): Promise<void> => {
    passwords.delete(key)
  },
}

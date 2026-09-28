// The browser has no iCloud Drive folder to sync with.
export const cloudSyncAvailable = false

export type SyncOutcome = 'pushed' | 'pulled' | 'unchanged' | 'conflict'

export type SyncMode = 'auto' | 'push-only' | 'local' | 'cloud'

export async function syncWithCloud(_mode: SyncMode = 'auto'): Promise<SyncOutcome> {
  return 'unchanged'
}

export async function pickCloudFolder(): Promise<string | null> {
  return null
}

export function cloudFolderName(): string | null {
  return null
}

export function forgetCloudFolder() {}

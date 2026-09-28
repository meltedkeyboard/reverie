import type { SQLiteDatabase } from 'expo-sqlite'

import { getFlag, getSetting, setFlag, setSetting } from '@/db/settings'

// iCloud sync keeps its state here, on this device only: app_settings never leaves it.
const ENABLED_KEY = 'icloud_sync'
// Set by the triggers of the last migration in schema.ts on any change to the synced tables.
const DIRTY_KEY = 'sync_dirty'
// The revision of the iCloud copy this device last matched, pushed or pulled.
const REV_KEY = 'sync_rev'
const SYNCED_AT_KEY = 'sync_at'

export function isCloudSyncEnabled(db: SQLiteDatabase) {
  return getFlag(db, ENABLED_KEY, false)
}

export function setCloudSyncEnabled(db: SQLiteDatabase, enabled: boolean) {
  return setFlag(db, ENABLED_KEY, enabled)
}

export async function getSyncState(db: SQLiteDatabase) {
  const [dirty, rev, syncedAt] = await Promise.all([getSetting(db, DIRTY_KEY), getSetting(db, REV_KEY), getSetting(db, SYNCED_AT_KEY)])
  return { dirty: dirty === '1', rev, syncedAt: syncedAt ? Number(syncedAt) : null }
}

export function setDirty(db: SQLiteDatabase, dirty: boolean) {
  return setFlag(db, DIRTY_KEY, dirty)
}

export async function markSynced(db: SQLiteDatabase, rev: string) {
  await setSetting(db, REV_KEY, rev)
  await setFlag(db, DIRTY_KEY, false)
  await setSetting(db, SYNCED_AT_KEY, String(Date.now()))
}

export function markChecked(db: SQLiteDatabase) {
  return setSetting(db, SYNCED_AT_KEY, String(Date.now()))
}

// After a new folder is picked, what is in it has nothing to do with the revision this
// device knew, so the first sync treats both sides as changed.
export async function forgetSyncRev(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM app_settings WHERE key IN (?, ?)', [REV_KEY, SYNCED_AT_KEY])
}

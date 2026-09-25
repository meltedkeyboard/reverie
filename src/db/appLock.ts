import type { SQLiteDatabase } from 'expo-sqlite'

import { getSetting, setSetting } from '@/db/settings'

// Ask for Face ID whenever the app is opened. Off unless turned on in Settings.
const ENABLED_KEY = 'app_lock'

export async function isAppLockEnabled(db: SQLiteDatabase) {
  return (await getSetting(db, ENABLED_KEY)) === '1'
}

export function setAppLockEnabled(db: SQLiteDatabase, enabled: boolean) {
  return setSetting(db, ENABLED_KEY, enabled ? '1' : '0')
}

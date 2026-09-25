import type { SQLiteDatabase } from 'expo-sqlite'

import { getFlag, setFlag } from '@/db/settings'

// Ask for Face ID whenever the app is opened. Off unless turned on in Settings.
const ENABLED_KEY = 'app_lock'

// Last known value, readable synchronously: the app switcher snapshot is taken the moment
// the app goes inactive, too soon to wait for a database read.
let cached = false

export function isAppLockEnabledCached() {
  return cached
}

export async function isAppLockEnabled(db: SQLiteDatabase) {
  cached = await getFlag(db, ENABLED_KEY, false)
  return cached
}

export async function setAppLockEnabled(db: SQLiteDatabase, enabled: boolean) {
  await setFlag(db, ENABLED_KEY, enabled)
  cached = enabled
}

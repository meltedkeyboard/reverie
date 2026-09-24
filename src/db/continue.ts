import type { SQLiteDatabase } from 'expo-sqlite'

import { getSetting, setSetting } from '@/db/settings'

// The home screen's button back into the last chat. It is on unless turned off in
// Settings; a swipe hides it only until the user opens a chat again.
const ENABLED_KEY = 'continue_button'
const HIDDEN_KEY = 'continue_hidden'

export async function isContinueEnabled(db: SQLiteDatabase) {
  return (await getSetting(db, ENABLED_KEY)) !== '0'
}

export function setContinueEnabled(db: SQLiteDatabase, enabled: boolean) {
  return setSetting(db, ENABLED_KEY, enabled ? '1' : '0')
}

export async function isContinueHidden(db: SQLiteDatabase) {
  return (await getSetting(db, HIDDEN_KEY)) === '1'
}

export function setContinueHidden(db: SQLiteDatabase, hidden: boolean) {
  return setSetting(db, HIDDEN_KEY, hidden ? '1' : '0')
}

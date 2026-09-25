import type { SQLiteDatabase } from 'expo-sqlite'

import { getFlag, setFlag } from '@/db/settings'

// The home screen's button back into the last chat. It is on unless turned off in
// Settings; a swipe hides it only until the user opens a chat again.
const ENABLED_KEY = 'continue_button'
const HIDDEN_KEY = 'continue_hidden'

export function isContinueEnabled(db: SQLiteDatabase) {
  return getFlag(db, ENABLED_KEY, true)
}

export function setContinueEnabled(db: SQLiteDatabase, enabled: boolean) {
  return setFlag(db, ENABLED_KEY, enabled)
}

export function isContinueHidden(db: SQLiteDatabase) {
  return getFlag(db, HIDDEN_KEY, false)
}

export function setContinueHidden(db: SQLiteDatabase, hidden: boolean) {
  return setFlag(db, HIDDEN_KEY, hidden)
}

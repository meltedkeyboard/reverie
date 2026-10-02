import type { SQLiteDatabase } from 'expo-sqlite'

import { getFlag, setFlag } from '@/db/settings'

// The model's guess at the user's next message, shown as the field's placeholder after
// each reply. Off unless turned on in Settings.
const ENABLED_KEY = 'reply_suggestions'

export function isSuggestionsEnabled(db: SQLiteDatabase) {
  return getFlag(db, ENABLED_KEY, false)
}

export function setSuggestionsEnabled(db: SQLiteDatabase, enabled: boolean) {
  return setFlag(db, ENABLED_KEY, enabled)
}

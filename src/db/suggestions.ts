import type { SQLiteDatabase } from 'expo-sqlite'

import { getFlag, setFlag } from '@/db/settings'

// The model's guess at the user's next message, shown as the field's placeholder after
// each reply. Off unless turned on in Settings.
const ENABLED_KEY = 'reply_suggestions'

export function isSuggestionsEnabled(db: SQLiteDatabase) {
  return getFlag(db, ENABLED_KEY, false)
}

// The flying arrows in the field that show the swipes. On unless turned off in Settings.
const HINTS_KEY = 'reply_suggestion_hints'

export function areSuggestionHintsEnabled(db: SQLiteDatabase) {
  return getFlag(db, HINTS_KEY, true)
}

export function setSuggestionHintsEnabled(db: SQLiteDatabase, enabled: boolean) {
  return setFlag(db, HINTS_KEY, enabled)
}

export function setSuggestionsEnabled(db: SQLiteDatabase, enabled: boolean) {
  return setFlag(db, ENABLED_KEY, enabled)
}

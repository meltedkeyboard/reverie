import type { SQLiteDatabase } from 'expo-sqlite'

import { getFlag, setFlag } from '@/db/settings'

// The eye button in the header of a chat or a scene that opens a private question to the
// model about it. On unless turned off in Settings.
const ENABLED_KEY = 'private_chat_button'

export function isPrivateChatEnabled(db: SQLiteDatabase) {
  return getFlag(db, ENABLED_KEY, true)
}

export function setPrivateChatEnabled(db: SQLiteDatabase, enabled: boolean) {
  return setFlag(db, ENABLED_KEY, enabled)
}

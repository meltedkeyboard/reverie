import type { SQLiteDatabase } from 'expo-sqlite'

import { getSetting, setSetting } from '@/db/settings'

// The eye button in a chat's header that opens a private chat. On unless turned off in Settings.
const ENABLED_KEY = 'private_chat_button'

export async function isPrivateChatEnabled(db: SQLiteDatabase) {
  return (await getSetting(db, ENABLED_KEY)) !== '0'
}

export function setPrivateChatEnabled(db: SQLiteDatabase, enabled: boolean) {
  return setSetting(db, ENABLED_KEY, enabled ? '1' : '0')
}

import type { SQLiteDatabase } from 'expo-sqlite'

import { getFlag, setFlag } from '@/db/settings'
import { setConfirmDeleteOn } from '@/lib/confirmDelete'

// Ask before deleting a chat or a character. On unless turned off in Settings.
const KEY = 'confirm_delete'

export async function isConfirmDeleteEnabled(db: SQLiteDatabase) {
  const on = await getFlag(db, KEY, true)
  setConfirmDeleteOn(on)
  return on
}

export async function setConfirmDeleteEnabled(db: SQLiteDatabase, enabled: boolean) {
  setConfirmDeleteOn(enabled)
  await setFlag(db, KEY, enabled)
}

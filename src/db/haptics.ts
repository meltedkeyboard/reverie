import type { SQLiteDatabase } from 'expo-sqlite'

import { getFlag, setFlag } from '@/db/settings'
import { setHapticsOn } from '@/lib/hapticsState'

// Vibration feedback across the app. On unless turned off in Settings.
const KEY = 'haptics'

export async function isHapticsEnabled(db: SQLiteDatabase) {
  const on = await getFlag(db, KEY, true)
  setHapticsOn(on)
  return on
}

export async function setHapticsEnabled(db: SQLiteDatabase, enabled: boolean) {
  setHapticsOn(enabled)
  await setFlag(db, KEY, enabled)
}

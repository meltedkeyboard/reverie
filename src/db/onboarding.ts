import type { SQLiteDatabase } from 'expo-sqlite'

import { getFlag, setFlag } from '@/db/settings'

const KEY = 'onboarding_completed'

export function isOnboardingComplete(db: SQLiteDatabase) {
  return getFlag(db, KEY, false)
}

export function setOnboardingComplete(db: SQLiteDatabase, done: boolean) {
  return setFlag(db, KEY, done)
}

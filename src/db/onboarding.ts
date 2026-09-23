import type { SQLiteDatabase } from 'expo-sqlite'

import { getSetting, setSetting } from '@/db/settings'

const KEY = 'onboarding_completed'

export async function isOnboardingComplete(db: SQLiteDatabase) {
  return (await getSetting(db, KEY)) === '1'
}

export function setOnboardingComplete(db: SQLiteDatabase, done: boolean) {
  return setSetting(db, KEY, done ? '1' : '0')
}

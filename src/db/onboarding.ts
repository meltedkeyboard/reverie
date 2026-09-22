import type { SQLiteDatabase } from 'expo-sqlite'

const KEY = 'onboarding_completed'

export async function isOnboardingComplete(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', KEY)
  return row?.value === '1'
}

export async function setOnboardingComplete(db: SQLiteDatabase, done: boolean) {
  await db.runAsync(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [KEY, done ? '1' : '0']
  )
}

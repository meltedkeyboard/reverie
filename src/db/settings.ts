import type { SQLiteDatabase } from 'expo-sqlite'

export type ServerSettings = {
  baseUrl: string
  apiKey: string
  model: string
}

export const DEFAULT_SETTINGS: ServerSettings = {
  baseUrl: '',
  apiKey: 'not-needed',
  model: 'local-model',
}

const KEYS = { baseUrl: 'base_url', apiKey: 'api_key', model: 'model' } as const

export async function loadSettings(db: SQLiteDatabase): Promise<ServerSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings')
  const stored = new Map(rows.map((r) => [r.key, r.value]))
  return {
    baseUrl: stored.get(KEYS.baseUrl) ?? DEFAULT_SETTINGS.baseUrl,
    apiKey: stored.get(KEYS.apiKey) ?? DEFAULT_SETTINGS.apiKey,
    model: stored.get(KEYS.model) ?? DEFAULT_SETTINGS.model,
  }
}

export async function saveSettings(db: SQLiteDatabase, settings: ServerSettings) {
  await db.withTransactionAsync(async () => {
    for (const field of Object.keys(KEYS) as (keyof typeof KEYS)[]) {
      await db.runAsync(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [KEYS[field], settings[field]]
      )
    }
  })
}

const THEME_KEY = 'theme_preference'

export async function loadThemePreference(db: SQLiteDatabase): Promise<'system' | 'light' | 'dark'> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', THEME_KEY)
  return row?.value === 'light' || row?.value === 'dark' ? row.value : 'system'
}

export async function saveThemePreference(db: SQLiteDatabase, preference: 'system' | 'light' | 'dark') {
  await db.runAsync(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [THEME_KEY, preference]
  )
}

const LOCALE_KEY = 'locale_preference'

export async function loadLocalePreference(db: SQLiteDatabase): Promise<'system' | 'ru' | 'en'> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', LOCALE_KEY)
  return row?.value === 'ru' || row?.value === 'en' ? row.value : 'system'
}

export async function saveLocalePreference(db: SQLiteDatabase, preference: 'system' | 'ru' | 'en') {
  await db.runAsync(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [LOCALE_KEY, preference]
  )
}

import type { SQLiteDatabase } from 'expo-sqlite'
import { Platform } from 'react-native'

export type ServerSettings = {
  baseUrl: string
  apiKey: string
  model: string
}

export const DEFAULT_SETTINGS: ServerSettings = {
  baseUrl: '',
  apiKey: '',
  model: '',
}

const KEYS = { baseUrl: 'base_url', apiKey: 'api_key', model: 'model' } as const

export async function getSetting(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key)
  return row?.value ?? null
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  )
}

// An on/off switch kept as '1' or '0'; nothing stored yet means defaultOn.
export async function getFlag(db: SQLiteDatabase, key: string, defaultOn: boolean) {
  const value = await getSetting(db, key)
  return value === null ? defaultOn : value === '1'
}

export function setFlag(db: SQLiteDatabase, key: string, on: boolean) {
  return setSetting(db, key, on ? '1' : '0')
}

// A stored value that must be one of a few; anything else, or nothing, is 'system'.
async function getChoice<T extends string>(db: SQLiteDatabase, key: string, allowed: readonly T[]) {
  const value = await getSetting(db, key)
  return allowed.includes(value as T) ? (value as T) : 'system'
}

export async function loadSettings(db: SQLiteDatabase): Promise<ServerSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings')
  const stored = new Map(rows.map((r) => [r.key, r.value]))
  return {
    baseUrl: stored.get(KEYS.baseUrl) ?? DEFAULT_SETTINGS.baseUrl,
    apiKey: stored.get(KEYS.apiKey) ?? DEFAULT_SETTINGS.apiKey,
    model: stored.get(KEYS.model) ?? DEFAULT_SETTINGS.model,
  }
}

// The settings screen saves on every keystroke, and withTransactionAsync is not
// exclusive: overlapping calls fail with "cannot start a transaction within a
// transaction" and the later keystrokes are lost. Saves are chained to run one at a time.
let saveQueue: Promise<void> = Promise.resolve()

export function saveSettings(db: SQLiteDatabase, settings: ServerSettings) {
  const next = saveQueue.then(() =>
    db.withTransactionAsync(async () => {
      for (const field of Object.keys(KEYS) as (keyof typeof KEYS)[]) {
        await setSetting(db, KEYS[field], settings[field])
      }
    })
  )
  saveQueue = next.catch(() => {})
  return next
}

const THEME_KEY = 'theme_preference'

export function loadThemePreference(db: SQLiteDatabase) {
  return getChoice(db, THEME_KEY, ['light', 'dark'] as const)
}

export function saveThemePreference(db: SQLiteDatabase, preference: 'system' | 'light' | 'dark') {
  return setSetting(db, THEME_KEY, preference)
}

const LOCALE_KEY = 'locale_preference'

export function loadLocalePreference(db: SQLiteDatabase) {
  return getChoice(db, LOCALE_KEY, ['ru', 'en'] as const)
}

export function saveLocalePreference(db: SQLiteDatabase, preference: 'system' | 'ru' | 'en') {
  return setSetting(db, LOCALE_KEY, preference)
}

// A family name as the system knows it, or 'System' for the font of the app's own screens.
export type ChatFont = string

export const SYSTEM_FONT = 'System'
export const DEFAULT_CHAT_FONT = Platform.OS === 'android' ? 'serif' : 'Georgia'

export const CHAT_TEXT_SCALE_RANGE = { min: 0.8, max: 1.6, default: 1 } as const

const CHAT_FONT_KEY = 'chat_font'
const CHAT_TEXT_SCALE_KEY = 'chat_text_scale'

// The first versions kept one of a few names for the family.
const LEGACY_FONTS: Record<string, string> = {
  georgia: 'Georgia',
  palatino: 'Palatino',
  iowan: 'Iowan Old Style',
  charter: 'Charter',
  avenir: 'Avenir Next',
  system: SYSTEM_FONT,
}

export async function loadChatFont(db: SQLiteDatabase): Promise<ChatFont> {
  const value = await getSetting(db, CHAT_FONT_KEY)
  if (!value) return DEFAULT_CHAT_FONT
  return LEGACY_FONTS[value] ?? value
}

export function saveChatFont(db: SQLiteDatabase, font: ChatFont) {
  return setSetting(db, CHAT_FONT_KEY, font)
}

// Whether my own messages are set in the chat font too. Off: they use the system font.
const USER_FONT_KEY = 'chat_font_user'

export function loadChatUserFont(db: SQLiteDatabase) {
  return getFlag(db, USER_FONT_KEY, false)
}

export function saveChatUserFont(db: SQLiteDatabase, on: boolean) {
  return setFlag(db, USER_FONT_KEY, on)
}

export async function loadChatTextScale(db: SQLiteDatabase) {
  const value = Number(await getSetting(db, CHAT_TEXT_SCALE_KEY))
  const { min, max, default: normal } = CHAT_TEXT_SCALE_RANGE
  return Number.isFinite(value) && value >= min && value <= max ? value : normal
}

export function saveChatTextScale(db: SQLiteDatabase, scale: number) {
  return setSetting(db, CHAT_TEXT_SCALE_KEY, String(scale))
}

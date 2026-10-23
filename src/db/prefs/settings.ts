import type { SQLiteDatabase } from 'expo-sqlite'

import { backgroundToneOf, type BackgroundEffect, type BackgroundTone } from '@/db/characters'

import {
  CHAT_MESSAGES,
  CONTEXT_MODES,
  CONTEXT_STEPS,
  DEFAULT_CONTEXT_TOKENS,
  MAX_CONTEXT_TOKENS,
  MIN_CONTEXT_TOKENS,
  ROOM_MESSAGES,
  type ContextMode,
} from '@/lib/core/context'
import { FONTS } from '@/lib/core/platform'
import { THEMES, type Scheme, type ThemeMode, type ThemeName } from '@/theme'

export type ServerSettings = {
  baseUrl: string
  apiKey: string
  model: string
  // The model's context window, as set by hand: it changes with the model, so it is not per character.
  contextTokens: number
  // Whether to limit history by message count in addition to the token window.
  limitMessages: boolean
  // How many of the latest messages to send when limitMessages is on, in chats and in rooms separately.
  chatMessages: number
  roomMessages: number
}

export const DEFAULT_SETTINGS: ServerSettings = {
  baseUrl: '',
  apiKey: '',
  model: '',
  contextTokens: DEFAULT_CONTEXT_TOKENS,
  limitMessages: false,
  chatMessages: CHAT_MESSAGES,
  roomMessages: ROOM_MESSAGES,
}

const KEYS = {
  baseUrl: 'base_url',
  apiKey: 'api_key',
  model: 'model',
  contextTokens: 'context_tokens',
  limitMessages: 'context_limit_messages',
  chatMessages: 'context_chat_messages',
  roomMessages: 'context_room_messages',
} as const

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

// A switch stored under one key. onChange mirrors the value into a synchronous in-memory
// copy, both when it is read and when it is written.
export function defineFlag(key: string, defaultOn: boolean, onChange?: (on: boolean) => void) {
  return {
    async load(db: SQLiteDatabase) {
      const on = await getFlag(db, key, defaultOn)
      onChange?.(on)
      return on
    },
    async save(db: SQLiteDatabase, on: boolean) {
      onChange?.(on)
      await setFlag(db, key, on)
    },
  }
}

// A whole number of at least 1, as stored text; anything else is the fallback.
export function positiveInt(value: string | null | undefined, fallback: number) {
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= 1 ? n : fallback
}

// A number typed into a field: the digits to show, and the count they make if it is 1 or more.
export function typedCount(text: string) {
  const digits = text.replace(/\D/g, '')
  const n = positiveInt(digits, 0)
  return { digits, count: n >= 1 ? n : null }
}

// A stored value that must be one of a few; anything else, or nothing, is the fallback.
export function defineChoice<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  return {
    async load(db: SQLiteDatabase) {
      const value = await getSetting(db, key)
      return allowed.find((v) => v === value) ?? fallback
    },
    save: (db: SQLiteDatabase, value: T) => setSetting(db, key, value),
  }
}

// A whole number from min to max under one key; anything else, or nothing, is the fallback.
export function defineNumber(key: string, min: number, max: number, fallback: number) {
  return {
    async load(db: SQLiteDatabase) {
      const n = Number(await getSetting(db, key))
      return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback
    },
    save: (db: SQLiteDatabase, value: number) => setSetting(db, key, String(value)),
  }
}

function storedContext(value: string | undefined) {
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= MIN_CONTEXT_TOKENS && n <= MAX_CONTEXT_TOKENS
    ? n
    : DEFAULT_SETTINGS.contextTokens
}

export async function loadSettings(db: SQLiteDatabase): Promise<ServerSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings')
  const stored = new Map(rows.map((r) => [r.key, r.value]))
  const rawLimit = stored.get(KEYS.limitMessages)
  const limitMessages =
    rawLimit !== undefined
      ? rawLimit === '1' || rawLimit === 'true'
      : stored.get('context_mode') === 'messages'

  return {
    baseUrl: stored.get(KEYS.baseUrl) ?? DEFAULT_SETTINGS.baseUrl,
    apiKey: stored.get(KEYS.apiKey) ?? DEFAULT_SETTINGS.apiKey,
    model: stored.get(KEYS.model) ?? DEFAULT_SETTINGS.model,
    contextTokens: storedContext(stored.get(KEYS.contextTokens)),
    limitMessages,
    chatMessages: positiveInt(stored.get(KEYS.chatMessages), DEFAULT_SETTINGS.chatMessages),
    roomMessages: positiveInt(stored.get(KEYS.roomMessages), DEFAULT_SETTINGS.roomMessages),
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
        const val = field === 'limitMessages' ? (settings.limitMessages ? '1' : '0') : String(settings[field])
        await setSetting(db, KEYS[field], val)
      }
      await setSetting(db, 'context_mode', settings.limitMessages ? 'messages' : 'tokens')
    })
  )
  saveQueue = next.catch(() => {})
  return next
}

// theme_preference once held the whole look ('warm', 'black', ...); it now holds only the
// mode, and the palette has a key of its own. A value from before is read as both.
const THEME_KEY = 'theme_name'
const THEME_MODE_KEY = 'theme_preference'
const LEGACY_THEMES: Record<string, { name: ThemeName; mode: Scheme }> = {
  warm: { name: 'warm', mode: 'light' },
  'warm-dark': { name: 'warm', mode: 'dark' },
  black: { name: 'oled', mode: 'dark' },
  grey: { name: 'neutral', mode: 'dark' },
}

export async function loadThemeName(db: SQLiteDatabase) {
  const value = await getSetting(db, THEME_KEY)
  const stored = THEMES.find((v) => v === value)
  if (stored) return stored
  const name = LEGACY_THEMES[(await getSetting(db, THEME_MODE_KEY)) ?? '']?.name ?? 'default'
  // Written at once, so a mode picked later does not lose the palette it was read from.
  await setSetting(db, THEME_KEY, name)
  return name
}

export const saveThemeName = (db: SQLiteDatabase, name: ThemeName) => setSetting(db, THEME_KEY, name)

export async function loadThemeMode(db: SQLiteDatabase): Promise<ThemeMode> {
  const value = (await getSetting(db, THEME_MODE_KEY)) ?? ''
  return LEGACY_THEMES[value]?.mode ?? (value === 'light' || value === 'dark' ? value : 'system')
}

export const saveThemeMode = (db: SQLiteDatabase, mode: ThemeMode) => setSetting(db, THEME_MODE_KEY, mode)

const localePreference = defineChoice('locale_preference', ['system', 'ru', 'en'] as const, 'system')
export const loadLocalePreference = localePreference.load
export const saveLocalePreference = localePreference.save

// A family name as the system knows it, or 'System' for the font of the app's own screens.
export type ChatFont = string

export const SYSTEM_FONT = 'System'
export const DEFAULT_CHAT_FONT: string = FONTS.prose

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
const chatUserFont = defineFlag('chat_font_user', false)
export const loadChatUserFont = chatUserFont.load
export const saveChatUserFont = chatUserFont.save

// Whether my own messages are rendered as Markdown like the replies. Off: shown as typed.
const chatUserMarkdown = defineFlag('chat_user_markdown', false)
export const loadChatUserMarkdown = chatUserMarkdown.load
export const saveChatUserMarkdown = chatUserMarkdown.save

// Whether what opens over a chat or slides out from under it (the attach menu, the cast
// sheet of a room, the drawer's list of chats) carries the chat's own background.
const chatBackdrop = defineFlag('chat_backdrop', true)
export const loadChatBackdrop = chatBackdrop.load
export const saveChatBackdrop = chatBackdrop.save

// The pattern behind a chat that has no picture of its own, from the Penpot page
// "Background Pattern"; 'none' is the plain theme background.
export const CHAT_PATTERNS = ['none', 'stars', 'two-stars', 'big-star', 'diagonal', 'scattered', 'rings', 'rings-centered', 'dots'] as const
export type ChatPatternId = (typeof CHAT_PATTERNS)[number] | 'custom'

const chatPattern = defineChoice('chat_pattern', [...CHAT_PATTERNS, 'custom'] as const, 'none')
export const loadChatPattern = chatPattern.load
export const saveChatPattern = chatPattern.save

export type ChatWallpaper = {
  file: string | null
  original: string | null
  crop: string | null
  effect: BackgroundEffect
  intensity: number
  bubbleTransparency: number
  tone: BackgroundTone
}

export const DEFAULT_CHAT_WALLPAPER: ChatWallpaper = {
  file: null,
  original: null,
  crop: null,
  effect: 'blur',
  intensity: 0.5,
  bubbleTransparency: 0.3,
  tone: 'auto',
}

const CHAT_WALLPAPER_KEYS = {
  file: 'chat_wallpaper',
  original: 'chat_wallpaper_original',
  crop: 'chat_wallpaper_crop',
  effect: 'chat_wallpaper_effect',
  intensity: 'chat_wallpaper_intensity',
  bubbleTransparency: 'chat_wallpaper_bubble_transparency',
  tone: 'chat_wallpaper_tone',
} as const

export async function loadChatWallpaper(db: SQLiteDatabase): Promise<ChatWallpaper | null> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM app_settings WHERE key IN ('${Object.values(CHAT_WALLPAPER_KEYS).join("', '")}')`
  )
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const file = map.get(CHAT_WALLPAPER_KEYS.file)
  if (!file) return null

  const original = map.get(CHAT_WALLPAPER_KEYS.original) ?? null
  const crop = map.get(CHAT_WALLPAPER_KEYS.crop) ?? null
  const rawEffect = map.get(CHAT_WALLPAPER_KEYS.effect)
  const effect: BackgroundEffect =
    rawEffect === 'blur' || rawEffect === 'dim' || rawEffect === 'dim-light' || rawEffect === 'dim-dark'
      ? rawEffect
      : 'blur'
  const rawIntensity = Number(map.get(CHAT_WALLPAPER_KEYS.intensity))
  const intensity = Number.isFinite(rawIntensity) ? rawIntensity : 0.5
  const rawTrans = Number(map.get(CHAT_WALLPAPER_KEYS.bubbleTransparency))
  const bubbleTransparency = Number.isFinite(rawTrans) ? rawTrans : 0.3

  const tone = backgroundToneOf(map.get(CHAT_WALLPAPER_KEYS.tone))

  return { file, original, crop, effect, intensity, bubbleTransparency, tone }
}

export async function saveChatWallpaper(db: SQLiteDatabase, wallpaper: ChatWallpaper | null) {
  if (!wallpaper || !wallpaper.file) {
    for (const key of Object.values(CHAT_WALLPAPER_KEYS)) {
      await db.runAsync('DELETE FROM app_settings WHERE key = ?', key)
    }
    return
  }
  await setSetting(db, CHAT_WALLPAPER_KEYS.file, wallpaper.file)
  if (wallpaper.original) await setSetting(db, CHAT_WALLPAPER_KEYS.original, wallpaper.original)
  else await db.runAsync('DELETE FROM app_settings WHERE key = ?', CHAT_WALLPAPER_KEYS.original)
  if (wallpaper.crop) await setSetting(db, CHAT_WALLPAPER_KEYS.crop, wallpaper.crop)
  else await db.runAsync('DELETE FROM app_settings WHERE key = ?', CHAT_WALLPAPER_KEYS.crop)
  await setSetting(db, CHAT_WALLPAPER_KEYS.effect, wallpaper.effect)
  await setSetting(db, CHAT_WALLPAPER_KEYS.intensity, String(wallpaper.intensity))
  await setSetting(db, CHAT_WALLPAPER_KEYS.bubbleTransparency, String(wallpaper.bubbleTransparency))
  await setSetting(db, CHAT_WALLPAPER_KEYS.tone, wallpaper.tone)
}

export async function loadChatTextScale(db: SQLiteDatabase) {
  const value = Number(await getSetting(db, CHAT_TEXT_SCALE_KEY))
  const { min, max, default: normal } = CHAT_TEXT_SCALE_RANGE
  return Number.isFinite(value) && value >= min && value <= max ? value : normal
}

export function saveChatTextScale(db: SQLiteDatabase, scale: number) {
  return setSetting(db, CHAT_TEXT_SCALE_KEY, String(scale))
}

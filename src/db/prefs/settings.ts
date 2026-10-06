import type { SQLiteDatabase } from 'expo-sqlite'

import {
  CHAT_MESSAGES,
  CONTEXT_MODES,
  CONTEXT_STEPS,
  DEFAULT_CONTEXT_TOKENS,
  ROOM_MESSAGES,
  type ContextMode,
} from '@/lib/core/context'
import { FONTS } from '@/lib/core/platform'

export type ServerSettings = {
  baseUrl: string
  apiKey: string
  model: string
  // The model's context window, as set by hand: it changes with the model, so it is not per character.
  contextTokens: number
  contextMode: ContextMode
  // How many of the latest messages the 'messages' mode sends, in chats and in rooms separately.
  chatMessages: number
  roomMessages: number
}

export const DEFAULT_SETTINGS: ServerSettings = {
  baseUrl: '',
  apiKey: '',
  model: '',
  contextTokens: DEFAULT_CONTEXT_TOKENS,
  contextMode: 'messages',
  chatMessages: CHAT_MESSAGES,
  roomMessages: ROOM_MESSAGES,
}

const KEYS = {
  baseUrl: 'base_url',
  apiKey: 'api_key',
  model: 'model',
  contextTokens: 'context_tokens',
  contextMode: 'context_mode',
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

function storedContext(value: string | undefined) {
  const n = Number(value)
  return (CONTEXT_STEPS as readonly number[]).includes(n) ? n : DEFAULT_SETTINGS.contextTokens
}

export async function loadSettings(db: SQLiteDatabase): Promise<ServerSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings')
  const stored = new Map(rows.map((r) => [r.key, r.value]))
  return {
    baseUrl: stored.get(KEYS.baseUrl) ?? DEFAULT_SETTINGS.baseUrl,
    apiKey: stored.get(KEYS.apiKey) ?? DEFAULT_SETTINGS.apiKey,
    model: stored.get(KEYS.model) ?? DEFAULT_SETTINGS.model,
    contextTokens: storedContext(stored.get(KEYS.contextTokens)),
    contextMode: CONTEXT_MODES.find((m) => m === stored.get(KEYS.contextMode)) ?? DEFAULT_SETTINGS.contextMode,
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
        await setSetting(db, KEYS[field], String(settings[field]))
      }
    })
  )
  saveQueue = next.catch(() => {})
  return next
}

const themePreference = defineChoice('theme_preference', ['system', 'light', 'dark'] as const, 'system')
export const loadThemePreference = themePreference.load
export const saveThemePreference = themePreference.save

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

// The pattern behind a chat that has no picture of its own, from the Penpot page
// "Background Pattern"; 'none' is the plain theme background.
export const CHAT_PATTERNS = ['none', 'stars', 'two-stars', 'big-star', 'diagonal', 'scattered', 'rings', 'rings-centered', 'dots'] as const
export type ChatPatternId = (typeof CHAT_PATTERNS)[number]

const chatPattern = defineChoice('chat_pattern', CHAT_PATTERNS, 'none')
export const loadChatPattern = chatPattern.load
export const saveChatPattern = chatPattern.save

export async function loadChatTextScale(db: SQLiteDatabase) {
  const value = Number(await getSetting(db, CHAT_TEXT_SCALE_KEY))
  const { min, max, default: normal } = CHAT_TEXT_SCALE_RANGE
  return Number.isFinite(value) && value >= min && value <= max ? value : normal
}

export function saveChatTextScale(db: SQLiteDatabase, scale: number) {
  return setSetting(db, CHAT_TEXT_SCALE_KEY, String(scale))
}

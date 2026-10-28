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

// One server the app can talk to. The context window is the server's: it is set to what its
// model is loaded with, and every server has a model of its own.
export type ServerProfile = {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  contextTokens: number
}

// What a request is made with: the current server, the limits on history that hold for every
// server, and the servers to try in turn when the current one does not answer (none while
// switching over is off).
export type ServerSettings = ServerProfile & {
  // Whether to limit history by message count in addition to the token window.
  limitMessages: boolean
  // How many of the latest messages to send when limitMessages is on, in chats and in rooms separately.
  chatMessages: number
  roomMessages: number
  fallbacks: ServerProfile[]
}

export const DEFAULT_SERVER: ServerProfile = {
  id: '',
  name: '',
  baseUrl: '',
  apiKey: '',
  model: '',
  contextTokens: DEFAULT_CONTEXT_TOKENS,
}

export const DEFAULT_SETTINGS: ServerSettings = {
  ...DEFAULT_SERVER,
  limitMessages: false,
  chatMessages: CHAT_MESSAGES,
  roomMessages: ROOM_MESSAGES,
  fallbacks: [],
}

export type ContextLimits = Pick<ServerSettings, 'limitMessages' | 'chatMessages' | 'roomMessages'>

const KEYS = {
  limitMessages: 'context_limit_messages',
  chatMessages: 'context_chat_messages',
  roomMessages: 'context_room_messages',
} as const

// The one server of the versions before the list, read once into its first entry.
const LEGACY_SERVER_KEYS = {
  baseUrl: 'base_url',
  apiKey: 'api_key',
  model: 'model',
  contextTokens: 'context_tokens',
} as const

const SERVERS_KEY = 'servers'
const ACTIVE_SERVER_KEY = 'active_server'
const FAILOVER_KEY = 'server_failover'

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

function limitsOf(stored: Map<string, string>): ContextLimits {
  const rawLimit = stored.get(KEYS.limitMessages)
  const limitMessages =
    rawLimit !== undefined
      ? rawLimit === '1' || rawLimit === 'true'
      : stored.get('context_mode') === 'messages'
  return {
    limitMessages,
    chatMessages: positiveInt(stored.get(KEYS.chatMessages), DEFAULT_SETTINGS.chatMessages),
    roomMessages: positiveInt(stored.get(KEYS.roomMessages), DEFAULT_SETTINGS.roomMessages),
  }
}

// The current server with the history limits, and the others in their order behind it when
// switching over is on. A request made with it needs nothing else from the database.
export async function loadSettings(db: SQLiteDatabase): Promise<ServerSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings')
  const stored = new Map(rows.map((r) => [r.key, r.value]))
  const servers = await loadServers(db)
  const active = servers.find((s) => s.id === stored.get(ACTIVE_SERVER_KEY)) ?? servers[0] ?? DEFAULT_SERVER
  const failover = stored.get(FAILOVER_KEY) !== '0'
  return {
    ...active,
    ...limitsOf(stored),
    fallbacks: failover ? servers.filter((s) => s.id !== active.id && s.baseUrl.trim()) : [],
  }
}

// The settings screen saves on every keystroke, and withTransactionAsync is not
// exclusive: overlapping calls fail with "cannot start a transaction within a
// transaction" and the later keystrokes are lost. Saves are chained to run one at a time.
let saveQueue: Promise<void> = Promise.resolve()

function queued<T>(run: () => Promise<T>) {
  const next = saveQueue.then(run)
  saveQueue = next.then(
    () => {},
    () => {}
  )
  return next
}

export function saveContextLimits(db: SQLiteDatabase, limits: ContextLimits) {
  return queued(() =>
    db.withTransactionAsync(async () => {
      await setSetting(db, KEYS.limitMessages, limits.limitMessages ? '1' : '0')
      await setSetting(db, KEYS.chatMessages, String(limits.chatMessages))
      await setSetting(db, KEYS.roomMessages, String(limits.roomMessages))
      await setSetting(db, 'context_mode', limits.limitMessages ? 'messages' : 'tokens')
    })
  )
}

// The list of servers is kept as one JSON value in app_settings, which never leaves the
// device: the folder sync copies the database without that table, so the keys stay here.
const serverListeners = new Set<() => void>()

export function onServersChanged(fn: () => void) {
  serverListeners.add(fn)
  return () => {
    serverListeners.delete(fn)
  }
}

function notifyServersChanged() {
  serverListeners.forEach((fn) => fn())
}

function newServerId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// The host of an address, the name a server goes by until it is given one.
export function serverHost(baseUrl: string) {
  return baseUrl.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '')
}

export function serverName(server: Pick<ServerProfile, 'name' | 'baseUrl'>) {
  return server.name.trim() || serverHost(server.baseUrl)
}

function profileOf(raw: unknown): ServerProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id) return null
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    id: r.id,
    name: text(r.name),
    baseUrl: text(r.baseUrl),
    apiKey: text(r.apiKey),
    model: text(r.model),
    contextTokens: storedContext(String(r.contextTokens)),
  }
}

export async function loadServers(db: SQLiteDatabase): Promise<ServerProfile[]> {
  const value = await getSetting(db, SERVERS_KEY)
  if (value !== null) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(profileOf).filter((s): s is ServerProfile => s !== null)
    } catch {
      // A broken value reads as no servers rather than locking the app out of its settings.
    }
    return []
  }
  // Several screens read the settings as the app starts; they all wait on the one move.
  legacyMove ??= moveLegacyServer(db).finally(() => {
    legacyMove = null
  })
  return legacyMove
}

let legacyMove: Promise<ServerProfile[]> | null = null

async function moveLegacyServer(db: SQLiteDatabase): Promise<ServerProfile[]> {
  const value = await getSetting(db, SERVERS_KEY)
  if (value !== null) return loadServers(db)
  const baseUrl = (await getSetting(db, LEGACY_SERVER_KEYS.baseUrl)) ?? ''
  if (!baseUrl.trim()) return []
  const first: ServerProfile = {
    id: newServerId(),
    name: '',
    baseUrl,
    apiKey: (await getSetting(db, LEGACY_SERVER_KEYS.apiKey)) ?? '',
    model: (await getSetting(db, LEGACY_SERVER_KEYS.model)) ?? '',
    contextTokens: storedContext((await getSetting(db, LEGACY_SERVER_KEYS.contextTokens)) ?? undefined),
  }
  await setSetting(db, SERVERS_KEY, JSON.stringify([first]))
  await setSetting(db, ACTIVE_SERVER_KEY, first.id)
  return [first]
}

// Every change reads the list, changes it and writes it back in the queue, so two quick
// keystrokes on two fields cannot write over each other.
function changeServers(db: SQLiteDatabase, change: (servers: ServerProfile[]) => ServerProfile[]) {
  return queued(async () => {
    const next = change(await loadServers(db))
    await setSetting(db, SERVERS_KEY, JSON.stringify(next))
    notifyServersChanged()
    return next
  })
}

export async function loadActiveServerId(db: SQLiteDatabase) {
  const servers = await loadServers(db)
  const id = await getSetting(db, ACTIVE_SERVER_KEY)
  return (servers.find((s) => s.id === id) ?? servers[0])?.id ?? null
}

export async function setActiveServer(db: SQLiteDatabase, id: string) {
  await queued(() => setSetting(db, ACTIVE_SERVER_KEY, id))
  notifyServersChanged()
}

// A new server at the end of the list; the first one is made the current one.
export async function addServer(db: SQLiteDatabase, fields: Omit<ServerProfile, 'id'>) {
  const server = { ...fields, id: newServerId() }
  const list = await changeServers(db, (servers) => [...servers, server])
  if (list.length === 1) await setActiveServer(db, server.id)
  return server
}

export function updateServer(db: SQLiteDatabase, id: string, patch: Partial<Omit<ServerProfile, 'id'>>) {
  return changeServers(db, (servers) => servers.map((s) => (s.id === id ? { ...s, ...patch } : s)))
}

// When the current server goes, the first of those left takes its place.
export async function deleteServer(db: SQLiteDatabase, id: string) {
  const active = await loadActiveServerId(db)
  const list = await changeServers(db, (servers) => servers.filter((s) => s.id !== id))
  if (active === id && list[0]) await setActiveServer(db, list[0].id)
}

// The order the servers take over in, given as their ids; one not named keeps its place at the end.
export function orderServers(db: SQLiteDatabase, ids: string[]) {
  return changeServers(db, (servers) => {
    const rank = (s: ServerProfile) => {
      const i = ids.indexOf(s.id)
      return i < 0 ? ids.length : i
    }
    return [...servers].sort((a, b) => rank(a) - rank(b))
  })
}

// Whether a server that does not answer hands the reply to the next one in the list.
const failover = defineFlag(FAILOVER_KEY, true)
export const loadFailover = failover.load
export async function saveFailover(db: SQLiteDatabase, on: boolean) {
  await failover.save(db, on)
  notifyServersChanged()
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

// The chats' background behind the Characters and Rooms tabs as well, off by default.
const homeBackground = defineFlag('home_background', false)
export const loadHomeBackground = homeBackground.load
export const saveHomeBackground = homeBackground.save

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

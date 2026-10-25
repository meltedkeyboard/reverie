import type { SQLiteDatabase } from 'expo-sqlite'
import { AppState } from 'react-native'

// What a generator sheet was left with, kept for each text it writes (a character's system
// prompt or greeting, a persona's description) until its result is put in or the user starts
// over. A sheet swiped away by accident, or an app that died under it, opens again as it was.
// Like the chat drafts, every session is held in memory, so a sheet reads its own the moment
// it comes up, and the settings table keeps them across launches.
export type GenSheetState = {
  phase: 'compose' | 'result'
  thinking: boolean
  versions: string[]
  index: number
  note: string
  viewMode: 'text' | 'diff'
  // What the model had written of a reply when the sheet went away in the middle of it.
  partial?: string
}

// `inputs` are the fields of the generator itself, by name; the pictures among them are
// kept from the sweep of attachments (see pruneAttachments).
export type GenSession = { inputs: Record<string, unknown>; sheet?: GenSheetState }

const PREFIX = 'gen_session:'
const sessions = new Map<string, GenSession>()
const unsaved = new Map<string, SQLiteDatabase>()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined

// A write waits at most this long. Unlike a draft's it is not put off by each change: a reply
// streams in for a minute or more, and what it has written so far should not wait for its end.
const SAVE_DELAY = 500

export async function loadGenSessions(db: SQLiteDatabase) {
  clearTimeout(timer)
  timer = undefined
  unsaved.clear()
  sessions.clear()
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings WHERE key LIKE ?', `${PREFIX}%`)
  for (const row of rows) {
    try {
      sessions.set(row.key.slice(PREFIX.length), JSON.parse(row.value))
    } catch {
      // A session that cannot be read is only lost work, not a reason to fail the start.
    }
  }
  listeners.forEach((listener) => listener())
}

export function getGenSession(key: string) {
  return sessions.get(key) ?? null
}

export function subscribeGenSessions(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setGenInput(db: SQLiteDatabase, key: string, name: string, value: unknown) {
  const prev = sessions.get(key)
  sessions.set(key, { ...prev, inputs: { ...prev?.inputs, [name]: value } })
  changed(db, key)
}

export function setGenSheet(db: SQLiteDatabase, key: string, sheet: GenSheetState) {
  sessions.set(key, { inputs: {}, ...sessions.get(key), sheet })
  changed(db, key)
}

export function clearGenSession(db: SQLiteDatabase, key: string) {
  if (!sessions.delete(key)) return
  changed(db, key)
}

function changed(db: SQLiteDatabase, key: string) {
  unsaved.set(key, db)
  timer ??= setTimeout(saveGenSessions, SAVE_DELAY)
  listeners.forEach((listener) => listener())
}

export async function saveGenSessions() {
  clearTimeout(timer)
  timer = undefined
  const batch = [...unsaved]
  unsaved.clear()
  for (const [key, db] of batch) {
    const session = sessions.get(key)
    try {
      if (session) {
        await db.runAsync(
          'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [PREFIX + key, JSON.stringify(session)]
        )
      } else {
        await db.runAsync('DELETE FROM app_settings WHERE key = ?', PREFIX + key)
      }
    } catch (err) {
      console.warn('Could not save the generator session', err)
    }
  }
}

// The app may be killed once it is in the background, with a write still waiting.
AppState.addEventListener('change', (state) => {
  if (state !== 'active') saveGenSessions()
})

// For pruneAttachments: the pictures the sessions still hold, under the `images` input.
export const GEN_SESSION_IMAGES_SQL = `
  SELECT json_extract(j.value, '$.file') AS name
  FROM app_settings s, json_each(s.value, '$.inputs.images') j
  WHERE s.key LIKE '${PREFIX}%' AND json_valid(s.value)
  UNION SELECT json_extract(j.value, '$.moving')
  FROM app_settings s, json_each(s.value, '$.inputs.images') j
  WHERE s.key LIKE '${PREFIX}%' AND json_valid(s.value)`

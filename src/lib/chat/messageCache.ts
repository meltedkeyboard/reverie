import type { SQLiteDatabase } from 'expo-sqlite'

import { listMessages, type Message } from '@/db/messages'

// The messages of a chat read ahead of opening it: a chat picked in the drawer then has them
// on its first render. Reading a long history was most of the wait of a switch.
type Entry = { db: SQLiteDatabase; at: number; rows: Message[] | null; read: Promise<Message[]> }

// Only another chat than the one on screen is read ahead, and nothing writes to it in the
// meantime; the limit only keeps a copy from lying around for long.
const FRESH = 30_000

const entries = new Map<number, Entry>()

const fresh = (entry: Entry | undefined, db: SQLiteDatabase): entry is Entry =>
  entry !== undefined && entry.db === db && Date.now() - entry.at < FRESH

export function prefetchMessages(db: SQLiteDatabase, chatId: number): Promise<Message[]> {
  const known = entries.get(chatId)
  if (fresh(known, db)) return known.read
  const entry: Entry = { db, at: Date.now(), rows: null, read: listMessages(db, chatId) }
  entry.read.then(
    (rows) => {
      entry.rows = rows
    },
    () => {
      if (entries.get(chatId) === entry) entries.delete(chatId)
    }
  )
  entries.set(chatId, entry)
  return entry.read
}

// The rows read ahead, if they are in by now. Taken out: from then on the chat keeps its own.
export function takeMessages(db: SQLiteDatabase, chatId: number): Message[] | null {
  const entry = entries.get(chatId)
  if (!fresh(entry, db) || !entry.rows) return null
  entries.delete(chatId)
  return entry.rows
}

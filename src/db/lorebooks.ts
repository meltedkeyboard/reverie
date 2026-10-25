import type { SQLiteDatabase } from 'expo-sqlite'

// A lorebook: entries about the world (places, people, customs, history) that go into the
// prompt only while their keys come up in the talk, so a large world costs nothing until a
// line touches it. A book is tied to the characters and rooms that use it.
export type LorebookFields = {
  name: string
  description: string
  // How many of the latest messages are searched for the keys.
  scanDepth: number
  // The most tokens the book's entries may take in one request.
  budget: number
}

export type Lorebook = LorebookFields & { id: number; createdAt: number }

export type LoreEntryFields = {
  // Comma-separated words that bring the entry in.
  keys: string
  content: string
  // In every request, keys or not.
  always: boolean
  enabled: boolean
}

export type LoreEntry = LoreEntryFields & { id: number }

export type LoreLinks = { characterIds: number[]; roomIds: number[] }

export type LorebookPreview = Lorebook & { entryCount: number; owners: string[] }

export const DEFAULT_LOREBOOK: LorebookFields = { name: '', description: '', scanDepth: 4, budget: 1024 }

export const LORE_SCAN = { min: 1, max: 20, step: 1 } as const
export const LORE_BUDGET = { min: 256, max: 8192, step: 256 } as const

const BOOK_COLUMNS = 'id, name, description, scan_depth AS scanDepth, budget, created_at AS createdAt'
const ENTRY_COLUMNS = 'id, keys, content, always, enabled'

type EntryRow = Omit<LoreEntry, 'always' | 'enabled'> & { always: number; enabled: number }

const entryOf = (row: EntryRow): LoreEntry => ({ ...row, always: Boolean(row.always), enabled: Boolean(row.enabled) })

export async function listLorebooks(db: SQLiteDatabase): Promise<LorebookPreview[]> {
  const books = await db.getAllAsync<Lorebook & { entryCount: number }>(
    `SELECT ${BOOK_COLUMNS}, (SELECT COUNT(*) FROM lore_entries e WHERE e.lorebook_id = b.id) AS entryCount
     FROM lorebooks b ORDER BY b.name COLLATE NOCASE, b.id`
  )
  const owners = await db.getAllAsync<{ lorebookId: number; name: string }>(
    `SELECT l.lorebook_id AS lorebookId, COALESCE(c.name, r.name) AS name
     FROM lorebook_links l LEFT JOIN characters c ON c.id = l.character_id LEFT JOIN rooms r ON r.id = l.room_id
     ORDER BY l.room_id IS NULL DESC, COALESCE(c.name, r.name)`
  )
  return books.map((book) => ({ ...book, owners: owners.filter((o) => o.lorebookId === book.id).map((o) => o.name) }))
}

export async function getLorebook(db: SQLiteDatabase, id: number) {
  const book = await db.getFirstAsync<Lorebook>(`SELECT ${BOOK_COLUMNS} FROM lorebooks WHERE id = ?`, id)
  if (!book) return null
  const entries = (
    await db.getAllAsync<EntryRow>(`SELECT ${ENTRY_COLUMNS} FROM lore_entries WHERE lorebook_id = ? ORDER BY position, id`, id)
  ).map(entryOf)
  return { book, entries, links: await getLinks(db, id) }
}

async function getLinks(db: SQLiteDatabase, id: number): Promise<LoreLinks> {
  const rows = await db.getAllAsync<{ characterId: number | null; roomId: number | null }>(
    'SELECT character_id AS characterId, room_id AS roomId FROM lorebook_links WHERE lorebook_id = ?',
    id
  )
  return {
    characterIds: rows.flatMap((r) => (r.characterId === null ? [] : [r.characterId])),
    roomIds: rows.flatMap((r) => (r.roomId === null ? [] : [r.roomId])),
  }
}

// Writes the book, its entries in the order given and who uses it, in one go; returns its id.
export async function saveLorebook(
  db: SQLiteDatabase,
  id: number | null,
  fields: LorebookFields,
  entries: LoreEntryFields[],
  links: LoreLinks
) {
  let bookId = id ?? 0
  await db.withTransactionAsync(async () => {
    bookId = await writeLorebook(db, id, fields, entries, links)
  })
  return bookId
}

// The same outside a transaction of its own, for an import that runs in one already.
export async function writeLorebook(
  db: SQLiteDatabase,
  id: number | null,
  fields: LorebookFields,
  entries: LoreEntryFields[],
  links: LoreLinks,
  createdAt = Date.now()
) {
  let bookId = id ?? 0
  const values = [fields.name.trim(), fields.description, fields.scanDepth, fields.budget]
  if (id === null) {
    const res = await db.runAsync(
      'INSERT INTO lorebooks (name, description, scan_depth, budget, created_at) VALUES (?, ?, ?, ?, ?)',
      [...values, createdAt]
    )
    bookId = res.lastInsertRowId
  } else {
    await db.runAsync('UPDATE lorebooks SET name = ?, description = ?, scan_depth = ?, budget = ? WHERE id = ?', [...values, id])
    await db.runAsync('DELETE FROM lore_entries WHERE lorebook_id = ?', id)
    await db.runAsync('DELETE FROM lorebook_links WHERE lorebook_id = ?', id)
  }
  for (const [position, entry] of entries.entries()) {
    await db.runAsync(
      'INSERT INTO lore_entries (lorebook_id, position, keys, content, always, enabled) VALUES (?, ?, ?, ?, ?, ?)',
      [bookId, position, entry.keys.trim(), entry.content.trim(), entry.always ? 1 : 0, entry.enabled ? 1 : 0]
    )
  }
  for (const characterId of new Set(links.characterIds)) {
    await db.runAsync('INSERT OR IGNORE INTO lorebook_links (lorebook_id, character_id) VALUES (?, ?)', [bookId, characterId])
  }
  for (const roomId of new Set(links.roomIds)) {
    await db.runAsync('INSERT OR IGNORE INTO lorebook_links (lorebook_id, room_id) VALUES (?, ?)', [bookId, roomId])
  }
  return bookId
}

export async function deleteLorebook(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM lorebooks WHERE id = ?', id)
}

export type ActiveLorebook = { book: Lorebook; entries: LoreEntry[] }

// The books a request draws on, with their enabled entries: those of the characters given
// and of the room. A book tied to several of them comes once.
export async function loreFor(db: SQLiteDatabase, owners: { characterIds: number[]; roomId?: number | null }): Promise<ActiveLorebook[]> {
  const ids = owners.characterIds
  const books = await db.getAllAsync<Lorebook>(
    `SELECT ${BOOK_COLUMNS} FROM lorebooks WHERE id IN (
       SELECT lorebook_id FROM lorebook_links
       WHERE character_id IN (${ids.map(() => '?').join(', ') || 'NULL'}) OR room_id = ?
     ) ORDER BY id`,
    [...ids, owners.roomId ?? -1]
  )
  const result: ActiveLorebook[] = []
  for (const book of books) {
    const entries = (
      await db.getAllAsync<EntryRow>(
        `SELECT ${ENTRY_COLUMNS} FROM lore_entries WHERE lorebook_id = ? AND enabled = 1 ORDER BY position, id`,
        book.id
      )
    ).map(entryOf)
    if (entries.length) result.push({ book, entries })
  }
  return result
}

// Every book with its entries and owners, for a backup.
export async function dumpLorebooks(db: SQLiteDatabase) {
  const books = await db.getAllAsync<Lorebook>(`SELECT ${BOOK_COLUMNS} FROM lorebooks ORDER BY id`)
  const result = []
  for (const book of books) {
    const entries = (
      await db.getAllAsync<EntryRow>(`SELECT ${ENTRY_COLUMNS} FROM lore_entries WHERE lorebook_id = ? ORDER BY position, id`, book.id)
    )
      .map(entryOf)
      .map(({ id: _id, ...entry }) => entry)
    result.push({ ...book, entries, links: await getLinks(db, book.id) })
  }
  return result
}

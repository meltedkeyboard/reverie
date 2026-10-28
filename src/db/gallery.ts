import { Directory, File } from 'expo-file-system'
import type { SQLiteDatabase } from 'expo-sqlite'

import { removeAvatar } from '@/lib/images/avatarStore'
import { dataDirectory } from '@/lib/core/storage'

const DAY = 24 * 60 * 60 * 1000

// One picture or video of a character's gallery. The file is in the `gallery` folder; a
// duplicated character points at the same files, so a file goes only with its last row.
export type GalleryItem = { id: number; file: string; width: number | null; height: number | null }

export type NewGalleryItem = Omit<GalleryItem, 'id'>

export function listGallery(db: SQLiteDatabase, characterId: number) {
  return db.getAllAsync<GalleryItem>(
    'SELECT id, file, width, height FROM character_gallery WHERE character_id = ? ORDER BY position, id',
    characterId
  )
}

// New items go at the end, in the order given. No transaction of its own, so a backup's
// import can run it inside its own.
export async function addToGallery(db: SQLiteDatabase, characterId: number, items: NewGalleryItem[], createdAt = Date.now()) {
  if (!items.length) return
  const last = await db.getFirstAsync<{ position: number | null }>(
    'SELECT MAX(position) AS position FROM character_gallery WHERE character_id = ?',
    characterId
  )
  let position = (last?.position ?? -1) + 1
  for (const item of items) {
    await db.runAsync(
      'INSERT INTO character_gallery (character_id, position, file, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [characterId, position++, item.file, item.width, item.height, createdAt]
    )
  }
}

export async function orderGallery(db: SQLiteDatabase, ids: number[]) {
  await db.withTransactionAsync(async () => {
    for (const [position, id] of ids.entries()) {
      await db.runAsync('UPDATE character_gallery SET position = ? WHERE id = ?', [position, id])
    }
  })
}

export async function removeFromGallery(db: SQLiteDatabase, item: GalleryItem) {
  await db.runAsync('DELETE FROM character_gallery WHERE id = ?', item.id)
  const shared = await db.getFirstAsync('SELECT 1 FROM character_gallery WHERE file = ? LIMIT 1', item.file)
  if (!shared) removeAvatar(item.file, 'gallery')
}

// A video picked from Files comes without its size, which its first frame then tells.
export async function setGallerySize(db: SQLiteDatabase, id: number, width: number, height: number) {
  await db.runAsync('UPDATE character_gallery SET width = ?, height = ? WHERE id = ?', [Math.round(width), Math.round(height), id])
}

// The copy of a character takes the same files in the same order.
export async function copyGallery(db: SQLiteDatabase, fromId: number, toId: number) {
  await db.runAsync(
    `INSERT INTO character_gallery (character_id, position, file, width, height, created_at)
     SELECT ?, position, file, width, height, created_at FROM character_gallery WHERE character_id = ? ORDER BY position, id`,
    [toId, fromId]
  )
}

// A deleted character's rows go by cascade, wherever it was deleted from, so the files no
// row points at are swept up instead, once they are a day old: a file just stored may not
// have its row yet, and one pulled by folder sync comes before the rows that name it.
export async function pruneGallery(db: SQLiteDatabase) {
  const dir = new Directory(dataDirectory(), 'gallery')
  if (!dir.exists) return
  const rows = await db.getAllAsync<{ file: string }>('SELECT DISTINCT file FROM character_gallery')
  const used = new Set(rows.map((row) => row.file))
  const cutoff = Date.now() - DAY
  for (const item of dir.list()) {
    if (!(item instanceof File) || used.has(item.name)) continue
    // Names start with the time they were made; those brought in by a backup before had
    // `import-` in front of it.
    if (Number(item.name.replace(/^import-/, '').split('-')[0]) < cutoff) item.delete()
  }
}

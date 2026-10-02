import { Directory, File } from 'expo-file-system'
import type { SQLiteDatabase } from 'expo-sqlite'

import { writeAvatarBase64 } from '@/lib/avatarStore'
import { newAvatarName } from '@/lib/images'
import { dataDirectory } from '@/lib/storage'

const LEGACY = `images LIKE '%"base64"%'`
const DAY = 24 * 60 * 60 * 1000

// Up to version 3.10 a message kept its pictures as base64 inside the row. This moves each
// to a file in `attachments` and leaves {file, width, height} in the row. Safe to run at
// every start (and after a pull of an older database): a row already moved no longer matches.
export async function convertLegacyAttachments(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ id: number }>(`SELECT id FROM messages WHERE ${LEGACY}`)
  if (!rows.length) return

  // Rewriting rows would mark the database as changed for iCloud sync, which this is not.
  const dirty = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'sync_dirty'")
  try {
    for (const { id } of rows) {
      const row = await db.getFirstAsync<{ images: string }>('SELECT images FROM messages WHERE id = ?', id)
      if (!row) continue
      const list: { base64: string; width: number; height: number }[] = JSON.parse(row.images)
      const moved = []
      for (const { base64, width, height } of list) {
        const file = newAvatarName('jpg')
        await writeAvatarBase64(file, base64, 'attachments')
        moved.push({ file, width, height })
      }
      await db.runAsync('UPDATE messages SET images = ? WHERE id = ?', [JSON.stringify(moved), id])
    }
  } finally {
    if (dirty) await db.runAsync("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sync_dirty', ?)", dirty.value)
    else await db.runAsync("DELETE FROM app_settings WHERE key = 'sync_dirty'")
  }
}

// Deletes the files no message points at any more (a deleted chat, a picture taken off a
// draft). Files made in the last day are left alone: they may belong to a message not sent
// yet. Done by sweeping instead of at every delete, since chats and characters go with
// cascades, and a duplicated chat shares the files of the original.
export async function pruneAttachments(db: SQLiteDatabase) {
  const dir = new Directory(dataDirectory(), 'attachments')
  if (!dir.exists) return
  // A row still in the old form means the files are not all named yet.
  if (await db.getFirstAsync(`SELECT 1 FROM messages WHERE ${LEGACY} LIMIT 1`)) return

  const rows = await db.getAllAsync<{ name: string | null }>(
    `SELECT DISTINCT json_extract(j.value, '$.file') AS name
     FROM messages m, json_each(m.images) j
     WHERE m.images IS NOT NULL AND json_valid(m.images)`
  )
  const used = new Set(rows.map((row) => row.name))
  const cutoff = Date.now() - DAY
  for (const item of dir.list()) {
    if (!(item instanceof File) || used.has(item.name)) continue
    // Names start with the time they were made.
    if (Number(item.name.split('-')[0]) < cutoff) item.delete()
  }
}

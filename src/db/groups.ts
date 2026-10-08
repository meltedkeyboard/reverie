import type { SQLiteDatabase } from 'expo-sqlite'

export type CharacterGroup = { id: number; name: string | null; sortOrder: number }

export function listGroups(db: SQLiteDatabase) {
  return db.getAllAsync<CharacterGroup>('SELECT id, name, sort_order AS sortOrder FROM character_groups ORDER BY sort_order DESC, id DESC')
}

// A group and a character outside any group by their place on the home list, top down.
export type HomeEntry = { kind: 'group' | 'character'; id: number }

export function setHomeOrder(db: SQLiteDatabase, entries: HomeEntry[]) {
  return db.withTransactionAsync(async () => {
    for (const [index, entry] of entries.entries()) {
      const table = entry.kind === 'group' ? 'character_groups' : 'characters'
      await db.runAsync(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [entries.length - index, entry.id])
    }
  })
}

// A group in the place of `target`, holding it first and then the dropped ones.
export async function createGroup(db: SQLiteDatabase, target: { id: number; sortOrder: number }, ids: number[]) {
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync('INSERT INTO character_groups (sort_order, created_at) VALUES (?, ?)', [target.sortOrder, Date.now()])
    await placeMembers(db, res.lastInsertRowId, [target.id, ...ids.filter((id) => id !== target.id)])
    await pruneGroups(db)
  })
}

export async function addToGroup(db: SQLiteDatabase, groupId: number, ids: number[]) {
  await db.withTransactionAsync(async () => {
    const members = await db.getAllAsync<{ id: number }>(
      'SELECT id FROM characters WHERE group_id = ? AND id NOT IN (SELECT value FROM json_each(?)) ORDER BY sort_order DESC, id DESC',
      [groupId, JSON.stringify(ids)]
    )
    await placeMembers(db, groupId, [...members.map((m) => m.id), ...ids])
    await pruneGroups(db)
  })
}

// Out of their groups, right where the group stands on the list.
export async function removeFromGroup(db: SQLiteDatabase, ids: number[]) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE characters SET sort_order = (SELECT g.sort_order FROM character_groups g WHERE g.id = characters.group_id), group_id = NULL
       WHERE group_id IS NOT NULL AND id IN (SELECT value FROM json_each(?))`,
      JSON.stringify(ids)
    )
    await pruneGroups(db)
  })
}

export async function ungroup(db: SQLiteDatabase, groupId: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE characters SET sort_order = (SELECT sort_order FROM character_groups WHERE id = ?), group_id = NULL WHERE group_id = ?',
      [groupId, groupId]
    )
    await db.runAsync('DELETE FROM character_groups WHERE id = ?', groupId)
  })
}

export function renameGroup(db: SQLiteDatabase, groupId: number, name: string) {
  return db.runAsync('UPDATE character_groups SET name = ? WHERE id = ?', [name.trim() || null, groupId])
}

export function deleteGroup(db: SQLiteDatabase, groupId: number) {
  return db.runAsync('DELETE FROM character_groups WHERE id = ?', groupId)
}

// The order of a group's members after one was moved among them, top down.
export function setMemberOrder(db: SQLiteDatabase, ids: number[]) {
  return db.withTransactionAsync(async () => {
    for (const [index, id] of ids.entries()) {
      await db.runAsync('UPDATE characters SET sort_order = ? WHERE id = ?', [ids.length - index, id])
    }
  })
}

// Members top down; sort_order runs downward like on the home list.
async function placeMembers(db: SQLiteDatabase, groupId: number, ids: number[]) {
  for (const [index, id] of ids.entries()) {
    await db.runAsync('UPDATE characters SET group_id = ?, sort_order = ? WHERE id = ?', [groupId, ids.length - index, id])
  }
}

// A group left with one character is no group: it stands alone again where the group was.
// Also after a delete, which can leave a group that small.
export async function pruneGroups(db: SQLiteDatabase) {
  await db.runAsync(
    `UPDATE characters SET sort_order = (SELECT g.sort_order FROM character_groups g WHERE g.id = characters.group_id), group_id = NULL
     WHERE group_id IN (SELECT group_id FROM characters WHERE group_id IS NOT NULL GROUP BY group_id HAVING COUNT(*) < 2)`
  )
  await db.runAsync('DELETE FROM character_groups WHERE id NOT IN (SELECT group_id FROM characters WHERE group_id IS NOT NULL)')
}

import type { SQLiteDatabase } from 'expo-sqlite'

import { PREVIEW } from '@/db/chats'
import { MESSAGE_COPY_COLUMNS } from '@/db/messages'

export type CharacterFields = {
  name: string
  avatar: string | null
  // The picture as picked, uncropped, and the frame cut from it (JSON, see ImageCrop). The
  // avatar above is that frame, kept ready to show.
  avatarOriginal: string | null
  avatarCrop: string | null
  systemPrompt: string
  greeting: string
  temperature: number
  maxTokens: number
  topP: number
  // Paragraphs kept before the reply is cut off; null leaves it unbounded.
  replyLimit: number | null
  // 'auto' leaves thinking mode to the server's own setting; 'on'/'off' override it.
  thinking: ThinkingMode
  // File name of the picture behind the character's chats, like an avatar's.
  background: string | null
  backgroundOriginal: string | null
  backgroundCrop: string | null
  backgroundEffect: BackgroundEffect
  // 0 to 1: how far the picture is blurred or dimmed.
  backgroundIntensity: number
  // 0 to 1: how see-through the user's message bubbles are over the picture.
  backgroundBubbleTransparency: number
}

export type ThinkingMode = 'auto' | 'on' | 'off'

// 'dim' lays the theme's own background over the picture; 'dim-light' and 'dim-dark' lay
// the light or the dark one whatever the theme. Stored as text, so older rows and
// backups read as they were.
export type BackgroundEffect = 'blur' | 'dim' | 'dim-light' | 'dim-dark'

export type Character = CharacterFields & { id: number; createdAt: number }

export type CharacterPreview = Character & {
  lastMessage: string | null
  lastActivity: number
  chatCount: number
}

export const DEFAULT_SAMPLING = { temperature: 0.8, maxTokens: 800, topP: 0.95 } as const

// Unqualified so the backup can select them too; in listCharacters the subqueries
// qualify their own columns, so these still refer to the outer characters row.
export const CHARACTER_COLUMNS = `
  id, name, avatar, avatar_original AS avatarOriginal, avatar_crop AS avatarCrop, system_prompt AS systemPrompt, greeting,
  temperature, max_tokens AS maxTokens, top_p AS topP, reply_limit AS replyLimit,
  thinking, background, background_original AS backgroundOriginal, background_crop AS backgroundCrop,
  background_effect AS backgroundEffect,
  background_intensity AS backgroundIntensity,
  background_bubble_transparency AS backgroundBubbleTransparency, created_at AS createdAt
`

export function listCharacters(db: SQLiteDatabase) {
  return db.getAllAsync<CharacterPreview>(`
    SELECT ${CHARACTER_COLUMNS},
      (SELECT ${PREVIEW} FROM messages m JOIN chats ch ON ch.id = m.chat_id
        WHERE ch.character_id = c.id ORDER BY m.id DESC LIMIT 1) AS lastMessage,
      COALESCE(
        (SELECT m.created_at FROM messages m JOIN chats ch ON ch.id = m.chat_id
          WHERE ch.character_id = c.id ORDER BY m.id DESC LIMIT 1),
        c.created_at
      ) AS lastActivity,
      (SELECT COUNT(*) FROM chats ch WHERE ch.character_id = c.id) AS chatCount
    FROM characters c
    ORDER BY c.sort_order DESC, c.id DESC
  `)
}

// Saves the order the user dragged the characters into; ids run from the top down.
export function setCharacterOrder(db: SQLiteDatabase, ids: number[]) {
  return db.withTransactionAsync(async () => {
    for (const [index, id] of ids.entries()) {
      await db.runAsync('UPDATE characters SET sort_order = ? WHERE id = ?', [ids.length - index, id])
    }
  })
}

export function getCharacter(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Character>(`SELECT ${CHARACTER_COLUMNS} FROM characters c WHERE c.id = ?`, id)
}

const FIELD_COLUMNS =
  'name, avatar, avatar_original, avatar_crop, system_prompt, greeting, temperature, max_tokens, top_p, reply_limit, thinking, background, background_original, background_crop, background_effect, background_intensity, background_bubble_transparency'

function fieldValues(fields: CharacterFields) {
  return [
    fields.name.trim(),
    fields.avatar,
    fields.avatarOriginal,
    fields.avatarCrop,
    fields.systemPrompt,
    fields.greeting,
    fields.temperature,
    fields.maxTokens,
    fields.topP,
    fields.replyLimit,
    fields.thinking,
    fields.background,
    fields.backgroundOriginal,
    fields.backgroundCrop,
    fields.backgroundEffect,
    fields.backgroundIntensity,
    fields.backgroundBubbleTransparency,
  ]
}

export async function insertCharacter(db: SQLiteDatabase, fields: CharacterFields, createdAt = Date.now()) {
  const res = await db.runAsync(
    `INSERT INTO characters (${FIELD_COLUMNS}, created_at) VALUES (${FIELD_COLUMNS.split(',').map(() => '?')}, ?)`,
    [...fieldValues(fields), createdAt]
  )
  return res.lastInsertRowId
}

export async function saveCharacter(db: SQLiteDatabase, id: number | null, fields: CharacterFields) {
  if (id === null) return insertCharacter(db, fields)
  await db.runAsync(
    `UPDATE characters
     SET name = ?, avatar = ?, avatar_original = ?, avatar_crop = ?, system_prompt = ?, greeting = ?, temperature = ?, max_tokens = ?, top_p = ?, reply_limit = ?, thinking = ?,
         background = ?, background_original = ?, background_crop = ?, background_effect = ?, background_intensity = ?,
         background_bubble_transparency = ?
     WHERE id = ?`,
    [...fieldValues(fields), id]
  )
  return id
}

// Copies the character together with all of its chats and messages. The copy gets its
// own avatar and background files (already written by the caller), so deleting one never
// breaks the other.
export type CopiedImages = {
  avatar: string | null
  avatarOriginal: string | null
  background: string | null
  backgroundOriginal: string | null
}

export async function duplicateCharacter(db: SQLiteDatabase, id: number, name: string, images: CopiedImages) {
  let characterId = 0
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO characters (${FIELD_COLUMNS}, created_at)
       SELECT ?, ?, ?, avatar_crop, system_prompt, greeting, temperature, max_tokens, top_p, reply_limit, thinking,
         ?, ?, background_crop, background_effect, background_intensity, background_bubble_transparency, ?
       FROM characters WHERE id = ?`,
      [name, images.avatar, images.avatarOriginal, images.background, images.backgroundOriginal, Date.now(), id]
    )
    characterId = res.lastInsertRowId
    const chats = await db.getAllAsync<{ id: number }>('SELECT id FROM chats WHERE character_id = ? ORDER BY id', id)
    for (const chat of chats) {
      const copy = await db.runAsync(
        'INSERT INTO chats (character_id, title, created_at) SELECT ?, title, created_at FROM chats WHERE id = ?',
        [characterId, chat.id]
      )
      await db.runAsync(
        `INSERT INTO messages (chat_id, ${MESSAGE_COPY_COLUMNS})
         SELECT ?, ${MESSAGE_COPY_COLUMNS}
         FROM messages WHERE chat_id = ? ORDER BY id`,
        [copy.lastInsertRowId, chat.id]
      )
    }
  })
  return characterId
}

export async function deleteCharacter(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM characters WHERE id = ?', id)
}

// The same character by what makes it one: name, prompt and greeting. Sampling, pictures and
// dates may differ, as with a backup imported twice.
export function sameCharacter(a: CharacterFields, b: CharacterFields) {
  const norm = (text: string) => text.trim()
  return norm(a.name) === norm(b.name) && norm(a.systemPrompt) === norm(b.systemPrompt) && norm(a.greeting) === norm(b.greeting)
}

// Folds `dropId` into `keepId`: its chats move over (with their messages), it takes the same
// place in every room, and then it is deleted. The kept character's own fields stay as they are.
export async function mergeCharacters(db: SQLiteDatabase, keepId: number, dropId: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE chats SET character_id = ? WHERE character_id = ?', [keepId, dropId])

    const inRooms = await db.getFirstAsync('SELECT 1 FROM room_members WHERE character_id = ?', dropId)
    if (inRooms) {
      await db.runAsync(
        `INSERT OR IGNORE INTO room_members (room_id, character_id, position, talkativeness, perception, triggers, muted, present)
         SELECT room_id, ?, position, talkativeness, perception, triggers, muted, present FROM room_members WHERE character_id = ?`,
        [keepId, dropId]
      )
      await db.runAsync('DELETE FROM room_members WHERE character_id = ?', dropId)
      await db.runAsync('UPDATE messages SET speaker_id = ? WHERE speaker_id = ?', [keepId, dropId])
      // The lists of who a line was for, who heard it and who was away name characters by id.
      const remap = (json: string | null) => {
        if (!json) return json
        const ids: number[] = JSON.parse(json)
        if (!ids.includes(dropId)) return json
        return JSON.stringify([...new Set(ids.map((id) => (id === dropId ? keepId : id)))])
      }
      const rows = await db.getAllAsync<{ id: number; addressees: string | null; audience: string | null; overheard: string | null; absent: string | null }>(
        `SELECT id, addressees, audience, overheard, absent FROM messages
         WHERE addressees IS NOT NULL OR audience IS NOT NULL OR overheard IS NOT NULL OR absent IS NOT NULL`
      )
      for (const row of rows) {
        const next = [remap(row.addressees), remap(row.audience), remap(row.overheard), remap(row.absent)]
        if (next[0] === row.addressees && next[1] === row.audience && next[2] === row.overheard && next[3] === row.absent) continue
        await db.runAsync('UPDATE messages SET addressees = ?, audience = ?, overheard = ?, absent = ? WHERE id = ?', [...next, row.id])
      }
    }

    await db.runAsync('DELETE FROM characters WHERE id = ?', dropId)
  })
}

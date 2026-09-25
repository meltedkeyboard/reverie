import type { SQLiteDatabase } from 'expo-sqlite'

import { PREVIEW } from '@/db/chats'

export type CharacterFields = {
  name: string
  avatar: string | null
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
  backgroundEffect: BackgroundEffect
  // 0 to 1: how far the picture is blurred or dimmed.
  backgroundIntensity: number
  // 0 to 1: how see-through the user's message bubbles are over the picture.
  backgroundBubbleTransparency: number
}

export type ThinkingMode = 'auto' | 'on' | 'off'

export type BackgroundEffect = 'blur' | 'dim'

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
  id, name, avatar, system_prompt AS systemPrompt, greeting,
  temperature, max_tokens AS maxTokens, top_p AS topP, reply_limit AS replyLimit,
  thinking, background, background_effect AS backgroundEffect,
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
  'name, avatar, system_prompt, greeting, temperature, max_tokens, top_p, reply_limit, thinking, background, background_effect, background_intensity, background_bubble_transparency'

function fieldValues(fields: CharacterFields) {
  return [
    fields.name.trim(),
    fields.avatar,
    fields.systemPrompt,
    fields.greeting,
    fields.temperature,
    fields.maxTokens,
    fields.topP,
    fields.replyLimit,
    fields.thinking,
    fields.background,
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
     SET name = ?, avatar = ?, system_prompt = ?, greeting = ?, temperature = ?, max_tokens = ?, top_p = ?, reply_limit = ?, thinking = ?,
         background = ?, background_effect = ?, background_intensity = ?,
         background_bubble_transparency = ?
     WHERE id = ?`,
    [...fieldValues(fields), id]
  )
  return id
}

// Copies the character together with all of its chats and messages. The copy gets its
// own avatar and background files (already written by the caller), so deleting one never
// breaks the other.
export async function duplicateCharacter(
  db: SQLiteDatabase,
  id: number,
  name: string,
  avatar: string | null,
  background: string | null
) {
  let characterId = 0
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO characters (${FIELD_COLUMNS}, created_at)
       SELECT ?, ?, system_prompt, greeting, temperature, max_tokens, top_p, reply_limit, thinking,
         ?, background_effect, background_intensity, background_bubble_transparency, ?
       FROM characters WHERE id = ?`,
      [name, avatar, background, Date.now(), id]
    )
    characterId = res.lastInsertRowId
    const chats = await db.getAllAsync<{ id: number }>('SELECT id FROM chats WHERE character_id = ? ORDER BY id', id)
    for (const chat of chats) {
      const copy = await db.runAsync(
        'INSERT INTO chats (character_id, title, created_at) SELECT ?, title, created_at FROM chats WHERE id = ?',
        [characterId, chat.id]
      )
      await db.runAsync(
        `INSERT INTO messages (chat_id, role, content, images, variants, variant, thoughts, created_at)
         SELECT ?, role, content, images, variants, variant, thoughts, created_at
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

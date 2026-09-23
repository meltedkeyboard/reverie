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
}

export type ThinkingMode = 'auto' | 'on' | 'off'

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
  thinking, created_at AS createdAt
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
    ORDER BY lastActivity DESC, c.id DESC
  `)
}

export function getCharacter(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Character>(`SELECT ${CHARACTER_COLUMNS} FROM characters c WHERE c.id = ?`, id)
}

const FIELD_COLUMNS = 'name, avatar, system_prompt, greeting, temperature, max_tokens, top_p, reply_limit, thinking'

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
  ]
}

export async function insertCharacter(db: SQLiteDatabase, fields: CharacterFields, createdAt = Date.now()) {
  const res = await db.runAsync(
    `INSERT INTO characters (${FIELD_COLUMNS}, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...fieldValues(fields), createdAt]
  )
  return res.lastInsertRowId
}

export async function saveCharacter(db: SQLiteDatabase, id: number | null, fields: CharacterFields) {
  if (id === null) return insertCharacter(db, fields)
  await db.runAsync(
    `UPDATE characters
     SET name = ?, avatar = ?, system_prompt = ?, greeting = ?, temperature = ?, max_tokens = ?, top_p = ?, reply_limit = ?, thinking = ?
     WHERE id = ?`,
    [...fieldValues(fields), id]
  )
  return id
}

export async function deleteCharacter(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM characters WHERE id = ?', id)
}

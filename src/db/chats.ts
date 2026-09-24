import type { SQLiteDatabase } from 'expo-sqlite'

import type { Character } from '@/db/characters'
import { addMessage } from '@/db/messages'

export type Chat = { id: number; characterId: number; title: string | null; createdAt: number }

export type ChatPreview = Chat & {
  lastMessage: string | null
  lastActivity: number
  messageCount: number
}

// A message that is only a picture has empty text, so the list shows a label instead.
export const PREVIEW = "CASE WHEN m.content = '' AND m.image IS NOT NULL THEN 'Фото' ELSE m.content END"

const COLUMNS = 'ch.id, ch.character_id AS characterId, ch.title, ch.created_at AS createdAt'

export function listChats(db: SQLiteDatabase, characterId: number) {
  return db.getAllAsync<ChatPreview>(
    `SELECT ${COLUMNS},
       (SELECT ${PREVIEW} FROM messages m WHERE m.chat_id = ch.id ORDER BY m.id DESC LIMIT 1) AS lastMessage,
       COALESCE(
         (SELECT created_at FROM messages m WHERE m.chat_id = ch.id ORDER BY m.id DESC LIMIT 1),
         ch.created_at
       ) AS lastActivity,
       (SELECT COUNT(*) FROM messages m WHERE m.chat_id = ch.id) AS messageCount
     FROM chats ch
     WHERE ch.character_id = ?
     ORDER BY lastActivity DESC, ch.id DESC`,
    characterId
  )
}

export function getChat(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Chat>(`SELECT ${COLUMNS} FROM chats ch WHERE ch.id = ?`, id)
}

export async function createChat(db: SQLiteDatabase, character: Character) {
  let chatId = 0
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync('INSERT INTO chats (character_id, created_at) VALUES (?, ?)', [
      character.id,
      Date.now(),
    ])
    chatId = res.lastInsertRowId
    const greeting = character.greeting.trim()
    if (greeting) await addMessage(db, chatId, 'assistant', greeting)
  })
  return chatId
}

export async function setChatTitle(db: SQLiteDatabase, id: number, title: string | null) {
  const value = title?.trim() || null
  await db.runAsync('UPDATE chats SET title = ? WHERE id = ?', [value, id])
  return value
}

export async function deleteChat(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM chats WHERE id = ?', id)
}

// A chat the user never wrote in holds at most the greeting. Such chats are dropped once
// the user is back on a list, so opening a new chat and leaving it leaves no clutter.
export async function pruneUntouchedChats(db: SQLiteDatabase) {
  await db.runAsync(`
    DELETE FROM chats
    WHERE NOT EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = chats.id AND m.role = 'user')
      AND (SELECT COUNT(*) FROM messages m WHERE m.chat_id = chats.id) <= 1
  `)
}

export type LastChat = {
  id: number
  title: string | null
  lastActivity: number
  characterName: string
  characterAvatar: string | null
}

// The chat the user wrote in most recently, for the home screen's continue button.
export function getLastChat(db: SQLiteDatabase) {
  return db.getFirstAsync<LastChat>(`
    SELECT ch.id, ch.title, c.name AS characterName, c.avatar AS characterAvatar,
      (SELECT MAX(m.created_at) FROM messages m WHERE m.chat_id = ch.id) AS lastActivity
    FROM chats ch JOIN characters c ON c.id = ch.character_id
    WHERE EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = ch.id AND m.role = 'user')
    ORDER BY lastActivity DESC, ch.id DESC
    LIMIT 1
  `)
}

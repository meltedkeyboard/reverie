import type { SQLiteDatabase } from 'expo-sqlite'

import type { Character } from '@/db/characters'
import { addMessage, MESSAGE_COPY_COLUMNS } from '@/db/messages'
import { notifyChatsChanged } from '@/lib/chat/chatEvents'

// Exactly one of characterId and roomId is set: a chat is either one-on-one or a scene.
export type Chat = { id: number; characterId: number | null; roomId: number | null; title: string | null; createdAt: number }

export type ChatPreview = Chat & {
  lastMessage: string | null
  lastActivity: number
  messageCount: number
}

// A message that is only a picture has empty text, so the list shows a label instead.
export const PREVIEW = "CASE WHEN m.content = '' AND m.images IS NOT NULL THEN 'Фото' ELSE m.content END"

export const CHAT_COLUMNS = 'ch.id, ch.character_id AS characterId, ch.room_id AS roomId, ch.title, ch.created_at AS createdAt'

export function listChats(db: SQLiteDatabase, characterId: number) {
  return db.getAllAsync<ChatPreview>(
    `SELECT ${CHAT_COLUMNS},
       (SELECT ${PREVIEW} FROM messages m WHERE m.chat_id = ch.id ORDER BY m.id DESC LIMIT 1) AS lastMessage,
       COALESCE(
         (SELECT created_at FROM messages m WHERE m.chat_id = ch.id ORDER BY m.id DESC LIMIT 1),
         ch.created_at
       ) AS lastActivity,
       (SELECT COUNT(*) FROM messages m WHERE m.chat_id = ch.id) AS messageCount
     FROM chats ch
     WHERE ch.character_id = ?
     ORDER BY ch.sort_order DESC, ch.id DESC`,
    characterId
  )
}

// Saves the order the user dragged a character's chats into; ids run from the top down.
export function setChatOrder(db: SQLiteDatabase, ids: number[]) {
  return db.withTransactionAsync(async () => {
    for (const [index, id] of ids.entries()) {
      await db.runAsync('UPDATE chats SET sort_order = ? WHERE id = ?', [ids.length - index, id])
    }
  })
}

export function getChat(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Chat>(`SELECT ${CHAT_COLUMNS} FROM chats ch WHERE ch.id = ?`, id)
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
  notifyChatsChanged()
  return chatId
}

export async function setChatTitle(db: SQLiteDatabase, id: number, title: string | null) {
  const value = title?.trim() || null
  await db.runAsync('UPDATE chats SET title = ? WHERE id = ?', [value, id])
  notifyChatsChanged()
  return value
}

// Copies the chat with all its messages, variants and thoughts; timestamps are kept.
export async function duplicateChat(db: SQLiteDatabase, id: number, title: string | null) {
  let chatId = 0
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      'INSERT INTO chats (character_id, room_id, title, created_at) SELECT character_id, room_id, ?, created_at FROM chats WHERE id = ?',
      [title, id]
    )
    chatId = res.lastInsertRowId
    await db.runAsync(
      `INSERT INTO messages (chat_id, ${MESSAGE_COPY_COLUMNS})
       SELECT ?, ${MESSAGE_COPY_COLUMNS}
       FROM messages WHERE chat_id = ? ORDER BY id`,
      [chatId, id]
    )
  })
  notifyChatsChanged()
  return chatId
}

export async function deleteChat(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM chats WHERE id = ?', id)
  notifyChatsChanged()
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

// The chat of the given kind for the continue button on its home tab: the one opened last if
// it is still there and has been written in, otherwise the one written in most recently.
// A scene shows its room's name and the avatar of the room's first member.
export function getLastChat(db: SQLiteDatabase, kind: 'character' | 'room', openedId: number | null) {
  const column = kind === 'room' ? 'room_id' : 'character_id'
  return db.getFirstAsync<LastChat>(`
    SELECT ch.id, ch.title,
      COALESCE(c.name, r.name) AS characterName,
      COALESCE(c.avatar, (SELECT mc.avatar FROM room_members rm JOIN characters mc ON mc.id = rm.character_id
        WHERE rm.room_id = r.id ORDER BY rm.position LIMIT 1)) AS characterAvatar,
      (SELECT MAX(m.created_at) FROM messages m WHERE m.chat_id = ch.id) AS lastActivity
    FROM chats ch
      LEFT JOIN characters c ON c.id = ch.character_id
      LEFT JOIN rooms r ON r.id = ch.room_id
    WHERE ch.${column} IS NOT NULL
      AND EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = ch.id AND m.role = 'user')
    ORDER BY ch.id = ? DESC, lastActivity DESC, ch.id DESC
    LIMIT 1
  `, openedId ?? -1)
}

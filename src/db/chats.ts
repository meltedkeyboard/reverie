import type { SQLiteDatabase } from 'expo-sqlite'

import type { Character, ThinkingMode } from '@/db/characters'
import { dropDraft, saveDrafts } from '@/db/drafts'
import { addMessage, MESSAGE_COPY_COLUMNS } from '@/db/messages'
import { notifyChatsChanged } from '@/lib/chat/chatEvents'

// Exactly one of characterId and roomId is set: a chat is either one-on-one or a scene.
export type Chat = {
  id: number
  characterId: number | null
  roomId: number | null
  title: string | null
  createdAt: number
  thinking?: ThinkingMode | null
  personaId?: number | null
  // Where a scene of a room stands now, kept up by the director; null for a chat.
  sceneState?: string | null
  // Long memory: what fell out of the context window, summed up, and the last message the
  // summary covers.
  recap?: string | null
  recapUpto?: number
  // The user's standing note to the model: where the story should go, the tone, the pace.
  direction?: string | null
}

export type ChatPreview = Chat & {
  lastMessage: string | null
  lastActivity: number
  messageCount: number
  // Filled in by listChatsOf from the drafts held in memory.
  draft?: string
}

// A message that is only a picture has empty text, so the list shows a label instead.
export const PREVIEW = "CASE WHEN m.content = '' AND m.images IS NOT NULL THEN 'Фото' ELSE m.content END"

export const CHAT_COLUMNS =
  'ch.id, ch.character_id AS characterId, ch.room_id AS roomId, ch.title, ch.created_at AS createdAt, ch.thinking, ch.persona_id AS personaId, ch.scene_state AS sceneState, ch.recap, ch.recap_upto AS recapUpto, ch.direction'

export async function setChatRecap(db: SQLiteDatabase, chatId: number, recap: string, upto: number) {
  await db.runAsync('UPDATE chats SET recap = ?, recap_upto = ? WHERE id = ?', [recap.trim() || null, upto, chatId])
}

export async function setSceneState(db: SQLiteDatabase, chatId: number, state: string) {
  await db.runAsync('UPDATE chats SET scene_state = ? WHERE id = ?', [state.trim() || null, chatId])
}

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
    const defaultPersona = await db.getFirstAsync<{ id: number }>('SELECT id FROM personas WHERE is_default = 1 LIMIT 1')
    const res = await db.runAsync('INSERT INTO chats (character_id, created_at, persona_id) VALUES (?, ?, ?)', [
      character.id,
      Date.now(),
      defaultPersona?.id ?? null,
    ])
    chatId = res.lastInsertRowId
    dropDraft(chatId)
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

export async function setChatThinking(db: SQLiteDatabase, id: number, thinking: ThinkingMode | null) {
  await db.runAsync('UPDATE chats SET thinking = ? WHERE id = ?', [thinking, id])
  notifyChatsChanged()
}

// Copies the chat with all its messages, variants and thoughts; timestamps are kept.
export async function duplicateChat(db: SQLiteDatabase, id: number, title: string | null) {
  let chatId = 0
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      'INSERT INTO chats (character_id, room_id, title, created_at, thinking, persona_id, scene_state, direction) SELECT character_id, room_id, ?, created_at, thinking, persona_id, scene_state, direction FROM chats WHERE id = ?',
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

// A new chat of the same owner that goes on from a message: the messages up to it, the
// settings of the chat, and its memory if that covers no more than they do. The copy's
// memory then covers the same messages under their new ids.
export async function branchChat(db: SQLiteDatabase, id: number, messageId: number, title: string | null) {
  let chatId = 0
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO chats (character_id, room_id, title, created_at, thinking, persona_id, scene_state, direction)
       SELECT character_id, room_id, ?, ?, thinking, persona_id, scene_state, direction FROM chats WHERE id = ?`,
      [title, Date.now(), id]
    )
    chatId = res.lastInsertRowId
    await db.runAsync(
      `INSERT INTO messages (chat_id, ${MESSAGE_COPY_COLUMNS})
       SELECT ?, ${MESSAGE_COPY_COLUMNS}
       FROM messages WHERE chat_id = ? AND id <= ? ORDER BY id`,
      [chatId, id, messageId]
    )
    const memory = await db.getFirstAsync<{ recap: string | null; upto: number }>('SELECT recap, recap_upto AS upto FROM chats WHERE id = ?', id)
    if (memory?.recap && memory.upto <= messageId) {
      const covered = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND id <= ?', [id, memory.upto])
      const upto = covered?.n
        ? await db.getFirstAsync<{ id: number }>('SELECT id FROM messages WHERE chat_id = ? ORDER BY id LIMIT 1 OFFSET ?', [chatId, covered.n - 1])
        : null
      await db.runAsync('UPDATE chats SET recap = ?, recap_upto = ? WHERE id = ?', [memory.recap, upto?.id ?? 0, chatId])
    }
  })
  notifyChatsChanged()
  return chatId
}

export async function setChatDirection(db: SQLiteDatabase, chatId: number, direction: string) {
  await db.runAsync('UPDATE chats SET direction = ? WHERE id = ?', [direction.trim() || null, chatId])
}

export async function deleteChat(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM chats WHERE id = ?', id)
  dropDraft(id)
  notifyChatsChanged()
}

// A chat the user never interacted with holds at most the initial greeting or opening. Such
// chats are dropped once the user is back on a list, so opening a new chat and leaving it
// leaves no clutter. `keepId` spares the chat still on screen (the list in its sidebar).
// A chat with a draft was written in, so the draft just typed is saved first.
export async function pruneUntouchedChats(db: SQLiteDatabase, keepId: number | null = null) {
  await saveDrafts()
  await db.runAsync(`
    DELETE FROM chats
    WHERE chats.id IS NOT ?
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = chats.id AND m.role = 'user')
      AND NOT EXISTS (SELECT 1 FROM chat_drafts d WHERE d.chat_id = chats.id)
      AND (
        (SELECT COUNT(*) FROM messages m WHERE m.chat_id = chats.id) = 0
        OR (
          (SELECT COUNT(*) FROM messages m WHERE m.chat_id = chats.id) = 1
          AND (
            EXISTS (
              SELECT 1 FROM characters c
              JOIN messages m ON m.chat_id = chats.id
              WHERE c.id = chats.character_id
                AND TRIM(c.greeting) != ''
                AND m.role = 'assistant'
                AND m.content = TRIM(c.greeting)
            )
            OR EXISTS (
              SELECT 1 FROM rooms r
              JOIN messages m ON m.chat_id = chats.id
              WHERE r.id = chats.room_id
                AND TRIM(r.opening) != ''
                AND m.kind = 'narration'
                AND m.content = TRIM(r.opening)
            )
          )
        )
      )
  `, keepId)
}

// The chat of a character written in last, which opening the character lands on.
export async function getLatestChatId(db: SQLiteDatabase, characterId: number) {
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT ch.id FROM chats ch
     WHERE ch.character_id = ?
     ORDER BY COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.chat_id = ch.id), ch.created_at) DESC, ch.id DESC
     LIMIT 1`,
    characterId
  )
  return row?.id ?? null
}

export type CastFace = { name: string; avatar: string | null }

// Who is in each room, in their order there: what stands for a scene where a chat shows its
// character's photo (the cast as one picture, CastMosaic).
export async function listRoomCasts(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<CastFace & { roomId: number }>(`
    SELECT rm.room_id AS roomId, c.name, c.avatar
    FROM room_members rm JOIN characters c ON c.id = rm.character_id
    ORDER BY rm.room_id, rm.position
  `)
  const casts = new Map<number, CastFace[]>()
  for (const { roomId, name, avatar } of rows) casts.set(roomId, [...(casts.get(roomId) ?? []), { name, avatar }])
  return casts
}

export type LastChat = {
  id: number
  title: string | null
  lastActivity: number
  characterName: string
  characterAvatar: string | null
  // A scene's cast, shown in place of a photo; null for a one-on-one chat.
  cast: CastFace[] | null
}

// The chat of the given kind for the continue button on its home tab: the one opened last if
// it is still there and has been written in, otherwise the one written in most recently.
// A scene shows its room's name and its cast. An archived character's chats are passed over.
export async function getLastChat(db: SQLiteDatabase, kind: 'character' | 'room', openedId: number | null): Promise<LastChat | null> {
  const column = kind === 'room' ? 'room_id' : 'character_id'
  const row = await db.getFirstAsync<Omit<LastChat, 'cast'> & { roomId: number | null }>(`
    SELECT ch.id, ch.title, ch.room_id AS roomId,
      COALESCE(c.name, r.name) AS characterName,
      COALESCE(c.avatar, (SELECT mc.avatar FROM room_members rm JOIN characters mc ON mc.id = rm.character_id
        WHERE rm.room_id = r.id ORDER BY rm.position LIMIT 1)) AS characterAvatar,
      (SELECT MAX(m.created_at) FROM messages m WHERE m.chat_id = ch.id) AS lastActivity
    FROM chats ch
      LEFT JOIN characters c ON c.id = ch.character_id
      LEFT JOIN rooms r ON r.id = ch.room_id
    WHERE ch.${column} IS NOT NULL
      AND c.archived_at IS NULL
      AND (
        EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = ch.id AND m.role = 'user')
        OR (SELECT COUNT(*) FROM messages m WHERE m.chat_id = ch.id) > 1
        OR (
          (SELECT COUNT(*) FROM messages m WHERE m.chat_id = ch.id) = 1
          AND NOT (
            (TRIM(COALESCE(c.greeting, '')) != '' AND EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = ch.id AND m.role = 'assistant' AND m.content = TRIM(c.greeting)))
            OR (TRIM(COALESCE(r.opening, '')) != '' AND EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = ch.id AND m.kind = 'narration' AND m.content = TRIM(r.opening)))
          )
        )
      )
    ORDER BY ch.id = ? DESC, lastActivity DESC, ch.id DESC
    LIMIT 1
  `, openedId ?? -1)
  if (!row) return null
  const { roomId, ...chat } = row
  return { ...chat, cast: roomId === null ? null : ((await listRoomCasts(db)).get(roomId) ?? []) }
}

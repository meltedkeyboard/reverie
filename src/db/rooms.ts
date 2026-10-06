import type { SQLiteDatabase } from 'expo-sqlite'

import { CHARACTER_COLUMNS, type BackgroundEffect, type Character } from '@/db/characters'
import { CHAT_COLUMNS, PREVIEW, type Chat, type ChatPreview } from '@/db/chats'
import { addMessage, MESSAGE_COPY_COLUMNS } from '@/db/messages'
import { notifyChatsChanged } from '@/lib/chat/chatEvents'

// Who may speak after the addressee has answered: nobody, others with a short reaction,
// or anyone the line concerns, with a full reply of their own.
export type FloorMode = 'addressee' | 'reactions' | 'open'

export type RoomFields = {
  name: string
  // The shared scene every member is told about.
  scenario: string
  // Narration a new scene opens with.
  opening: string
  // How the characters call the user; empty falls back to a neutral name.
  userName: string
  floor: FloorMode
  // The most lines the characters say in a row before it is the user's turn again.
  maxChain: number
  // Whether an extra short request may decide who speaks when the heuristics can't.
  director: boolean
  background: string | null
  // The uncropped picture and the frame cut from it, as for a character's background.
  backgroundOriginal: string | null
  backgroundCrop: string | null
  backgroundEffect: BackgroundEffect
  backgroundIntensity: number
  backgroundBubbleTransparency: number
}

export type Room = RoomFields & { id: number; createdAt: number }

export type MemberSettings = {
  characterId: number
  // 0 to 1: how eager the character is to cut in.
  talkativeness: number
  // 0 to 1: the chance to overhear a whisper meant for someone else.
  perception: number
  // Comma-separated topics the character reacts to.
  triggers: string
  // Present and listening, but speaks only when asked to.
  muted: boolean
  // In the scene at all. Someone out of it neither hears nor speaks until they come back.
  present: boolean
}

export type RoomMember = MemberSettings & { position: number; character: Character }

export type RoomPreview = Room & {
  lastMessage: string | null
  lastSpeaker: string | null
  lastActivity: number
  chatCount: number
  cast: { name: string; avatar: string | null }[]
}

export type RoomChatPreview = ChatPreview & { lastSpeaker: string | null }

export const DEFAULT_ROOM: RoomFields = {
  name: '',
  scenario: '',
  opening: '',
  userName: '',
  floor: 'addressee',
  maxChain: 3,
  director: true,
  background: null,
  backgroundOriginal: null,
  backgroundCrop: null,
  backgroundEffect: 'blur',
  backgroundIntensity: 0.5,
  backgroundBubbleTransparency: 0.3,
}

export const DEFAULT_MEMBER: Omit<MemberSettings, 'characterId'> = {
  talkativeness: 0.5,
  perception: 0.15,
  triggers: '',
  muted: false,
  present: true,
}

export const ROOM_COLUMNS = `
  id, name, scenario, opening, user_name AS userName, floor, max_chain AS maxChain, director,
  background, background_original AS backgroundOriginal, background_crop AS backgroundCrop,
  background_effect AS backgroundEffect, background_intensity AS backgroundIntensity,
  background_bubble_transparency AS backgroundBubbleTransparency, created_at AS createdAt
`

type RoomRow = Omit<Room, 'director'> & { director: number }

function fromRow<T extends RoomRow>(row: T): Omit<T, 'director'> & { director: boolean } {
  return { ...row, director: Boolean(row.director) }
}

export async function listRooms(db: SQLiteDatabase): Promise<RoomPreview[]> {
  const rows = await db.getAllAsync<RoomRow & Omit<RoomPreview, 'director' | 'cast'>>(`
    SELECT ${ROOM_COLUMNS},
      (SELECT ${PREVIEW} FROM messages m JOIN chats ch ON ch.id = m.chat_id
        WHERE ch.room_id = r.id ORDER BY m.id DESC LIMIT 1) AS lastMessage,
      (SELECT sc.name FROM messages m JOIN chats ch ON ch.id = m.chat_id LEFT JOIN characters sc ON sc.id = m.speaker_id
        WHERE ch.room_id = r.id ORDER BY m.id DESC LIMIT 1) AS lastSpeaker,
      COALESCE(
        (SELECT m.created_at FROM messages m JOIN chats ch ON ch.id = m.chat_id
          WHERE ch.room_id = r.id ORDER BY m.id DESC LIMIT 1),
        r.created_at
      ) AS lastActivity,
      (SELECT COUNT(*) FROM chats ch WHERE ch.room_id = r.id) AS chatCount
    FROM rooms r
    ORDER BY r.sort_order DESC, r.id DESC
  `)
  const cast = await db.getAllAsync<{ roomId: number; name: string; avatar: string | null }>(`
    SELECT rm.room_id AS roomId, c.name, c.avatar
    FROM room_members rm JOIN characters c ON c.id = rm.character_id
    ORDER BY rm.room_id, rm.position
  `)
  return rows.map((row) => ({
    ...fromRow(row),
    cast: cast.filter((m) => m.roomId === row.id).map(({ name, avatar }) => ({ name, avatar })),
  }))
}

export async function getRoom(db: SQLiteDatabase, id: number) {
  const row = await db.getFirstAsync<RoomRow>(`SELECT ${ROOM_COLUMNS} FROM rooms r WHERE r.id = ?`, id)
  return row ? fromRow(row) : null
}

export async function listRoomMembers(db: SQLiteDatabase, roomId: number): Promise<RoomMember[]> {
  const rows = await db.getAllAsync<
    Character & { position: number; talkativeness: number; perception: number; triggers: string; muted: number; present: number }
  >(
    `SELECT ${CHARACTER_COLUMNS}, rm.position, rm.talkativeness, rm.perception, rm.triggers, rm.muted, rm.present
     FROM room_members rm JOIN characters c ON c.id = rm.character_id
     WHERE rm.room_id = ?
     ORDER BY rm.position, c.id`,
    roomId
  )
  return rows.map(({ position, talkativeness, perception, triggers, muted, present, ...character }) => ({
    characterId: character.id,
    position,
    talkativeness,
    perception,
    triggers,
    muted: Boolean(muted),
    present: Boolean(present),
    character,
  }))
}

const FIELD_COLUMNS =
  'name, scenario, opening, user_name, floor, max_chain, director, background, background_original, background_crop, background_effect, background_intensity, background_bubble_transparency'

function fieldValues(fields: RoomFields) {
  return [
    fields.name.trim(),
    fields.scenario,
    fields.opening,
    fields.userName.trim(),
    fields.floor,
    fields.maxChain,
    fields.director ? 1 : 0,
    fields.background,
    fields.backgroundOriginal,
    fields.backgroundCrop,
    fields.backgroundEffect,
    fields.backgroundIntensity,
    fields.backgroundBubbleTransparency,
  ]
}

export async function insertRoom(db: SQLiteDatabase, fields: RoomFields, createdAt = Date.now()) {
  const res = await db.runAsync(
    `INSERT INTO rooms (${FIELD_COLUMNS}, created_at) VALUES (${FIELD_COLUMNS.split(',').map(() => '?')}, ?)`,
    [...fieldValues(fields), createdAt]
  )
  return res.lastInsertRowId
}

export async function saveRoom(db: SQLiteDatabase, id: number | null, fields: RoomFields, members: MemberSettings[]) {
  let roomId = id ?? 0
  await db.withTransactionAsync(async () => {
    if (id === null) {
      roomId = await insertRoom(db, fields)
    } else {
      await db.runAsync(
        `UPDATE rooms SET ${FIELD_COLUMNS.split(', ').map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...fieldValues(fields), id]
      )
    }
    await writeMembers(db, roomId, members)
  })
  return roomId
}

async function writeMembers(db: SQLiteDatabase, roomId: number, members: MemberSettings[]) {
  await db.runAsync('DELETE FROM room_members WHERE room_id = ?', roomId)
  for (const [position, m] of members.entries()) {
    await db.runAsync(
      `INSERT INTO room_members (room_id, character_id, position, talkativeness, perception, triggers, muted, present)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [roomId, m.characterId, position, m.talkativeness, m.perception, m.triggers.trim(), m.muted ? 1 : 0, m.present ? 1 : 0]
    )
  }
}

export async function setRoomFloor(db: SQLiteDatabase, id: number, floor: FloorMode) {
  await db.runAsync('UPDATE rooms SET floor = ? WHERE id = ?', [floor, id])
}

export async function setMemberMuted(db: SQLiteDatabase, roomId: number, characterId: number, muted: boolean) {
  await db.runAsync('UPDATE room_members SET muted = ? WHERE room_id = ? AND character_id = ?', [
    muted ? 1 : 0,
    roomId,
    characterId,
  ])
}

export async function setMemberPresent(db: SQLiteDatabase, roomId: number, characterId: number, present: boolean) {
  await db.runAsync('UPDATE room_members SET present = ? WHERE room_id = ? AND character_id = ?', [
    present ? 1 : 0,
    roomId,
    characterId,
  ])
}

// Saves the order the user dragged the rooms into; ids run from the top down.
export function setRoomOrder(db: SQLiteDatabase, ids: number[]) {
  return db.withTransactionAsync(async () => {
    for (const [index, id] of ids.entries()) {
      await db.runAsync('UPDATE rooms SET sort_order = ? WHERE id = ?', [ids.length - index, id])
    }
  })
}

export async function deleteRoom(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM rooms WHERE id = ?', id)
}

export function listRoomChats(db: SQLiteDatabase, roomId: number) {
  return db.getAllAsync<RoomChatPreview>(
    `SELECT ${CHAT_COLUMNS},
       (SELECT ${PREVIEW} FROM messages m WHERE m.chat_id = ch.id ORDER BY m.id DESC LIMIT 1) AS lastMessage,
       (SELECT sc.name FROM messages m LEFT JOIN characters sc ON sc.id = m.speaker_id
         WHERE m.chat_id = ch.id ORDER BY m.id DESC LIMIT 1) AS lastSpeaker,
       COALESCE(
         (SELECT created_at FROM messages m WHERE m.chat_id = ch.id ORDER BY m.id DESC LIMIT 1),
         ch.created_at
       ) AS lastActivity,
       (SELECT COUNT(*) FROM messages m WHERE m.chat_id = ch.id) AS messageCount
     FROM chats ch
     WHERE ch.room_id = ?
     ORDER BY ch.sort_order DESC, ch.id DESC`,
    roomId
  )
}

// The opening is stored as the narrator's line on the assistant side, so a scene the
// user never wrote in still counts as untouched and is pruned like an empty chat.
export async function createRoomChat(db: SQLiteDatabase, room: Room) {
  let chatId = 0
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync('INSERT INTO chats (room_id, created_at) VALUES (?, ?)', [room.id, Date.now()])
    chatId = res.lastInsertRowId
    const opening = room.opening.trim()
    if (opening) await addMessage(db, chatId, 'assistant', opening, { kind: 'narration' })
  })
  notifyChatsChanged()
  return chatId
}

// Copies a one-on-one chat into a room as a new scene: the character's replies become
// its lines there. Without a room one is made around that character.
export async function importChatToRoom(db: SQLiteDatabase, chatId: number, roomId: number | null) {
  const source = await db.getFirstAsync<Chat>(`SELECT ${CHAT_COLUMNS} FROM chats ch WHERE ch.id = ?`, chatId)
  if (!source?.characterId) throw new Error(`Chat ${chatId} is not a one-on-one chat`)
  const characterId = source.characterId
  let targetRoom = roomId ?? 0
  let sceneId = 0
  await db.withTransactionAsync(async () => {
    if (roomId === null) {
      const owner = await db.getFirstAsync<{ name: string }>('SELECT name FROM characters WHERE id = ?', characterId)
      targetRoom = await insertRoom(db, { ...DEFAULT_ROOM, name: owner?.name ?? '' })
    }
    const position = await db.getFirstAsync<{ next: number }>(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM room_members WHERE room_id = ?',
      targetRoom
    )
    await db.runAsync(
      `INSERT OR IGNORE INTO room_members (room_id, character_id, position, talkativeness, perception, triggers, muted)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [targetRoom, characterId, position?.next ?? 0, DEFAULT_MEMBER.talkativeness, DEFAULT_MEMBER.perception, '']
    )
    const res = await db.runAsync('INSERT INTO chats (room_id, title, created_at) VALUES (?, ?, ?)', [
      targetRoom,
      source.title,
      source.createdAt,
    ])
    sceneId = res.lastInsertRowId
    const columns = MESSAGE_COPY_COLUMNS.replace('speaker_id', "CASE role WHEN 'assistant' THEN ? END")
    await db.runAsync(
      `INSERT INTO messages (chat_id, ${MESSAGE_COPY_COLUMNS})
       SELECT ?, ${columns}
       FROM messages WHERE chat_id = ? ORDER BY id`,
      [sceneId, characterId, chatId]
    )
  })
  return { roomId: targetRoom, chatId: sceneId }
}

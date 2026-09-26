import type { SQLiteDatabase } from 'expo-sqlite'

import { CHARACTER_COLUMNS, insertCharacter, type BackgroundEffect, type ThinkingMode } from '@/db/characters'
import { MESSAGE_COLUMNS } from '@/db/messages'
import { DEFAULT_MEMBER, DEFAULT_ROOM, insertRoom, ROOM_COLUMNS, type FloorMode } from '@/db/rooms'
import { loadSettings, saveSettings } from '@/db/settings'
import { t } from '@/i18n'
import { pickJsonFile } from '@/lib/pickJson'
import { readAvatarBase64, removeAllAvatars, writeAvatarBase64, type ImageKind } from '@/lib/avatars'
import { saveJson } from '@/lib/download'

const BACKUP_VERSION = 7

type BackupCharacter = {
  id: number
  name: string
  avatar: string | null
  systemPrompt: string
  greeting: string
  temperature: number
  maxTokens: number
  topP: number
  replyLimit: number | null
  thinking?: ThinkingMode
  // Backups from before chat backgrounds leave these out.
  background?: string | null
  backgroundEffect?: BackgroundEffect
  backgroundIntensity?: number
  backgroundBubbleTransparency?: number
  createdAt: number
}

// Backups from before rooms have no roomId, and every chat has a character.
type BackupChat = { id: number; characterId: number | null; roomId?: number | null; title: string | null; createdAt: number }

type BackupRoom = {
  id: number
  name: string
  scenario: string
  opening: string
  userName: string
  floor: FloorMode
  maxChain: number
  director: number | boolean
  background: string | null
  backgroundEffect: BackgroundEffect
  backgroundIntensity: number
  backgroundBubbleTransparency: number
  createdAt: number
}

type BackupMember = {
  roomId: number
  characterId: number
  position: number
  talkativeness: number
  perception: number
  triggers: string
  muted: number
  present: number
}

type BackupMessage = {
  id: number
  chatId: number
  role: string
  content: string
  images?: string | null
  // Backups from before a message could have several pictures hold one.
  image?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
  variants: string | null
  variant: number
  thoughts: string | null
  createdAt: number
  // Room fields; character ids inside them are remapped on import.
  speakerId?: number | null
  kind?: string
  addressees?: string | null
  audience?: string | null
  overheard?: string | null
  absent?: string | null
}

type Backup = {
  app: string
  characters: BackupCharacter[]
  rooms?: BackupRoom[]
  roomMembers?: BackupMember[]
  chats: BackupChat[]
  messages: BackupMessage[]
  avatars: Record<string, string>
  settings?: { baseUrl?: string; model?: string }
}

function backupImages(message: BackupMessage) {
  if (message.images) return message.images
  if (!message.image) return null
  return JSON.stringify([{ base64: message.image, width: message.imageWidth, height: message.imageHeight }])
}

export async function exportBackup(db: SQLiteDatabase) {
  const characters = await db.getAllAsync<{ id: number; avatar: string | null; background: string | null }>(
    `SELECT ${CHARACTER_COLUMNS} FROM characters ORDER BY sort_order, id`
  )
  const rooms = await db.getAllAsync<{ background: string | null }>(`SELECT ${ROOM_COLUMNS} FROM rooms ORDER BY sort_order, id`)
  const roomMembers = await db.getAllAsync(
    `SELECT room_id AS roomId, character_id AS characterId, position, talkativeness, perception, triggers, muted, present
     FROM room_members ORDER BY room_id, position`
  )
  const chats = await db.getAllAsync(
    'SELECT id, character_id AS characterId, room_id AS roomId, title, created_at AS createdAt FROM chats ORDER BY sort_order, id'
  )
  const messages = await db.getAllAsync(`SELECT ${MESSAGE_COLUMNS} FROM messages ORDER BY id`)
  const { baseUrl, model } = await loadSettings(db)

  const avatars: Record<string, string> = {}
  // Backgrounds travel in the same map as the avatars: both are just pictures by name.
  for (const character of characters) {
    for (const [name, kind] of [[character.avatar, 'avatars'], [character.background, 'backgrounds']] as const) {
      if (!name) continue
      const base64 = await readAvatarBase64(name, kind)
      if (base64) avatars[name] = base64
    }
  }
  for (const room of rooms) {
    if (!room.background) continue
    const base64 = await readAvatarBase64(room.background, 'backgrounds')
    if (base64) avatars[room.background] = base64
  }

  // The API key is left out on purpose: the file usually ends up in iCloud Drive.
  const dump = { app: 'reverie', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings: { baseUrl, model }, characters, rooms, roomMembers, chats, messages, avatars }

  return saveJson(`reverie-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(dump))
}

// Picks a JSON file and adds its characters, chats and messages as new rows alongside
// whatever is already in the database — nothing existing is touched or replaced.
export async function importBackup(db: SQLiteDatabase): Promise<{ characters: number } | null> {
  const text = await pickJsonFile()
  if (text === null) return null

  let dump: Backup
  try {
    dump = JSON.parse(text)
  } catch {
    throw new Error(t('backup.corrupted'))
  }
  if (dump.app !== 'reverie' || !Array.isArray(dump.characters)) {
    throw new Error(t('backup.notBackup'))
  }

  const characterIds = new Map<number, number>()
  const roomIds = new Map<number, number>()
  const chatIds = new Map<number, number>()
  // The user (0) stays 0; a character that did not come along is dropped from the list.
  const remapIds = (json: string | null | undefined) => {
    if (!json) return null
    const ids: number[] = JSON.parse(json)
    const mapped = ids.flatMap((id) => (id === 0 ? [0] : characterIds.has(id) ? [characterIds.get(id)!] : []))
    return JSON.stringify(mapped)
  }
  const avatarNames = new Map<string, string>()

  await db.withTransactionAsync(async () => {
    const importImage = async (name: string | null | undefined, kind: ImageKind = 'avatars') => {
      if (!name || !dump.avatars[name]) return null
      let stored = avatarNames.get(name) ?? null
      if (!stored) {
        stored = `import-${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`
        await writeAvatarBase64(stored, dump.avatars[name], kind)
        avatarNames.set(name, stored)
      }
      return stored
    }

    for (const character of dump.characters) {
      // Backups from before a column existed leave it out.
      const id = await insertCharacter(
        db,
        {
          ...character,
          avatar: await importImage(character.avatar),
          replyLimit: character.replyLimit ?? null,
          thinking: character.thinking ?? 'auto',
          background: await importImage(character.background, 'backgrounds'),
          backgroundEffect: character.backgroundEffect ?? 'blur',
          backgroundIntensity: character.backgroundIntensity ?? 0.5,
          backgroundBubbleTransparency: character.backgroundBubbleTransparency ?? 0.3,
        },
        character.createdAt
      )
      characterIds.set(character.id, id)
    }

    for (const room of dump.rooms ?? []) {
      const id = await insertRoom(
        db,
        {
          ...DEFAULT_ROOM,
          ...room,
          director: Boolean(room.director),
          background: await importImage(room.background, 'backgrounds'),
        },
        room.createdAt
      )
      roomIds.set(room.id, id)
    }

    for (const member of dump.roomMembers ?? []) {
      const roomId = roomIds.get(member.roomId)
      const characterId = characterIds.get(member.characterId)
      if (!roomId || !characterId) continue
      await db.runAsync(
        `INSERT OR IGNORE INTO room_members (room_id, character_id, position, talkativeness, perception, triggers, muted, present)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          roomId,
          characterId,
          member.position ?? 0,
          member.talkativeness ?? DEFAULT_MEMBER.talkativeness,
          member.perception ?? DEFAULT_MEMBER.perception,
          member.triggers ?? '',
          member.muted ? 1 : 0,
          member.present === 0 ? 0 : 1,
        ]
      )
    }

    for (const chat of dump.chats ?? []) {
      const roomId = chat.roomId ? roomIds.get(chat.roomId) : undefined
      const characterId = chat.characterId ? characterIds.get(chat.characterId) : undefined
      if (!roomId && !characterId) continue
      const res = await db.runAsync('INSERT INTO chats (character_id, room_id, title, created_at) VALUES (?, ?, ?, ?)', [
        roomId ? null : characterId!,
        roomId ?? null,
        chat.title,
        chat.createdAt,
      ])
      chatIds.set(chat.id, res.lastInsertRowId)
    }

    for (const message of dump.messages ?? []) {
      const chatId = chatIds.get(message.chatId)
      if (!chatId) continue
      await db.runAsync(
        `INSERT INTO messages (chat_id, role, content, images, variants, variant, thoughts, created_at,
           speaker_id, kind, addressees, audience, overheard, absent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          chatId,
          message.role,
          message.content,
          backupImages(message),
          message.variants ?? null,
          message.variant ?? 0,
          message.thoughts ?? null,
          message.createdAt,
          message.speakerId ? (characterIds.get(message.speakerId) ?? null) : null,
          message.kind ?? 'say',
          remapIds(message.addressees),
          remapIds(message.audience),
          remapIds(message.overheard),
          remapIds(message.absent),
        ]
      )
    }
  })

  if (dump.settings?.baseUrl) {
    const current = await loadSettings(db)
    if (!current.baseUrl) await saveSettings(db, { ...current, baseUrl: dump.settings.baseUrl, model: dump.settings.model ?? current.model })
  }

  return { characters: characterIds.size }
}

// Deletes every room, character, chat, message and avatar, plus the server settings. Cascades
// take care of chats and messages; only the app_settings table and avatar files need
// clearing by hand.
export async function wipeAllData(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM rooms; DELETE FROM characters; DELETE FROM app_settings;')
  })
  removeAllAvatars()
}

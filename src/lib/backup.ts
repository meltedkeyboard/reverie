import type { SQLiteDatabase } from 'expo-sqlite'

import { CHARACTER_COLUMNS, insertCharacter, type BackgroundEffect, type ThinkingMode } from '@/db/characters'
import { MESSAGE_COLUMNS } from '@/db/messages'
import { DEFAULT_MEMBER, DEFAULT_ROOM, insertRoom, ROOM_COLUMNS, type FloorMode } from '@/db/rooms'
import { loadSettings, saveSettings } from '@/db/settings'
import { t } from '@/i18n'
import { pickBackupFile } from '@/lib/pickBackup'
import { readAvatarBytes, removeAllAvatars, writeAvatarBase64, writeAvatarBytes, type ImageKind } from '@/lib/avatars'
import { isArchive, packArchive, unpackArchive } from '@/lib/backupArchive'
import { applySelection, buildTree, type BackupTree, type Selection } from '@/lib/backupSelection'
import { saveFile } from '@/lib/download'
import { fromByteArray } from 'base64-js'
import { strFromU8 } from 'fflate'

import { extensionOf } from '@/lib/media'

// 9: a zip of JSON files and pictures. Up to 8 it was one JSON file with the pictures in base64.
const BACKUP_VERSION = 9

type BackupCharacter = {
  id: number
  name: string
  avatar: string | null
  // Backups from before originals were kept leave these out.
  avatarOriginal?: string | null
  avatarCrop?: string | null
  systemPrompt: string
  greeting: string
  temperature: number
  maxTokens: number
  topP: number
  replyLimit: number | null
  thinking?: ThinkingMode
  // Backups from before chat backgrounds leave these out.
  background?: string | null
  backgroundOriginal?: string | null
  backgroundCrop?: string | null
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
  backgroundOriginal?: string | null
  backgroundCrop?: string | null
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
  // Version 9: a list of files in the zip's attachments folder. Up to 8 a JSON string with
  // the pictures in base64.
  images?: string | { file: string; width: number; height: number }[] | null
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
  // Only in the old single-file backups: the pictures by name, in base64.
  avatars?: Record<string, string>
  settings?: { baseUrl?: string; model?: string }
}

// The tree the export sheet shows: characters and rooms with their chats, from the database.
export async function loadBackupTree(db: SQLiteDatabase): Promise<BackupTree> {
  const characters = await db.getAllAsync<{ id: number; name: string; avatar: string | null }>('SELECT id, name, avatar FROM characters ORDER BY sort_order, id')
  const rooms = await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM rooms ORDER BY sort_order, id')
  const chats = await db.getAllAsync<{ id: number; characterId: number | null; roomId: number | null; title: string | null; messageCount: number }>(
    `SELECT ch.id, ch.character_id AS characterId, ch.room_id AS roomId, ch.title,
            (SELECT COUNT(*) FROM messages m WHERE m.chat_id = ch.id) AS messageCount
     FROM chats ch ORDER BY ch.sort_order, ch.id`
  )
  return buildTree({ characters, rooms, chats })
}

// Everything when `selection` is left out.
export async function exportBackup(db: SQLiteDatabase, selection?: Selection) {
  const all = {
    characters: await db.getAllAsync<{
      id: number
      avatar: string | null
      avatarOriginal: string | null
      background: string | null
      backgroundOriginal: string | null
    }>(`SELECT ${CHARACTER_COLUMNS} FROM characters ORDER BY sort_order, id`),
    rooms: await db.getAllAsync<{ id: number; background: string | null; backgroundOriginal: string | null }>(
      `SELECT ${ROOM_COLUMNS} FROM rooms ORDER BY sort_order, id`
    ),
    roomMembers: await db.getAllAsync<{ roomId: number; characterId: number }>(
      `SELECT room_id AS roomId, character_id AS characterId, position, talkativeness, perception, triggers, muted, present
       FROM room_members ORDER BY room_id, position`
    ),
    chats: await db.getAllAsync<{ id: number; characterId: number | null; roomId: number | null; title: string | null }>(
      'SELECT id, character_id AS characterId, room_id AS roomId, title, created_at AS createdAt FROM chats ORDER BY sort_order, id'
    ),
    messages: await db.getAllAsync<{ id: number; chatId: number; images: string | null }>(`SELECT ${MESSAGE_COLUMNS} FROM messages ORDER BY id`),
  }
  const picked = selection ? applySelection(all, selection) : all
  const { characters, rooms = [], roomMembers = [], chats } = picked
  const messages = picked.messages.map((row) => (row.images ? { ...row, images: JSON.parse(row.images) } : row))
  const { baseUrl, model } = await loadSettings(db)

  // Every picture a character or a room points at, the originals too, once each.
  const wanted = new Map<string, { kind: ImageKind; name: string }>()
  const want = (name: string | null, kind: ImageKind) => {
    if (name) wanted.set(`${kind}/${name}`, { kind, name })
  }
  for (const character of characters) {
    want(character.avatar, 'avatars')
    want(character.avatarOriginal, 'avatars')
    want(character.background, 'backgrounds')
    want(character.backgroundOriginal, 'backgrounds')
  }
  for (const room of rooms) {
    want(room.background, 'backgrounds')
    want(room.backgroundOriginal, 'backgrounds')
  }
  for (const message of messages) {
    for (const picture of (message.images as { file?: string; moving?: string }[] | null) ?? []) {
      want(picture.file ?? null, 'attachments')
      want(picture.moving ?? null, 'attachments')
    }
  }
  const files: { path: string; bytes: Uint8Array }[] = []
  for (const { kind, name } of wanted.values()) {
    const bytes = await readAvatarBytes(name, kind)
    if (bytes) files.push({ path: `${kind}/${name}`, bytes })
  }

  // The API key is left out on purpose: the file usually ends up in a cloud drive.
  const manifest = { app: 'reverie', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings: { baseUrl, model } }
  const zip = packArchive({
    manifest,
    characters: characters as (typeof characters[number] & { name: string })[],
    rooms: rooms as (typeof rooms[number] & { id: number; name: string })[],
    roomMembers: roomMembers as { roomId: number }[],
    chats: chats as { id: number; title: string | null }[],
    messages: messages as unknown as { chatId: number }[],
    files,
  })
  return saveFile(`reverie-backup-${new Date().toISOString().slice(0, 10)}.zip`, zip, 'application/zip')
}

// What a backup file holds, whichever form it came in: the zip, or the old single JSON file.
function openBackup(bytes: Uint8Array): { dump: Backup; file: (path: string) => string | Uint8Array | undefined } {
  try {
    if (isArchive(bytes)) {
      const { manifest, file, ...rest } = unpackArchive(bytes)
      return { dump: { ...(manifest as Backup), ...(rest as unknown as Backup) }, file }
    }
    // The old file: pictures by name only, so the folder in the path is dropped.
    const dump: Backup = JSON.parse(strFromU8(bytes))
    return { dump, file: (path) => dump.avatars?.[path.slice(path.indexOf('/') + 1)] }
  } catch {
    throw new Error(t('backup.corrupted'))
  }
}

export type OpenedBackup = ReturnType<typeof openBackup> & { tree: BackupTree }

// Picks a backup (a zip, or an older JSON file) and opens it; null when cancelled.
export async function readBackup(): Promise<OpenedBackup | null> {
  const bytes = await pickBackupFile()
  if (bytes === null) return null

  const opened = openBackup(bytes)
  const { dump } = opened
  if (dump.app !== 'reverie' || !Array.isArray(dump.characters)) {
    throw new Error(t('backup.notBackup'))
  }
  const tree = buildTree({ ...dump, chats: dump.chats ?? [], messages: dump.messages ?? [] })
  for (const node of tree.characters) node.avatarUri = avatarPreview(opened.file, node.avatar)
  return { ...opened, tree }
}

// A small still avatar of the backup as a data URL for the list; a big or moving one would
// only slow the sheet down, so the initial stands in for it.
const PREVIEW_LIMIT = 300 * 1024
function avatarPreview(file: (path: string) => string | Uint8Array | undefined, name: string | null | undefined) {
  const data = name ? file(`avatars/${name}`) : undefined
  if (!name || !data) return null
  const ext = extensionOf(name).toLowerCase()
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' || ext === '' ? 'image/jpeg' : null
  if (!mime) return null
  if (typeof data === 'string') return data.length < PREVIEW_LIMIT * 1.4 ? `data:${mime};base64,${data}` : null
  return data.length < PREVIEW_LIMIT ? `data:${mime};base64,${fromByteArray(data)}` : null
}

// Adds the characters, rooms, chats and messages of an opened backup that `selection` keeps
// (all of them without it) as new rows alongside whatever is already in the database —
// nothing existing is touched or replaced.
export async function importBackup(
  db: SQLiteDatabase,
  opened: OpenedBackup,
  selection?: Selection
): Promise<{ characters: number; rooms: number; chats: number }> {
  const { file } = opened
  const dump = selection ? applySelection({ ...opened.dump, chats: opened.dump.chats ?? [], messages: opened.dump.messages ?? [] }, selection) : opened.dump

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
      const data = name ? file(`${kind}/${name}`) : undefined
      if (!name || !data) return null
      let stored = avatarNames.get(`${kind}/${name}`) ?? null
      if (!stored) {
        stored = `import-${Date.now()}-${Math.round(Math.random() * 1e6)}.${extensionOf(name) || 'jpg'}`
        if (typeof data === 'string') await writeAvatarBase64(stored, data, kind)
        else writeAvatarBytes(stored, data, kind)
        avatarNames.set(`${kind}/${name}`, stored)
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
          avatarOriginal: await importImage(character.avatarOriginal),
          avatarCrop: character.avatarCrop ?? null,
          replyLimit: character.replyLimit ?? null,
          thinking: character.thinking ?? 'auto',
          background: await importImage(character.background, 'backgrounds'),
          backgroundOriginal: await importImage(character.backgroundOriginal, 'backgrounds'),
          backgroundCrop: character.backgroundCrop ?? null,
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
          backgroundOriginal: await importImage(room.backgroundOriginal, 'backgrounds'),
          backgroundCrop: room.backgroundCrop ?? null,
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

    // The message's pictures as the JSON the database keeps, whichever way the backup held
    // them: files of the zip, or base64 in the row (older backups).
    const importImages = async (message: BackupMessage) => {
      let list: { file?: string; moving?: string; base64?: string; width: number; height: number }[] = []
      if (Array.isArray(message.images)) list = message.images
      else if (message.images) list = JSON.parse(message.images)
      else if (message.image) list = [{ base64: message.image, width: message.imageWidth ?? 0, height: message.imageHeight ?? 0 }]
      const kept = []
      for (const { file: name, moving, base64, width, height } of list) {
        let stored: string | null = null
        if (name) stored = await importImage(name, 'attachments')
        else if (base64) {
          stored = `import-${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`
          await writeAvatarBase64(stored, base64, 'attachments')
        }
        if (!stored) continue
        const movingStored = moving ? await importImage(moving, 'attachments') : null
        kept.push(movingStored ? { file: stored, width, height, moving: movingStored } : { file: stored, width, height })
      }
      return kept.length ? JSON.stringify(kept) : null
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
          await importImages(message),
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

  return { characters: characterIds.size, rooms: roomIds.size, chats: chatIds.size }
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

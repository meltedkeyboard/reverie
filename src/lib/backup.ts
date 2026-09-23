import type { SQLiteDatabase } from 'expo-sqlite'

import { CHARACTER_COLUMNS, insertCharacter, type ThinkingMode } from '@/db/characters'
import { MESSAGE_COLUMNS } from '@/db/messages'
import { loadSettings, saveSettings } from '@/db/settings'
import { t } from '@/i18n'
import { pickJsonFile } from '@/lib/pickJson'
import { readAvatarBase64, removeAllAvatars, writeAvatarBase64 } from '@/lib/avatars'
import { saveJson } from '@/lib/download'

const BACKUP_VERSION = 6

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
  createdAt: number
}

type BackupChat = { id: number; characterId: number; title: string | null; createdAt: number }

type BackupMessage = {
  id: number
  chatId: number
  role: string
  content: string
  image: string | null
  imageWidth: number | null
  imageHeight: number | null
  variants: string | null
  variant: number
  thoughts: string | null
  createdAt: number
}

type Backup = {
  app: string
  characters: BackupCharacter[]
  chats: BackupChat[]
  messages: BackupMessage[]
  avatars: Record<string, string>
  settings?: { baseUrl?: string; model?: string }
}

export async function exportBackup(db: SQLiteDatabase) {
  const characters = await db.getAllAsync<{ id: number; avatar: string | null }>(
    `SELECT ${CHARACTER_COLUMNS} FROM characters ORDER BY id`
  )
  const chats = await db.getAllAsync(
    'SELECT id, character_id AS characterId, title, created_at AS createdAt FROM chats ORDER BY id'
  )
  const messages = await db.getAllAsync(`SELECT ${MESSAGE_COLUMNS} FROM messages ORDER BY id`)
  const { baseUrl, model } = await loadSettings(db)

  const avatars: Record<string, string> = {}
  for (const character of characters) {
    if (!character.avatar) continue
    const base64 = await readAvatarBase64(character.avatar)
    if (base64) avatars[character.avatar] = base64
  }

  // The API key is left out on purpose: the file usually ends up in iCloud Drive.
  const dump = { app: 'reverie', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings: { baseUrl, model }, characters, chats, messages, avatars }

  await saveJson(`reverie-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(dump))
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
  const chatIds = new Map<number, number>()
  const avatarNames = new Map<string, string>()

  await db.withTransactionAsync(async () => {
    for (const character of dump.characters) {
      let avatar: string | null = null
      if (character.avatar && dump.avatars[character.avatar]) {
        avatar = avatarNames.get(character.avatar) ?? null
        if (!avatar) {
          avatar = `import-${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`
          await writeAvatarBase64(avatar, dump.avatars[character.avatar])
          avatarNames.set(character.avatar, avatar)
        }
      }
      // Backups from before a column existed leave it out.
      const id = await insertCharacter(
        db,
        { ...character, avatar, replyLimit: character.replyLimit ?? null, thinking: character.thinking ?? 'auto' },
        character.createdAt
      )
      characterIds.set(character.id, id)
    }

    for (const chat of dump.chats ?? []) {
      const characterId = characterIds.get(chat.characterId)
      if (!characterId) continue
      const res = await db.runAsync('INSERT INTO chats (character_id, title, created_at) VALUES (?, ?, ?)', [
        characterId,
        chat.title,
        chat.createdAt,
      ])
      chatIds.set(chat.id, res.lastInsertRowId)
    }

    for (const message of dump.messages ?? []) {
      const chatId = chatIds.get(message.chatId)
      if (!chatId) continue
      await db.runAsync(
        `INSERT INTO messages (chat_id, role, content, image, image_width, image_height, variants, variant, thoughts, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          chatId,
          message.role,
          message.content,
          message.image,
          message.imageWidth,
          message.imageHeight,
          message.variants ?? null,
          message.variant ?? 0,
          message.thoughts ?? null,
          message.createdAt,
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

// Deletes every character, chat, message and avatar, plus the server settings. Cascades
// take care of chats and messages; only the app_settings table and avatar files need
// clearing by hand.
export async function wipeAllData(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM characters; DELETE FROM app_settings;')
  })
  removeAllAvatars()
}

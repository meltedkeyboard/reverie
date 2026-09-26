import type { SQLiteDatabase } from 'expo-sqlite'

export type SearchChat = {
  id: number
  title: string | null
  roomId: number | null
  ownerName: string
  ownerAvatar: string | null
  lastActivity: number
}

export type SearchMessage = {
  id: number
  chatId: number
  roomId: number | null
  content: string
  createdAt: number
  chatTitle: string | null
  ownerName: string
  // Who said it: the character of a one-on-one chat or the speaker in a scene; null
  // for the user's own lines.
  speakerName: string | null
  speakerAvatar: string | null
  // The user's own lines show whom they were written to.
  ownerAvatar: string | null
}

// A scene has no avatar of its own, so it borrows its room's first member's.
const OWNER_AVATAR = `
  COALESCE(c.avatar, (SELECT mc.avatar FROM room_members rm JOIN characters mc ON mc.id = rm.character_id
    WHERE rm.room_id = r.id ORDER BY rm.position LIMIT 1)) AS ownerAvatar`

// Every chat with who it belongs to. There are few enough of them to match the titles
// in JS, where case folding works for Cyrillic too, unlike SQLite's LIKE.
export function listSearchChats(db: SQLiteDatabase) {
  return db.getAllAsync<SearchChat>(`
    SELECT ch.id, ch.title, ch.room_id AS roomId, COALESCE(c.name, r.name) AS ownerName, ${OWNER_AVATAR},
      COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.chat_id = ch.id), ch.created_at) AS lastActivity
    FROM chats ch
      LEFT JOIN characters c ON c.id = ch.character_id
      LEFT JOIN rooms r ON r.id = ch.room_id
    ORDER BY lastActivity DESC
  `)
}

// SQLite folds case only for ASCII, so the query goes in the spellings a word usually
// has in text: as typed, lower case, capitalized (the start of a sentence) and upper case.
function spellings(query: string) {
  const lower = query.toLocaleLowerCase()
  return [...new Set([query, lower, lower.charAt(0).toLocaleUpperCase() + lower.slice(1), query.toLocaleUpperCase()])]
}

export function searchMessages(db: SQLiteDatabase, query: string, limit = 60) {
  const variants = spellings(query)
  const match = variants.map(() => 'instr(m.content, ?) > 0').join(' OR ')
  return db.getAllAsync<SearchMessage>(
    `SELECT m.id, m.chat_id AS chatId, ch.room_id AS roomId, m.content, m.created_at AS createdAt,
       ch.title AS chatTitle, COALESCE(c.name, r.name) AS ownerName,
       CASE WHEN m.role = 'user' THEN NULL ELSE COALESCE(s.name, c.name) END AS speakerName,
       CASE WHEN m.role = 'user' THEN NULL ELSE COALESCE(s.avatar, c.avatar) END AS speakerAvatar,
       ${OWNER_AVATAR}
     FROM messages m
       JOIN chats ch ON ch.id = m.chat_id
       LEFT JOIN characters c ON c.id = ch.character_id
       LEFT JOIN rooms r ON r.id = ch.room_id
       LEFT JOIN characters s ON s.id = m.speaker_id
     WHERE ${match}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT ?`,
    [...variants, limit]
  )
}

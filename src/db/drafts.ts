import type { SQLiteDatabase } from 'expo-sqlite'
import { AppState } from 'react-native'

// What was typed into a chat's field and not sent yet. The field reads it the moment a chat
// comes on screen, before any query could answer, so every draft is held in memory and the
// table only keeps them across launches. Writes wait for a pause in the typing.
const drafts = new Map<number, string>()
const unsaved = new Map<number, SQLiteDatabase>()
let timer: ReturnType<typeof setTimeout> | undefined

const SAVE_DELAY = 500

export async function loadDrafts(db: SQLiteDatabase) {
  clearTimeout(timer)
  unsaved.clear()
  drafts.clear()
  const rows = await db.getAllAsync<{ chatId: number; text: string }>('SELECT chat_id AS chatId, text FROM chat_drafts')
  for (const row of rows) drafts.set(row.chatId, row.text)
}

export function getDraft(chatId: number) {
  return drafts.get(chatId) ?? ''
}

// Spaces and empty lines alone are no draft.
export function setDraft(db: SQLiteDatabase, chatId: number, text: string) {
  const kept = text.trim() ? text : ''
  if (getDraft(chatId) === kept) return
  if (kept) drafts.set(chatId, kept)
  else drafts.delete(chatId)
  unsaved.set(chatId, db)
  clearTimeout(timer)
  timer = setTimeout(saveDrafts, SAVE_DELAY)
}

// A chat's row is gone with the chat, but its id can be given to the next chat made.
export function dropDraft(chatId: number) {
  drafts.delete(chatId)
  unsaved.delete(chatId)
}

export async function saveDrafts() {
  clearTimeout(timer)
  const batch = [...unsaved]
  unsaved.clear()
  for (const [chatId, db] of batch) {
    const text = drafts.get(chatId)
    try {
      // Through the chats table, so a chat deleted in the meantime gets no row.
      if (text) await db.runAsync('INSERT OR REPLACE INTO chat_drafts (chat_id, text) SELECT id, ? FROM chats WHERE id = ?', [text, chatId])
      else await db.runAsync('DELETE FROM chat_drafts WHERE chat_id = ?', chatId)
    } catch (err) {
      console.warn('Could not save the draft', err)
    }
  }
}

// The app may be killed once it is in the background, with a write still waiting.
AppState.addEventListener('change', (state) => {
  if (state !== 'active') saveDrafts()
})

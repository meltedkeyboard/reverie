import type { SQLiteDatabase } from 'expo-sqlite'

import { defineFlag, getFlag, getSetting, setFlag, setSetting } from '@/db/settings'

// The buttons back into the last chat on the Characters and Rooms tabs. They are on unless
// turned off in Settings; a swipe hides one only until the user opens a chat of its kind again.
export type ContinueKind = 'character' | 'room'

const ENABLED_KEY = 'continue_button'
const BY_VISIT_KEY = 'continue_by_visit'
const HIDDEN_KEYS: Record<ContinueKind, string> = {
  character: 'continue_hidden',
  room: 'continue_hidden_room',
}
const OPENED_KEYS: Record<ContinueKind, string> = {
  character: 'continue_opened',
  room: 'continue_opened_room',
}

const continueButton = defineFlag(ENABLED_KEY, true)
export const isContinueEnabled = continueButton.load
export const setContinueEnabled = continueButton.save

// Whether the button leads to the chat opened last or to the one written in last.
const continueByVisit = defineFlag(BY_VISIT_KEY, true)
export const isContinueByVisit = continueByVisit.load
export const setContinueByVisit = continueByVisit.save

export function isContinueHidden(db: SQLiteDatabase, kind: ContinueKind) {
  return getFlag(db, HIDDEN_KEYS[kind], false)
}

export function setContinueHidden(db: SQLiteDatabase, kind: ContinueKind, hidden: boolean) {
  return setFlag(db, HIDDEN_KEYS[kind], hidden)
}

// The chat of this kind opened last, so the button leads back to it even when nothing was written.
export async function getLastOpened(db: SQLiteDatabase, kind: ContinueKind) {
  const value = await getSetting(db, OPENED_KEYS[kind])
  return value === null ? null : Number(value)
}

export function setLastOpened(db: SQLiteDatabase, kind: ContinueKind, chatId: number) {
  return setSetting(db, OPENED_KEYS[kind], String(chatId))
}

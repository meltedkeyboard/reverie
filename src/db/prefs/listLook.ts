import { useSyncExternalStore } from 'react'
import type { SQLiteDatabase } from 'expo-sqlite'

import { defineChoice, defineNumber } from '@/db/prefs/settings'

// How the system's lists of characters, groups and rooms look (iOS, NativeCardList), set
// under Appearance: how round the pictures are, and how much room the rows have. Held in
// memory as well, so that every list shown changes at once with the slider.
export type ListSpacing = 'compact' | 'roomy'

// The corners of a picture in hundredths of its side: 50 is a circle, 0 a square.
export const LIST_CORNER_RANGE = { min: 10, max: 50, default: 50 } as const

export type ListLook = { corner: number; spacing: ListSpacing }

const cornerPref = defineNumber('list_corner', LIST_CORNER_RANGE.min, LIST_CORNER_RANGE.max, LIST_CORNER_RANGE.default)
const spacingPref = defineChoice<ListSpacing>('list_spacing', ['compact', 'roomy'], 'compact')

let look: ListLook = { corner: LIST_CORNER_RANGE.default, spacing: 'compact' }
const listeners = new Set<() => void>()

function set(next: ListLook) {
  look = next
  listeners.forEach((listener) => listener())
}

export async function loadListLook(db: SQLiteDatabase) {
  set({ corner: await cornerPref.load(db), spacing: await spacingPref.load(db) })
}

// `persist` false while a slider is still moving: shown everywhere, written once let go.
export function setListCorner(db: SQLiteDatabase, corner: number, persist = true) {
  set({ ...look, corner })
  if (persist) cornerPref.save(db, corner)
}

export function setListSpacing(db: SQLiteDatabase, spacing: ListSpacing) {
  set({ ...look, spacing })
  spacingPref.save(db, spacing)
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useListLook() {
  return useSyncExternalStore(subscribe, () => look, () => look)
}

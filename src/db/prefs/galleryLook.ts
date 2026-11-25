import { useSyncExternalStore } from 'react'
import type { SQLiteDatabase } from 'expo-sqlite'

import { defineChoice } from '@/db/prefs/settings'

// How a character profile displays its gallery: a 3-column square grid or a full-width
// horizontally swipeable carousel.
export type GalleryLayout = 'grid' | 'carousel'

const layoutPref = defineChoice<GalleryLayout>('profile_gallery_layout', ['grid', 'carousel'], 'grid')

let layout: GalleryLayout = 'grid'
const listeners = new Set<() => void>()

function set(next: GalleryLayout) {
  layout = next
  listeners.forEach((listener) => listener())
}

export async function loadGalleryLayout(db: SQLiteDatabase) {
  set(await layoutPref.load(db))
}

export function setGalleryLayout(db: SQLiteDatabase, next: GalleryLayout) {
  set(next)
  layoutPref.save(db, next)
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useGalleryLayout() {
  return useSyncExternalStore(subscribe, () => layout, () => layout)
}

import type { GalleryItem } from '@/db/gallery'

// What the gallery sheet (app/gallery-pick.tsx) offers and where the ones picked go. It is
// passed around the router because the result is a callback. The pick is handed over only
// once the sheet is gone, so what it opens next (the crop, the background's screen) is
// pushed onto a stack that is still.
export type GalleryPick = {
  title: string
  items: GalleryItem[]
  // Several ticked in order, as the attach menu's gallery does, rather than one.
  multiple?: boolean
  // Those ticked as the sheet opens, the ones a generator already has attached.
  initial?: GalleryItem[]
  // One item, or with `multiple` all those ticked in order, none if each was unticked.
  onPick: (items: GalleryItem[]) => void
}

let pending: GalleryPick | null = null
let picked: GalleryItem[] | null = null

export function setGalleryPick(pick: GalleryPick) {
  pending = pick
  picked = null
}

export function galleryPick() {
  return pending
}

export function choose(items: GalleryItem[]) {
  picked = items
}

// Runs once a pick is confirmed, whichever end of the sheet reports first. Closed without
// one, nothing is done: the next opening sets a pick of its own.
export function finishGalleryPick() {
  const pick = pending
  const items = picked
  if (!pick || !items) return
  pending = null
  picked = null
  pick.onPick(items)
}

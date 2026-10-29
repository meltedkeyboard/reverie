import type { GalleryItem } from '@/db/gallery'

// What the gallery sheet (app/gallery-pick.tsx) offers and where the one picked goes. It is
// passed around the router because the result is a callback. The pick is handed over only
// once the sheet is gone, so what it opens next (the crop, the background's screen) is
// pushed onto a stack that is still.
export type GalleryPick = {
  title: string
  items: GalleryItem[]
  onPick: (item: GalleryItem) => void
}

let pending: GalleryPick | null = null
let picked: GalleryItem | null = null

export function setGalleryPick(pick: GalleryPick) {
  pending = pick
  picked = null
}

export function galleryPick() {
  return pending
}

export function choose(item: GalleryItem) {
  picked = item
}

// Runs once a picture is taken, whichever end of the sheet reports first. Closed without
// one, nothing is done: the next opening sets a pick of its own.
export function finishGalleryPick() {
  const pick = pending
  const item = picked
  if (!pick || !item) return
  pending = null
  picked = null
  pick.onPick(item)
}

import type { BackgroundEffect } from '@/db/characters'
import type { CropRect } from '@/lib/avatars'

// What the background screen edits, and where its result goes. It is passed around the
// router because the picture is a file uri and the result a callback, neither of which
// fits in a route param.
export type BackgroundDraft = {
  // The original, uncropped.
  uri: string
  // The frame to start from when framing is redone.
  crop?: CropRect | null
  characterName: string
  effect: BackgroundEffect
  intensity: number
  bubbleTransparency: number
  onDone: (result: {
    effect: BackgroundEffect
    intensity: number
    bubbleTransparency: number
    // The copy the chat shows, cut to the frame and shrunk, and the frame (null: all of it).
    uri: string
    crop: CropRect | null
  }) => void
}

let pending: BackgroundDraft | null = null

export function setBackgroundDraft(draft: BackgroundDraft) {
  pending = draft
}

export function backgroundDraft() {
  return pending
}

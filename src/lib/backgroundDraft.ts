import type { BackgroundEffect } from '@/db/characters'

// What the background screen edits, and where its result goes. It is passed around the
// router because the picture is a file uri and the result a callback, neither of which
// fits in a route param.
export type BackgroundDraft = {
  uri: string
  characterName: string
  effect: BackgroundEffect
  intensity: number
  bubbleTransparency: number
  onDone: (result: {
    effect: BackgroundEffect
    intensity: number
    bubbleTransparency: number
    // The picture cut to what was framed; absent when it was left as it was.
    uri?: string
  }) => void
}

let pending: BackgroundDraft | null = null

export function setBackgroundDraft(draft: BackgroundDraft) {
  pending = draft
}

export function backgroundDraft() {
  return pending
}

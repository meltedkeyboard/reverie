import { Dimensions } from 'react-native'
import { initialWindowMetrics } from 'react-native-safe-area-context'

import { createStore } from '@/components/chat/thread/store'
import type { BackgroundEffect, BackgroundTone } from '@/db/characters'
import type { Scheme } from '@/theme'

// The controls of /background as the system sheet of iOS, /background-look, a route of its
// own: the screen under it holds the values and publishes them here with what changes
// them, and the sheet reads them back, as the attach menu reads its session.
export type BackgroundLook = {
  effect: BackgroundEffect
  setEffect: (effect: BackgroundEffect) => void
  intensity: number
  setIntensity: (intensity: number) => void
  bubbleTransparency: number
  setBubbleTransparency: (value: number) => void
  tone: BackgroundTone
  setTone: (tone: BackgroundTone) => void
  scheme: Scheme
  saving: boolean
  save: () => void
  // Leaves the editor, the sheet with it.
  close: () => void
  // Whether the picture is moved or zoomed, and putting it back.
  framed: boolean
  reset: () => void
}

export const backgroundLook = createStore<BackgroundLook | null>(null)

// Whether the sheet is up, so the screen closing goes back past it as well.
let open = false
export const lookSheetOpen = () => open
export const setLookSheetOpen = (value: boolean) => {
  open = value
}

// Whether the sheet is let down, where it shows only its bar and what is under the bar
// fades out of the strip left above the home indicator.
export const lookSheetDown = createStore(false)

// How much of the screen the sheet takes: down, its bar with the home indicator under it;
// up, everything.
const SHEET_BAR = 56
const LOOK_SHEET_DOWN = SHEET_BAR + (initialWindowMetrics?.insets.bottom ?? 0)
const LOOK_SHEET_UP = 530

export function lookSheetDetents() {
  const height = Dimensions.get('window').height || 852
  return [LOOK_SHEET_DOWN / height, Math.min(LOOK_SHEET_UP / height, 1)]
}

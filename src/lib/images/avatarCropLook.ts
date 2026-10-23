import { Dimensions } from 'react-native'
import { initialWindowMetrics } from 'react-native-safe-area-context'

import { createStore } from '@/components/chat/thread/store'

// The controls of /avatar-crop as the system sheet of iOS, /avatar-crop-look, the way
// /background has /background-look: the screen under it holds the framing and publishes
// it here with what changes it, and the sheet reads it back.
export type AvatarCropLook = {
  zoom: number
  // The slider: while it is dragged the screen stops sending the zoom back to it.
  startSlide: () => void
  slide: (zoom: number) => void
  endSlide: (zoom: number) => void
  center: () => void
  reset: () => void
  // Until the size of the picture is known there is nothing to frame.
  ready: boolean
  saving: boolean
  choose: () => void
  // Leaves the screen, the sheet with it.
  close: () => void
}

// How far the photo can be zoomed in, by the fingers or the slider.
export const MAX_ZOOM = 4

export const avatarCropLook = createStore<AvatarCropLook | null>(null)

// Whether the sheet is up, so the screen closing goes back past it as well.
let open = false
export const cropSheetOpen = () => open
export const setCropSheetOpen = (value: boolean) => {
  open = value
}

// Whether the sheet is let down to its bar.
export const cropSheetDown = createStore(false)

// How much of the screen the sheet takes: down, its bar with the home indicator under it;
// up, the slider, Choose and the hint. The screen keeps the window above it.
const SHEET_BAR = 56
const CROP_SHEET_DOWN = SHEET_BAR + (initialWindowMetrics?.insets.bottom ?? 0)
export const CROP_SHEET_UP = 310

export function cropSheetDetents() {
  const height = Dimensions.get('window').height || 852
  return [CROP_SHEET_DOWN / height, Math.min(CROP_SHEET_UP / height, 1)]
}

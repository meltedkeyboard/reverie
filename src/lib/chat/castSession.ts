import { Dimensions } from 'react-native'

import type { CastProps } from '@/components/cast/CastSheet'
import { createStore } from '@/components/chat/thread/store'

// The cast sheet of a scene as the system sheet of iOS, /cast, a route of its own: the
// scene's controller publishes what the sheet shows with what changes it, again on every
// change while the sheet is up, and the sheet reads it back, as the attach menu reads its
// session and /background-look the editor's controls.
export const castSession = createStore<CastProps | null>(null)

// The height of what the sheet holds, so it opens just tall enough for the cast: the bar,
// the whole room and the narrator, a row per member, the hint, the whisper card, and the
// strip over the home indicator.
const BAR = 66
const ROW = 72
const REST = 175

let detent = 0.6

export function castDetent() {
  return detent
}

// What follows the sheet once it is fully gone: a screen pushed or the viewer, which must
// not start while the sheet is still going away. And what the scene does then itself.
let after: (() => void) | null = null
let gone: (() => void) | null = null
// Set by the sheet while it is up: takes it away.
let dismiss: (() => void) | null = null

// Called by the scene as it opens the sheet, before it pushes the route.
export function openCastSession(cast: CastProps, onGone: () => void) {
  castSession.set(cast)
  after = null
  gone = onGone
  const height = Dimensions.get('window').height
  const wanted = BAR + ROW * (cast.members.length + 2) + REST
  detent = height > 0 ? Math.min(1, wanted / height) : 0.6
}

export function setCastDismiss(action: (() => void) | null) {
  dismiss = action
}

// Takes the sheet away, then runs `then` once it is off the screen.
export function closeCastSession(then?: () => void) {
  after = then ?? null
  if (dismiss) dismiss()
  else finishCastSession()
}

// Runs once per opening, whichever of the sheet's ends reports first.
export function finishCastSession() {
  const done = gone
  const action = after
  if (!done && !action) return
  gone = null
  after = null
  dismiss = null
  done?.()
  action?.()
}

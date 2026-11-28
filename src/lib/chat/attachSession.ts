import { Dimensions } from 'react-native'

import type { Character } from '@/db/characters'
import type { GalleryItem } from '@/db/gallery'
import type { MessageImage } from '@/db/messages'
import type { Persona } from '@/db/personas'
import type { ImageSource } from '@/lib/images/images'
import { isFeatureOn } from '@/lib/settings/features'

// Initial pixel height of the iOS half-sheet (nav bar + tiles + 3 rows + thinking + bottom air)
// calculated per screen so the expanded-only timer section stays below the fold on any device.
const BASE_SHEET_HEIGHT = 440
// What the menu loses without the pictures row: the row (108) less the camera row (52).
const WITHOUT_RECENTS = 56
const RECENTS_OFF_NOTE = 28
// A row of the menu's card: the characters' galleries, there only when one of them has a
// picture, and the persona and the direction, gone when switched off in Settings.
const CARD_ROW = 52
const THINKING_ROW = 64

// The pictures of one character's gallery to attach from, under its name in a scene.
export type AttachGallery = { name: string; items: GalleryItem[] }

export type AttachTimerMode = 'reminder' | 'message'

export type AttachTimerSession = {
  allowReminder: boolean
  allowMessage: boolean
  defaultMinutes: number
  onSchedule: (opts: { mode: AttachTimerMode; delayMinutes: number }) => Promise<boolean>
}

// What the attach menu of the composer works with and where its choices go: the field's
// pictures, the chat's thinking switch, persona and direction. On iOS the menu is a form sheet
// of the stack (app/attach), so it is passed around the router like the generator's draft.
export type AttachSession = {
  // Tells one opening from the next, so the app's own sheet starts its menu afresh.
  opened: number
  // The look of the chat the menu opened over, whose background it may carry (ChatBackdrop).
  look?: Pick<
    Character,
    'background' | 'backgroundCrop' | 'backgroundEffect' | 'backgroundIntensity' | 'backgroundBubbleTransparency' | 'backgroundTone'
  > | null
  thinking?: boolean
  onToggleThinking?: (thinking: boolean) => void
  persona?: Persona | null
  // The latest pictures sent, read before the menu opens so the row is there from its first frame.
  // null when the row is switched off in Settings; with none sent yet there is no row either.
  recents?: MessageImage[] | null
  personaId?: number | null
  onSelectPersona?: (personaId: number | null) => void
  direction?: string | null
  onSetDirection?: (direction: string) => void
  suggestionDirection?: string | null
  onSetSuggestionDirection?: (suggestionDirection: string) => void
  timer?: AttachTimerSession
  // The galleries of the chat's character, or of a scene's cast, with a picture in them;
  // their stills only, as a message takes no video.
  galleries?: AttachGallery[]
  onPick: (source: ImageSource) => void
  onAttach: (pictures: MessageImage[]) => void
  // The menu is gone and nothing was chosen to follow it: the field may take the keyboard back.
  onClosed: () => void
  // The menu is gone, whatever follows it.
  onGone?: () => void
}

let current: AttachSession | null = null
// The height the system sheet opens at, a share of the screen (see attachDetent).
let detent = 0.5
// What to do once the menu is fully off the screen: a picker, or a screen pushed, must not
// start while the sheet is still going away, or iOS tears it down with the sheet.
let after: (() => void) | null = null

export function setAttachSession(session: AttachSession) {
  current = session
  after = null
  const height = Dimensions.get('window').height
  const lost = session.recents === null ? WITHOUT_RECENTS - RECENTS_OFF_NOTE : session.recents?.length === 0 ? WITHOUT_RECENTS : 0
  const gained = session.galleries?.length ? CARD_ROW : 0
  const off =
    (isFeatureOn('personas') ? 0 : CARD_ROW) +
    (isFeatureOn('direction') && session.onSetDirection ? 0 : CARD_ROW) +
    (session.onToggleThinking ? 0 : THINKING_ROW)
  const targetHeight = BASE_SHEET_HEIGHT + gained - lost - off
  detent = height > 0 ? Math.min(0.88, Math.max(0.32, targetHeight / height)) : 0.5
}

// Read by the root layout as the sheet is presented, so a menu with less in it opens lower.
export function attachDetent() {
  return detent
}

export function attachSession() {
  return current
}

// The menu stays open after a persona is chosen, so its row shows the new one.
export function choosePersona(session: AttachSession, persona: Persona | null) {
  session.persona = persona
  session.personaId = persona?.id ?? null
  session.onSelectPersona?.(persona?.id ?? null)
}

export function setAttachAfter(action: (() => void) | null) {
  after = action
}

// Runs once per opening, whichever of the sheet's ends reports first. Given a session, only
// that one: a menu opened again meanwhile is left alone.
export function finishAttachSession(only?: AttachSession | null) {
  const session = current
  if (!session || (only !== undefined && only !== session)) return
  const action = after
  current = null
  after = null
  session.onGone?.()
  if (action) action()
  else session.onClosed()
}

import type { MessageImage } from '@/db/messages'
import type { Persona } from '@/db/personas'
import type { ImageSource } from '@/lib/images/images'

// What the attach menu of the composer works with and where its choices go: the field's
// pictures, the chat's thinking switch and persona. On iOS the menu is a form sheet of the
// stack (app/attach), so it is passed around the router like the generator's draft.
export type AttachSession = {
  thinking?: boolean
  onToggleThinking?: (thinking: boolean) => void
  persona?: Persona | null
  personaId?: number | null
  onSelectPersona?: (personaId: number | null) => void
  onPick: (source: ImageSource) => void
  onAttach: (pictures: MessageImage[]) => void
  // The menu is gone and nothing was chosen to follow it: the field may take the keyboard back.
  onClosed: () => void
}

let current: AttachSession | null = null
// What to do once the menu is fully off the screen: a picker, or a screen pushed, must not
// start while the sheet is still going away, or iOS tears it down with the sheet.
let after: (() => void) | null = null

export function setAttachSession(session: AttachSession) {
  current = session
  after = null
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
  if (action) action()
  else session.onClosed()
}

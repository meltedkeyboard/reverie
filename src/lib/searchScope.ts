// The tab the user was on before opening search. Search puts what belongs to that tab
// first, the way Spotlight leads with what fits the context.
export type SearchScope = 'characters' | 'rooms' | 'settings'

let scope: SearchScope = 'characters'

const TAB_SCOPES: Record<string, SearchScope> = { index: 'characters', rooms: 'rooms', settings: 'settings' }

export function noteTabFocus(routeName: string) {
  const next = TAB_SCOPES[routeName]
  if (next) scope = next
}

export function getSearchScope() {
  return scope
}

// The places in Settings a search result opens at: /settings?section=server.
export type SettingsSection =
  | 'appearance'
  | 'language'
  | 'continue'
  | 'private'
  | 'confirmDelete'
  | 'haptics'
  | 'faceId'
  | 'files'
  | 'icloud'
  | 'server'
  | 'backup'
  | 'wipe'

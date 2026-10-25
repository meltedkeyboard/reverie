import { useEffect, useRef, useState, useSyncExternalStore, type SetStateAction } from 'react'

import { getGenSession, setGenInput, subscribeGenSessions } from '@/db/genSessions'
import { useDatabase } from '@/db/provider'
import { createRequiredContext } from '@/lib/core/requiredContext'

// The session of the generator sheet open now (app/generate.tsx): which text it writes, and
// starting over, which forgets the session and builds the sheet anew.
export const [GenSessionContext, useGenSessionContext] = createRequiredContext<{ key: string; startOver: () => void }>(
  'useGenSessionContext must be used within the generator sheet'
)

// A field of a generator, as useState, that comes back with the session: its value is the
// one kept, else the fallback, and each change is kept. Left as it opened, nothing is written,
// so a sheet only looked at leaves no session behind.
export function useGenInput<T>(name: string, fallback: T) {
  const db = useDatabase()
  const { key } = useGenSessionContext()
  const [value, setValue] = useState<T>(() => {
    const inputs = getGenSession(key)?.inputs
    return inputs && name in inputs ? (inputs[name] as T) : fallback
  })
  const opened = useRef(value)
  useEffect(() => {
    if (value === opened.current && !(name in (getGenSession(key)?.inputs ?? {}))) return
    setGenInput(db, key, name, value)
  }, [db, key, name, value])
  return [value, setValue] as [T, (next: SetStateAction<T>) => void]
}

// Whether the sheet open now has anything kept, for the button that starts over.
export function useHasGenSession() {
  const { key } = useGenSessionContext()
  return useSyncExternalStore(subscribeGenSessions, () => getGenSession(key) !== null)
}

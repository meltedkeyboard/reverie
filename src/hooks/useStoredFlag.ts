import type { SQLiteDatabase } from 'expo-sqlite'
import { useCallback, useEffect, useRef, useState } from 'react'

import { isPrivateChatEnabled, setPrivateChatEnabled } from '@/db/privateChat'
import { useDatabase } from '@/db/provider'
import { isSuggestionsEnabled, setSuggestionsEnabled } from '@/db/suggestions'

// A value that lives in the database: shown as `initial` until it is read, and written
// back as soon as it changes. The setter keeps its identity, so it can sit in context values.
export function useStoredValue<T>(
  load: (db: SQLiteDatabase) => Promise<T>,
  save: (db: SQLiteDatabase, value: T) => Promise<void>,
  initial: T
) {
  const db = useDatabase()
  const [value, setValue] = useState(initial)
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    load(db).then(setValue)
    // load is a module-level function of the caller, not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db])

  const update = useCallback(
    (next: T) => {
      setValue(next)
      saveRef.current(db, next)
    },
    [db]
  )
  return [value, update] as const
}

// A switch that lives in the database.
export const useStoredFlag = useStoredValue<boolean>

// The two header and field switches a chat and a scene both read from Settings.
export function useChatSwitches() {
  const [privateEnabled] = useStoredFlag(isPrivateChatEnabled, setPrivateChatEnabled, true)
  const [suggestEnabled] = useStoredFlag(isSuggestionsEnabled, setSuggestionsEnabled, false)
  return { privateEnabled, suggestEnabled }
}

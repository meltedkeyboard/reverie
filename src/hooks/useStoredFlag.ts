import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite'
import { useEffect, useState } from 'react'

// A switch that lives in the database: shown as `initial` until it is read, and written
// back as soon as it changes.
export function useStoredFlag(
  load: (db: SQLiteDatabase) => Promise<boolean>,
  save: (db: SQLiteDatabase, on: boolean) => Promise<void>,
  initial: boolean
) {
  const db = useSQLiteContext()
  const [value, setValue] = useState(initial)

  useEffect(() => {
    load(db).then(setValue)
    // load is a module-level function of the caller, not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db])

  const update = (on: boolean) => {
    setValue(on)
    save(db, on)
  }
  return [value, update] as const
}

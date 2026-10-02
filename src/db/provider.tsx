import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { convertLegacyAttachments, pruneAttachments } from '@/db/attachments'
import { migrate } from '@/db/schema'
import { databaseDirectory, discardInactiveDatabase, moveStorage } from '@/lib/storage'

type DatabaseContextValue = {
  db: SQLiteDatabase
  setShownInFiles: (shown: boolean) => Promise<void>
  reload: () => Promise<void>
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null)

// expo-sqlite hands out one cached connection per path, and closing the old one would close
// that too, so a reload of the same file asks for a new connection.
async function openReverieDatabase(newConnection = false) {
  const db = await openDatabaseAsync('reverie.db', newConnection ? { useNewConnection: true } : undefined, databaseDirectory())
  await migrate(db)
  // Housekeeping must never keep the app from opening.
  try {
    await convertLegacyAttachments(db)
    await pruneAttachments(db)
  } catch (err) {
    console.warn('Attachments housekeeping failed', err)
  }
  return db
}

// Stands in for expo-sqlite's SQLiteProvider, which can only swap databases by unmounting
// the whole tree (and with it the navigation state). Here the new database is opened first
// and handed down in place of the old one, so every screen just reloads from it.
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const retired = useRef<SQLiteDatabase | null>(null)
  // The one open now, which after a move is no longer the one opened first.
  const current = useRef<SQLiteDatabase | null>(null)

  useEffect(() => {
    let cancelled = false
    openReverieDatabase().then(
      (next) => {
        if (cancelled) {
          next.closeAsync().catch(() => {})
          return
        }
        current.current = next
        setDb(next)
      },
      (err) => setError(err)
    )
    return () => {
      cancelled = true
      current.current?.closeAsync().catch(() => {})
      current.current = null
    }
  }, [])

  // The old database is closed only once the screens have re-rendered with the new one,
  // so nothing still holding it gets a "database is closed" error mid-query.
  useEffect(() => {
    const old = retired.current
    if (!old || old === db) return
    retired.current = null
    old
      .closeAsync()
      .catch(() => {})
      .then(() => discardInactiveDatabase())
      .catch((err) => console.warn('Could not remove the old database', err))
  }, [db])

  const setShownInFiles = useCallback(
    async (shown: boolean) => {
      if (!db) return
      const undo = await moveStorage(db, shown)
      let next: SQLiteDatabase
      try {
        next = await openReverieDatabase()
      } catch (err) {
        // Otherwise the marker points at the copy while the app keeps writing to the old one.
        undo()
        throw err
      }
      retired.current = db
      current.current = next
      setDb(next)
    },
    [db]
  )

  // For after the data was replaced underneath (an iCloud pull): the same file on a new
  // connection, so every screen reloads through its [db] effects.
  const reload = useCallback(async () => {
    if (!db) return
    const next = await openReverieDatabase(true)
    retired.current = db
    current.current = next
    setDb(next)
  }, [db])

  const value = useMemo(() => (db ? { db, setShownInFiles, reload } : null), [db, setShownInFiles, reload])

  // Thrown during render so StartupBoundary shows why the app can't start.
  if (error) throw error
  if (!value) return null
  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>
}

function useDatabaseContext() {
  const value = useContext(DatabaseContext)
  if (!value) throw new Error('useDatabase must be used within a <DatabaseProvider>')
  return value
}

export function useDatabase() {
  return useDatabaseContext().db
}

export function useShowInFiles() {
  return useDatabaseContext().setShownInFiles
}

export function useReloadDatabase() {
  return useDatabaseContext().reload
}

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { convertLegacyAttachments, pruneAttachments } from '@/db/attachments'
import { loadDrafts } from '@/db/drafts'
import { loadGenSessions } from '@/db/genSessions'
import { migrate } from '@/db/schema'
import { databaseDirectory, discardInactiveDatabase, moveStorage } from '@/lib/core/storage'
import { createRequiredContext } from '@/lib/core/requiredContext'

type DatabaseContextValue = {
  db: SQLiteDatabase
  setShownInFiles: (shown: boolean) => Promise<void>
  reload: () => Promise<void>
}

// How long a database given up stays open for the queries still running on it.
const RETIRE_DELAY = 3000

const [DatabaseContext, useDatabaseContext] = createRequiredContext<DatabaseContextValue>('useDatabase must be used within a <DatabaseProvider>')

// expo-sqlite hands out one cached connection per path, and closing the old one would close
// that too, so a reload of the same file asks for a new connection.
async function openReverieDatabase(newConnection = false) {
  const db = await openDatabaseAsync('reverie.db', newConnection ? { useNewConnection: true } : undefined, databaseDirectory())
  await migrate(db)
  await loadDrafts(db)
  await loadGenSessions(db)
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
  // and a little after that: a query a screen started on it just before is still running
  // then, and closing under it failed its statement ("Access to closed resource").
  useEffect(() => {
    const old = retired.current
    if (!old || old === db) return
    retired.current = null
    setTimeout(() => {
      old
        .closeAsync()
        .catch(() => {})
        .then(() => discardInactiveDatabase())
        .catch((err) => console.warn('Could not remove the old database', err))
    }, RETIRE_DELAY)
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

  // For after the data was replaced underneath (a pull from the sync folder): the same file on a new
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

export function useDatabase() {
  return useDatabaseContext().db
}

export function useShowInFiles() {
  return useDatabaseContext().setShownInFiles
}

export function useReloadDatabase() {
  return useDatabaseContext().reload
}

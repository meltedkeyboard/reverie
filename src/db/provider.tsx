import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'

import { convertLegacyAttachments, pruneAttachments } from '@/db/attachments'
import { pruneGallery } from '@/db/gallery'
import { loadDrafts } from '@/db/drafts'
import { loadGenSessions } from '@/db/genSessions'
import { migrate } from '@/db/schema'
import { databaseDirectory } from '@/lib/core/storage'
import { createRequiredContext } from '@/lib/core/requiredContext'

type DatabaseContextValue = {
  db: SQLiteDatabase
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
    await pruneGallery(db)
  } catch (err) {
    console.warn('Attachments housekeeping failed', err)
  }
  return db
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const retired = useRef<SQLiteDatabase | null>(null)
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

  // Checkpoint WAL writes into the main database file when the app leaves the foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && current.current) {
        current.current.execAsync('PRAGMA wal_checkpoint(TRUNCATE);').catch(() => {})
      }
    })
    return () => sub.remove()
  }, [])

  // The old database is closed only once the screens have re-rendered with the new one
  useEffect(() => {
    const old = retired.current
    if (!old || old === db) return
    retired.current = null
    setTimeout(() => {
      old.closeAsync().catch(() => {})
    }, RETIRE_DELAY)
  }, [db])

  // Reloads connection after cloud sync pull replaces rows
  const reload = useCallback(async () => {
    if (!db) return
    const next = await openReverieDatabase(true)
    retired.current = db
    current.current = next
    setDb(next)
  }, [db])

  const value = useMemo(() => (db ? { db, reload } : null), [db, reload])

  // Thrown during render so StartupBoundary shows why the app can't start.
  if (error) throw error
  if (!value) return null
  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>
}

export function useDatabase() {
  return useDatabaseContext().db
}

export function useReloadDatabase() {
  return useDatabaseContext().reload
}

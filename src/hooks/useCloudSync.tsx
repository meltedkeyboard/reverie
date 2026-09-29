import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'

import { forgetSyncRev, getSyncState, isCloudSyncEnabled, setCloudSyncEnabled } from '@/db/cloudSync'
import { useDatabase, useReloadDatabase } from '@/db/provider'
import { t } from '@/i18n'
import { cloudFolderName, cloudSyncAvailable, forgetCloudFolder, pickCloudFolder, syncWithCloud, type SyncMode } from '@/lib/cloudSync'
import { confirm, showMessage, showSheet } from '@/lib/dialogs'
import { errorMessage } from '@/lib/errors'

type CloudSync = {
  available: boolean
  enabled: boolean
  folder: string | null
  syncing: boolean
  syncedAt: number | null
  enable: () => Promise<void>
  disable: () => Promise<void>
  changeFolder: () => Promise<void>
  pushNow: () => Promise<void>
  pullNow: () => Promise<void>
}

const CloudSyncContext = createContext<CloudSync | null>(null)

// Syncs when the app starts and comes to the front (both ways) and when it leaves (up
// only). Errors of those quiet runs are only logged; the push and pull buttons show them.
export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const db = useDatabase()
  const reload = useReloadDatabase()
  const [enabled, setEnabled] = useState(false)
  const [folder, setFolder] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncedAt, setSyncedAt] = useState<number | null>(null)

  // A pull hands out a new connection, which must not start another sync.
  const dbRef = useRef(db)
  dbRef.current = db
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  const enabledRef = useRef(false)
  // A conflict dismissed once is not asked about again on every return to the app.
  const conflictDismissed = useRef(false)

  const refresh = useCallback(async () => {
    const state = await getSyncState(dbRef.current)
    setSyncedAt(state.syncedAt)
    setFolder(cloudFolderName())
  }, [])

  const sync = useCallback(
    async (mode: SyncMode, loud: boolean) => {
      if (!enabledRef.current) return null
      setSyncing(true)
      try {
        const outcome = await syncWithCloud(mode)
        if (outcome === 'pulled') await reloadRef.current()
        if (outcome === 'conflict' && mode === 'auto' && (loud || !conflictDismissed.current)) askConflict()
        return outcome
      } catch (err) {
        if (loud) showMessage(t('sync.failedTitle'), errorMessage(err))
        else console.warn('iCloud sync failed', err)
        return null
      } finally {
        setSyncing(false)
        refresh().catch(() => {})
      }
    },
    // askConflict calls sync back; both only read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh]
  )

  const askConflict = () => {
    conflictDismissed.current = true
    showSheet(t('sync.conflictTitle'), [
      { label: t('sync.keepDevice'), onSelect: () => sync('local', true) },
      { label: t('sync.takeCloud'), onSelect: () => sync('cloud', true) },
    ])
  }

  useEffect(() => {
    if (!cloudSyncAvailable) return
    isCloudSyncEnabled(dbRef.current).then((on) => {
      enabledRef.current = on
      setEnabled(on)
      refresh().catch(() => {})
      if (on) sync('auto', false)
    })
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync('auto', false)
      else if (state === 'background') sync('push-only', false)
    })
    return () => subscription.remove()
  }, [refresh, sync])

  const enable = useCallback(async () => {
    let name = cloudFolderName()
    if (!name) {
      name = await pickCloudFolder()
      if (!name) return
      await forgetSyncRev(dbRef.current)
    }
    await setCloudSyncEnabled(dbRef.current, true)
    enabledRef.current = true
    setEnabled(true)
    setFolder(name)
    conflictDismissed.current = false
    await sync('auto', true)
  }, [sync])

  const disable = useCallback(async () => {
    enabledRef.current = false
    setEnabled(false)
    await setCloudSyncEnabled(dbRef.current, false)
    forgetCloudFolder()
    await forgetSyncRev(dbRef.current)
    setFolder(null)
    setSyncedAt(null)
  }, [])

  const changeFolder = useCallback(async () => {
    const name = await pickCloudFolder()
    if (!name) return
    await forgetSyncRev(dbRef.current)
    setFolder(name)
    conflictDismissed.current = false
    await sync('auto', true)
  }, [sync])

  // Like git: a push that would overwrite what another device sent, or a pull that would
  // replace changes made here, asks first.
  const pushNow = useCallback(async () => {
    const outcome = await sync('push', true)
    if (outcome === 'unchanged') showMessage(t('sync.upToDate'), t('sync.nothingToPush'))
    else if (outcome === 'behind') {
      confirm({
        title: t('sync.pushBehindTitle'),
        message: t('sync.pushBehindText'),
        confirmLabel: t('sync.pushAnyway'),
        destructive: true,
        onConfirm: () => sync('local', true),
      })
    }
  }, [sync])

  const pullNow = useCallback(async () => {
    const outcome = await sync('pull', true)
    if (outcome === 'unchanged') showMessage(t('sync.upToDate'), t('sync.nothingToPull'))
    else if (outcome === 'empty') showMessage(t('sync.upToDate'), t('sync.cloudEmpty'))
    else if (outcome === 'conflict') {
      confirm({
        title: t('sync.pullOverTitle'),
        message: t('sync.pullOverText'),
        confirmLabel: t('sync.pullAnyway'),
        destructive: true,
        onConfirm: () => sync('cloud', true),
      })
    }
  }, [sync])

  const value = useMemo(
    () => ({ available: cloudSyncAvailable, enabled, folder, syncing, syncedAt, enable, disable, changeFolder, pushNow, pullNow }),
    [enabled, folder, syncing, syncedAt, enable, disable, changeFolder, pushNow, pullNow]
  )

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>
}

export function useCloudSync() {
  const value = useContext(CloudSyncContext)
  if (!value) throw new Error('useCloudSync must be used within a <CloudSyncProvider>')
  return value
}

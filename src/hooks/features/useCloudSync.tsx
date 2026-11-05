import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'

import {
  DEFAULT_SMB_SETTINGS,
  forgetSyncRev,
  getSmbSettings,
  getSyncProvider,
  getSyncState,
  isCloudSyncEnabled,
  saveSmbSettings,
  setCloudSyncEnabled,
  setSyncProvider,
  type SmbSettings,
  type SyncProvider,
} from '@/db/prefs/cloudSync'
import { useDatabase, useReloadDatabase } from '@/db/provider'
import { t } from '@/i18n'
import { cloudFolderName, cloudSyncAvailable, forgetCloudFolder, pickCloudFolder, syncWithCloud, type SyncMode } from '@/lib/transfer/cloudSync'
import { showSheet } from '@/lib/ui/dialogs'
import { showToast } from '@/lib/ui/toast'
import { reportError } from '@/lib/transfer/report'
import { createRequiredContext } from '@/lib/core/requiredContext'

type CloudSync = {
  available: boolean
  enabled: boolean
  provider: SyncProvider
  folder: string | null
  smb: SmbSettings
  syncing: boolean
  syncedAt: number | null
  enable: () => Promise<void>
  disable: () => Promise<void>
  switchProvider: (provider: SyncProvider) => Promise<void>
  updateSmb: (settings: Partial<SmbSettings>) => Promise<void>
  changeFolder: () => Promise<void>
  pushNow: () => Promise<void>
  pullNow: () => Promise<void>
  refresh: () => Promise<void>
}

export const [CloudSyncContext, useCloudSync] = createRequiredContext<CloudSync>('useCloudSync must be used within a <CloudSyncProvider>')

// Syncs when the app starts and comes to the front (both ways) and when it leaves (up
// only). Errors of those quiet runs are only logged; the push and pull buttons show them.
export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const db = useDatabase()
  const reload = useReloadDatabase()
  const [enabled, setEnabled] = useState(false)
  const [provider, setProviderState] = useState<SyncProvider>('folder')
  const [folder, setFolder] = useState<string | null>(null)
  const [smb, setSmbState] = useState<SmbSettings>(DEFAULT_SMB_SETTINGS)
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
    const [state, currentProvider, currentSmb] = await Promise.all([
      getSyncState(dbRef.current),
      getSyncProvider(dbRef.current),
      getSmbSettings(dbRef.current),
    ])
    setSyncedAt(state.syncedAt)
    setFolder(cloudFolderName())
    setProviderState(currentProvider)
    setSmbState(currentSmb)
  }, [])

  const sync = useCallback(
    async (mode: SyncMode, loud: boolean) => {
      if (!enabledRef.current) return null
      setSyncing(true)
      try {
        const outcome = await syncWithCloud(mode)
        if (outcome === 'pulled') await reloadRef.current()
        if (outcome === 'conflict' && mode === 'auto' && (loud || !conflictDismissed.current)) askConflict(loud)
        return outcome
      } catch (err) {
        if (loud) reportError(t('sync.failedTitle'), err)
        else console.warn('Sync failed', err)
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

  const askConflict = (loud: boolean) => {
    conflictDismissed.current = true
    const choices = [
      { label: t('sync.keepDevice'), onPress: () => sync('local', true) },
      { label: t('sync.takeCloud'), onPress: () => sync('cloud', true) },
    ]
    if (loud) showToast({ tone: 'info', title: t('sync.conflictTitle'), actions: choices })
    else showSheet(t('sync.conflictTitle'), choices.map(({ label, onPress }) => ({ label, onSelect: onPress })))
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
    const currentProvider = await getSyncProvider(dbRef.current)
    if (currentProvider === 'folder') {
      let name = cloudFolderName()
      if (!name) {
        name = await pickCloudFolder()
        if (!name) return
        await forgetSyncRev(dbRef.current)
      }
      setFolder(name)
    }
    await setCloudSyncEnabled(dbRef.current, true)
    enabledRef.current = true
    setEnabled(true)
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

  const switchProvider = useCallback(
    async (nextProvider: SyncProvider) => {
      await setSyncProvider(dbRef.current, nextProvider)
      setProviderState(nextProvider)
      await forgetSyncRev(dbRef.current)
      await refresh()
      if (enabledRef.current) {
        await sync('auto', true)
      }
    },
    [refresh, sync]
  )

  const updateSmb = useCallback(
    async (partial: Partial<SmbSettings>) => {
      await saveSmbSettings(dbRef.current, partial)
      await refresh()
    },
    [refresh]
  )

  const changeFolder = useCallback(async () => {
    const name = await pickCloudFolder()
    if (!name) return
    await forgetSyncRev(dbRef.current)
    setFolder(name)
    conflictDismissed.current = false
    await sync('auto', true)
  }, [sync])

  const pushNow = useCallback(async () => {
    const outcome = await sync('push', true)
    if (outcome === 'unchanged') showToast({ tone: 'info', title: t('sync.upToDate'), message: t('sync.nothingToPush') })
    else if (outcome === 'behind') {
      showToast({
        tone: 'info',
        title: t('sync.pushBehindTitle'),
        message: t('sync.pushBehindText'),
        actions: [{ label: t('sync.pushAnyway'), destructive: true, onPress: () => sync('local', true) }],
      })
    }
  }, [sync])

  const pullNow = useCallback(async () => {
    const outcome = await sync('pull', true)
    if (outcome === 'unchanged') showToast({ tone: 'info', title: t('sync.upToDate'), message: t('sync.nothingToPull') })
    else if (outcome === 'empty') showToast({ tone: 'info', title: t('sync.upToDate'), message: t('sync.cloudEmpty') })
    else if (outcome === 'conflict') {
      showToast({
        tone: 'info',
        title: t('sync.pullOverTitle'),
        message: t('sync.pullOverText'),
        actions: [{ label: t('sync.pullAnyway'), destructive: true, onPress: () => sync('cloud', true) }],
      })
    }
  }, [sync])

  const value = useMemo(
    () => ({
      available: cloudSyncAvailable,
      enabled,
      provider,
      folder,
      smb,
      syncing,
      syncedAt,
      enable,
      disable,
      switchProvider,
      updateSmb,
      changeFolder,
      pushNow,
      pullNow,
      refresh,
    }),
    [enabled, provider, folder, smb, syncing, syncedAt, enable, disable, switchProvider, updateSmb, changeFolder, pushNow, pullNow, refresh]
  )

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>
}

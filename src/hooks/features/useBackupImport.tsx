import { useState } from 'react'

import { BackupTreeSheet } from '@/components/overlays/BackupTreeSheet'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { importBackup, readBackup, type OpenedBackup } from '@/lib/transfer/backup'
import type { Selection } from '@/lib/transfer/backupSelection'
import { reportError } from '@/lib/transfer/report'
import { showToast } from '@/lib/ui/toast'

// Bringing backups in: the opened files, the sheet with what to take from each, and the toast.
// `pick` asks for a file; `open` takes ones that came by themselves (several characters
// dropped at once, a file opened from Files), whose sheets then come one after another.
export function useBackupImport(onImported?: () => void) {
  const db = useDatabase()
  const { t } = useTranslation()
  const [queue, setQueue] = useState<OpenedBackup[]>([])
  const [importing, setImporting] = useState(false)
  const current = queue[0] ?? null

  const open = async (read: () => Promise<OpenedBackup[]>) => {
    setImporting(true)
    try {
      const opened = await read()
      setQueue((prev) => [...prev, ...opened])
    } catch (err) {
      reportError(t('settings.importFailedTitle'), err)
    } finally {
      setImporting(false)
    }
  }

  const next = () => setQueue((prev) => prev.slice(1))

  const run = async (selection: Selection) => {
    const backup = current
    next()
    if (!backup) return
    setImporting(true)
    try {
      const res = await importBackup(db, backup, selection)
      showToast({
        tone: 'success',
        title: t('settings.importDoneTitle'),
        message: t('settings.importDoneMessage', { characters: res.characters, rooms: res.rooms, chats: res.chats }),
      })
      onImported?.()
    } catch (err) {
      reportError(t('settings.importFailedTitle'), err)
    } finally {
      setImporting(false)
    }
  }

  const sheet = <BackupTreeSheet tree={current?.tree ?? null} confirmLabel={t('settings.importJson')} onConfirm={run} onClose={next} />

  return {
    importing,
    pick: () => open(async () => {
      const opened = await readBackup()
      return opened ? [opened] : []
    }),
    open,
    sheet,
  }
}

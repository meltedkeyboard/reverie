import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { FormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { useScreenPadding } from '@/components/chrome/GlassHeader'
import { ButtonCell, LinkCell, ListSection, SegmentCell, SwitchCell, ValueCell } from '@/components/lists/GroupedList'
import { ChipRowCell } from '@/components/lists/PictureCells'
import { useCloudSync } from '@/hooks/features/useCloudSync'
import { useTranslation } from '@/i18n'
import { formatWhen } from '@/lib/core/format'
import { reportError } from '@/lib/transfer/report'
import * as Haptics from '@/lib/ui/haptics'
import { type Colors, useColors, useStyles } from '@/theme'
import type { SyncProvider } from '@/db/prefs/cloudSync'

export default function SyncScreen() {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const padding = useScreenPadding('form')
  const styles = useStyles(createStyles)
  const cloudSync = useCloudSync()

  const [activeAction, setActiveAction] = useState<'push' | 'pull' | null>(null)

  const toggleSync = async (on: boolean) => {
    try {
      if (on) await cloudSync.enable()
      else await cloudSync.disable()
    } catch (err: unknown) {
      reportError(t('sync.failedTitle'), err)
    }
  }

  const runAction = async (action: 'push' | 'pull', fn: () => Promise<void>) => {
    setActiveAction(action)
    try {
      await fn()
    } finally {
      setActiveAction(null)
    }
  }

  const statusText = cloudSync.syncedAt
    ? t('settings.folderSyncSyncedAt', { when: formatWhen(cloudSync.syncedAt, locale) })
    : t('sync.neverSynced')

  return (
    <>
      <FormScreenHeader title={t('sync.title')} />
      <ScrollView contentContainerStyle={padding}>
        {/* Main Enable / Provider Toggle */}
        <ListSection header={t('sync.sectionGeneral')} footer={cloudSync.enabled ? t('sync.autoSyncFooter') : t('settings.folderSyncSyncNote')}>
          <SwitchCell
            label={t('sync.enabled')}
            value={cloudSync.enabled}
            onValueChange={toggleSync}
            disabled={cloudSync.syncing}
          />
          {cloudSync.enabled && (
            <SwitchCell
              label={t('sync.autoSync')}
              value={cloudSync.autoSync}
              onValueChange={cloudSync.toggleAutoSync}
              disabled={cloudSync.syncing}
            />
          )}
          {cloudSync.enabled && (
            <SegmentCell<SyncProvider>
              label={t('sync.storageType')}
              value={cloudSync.provider}
              onChange={(p) => {
                Haptics.selectionAsync()
                cloudSync.switchProvider(p)
              }}
              options={[
                { value: 'folder', label: t('sync.providerFolder') },
                { value: 'smb', label: t('sync.providerSmb') },
              ]}
            />
          )}
        </ListSection>

        {/* Folder Details */}
        {cloudSync.enabled && cloudSync.provider === 'folder' && (
          <ListSection header={t('sync.sectionStorage')} footer={t('sync.folderNote')}>
            <ValueCell
              label={t('sync.currentFolder')}
              value={cloudSync.folder ?? t('settings.folderSyncNoFolder')}
            />
            <ButtonCell
              label={t('settings.folderSyncChangeFolder')}
              onPress={() => cloudSync.changeFolder().catch((err) => reportError(t('sync.failedTitle'), err))}
              icon={{ symbol: 'folder', fallback: 'folder-outline' }}
            />
          </ListSection>
        )}

        {/* SMB Details */}
        {cloudSync.enabled && cloudSync.provider === 'smb' && (
          <ListSection header={t('sync.sectionSmb')} footer={t('sync.smbNote')}>
            <ValueCell
              label={t('sync.serverHost')}
              value={
                cloudSync.smb.host
                  ? `${cloudSync.smb.host}${cloudSync.smb.share ? ` / ${cloudSync.smb.share}` : ''}`
                  : t('sync.smbNotConfigured')
              }
            />
            {cloudSync.smb.path ? (
              <ValueCell label={t('sync.subfolderPath')} value={cloudSync.smb.path} />
            ) : null}
            <LinkCell
              label={t('sync.configureSmb')}
              onPress={() => router.push('/sync/smb')}
            />
          </ListSection>
        )}

        {/* Actions (Push / Pull) */}
        {cloudSync.enabled && (
          <ListSection header={t('sync.sectionActions')} footer={statusText}>
            <ChipRowCell
              actions={[
                {
                  label: t('settings.folderSyncPush'),
                  icon: { symbol: 'arrow.up', fallback: 'arrow-up' },
                  slide: 'up',
                  onPress: () => runAction('push', cloudSync.pushNow),
                  loading: activeAction === 'push',
                  disabled: cloudSync.syncing || activeAction === 'pull',
                },
                {
                  label: t('settings.folderSyncPull'),
                  icon: { symbol: 'arrow.down', fallback: 'arrow-down' },
                  slide: 'down',
                  onPress: () => runAction('pull', cloudSync.pullNow),
                  loading: activeAction === 'pull',
                  disabled: cloudSync.syncing || activeAction === 'push',
                },
              ]}
            />
          </ListSection>
        )}
      </ScrollView>
    </>
  )
}

const createStyles = (_colors: Colors) =>
  StyleSheet.create({
    // Follows GroupedList styling natively
  })

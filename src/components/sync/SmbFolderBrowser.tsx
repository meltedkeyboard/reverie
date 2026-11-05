import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { Button } from '@/components/controls/Button/Button'
import { PageSheet } from '@/components/overlays/PageSheet'
import { SFIcon } from '@/components/visuals/SFIcon'
import { useTranslation } from '@/i18n'
import { createSmbDirectory, listSmbDirectory, type SmbConfig, type SmbFileItem } from '@/lib/transfer/smbClient'
import * as Haptics from '@/lib/ui/haptics'
import { type Colors, useColors, useStyles } from '@/theme'

type Props = {
  visible: boolean
  config: SmbConfig
  initialPath: string
  onSelectPath: (path: string) => void
  onClose: () => void
}

export function SmbFolderBrowser({ visible, config, initialPath, onSelectPath, onClose }: Props) {
  const { t } = useTranslation()
  const colors = useColors()
  const styles = useStyles(createStyles)

  const [currentPath, setCurrentPath] = useState(initialPath.trim() || '')
  const [items, setItems] = useState<SmbFileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Creation of a new directory inside current folder
  const [creating, setCreating] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [submittingCreate, setSubmittingCreate] = useState(false)

  const loadDirectory = useCallback(
    async (path: string) => {
      setLoading(true)
      setError(null)
      try {
        const list = await listSmbDirectory(config, path)
        // Folders first, sorted alphabetically
        list.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
        setItems(list)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [config]
  )

  useEffect(() => {
    if (visible) {
      setCurrentPath(initialPath.trim() || '')
      loadDirectory(initialPath.trim() || '')
    }
  }, [visible, initialPath, loadDirectory])

  const goInto = (dirName: string) => {
    Haptics.selectionAsync()
    const next = currentPath ? `${currentPath.replace(/\/$/, '')}/${dirName}` : dirName
    setCurrentPath(next)
    loadDirectory(next)
  }

  const goUp = () => {
    Haptics.selectionAsync()
    if (!currentPath) return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    const next = parts.join('/')
    setCurrentPath(next)
    loadDirectory(next)
  }

  const handleCreateDirectory = async () => {
    const trimmed = newDirName.trim()
    if (!trimmed) return
    setSubmittingCreate(true)
    try {
      const fullPath = currentPath ? `${currentPath.replace(/\/$/, '')}/${trimmed}` : trimmed
      await createSmbDirectory(config, fullPath)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setNewDirName('')
      setCreating(false)
      loadDirectory(currentPath)
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmittingCreate(false)
    }
  }

  const handleApply = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    onSelectPath(currentPath)
    onClose()
  }

  const canGoUp = currentPath.length > 0
  const pathLabel = currentPath ? `/${currentPath}` : '/'

  return (
    <PageSheet
      visible={visible}
      onClose={onClose}
      title={config.share ? `${config.share}${pathLabel}` : pathLabel}
      left={
        <Pressable onPress={canGoUp ? goUp : onClose} hitSlop={12} style={styles.navButton}>
          <SFIcon
            name={canGoUp ? 'chevron.left' : 'xmark'}
            fallback={canGoUp ? 'chevron-back' : 'close'}
            size={20}
            color={colors.accent}
          />
          <Text style={styles.navButtonText}>{canGoUp ? t('sync.browserUp') : t('dialog.cancel')}</Text>
        </Pressable>
      }
      right={
        <Pressable onPress={() => setCreating((c) => !c)} hitSlop={12} style={styles.navButton}>
          <SFIcon name="folder.badge.plus" fallback="add" size={22} color={colors.accent} />
        </Pressable>
      }
    >
      <View style={styles.content}>
        {creating && (
          <View style={styles.createCard}>
            <Text style={styles.createTitle}>{t('sync.newFolderTitle')}</Text>
            <View style={styles.createRow}>
              <TextInput
                style={styles.createInput}
                value={newDirName}
                onChangeText={setNewDirName}
                placeholder={t('sync.newFolderPlaceholder')}
                placeholderTextColor={colors.textFaint}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
              />
              <Button
                label={t('sync.createFolder')}
                onPress={handleCreateDirectory}
                disabled={!newDirName.trim() || submittingCreate}
              />
            </View>
          </View>
        )}

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <Button label={t('sync.browserRetry')} onPress={() => loadDirectory(currentPath)} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.name}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{t('sync.folderEmpty')}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.itemRow, pressed && item.isDirectory && styles.itemRowPressed]}
                disabled={!item.isDirectory}
                onPress={() => item.isDirectory && goInto(item.name)}
              >
                <View style={styles.itemIcon}>
                  <SFIcon
                    name={item.isDirectory ? 'folder.fill' : 'doc.fill'}
                    fallback={item.isDirectory ? 'folder' : 'document-outline'}
                    size={22}
                    color={item.isDirectory ? colors.accent : colors.textMuted}
                  />
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {!item.isDirectory && (
                    <Text style={styles.itemMeta}>{Math.round(item.size / 1024)} KB</Text>
                  )}
                </View>
                {item.isDirectory && (
                  <SFIcon name="chevron.right" fallback="chevron-forward" size={16} color={colors.textMuted} />
                )}
              </Pressable>
            )}
          />
        )}

        <View style={styles.footer}>
          <Text style={styles.footerPath} numberOfLines={1}>
            {t('sync.selectedFolder')}: {pathLabel}
          </Text>
          <Button label={t('sync.useThisFolder')} onPress={handleApply} />
        </View>
      </View>
    </PageSheet>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    content: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    navButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    navButtonText: {
      fontSize: 16,
      color: colors.accent,
    },
    centerContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 16,
    },
    errorText: {
      fontSize: 15,
      color: colors.danger,
      textAlign: 'center',
    },
    emptyContainer: {
      padding: 40,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 15,
      color: colors.textMuted,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 12,
    },
    itemRowPressed: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: 10,
    },
    itemIcon: {
      width: 28,
      alignItems: 'center',
    },
    itemInfo: {
      flex: 1,
    },
    itemName: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
    },
    itemMeta: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    createCard: {
      margin: 16,
      padding: 14,
      backgroundColor: colors.surface,
      borderRadius: 16,
      gap: 10,
    },
    createTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    createRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
    },
    createInput: {
      flex: 1,
      height: 38,
      backgroundColor: colors.bg,
      borderRadius: 10,
      paddingHorizontal: 12,
      fontSize: 15,
      color: colors.text,
    },
    footer: {
      padding: 16,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: 10,
    },
    footerPath: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
    },
  })

import { useNavigation, useRouter } from 'expo-router'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { NativeHostedRow, NativeLinkRow, NativeSection, NativeSheetForm, nativeForm } from '@/components/lists/NativeForm'
import { useSheetTones } from '@/components/overlays/BottomSheet'
import { SFIcon } from '@/components/visuals/SFIcon'
import { useTranslation } from '@/i18n'
import { isIOS } from '@/lib/core/platform'
import { finishSmbBrowserSession, smbBrowserSession } from '@/lib/transfer/smbBrowserSession'
import { createSmbDirectory, listSmbDirectory, type SmbFileItem } from '@/lib/transfer/smbClient'
import { promptText, showMessage } from '@/lib/ui/dialogs'
import * as Haptics from '@/lib/ui/haptics'
import { type Colors, ON_ACCENT, useColors, useStyles, useTheme } from '@/theme'

type Props = {
  segments: string[]
  isRoot?: boolean
}

export function SmbDirectoryScreen({ segments, isRoot = false }: Props) {
  const router = useRouter()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const colors = useColors()
  const { scheme } = useTheme()
  const tones = useSheetTones({ noGlass: true })
  const styles = useStyles(createStyles)

  const session = smbBrowserSession()
  const currentPath = segments.join('/')

  const currentFolderName = isRoot
    ? session?.config.share || t('sync.rootFolder')
    : segments[segments.length - 1]

  const [items, setItems] = useState<SmbFileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hide the action button when viewing the currently active / saved folder
  const initialClean = (session?.initialPath ?? '').replace(/\/$/, '').trim()
  const currentClean = currentPath.replace(/\/$/, '').trim()
  const isCurrentSaved = currentClean === initialClean
  const showAction = !isCurrentSaved

  useEffect(() => {
    if (!session) {
      navigation.getParent()?.goBack()
    }
  }, [session, navigation])

  const loadDirectory = useCallback(async () => {
    if (!session?.config) return
    setLoading(true)
    setError(null)
    try {
      const list = await listSmbDirectory(session.config, currentPath)
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
  }, [session?.config, currentPath])

  useEffect(() => {
    loadDirectory()
  }, [loadDirectory])

  const goInto = (dirName: string) => {
    Haptics.selectionAsync()
    const nextSegments = [...segments, dirName]
    router.push({ pathname: '/smb-browser/[...subpath]', params: { subpath: nextSegments } })
  }

  const promptCreateDirectory = useCallback(() => {
    promptText({
      title: t('sync.newFolderTitle'),
      message: t('sync.newFolderPlaceholder'),
      confirmLabel: t('sync.createFolder'),
      onSubmit: async (text: string) => {
        const trimmed = text.trim()
        if (!trimmed || !session?.config) return
        try {
          const fullPath = currentPath ? `${currentPath.replace(/\/$/, '')}/${trimmed}` : trimmed
          await createSmbDirectory(session.config, fullPath)
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          loadDirectory()
        } catch (err: unknown) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          showMessage(t('common.error'), err instanceof Error ? err.message : String(err))
        }
      },
    })
  }, [session?.config, currentPath, t, loadDirectory])

  const handleApply = () => {
    if (!session) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    session.onSelectPath(currentPath)
    finishSmbBrowserSession()
    navigation.getParent()?.goBack()
  }

  const closeSheet = () => {
    finishSmbBrowserSession()
    navigation.getParent()?.goBack()
  }

  useLayoutEffect(() => {
    navigation.setOptions(
      isIOS
        ? {
            title: currentFolderName,
            unstable_headerLeftItems: isRoot
              ? () => [
                  {
                    type: 'button',
                    label: t('common.close'),
                    icon: { type: 'sfSymbol', name: 'xmark' },
                    onPress: closeSheet,
                  },
                ]
              : undefined,
            unstable_headerRightItems: () => [
              {
                type: 'button',
                label: t('sync.newFolderTitle'),
                icon: { type: 'sfSymbol', name: 'folder.badge.plus' },
                onPress: promptCreateDirectory,
              },
            ],
          }
        : {
            title: currentFolderName,
            headerLeft: isRoot
              ? () => (
                  <Pressable onPress={closeSheet} hitSlop={10}>
                    <Text style={styles.headerButton}>{t('common.close')}</Text>
                  </Pressable>
                )
              : undefined,
            headerRight: () => (
              <Pressable onPress={promptCreateDirectory} hitSlop={10}>
                <Text style={styles.headerButton}>{t('sync.newFolderTitle')}</Text>
              </Pressable>
            ),
          }
    )
  }, [navigation, currentFolderName, isRoot, promptCreateDirectory, t, styles])

  if (!session) return null

  const footerSpace = showAction ? Math.max(88, insets.bottom + 80) : Math.max(24, insets.bottom + 16)

  return (
    <View style={styles.screen}>
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={loadDirectory} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('sync.browserRetry')}</Text>
          </Pressable>
        </View>
      ) : nativeForm ? (
        <NativeDirectoryList
          items={items}
          emptyText={t('sync.folderEmpty')}
          footerSpace={footerSpace}
          onGoInto={goInto}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.name}
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: footerSpace }]}
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

      {/* Floating Action Footer: matching sheet background like in AttachMenu */}
      {showAction ? (
        <View
          style={[
            styles.actionFooter,
            {
              paddingBottom: Math.max(16, insets.bottom + 4),
              backgroundColor: tones.sheet,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Pressable
            onPress={handleApply}
            accessibilityRole="button"
            accessibilityLabel={t('sync.useThisFolder')}
            style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.85 }]}
          >
            <View style={[StyleSheet.absoluteFill, styles.actionBg, { backgroundColor: colors.accent }]} />
            <Text style={[styles.actionText, { color: ON_ACCENT }]}>{t('sync.useThisFolder')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

function NativeDirectoryList({
  items,
  emptyText,
  footerSpace,
  onGoInto,
}: {
  items: SmbFileItem[]
  emptyText: string
  footerSpace: number
  onGoInto: (name: string) => void
}) {
  const colors = useColors()
  const { Text: SwiftText, HStack, Spacer, Image } = nativeForm!.ui
  const { foregroundStyle, lineLimit } = nativeForm!.modifiers

  return (
    <NativeSheetForm>
      <NativeSection>
        {items.length === 0 ? (
          <HStack spacing={10}>
            <SwiftText modifiers={[foregroundStyle(colors.textMuted)]}>{emptyText}</SwiftText>
          </HStack>
        ) : (
          items.map((item) =>
            item.isDirectory ? (
              <NativeLinkRow
                key={item.name}
                label={item.name}
                symbol="folder.fill"
                color={colors.accent}
                chevron
                onPress={() => onGoInto(item.name)}
              />
            ) : (
              <HStack key={item.name} spacing={10}>
                <Image systemName="doc.fill" size={18} color={colors.textMuted} />
                <SwiftText modifiers={[foregroundStyle(colors.text), lineLimit(1)]}>{item.name}</SwiftText>
                <Spacer />
                <SwiftText modifiers={[foregroundStyle(colors.textMuted), lineLimit(1)]}>
                  {`${Math.round(item.size / 1024)} KB`}
                </SwiftText>
              </HStack>
            )
          )
        )}
      </NativeSection>
      <NativeSection fill="transparent">
        <NativeHostedRow clear height={footerSpace}>
          <View />
        </NativeHostedRow>
      </NativeSection>
    </NativeSheetForm>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    headerButton: {
      fontSize: 16,
      color: colors.accent,
      paddingHorizontal: 8,
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
    retryButton: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderRadius: 12,
    },
    retryText: {
      fontSize: 15,
      color: colors.accent,
      fontWeight: '600',
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
    actionFooter: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 20,
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    actionButton: {
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    actionBg: {
      borderRadius: 26,
    },
    actionText: {
      fontSize: 17,
      fontWeight: '600',
    },
  })

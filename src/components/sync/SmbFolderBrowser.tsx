import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { GlassButton } from '@/components/chrome/Glass'
import { BottomSheet } from '@/components/overlays/BottomSheet'
import { SFIcon } from '@/components/visuals/SFIcon'
import { useStore } from '@/components/chat/thread/store'
import { useTranslation } from '@/i18n'
import { isIOS } from '@/lib/core/platform'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { promptText, showMessage } from '@/lib/ui/dialogs'
import * as Haptics from '@/lib/ui/haptics'
import {
  finishSmbBrowserSession,
  smbBrowserSessionStore,
  type SmbBrowserSession,
} from '@/lib/transfer/smbBrowserSession'
import {
  createSmbDirectory,
  listSmbDirectory,
  type SmbConfig,
  type SmbFileItem,
} from '@/lib/transfer/smbClient'
import { ON_ACCENT, useColors, useStyles, type Colors } from '@/theme'

type BrowserSheetProps = {
  visible: boolean
  session: SmbBrowserSession
  onClose: () => void
}

export function SmbBrowserSheet({ visible, session, onClose }: BrowserSheetProps) {
  const { t } = useTranslation()
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const styles = useStyles(createStyles)
  const { height: windowHeight, width } = useWindowDimensions()

  const [path, setPath] = useState(session.initialPath ? session.initialPath.trim().replace(/\/$/, '') : '')
  const [outgoingPath, setOutgoingPath] = useState<string | null>(null)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const cache = useRef<Map<string, SmbFileItem[]>>(new Map())
  const progress = useSharedValue(0)

  // Reset state when opening a new session
  useEffect(() => {
    if (visible) {
      const init = session.initialPath ? session.initialPath.trim().replace(/\/$/, '') : ''
      setPath(init)
      setOutgoingPath(null)
      progress.value = 0
    }
  }, [visible, session])

  const segments = path ? path.split('/').filter(Boolean) : []
  const canGoUp = segments.length > 0
  const isRoot = segments.length === 0

  const currentFolderName = isRoot
    ? session.config.share || t('sync.rootFolder')
    : segments[segments.length - 1]

  const initialClean = (session.initialPath ?? '').replace(/\/$/, '').trim()
  const currentClean = path.replace(/\/$/, '').trim()
  const isCurrentSaved = currentClean === initialClean
  const showAction = !isCurrentSaved

  const footerSpace = showAction ? Math.max(88, insets.bottom + 80) : Math.max(24, insets.bottom + 16)

  const goInto = (dirName: string) => {
    Haptics.selectionAsync()
    const nextPath = path ? `${path}/${dirName}` : dirName
    setOutgoingPath(path)
    setDirection('forward')
    progress.value = 0
    setPath(nextPath)
    progress.value = withSpring(1, { stiffness: 280, damping: 28, mass: 0.9 }, (finished) => {
      if (finished) {
        scheduleOnRN(() => {
          setOutgoingPath(null)
          progress.value = 0
        })
      }
    })
  }

  const goUp = () => {
    if (!canGoUp) return
    Haptics.selectionAsync()
    const parts = path.split('/').filter(Boolean)
    parts.pop()
    const nextPath = parts.join('/')
    setOutgoingPath(path)
    setDirection('backward')
    progress.value = 0
    setPath(nextPath)
    progress.value = withSpring(1, { stiffness: 280, damping: 28, mass: 0.9 }, (finished) => {
      if (finished) {
        scheduleOnRN(() => {
          setOutgoingPath(null)
          progress.value = 0
        })
      }
    })
  }

  const promptCreateDirectory = useCallback(() => {
    promptText({
      title: t('sync.newFolderTitle'),
      message: t('sync.newFolderPlaceholder'),
      confirmLabel: t('sync.createFolder'),
      onSubmit: async (text: string) => {
        const trimmed = text.trim()
        if (!trimmed || !session.config) return
        try {
          const fullPath = path ? `${path}/${trimmed}` : trimmed
          await createSmbDirectory(session.config, fullPath)
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          cache.current.delete(path)
          setRefreshTrigger((n) => n + 1)
        } catch (err: unknown) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          showMessage(t('common.error'), err instanceof Error ? err.message : String(err))
        }
      },
    })
  }, [session.config, path, t])

  const handleApply = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    session.onSelectPath(path)
    onClose()
  }

  // Pane animation styles
  const outgoingPaneStyle = useAnimatedStyle(() => {
    if (direction === 'forward') {
      return {
        transform: [{ translateX: -progress.value * (width * 0.35) }],
        opacity: 1 - progress.value,
      }
    }
    return {
      transform: [{ translateX: progress.value * width }],
      opacity: 1 - progress.value,
    }
  })

  const currentPaneStyle = useAnimatedStyle(() => {
    if (!outgoingPath) {
      return {
        transform: [{ translateX: 0 }],
        opacity: 1,
      }
    }
    if (direction === 'forward') {
      return {
        transform: [{ translateX: (1 - progress.value) * width }],
        opacity: progress.value > 0.05 ? 1 : 0,
      }
    }
    return {
      transform: [{ translateX: -(1 - progress.value) * (width * 0.35) }],
      opacity: progress.value > 0.05 ? 1 : 0,
    }
  })

  const sheetHeight = Math.round(windowHeight * 0.75)

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={currentFolderName}
      onBack={canGoUp ? goUp : undefined}
      compactHeader
      noGlass
      glassButtons
      height={sheetHeight}
      minHeight={sheetHeight}
      contentPaddingBottom={0}
      rightItem={
        liquidGlass ? (
          <GlassButton
            icon="folder-outline"
            onPress={promptCreateDirectory}
            accessibilityLabel={t('sync.newFolderTitle')}
          >
            <SFIcon name="folder.badge.plus" fallback="folder-outline" size={22} color={colors.accent} />
          </GlassButton>
        ) : (
          <Pressable
            onPress={promptCreateDirectory}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('sync.newFolderTitle')}
            style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.6 }]}
          >
            <SFIcon name="folder.badge.plus" fallback="folder-outline" size={22} color={colors.accent} />
          </Pressable>
        )
      }
    >
      <View style={[styles.container, { height: sheetHeight - 56 }]}>
        <View style={styles.slider}>
          {outgoingPath !== null ? (
            <Animated.View
              style={[styles.pane, styles.paneAbsolute, outgoingPaneStyle]}
              pointerEvents="none"
            >
              <SmbDirectoryCard
                config={session.config}
                path={outgoingPath}
                cache={cache}
                footerSpace={footerSpace}
                onGoInto={goInto}
              />
            </Animated.View>
          ) : null}

          <Animated.View
            style={[styles.pane, styles.paneActive, currentPaneStyle]}
            pointerEvents={outgoingPath !== null ? 'none' : 'auto'}
          >
            <SmbDirectoryCard
              key={`${path}:${refreshTrigger}`}
              config={session.config}
              path={path}
              cache={cache}
              footerSpace={footerSpace}
              onGoInto={goInto}
            />
          </Animated.View>
        </View>

        {showAction ? (
          <View
            style={[
              styles.actionFooter,
              {
                paddingBottom: Math.max(16, insets.bottom + 4),
                backgroundColor: colors.surface,
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
    </BottomSheet>
  )
}

function SmbDirectoryCard({
  config,
  path,
  cache,
  footerSpace,
  onGoInto,
}: {
  config: SmbConfig
  path: string
  cache: React.MutableRefObject<Map<string, SmbFileItem[]>>
  footerSpace: number
  onGoInto: (name: string) => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const styles = useStyles(createStyles)

  const cached = cache.current.get(path)
  const [items, setItems] = useState<SmbFileItem[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listSmbDirectory(config, path)
      list.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
      cache.current.set(path, list)
      setItems(list)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [config, path, cache])

  useEffect(() => {
    load()
  }, [load])

  return (
    <View style={styles.cardContainer}>
      <View style={styles.card}>
        {loading && items.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={load} style={styles.retryButton}>
              <Text style={styles.retryText}>{t('sync.browserRetry')}</Text>
            </Pressable>
          </View>
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
            renderItem={({ item, index }) => {
              const isLast = index === items.length - 1
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.itemRow,
                    pressed && item.isDirectory && styles.itemRowPressed,
                    isLast && styles.itemRowLast,
                  ]}
                  disabled={!item.isDirectory}
                  onPress={() => item.isDirectory && onGoInto(item.name)}
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
              )
            }}
          />
        )}
      </View>
    </View>
  )
}

/**
 * Global host rendered in root layout for non-iOS platforms.
 * Listens to smbBrowserSessionStore and displays the SmbBrowserSheet.
 */
export function SmbBrowserSheetHost() {
  const session = useStore(smbBrowserSessionStore)
  if (isIOS || !session) return null

  return (
    <SmbBrowserSheet
      visible={Boolean(session)}
      session={session}
      onClose={finishSmbBrowserSession}
    />
  )
}

/**
 * Backward compatibility wrapper for direct callers.
 */
export function SmbFolderBrowser({
  visible,
  config,
  initialPath,
  onSelectPath,
  onClose,
}: {
  visible: boolean
  config: SmbConfig
  initialPath: string
  onSelectPath: (path: string) => void
  onClose: () => void
}) {
  if (!visible) return null

  return (
    <SmbBrowserSheet
      visible={visible}
      session={{
        config,
        initialPath,
        onSelectPath,
        onClose,
      }}
      onClose={onClose}
    />
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      position: 'relative',
    },
    slider: {
      flex: 1,
      overflow: 'hidden',
      position: 'relative',
      width: '100%',
    },
    pane: {
      width: '100%',
      height: '100%',
    },
    paneActive: {
      position: 'relative',
    },
    paneAbsolute: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    headerIconBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardContainer: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    card: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingVertical: 4,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 12,
    },
    itemRowLast: {
      borderBottomWidth: 0,
    },
    itemRowPressed: {
      backgroundColor: colors.surfaceRaised,
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
    emptyContainer: {
      padding: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      fontSize: 15,
      color: colors.textMuted,
    },
    centerContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 16,
      minHeight: 200,
    },
    errorText: {
      fontSize: 15,
      color: colors.danger,
      textAlign: 'center',
    },
    retryButton: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      backgroundColor: colors.surfaceRaised,
      borderRadius: 12,
    },
    retryText: {
      fontSize: 15,
      color: colors.accent,
      fontWeight: '600',
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

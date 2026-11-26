import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ActivityIndicator, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { Easing, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { useAccent } from '@/components/chrome/Accent'
import { GlassSurface, useGlassStyles } from '@/components/chrome/Glass'
import { SFIcon } from '@/components/visuals/SFIcon'
import { useTranslation } from '@/i18n'
import { isAndroid } from '@/lib/core/platform'
import { getBackupProgress, subscribeBackupProgress } from '@/lib/transfer/backup'
import { getSyncProgress, subscribeSyncProgress } from '@/lib/transfer/cloudSync'
import { useColors, useStyles, useTheme, type Colors } from '@/theme'

// Hosts top-sliding status pills (cloud sync, long backup packing) in one vertical stack so
// concurrent operations sit one under another without overlapping.
export function TopProgressHost() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { scheme } = useTheme()
  const styles = useStyles((c) => createStyles(c, scheme === 'dark'))

  const sync = useSyncExternalStore(subscribeSyncProgress, getSyncProgress)
  const backup = useSyncExternalStore(subscribeBackupProgress, getBackupProgress)

  const syncDone = sync.stage === 'done'
  const syncRatio = syncDone
    ? 1
    : sync.stage === 'uploading_media' || sync.stage === 'downloading_media'
      ? Math.min(0.96, Math.max(0.1, (sync.total ? (sync.current ?? 0) / sync.total : 0.5) * 0.96))
      : 0

  let syncLabel = ''
  if (sync.stage === 'uploading_media') {
    syncLabel = t('sync.progressUploadingMedia', { current: sync.current ?? 1, total: sync.total ?? 1 })
  } else if (sync.stage === 'downloading_media') {
    syncLabel = t('sync.progressDownloadingMedia', { current: sync.current ?? 1, total: sync.total ?? 1 })
  } else if (syncDone) {
    syncLabel = t('sync.progressDone')
  }

  const backupDone = backup.stage === 'done'
  const backupRatio = backupDone ? 1 : Math.min(0.96, Math.max(0.06, backup.progress * 0.96))
  const backupLabel = backupDone
    ? t('backup.progressDone')
    : backup.active
      ? t('backup.progressPacking', { pct: Math.min(99, Math.round(backup.progress * 100)) })
      : ''

  return (
    <View style={[styles.layer, { top: insets.top + (isAndroid ? 8 : 4) }]} pointerEvents="none">
      <ProgressPill visible={sync.active} isDone={syncDone} ratio={syncRatio} label={syncLabel} />
      <ProgressPill visible={backup.active} isDone={backupDone} ratio={backupRatio} label={backupLabel} stacked={sync.active} />
    </View>
  )
}

function ProgressPill({
  visible,
  isDone,
  ratio,
  label,
  stacked = false,
}: {
  visible: boolean
  isDone: boolean
  ratio: number
  label: string
  stacked?: boolean
}) {
  const colors = useColors()
  const { scheme } = useTheme()
  const isDark = scheme === 'dark'
  const glass = useGlassStyles()
  const styles = useStyles((c) => createStyles(c, isDark))

  const { accentColor, accentSoftColor } = useAccent()
  const activeAccent = accentColor ?? colors.accent
  const activeAccentSoft = accentSoftColor ?? colors.accentSoft

  const [mounted, setMounted] = useState(visible)
  if (visible && !mounted) setMounted(true)

  const visibleRef = useRef(visible)
  visibleRef.current = visible

  // Keep last non-empty text/state visible while the exit animation slides the pill out.
  const [keptLabel, setKeptLabel] = useState(label)
  if (label && label !== keptLabel) setKeptLabel(label)
  const [keptDone, setKeptDone] = useState(isDone)
  if (visible && isDone !== keptDone) setKeptDone(isDone)
  const shownDone = visible ? isDone : keptDone

  const [lockedWidth, setLockedWidth] = useState(0)
  useEffect(() => {
    if (!mounted) setLockedWidth(0)
  }, [mounted])

  const onPillLayout = (e: LayoutChangeEvent) => {
    const width = Math.round(e.nativeEvent.layout.width)
    if (width > lockedWidth) setLockedWidth(width)
  }

  const translateY = useSharedValue(-50)
  const opacity = useSharedValue(0)
  const progressRatio = useSharedValue(0)
  const successAnim = useSharedValue(0)
  const checkmarkScale = useSharedValue(0.5)
  const checkmarkOpacity = useSharedValue(0)

  const handleExited = useCallback(() => {
    if (!visibleRef.current) setMounted(false)
  }, [])

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) })
      opacity.value = withTiming(1, { duration: 180 })
    } else if (mounted) {
      translateY.value = withTiming(stacked ? -14 : -50, { duration: 240, easing: Easing.in(Easing.cubic) })
      opacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) scheduleOnRN(handleExited)
      })
    }
  }, [visible, mounted, stacked, translateY, opacity, handleExited])

  useEffect(() => {
    if (!visible && !mounted) {
      progressRatio.value = 0
      return
    }
    progressRatio.value = withTiming(ratio * 100, { duration: 240, easing: Easing.out(Easing.cubic) })
  }, [ratio, visible, mounted, progressRatio])

  useEffect(() => {
    if (shownDone) {
      successAnim.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) })
      checkmarkScale.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) })
      checkmarkOpacity.value = withTiming(1, { duration: 240 })
    } else {
      successAnim.value = withTiming(0, { duration: 180 })
      checkmarkScale.value = 0.5
      checkmarkOpacity.value = 0
    }
  }, [shownDone, successAnim, checkmarkScale, checkmarkOpacity])

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  const progressFillStyle = useAnimatedStyle(() => ({
    width: `${progressRatio.value}%`,
    opacity: 1 - successAnim.value,
  }))

  const successGlowStyle = useAnimatedStyle(() => ({
    opacity: successAnim.value,
  }))

  const spinnerStyle = useAnimatedStyle(() => ({
    opacity: 1 - successAnim.value,
    transform: [{ scale: (1 - successAnim.value) * 0.72 }],
  }))

  const checkmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkmarkScale.value }],
    opacity: checkmarkOpacity.value,
  }))

  if (!mounted) return null

  return (
    <Animated.View
      layout={LinearTransition.duration(200)}
      onLayout={onPillLayout}
      style={[styles.pill, pillStyle, lockedWidth > 0 && { minWidth: lockedWidth }]}
    >
      <View style={styles.pillInner}>
        <GlassSurface style={styles.glass} fallbackStyle={glass.translucent}>
          <Animated.View
            style={[styles.progressFill, { backgroundColor: activeAccentSoft }, progressFillStyle]}
            pointerEvents="none"
          />
          <Animated.View style={[styles.successGlow, successGlowStyle]} pointerEvents="none" />
          <View style={styles.content}>
            <View style={styles.iconBox}>
              <Animated.View style={[styles.iconLayer, spinnerStyle]} pointerEvents="none">
                <ActivityIndicator size="small" color={activeAccent} style={styles.spinner} />
              </Animated.View>
              <Animated.View style={[styles.iconLayer, checkmarkStyle]} pointerEvents="none">
                <SFIcon name="checkmark.circle.fill" fallback="checkmark-circle" size={14} color={colors.success} />
              </Animated.View>
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {keptLabel}
            </Text>
          </View>
        </GlassSurface>
      </View>
    </Animated.View>
  )
}

const createStyles = (colors: Colors, isDark: boolean) =>
  StyleSheet.create({
    layer: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: 8,
      zIndex: 9998,
    },
    pill: {
      minWidth: 164,
      maxWidth: 320,
      height: 36,
      borderRadius: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.26 : 0.12,
      shadowRadius: 10,
      elevation: 6,
    },
    pillInner: {
      height: 36,
      borderRadius: 18,
      overflow: 'hidden',
    },
    glass: {
      height: 36,
      borderRadius: 18,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    progressFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
    },
    successGlow: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isDark ? 'rgba(95, 203, 139, 0.24)' : 'rgba(47, 154, 92, 0.18)',
      borderWidth: isAndroid ? 1 : 0,
      borderColor: isAndroid ? (isDark ? 'rgba(95, 203, 139, 0.45)' : 'rgba(47, 154, 92, 0.35)') : 'transparent',
      borderRadius: 18,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 20,
      zIndex: 1,
    },
    iconBox: {
      width: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconLayer: {
      position: 'absolute',
      width: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    spinner: {
      transform: [{ scale: 0.72 }],
      width: 14,
      height: 14,
    },
    label: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: 0.15,
      lineHeight: 16,
    },
  })

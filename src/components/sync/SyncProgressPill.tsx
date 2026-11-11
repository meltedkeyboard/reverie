import { useEffect, useSyncExternalStore } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { GlassSurface, useGlassStyles } from '@/components/chrome/Glass'
import { SFIcon } from '@/components/visuals/SFIcon'
import { useTranslation } from '@/i18n'
import { isAndroid } from '@/lib/core/platform'
import { getSyncProgress, subscribeSyncProgress } from '@/lib/transfer/cloudSync'
import { useColors, useStyles, type Colors } from '@/theme'

export function SyncProgressPill() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const glass = useGlassStyles()
  const styles = useStyles(createStyles)

  const progress = useSyncExternalStore(subscribeSyncProgress, getSyncProgress)
  const visible = progress.active
  const translateY = useSharedValue(-50)
  const opacity = useSharedValue(0)
  const progressRatio = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 16, stiffness: 220, mass: 0.8 })
      opacity.value = withTiming(1, { duration: 180 })
    } else {
      translateY.value = withTiming(-50, { duration: 240, easing: Easing.in(Easing.cubic) })
      opacity.value = withTiming(0, { duration: 200 })
    }
  }, [visible, translateY, opacity])

  useEffect(() => {
    let pct = 0
    if (progress.stage === 'uploading_media') {
      const ratio = progress.total ? (progress.current ?? 0) / progress.total : 0.5
      pct = 20 + ratio * 60
    } else if (progress.stage === 'uploading_db') pct = 88
    else if (progress.stage === 'downloading_db') pct = 25
    else if (progress.stage === 'downloading_media') {
      const ratio = progress.total ? (progress.current ?? 0) / progress.total : 0.5
      pct = 30 + ratio * 55
    } else if (progress.stage === 'applying') pct = 92
    else if (progress.stage === 'done') pct = 100
    progressRatio.value = withTiming(pct, { duration: 200 })
  }, [progress, progressRatio])

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  const barStyle = useAnimatedStyle(() => ({
    width: `${progressRatio.value}%`,
  }))

  let label = ''
  if (progress.stage === 'uploading_media') {
    label = t('sync.progressUploadingMedia', { current: progress.current ?? 1, total: progress.total ?? 1 })
  } else if (progress.stage === 'uploading_db') {
    label = t('sync.progressUploadingDb')
  } else if (progress.stage === 'downloading_db') {
    label = t('sync.progressDownloadingDb')
  } else if (progress.stage === 'downloading_media') {
    label = t('sync.progressDownloadingMedia', { current: progress.current ?? 1, total: progress.total ?? 1 })
  } else if (progress.stage === 'applying') {
    label = t('sync.progressApplying')
  } else if (progress.stage === 'done') {
    label = t('sync.progressDone')
  }

  return (
    <View style={[styles.layer, { top: insets.top + (isAndroid ? 8 : 4) }]} pointerEvents="none">
      <Animated.View style={[styles.pill, pillStyle]}>
        <GlassSurface style={styles.glass} fallbackStyle={glass.solid}>
          <View style={styles.content}>
            <View style={styles.iconBox}>
              {progress.stage === 'done' ? (
                <SFIcon name="checkmark.circle.fill" fallback="checkmark-circle" size={14} color={colors.success} />
              ) : (
                <ActivityIndicator size="small" color={colors.accent} style={styles.spinner} />
              )}
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
          </View>
          <View style={styles.track}>
            <Animated.View style={[styles.bar, barStyle, progress.stage === 'done' && styles.barSuccess]} />
          </View>
        </GlassSurface>
      </Animated.View>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    layer: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 9998,
    },
    pill: {
      minWidth: 160,
      maxWidth: 320,
      height: 34,
      borderRadius: 17,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
      elevation: 6,
    },
    glass: {
      height: 34,
      paddingHorizontal: 12,
      justifyContent: 'center',
      borderRadius: 17,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      height: 20,
    },
    iconBox: {
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
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: 0.2,
      lineHeight: 16,
    },
    track: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: colors.border,
    },
    bar: {
      height: 2,
      backgroundColor: colors.accent,
      borderRadius: 1,
    },
    barSuccess: {
      backgroundColor: colors.success,
    },
  })

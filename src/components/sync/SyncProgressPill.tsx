import { useEffect, useState, useSyncExternalStore } from 'react'
import { ActivityIndicator, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { Easing, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useAccent } from '@/components/chrome/Accent'
import { GlassSurface, useGlassStyles } from '@/components/chrome/Glass'
import { SFIcon } from '@/components/visuals/SFIcon'
import { useTranslation } from '@/i18n'
import { isAndroid } from '@/lib/core/platform'
import { getSyncProgress, subscribeSyncProgress } from '@/lib/transfer/cloudSync'
import { useColors, useStyles, useTheme, type Colors } from '@/theme'

export function SyncProgressPill() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { scheme } = useTheme()
  const isDark = scheme === 'dark'
  const glass = useGlassStyles()
  const styles = useStyles((c) => createStyles(c, isDark))

  const { accentColor, accentSoftColor } = useAccent()
  const activeAccent = accentColor ?? colors.accent
  const activeAccentSoft = accentSoftColor ?? colors.accentSoft

  const progress = useSyncExternalStore(subscribeSyncProgress, getSyncProgress)
  const visible = progress.active
  const isDone = progress.stage === 'done'

  const [lockedWidth, setLockedWidth] = useState(0)

  useEffect(() => {
    if (!visible) {
      setLockedWidth(0)
    }
  }, [visible])

  const onPillLayout = (e: LayoutChangeEvent) => {
    const width = Math.round(e.nativeEvent.layout.width)
    if (width > lockedWidth) {
      setLockedWidth(width)
    }
  }

  const translateY = useSharedValue(-50)
  const opacity = useSharedValue(0)
  const progressRatio = useSharedValue(0)
  const successAnim = useSharedValue(0)
  const checkmarkScale = useSharedValue(0.5)
  const checkmarkOpacity = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) })
      opacity.value = withTiming(1, { duration: 180 })
    } else {
      translateY.value = withTiming(-50, { duration: 240, easing: Easing.in(Easing.cubic) })
      opacity.value = withTiming(0, { duration: 200 })
    }
  }, [visible, translateY, opacity])

  useEffect(() => {
    let pct = 0
    if (progress.stage === 'uploading_media' || progress.stage === 'downloading_media') {
      const ratio = progress.total ? (progress.current ?? 0) / progress.total : 0.5
      pct = Math.min(100, Math.max(10, ratio * 96))
    } else if (isDone) {
      pct = 100
    }
    progressRatio.value = withTiming(pct, { duration: 240, easing: Easing.out(Easing.cubic) })
  }, [progress, isDone, progressRatio])

  useEffect(() => {
    if (isDone) {
      successAnim.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) })
      checkmarkScale.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) })
      checkmarkOpacity.value = withTiming(1, { duration: 240 })
    } else {
      successAnim.value = withTiming(0, { duration: 180 })
      checkmarkScale.value = 0.5
      checkmarkOpacity.value = 0
    }
  }, [isDone, successAnim, checkmarkScale, checkmarkOpacity])

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

  let label = ''
  if (progress.stage === 'uploading_media') {
    label = t('sync.progressUploadingMedia', { current: progress.current ?? 1, total: progress.total ?? 1 })
  } else if (progress.stage === 'downloading_media') {
    label = t('sync.progressDownloadingMedia', { current: progress.current ?? 1, total: progress.total ?? 1 })
  } else if (isDone) {
    label = t('sync.progressDone')
  }


  return (
    <View style={[styles.layer, { top: insets.top + (isAndroid ? 8 : 4) }]} pointerEvents="none">
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
                {label}
              </Text>
            </View>
          </GlassSurface>
        </View>
      </Animated.View>
    </View>
  )
}

const createStyles = (colors: Colors, isDark: boolean) =>
  StyleSheet.create({
    layer: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
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

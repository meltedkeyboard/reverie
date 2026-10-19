import { Icon } from '@/components/visuals/Icon'
import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated'

import { GlassButton } from '@/components/chrome/Glass'
import { useTranslation } from '@/i18n'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { PRESS_ANYWHERE } from '@/lib/ui/press'
import { useColors, useStyles, type Colors } from '@/theme'
import { isDesktop } from '@/lib/core/platform'

// What the screen asks of the thread on screen (thread/ChatThread.tsx).
export type ConversationHandle = {
  scrollToNewest: () => void
  // Scrolls down and, while a reply streams, keeps following it.
  jumpToNewest: () => void
}

// Floats above the composer once the newest message is out of sight. It stays mounted and
// only scales in and out: a Liquid Glass view that is mounted anew, or that fades, comes back
// with the glyph alone and no material.
export function JumpButton({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const shown = useSharedValue(visible ? 1 : 0)
  useEffect(() => {
    shown.value = withTiming(visible ? 1 : 0, { duration: visible ? 160 : 140, easing: Easing.out(Easing.cubic) })
  }, [visible, shown])
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.01 + 0.99 * shown.value }] }))
  return (
    <Animated.View style={[styles.jumpSlot, style]} pointerEvents={visible ? 'box-none' : 'none'}>
      {liquidGlass ? (
        <GlassButton icon="arrow-down" onPress={onPress} />
      ) : (
        <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.jump, pressed && { opacity: 0.7 }]}>
          <Icon name="arrow-down" size={18} color={colors.text} />
        </Pressable>
      )}
    </Animated.View>
  )
}

// Shown at the newest end of the list when a reply failed.
export function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  return (
    <View style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={onRetry} pressRetentionOffset={PRESS_ANYWHERE} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}>
        <Text style={styles.retryText}>{t('chat.retry')}</Text>
      </Pressable>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    error: {
      marginHorizontal: 16,
      marginVertical: 8,
      padding: 14,
      borderRadius: 16,
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
    },
    errorText: { color: colors.text, fontSize: 14, lineHeight: 20 },
    retry: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6, paddingHorizontal: 14, borderRadius: isDesktop ? 6 : 12, backgroundColor: colors.surfaceRaised },
    retryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    jumpSlot: { marginBottom: 12 },
    jump: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
      borderWidth: isDesktop ? 0 : 1,
      borderColor: colors.border,
      shadowColor: '#000000',
      shadowOpacity: 0.35,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
  })

import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { EdgeFade } from '@/components/chrome/BarChrome'
import { GlassSurface, useGlassStyles } from '@/components/chrome/Glass'
import { SFIcon } from '@/components/visuals/SFIcon'
import { useTranslation } from '@/i18n'
import { CHAT_COLUMN } from '@/hooks/util/useLayoutMode'
import { useColors, useStyles, type Colors } from '@/theme'

type Props = {
  name: string
  onRestore: () => void
  // The room the list keeps under its last message, as the composer's (see Composer).
  height: SharedValue<number>
  top: SharedValue<number>
  // The fade under the bar, as under the composer: over the chat's own picture it is left out.
  fade: boolean
}

// In place of the composer in the chat of a character in the archive: the chat is there to
// be read, and the bar says why and brings the character back.
export function ArchivedBar({ name, onRestore, height, top, fade }: Props) {
  const insets = useSafeAreaInsets()
  const styles = useStyles(createStyles)
  const glass = useGlassStyles()
  const colors = useColors()
  const { t } = useTranslation()
  return (
    <View style={styles.dock} pointerEvents="box-none">
      <View
        style={[styles.bar, { paddingBottom: insets.bottom + 8, paddingLeft: Math.max(10, insets.left + 4), paddingRight: Math.max(10, insets.right + 4) }]}
        onLayout={(e) => {
          height.value = e.nativeEvent.layout.height
          top.value = e.nativeEvent.layout.height
        }}
      >
        {/* Messages scrolling under the bar fade out before they reach it, so its text reads. */}
        {fade ? <EdgeFade edge="bottom" style={styles.fade} /> : null}
        <GlassSurface style={styles.capsule} fallbackStyle={glass.solid}>
          <SFIcon name="archivebox" fallback="archive-outline" size={17} color={colors.textMuted} />
          <Text style={styles.text} numberOfLines={1}>
            {t('archive.readOnly', { name })}
          </Text>
          <Pressable onPress={onRestore} hitSlop={8} accessibilityRole="button" style={({ pressed }) => [styles.restore, pressed && styles.pressed]}>
            <Text style={styles.restoreText}>{t('archive.restore')}</Text>
          </Pressable>
        </GlassSurface>
      </View>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    dock: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, justifyContent: 'flex-end' },
    bar: { paddingTop: 8 },
    fade: { position: 'absolute', top: -28, left: 0, right: 0, bottom: 0 },
    capsule: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 52,
      borderRadius: 26,
      borderCurve: 'continuous',
      paddingLeft: 18,
      paddingRight: 8,
      width: '100%',
      maxWidth: CHAT_COLUMN,
      alignSelf: 'center',
    },
    text: { flex: 1, color: colors.textMuted, fontSize: 15 },
    restore: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
    pressed: { opacity: 0.6 },
    restoreText: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  })

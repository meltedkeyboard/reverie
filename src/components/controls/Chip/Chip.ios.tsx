import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import * as Haptics from '@/lib/ui/haptics'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { isDesktop } from '@/lib/core/platform'
import { type Colors, CONTROL_FONT_SCALE, ON_ACCENT, useColors, useStyles } from '@/theme'

import { GlassSurface } from '../../chrome/Glass'
import { SlidingIcon, useAtLeastOneLap } from '../PillButton'
import { SFIcon } from '../../visuals/SFIcon'
import type { ChipProps } from './types'

export function Chip({ label, active, onPress, style, icon, ink, glass = false, interactive = false, labeled, loading, slide, disabled }: ChipProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const sliding = useAtLeastOneLap(!!loading && !!slide)
  const busy = !!loading || sliding
  const glassy = glass && liquidGlass
  const color = active ? ON_ACCENT : disabled && !busy ? colors.textFaint : (ink ?? colors.textMuted)
  const body = (
    <View style={styles.content}>
      {loading && !sliding ? (
        <ActivityIndicator size="small" color={color} />
      ) : icon ? (
        <SlidingIcon direction={slide} active={sliding}>
          <SFIcon name={icon.symbol} fallback={icon.fallback} size={18} color={color} />
        </SlidingIcon>
      ) : null}
      {!icon || labeled ? (
        <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[styles.label, { color }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </View>
  )
  return (
    <Pressable
      disabled={disabled || busy}
      onPress={() => {
        if (!active) Haptics.selectionAsync()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [style, !glassy && !isDesktop && pressed && { transform: [{ scale: 0.96 }] }, isDesktop && pressed && { opacity: 0.8 }]}
    >
      {glassy ? (
        <GlassSurface interactive={interactive} tintColor={active ? colors.accent : undefined} style={styles.chip}>
          {body}
        </GlassSurface>
      ) : (
        <View style={[styles.chip, active ? styles.solidActive : styles.solid]}>{body}</View>
      )}
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    solid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    solidActive: { backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.accent },
    label: { fontSize: 14, fontWeight: '600' },
    content: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  })

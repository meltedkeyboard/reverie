import { Icon } from '@/components/visuals/Icon'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { isDesktop } from '@/lib/core/platform'
import { type Colors, CONTROL_FONT_SCALE, ON_ACCENT, useColors, useStyles } from '@/theme'

import { SFIcon } from '../../visuals/SFIcon'
import { SlidingIcon, useAtLeastOneLap } from './animation'
import type { PillButtonProps } from './types'

export { useAtLeastOneLap, SlidingIcon }

export function PillButton({ label, accessibilityLabel, icon, onPress, color, filled = false, disabled, loading, style }: PillButtonProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const tint = color ?? colors.accent
  const ink = filled ? ON_ACCENT : tint
  const sliding = useAtLeastOneLap(!!loading && !!icon?.slide)
  const inactive = disabled || loading || sliding
  const shape = [styles.pill, !label && styles.circle]
  const fill = filled ? { backgroundColor: tint } : styles.solid

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [style, inactive && !sliding && { opacity: 0.5 }, !isDesktop && pressed && { transform: [{ scale: 0.97 }] }, isDesktop && pressed && { opacity: 0.8 }]}
    >
      <View style={[shape, fill]}>
        {loading && !sliding ? (
          <ActivityIndicator color={ink} />
        ) : (
          <View style={styles.content}>
            {icon ? (
              <SlidingIcon direction={icon.slide} active={sliding}>
                {icon.plain ? (
                  <Icon name={icon.fallback} size={19} color={ink} />
                ) : (
                  <SFIcon name={icon.name} fallback={icon.fallback} size={19} color={filled ? ink : color ?? colors.text} onAccent={filled} />
                )}
              </SlidingIcon>
            ) : null}
            {label ? (
              <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[styles.label, { color: ink }]} numberOfLines={1}>
                {label}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    pill: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    circle: { width: 44, paddingHorizontal: 0 },
    solid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    content: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    label: { fontSize: 16, fontWeight: '600' },
    ...(isDesktop
      ? {
          pill: { minHeight: 32, paddingHorizontal: 14, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
          circle: { width: 32, paddingHorizontal: 0 },
          solid: { backgroundColor: colors.surfaceRaised, borderWidth: 0 },
          label: { fontSize: 14, fontWeight: '500' },
        }
      : {}),
  })

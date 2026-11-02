import { Icon } from '@/components/visuals/Icon'
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'

import { isDesktop } from '@/lib/core/platform'
import { type Colors, CONTROL_FONT_SCALE, ON_ACCENT, useColors, useStyles } from '@/theme'

import type { ButtonProps } from './types'

export function Button({ label, icon, onPress, disabled, loading, variant = 'primary', style }: ButtonProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const tint = variant === 'primary' || variant === 'glass' || variant === 'solid' ? ON_ACCENT : variant === 'soft' ? colors.accent : colors.text
  const content = loading ? (
    <ActivityIndicator color={tint} />
  ) : (
    <>
      {icon ? (
        <Icon name={icon} size={isDesktop ? 15 : variant === 'soft' ? 17 : 18} color={tint} />
      ) : null}
      <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
    </>
  )

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && (variant === 'solid' && !isDesktop ? { transform: [{ scale: 0.98 }] } : { opacity: variant === 'primary' || variant === 'solid' ? 0.85 : 0.7 }),
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      {content}
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14 },
    primary: { height: 50, paddingHorizontal: 20, backgroundColor: colors.accent },
    secondary: { height: 50, paddingHorizontal: 18, backgroundColor: colors.surfaceRaised },
    soft: { height: 46, paddingHorizontal: 16, backgroundColor: colors.accentSoft },
    glass: { height: 52, paddingHorizontal: 28, borderRadius: 26, backgroundColor: colors.accent },
    solid: { height: 52, paddingHorizontal: 28, borderRadius: 26, backgroundColor: colors.accent },
    label: { fontSize: 16, fontWeight: '600' },
    primaryLabel: { color: ON_ACCENT },
    secondaryLabel: { color: colors.text, fontWeight: '500' },
    softLabel: { color: colors.accent, fontSize: 15 },
    glassLabel: { color: ON_ACCENT, fontSize: 17 },
    solidLabel: { color: ON_ACCENT, fontSize: 17 },
    ...(isDesktop ? desktopOverrides(colors) : {}),
  })

const desktopOverrides = (colors: Colors) => ({
  base: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, borderRadius: 6 },
  primary: { height: 34, paddingHorizontal: 16, backgroundColor: colors.accent },
  secondary: { height: 34, paddingHorizontal: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  soft: { height: 34, paddingHorizontal: 14, backgroundColor: colors.accentSoft },
  glass: { height: 36, paddingHorizontal: 20, borderRadius: 6, backgroundColor: colors.accent },
  solid: { height: 36, paddingHorizontal: 20, borderRadius: 6, backgroundColor: colors.accent },
  label: { fontSize: 14, fontWeight: '500' as const },
  softLabel: { color: colors.accent, fontSize: 14 },
  glassLabel: { color: ON_ACCENT, fontSize: 14 },
  solidLabel: { color: ON_ACCENT, fontSize: 14 },
})

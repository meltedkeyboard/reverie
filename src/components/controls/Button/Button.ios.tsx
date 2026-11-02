import { Icon } from '@/components/visuals/Icon'
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'

import { liquidGlass } from '@/lib/ui/nativeUI'
import { isDesktop } from '@/lib/core/platform'
import { type Colors, CONTROL_FONT_SCALE, ON_ACCENT, useColors, useStyles } from '@/theme'

import { GlassSurface } from '../../chrome/Glass'
import type { ButtonProps } from './types'

export function Button({ label, icon, onPress, disabled, loading, variant = 'primary', style }: ButtonProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const plainGlass = variant === 'glass' && !!disabled && !!liquidGlass
  const tint = plainGlass ? colors.textMuted : variant === 'primary' || variant === 'glass' || variant === 'solid' ? ON_ACCENT : variant === 'soft' ? colors.accent : colors.text
  const content = loading ? (
    <ActivityIndicator color={tint} />
  ) : (
    <>
      {icon ? (
        <Icon name={icon} size={isDesktop ? 15 : variant === 'soft' ? 17 : 18} color={tint} />
      ) : null}
      <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[styles.label, styles[`${variant}Label`], plainGlass && { color: tint }]}>{label}</Text>
    </>
  )

  if (variant === 'glass') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        accessibilityRole="button"
        style={({ pressed }) => [!liquidGlass && pressed && { transform: [{ scale: 0.98 }] }, disabled && !liquidGlass && { opacity: 0.4 }]}
      >
        <GlassSurface
          interactive={!disabled}
          tintColor={plainGlass ? undefined : colors.accent}
          style={[styles.base, styles.glass, style]}
          fallbackStyle={{ backgroundColor: colors.accent }}
        >
          {content}
        </GlassSurface>
      </Pressable>
    )
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && (variant === 'solid' ? { transform: [{ scale: 0.98 }] } : { opacity: variant === 'primary' ? 0.85 : 0.7 }),
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
    glass: { height: 52, paddingHorizontal: 28, borderRadius: 26 },
    solid: { height: 52, paddingHorizontal: 28, borderRadius: 26, backgroundColor: colors.accent },
    label: { fontSize: 16, fontWeight: '600' },
    primaryLabel: { color: ON_ACCENT },
    secondaryLabel: { color: colors.text, fontWeight: '500' },
    softLabel: { color: colors.accent, fontSize: 15 },
    glassLabel: { color: ON_ACCENT, fontSize: 17 },
    solidLabel: { color: ON_ACCENT, fontSize: 17 },
  })

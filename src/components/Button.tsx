import { Icon } from '@/components/Icon'
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'

import { liquidGlass } from '@/lib/nativeUI'
import { isDesktop } from '@/lib/platform'
import { type Colors, CONTROL_FONT_SCALE, ON_ACCENT, useColors, useStyles } from '@/theme'

import { GlassSurface } from './Glass'

type Variant = 'primary' | 'secondary' | 'soft' | 'glass'

type Props = {
  label: string
  icon?: React.ComponentProps<typeof Icon>['name']
  // Optional because a Link with asChild injects its own onPress.
  onPress?: () => void
  disabled?: boolean
  loading?: boolean
  // primary: solid accent. secondary: neutral. soft: accent on a tint, for actions
  // inside a form. glass: the big call to action, Liquid Glass tinted with the accent.
  variant?: Variant
  style?: StyleProp<ViewStyle>
}

export function Button({ label, icon, onPress, disabled, loading, variant = 'primary', style }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const tint = variant === 'primary' || variant === 'glass' ? ON_ACCENT : variant === 'soft' ? colors.accent : colors.text
  const content = loading ? (
    <ActivityIndicator color={tint} />
  ) : (
    <>
      {icon ? <Icon name={icon} size={isDesktop ? 15 : variant === 'soft' ? 17 : 18} color={tint} /> : null}
      <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
    </>
  )

  if (variant === 'glass') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => [!liquidGlass && !isDesktop && pressed && { transform: [{ scale: 0.98 }] }, isDesktop && pressed && { opacity: 0.85 }, disabled && { opacity: 0.4 }]}
      >
        <GlassSurface
          interactive
          tintColor={colors.accent}
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
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && { opacity: variant === 'primary' ? 0.85 : 0.7 },
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
    label: { fontSize: 16, fontWeight: '600' },
    primaryLabel: { color: ON_ACCENT },
    secondaryLabel: { color: colors.text, fontWeight: '500' },
    softLabel: { color: colors.accent, fontSize: 15 },
    glassLabel: { color: ON_ACCENT, fontSize: 17 },
    ...(isDesktop ? desktopOverrides(colors) : {}),
  })

// Desktop buttons: compact, a small rounding, the label at the size of the text around it.
const desktopOverrides = (colors: Colors) => ({
  base: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, borderRadius: 6 },
  primary: { height: 34, paddingHorizontal: 16, backgroundColor: colors.accent },
  secondary: { height: 34, paddingHorizontal: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  soft: { height: 34, paddingHorizontal: 14, backgroundColor: colors.accentSoft },
  glass: { height: 36, paddingHorizontal: 20, borderRadius: 6 },
  label: { fontSize: 14, fontWeight: '500' as const },
  softLabel: { color: colors.accent, fontSize: 14 },
  glassLabel: { color: ON_ACCENT, fontSize: 14 },
})

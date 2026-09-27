import Ionicons from '@expo/vector-icons/Ionicons'
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'

import { liquidGlass } from '@/lib/nativeUI'
import { useColors, useStyles, type Colors } from '@/theme'

import { GlassSurface } from './Glass'

type Variant = 'primary' | 'secondary' | 'soft' | 'glass'

type Props = {
  label: string
  icon?: React.ComponentProps<typeof Ionicons>['name']
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
  const tint = variant === 'primary' || variant === 'glass' ? '#FFFFFF' : variant === 'soft' ? colors.accent : colors.text
  const content = loading ? (
    <ActivityIndicator color={tint} />
  ) : (
    <>
      {icon ? <Ionicons name={icon} size={variant === 'soft' ? 17 : 18} color={tint} /> : null}
      <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
    </>
  )

  if (variant === 'glass') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => [!liquidGlass && pressed && { transform: [{ scale: 0.98 }] }, disabled && { opacity: 0.4 }]}
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
    primaryLabel: { color: '#FFFFFF' },
    secondaryLabel: { color: colors.text, fontWeight: '500' },
    softLabel: { color: colors.accent, fontSize: 15 },
    glassLabel: { color: '#FFFFFF', fontSize: 17 },
  })

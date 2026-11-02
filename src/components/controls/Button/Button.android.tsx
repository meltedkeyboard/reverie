import { Icon } from '@/components/visuals/Icon'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { type Colors, CONTROL_FONT_SCALE, ON_ACCENT, useColors, useStyles } from '@/theme'
import type { ButtonProps } from './types'

export function Button({ label, icon, onPress, disabled, loading, variant = 'primary', style }: ButtonProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const tint = variant === 'primary' || variant === 'glass' || variant === 'solid' ? ON_ACCENT : variant === 'soft' ? colors.accent : colors.text
  const rippleColor = variant === 'primary' || variant === 'glass' || variant === 'solid'
    ? 'rgba(255, 255, 255, 0.2)'
    : variant === 'soft'
    ? `${colors.accent}26`
    : `${colors.text}1F`

  const content = loading ? (
    <ActivityIndicator color={tint} />
  ) : (
    <>
      {icon ? <Icon name={icon} size={variant === 'soft' ? 18 : 20} color={tint} /> : null}
      <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
    </>
  )

  return (
    <View style={[styles.container, styles[variant], disabled && styles.disabled, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        accessibilityRole="button"
        android_ripple={{ color: rippleColor, borderless: false }}
        style={styles.pressable}
      >
        {content}
      </Pressable>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    container: {
      borderRadius: 20,
      overflow: 'hidden',
    },
    pressable: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: '100%',
      paddingHorizontal: 24,
    },
    primary: {
      height: 48,
      backgroundColor: colors.accent,
      elevation: 0,
    },
    secondary: {
      height: 48,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 0,
    },
    soft: {
      height: 44,
      backgroundColor: colors.accentSoft,
      elevation: 0,
    },
    glass: {
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.accent,
      elevation: 2,
    },
    solid: {
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.accent,
      elevation: 1,
    },
    label: {
      fontSize: 15,
      fontWeight: '500',
      letterSpacing: 0.1,
    },
    primaryLabel: { color: ON_ACCENT },
    secondaryLabel: { color: colors.text },
    softLabel: { color: colors.accent },
    glassLabel: { color: ON_ACCENT, fontSize: 16, fontWeight: '600' },
    solidLabel: { color: ON_ACCENT, fontSize: 16, fontWeight: '600' },
    disabled: {
      opacity: 0.38,
      elevation: 0,
    },
  })

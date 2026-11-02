import { Icon } from '@/components/visuals/Icon'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

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
  const rippleColor = filled ? 'rgba(255, 255, 255, 0.24)' : `${tint}26`

  return (
    <View
      style={[
        styles.pill,
        !label && styles.circle,
        filled ? { backgroundColor: tint, elevation: 2 } : styles.outlined,
        inactive && !sliding && styles.disabled,
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        android_ripple={{ color: rippleColor, borderless: false }}
        style={styles.pressable}
      >
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
      </Pressable>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    pill: {
      minHeight: 40,
      borderRadius: 20,
      overflow: 'hidden',
    },
    circle: {
      width: 40,
      borderRadius: 20,
    },
    pressable: {
      flex: 1,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    outlined: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 0,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    label: {
      fontSize: 14,
      fontWeight: '500',
      letterSpacing: 0.1,
    },
    disabled: {
      opacity: 0.38,
      elevation: 0,
    },
  })

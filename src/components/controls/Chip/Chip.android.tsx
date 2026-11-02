import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import * as Haptics from '@/lib/ui/haptics'
import { type Colors, CONTROL_FONT_SCALE, ON_ACCENT, useColors, useStyles } from '@/theme'

import { SlidingIcon, useAtLeastOneLap } from '../PillButton'
import { SFIcon } from '../../visuals/SFIcon'
import type { ChipProps } from './types'

export function Chip({ label, active, onPress, style, icon, ink, labeled, loading, slide, disabled }: ChipProps) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const sliding = useAtLeastOneLap(!!loading && !!slide)
  const busy = !!loading || sliding
  const color = active ? ON_ACCENT : disabled && !busy ? colors.textFaint : (ink ?? colors.textMuted)
  const rippleColor = active ? 'rgba(255, 255, 255, 0.2)' : `${colors.text}1A`

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
    <View style={[styles.chip, active ? styles.active : styles.inactive, disabled && styles.disabled, style]}>
      <Pressable
        disabled={disabled || busy}
        onPress={() => {
          if (!active) Haptics.selectionAsync()
          onPress()
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        android_ripple={{ color: rippleColor, borderless: false }}
        style={styles.pressable}
      >
        {body}
      </Pressable>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    chip: {
      minHeight: 34,
      borderRadius: 10,
      overflow: 'hidden',
    },
    pressable: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    active: {
      backgroundColor: colors.accent,
      borderWidth: 1,
      borderColor: colors.accent,
      elevation: 1,
    },
    inactive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: 0,
    },
    label: {
      fontSize: 14,
      fontWeight: '500',
      letterSpacing: 0.1,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    disabled: {
      opacity: 0.38,
      elevation: 0,
    },
  })

import type { ComponentProps } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import * as Haptics from '@/lib/ui/haptics'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { isDesktop } from '@/lib/core/platform'
import { type Colors, CONTROL_FONT_SCALE, ON_ACCENT, useColors, useStyles } from '@/theme'

import { GlassSurface } from '../chrome/Glass'
import { SlidingIcon, useAtLeastOneLap } from './PillButton'
import { SFIcon } from '../visuals/SFIcon'

type Props = {
  label: string
  active: boolean
  onPress: () => void
  style?: StyleProp<ViewStyle>
  // Shows the symbol instead of the label, which is then only read out.
  icon?: { symbol: ComponentProps<typeof SFIcon>['name']; fallback: ComponentProps<typeof SFIcon>['fallback'] }
  // The ink while not chosen, as colors.danger for removing.
  ink?: string
  // Interactive glass springs under the finger. Off by default: in a row that scrolls
  // sideways the spring pulls the chip along with the scroll.
  interactive?: boolean
  // The label beside the symbol rather than only read out.
  labeled?: boolean
  // Busy: the symbol runs away `slide` and back, at least one lap, or a spinner takes its
  // place. Neither busy nor disabled fades the chip (glass under opacity is not drawn), its
  // ink goes faint instead.
  loading?: boolean
  slide?: 'up' | 'down'
  disabled?: boolean
}

// A small Liquid Glass capsule to pick from a row of them; the chosen one is tinted
// with the accent. Outside iOS 26 it is the plain surface, filled when chosen.
export function Chip({ label, active, onPress, style, icon, ink, interactive = false, labeled, loading, slide, disabled }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const sliding = useAtLeastOneLap(!!loading && !!slide)
  const busy = !!loading || sliding
  const color = active ? ON_ACCENT : disabled && !busy ? colors.textFaint : (ink ?? colors.textMuted)
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
      // The glass is not interactive (its press spring pulls the chip along with a sideways scroll), so on glass nothing moves.
      style={({ pressed }) => [style, !liquidGlass && !isDesktop && pressed && { transform: [{ scale: 0.96 }] }, isDesktop && pressed && { opacity: 0.8 }]}
    >
      <GlassSurface
        interactive={interactive}
        tintColor={active ? colors.accent : undefined}
        style={styles.chip}
        fallbackStyle={active ? styles.solidActive : styles.solid}
      >
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
      </GlassSurface>
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
    // Segmented choices on the desktop: small flat tabs, the chosen one filled.
    ...(isDesktop
      ? {
          chip: { minHeight: 28, paddingHorizontal: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
          solid: { backgroundColor: colors.surfaceRaised, borderWidth: 0 },
          solidActive: { backgroundColor: colors.accent, borderWidth: 0 },
          label: { fontSize: 13, fontWeight: '500' },
        }
      : {}),
  })

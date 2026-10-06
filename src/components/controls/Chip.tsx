import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'

import * as Haptics from '@/lib/ui/haptics'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { isDesktop } from '@/lib/core/platform'
import { type Colors, CONTROL_FONT_SCALE, ON_ACCENT, useColors, useStyles } from '@/theme'

import { GlassSurface } from '../chrome/Glass'

type Props = {
  label: string
  active: boolean
  onPress: () => void
  style?: StyleProp<ViewStyle>
}

// A small Liquid Glass capsule to pick from a row of them; the chosen one is tinted
// with the accent. Outside iOS 26 it is the plain surface, filled when chosen.
export function Chip({ label, active, onPress, style }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <Pressable
      onPress={() => {
        if (!active) Haptics.selectionAsync()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      // The glass is not interactive (its press spring pulls the chip along with a sideways scroll), so on glass nothing moves.
      style={({ pressed }) => [style, !liquidGlass && !isDesktop && pressed && { transform: [{ scale: 0.96 }] }, isDesktop && pressed && { opacity: 0.8 }]}
    >
      <GlassSurface
        tintColor={active ? colors.accent : undefined}
        style={styles.chip}
        fallbackStyle={active ? styles.solidActive : styles.solid}
      >
        <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[styles.label, { color: active ? ON_ACCENT : colors.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
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

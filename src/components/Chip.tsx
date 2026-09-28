import { Pressable, StyleSheet, Text } from 'react-native'

import * as Haptics from '@/lib/haptics'
import { liquidGlass } from '@/lib/nativeUI'
import { CONTROL_FONT_SCALE, useColors, useStyles, type Colors } from '@/theme'

import { GlassSurface } from './Glass'

type Props = {
  label: string
  active: boolean
  onPress: () => void
}

// A small Liquid Glass capsule to pick from a row of them; the chosen one is tinted
// with the accent. Outside iOS 26 it is the plain surface, filled when chosen.
export function Chip({ label, active, onPress }: Props) {
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
      // Interactive glass springs under the finger by itself; a scale on top would fight it.
      style={({ pressed }) => !liquidGlass && pressed && { transform: [{ scale: 0.96 }] }}
    >
      <GlassSurface
        interactive
        tintColor={active ? colors.accent : undefined}
        style={styles.chip}
        fallbackStyle={active ? styles.solidActive : styles.solid}
      >
        <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[styles.label, { color: active ? '#FFFFFF' : colors.textMuted }]} numberOfLines={1}>
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
  })

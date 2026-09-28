import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'

import { liquidGlass } from '@/lib/nativeUI'
import { CONTROL_FONT_SCALE, useColors, useStyles, type Colors } from '@/theme'

import { GlassSurface } from './Glass'

type Props = {
  label: string
  onPress?: () => void
  // The label's color, which says what the action is: the accent, or danger for deleting.
  color?: string
  // Tints the glass with the color and turns the label white, for actions that should
  // stand out on the page: backups, deleting.
  filled?: boolean
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
}

// A capsule of Liquid Glass for the secondary actions of a screen, with the label in the
// action's color. Outside iOS 26 it is the plain surface with a hairline, or a solid fill.
export function PillButton({ label, onPress, color, filled = false, disabled, loading, style }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const tint = color ?? colors.accent
  const ink = filled ? ON_FILL : tint
  const inactive = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      // Interactive glass springs under the finger by itself; a scale on top would fight it.
      style={({ pressed }) => [style, inactive && { opacity: 0.5 }, !liquidGlass && pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <GlassSurface
        interactive={!inactive}
        tintColor={filled ? tint : undefined}
        style={styles.pill}
        fallbackStyle={filled ? { backgroundColor: tint } : styles.solid}
      >
        {loading ? (
          <ActivityIndicator color={ink} />
        ) : (
          <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[styles.label, { color: ink }]} numberOfLines={1}>
            {label}
          </Text>
        )}
      </GlassSurface>
    </Pressable>
  )
}

const ON_FILL = '#FFFFFF'

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    pill: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    solid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    label: { fontSize: 16, fontWeight: '600' },
  })

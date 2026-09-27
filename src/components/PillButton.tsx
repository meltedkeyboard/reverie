import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'

import { liquidGlass } from '@/lib/nativeUI'
import { useColors, useStyles, type Colors } from '@/theme'

import { GlassSurface } from './Glass'

type Props = {
  label: string
  onPress?: () => void
  // The label's color, which says what the action is: the accent, or danger for deleting.
  color?: string
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
}

// A capsule of Liquid Glass for the secondary actions of a screen, with the label in the
// action's color. Outside iOS 26 it is the plain surface with a hairline.
export function PillButton({ label, onPress, color, disabled, loading, style }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const tint = color ?? colors.accent
  const inactive = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      // Interactive glass springs under the finger by itself; a scale on top would fight it.
      style={({ pressed }) => [style, inactive && { opacity: 0.5 }, !liquidGlass && pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <GlassSurface interactive={!inactive} style={styles.pill} fallbackStyle={styles.solid}>
        {loading ? (
          <ActivityIndicator color={tint} />
        ) : (
          <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
            {label}
          </Text>
        )}
      </GlassSurface>
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    pill: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    solid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    label: { fontSize: 16, fontWeight: '600' },
  })

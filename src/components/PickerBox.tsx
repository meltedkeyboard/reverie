import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'

import { useColors, useStyles, type Colors } from '@/theme'

import { GlassSurface } from './Glass'

type Props = {
  value: string
  placeholder: string
  onPress: () => void
  accessibilityLabel?: string
  // The look without Liquid Glass, to match the fields around it.
  fallbackStyle?: StyleProp<ViewStyle>
}

// A field that is chosen rather than typed: the capsule of a one-line input showing the
// choice, with the up-down chevron of a menu, opening a sheet to pick from.
export function PickerBox({ value, placeholder, onPress, accessibilityLabel, fallbackStyle }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityValue={{ text: value }}>
      <GlassSurface interactive variant="clear" style={styles.box} fallbackStyle={fallbackStyle}>
        <Text style={[styles.text, !value && styles.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-expand" size={18} color={colors.textFaint} />
      </GlassSurface>
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    box: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 18,
      paddingRight: 14,
      borderRadius: 23,
      borderCurve: 'continuous',
    },
    text: { flex: 1, color: colors.text, fontSize: 16 },
    placeholder: { color: colors.textFaint },
  })

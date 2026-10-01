import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import { useColors, useStyles, type Colors } from '@/theme'

type Props = {
  value: string
  placeholder: string
  onPress: () => void
  accessibilityLabel?: string
  // Extra style for the box, to match the fields around it.
  fallbackStyle?: StyleProp<ViewStyle>
}

// A field that is chosen rather than typed: the box of a one-line input showing the
// choice, with the up-down chevron of a menu, opening a sheet to pick from.
export function PickerBox({ value, placeholder, onPress, accessibilityLabel, fallbackStyle }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityValue={{ text: value }}>
      <View style={[styles.box, fallbackStyle]}>
        <Text style={[styles.text, !value && styles.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-expand" size={18} color={colors.textFaint} />
      </View>
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 13,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      borderCurve: 'continuous',
    },
    text: { flex: 1, color: colors.text, fontSize: 16 },
    placeholder: { color: colors.textFaint },
  })

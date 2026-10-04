import Ionicons from '@expo/vector-icons/Ionicons'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { type Colors, textStyles, useColors, useStyles } from '@/theme'

type Props = {
  title: string
  // A line under the title: the current value of what the row opens.
  subtitle?: string
  onPress: () => void
}

// A row in Settings that opens a screen of its own. Flat like the other parameters (the
// title as a ToggleRow's label, the value as its note), with a chevron where they have a star.
export function LinkTile({ title, subtitle, onPress }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    pressed: { opacity: 0.6 },
    body: { flex: 1 },
    title: { color: colors.text, fontSize: 16, fontWeight: '600' },
    subtitle: { ...textStyles(colors).note, marginTop: 4 },
  })

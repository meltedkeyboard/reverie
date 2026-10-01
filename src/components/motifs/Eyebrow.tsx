import { StyleSheet, Text, View } from 'react-native'

import { fonts, useStyles, type Colors } from '@/theme'

// A section header: the label as the first versions of the app had it (Georgia 19 pt,
// regular weight, as typed), in the section's semantic color (text for normal sections,
// danger for the danger zone).
export function Eyebrow({ label, color }: { label: string; color: string }) {
  const styles = useStyles(createStyles)
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  )
}

const createStyles = (_colors: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    label: { fontFamily: fonts.prose, fontSize: 19 },
  })

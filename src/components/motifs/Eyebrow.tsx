import { StyleSheet, Text, View } from 'react-native'

import { fonts, useStyles, type Colors } from '@/theme'

import { Star } from './Star'

// A small section header: a tilted star bullet next to a caps label, in the section's
// semantic color (accent for normal sections, danger for the danger zone).
export function Eyebrow({ label, color, star = true }: { label: string; color: string; star?: boolean }) {
  const styles = useStyles(createStyles)
  return (
    <View style={styles.row}>
      {star ? <Star size={13} color={color} rotation={-16} style={styles.star} /> : null}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  )
}

const createStyles = (_colors: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    star: { marginTop: 1 },
    label: { fontFamily: fonts.prose, fontWeight: '700', fontSize: 13, letterSpacing: 1.1, textTransform: 'uppercase' },
  })

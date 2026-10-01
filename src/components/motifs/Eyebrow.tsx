import { StyleSheet, Text, View } from 'react-native'

import { fonts, useStyles, type Colors } from '@/theme'

import { Star } from './Star'

// A small section header: a tilted star bullet next to a caps label, in the section's
// semantic color (accent for normal sections, danger for the danger zone). `plain` sets
// the label as the first versions of the app had it: 19 pt, regular weight, as typed.
export function Eyebrow({
  label,
  color,
  star = true,
  plain = false,
}: {
  label: string
  color: string
  star?: boolean
  plain?: boolean
}) {
  const styles = useStyles(createStyles)
  return (
    <View style={[styles.row, plain && styles.plainRow]}>
      {star ? <Star size={13} color={color} rotation={-16} style={styles.star} /> : null}
      <Text style={[styles.label, plain && styles.plain, { color }]}>{label}</Text>
    </View>
  )
}

const createStyles = (_colors: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    star: { marginTop: 1 },
    label: { fontFamily: fonts.prose, fontWeight: '700', fontSize: 13, letterSpacing: 1.1, textTransform: 'uppercase' },
    plainRow: { marginBottom: 14 },
    plain: { fontSize: 19, fontWeight: 'normal', letterSpacing: 0, textTransform: 'none' },
  })

import { Pressable, StyleSheet, Text, View } from 'react-native'

import * as Haptics from '@/lib/haptics'
import { useStyles, type Colors } from '@/theme'

import { StarToggle } from './motifs/StarToggle'

interface ToggleRowProps {
  label: string
  note?: string
  value: boolean
  onValueChange: (v: boolean) => void
}

// A labelled toggle where the whole row is tappable, not just the star.
export function ToggleRow({ label, note, value, onValueChange }: ToggleRowProps) {
  const styles = useStyles(createStyles)
  return (
    <Pressable
      style={styles.row}
      onPress={() => {
        Haptics.selectionAsync()
        onValueChange(!value)
      }}
    >
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <StarToggle value={value} onValueChange={onValueChange} />
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    body: { flex: 1 },
    label: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
    note: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  })

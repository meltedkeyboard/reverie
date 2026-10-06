import { Pressable, StyleSheet, Text, View } from 'react-native'

import * as Haptics from '@/lib/ui/haptics'
import { type Colors, textStyles, useStyles } from '@/theme'

import { StarToggle } from '../visuals/motifs/StarToggle'

interface ToggleRowProps {
  label: string
  note?: string
  value: boolean
  onValueChange: (v: boolean) => void
  // Dimmed and ignoring taps, e.g. while the change it made is still being applied.
  disabled?: boolean
}

// A labelled toggle where the whole row is tappable, not just the star.
export function ToggleRow({ label, note, value, onValueChange, disabled = false }: ToggleRowProps) {
  const styles = useStyles(createStyles)
  return (
    <Pressable
      disabled={disabled}
      style={[styles.row, disabled && styles.disabled]}
      onPress={() => {
        Haptics.selectionAsync()
        onValueChange(!value)
      }}
    >
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <View pointerEvents={disabled ? 'none' : 'auto'}>
        <StarToggle value={value} onValueChange={onValueChange} />
      </View>
    </Pressable>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    body: { flex: 1 },
    disabled: { opacity: 0.5 },
    label: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
    note: { ...textStyles(colors).note, marginBottom: 12 },
  })

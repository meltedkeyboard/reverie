import { Pressable, StyleSheet, Text } from 'react-native'

import * as Haptics from '@/lib/haptics'
import { useColors, useStyles, type Colors } from '@/theme'

import { Shard } from './Shard'

type Props = {
  label: string
  active: boolean
  onPress: () => void
}

// A single selectable shard, filled with the accent when active. Chips sit in a row
// with independent, slightly uneven tilts rather than a sliding-thumb segmented
// control — closer to hand-placed cutouts than a mechanical control.
export function ShardChip({ label, active, onPress }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <Pressable
      onPress={() => {
        if (!active) Haptics.selectionAsync()
        onPress()
      }}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      <Shard
        filled={active}
        color={active ? colors.accent : colors.borderStrong}
        strokeWidth={2}
        contentStyle={styles.content}
      >
        <Text style={[styles.label, { color: active ? '#FFFFFF' : colors.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
      </Shard>
    </Pressable>
  )
}

const createStyles = (_colors: Colors) =>
  StyleSheet.create({
    content: { minHeight: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 14, fontWeight: '700' },
  })

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { ShardChip } from './motifs/ShardChip'

type Props<T extends string> = {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  style?: StyleProp<ViewStyle>
}

// A wrapping row of chips where exactly one is active.
export function ChipGroup<T extends string>({ options, value, onChange, style }: Props<T>) {
  return (
    <View style={[styles.row, style]}>
      {options.map((opt) => (
        <ShardChip key={opt.value} label={opt.label} active={value === opt.value} onPress={() => onChange(opt.value)} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
})

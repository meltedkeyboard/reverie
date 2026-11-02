import { Pressable, StyleSheet, Text, View } from 'react-native'

import * as Haptics from '@/lib/ui/haptics'
import { type Colors, useStyles } from '@/theme'
import type { SegmentedProps } from './types'

const HEIGHT = 32

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const styles = useStyles(createStyles)

  return (
    <View style={styles.track} accessibilityRole="radiogroup">
      {options.map((option) => {
        const chosen = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen }}
            onPress={() => {
              if (chosen) return
              Haptics.selectionAsync()
              onChange(option.value)
            }}
            style={[styles.segment, chosen && styles.chosen]}
          >
            <Text style={[styles.label, chosen && styles.chosenLabel]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    track: { flexDirection: 'row', height: HEIGHT, padding: 2, borderRadius: 9, backgroundColor: colors.surfaceRaised },
    segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
    chosen: { backgroundColor: colors.bg },
    label: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
    chosenLabel: { color: colors.text, fontWeight: '600' },
  })

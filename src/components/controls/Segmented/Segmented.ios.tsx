import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import * as Haptics from '@/lib/ui/haptics'
import { swiftUI } from '@/lib/ui/nativeUI'
import { type Colors, useStyles, useTheme } from '@/theme'
import type { SegmentedProps } from './types'

const HEIGHT = 32

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const styles = useStyles(createStyles)
  const { scheme } = useTheme()
  const picked = useRef(value)
  const [width, setWidth] = useState(0)
  const [generation, setGeneration] = useState(0)
  if (picked.current !== value) {
    picked.current = value
    setGeneration((g) => g + 1)
  }

  if (swiftUI) {
    const { Host, Picker, Text: SwiftText } = swiftUI.ui
    const { pickerStyle, tag } = swiftUI.modifiers
    return (
      <View style={styles.host} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {width > 0 ? (
          <Host key={`${width}:${generation}`} style={styles.host} alignment="center" ignoreSafeArea="all" colorScheme={scheme}>
            <Picker
              selection={value}
              onSelectionChange={(next: T) => {
                Haptics.selectionAsync()
                picked.current = next
                onChange(next)
              }}
              modifiers={[pickerStyle('segmented')]}
            >
              {options.map((option) => (
                <SwiftText key={option.value} modifiers={[tag(option.value)]}>
                  {option.label}
                </SwiftText>
              ))}
            </Picker>
          </Host>
        ) : null}
      </View>
    )
  }

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
    host: { height: HEIGHT },
    track: { flexDirection: 'row', height: HEIGHT, padding: 2, borderRadius: 9, backgroundColor: colors.surfaceRaised },
    segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
    chosen: { backgroundColor: colors.bg },
    label: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
    chosenLabel: { color: colors.text, fontWeight: '600' },
  })

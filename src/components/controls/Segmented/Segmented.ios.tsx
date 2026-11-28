import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import * as Haptics from '@/lib/ui/haptics'
import { swiftUI } from '@/lib/ui/nativeUI'
import { type Colors, useStyles, useTheme } from '@/theme'
import type { SegmentedProps } from './types'

const HEIGHT = 32

export function Segmented<T extends string>({ options, value, onChange, disabled }: SegmentedProps<T>) {
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
    const { pickerStyle, tag, disabled: swiftDisabled } = swiftUI.modifiers
    return (
      <View
        style={[styles.host, disabled && styles.disabled]}
        pointerEvents={disabled ? 'none' : 'auto'}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      >
        {width > 0 ? (
          <Host key={`${width}:${generation}`} style={styles.host} alignment="center" ignoreSafeArea="all" colorScheme={scheme}>
            <Picker
              selection={value}
              onSelectionChange={(next: T) => {
                if (disabled) return
                Haptics.selectionAsync()
                picked.current = next
                onChange(next)
              }}
              modifiers={[pickerStyle('segmented'), ...(disabled ? [swiftDisabled(true)] : [])]}
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
    <View
      style={[styles.track, disabled && styles.disabled]}
      accessibilityRole="radiogroup"
      pointerEvents={disabled ? 'none' : 'auto'}
    >
      {options.map((option) => {
        const chosen = option.value === value
        return (
          <Pressable
            key={option.value}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen, disabled: Boolean(disabled) }}
            onPress={() => {
              if (disabled || chosen) return
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
    disabled: { opacity: 0.4 },
    track: { flexDirection: 'row', height: HEIGHT, padding: 2, borderRadius: 9, backgroundColor: colors.surfaceRaised },
    segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
    chosen: { backgroundColor: colors.bg },
    label: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
    chosenLabel: { color: colors.text, fontWeight: '600' },
  })

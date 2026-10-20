import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import * as Haptics from '@/lib/ui/haptics'
import { swiftUI } from '@/lib/ui/nativeUI'
import { type Colors, useStyles, useTheme } from '@/theme'

type Props<T extends string> = {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

const HEIGHT = 32

// A segmented control: the system one (a SwiftUI Picker) on iOS, a track with the chosen
// segment raised on it elsewhere.
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  const styles = useStyles(createStyles)
  const { scheme } = useTheme()
  // The SwiftUI picker misplaces its selection when the value is set from outside right
  // after it mounts (an editor filling its fields from the database) or when its frame
  // changes under it, and only puts it right on the next tap. Such changes build it anew;
  // a tap on it does not, so the selection still slides. The host ignores the safe area:
  // one mounted over the home indicator, as at the foot of a sheet sliding up, took its
  // inset and drew the picker half of it higher, over the label, until the next tap.
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
          <Host key={`${width}:${generation}`} style={styles.host} ignoreSafeArea="all" colorScheme={scheme}>
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
